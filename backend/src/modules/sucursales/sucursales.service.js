const { Sucursal } = require('../../models');

async function listar() {
  return Sucursal.findAll({ order: [['nombre', 'ASC']] });
}

// Sin autenticación — usado por el instalador del agente de impresión para
// elegir la sucursal antes de tener credenciales. Solo id + nombre.
async function listarPublico() {
  return Sucursal.findAll({
    where: { activo: 1 },
    attributes: ['id', 'nombre'],
    order: [['nombre', 'ASC']],
  });
}

async function crear({ nombre, direccion, telefono, latitud, longitud, radio_geocerca_metros, modo_cierre_caja, tolerancia_cierre_caja, activo = 1 }) {
  if (!nombre || !nombre.trim()) {
    throw Object.assign(new Error('El nombre es requerido'), { status: 400 });
  }
  const datos = { nombre: nombre.trim(), direccion, telefono, latitud: latitud || null, longitud: longitud || null, activo };
  if (radio_geocerca_metros !== undefined && radio_geocerca_metros !== null) datos.radio_geocerca_metros = radio_geocerca_metros;
  if (modo_cierre_caja !== undefined && modo_cierre_caja !== null) datos.modo_cierre_caja = modo_cierre_caja;
  if (tolerancia_cierre_caja !== undefined && tolerancia_cierre_caja !== null) datos.tolerancia_cierre_caja = tolerancia_cierre_caja;
  return Sucursal.create(datos);
}

async function actualizar(id, { nombre, direccion, telefono, latitud, longitud, radio_geocerca_metros, modo_cierre_caja, tolerancia_cierre_caja, activo }) {
  const sucursal = await Sucursal.findByPk(id);
  if (!sucursal) throw Object.assign(new Error('Sucursal no encontrada'), { status: 404 });
  const datos = {};
  if (nombre !== undefined) datos.nombre = nombre;
  if (direccion !== undefined) datos.direccion = direccion;
  if (telefono !== undefined) datos.telefono = telefono;
  if (latitud !== undefined) datos.latitud = latitud || null;
  if (longitud !== undefined) datos.longitud = longitud || null;
  if (radio_geocerca_metros !== undefined && radio_geocerca_metros !== null) datos.radio_geocerca_metros = radio_geocerca_metros;
  if (modo_cierre_caja !== undefined && modo_cierre_caja !== null) datos.modo_cierre_caja = modo_cierre_caja;
  if (tolerancia_cierre_caja !== undefined && tolerancia_cierre_caja !== null) datos.tolerancia_cierre_caja = tolerancia_cierre_caja;
  if (activo !== undefined) datos.activo = activo;
  await sucursal.update(datos);
  return sucursal;
}

async function eliminar(id) {
  const sucursal = await Sucursal.findByPk(id);
  if (!sucursal) throw Object.assign(new Error('Sucursal no encontrada'), { status: 404 });
  const usuarios = await sucursal.countUsuarios();
  if (usuarios > 0) throw Object.assign(new Error('La sucursal tiene usuarios asignados'), { status: 409 });
  await sucursal.destroy();
}

module.exports = { listar, listarPublico, crear, actualizar, eliminar };
