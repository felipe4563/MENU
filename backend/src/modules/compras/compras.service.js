const { Op } = require('sequelize');
const { Proveedor, Compra, DetalleCompra, Producto, Insumo, LibroCaja, Gasto, SesionCaja, sequelize } = require('../../models');
const { ajustarStockSucursal } = require('../inventario/stock.service');
const { ajustarStockInsumoSucursal } = require('../insumos/insumos.service');
const { emitir } = require('../../socket');

const INCLUDE_COMPRA = [
  { model: Proveedor, as: 'proveedor', attributes: ['id', 'nombre'] },
  {
    model: DetalleCompra, as: 'detalles',
    include: [
      { model: Producto, as: 'producto', attributes: ['id', 'nombre', 'stock'] },
      { model: Insumo, as: 'insumo', attributes: ['id', 'nombre', 'unidad_medida'] },
    ],
  },
];

// --- Proveedores ---

async function listarProveedores() {
  return Proveedor.findAll({ where: { activo: 1 }, order: [['nombre', 'ASC']] });
}

async function crearProveedor({ nombre, contacto, telefono, email, direccion }) {
  return Proveedor.create({ nombre, contacto, telefono, email, direccion });
}

async function actualizarProveedor(id, datos) {
  const p = await Proveedor.findByPk(id);
  if (!p) throw Object.assign(new Error('Proveedor no encontrado'), { status: 404 });
  await p.update(datos);
  return p;
}

async function desactivarProveedor(id) {
  const p = await Proveedor.findByPk(id);
  if (!p) throw Object.assign(new Error('Proveedor no encontrado'), { status: 404 });
  await p.update({ activo: 0 });
}

// --- Compras ---

async function listarCompras(alcance = {}) {
  const where = alcance.acceso_todas ? {} : { sucursal_id: alcance.sucursal_id };
  return Compra.findAll({ where, include: INCLUDE_COMPRA, order: [['creado_en', 'DESC']] });
}

async function obtenerCompra(id, alcance) {
  const c = await Compra.findByPk(id, { include: INCLUDE_COMPRA });
  if (!c) throw Object.assign(new Error('Compra no encontrada'), { status: 404 });
  if (alcance && !alcance.acceso_todas && c.sucursal_id !== alcance.sucursal_id) {
    throw Object.assign(new Error('Compra no encontrada'), { status: 404 });
  }
  return c;
}

// Sesión de caja de la que sale la plata: abierta, de la misma sucursal que
// la compra y abierta por quien paga (igual que "Sacar dinero de la caja").
async function _sesionParaPagar(sesion_caja_id, usuario_id, sucursal_id, t) {
  const sesion = await SesionCaja.findByPk(sesion_caja_id, { transaction: t, lock: t.LOCK.UPDATE });
  if (!sesion || sesion.sucursal_id !== sucursal_id) throw Object.assign(new Error('Caja no encontrada'), { status: 404 });
  if (sesion.estado !== 'abierta') throw Object.assign(new Error('Esa caja ya está cerrada'), { status: 409 });
  if (sesion.usuario_id !== usuario_id) throw Object.assign(new Error('Solo el cajero que abrió la caja puede sacar plata de ella'), { status: 403 });
  return sesion;
}

// Suma el stock, marca la compra como recibida y anota el pago: un solo
// egreso en el libro de caja. Si se pagó con la caja abierta, además queda
// como gasto del turno (resta del efectivo esperado al cerrar).
async function _recibir(compra, usuario_id, sesion, t) {
  for (const detalle of compra.detalles) {
    const datos = {
      sucursal_id: compra.sucursal_id, tipo: 'compra', cantidad: detalle.cantidad,
      usuario_id, nota: `Compra #${compra.id}`, transaction: t,
    };
    if (detalle.insumo_id) await ajustarStockInsumoSucursal({ insumo_id: detalle.insumo_id, ...datos });
    else await ajustarStockSucursal({ producto_id: detalle.producto_id, ...datos });
  }
  await compra.update({ estado: 'recibido', sesion_caja_id: sesion ? sesion.id : null }, { transaction: t });

  const monto = parseFloat(compra.total);
  const concepto = `Compra #${compra.id} - ${compra.proveedor?.nombre || compra.notas || 'compra al paso'}`.slice(0, 255);
  let gasto = null;
  if (sesion) {
    if (!(monto > 0)) throw Object.assign(new Error('La compra no tiene monto para pagar con la caja'), { status: 400 });
    gasto = await Gasto.create({ sesion_caja_id: sesion.id, usuario_id, descripcion: concepto, monto, compra_id: compra.id }, { transaction: t });
    await SesionCaja.increment('total_gastos', { by: monto, where: { id: sesion.id }, transaction: t });
  }
  // compra_id marca el egreso como compra: Finanzas lo cuenta en "compras" y
  // no otra vez en "gastos operativos".
  await LibroCaja.create({
    sesion_caja_id: sesion ? sesion.id : null,
    usuario_id,
    tipo: 'egreso',
    concepto,
    monto,
    metodo_pago: 'efectivo',
    referencia_id: gasto ? gasto.id : null,
    compra_id: compra.id,
  }, { transaction: t });
}

