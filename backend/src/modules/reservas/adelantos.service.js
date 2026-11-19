// Adelantos de reservas: el cliente deja plata por adelantado y entra a la caja
// del día en que se cobra; si se devuelve, sale de la caja del día en que se
// devuelve. Todo dentro de una transacción con la reserva bloqueada.
const sequelize = require('../../config/database');
const { Reserva, ReservaItem, ReservaPago, SesionCaja, LibroCaja, Caja } = require('../../models');
const { emitir } = require('../../socket');
const { round2 } = require('../devoluciones/calculo');
const reservasService = require('./reservas.service');

const METODOS = ['efectivo', 'qr'];
const CATEGORIA = 'adelantos_reserva';
const error = (mensaje, status = 400) => Object.assign(new Error(mensaje), { status });

function _monto(valor) {
  const monto = round2(Number(valor));
  if (!Number.isFinite(monto) || monto <= 0) throw error('El monto debe ser mayor a 0');
  return monto;
}

function _metodo(valor) {
  if (!METODOS.includes(valor)) throw error('Método de pago no válido');
  return valor;
}

// Reserva bloqueada y dentro del alcance del usuario.
async function _reservaBloqueada(id, alcance, t) {
  const r = await Reserva.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
  if (!r) throw error('Reserva no encontrada', 404);
  if (!alcance.acceso_todas && r.sucursal_id !== alcance.sucursal_id) throw error('Reserva no encontrada', 404);
  return r;
}

// Platos y lo adelantado hoy (con la reserva ya bloqueada).
async function _montos(reserva_id, t) {
  const [items, pagos] = await Promise.all([
    ReservaItem.findAll({ where: { reserva_id }, transaction: t }),
    ReservaPago.findAll({ where: { reserva_id }, transaction: t }),
  ]);
  const total_platos = round2(items.reduce((s, i) => s + Number(i.precio) * Number(i.cantidad), 0));
  const adelantado = round2(pagos.filter((p) => p.estado === 'completado')
    .reduce((s, p) => s + (p.tipo === 'devolucion' ? -1 : 1) * Number(p.monto), 0));
  return { total_platos, adelantado };
}

const _cajaAbierta = (usuario_id, sucursal_id, t) => SesionCaja.findOne({
  where: { usuario_id, sucursal_id, estado: 'abierta' }, order: [['id', 'DESC']], transaction: t,
});

// Cómo imprime la caja donde se cobró, para el ticket de adelanto (el cajero
// puede no tener caja.ver para leerlo aparte).
async function _impresionCaja(caja_id) {
  const caja = caja_id ? await Caja.findByPk(caja_id, {
    attributes: ['id', 'nombre', 'modo_impresion', 'ancho_papel_bluetooth', 'conexion_bluetooth', 'imprimir_logo', 'imprimir_ticket_cliente'],
  }) : null;
  if (!caja) return null;
  const c = caja.toJSON();
  return { ...c, imprimir_logo: c.imprimir_logo !== 0 && c.imprimir_logo !== false, imprimir_ticket_cliente: c.imprimir_ticket_cliente !== 0 && c.imprimir_ticket_cliente !== false };
}

async function cobrarAdelanto(reserva_id, usuario_id, { metodo_pago, monto, monto_recibido } = {}, alcance) {
  const metodo = _metodo(metodo_pago);
  const importe = _monto(monto);
  let cambio = 0;
  let recibido = null;
  if (metodo === 'efectivo') {
    recibido = round2(monto_recibido == null || monto_recibido === '' ? importe : Number(monto_recibido));
    if (!Number.isFinite(recibido) || recibido < importe) throw error('Monto recibido insuficiente');
    cambio = round2(recibido - importe);
  }
  const { sucursal_id, caja_id } = await sequelize.transaction(async (t) => {
    const r = await _reservaBloqueada(reserva_id, alcance, t);
    if (!['pendiente', 'llego'].includes(r.estado)) throw error('Esta reserva ya está cerrada', 409);
    if (r.pedido_id) throw error('Esta reserva ya está en cocina: cobra el pedido', 409);
    const { total_platos, adelantado } = await _montos(r.id, t);
    if (total_platos > 0 && round2(adelantado + importe) > total_platos) throw error('El adelanto pasa el total de los platos', 409);
    const sesion = await _cajaAbierta(usuario_id, r.sucursal_id, t);
    if (!sesion) throw error('Abre tu caja para cobrar', 409);
    await ReservaPago.create({
      reserva_id: r.id, usuario_id, sesion_caja_id: sesion.id, tipo: 'adelanto', metodo_pago: metodo,
      monto: importe, monto_recibido: recibido, cambio,
    }, { transaction: t });
    await LibroCaja.create({
      sesion_caja_id: sesion.id, usuario_id, tipo: 'ingreso', categoria: CATEGORIA, metodo_pago: metodo, monto: importe,
      concepto: `Adelanto reserva #${r.id} · ${r.nombre_cliente}`, referencia_id: r.id,
    }, { transaction: t });
    await SesionCaja.increment('total_ventas', { by: importe, where: { id: sesion.id }, transaction: t });
    return { sucursal_id: r.sucursal_id, caja_id: sesion.caja_id };
  });
  emitir('restaurante:actualizar', { tipo: 'reserva' }, sucursal_id);
  const reserva = await reservasService.obtener(reserva_id, alcance);
  return { ...reserva, impresion: await _impresionCaja(caja_id) };
}

// Devuelve plata del adelanto desde la caja abierta de quien devuelve. Con
// `transaction` participa de la del llamador (que emite el aviso él mismo).
async function devolverAdelanto(reserva_id, usuario_id, { metodo_pago, monto } = {}, alcance, transaction) {
  const metodo = _metodo(metodo_pago);
  const importe = _monto(monto);
  const hacer = async (t) => {
    const r = await _reservaBloqueada(reserva_id, alcance, t);
    const { adelantado } = await _montos(r.id, t);
    if (importe > adelantado) throw error('No se puede devolver más de lo adelantado', 409);
    const sesion = await _cajaAbierta(usuario_id, r.sucursal_id, t);
    if (!sesion) throw error('Abre tu caja para devolver', 409);
    const pago = await ReservaPago.create({
      reserva_id: r.id, usuario_id, sesion_caja_id: sesion.id, tipo: 'devolucion', metodo_pago: metodo, monto: importe,
    }, { transaction: t });
    await LibroCaja.create({
      sesion_caja_id: sesion.id, usuario_id, tipo: 'egreso', categoria: CATEGORIA, metodo_pago: metodo, monto: importe,
      concepto: `Devolución adelanto reserva #${r.id} · ${r.nombre_cliente}`, referencia_id: r.id,
    }, { transaction: t });
    if (metodo === 'efectivo') await SesionCaja.increment('total_devoluciones', { by: importe, where: { id: sesion.id }, transaction: t });
    return { pago, sucursal_id: r.sucursal_id };
  };
  if (transaction) return (await hacer(transaction)).pago;
  const { pago, sucursal_id } = await sequelize.transaction(hacer);
  emitir('restaurante:actualizar', { tipo: 'reserva' }, sucursal_id);
  return pago;
}

module.exports = { cobrarAdelanto, devolverAdelanto };
