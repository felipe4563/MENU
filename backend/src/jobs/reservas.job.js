// Cada minuto: manda a cocina las reservas "antes" cuando llega su hora y
// avisa (una sola vez) de las que no llegaron.
const { Op } = require('sequelize');
const { Reserva, ReservaItem, Pedido } = require('../models');
const reservasService = require('../modules/reservas/reservas.service');
const { convertirEnPedido } = require('../modules/reservas/convertir.service');
const push = require('../modules/push/push.service');

const MIN = 60000;
// El aviso de "no llegó" mira solo las últimas 24 horas: de una pendiente
// vieja no se avisa. A cocina sale sola solo dentro de su horario (enHorario).
const VENTANA = 24 * 60 * MIN;
// La duración más larga de una reserva (10 horas).
const DURACION_MAX = 600 * MIN;
const _horaLocal = (f) => new Date(new Date(f).getTime() - 4 * 3600000).toISOString().slice(11, 16);

async function _enviar(ahora, cfg) {
  const candidatas = await Reserva.findAll({
    where: {
      estado: 'pendiente', pedido_id: null,
      fecha_hora: { [Op.between]: [new Date(ahora.getTime() - DURACION_MAX), new Date(ahora.getTime() + 1440 * MIN)] },
    },
    include: [{ model: ReservaItem, as: 'items', attributes: ['id'], required: true }],
    order: [['fecha_hora', 'ASC'], ['id', 'ASC']],
  });
  let enviadas = 0;
  // De a una: cada conversión usa dos conexiones de la BD.
  for (const r of candidatas) {
    if ((r.envio_cocina ?? cfg.envio_cocina) !== 'antes') continue;
    if (new Date(r.fecha_hora).getTime() - cfg.minutos_antes * MIN > ahora.getTime()) continue;
    // Pasado su horario ya no sale sola (la de anoche no va a cocina).
    if (!reservasService.enHorario(r, ahora)) continue;
    try {
      const { pedido } = await convertirEnPedido(r.id, r.usuario_id);
      if (pedido) enviadas += 1;
    } catch (err) {
      if (err.status === 409) console.warn(`[reservas] Reserva #${r.id} sigue sin salir a cocina: ${err.message}`);
      else console.error(`[reservas] Error mandando a cocina la reserva #${r.id}:`, err.message);
    }
  }
  return enviadas;
}

async function _avisarNoLlego(ahora, cfg) {
  const vencidas = await Reserva.findAll({
    where: {
      estado: 'pendiente', aviso_no_vino_en: null,
      fecha_hora: { [Op.between]: [new Date(ahora.getTime() - VENTANA), new Date(ahora.getTime() - cfg.tolerancia_no_vino * MIN)] },
    },
    order: [['fecha_hora', 'ASC'], ['id', 'ASC']],
  });
  let avisadas = 0;
  for (const r of vencidas) {
    // Con su pedido en cocina (no cancelado) el cliente ya está siendo atendido.
    if (r.pedido_id && (await Pedido.findByPk(r.pedido_id, { attributes: ['estado'] }))?.estado !== 'cancelado') continue;
    // Se marca primero y solo quien lo logra avisa: una vez por reserva.
    const [marcadas] = await Reserva.update({ aviso_no_vino_en: ahora }, { where: { id: r.id, estado: 'pendiente', aviso_no_vino_en: null } });
    if (!marcadas) continue;
    avisadas += 1;
    push.avisar(() => push.aPermiso({ modulo: 'ventas', accion: 'crear', sucursal_id: r.sucursal_id }, {
      titulo: 'Reserva sin llegar',
      cuerpo: `${r.nombre_cliente} no llegó (reserva de las ${_horaLocal(r.fecha_hora)})`,
      url: '/vender/reservas',
      etiqueta: `reserva-${r.id}`,
    }));
  }
  return avisadas;
}

async function procesarReservas(ahora = new Date()) {
  const cfg = await reservasService.configReservas();
  const enviadas = await _enviar(ahora, cfg);
  const avisadas = await _avisarNoLlego(ahora, cfg);
  return { enviadas, avisadas };
}

module.exports = { procesarReservas };
