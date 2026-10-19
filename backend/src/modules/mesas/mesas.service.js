const crypto = require('crypto');
const { Area, Mesa, MesaSesion, sequelize } = require('../../models');

function _generarCodigoQr() {
  return crypto.randomBytes(8).toString('hex');
}

// --- Áreas ---

function _filtroSucursal({ sucursal_id, acceso_todas }) {
  return acceso_todas ? {} : { sucursal_id };
}

// Orden natural ("MESA 2" antes que "MESA 10") en vez del alfabético que
// hace ORDER BY nombre en SQL, donde "MESA 10" queda antes que "MESA 2".
function _ordenNatural(a, b) {
  return a.nombre.localeCompare(b.nombre, 'es', { numeric: true, sensitivity: 'base' });
}

async function listarAreas(alcance) {
  const areas = await Area.findAll({ where: _filtroSucursal(alcance), include: [{ model: Mesa, as: 'mesas' }] });
  areas.sort(_ordenNatural);
  areas.forEach((area) => area.mesas.sort(_ordenNatural));
  return areas;
}

async function crearArea({ nombre }, sucursal_id) {
  return Area.create({ nombre, sucursal_id });
}

async function actualizarArea(id, { nombre }, alcance) {
  const area = await Area.findByPk(id);
  if (!area) throw Object.assign(new Error('Área no encontrada'), { status: 404 });
  if (!alcance.acceso_todas && area.sucursal_id !== alcance.sucursal_id) {
    throw Object.assign(new Error('Área no encontrada'), { status: 404 });
  }
  await area.update({ nombre });
  return area;
}

async function eliminarArea(id, alcance) {
  const area = await Area.findByPk(id);
  if (!area) throw Object.assign(new Error('Área no encontrada'), { status: 404 });
  if (!alcance.acceso_todas && area.sucursal_id !== alcance.sucursal_id) {
    throw Object.assign(new Error('Área no encontrada'), { status: 404 });
  }
  const mesas = await Mesa.count({ where: { area_id: id } });
  if (mesas > 0) throw Object.assign(new Error('El área tiene mesas asignadas'), { status: 409 });
  await area.destroy();
}

// --- Mesas ---

// Incluir la sesión activa (si hay) en la respuesta de mesas es lo que le
// permite al staff ver en el propio mapa de mesas si el autoservicio ya está
// habilitado ahí, sin tener que consultarlo aparte.
const _includeSesionActiva = { model: MesaSesion, as: 'sesiones', where: { cerrada_en: null }, required: false, limit: 1 };

async function listarMesas(area_id, alcance) {
  const where = area_id ? { area_id } : {};
  const mesas = await Mesa.findAll({
    where,
    include: [
      { model: Area, as: 'area', attributes: ['id', 'nombre', 'sucursal_id'], where: _filtroSucursal(alcance) },
      _includeSesionActiva,
    ],
  });
  mesas.sort(_ordenNatural);
  return mesas;
}

async function obtenerMesa(id, alcance) {
  const mesa = await Mesa.findByPk(id, {
    include: [
      { model: Area, as: 'area', attributes: ['id', 'nombre', 'sucursal_id'] },
      _includeSesionActiva,
    ],
  });
  if (!mesa) throw Object.assign(new Error('Mesa no encontrada'), { status: 404 });
  if (alcance && !alcance.acceso_todas && mesa.area.sucursal_id !== alcance.sucursal_id) {
    throw Object.assign(new Error('Mesa no encontrada'), { status: 404 });
  }
  return mesa;
}

async function crearMesa({ area_id, nombre, asientos = 4 }, sucursal_id) {
  const area = await Area.findByPk(area_id);
  if (!area) throw Object.assign(new Error('Área no encontrada'), { status: 404 });
  if (area.sucursal_id !== sucursal_id) {
    throw Object.assign(new Error('El área no pertenece a tu sucursal'), { status: 404 });
  }
  return Mesa.create({ area_id, nombre, asientos, codigo_qr: _generarCodigoQr() });
}

