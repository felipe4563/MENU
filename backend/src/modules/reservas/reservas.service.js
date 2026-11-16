// Reservas de mesa. Las fechas se manejan en hora de Bolivia (-04:00), como
// el resto del sistema: "2026-11-20T20:00" sin zona se toma como 20:00 local.
const { Op } = require('sequelize');
const { Reserva, Mesa, Area, Usuario } = require('../../models');
const { emitir } = require('../../socket');

const ZONA = '-04:00';
const ACTIVAS = ['pendiente', 'llego'];
const error = (mensaje, status = 400) => Object.assign(new Error(mensaje), { status });

const INCLUDE = [
  { model: Mesa, as: 'mesa', attributes: ['id', 'nombre', 'asientos'] },
  { model: Usuario, as: 'usuario', attributes: ['id', 'nombre'] },
];

function _fecha(valor) {
  if (!valor) throw error('Indica el día y la hora de la reserva');
  const texto = String(valor);
  const conZona = /([zZ]|[+-]\d{2}:\d{2})$/.test(texto) ? texto : `${texto.length === 16 ? `${texto}:00` : texto}${ZONA}`;
  const f = new Date(conZona);
  if (Number.isNaN(f.getTime())) throw error('La fecha de la reserva no es válida');
  return f;
}

const _horaLocal = (f) => new Date(f.getTime() - 4 * 3600000).toISOString().slice(11, 16);

function _datos(entrada, previo = {}) {
  const v = { ...previo, ...entrada };
  const nombre = String(v.nombre_cliente ?? '').trim();
  if (!nombre) throw error('Escribe a nombre de quién es la reserva');
  if (nombre.length > 100) throw error('El nombre es muy largo');
  const personas = Number(v.personas);
  if (!Number.isInteger(personas) || personas < 1 || personas > 100) throw error('Las personas deben ser entre 1 y 100');
  const duracion = v.duracion_min == null || v.duracion_min === '' ? 120 : Number(v.duracion_min);
  if (!Number.isInteger(duracion) || duracion < 15 || duracion > 600) throw error('La duración debe ser entre 15 minutos y 10 horas');
  const telefono = v.telefono ? String(v.telefono).trim().slice(0, 30) : null;
  const notas = v.notas ? String(v.notas).trim() : null;
  if (notas && notas.length > 255) throw error('La nota no puede pasar de 255 letras');
  return {
    nombre_cliente: nombre,
    telefono: telefono || null,
    personas,
    duracion_min: duracion,
    notas: notas || null,
    fecha_hora: _fecha(v.fecha_hora),
    mesa_id: v.mesa_id ? Number(v.mesa_id) : null,
  };
}

async function _validarMesa(mesa_id, sucursal_id) {
  if (!mesa_id) return;
  const mesa = await Mesa.findByPk(mesa_id, { include: [{ model: Area, as: 'area', attributes: ['sucursal_id'] }] });
  if (!mesa || mesa.area?.sucursal_id !== sucursal_id) throw error('Esa mesa no es de esta sucursal', 404);
}

// Otra reserva activa de la misma mesa cuyo horario se cruza.
async function _verificarCruce({ mesa_id, fecha_hora, duracion_min }, sucursal_id, excluir_id = null) {
  if (!mesa_id) return;
  const inicio = fecha_hora.getTime();
  const fin = inicio + duracion_min * 60000;
  const cercanas = await Reserva.findAll({
    where: {
      sucursal_id, mesa_id, estado: ACTIVAS,
      ...(excluir_id ? { id: { [Op.ne]: excluir_id } } : {}),
      fecha_hora: { [Op.between]: [new Date(inicio - 600 * 60000), new Date(fin)] },
    },
  });
  const cruce = cercanas.find((r) => {
    const a = new Date(r.fecha_hora).getTime();
    return a < fin && inicio < a + r.duracion_min * 60000;
  });
  if (cruce) {
    const desde = new Date(cruce.fecha_hora);
    const hasta = new Date(desde.getTime() + cruce.duracion_min * 60000);
    throw error(`Esa mesa ya está reservada de ${_horaLocal(desde)} a ${_horaLocal(hasta)} (${cruce.nombre_cliente})`, 409);
  }
}

function _verificarAlcance(reserva, alcance) {
  if (!alcance.acceso_todas && reserva.sucursal_id !== alcance.sucursal_id) throw error('Reserva no encontrada', 404);
}

// Reservas de un día (por defecto hoy), más temprano primero.
async function listar({ fecha } = {}, alcance) {
  const dia = /^\d{4}-\d{2}-\d{2}$/.test(fecha || '') ? fecha : new Date(Date.now() - 4 * 3600000).toISOString().slice(0, 10);
  const where = {
    fecha_hora: { [Op.between]: [new Date(`${dia}T00:00:00${ZONA}`), new Date(`${dia}T23:59:59${ZONA}`)] },
  };
  if (!alcance.acceso_todas) where.sucursal_id = alcance.sucursal_id;
  return Reserva.findAll({ where, include: INCLUDE, order: [['fecha_hora', 'ASC'], ['id', 'ASC']] });
}

async function crear(entrada, usuario_id, sucursal_id) {
  const datos = _datos(entrada);
  if (datos.fecha_hora.getTime() < Date.now() - 30 * 60000) throw error('Esa hora ya pasó');
  await _validarMesa(datos.mesa_id, sucursal_id);
  await _verificarCruce(datos, sucursal_id);
  const r = await Reserva.create({ ...datos, sucursal_id, usuario_id });
  emitir('restaurante:actualizar', { tipo: 'reserva' }, sucursal_id);
  return Reserva.findByPk(r.id, { include: INCLUDE });
}

async function actualizar(id, entrada, alcance) {
  const r = await Reserva.findByPk(id);
  if (!r) throw error('Reserva no encontrada', 404);
  _verificarAlcance(r, alcance);
  if (!ACTIVAS.includes(r.estado)) throw error('Esta reserva ya está cerrada', 409);
  const datos = _datos(entrada, r.get({ plain: true }));
  await _validarMesa(datos.mesa_id, r.sucursal_id);
  await _verificarCruce(datos, r.sucursal_id, r.id);
  await r.update(datos);
  emitir('restaurante:actualizar', { tipo: 'reserva' }, r.sucursal_id);
  return Reserva.findByPk(r.id, { include: INCLUDE });
}

async function cambiarEstado(id, estado, alcance) {
  if (!Reserva.ESTADOS.includes(estado)) throw error('Estado no válido');
  const r = await Reserva.findByPk(id);
  if (!r) throw error('Reserva no encontrada', 404);
  _verificarAlcance(r, alcance);
  // Volver a "pendiente" una cancelada vuelve a ocupar su horario.
  if (estado === 'pendiente' && !ACTIVAS.includes(r.estado)) {
    await _verificarCruce({ mesa_id: r.mesa_id, fecha_hora: new Date(r.fecha_hora), duracion_min: r.duracion_min }, r.sucursal_id, r.id);
  }
  await r.update({ estado });
  emitir('restaurante:actualizar', { tipo: 'reserva' }, r.sucursal_id);
  return Reserva.findByPk(r.id, { include: INCLUDE });
}

module.exports = { listar, crear, actualizar, cambiarEstado };
