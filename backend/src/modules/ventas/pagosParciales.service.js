// Dividir la cuenta: cobrar un pedido en varias partes (por platos o en
// partes iguales), en distintos momentos y por distintos cajeros. Cada parte
// se asienta en el libro de caja de quien la cobra; el stock y la mesa se
// resuelven una sola vez, cuando la suma de las partes cubre el total.
const { Op } = require('sequelize');
const { Pedido, DetallePedido, SesionCaja, PedidoPago, PedidoPagoItem, sequelize } = require('../../models');
const { emitir } = require('../../socket');
const { cantidadVigente, round2 } = require('../devoluciones/calculo');
const ventasService = require('./ventas.service');

const ORIGENES_SIN_DIVIDIR = ['autoservicio', 'app_externa'];
const MODOS = ['platos', 'iguales'];
const METODOS = ['efectivo', 'qr'];

const error = (mensaje, status) => Object.assign(new Error(mensaje), { status });

const MSJ_YA_PAGADO = 'Ya se pagó una parte: termina de cobrar y haz una devolución';
const MSJ_QR_PENDIENTE = 'Hay un QR esperando confirmación';

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

// Partes vigentes del pedido (cobradas o con un QR esperando), con sus platos.
async function partesVigentes(pedido_id, transaction) {
  return PedidoPago.findAll({
    where: { pedido_id, estado: ['pendiente', 'completado'] },
    include: [{ model: PedidoPagoItem, as: 'items' }],
    transaction,
  });
}

// Después de bajar platos de un pedido (anular, editar o quitar una línea),
// con el pedido bloqueado y `pagos` leídas antes del cambio: ninguna unidad
// pagada (o reservada por un QR pendiente) puede quedar fuera, ni el total
// por debajo de lo cobrado más lo que espera un QR. Si pasa, 409 y la
// transacción se revierte.
async function verificarLoPagado(pedido_id, pagos, transaction) {
  if (!pagos.length) return;
  const pedido = await Pedido.findByPk(pedido_id, { transaction });
  const detalles = await DetallePedido.findAll({ where: { pedido_id }, transaction });
  for (const [detalle_pedido_id, cantidad] of unidadesPagadas({ pagos })) {
    const detalle = detalles.find((d) => d.id === detalle_pedido_id);
    if (!detalle || cantidadVigente(detalle) < cantidad) throw error(MSJ_YA_PAGADO, 409);
  }
  const comprometido = round2(pagos.reduce((s, p) => s + Number(p.monto), 0));
  if (Number(pedido.total) < comprometido - 0.005) throw error(MSJ_YA_PAGADO, 409);
}

// Caja abierta de un usuario en la sucursal del pedido (o null).
async function _cajaAbiertaDe(pedido, usuario_id, transaction) {
  const propia = await SesionCaja.findOne({
    where: { usuario_id, sucursal_id: pedido.sucursal_id, estado: 'abierta' },
    order: [['id', 'DESC']],
    transaction,
  });
  return propia ? propia.id : null;
}

// Caja donde se asienta la parte: la abierta de quien cobra en la sucursal del
// pedido; si no tiene, la del pedido mientras siga abierta.
async function _sesionParaCobrar(pedido, usuario_id, transaction) {
  const propia = await _cajaAbiertaDe(pedido, usuario_id, transaction);
  if (propia) return propia;
  if (pedido.sesion_caja_id) {
    const delPedido = await SesionCaja.findByPk(pedido.sesion_caja_id, { transaction });
    if (delPedido && delPedido.estado === 'abierta') return delPedido.id;
  }
  throw error('Abre tu caja para cobrar', 409);
}

