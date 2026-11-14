// Dividir la cuenta: cobrar un pedido en varias partes (por platos o en
// partes iguales), en distintos momentos y por distintos cajeros. Cada parte
// se asienta en el libro de caja de quien la cobra; el stock y la mesa se
// resuelven una sola vez, cuando la suma de las partes cubre el total.
const { Pedido, DetallePedido, SesionCaja, PedidoPago, PedidoPagoItem, sequelize } = require('../../models');
const { emitir } = require('../../socket');
const { cantidadVigente, round2 } = require('../devoluciones/calculo');
const ventasService = require('./ventas.service');

const ORIGENES_SIN_DIVIDIR = ['autoservicio', 'app_externa'];
const MODOS = ['platos', 'iguales'];

const error = (mensaje, status) => Object.assign(new Error(mensaje), { status });

// Unidades ya pagadas (o comprometidas en un QR pendiente) por cada línea del
// pedido. Espera `pedido.pagos` con sus `items`.
function unidadesPagadas(pedido) {
  const mapa = new Map();
  for (const pago of pedido.pagos || []) {
    if (!['completado', 'pendiente'].includes(pago.estado)) continue;
    for (const item of pago.items || []) {
      mapa.set(item.detalle_pedido_id, (mapa.get(item.detalle_pedido_id) || 0) + Number(item.cantidad));
    }
  }
  return mapa;
}

// Lo que falta pagar del pedido.
function falta(pedido) {
  return round2(Number(pedido.total || 0) - Number(pedido.pagado || 0));
}

// Caja donde se asienta la parte: la abierta de quien cobra en la sucursal del
// pedido; si no tiene, la del pedido mientras siga abierta.
async function _sesionParaCobrar(pedido, usuario_id, transaction) {
  const propia = await SesionCaja.findOne({
    where: { usuario_id, sucursal_id: pedido.sucursal_id, estado: 'abierta' },
    order: [['id', 'DESC']],
    transaction,
  });
  if (propia) return propia.id;
  if (pedido.sesion_caja_id) {
    const delPedido = await SesionCaja.findByPk(pedido.sesion_caja_id, { transaction });
    if (delPedido && delPedido.estado === 'abierta') return delPedido.id;
  }
  throw error('Abre tu caja para cobrar', 409);
}

// Si las partes ya cubren el total, completa el pedido: método (el único usado
// o 'mixto'), recibido y cambio sumados, sale de cocina y cierra la venta
// (mesa, stock, insumos). El ingreso ya se asentó parte por parte.
async function _completarSiCorresponde(pedido, usuario_id, transaction) {
  if (Number(pedido.pagado) < Number(pedido.total) - 0.005) return false;

  const pagos = await PedidoPago.findAll({ where: { pedido_id: pedido.id, estado: 'completado' }, transaction });
  const metodos = [...new Set(pagos.map((p) => p.metodo_pago))];
  const monto_recibido = round2(pagos.reduce((s, p) => s + Number(p.monto_recibido ?? p.monto), 0));
  const cambio = round2(pagos.reduce((s, p) => s + Number(p.cambio || 0), 0));

  await pedido.update({
    estado: 'completado',
    metodo_pago: metodos.length === 1 ? metodos[0] : 'mixto',
    monto_recibido,
    cambio,
    estado_cocina: null,
  }, { transaction });

  const filas = await DetallePedido.findAll({ where: { pedido_id: pedido.id }, transaction });
  const detalles = filas.map((d) => ({
    id: d.id, producto_id: d.producto_id, combo_id: d.combo_id, cantidad: d.cantidad, cantidad_anulada: d.cantidad_anulada,
  }));
  await ventasService._cerrarVenta({ pedido, detalles, usuario_id }, transaction);
  return true;
}

// Monto de una parte por platos: valida que cada unidad siga sin pagar.
function _montoPorPlatos(items, detalles, pagadas) {
  if (!Array.isArray(items) || items.length === 0) throw error('Elige los platos que se pagan', 400);

  const pedidas = new Map();
  for (const item of items) {
    const cantidad = Number(item.cantidad);
    if (!Number.isInteger(cantidad) || cantidad <= 0) throw error('Cantidad inválida', 400);
    const id = Number(item.detalle_pedido_id);
    pedidas.set(id, (pedidas.get(id) || 0) + cantidad);
  }

  let monto = 0;
  const lineas = [];
  for (const [detalle_pedido_id, cantidad] of pedidas) {
    const detalle = detalles.find((d) => d.id === detalle_pedido_id);
    if (!detalle) throw error('Ese plato no es de este pedido', 400);
    const disponible = cantidadVigente(detalle) - (pagadas.get(detalle_pedido_id) || 0);
    if (cantidad > disponible) throw error('Ese plato ya está pagado', 409);
    monto += cantidad * Number(detalle.precio);
    lineas.push({ detalle_pedido_id, cantidad });
  }
  return { monto: round2(monto), lineas };
}

