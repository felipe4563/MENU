const { SesionCaja, Pedido, Producto, Combo, Sucursal } = require('../../models');
const ventasService = require('../ventas/ventas.service');
const cuponesService = require('../cupones/cupones.service');
const { listarProductos } = require('../productos/productos.service');
const { listarActivos: listarCombosActivos } = require('../combos/combos.service');
const { listarActivas: listarPromocionesActivas } = require('../promociones/promociones.service');
const { obtenerPublica: obtenerConfigPublica } = require('../configuracion/configuracion.service');

async function obtenerMenu(sucursal_id) {
  const alcance = { sucursal_id, acceso_todas: false };
  const [productos, combos, promociones, sucursal, config] = await Promise.all([
    listarProductos({ solo_vendibles: true, solo_disponibles: true, solo_disponibles_hoy: true }, alcance),
    listarCombosActivos(),
    listarPromocionesActivas(),
    Sucursal.findByPk(sucursal_id, { attributes: ['id', 'nombre', 'direccion', 'telefono', 'latitud', 'longitud'] }),
    obtenerConfigPublica(),
  ]);
  return {
    sucursal,
    negocio: {
      nombre_negocio: config.nombre_negocio ?? null,
      logo: config.logo ?? null,
      portada: config.portada ?? null,
      moneda: config.moneda ?? null,
      simbolo_moneda: config.simbolo_moneda ?? null,
    },
    productos,
    combos,
    promociones,
  };
}

// Recalcula el subtotal con los precios reales de la base de datos antes de
// validar el cupón — no confía en los precios que mande la app externa
// (mismo motivo que autoservicio.service.js:validarCupon). Es solo una
// vista previa: el pedido real vuelve a validar el cupón (y su límite de
// usos) dentro de la transacción de crearCompleta.
async function validarCupon({ codigo, items }) {
  const idsProducto = [...new Set((items || []).filter((i) => i.producto_id).map((i) => Number(i.producto_id)))];
  const idsCombo = [...new Set((items || []).filter((i) => i.combo_id).map((i) => Number(i.combo_id)))];
  const [productos, combos] = await Promise.all([
    idsProducto.length > 0 ? Producto.findAll({ where: { id: idsProducto }, attributes: ['id', 'precio'] }) : [],
    idsCombo.length > 0 ? Combo.findAll({ where: { id: idsCombo }, attributes: ['id', 'precio'] }) : [],
  ]);
  const preciosProducto = new Map(productos.map((p) => [p.id, parseFloat(p.precio)]));
  const preciosCombo = new Map(combos.map((c) => [c.id, parseFloat(c.precio)]));

  const itemsConPrecio = (items || []).map((i) => (
    i.combo_id
      ? { producto_id: null, combo_id: Number(i.combo_id), cantidad: i.cantidad, precio: preciosCombo.get(Number(i.combo_id)) ?? 0 }
      : { producto_id: i.producto_id, cantidad: i.cantidad, precio: preciosProducto.get(Number(i.producto_id)) ?? 0 }
  ));
  const subtotal = itemsConPrecio.reduce((s, i) => s + i.precio * i.cantidad, 0);

  return cuponesService.validar(codigo, subtotal, null, itemsConPrecio);
}

async function crearPedido(sucursal_id, { items, tipo, direccion_entrega, telefono_cliente, nombre_cliente, pago, cupon_codigo, origen_app }) {
  const sesionCaja = await SesionCaja.findOne({ where: { sucursal_id, estado: 'abierta' } });
  if (!sesionCaja) {
    throw Object.assign(new Error('El local no está tomando pedidos en este momento.'), { status: 409 });
  }

  return ventasService.crearCompleta({
    tipo,
    items,
    direccion_entrega,
    telefono_cliente,
    nombre_cliente,
    metodo_pago: pago === 'prepago' ? 'app_externa' : 'diferido',
    sesion_caja_id: sesionCaja.id,
    usuario_id: sesionCaja.usuario_id,
    origen: 'app_externa',
    origen_app,
    cupon_codigo,
  });
}

// Mismo motivo que autoservicio.service.js:consultarEstadoPedido — la
// pertenencia se verifica con un findByPk liviano ANTES de devolver nada, y
// se corta con 404 (no 403) para no confirmarle a un caller con una key
// válida pero de otra integración que el id existe.
async function consultarEstadoPedido(sucursal_id, pedido_id) {
  const pedido = await Pedido.findByPk(pedido_id, { attributes: ['id', 'sucursal_id', 'origen', 'estado', 'total'] });
  if (!pedido || pedido.sucursal_id !== sucursal_id || pedido.origen !== 'app_externa') {
    throw Object.assign(new Error('Pedido no encontrado'), { status: 404 });
  }
  return { id: pedido.id, estado: pedido.estado, total: pedido.total };
}

module.exports = { obtenerMenu, validarCupon, crearPedido, consultarEstadoPedido };
