// La reserva pasa a cocina como un pedido: los platos con el precio que se
// congeló al anotarlos y lo adelantado ya descontado. El adelanto entró a la
// caja el día que se cobró (adelantos.service): acá solo se anota como parte
// pagada del pedido, sin otro ingreso, para que nunca se cuente dos veces.
const sequelize = require('../../config/database');
const { Reserva, ReservaItem, ReservaPago, Pedido, PedidoPago, Mesa, Area, SesionCaja } = require('../../models');
const { emitir } = require('../../socket');
const ventasService = require('../ventas/ventas.service');
const reservasService = require('./reservas.service');
const push = require('../push/push.service');
const { round2 } = require('../devoluciones/calculo');

const ACTIVAS = ['pendiente', 'llego'];
const TODAS = { acceso_todas: true };
const error = (mensaje, status = 400) => Object.assign(new Error(mensaje), { status });

const _horaLocal = (f) => new Date(new Date(f).getTime() - 4 * 3600000).toISOString().slice(11, 16);

// Caja para el pedido: la abierta de quien convierte en la sucursal; si no
// tiene (o es el aviso automático), cualquier abierta de la sucursal.
async function _sesionCaja(usuario_id, sucursal_id, transaction) {
  const abierta = { sucursal_id, estado: 'abierta' };
  const propia = usuario_id
    ? await SesionCaja.findOne({ where: { ...abierta, usuario_id }, order: [['id', 'DESC']], transaction })
    : null;
  return propia || SesionCaja.findOne({ where: abierta, order: [['id', 'DESC']], transaction });
}

// Mesa del pedido: solo si es de la sucursal y está libre; si no, para llevar.
async function _mesaLibre(mesa_id, sucursal_id, transaction) {
  if (!mesa_id) return null;
  const mesa = await Mesa.findByPk(mesa_id, { include: [{ model: Area, as: 'area', attributes: ['sucursal_id'] }], transaction });
  return mesa && mesa.area?.sucursal_id === sucursal_id && mesa.estado === 'disponible' ? mesa : null;
}

// Lo adelantado neto por método (adelantos menos devoluciones), con la caja y
// el cajero del primer adelanto de ese método. Si una devolución salió por
// otro método que el adelanto, se descuenta de los otros métodos.
function _adelantosPorMetodo(pagos) {
  const porMetodo = new Map();
  for (const p of pagos.filter((x) => x.estado === 'completado')) {
    const fila = porMetodo.get(p.metodo_pago) || { metodo_pago: p.metodo_pago, monto: 0, primero: null };
    fila.monto += (p.tipo === 'devolucion' ? -1 : 1) * Number(p.monto);
    if (p.tipo === 'adelanto' && !fila.primero) fila.primero = p;
    porMetodo.set(p.metodo_pago, fila);
  }
  const filas = [...porMetodo.values()];
  let sobra = -filas.filter((f) => f.monto < 0).reduce((s, f) => s + f.monto, 0);
  const partes = [];
  for (const f of filas.filter((x) => x.monto > 0 && x.primero)) {
    const quita = Math.min(f.monto, sobra);
    sobra -= quita;
    const monto = round2(f.monto - quita);
    if (monto > 0) partes.push({ metodo_pago: f.metodo_pago, monto, sesion_caja_id: f.primero.sesion_caja_id, usuario_id: f.primero.usuario_id });
  }
  return partes;
}

