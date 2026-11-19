const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');
const { sequelize, Usuario, Rol, Permiso, Sucursal } = require('../../models');

const MAX_INTENTOS_PIN = 5;
const MSG_DISPOSITIVO = 'Este aparato ya no está habilitado: entra con tu correo';
const MSG_OTRA_SUCURSAL = 'Ese usuario no es de esta sucursal';
const MSG_PIN_BLOQUEADO = 'PIN bloqueado: entra con tu correo';

// Con `nuevaVersion` (login con correo) se incrementa sesion_version acá (el
// único lugar que de verdad emite un par de tokens funcional): eso invalida,
// en el próximo request, cualquier token emitido antes para este usuario en
// otro dispositivo — así solo queda activa la sesión más reciente. Sin esto,
// los pasos intermedios del login (ej. pre_token de selección de sucursal)
// también la bumpearían sin haber completado un login real.
// Entrar con PIN usa `nuevaVersion: false`: firma con la versión actual para
// no cerrar la sesión del mismo usuario en su otro aparato.
async function emitirSesion(usuario, sucursalId, sucursalNombre, { nuevaVersion = true } = {}) {
  if (nuevaVersion) {
    await usuario.increment('sesion_version');
    await usuario.reload();
  }

  const payload = { id: usuario.id, sucursal_id: sucursalId, sesion_version: usuario.sesion_version };
  const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN });
  const refresh_token = jwt.sign(payload, process.env.JWT_REFRESH_SECRET, { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN });

  const sesion = {
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
      tiene_pin: !!usuario.pin,
      sucursal_activa: { id: sucursalId, nombre: sucursalNombre },
    },
  };
  // Aparato habilitado: solo con una sucursal concreta (no "Todas las
  // sucursales"). Sin id de usuario: no sirve como token de acceso.
  if (sucursalId !== null && sucursalId !== undefined) {
    sesion.dispositivo_token = jwt.sign(
      { tipo: 'dispositivo', sucursal_id: Number(sucursalId) },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );
  }
  return sesion;
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

  // Entrar con correo y contraseña reinicia el conteo y el bloqueo del PIN.
  if (usuario.pin_intentos || usuario.pin_bloqueado) {
    await usuario.update({ pin_intentos: 0, pin_bloqueado: 0 });
  }

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
  // Un refresh token de verdad no trae `tipo` (pre_login, dispositivo, cliente).
  if (payload.tipo !== undefined || !payload.id) {
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

// Sucursal del aparato habilitado; cualquier problema con el token ⇒ 401.
async function sucursalDelDispositivo(dispositivo_token) {
  let payload;
  try {
    payload = jwt.verify(String(dispositivo_token || ''), process.env.JWT_SECRET);
  } catch {
    throw Object.assign(new Error(MSG_DISPOSITIVO), { status: 401 });
  }
  if (payload.tipo !== 'dispositivo' || !Number.isInteger(payload.sucursal_id)) {
    throw Object.assign(new Error(MSG_DISPOSITIVO), { status: 401 });
  }
  const sucursal = await Sucursal.findOne({ where: { id: payload.sucursal_id, activo: 1 } });
  if (!sucursal) throw Object.assign(new Error(MSG_DISPOSITIVO), { status: 401 });
  return sucursal;
}

// Personal que puede entrar con PIN en este aparato: activo, con PIN, sin
// bloqueo, y asignado a la sucursal o con acceso a todas.
async function usuariosConPin(dispositivo_token) {
  const sucursal = await sucursalDelDispositivo(dispositivo_token);
  const asignados = await sucursal.getUsuarios({ attributes: ['id'], joinTableAttributes: [] });
  const usuarios = await Usuario.findAll({
    attributes: ['id', 'nombre', 'avatar'],
    where: {
      activo: 1,
      pin: { [Op.ne]: null },
      pin_bloqueado: 0,
      [Op.or]: [
        { acceso_todas_sucursales: 1 },
        { id: asignados.map(u => u.id) },
      ],
    },
    order: [['nombre', 'ASC']],
  });
  return usuarios.map(u => ({ id: u.id, nombre: u.nombre, avatar: u.avatar || null }));
}

// Id de usuario tal como lo manda el aparato: número entero positivo o su
// texto decimal sin ceros a la izquierda. "05", "5.0", "0x5" o "5e0" no
// valen (si no, cada forma contaría aparte en el limitador por usuario).
function usuarioIdCanonico(valor) {
  if (typeof valor === 'number') return Number.isSafeInteger(valor) && valor > 0 ? valor : null;
  if (typeof valor === 'string' && /^[1-9]\d{0,15}$/.test(valor)) {
    const n = Number(valor);
    return Number.isSafeInteger(n) ? n : null;
  }
  return null;
}

// Suma un intento de PIN con la fila bloqueada y devuelve el número de este
// intento (1..5), o null si ya está bloqueado o sin intentos.
async function reservarIntentoPin(id) {
  return sequelize.transaction(async (transaction) => {
    const u = await Usuario.findByPk(id, {
      attributes: ['id', 'pin_intentos', 'pin_bloqueado'],
      lock: transaction.LOCK.UPDATE,
      transaction,
    });
    if (!u || u.pin_bloqueado || u.pin_intentos >= MAX_INTENTOS_PIN) return null;
    const intento = u.pin_intentos + 1;
    await Usuario.update({ pin_intentos: intento }, { where: { id }, transaction });
    return intento;
  });
}

async function entrarConPin(dispositivo_token, usuario_id, pin) {
  const sucursal = await sucursalDelDispositivo(dispositivo_token);

  if (typeof pin !== 'string' || !/^\d{4}$/.test(pin)) {
    throw Object.assign(new Error('El PIN son 4 números'), { status: 400 });
  }
  const id = usuarioIdCanonico(usuario_id);
  if (id === null) throw Object.assign(new Error('Usuario no válido'), { status: 400 });

  // Inactivo o inexistente se responde igual que "de otra sucursal".
  const usuario = await buscarUsuarioCompleto({ id, activo: 1 });
  const esDeLaSucursal = usuario && (usuario.acceso_todas_sucursales
    || (usuario.sucursales || []).some(s => s.id === sucursal.id));
  if (!esDeLaSucursal) throw Object.assign(new Error(MSG_OTRA_SUCURSAL), { status: 403 });

  if (usuario.pin_bloqueado) throw Object.assign(new Error(MSG_PIN_BLOQUEADO), { status: 423 });
  if (!usuario.pin) throw Object.assign(new Error('Ese usuario no tiene PIN: entra con tu correo'), { status: 400 });

  // Se reserva el intento ANTES de comparar (bcrypt es lento): así una
  // ráfaga de pedidos en paralelo no puede probar más de 5 PIN. La fila se
  // bloquea solo lo que dura leer y sumar, no durante el bcrypt.
  const intento = await reservarIntentoPin(id);
  if (intento === null) throw Object.assign(new Error(MSG_PIN_BLOQUEADO), { status: 423 });

  const valido = await bcrypt.compare(pin, usuario.pin);
  if (!valido) {
    if (intento >= MAX_INTENTOS_PIN) {
      await Usuario.update({ pin_bloqueado: 1 }, { where: { id } });
      throw Object.assign(new Error(MSG_PIN_BLOQUEADO), { status: 423 });
    }
    throw Object.assign(new Error('PIN incorrecto'), {
      status: 401,
      intentos_restantes: MAX_INTENTOS_PIN - intento,
    });
  }

  // PIN bien: se reinicia el conteo solo si otro pedido no lo bloqueó entretanto.
  const [cambiadas] = await Usuario.update({ pin_intentos: 0 }, { where: { id, pin_bloqueado: 0 } });
  if (cambiadas === 0) throw Object.assign(new Error(MSG_PIN_BLOQUEADO), { status: 423 });
  usuario.pin_intentos = 0;
  return await emitirSesion(usuario, sucursal.id, sucursal.nombre, { nuevaVersion: false });
}

module.exports = { login, loginConSucursal, refresh, usuariosConPin, entrarConPin, usuarioIdCanonico };