// Caja donde se asienta un QR de parte al confirmarse. El banco ya cobró, así
// que nunca falla: la caja abierta de quien la cobró, si no la del pedido si
// sigue abierta, si no cualquier abierta de la sucursal y, en último caso, la
// caja donde se generó el QR aunque ya esté cerrada (con aviso en el log).
async function _sesionParaConfirmar(pedido, pago, transaction) {
  const propia = await _cajaAbiertaDe(pedido, pago.usuario_id, transaction);
  if (propia) return propia;
  return ventasService._sesionCajaParaAsiento(pedido, transaction, { respaldo: pago.sesion_caja_id });
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

// Con el pedido bloqueado y el total ya recalculado: si bajar platos (anular,
// quitar una línea o bajar su cantidad) dejó lo cobrado cubriendo el total,
// el pedido se cierra ahí mismo. Si no, quedaría abierto con Falta 0 sin
// forma de cobrarlo ni cancelarlo. Solo con partes cobradas y ninguna
// esperando un QR. Devuelve true si lo cerró.
async function cerrarSiYaEstaPagado(pedido_id, usuario_id, transaction) {
  const pedido = await Pedido.findByPk(pedido_id, { transaction });
  if (!pedido || !['pendiente', 'listo'].includes(pedido.estado)) return false;
  const pagos = await PedidoPago.findAll({ where: { pedido_id, estado: ['pendiente', 'completado'] }, transaction });
  if (!pagos.some((p) => p.estado === 'completado') || pagos.some((p) => p.estado === 'pendiente')) return false;
  return _completarSiCorresponde(pedido, usuario_id, transaction);
}

// Ya confirmada la transacción que cerró el pedido sin cobrar otra parte:
// avisa a las pantallas e imprime el ticket final con las partes, igual que
// la última parte. Devuelve su `datos_impresion`.
async function avisarCierre(pedido_id) {
  const pedido = await ventasService.obtener(pedido_id);
  emitir('restaurante:actualizar', { tipo: 'pedido_cobrado' }, pedido.sucursal_id);
  const datos_impresion = await imprimirParte(pedido, null, true);
  return { pedido, datos_impresion };
}

const _concepto = (pedido, numero, persona) => `Venta #${pedido.id} · parte ${numero}${persona ? ` (${persona})` : ''}`;

// Asienta una parte ya pagada en el libro de la caja donde se cobró, la suma
// a lo pagado del pedido y lo completa si ya se cubrió el total.
async function _asentarParte(pedido, pago, numero, transaction) {
  const monto = Number(pago.monto);
  await ventasService._asentarIngreso({
    pedido, monto, metodo_pago: pago.metodo_pago, usuario_id: pago.usuario_id, sesion_caja_id: pago.sesion_caja_id,
    concepto: _concepto(pedido, numero, pago.persona),
  }, transaction);
  await pedido.update({ pagado: round2(Number(pedido.pagado) + monto) }, { transaction });
  return _completarSiCorresponde(pedido, pago.usuario_id, transaction);
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

// Datos del comprobante de una parte (`pago_parcial` del ticket de caja).
// `pedido` viene de ventasService.obtener (con detalles y pagos por id). Su
// número es el que tenía al crearse: las partes vigentes hasta ella. El
// "1 de N" de partes iguales no se guarda, así que va null.
function _datosComprobante(pedido, pago_id) {
  const vigentes = (pedido.pagos || []).filter((p) => ['pendiente', 'completado'].includes(p.estado));
  const indice = vigentes.findIndex((p) => p.id === pago_id);
  const pago = vigentes[indice];
  const items = (pago.items || []).map((it) => {
    const detalle = (pedido.detalles || []).find((d) => d.id === it.detalle_pedido_id);
    const cantidad = Number(it.cantidad);
    const nombre = !detalle ? '' : detalle.combo ? `Combo: ${detalle.combo.nombre}` : (detalle.producto?.nombre || '');
    return { nombre, cantidad, subtotal: round2(cantidad * Number(detalle?.precio || 0)) };
  });
  return {
    pago_id: pago.id,
    numero: indice + 1,
    persona: pago.persona || null,
    modo: pago.modo,
    monto: Number(pago.monto),
    metodo_pago: pago.metodo_pago,
    monto_recibido: Number(pago.monto_recibido ?? pago.monto),
    cambio: Number(pago.cambio || 0),
    pagado: Number(pedido.pagado),
    falta: falta(pedido),
    partes_iguales_de: null,
    items,
  };
}

// Imprime lo que corresponde a una parte ya cobrada: su comprobante, o el
// ticket final con las partes si fue la que completó el pedido. Nunca la
// comanda de cocina (ya salió al mandar el pedido). La parte ya está cobrada:
// si la impresión falla se registra y se devuelve null, sin romper el cobro.
// Con `sinEmitir` solo arma los datos (sin mandarlos por socket): para
// devolverlos de nuevo cuando ya se imprimieron al confirmarse.
async function imprimirParte(pedido, pago_id, completado, { sinEmitir = false } = {}) {
  try {
    const numero = await ventasService._numeroOrdenDiarioOriginal(pedido);
    if (completado) {
      return await ventasService._emitirImpresion(
        pedido, pedido.metodo_pago, Number(pedido.cambio || 0), pedido.sucursal_id, numero, { suprimirCocina: true, sinEmitir },
      );
    }
    const pagoParcial = _datosComprobante(pedido, pago_id);
    return await ventasService._emitirImpresion(
      pedido, pagoParcial.metodo_pago, pagoParcial.cambio, pedido.sucursal_id, numero, { suprimirCocina: true, pagoParcial, sinEmitir },
    );
  } catch (err) {
    console.error(`[pagos parciales] No se pudo imprimir la parte ${pago_id} del pedido #${pedido.id}:`, err.message);
    return null;
  }
}

// Con `saldoCompleto` (cobro de la cuenta completa con pagos hechos) la parte
// es exactamente lo que falta, leído con el pedido bloqueado.
async function cobrarParte(pedido_id, usuario_id, { metodo_pago, monto_recibido, persona, modo, monto, items, descuento, cupon_codigo, puntos_canjear, propina } = {}, alcance, { saldoCompleto = false } = {}) {
  if (!MODOS.includes(modo)) throw error("modo debe ser 'platos' o 'iguales'", 400);
  if (_hayAjuste(descuento) || (cupon_codigo && String(cupon_codigo).trim() !== '') || _hayAjuste(puntos_canjear) || _hayAjuste(propina)) {
    throw error('Con pagos parciales no se aplican descuentos, cupones ni puntos', 400);
  }
  if (!METODOS.includes(metodo_pago)) throw error("metodo_pago debe ser 'efectivo' o 'qr'", 400);
  const esQr = metodo_pago === 'qr';

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
    if (pagos.some((p) => p.estado === 'pendiente')) throw error(MSJ_QR_PENDIENTE, 409);

    const faltante = falta(pedido);
    let montoParte;
    let lineas = [];
    if (modo === 'platos') {
      const detalles = await DetallePedido.findAll({ where: { pedido_id: pedido.id }, transaction: t });
      ({ monto: montoParte, lineas } = _montoPorPlatos(items, detalles, unidadesPagadas({ pagos })));
    } else {
      montoParte = saldoCompleto ? faltante : round2(Number(monto));
      if (!Number.isFinite(montoParte) || montoParte <= 0) throw error('El monto debe ser mayor a cero', 400);
    }
    if (montoParte > faltante + 0.005) throw error('Es más de lo que falta', 409);

    // Por QR se paga justo el monto de la parte: no hay recibido ni cambio.
    const recibido = esQr || monto_recibido === undefined || monto_recibido === null || monto_recibido === ''
      ? montoParte
      : Number(monto_recibido);
    if (!Number.isFinite(recibido) || recibido < montoParte - 0.005) throw error('Monto recibido insuficiente', 400);
    const cambio = Math.max(0, round2(recibido - montoParte));

    // También por QR: sin caja abierta no se genera el cobro. Al confirmarse
    // se vuelve a resolver la caja (puede haber cambiado de turno).
    const sesion_caja_id = await _sesionParaCobrar(pedido, usuario_id, t);
    const numero = pagos.length + 1;
    const nombre = persona ? String(persona).trim().slice(0, 80) : null;

    const pago = await PedidoPago.create({
      pedido_id: pedido.id, usuario_id, sesion_caja_id, metodo_pago, monto: montoParte, monto_recibido: recibido, cambio,
      persona: nombre || null, modo, estado: esQr ? 'pendiente' : 'completado',
    }, { transaction: t });
    // Las unidades de un QR pendiente quedan reservadas (ver unidadesPagadas).
    if (lineas.length) {
      await PedidoPagoItem.bulkCreate(lineas.map((l) => ({ ...l, pedido_pago_id: pago.id })), { transaction: t });
    }

    const completado = esQr ? false : await _asentarParte(pedido, pago, numero, t);
    return { pago_id: pago.id, monto: montoParte, completado, sucursal_id: pedido.sucursal_id };
  });

  let pago_qr = null;
  if (esQr) {
    // El QR se pide fuera de la transacción del lock (como el cobro completo):
    // el pago pendiente ya bloquea cualquier otra parte mientras tanto.
    try {
      const pedido = await Pedido.findByPk(pedido_id);
      pago_qr = await ventasService.iniciarPagoQr(pedido, { parte: { pedido_pago_id: resultado.pago_id, monto: resultado.monto } });
    } catch (err) {
      await PedidoPago.update({ estado: 'anulado' }, { where: { id: resultado.pago_id, estado: 'pendiente' } });
      throw err;
    }
  }

  emitir('restaurante:actualizar', { tipo: resultado.completado ? 'pedido_cobrado' : 'pedido_pago_parcial' }, resultado.sucursal_id);

  const pago = await PedidoPago.findByPk(resultado.pago_id, { include: [{ model: PedidoPagoItem, as: 'items' }] });
  const pedido = await ventasService.obtener(pedido_id);
  // Un QR imprime su comprobante al confirmarse (ver _confirmarPagoQr).
  const datos_impresion = esQr ? null : await imprimirParte(pedido, resultado.pago_id, resultado.completado);
  return { pedido, pago, pago_qr, completado: resultado.completado, datos_impresion };
}