// Con `sesion_caja_id` la compra se paga en el momento con la plata de esa
// caja y queda recibida (compra al paso: mandan a alguien al mercado).
async function crearCompra(usuario_id, sucursal_id, { proveedor_id, notas, items = [], sesion_caja_id }) {
  if (proveedor_id) {
    const proveedor = await Proveedor.findByPk(proveedor_id);
    if (!proveedor) throw Object.assign(new Error('Proveedor no encontrado'), { status: 404 });
  } else if (!sesion_caja_id) {
    throw Object.assign(new Error('Elige el proveedor'), { status: 400 });
  }
  if (!items.length) throw Object.assign(new Error('Agrega al menos una línea'), { status: 400 });

  // Cada línea es de producto O de insumo, nunca ambos ni ninguno.
  for (const i of items) {
    if (!!i.producto_id === !!i.insumo_id) {
      throw Object.assign(new Error('Cada ítem debe tener producto_id o insumo_id (uno solo)'), { status: 400 });
    }
    if (!(parseFloat(i.cantidad) > 0) || !(parseFloat(i.costo_unitario) >= 0)) {
      throw Object.assign(new Error('Revisa la cantidad y el costo de cada línea'), { status: 400 });
    }
  }

  const total = items.reduce((sum, i) => sum + (parseFloat(i.costo_unitario) * parseFloat(i.cantidad)), 0);

  const id = await sequelize.transaction(async (t) => {
    const sesion = sesion_caja_id ? await _sesionParaPagar(sesion_caja_id, usuario_id, sucursal_id, t) : null;
    const compra = await Compra.create({ proveedor_id: proveedor_id || null, usuario_id, sucursal_id, total, notas }, { transaction: t });
    await DetalleCompra.bulkCreate(
      items.map(i => ({
        compra_id: compra.id,
        producto_id: i.producto_id || null,
        insumo_id: i.insumo_id || null,
        cantidad: i.cantidad,
        costo_unitario: i.costo_unitario,
        subtotal: parseFloat(i.costo_unitario) * parseFloat(i.cantidad),
      })),
      { transaction: t },
    );
    if (sesion) {
      const completa = await Compra.findByPk(compra.id, { include: INCLUDE_COMPRA, transaction: t });
      await _recibir(completa, usuario_id, sesion, t);
    }
    return compra.id;
  });

  if (sesion_caja_id) emitir('restaurante:actualizar', { tipo: 'gasto_nuevo' }, sucursal_id);
  return obtenerCompra(id);
}

async function actualizarCompra(id, { notas }, alcance) {
  const c = await obtenerCompra(id, alcance);
  if (c.estado !== 'pendiente') throw Object.assign(new Error('Solo se pueden editar compras pendientes'), { status: 409 });
  await c.update({ notas });
  return obtenerCompra(id, alcance);
}

// `sesion_caja_id`: se pagó con la plata de esa caja abierta. Sin ella, se
// pagó por fuera de la caja (transferencia, plata del dueño).
async function recibirCompra(id, usuario_id, alcance, { sesion_caja_id } = {}) {
  await sequelize.transaction(async (t) => {
    // Se bloquea la fila: dos "Recibir" a la vez sumarían el stock dos veces.
    const bloqueo = await Compra.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
    if (!bloqueo || (alcance && !alcance.acceso_todas && bloqueo.sucursal_id !== alcance.sucursal_id)) {
      throw Object.assign(new Error('Compra no encontrada'), { status: 404 });
    }
    if (bloqueo.estado !== 'pendiente') throw Object.assign(new Error('La compra ya fue recibida'), { status: 409 });
    const compra = await Compra.findByPk(id, { include: INCLUDE_COMPRA, transaction: t });
    const sesion = sesion_caja_id ? await _sesionParaPagar(sesion_caja_id, usuario_id, compra.sucursal_id, t) : null;
    await _recibir(compra, usuario_id, sesion, t);
  });

  const compra = await obtenerCompra(id, alcance);
  // Avisa a pantallas abiertas (ej. Dashboard) para que refresquen sin
  // esperar al polling — mismo patrón que ventas.service.js usa para ventas.
  emitir('restaurante:actualizar', { tipo: 'gasto_nuevo' }, compra.sucursal_id);
  return compra;
}

// Lo mínimo para armar una compra desde la caja, sin exigir los permisos de
// insumos, productos y proveedores.
async function catalogo() {
  const [proveedores, insumos, productos] = await Promise.all([
    Proveedor.findAll({ where: { activo: 1 }, attributes: ['id', 'nombre'], order: [['nombre', 'ASC']] }),
    Insumo.findAll({ where: { activo: 1 }, attributes: ['id', 'nombre', 'unidad_medida'], order: [['nombre', 'ASC']] }),
    Producto.findAll({ where: { activo: 1, stock: { [Op.ne]: null } }, attributes: ['id', 'nombre'], order: [['nombre', 'ASC']] }),
  ]);
  return { proveedores, insumos, productos };
}

