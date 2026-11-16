const { Insumo, InsumoStockSucursal, InsumoMovimiento, RecetaInsumo, Sucursal, DetalleCompra, Compra, sequelize } = require('../../models');
const { Op } = require('sequelize');

// --- Insumos (CRUD) ---

async function listarInsumos(alcance = {}) {
  const insumos = await Insumo.findAll({ where: { activo: 1 }, order: [['nombre', 'ASC']] });
  const filas = await InsumoStockSucursal.findAll({
    where: { insumo_id: insumos.map(i => i.id) },
    include: [{ model: Sucursal, as: 'sucursal', attributes: ['id', 'nombre'] }],
  });

  return insumos.map((insumo) => {
    const plano = insumo.toJSON();
    const filasInsumo = filas.filter(f => f.insumo_id === plano.id);

    if (alcance.acceso_todas) {
      plano.stock_por_sucursal = filasInsumo.map(f => ({
        sucursal_id: f.sucursal_id, nombre: f.sucursal?.nombre, stock: f.stock,
      }));
      plano.stock = filasInsumo.reduce((sum, f) => sum + parseFloat(f.stock), 0);
      return plano;
    }

    const propia = filasInsumo.find(f => f.sucursal_id === alcance.sucursal_id);
    plano.stock = propia ? propia.stock : 0;
    plano.sucursal_id = alcance.sucursal_id ?? null;
    return plano;
  });
}

async function obtenerInsumo(id) {
  const insumo = await Insumo.findByPk(id);
  if (!insumo) throw Object.assign(new Error('Insumo no encontrado'), { status: 404 });
  return insumo;
}

// Vacío o null = sin mínimo. Si viene, número >= 0.
function _stockMinimo(valor) {
  if (valor === undefined) return undefined;
  if (valor === null || valor === '') return null;
  const n = Number(valor);
  if (!Number.isFinite(n) || n < 0) throw Object.assign(new Error('El stock mínimo debe ser un número mayor o igual a 0'), { status: 400 });
  return Math.round(n * 1000) / 1000;
}

async function crearInsumo({ nombre, unidad_medida, stock_minimo }) {
  if (!nombre) throw Object.assign(new Error('nombre es requerido'), { status: 400 });
  if (!unidad_medida) throw Object.assign(new Error('unidad_medida es requerida'), { status: 400 });
  return Insumo.create({ nombre, unidad_medida, stock_minimo: _stockMinimo(stock_minimo) ?? null });
}

async function actualizarInsumo(id, { nombre, unidad_medida, stock_minimo }) {
  const insumo = await obtenerInsumo(id);
  const minimo = _stockMinimo(stock_minimo);
  await insumo.update({ nombre, unidad_medida, ...(minimo !== undefined ? { stock_minimo: minimo } : {}) });
  return insumo;
}

async function desactivarInsumo(id) {
  const insumo = await obtenerInsumo(id);
  await insumo.update({ activo: 0 });
}

// --- Stock por sucursal ---

// Mismo patrón que ajustarStockSucursal (stock.service.js) pero con cantidades
// decimales y sin bloquear en negativo: un insumo puede quedar en déficit
// como señal visual de alerta, sin trabar ninguna venta (decisión de diseño,
// ver docs/superpowers/specs/2026-08-08-insumos-recetas-design.md).
async function ajustarStockInsumoSucursal({ insumo_id, sucursal_id, tipo, cantidad, usuario_id, nota, transaction }) {
  const [fila] = await InsumoStockSucursal.findOrCreate({
    where: { insumo_id, sucursal_id },
    defaults: { stock: 0 },
    transaction,
  });

  const stock_anterior = parseFloat(fila.stock);
  const cantidadNum = parseFloat(cantidad);
  let stock_nuevo;

  if (tipo === 'compra') {
    stock_nuevo = stock_anterior + cantidadNum;
  } else if (tipo === 'consumo_venta') {
    stock_nuevo = stock_anterior - cantidadNum;
  } else if (tipo === 'ajuste') {
    stock_nuevo = cantidadNum;
  } else {
    throw Object.assign(new Error(`Tipo de movimiento inválido: ${tipo}`), { status: 400 });
  }

  await fila.update({ stock: stock_nuevo }, { transaction });

  await InsumoMovimiento.create({
    insumo_id, sucursal_id, usuario_id, tipo, cantidad: cantidadNum, stock_anterior, stock_nuevo, nota,
  }, { transaction });

  return { stock_anterior, stock_nuevo };
}