async function actualizarMesa(id, datos, alcance) {
  const mesa = await obtenerMesa(id, alcance);
  await mesa.update(datos);

  // La edición manual de mesas (Configuración → Mesas) no tocaba
  // mesa_sesiones: si el staff ponía la mesa en 'disponible' para "limpiar" el
  // mapa mientras seguía abierta una sesión de autoservicio, el QR fijo seguía
  // sirviendo el menú y aceptando pedidos pagados de una mesa que nadie está
  // mirando — exactamente el caso del QR fotografiado/usado desde afuera que
  // el gate de sesión existe para evitar. Cualquier estado distinto de
  // 'ocupada' cierra la sesión activa.
  if (datos && datos.estado !== undefined && datos.estado !== 'ocupada') {
    await cerrarSesion(id);
  }

  return obtenerMesa(id, alcance);
}

async function eliminarMesa(id, alcance) {
  const mesa = await obtenerMesa(id, alcance);
  if (mesa.estado === 'ocupada') throw Object.assign(new Error('No se puede eliminar una mesa ocupada'), { status: 409 });
  await mesa.destroy();
}

// Genera un codigo_qr nuevo (mesa sin código, o código filtrado que hay que
// invalidar) y cierra cualquier sesión de autoservicio activa: si el motivo
// es un código filtrado, dejar viva una sesión abierta con el código viejo
// anularía el propósito de regenerarlo.
async function regenerarCodigoQr(id, alcance) {
  const mesa = await obtenerMesa(id, alcance);
  await mesa.update({ codigo_qr: _generarCodigoQr() });
  await cerrarSesion(id);
  return obtenerMesa(id, alcance);
}

// --- Sesión de mesa (autoservicio) ---

async function obtenerSesionActiva(mesa_id) {
  return MesaSesion.findOne({ where: { mesa_id, cerrada_en: null } });
}

async function abrirSesion(mesa_id, sucursal_id, abierta_por = 'staff', transaction) {
  if (transaction) {
    const existente = await obtenerSesionActiva(mesa_id);
    if (existente) return existente;
    return MesaSesion.create({ mesa_id, sucursal_id, abierta_por, cerrada_en: null }, { transaction });
  }
  // Sin transacción propia (ej. llamado directo desde el botón "Habilitar
  // autoservicio"): se abre una interna con lock de fila sobre la mesa, así
  // dos toques casi simultáneos al mismo botón no crean dos sesiones activas
  // — mismo problema y misma solución que crear() en ventas.service.js.
  return sequelize.transaction(async (t) => {
    await Mesa.findByPk(mesa_id, { transaction: t, lock: t.LOCK.UPDATE });
    const existente = await obtenerSesionActiva(mesa_id);
    if (existente) return existente;
    return MesaSesion.create({ mesa_id, sucursal_id, abierta_por, cerrada_en: null }, { transaction: t });
  });
}

async function cerrarSesion(mesa_id, transaction) {
  await MesaSesion.update(
    { cerrada_en: new Date() },
    { where: { mesa_id, cerrada_en: null }, transaction }
  );
}

async function obtenerMesaPorCodigoQr(codigo_qr) {
  const mesa = await Mesa.findOne({
    where: { codigo_qr },
    include: [{ model: Area, as: 'area', attributes: ['id', 'nombre', 'sucursal_id'] }],
  });
  if (!mesa) throw Object.assign(new Error('Mesa no encontrada'), { status: 404 });
  return mesa;
}

module.exports = {
  listarAreas, crearArea, actualizarArea, eliminarArea,
  listarMesas, obtenerMesa, crearMesa, actualizarMesa, eliminarMesa, regenerarCodigoQr,
  obtenerSesionActiva, abrirSesion, cerrarSesion, obtenerMesaPorCodigoQr,
};