// Compra sugerida: los insumos de la sucursal que llegaron a su stock
// mínimo, con cuánto comprar y a quién. Cuánto: lo que falta para llegar al
// doble del mínimo, o a lo que se gasta en una semana si eso es más
// (consumo por ventas de las últimas 2 semanas, dividido entre 2). A quién y
// a qué precio: el proveedor y el costo de la última compra recibida de ese
// insumo. Lo que nunca se compró a un proveedor va en "sin proveedor".
const DIAS_CONSUMO = 14;

function _redondearArriba(cantidad, unidad) {
  const paso = unidad === 'unidad' ? 1 : 0.1;
  return Math.round(Math.ceil((cantidad - 1e-9) / paso) * paso * 1000) / 1000;
}

async function compraSugerida(sucursal_id) {
  const { InsumoStockSucursal, InsumoMovimiento } = require('../../models');
  const insumos = await Insumo.findAll({ where: { activo: 1, stock_minimo: { [Op.ne]: null } }, raw: true });
  if (!insumos.length) return { grupos: [], total: 0 };
  const ids = insumos.map((i) => i.id);

  const desde = new Date(Date.now() - DIAS_CONSUMO * 86400000);
  const [stocks, consumos, ultimas] = await Promise.all([
    InsumoStockSucursal.findAll({ where: { sucursal_id, insumo_id: ids }, raw: true }),
    InsumoMovimiento.findAll({
      where: { sucursal_id, insumo_id: ids, tipo: 'consumo_venta', creado_en: { [Op.gte]: desde } },
      attributes: ['insumo_id', [sequelize.fn('SUM', sequelize.col('cantidad')), 'consumido']], group: ['insumo_id'], raw: true,
    }),
    DetalleCompra.findAll({
      where: { insumo_id: ids },
      include: [{ model: Compra, attributes: ['proveedor_id', 'creado_en'], where: { estado: 'recibido' }, required: true,
        include: [{ model: Proveedor, as: 'proveedor', attributes: ['id', 'nombre'] }] }],
      order: [[Compra, 'creado_en', 'DESC'], ['id', 'DESC']],
    }),
  ]);

  const stockDe = new Map(stocks.map((s) => [s.insumo_id, parseFloat(s.stock) || 0]));
  const consumoDe = new Map(consumos.map((c) => [c.insumo_id, parseFloat(c.consumido) || 0]));
  const ultimaDe = new Map();
  for (const d of ultimas) if (!ultimaDe.has(d.insumo_id)) ultimaDe.set(d.insumo_id, d);

  const grupos = new Map();
  for (const ins of insumos) {
    const stock = stockDe.get(ins.id) ?? 0;
    const minimo = parseFloat(ins.stock_minimo);
    if (stock > minimo) continue;
    const semana = (consumoDe.get(ins.id) || 0) / (DIAS_CONSUMO / 7);
    const objetivo = Math.max(2 * minimo, semana);
    const sugerido = _redondearArriba(Math.max(objetivo - stock, 0), ins.unidad_medida);
    if (sugerido <= 0) continue;
    const ultima = ultimaDe.get(ins.id);
    const prov = ultima?.Compra?.proveedor;
    const proveedor = prov ? { id: prov.id, nombre: prov.nombre } : null;
    const costo = ultima ? parseFloat(ultima.costo_unitario) : null;
    const clave = proveedor ? proveedor.id : 0;
    if (!grupos.has(clave)) grupos.set(clave, { proveedor, items: [], total: 0 });
    const g = grupos.get(clave);
    const subtotal = costo != null ? Math.round(costo * sugerido * 100) / 100 : null;
    g.items.push({
      insumo_id: ins.id, nombre: ins.nombre, unidad: ins.unidad_medida,
      stock: Math.round(stock * 1000) / 1000, minimo, consumo_semana: Math.round(semana * 1000) / 1000,
      cantidad: sugerido, costo_unitario: costo, subtotal,
    });
    g.total = Math.round((g.total + (subtotal || 0)) * 100) / 100;
  }

  const lista = Array.from(grupos.values())
    .map((g) => ({ ...g, items: g.items.sort((a, b) => a.nombre.localeCompare(b.nombre)) }))
    // Primero los proveedores por nombre; "sin proveedor" al final.
    .sort((a, b) => (!a.proveedor) - (!b.proveedor) || (a.proveedor?.nombre ?? '').localeCompare(b.proveedor?.nombre ?? ''));
  return { grupos: lista, total: Math.round(lista.reduce((a, g) => a + g.total, 0) * 100) / 100 };
}

module.exports = { listarProveedores, crearProveedor, actualizarProveedor, desactivarProveedor, listarCompras, obtenerCompra, crearCompra, actualizarCompra, recibirCompra, catalogo, compraSugerida };