// --- Receta (consumo de insumos por producto/opción) ---

async function listarRecetaProducto(producto_id) {
  return RecetaInsumo.findAll({
    where: { producto_id },
    include: [{ model: Insumo, as: 'insumo', attributes: ['id', 'nombre', 'unidad_medida'] }],
  });
}

// Reemplaza toda la receta del producto de una — mismo patrón "borrar todo y
// volver a crear" que ya usa actualizarGrupoOpciones con sus opciones.
async function guardarRecetaProducto(producto_id, lineas = []) {
  return sequelize.transaction(async (t) => {
    await RecetaInsumo.destroy({ where: { producto_id }, transaction: t });
    if (lineas.length) {
      await RecetaInsumo.bulkCreate(
        lineas.map(l => ({
          producto_id,
          opcion_id: l.opcion_id || null,
          insumo_id: l.insumo_id,
          cantidad: l.cantidad,
        })),
        { transaction: t },
      );
    }
    return listarRecetaProducto(producto_id);
  });
}

// --- Reporte ---

// `hasta` llega como fecha simple ("2026-08-09") desde el <input type="date">
// del frontend, que Sequelize interpreta como medianoche — sin este ajuste,
// las compras hechas ese mismo día quedarían fuera del rango.
function _whereCompraPorFecha(desde, hasta) {
  if (!desde && !hasta) return {};
  const where = {};
  if (desde) where[Op.gte] = desde;
  if (hasta) where[Op.lte] = `${hasta} 23:59:59`;
  return { creado_en: where };
}

async function totalGastadoInsumos({ desde, hasta } = {}) {
  const total = await DetalleCompra.sum('subtotal', {
    where: { insumo_id: { [Op.not]: null } },
    include: [{ model: Compra, attributes: [], where: _whereCompraPorFecha(desde, hasta) }],
  });

  return total || 0;
}

// Cuánto se compró de cada insumo (cantidad + monto) en un rango de fechas —
// pensado para que el admin compare mes a mes y ajuste cuánto comprar la
// próxima vez (ver conversación en docs/superpowers/specs/2026-08-08-insumos-recetas-design.md).
async function reporteComprasInsumos({ desde, hasta } = {}) {
  const whereCompra = _whereCompraPorFecha(desde, hasta);

  const filas = await DetalleCompra.findAll({
    attributes: [
      'insumo_id',
      [sequelize.fn('SUM', sequelize.col('DetalleCompra.cantidad')), 'cantidad_total'],
      [sequelize.fn('SUM', sequelize.col('DetalleCompra.subtotal')), 'monto_total'],
    ],
    where: { insumo_id: { [Op.not]: null } },
    include: [
      { model: Compra, attributes: [], where: whereCompra },
      { model: Insumo, as: 'insumo', attributes: ['nombre', 'unidad_medida'] },
    ],
    group: ['insumo_id', 'insumo.id'],
    order: [[sequelize.literal('monto_total'), 'DESC']],
  });

  return filas.map(f => ({
    insumo_id: f.insumo_id,
    nombre: f.insumo?.nombre,
    unidad_medida: f.insumo?.unidad_medida,
    cantidad_total: parseFloat(f.get('cantidad_total')),
    monto_total: parseFloat(f.get('monto_total')),
  }));
}

module.exports = {
  listarInsumos, obtenerInsumo, crearInsumo, actualizarInsumo, desactivarInsumo,
  ajustarStockInsumoSucursal,
  listarRecetaProducto, guardarRecetaProducto,
  totalGastadoInsumos, reporteComprasInsumos,
};
