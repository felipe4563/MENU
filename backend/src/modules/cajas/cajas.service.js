const { Caja, Sucursal } = require('../../models');

async function listar({ sucursal_id } = {}) {
  const where = {};
  if (sucursal_id) where.sucursal_id = sucursal_id;
  return Caja.findAll({
    where,
    include: [{ model: Sucursal, as: 'sucursal', attributes: ['id', 'nombre'] }],
    order: [['nombre', 'ASC']],
  });
}

// Sin autenticación — usado por el instalador del agente de impresión para
// elegir a qué caja pertenece esa PC, antes de tener credenciales.
async function listarPublico(sucursal_id) {
  if (!sucursal_id) return [];
  return Caja.findAll({
    where: { sucursal_id, activo: 1 },
    attributes: ['id', 'nombre'],
    order: [['nombre', 'ASC']],
  });
}

function _validarModoImpresion(modo_impresion) {
  if (modo_impresion !== undefined && !['fisica', 'bluetooth'].includes(modo_impresion)) {
    throw Object.assign(new Error("modo_impresion debe ser 'fisica' o 'bluetooth'"), { status: 400 });
  }
}

function _validarAnchoPapel(ancho_papel_bluetooth) {
  if (ancho_papel_bluetooth !== undefined && !['58mm', '80mm'].includes(ancho_papel_bluetooth)) {
    throw Object.assign(new Error("ancho_papel_bluetooth debe ser '58mm' o '80mm'"), { status: 400 });
  }
}

function _validarConexion(conexion_bluetooth) {
  if (conexion_bluetooth !== undefined && !['directo', 'rawbt'].includes(conexion_bluetooth)) {
    throw Object.assign(new Error("conexion_bluetooth debe ser 'directo' o 'rawbt'"), { status: 400 });
  }
}

async function crear({ sucursal_id, nombre, modo_impresion = 'fisica', ancho_papel_bluetooth = '80mm', conexion_bluetooth = 'directo', imprimir_logo = 1, imprimir_ticket_cliente = 1, activo = 1 }) {
  if (!sucursal_id) throw Object.assign(new Error('sucursal_id es requerido'), { status: 400 });
  if (!nombre || !nombre.trim()) throw Object.assign(new Error('El nombre es requerido'), { status: 400 });
  _validarModoImpresion(modo_impresion);
  _validarAnchoPapel(ancho_papel_bluetooth);
  _validarConexion(conexion_bluetooth);
  const sucursal = await Sucursal.findByPk(sucursal_id);
  if (!sucursal) throw Object.assign(new Error('Sucursal no encontrada'), { status: 404 });
  return Caja.create({ sucursal_id, nombre: nombre.trim(), modo_impresion, ancho_papel_bluetooth, conexion_bluetooth, imprimir_logo: imprimir_logo ? 1 : 0, imprimir_ticket_cliente, activo });
}

async function actualizar(id, { nombre, modo_impresion, ancho_papel_bluetooth, conexion_bluetooth, imprimir_logo, imprimir_ticket_cliente, activo }) {
  const caja = await Caja.findByPk(id);
  if (!caja) throw Object.assign(new Error('Caja no encontrada'), { status: 404 });
  _validarModoImpresion(modo_impresion);
  _validarAnchoPapel(ancho_papel_bluetooth);
  _validarConexion(conexion_bluetooth);
  const datos = {};
  if (nombre !== undefined) datos.nombre = nombre;
  if (modo_impresion !== undefined) datos.modo_impresion = modo_impresion;
  if (ancho_papel_bluetooth !== undefined) datos.ancho_papel_bluetooth = ancho_papel_bluetooth;
  if (conexion_bluetooth !== undefined) datos.conexion_bluetooth = conexion_bluetooth;
  if (imprimir_logo !== undefined) datos.imprimir_logo = imprimir_logo ? 1 : 0;
  if (imprimir_ticket_cliente !== undefined) datos.imprimir_ticket_cliente = imprimir_ticket_cliente;
  if (activo !== undefined) datos.activo = activo;
  await caja.update(datos);
  return caja;
}

async function eliminar(id) {
  const caja = await Caja.findByPk(id);
  if (!caja) throw Object.assign(new Error('Caja no encontrada'), { status: 404 });
  const sesiones = await caja.countSesiones();
  if (sesiones > 0) throw Object.assign(new Error('La caja tiene sesiones asociadas'), { status: 409 });
  await caja.destroy();
}

module.exports = { listar, listarPublico, crear, actualizar, eliminar };