// Campos del cobro completo que no aplican a una parte.
const _hayAjuste = (v) => (typeof v === 'string' ? v.trim() !== '' && Number(v) !== 0 : Boolean(v) && Number(v) !== 0);

async function cobrarParte(pedido_id, usuario_id, { metodo_pago, monto_recibido, persona, modo, monto, items, descuento, cupon_codigo, puntos_canjear, propina } = {}, alcance) {
  if (!MODOS.includes(modo)) throw error("modo debe ser 'platos' o 'iguales'", 400);
  if (_hayAjuste(descuento) || (cupon_codigo && String(cupon_codigo).trim() !== '') || _hayAjuste(puntos_canjear) || _hayAjuste(propina)) {
    throw error('Con pagos parciales no se aplican descuentos, cupones ni puntos', 400);
  }
  if (metodo_pago !== 'efectivo') {
    // El cobro de una parte por QR llega en otra etapa.
    throw error('metodo_pago debe ser efectivo', 400);
  }

  const resultado = await sequelize.transaction(async (t) => {
    const pedido = await Pedido.findByPk(pedido_id, { transaction: t, lock: t.LOCK.UPDATE });
    if (!pedido) throw error('Pedido no encontrado', 404);
    ventasService.verificarAlcance(pedido, alcance);
    if (!['pendiente', 'listo'].includes(pedido.estado)) throw error('El pedido no puede cobrarse', 409);
    if (ORIGENES_SIN_DIVIDIR.includes(pedido.origen)) throw error('Este pedido se cobra completo', 409);

    const pagos = await PedidoPago.findAll({
      where: { pedido_id: pedido.id, estado: ['pendiente', 'completado'] },
      include: [{ model: PedidoPagoItem, as: 'items' }],
      transaction: t,
    });
    if (pagos.some((p) => p.estado === 'pendiente')) throw error('Hay un QR esperando confirmación', 409);

    const faltante = falta(pedido);
    let montoParte;
    let lineas = [];
    if (modo === 'platos') {
      const detalles = await DetallePedido.findAll({ where: { pedido_id: pedido.id }, transaction: t });
      ({ monto: montoParte, lineas } = _montoPorPlatos(items, detalles, unidadesPagadas({ pagos })));
    } else {
      montoParte = round2(Number(monto));
      if (!Number.isFinite(montoParte) || montoParte <= 0) throw error('El monto debe ser mayor a cero', 400);
    }
    if (montoParte > faltante + 0.005) throw error('Es más de lo que falta', 409);

    const recibido = monto_recibido === undefined || monto_recibido === null || monto_recibido === ''
      ? montoParte
      : Number(monto_recibido);
    if (!Number.isFinite(recibido) || recibido < montoParte - 0.005) throw error('Monto recibido insuficiente', 400);
    const cambio = Math.max(0, round2(recibido - montoParte));

    const sesion_caja_id = await _sesionParaCobrar(pedido, usuario_id, t);
    const numero = pagos.length + 1;
    const nombre = persona ? String(persona).trim().slice(0, 80) : null;

    const pago = await PedidoPago.create({
      pedido_id: pedido.id, usuario_id, sesion_caja_id, metodo_pago, monto: montoParte, monto_recibido: recibido, cambio,
      persona: nombre || null, modo, estado: 'completado',
    }, { transaction: t });
    if (lineas.length) {
      await PedidoPagoItem.bulkCreate(lineas.map((l) => ({ ...l, pedido_pago_id: pago.id })), { transaction: t });
    }

    await ventasService._asentarIngreso({
      pedido, monto: montoParte, metodo_pago, usuario_id, sesion_caja_id,
      concepto: `Venta #${pedido.id} · parte ${numero}${nombre ? ` (${nombre})` : ''}`,
    }, t);

    await pedido.update({ pagado: round2(Number(pedido.pagado) + montoParte) }, { transaction: t });
    const completado = await _completarSiCorresponde(pedido, usuario_id, t);
    return { pago_id: pago.id, completado, sucursal_id: pedido.sucursal_id };
  });

  emitir('restaurante:actualizar', { tipo: resultado.completado ? 'pedido_cobrado' : 'pedido_pago_parcial' }, resultado.sucursal_id);

  const pago = await PedidoPago.findByPk(resultado.pago_id, { include: [{ model: PedidoPagoItem, as: 'items' }] });
  return {
    pedido: await ventasService.obtener(pedido_id),
    pago,
    completado: resultado.completado,
    datos_impresion: null, // El comprobante de la parte se imprime en otra etapa.
  };
}

module.exports = { cobrarParte, unidadesPagadas, falta, _sesionParaCobrar, _completarSiCorresponde };
