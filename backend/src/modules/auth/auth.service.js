const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Usuario, Rol, Permiso, Sucursal } = require('../../models');

// Incrementar sesion_version acá (el único lugar que de verdad emite un
// par de tokens funcional) invalida, en el próximo request, cualquier token
// emitido antes para este usuario en otro dispositivo — así solo queda
// activa la sesión más reciente. Sin esto, los pasos intermedios del login
// (ej. pre_token de selección de sucursal) también la bumpearían sin haber
// completado un login real.
async function emitirSesion(usuario, sucursalId, sucursalNombre) {
  await usuario.increment('sesion_version');
  await usuario.reload();

  const payload = { id: usuario.id, sucursal_id: sucursalId, sesion_version: usuario.sesion_version };
  const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN });
  const refresh_token = jwt.sign(payload, process.env.JWT_REFRESH_SECRET, { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN });

  return {
    token,
    refresh_token,
    usuario: {
      id: usuario.id,
      nombre: usuario.nombre,
      email: usuario.email,
      avatar: usuario.avatar || null,
      rol: usuario.rol.nombre,
      permisos: usuario.rol.permisos.map(p => `${p.modulo}.${p.accion}`),
      debe_cambiar_contrasena: !!usuario.debe_cambiar_contrasena,
      sucursal_activa: { id: sucursalId, nombre: sucursalNombre },
    },
  };
}

async function buscarUsuarioCompleto(where) {
  return Usuario.findOne({
    where,
    include: [
      { model: Rol, as: 'rol', include: [{ model: Permiso, as: 'permisos' }] },
      { model: Sucursal, as: 'sucursales', where: { activo: 1 }, required: false },
    ],
  });
}

async function login(email, contrasena) {
  const usuario = await buscarUsuarioCompleto({ email, activo: 1 });
  if (!usuario) throw Object.assign(new Error('Credenciales inválidas'), { status: 401 });

  const valida = await bcrypt.compare(contrasena, usuario.contrasena);
  if (!valida) throw Object.assign(new Error('Credenciales inválidas'), { status: 401 });

  let sucursalesDisponibles;
  if (usuario.acceso_todas_sucursales) {
    const todas = await Sucursal.findAll({ where: { activo: 1 }, order: [['nombre', 'ASC']] });
    sucursalesDisponibles = [
      { id: null, nombre: 'Todas las sucursales' },
      ...todas.map(s => ({ id: s.id, nombre: s.nombre })),
    ];
  } else {
    sucursalesDisponibles = (usuario.sucursales || []).map(s => ({ id: s.id, nombre: s.nombre }));
  }

  if (sucursalesDisponibles.length === 0) {
    throw Object.assign(new Error('El usuario no tiene sucursales asignadas'), { status: 403 });
  }

  if (sucursalesDisponibles.length === 1) {
    return await emitirSesion(usuario, sucursalesDisponibles[0].id, sucursalesDisponibles[0].nombre);
  }

  const pre_token = jwt.sign({ id: usuario.id, tipo: 'pre_login' }, process.env.JWT_SECRET, { expiresIn: '5m' });
  return { requiere_sucursal: true, pre_token, sucursales: sucursalesDisponibles };
}

async function loginConSucursal(pre_token, sucursal_id) {
  let payload;
  try {
    payload = jwt.verify(pre_token, process.env.JWT_SECRET);
  } catch {
    throw Object.assign(new Error('Sesión de login expirada, vuelve a iniciar sesión'), { status: 401 });
  }
  if (payload.tipo !== 'pre_login') {
    throw Object.assign(new Error('Token inválido'), { status: 401 });
  }

  const usuario = await buscarUsuarioCompleto({ id: payload.id, activo: 1 });
  if (!usuario) throw Object.assign(new Error('Usuario no encontrado'), { status: 401 });

  const idNormalizado = (sucursal_id === undefined || sucursal_id === '') ? null : sucursal_id;
  let sucursalNombre;

  if (idNormalizado === null) {
    if (!usuario.acceso_todas_sucursales) {
      throw Object.assign(new Error('No tienes acceso a todas las sucursales'), { status: 403 });
    }
    sucursalNombre = 'Todas las sucursales';
  } else if (usuario.acceso_todas_sucursales) {
    const sucursal = await Sucursal.findOne({ where: { id: idNormalizado, activo: 1 } });
    if (!sucursal) throw Object.assign(new Error('No tienes acceso a esa sucursal'), { status: 403 });
    sucursalNombre = sucursal.nombre;
  } else {
    const asignada = (usuario.sucursales || []).find(s => s.id === Number(idNormalizado));
    if (!asignada) throw Object.assign(new Error('No tienes acceso a esa sucursal'), { status: 403 });
    sucursalNombre = asignada.nombre;
  }

  return await emitirSesion(usuario, idNormalizado, sucursalNombre);
}

async function refresh(refresh_token) {
  let payload;
  try {
    payload = jwt.verify(refresh_token, process.env.JWT_REFRESH_SECRET);
  } catch {
    throw Object.assign(new Error('Refresh token inválido'), { status: 401 });
  }
  const usuario = await Usuario.findOne({ where: { id: payload.id, activo: 1 } });
  if (!usuario) throw Object.assign(new Error('Usuario inactivo o no existe'), { status: 401 });
  // Mismo chequeo de sesión única que el middleware de auth: un refresh
  // token emitido antes de un login posterior (en otro dispositivo) no debe
  // poder renovar nada.
  if ((payload.sesion_version ?? 0) !== usuario.sesion_version) {
    throw Object.assign(new Error('Sesión cerrada: iniciaste sesión en otro dispositivo'), { status: 401, codigo: 'SESION_REEMPLAZADA' });
  }
  const token = jwt.sign(
    { id: payload.id, sucursal_id: payload.sucursal_id ?? null, sesion_version: usuario.sesion_version },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN }
  );
  return { token };
}

module.exports = { login, loginConSucursal, refresh };