// Crea el pedido de la reserva (con su fila bloqueada mientras tanto, así el
// aviso automático y "Llegó" al mismo tiempo no crean dos). `crearCompleta`
// usa su propia transacción y queda guardado antes de anotar el adelanto: si
// algo falla después, el pedido recién creado se cancela.
async function convertirEnPedido(reserva_id, usuario_id, { mesa_id, alcance } = {}) {
  let creadoId = null;
  let resultado;
  try {
    resultado = await sequelize.transaction(async (t) => {
      const r = await Reserva.findByPk(reserva_id, { transaction: t, lock: t.LOCK.UPDATE });
      if (!r) throw error('Reserva no encontrada', 404);
      if (alcance && !alcance.acceso_todas && r.sucursal_id !== alcance.sucursal_id) throw error('Reserva no encontrada', 404);
      if (r.pedido_id) return { r, pedido_id: r.pedido_id, nuevo: false };

      const items = await ReservaItem.findAll({ where: { reserva_id: r.id }, order: [['id', 'ASC']], transaction: t });
      if (!items.length) return { r, pedido_id: null, nuevo: false };
      if (!ACTIVAS.includes(r.estado)) throw error('Esta reserva ya está cerrada', 409);

      const sesion = await _sesionCaja(usuario_id, r.sucursal_id, t);
      if (!sesion) throw error('Abre una caja para mandar la reserva a cocina', 409);

      const datos = {
        items: items.map((i) => ({
          producto_id: i.producto_id, combo_id: i.combo_id, cantidad: i.cantidad, peso: i.peso, nota: i.nota,
          opcion_ids: i.opcion_ids || [], opciones_por_producto: i.opciones_por_producto || [],
        })),
        precios_fijos: items.map((i) => Number(i.precio)),
        metodo_pago: 'diferido',
        sesion_caja_id: sesion.id,
        usuario_id: r.usuario_id ?? usuario_id ?? sesion.usuario_id,
        nombre_cliente: r.nombre_cliente,
        telefono_cliente: r.telefono,
        notas: `Reserva #${r.id}${r.notas ? ` · ${r.notas}` : ''}`,
      };
      const mesa = await _mesaLibre(mesa_id || r.mesa_id, r.sucursal_id, t);
      let creado;
      try {
        creado = await ventasService.crearCompleta({ ...datos, tipo: mesa ? 'mesa' : 'llevar', mesa_id: mesa?.id ?? null });
      } catch (err) {
        // La mesa se ocupó justo ahora: igual sale a cocina, para llevar.
        if (!mesa || err.status !== 409 || err.message !== 'Mesa ya ocupada') throw err;
        creado = await ventasService.crearCompleta({ ...datos, tipo: 'llevar', mesa_id: null });
      }
      creadoId = creado.id;
      if (creado.tipo === 'mesa') await Mesa.update({ estado: 'ocupada' }, { where: { id: creado.mesa_id }, transaction: t });

      const pedido = await Pedido.findByPk(creadoId, { transaction: t, lock: t.LOCK.UPDATE });
      const pagos = await ReservaPago.findAll({ where: { reserva_id: r.id }, order: [['id', 'ASC']], transaction: t });
      let pagado = 0;
      for (const parte of _adelantosPorMetodo(pagos)) {
        await PedidoPago.create({
          pedido_id: pedido.id, usuario_id: parte.usuario_id ?? datos.usuario_id, sesion_caja_id: parte.sesion_caja_id,
          metodo_pago: parte.metodo_pago, monto: parte.monto, monto_recibido: parte.monto, cambio: 0,
          modo: 'adelanto', persona: 'Adelanto reserva', estado: 'completado',
        }, { transaction: t });
        pagado = round2(pagado + parte.monto);
      }
      if (pagado > 0) await pedido.update({ pagado: round2(Number(pedido.pagado || 0) + pagado) }, { transaction: t });
      await r.update({ pedido_id: pedido.id, enviada_cocina_en: new Date() }, { transaction: t });
      return { r, pedido_id: pedido.id, nuevo: true };
    });
  } catch (err) {
    if (creadoId) {
      await ventasService.cancelar(creadoId, usuario_id, TODAS)
        .catch((e) => console.error(`[reservas] No se pudo cancelar el pedido #${creadoId} de la reserva #${reserva_id}:`, e.message));
    }
    throw err;
  }

  const { r, pedido_id, nuevo } = resultado;
  if (nuevo) {
    emitir('restaurante:actualizar', { tipo: 'reserva' }, r.sucursal_id);
    push.avisar(() => push.aPermiso({ modulo: 'ventas', accion: 'crear', sucursal_id: r.sucursal_id }, {
      titulo: 'Reserva en cocina',
      cuerpo: `Reserva de ${r.nombre_cliente} (${_horaLocal(r.fecha_hora)}) · ya está en cocina`,
      url: `/vender/pedido/${pedido_id}`,
      etiqueta: `reserva-${r.id}`,
    }));
  }
  return {
    reserva: await reservasService.obtener(r.id, TODAS),
    pedido: pedido_id ? await ventasService.obtener(pedido_id) : null,
  };
}

module.exports = { convertirEnPedido, _adelantosPorMetodo };