// Cobro de la cuenta completa (POST /ventas/:id/cobrar) sobre un pedido que
// ya tiene partes: cobra solo lo que falta como una última parte en partes
// iguales, sin descuentos. Devuelve la misma forma que ventasService.cobrar,
// o null si el pedido no tiene partes (sigue el cobro de siempre).
async function cobrarLoQueFalta(pedido, usuario_id, { metodo_pago, monto_recibido, descuento, cupon_codigo, puntos_canjear, propina } = {}, alcance) {
  const pagos = await PedidoPago.findAll({ where: { pedido_id: pedido.id, estado: ['pendiente', 'completado'] } });
  if (!pagos.length) return null;
  if (pagos.some((p) => p.estado === 'pendiente')) throw error(MSJ_QR_PENDIENTE, 409);
  if (_hayAjuste(descuento) || (cupon_codigo && String(cupon_codigo).trim() !== '') || _hayAjuste(puntos_canjear) || _hayAjuste(propina)) {
    throw error('Con pagos hechos, cobra lo que falta sin descuentos', 400);
  }

  // Ya no falta nada (datos de antes de cerrar al bajar platos): se cierra
  // la cuenta sin cobrar otra parte.
  if (falta(pedido) <= 0.005) {
    const cerrado = await sequelize.transaction(async (t) => {
      const bloqueado = await Pedido.findByPk(pedido.id, { transaction: t, lock: t.LOCK.UPDATE });
      if (!bloqueado || falta(bloqueado) > 0.005) return false;
      return cerrarSiYaEstaPagado(pedido.id, usuario_id, t);
    });
    if (!cerrado) throw error('El pedido cambió mientras se cobraba. Vuelve a intentarlo', 409);
    const { pedido: completo, datos_impresion } = await avisarCierre(pedido.id);
    return { ...completo.toJSON(), datos_impresion };
  }

  const r = await cobrarParte(pedido.id, usuario_id, { metodo_pago, monto_recibido, modo: 'iguales' }, alcance, { saldoCompleto: true });
  if (r.pago_qr) return { pedido: r.pedido, pago_qr: r.pago_qr };
  return { ...r.pedido.toJSON(), datos_impresion: r.datos_impresion };
}

// Confirma el QR de una parte (webhook, consulta o confirmación manual):
// la parte pasa a completada y se asienta como una en efectivo (caja según
// _sesionParaConfirmar). Corre dentro de la transacción de _confirmarPagoQr.
async function _confirmarParteQr(pagoQr, transaction) {
  const pedido = await Pedido.findByPk(pagoQr.pedido_id, { transaction, lock: transaction.LOCK.UPDATE });
  const pago = await PedidoPago.findByPk(pagoQr.pedido_pago_id, { transaction, lock: transaction.LOCK.UPDATE });
  if (!pedido || !pago || pago.estado !== 'pendiente') throw error('Ese pago ya no está esperando el QR', 409);

  const sesion_caja_id = await _sesionParaConfirmar(pedido, pago, transaction);
  await pago.update({ estado: 'completado', sesion_caja_id }, { transaction });

  // Su número es el que tenía al crearse: las partes vigentes hasta ella.
  const numero = await PedidoPago.count({
    where: { pedido_id: pedido.id, estado: ['pendiente', 'completado'], id: { [Op.lte]: pago.id } },
    transaction,
  });
  return _asentarParte(pedido, pago, numero, transaction);
}

// Un QR de parte que venció, falló o se canceló: la parte se anula y sus
// unidades vuelven a estar libres. El pedido no cambia.
async function _anularParteQr(pagoQr, transaction) {
  await PedidoPago.update(
    { estado: 'anulado' },
    { where: { id: pagoQr.pedido_pago_id, estado: 'pendiente' }, transaction },
  );
}

module.exports = {
  cobrarParte, cobrarLoQueFalta, imprimirParte, cerrarSiYaEstaPagado, avisarCierre, unidadesPagadas, falta, partesVigentes, verificarLoPagado, MSJ_YA_PAGADO, MSJ_QR_PENDIENTE, _sesionParaCobrar, _completarSiCorresponde, _confirmarParteQr, _anularParteQr,
};
