// PIN de pagos: protege la pantalla "Cobro con QR" aparte de la contraseña de
// entrada (que en un restaurante suele conocerla más de una persona).
// - Quien crea el PIN queda como titular de los pagos: desde ahí es la única
//   persona que abre esta pantalla, aunque otros tengan el permiso.
// - El PIN (6 números) se guarda como hash en `configuraciones`.
// - Abrir la pantalla con el PIN da un pase de 5 minutos para ver y cambiar.
// - 5 PIN fallados bloquean 15 minutos. Si se olvida, se borra desde el
//   servidor: `npm run pin-qr:borrar` (borra titular y PIN; el próximo que
//   entre con el permiso los crea de nuevo).
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Configuracion, Usuario } = require('../../models');

const CLAVE_PIN = 'qr_pin';
const CLAVE_INTENTOS = 'qr_pin_intentos';
const CLAVE_BLOQUEO = 'qr_pin_bloqueo';
const CLAVE_TITULAR = 'qr_pin_titular';
const MAX_INTENTOS = 5;
const MIN_BLOQUEO = 15;
const MIN_PASE = 5;

const error = (status, mensaje, codigo) => Object.assign(new Error(mensaje), { status, codigo });

// El pase no puede servir como token de sesión: va firmado con otra llave.
const secretoPase = () => `${process.env.JWT_SECRET}:cobro_qr`;

async function _leer(clave) {
  const fila = await Configuracion.findOne({ where: { clave } });
  return fila?.valor || null;
}
const _escribir = (clave, valor) => Configuracion.upsert({ clave, valor });

async function hayPin() {
  return Boolean(await _leer(CLAVE_PIN));
}

async function _bloqueadoHasta() {
  const v = await _leer(CLAVE_BLOQUEO);
  const hasta = v ? new Date(v) : null;
  return hasta && hasta > new Date() ? hasta : null;
}

// El titular: { id, nombre } o null si nadie creó el PIN todavía.
async function titular() {
  const id = Number(await _leer(CLAVE_TITULAR)) || null;
  if (!id) return null;
  const u = await Usuario.findByPk(id, { attributes: ['id', 'nombre'] });
  return { id, nombre: u?.nombre ?? 'el titular' };
}

async function esTitular(usuario_id) {
  const t = await titular();
  return !t || t.id === usuario_id;
}

async function exigirTitular(usuario_id) {
  const t = await titular();
  if (t && t.id !== usuario_id) throw error(403, `Solo ${t.nombre} puede ver y cambiar el cobro con QR.`, 'NO_TITULAR');
  return t;
}

function _pase(usuario_id) {
  const token = jwt.sign({ uso: 'cobro_qr', uid: usuario_id }, secretoPase(), { expiresIn: `${MIN_PASE}m` });
  return { pase: token, vence: new Date(Date.now() + MIN_PASE * 60000).toISOString() };
}

function paseValido(token, usuario_id) {
  if (!token) return false;
  try {
    const p = jwt.verify(String(token), secretoPase());
    return p.uso === 'cobro_qr' && p.uid === usuario_id;
  } catch {
    return false;
  }
}

function exigirPase(token, usuario_id) {
  if (!paseValido(token, usuario_id)) throw error(403, 'Escribe el PIN de pagos para continuar.', 'PIN_REQUERIDO');
}

const formatoValido = (pin) => /^\d{6}$/.test(String(pin ?? ''));

// Revisa el PIN contando intentos. Lanza 423 si está bloqueado y 403 si falla.
async function verificarPin(pin, usuario_id) {
  await exigirTitular(usuario_id);
  const hasta = await _bloqueadoHasta();
  if (hasta) {
    const min = Math.max(1, Math.ceil((hasta - Date.now()) / 60000));
    throw error(423, `Demasiados intentos. Prueba de nuevo en ${min} min.`, 'PIN_BLOQUEADO');
  }
  const hash = await _leer(CLAVE_PIN);
  if (!hash) throw error(409, 'Todavía no hay PIN de pagos. Créalo primero.', 'PIN_NO_CREADO');

  if (formatoValido(pin) && (await bcrypt.compare(String(pin), hash))) {
    await _escribir(CLAVE_INTENTOS, '0');
    // PIN creado antes de que existiera el titular: queda quien lo abre.
    if (!(await _leer(CLAVE_TITULAR))) await _escribir(CLAVE_TITULAR, String(usuario_id));
    return;
  }
  const intentos = Number(await _leer(CLAVE_INTENTOS) || 0) + 1;
  if (intentos >= MAX_INTENTOS) {
    await _escribir(CLAVE_INTENTOS, '0');
    await _escribir(CLAVE_BLOQUEO, new Date(Date.now() + MIN_BLOQUEO * 60000).toISOString());
    console.warn(`PIN de pagos bloqueado ${MIN_BLOQUEO} min por ${MAX_INTENTOS} intentos fallados`);
    throw error(423, `PIN incorrecto. Por seguridad se bloqueó ${MIN_BLOQUEO} minutos.`, 'PIN_BLOQUEADO');
  }
  await _escribir(CLAVE_INTENTOS, String(intentos));
  const quedan = MAX_INTENTOS - intentos;
  throw error(403, `PIN incorrecto. Te ${quedan === 1 ? 'queda 1 intento' : `quedan ${quedan} intentos`}.`, 'PIN_INCORRECTO');
}

// La primera vez: quien tiene el permiso crea el PIN confirmando su contraseña
// y queda como titular de los pagos.
async function crearPin(usuario_id, { pin, contrasena }) {
  if (await hayPin()) throw error(409, 'El PIN de pagos ya existe.', 'PIN_YA_EXISTE');
  if (!formatoValido(pin)) throw error(400, 'El PIN debe tener 6 números.');
  if (/^(\d)\1{5}$/.test(pin) || '0123456789'.includes(pin) || '9876543210'.includes(pin)) {
    throw error(400, 'Ese PIN es muy fácil de adivinar. Elige otro.');
  }
  const usuario = await Usuario.findByPk(usuario_id);
  if (!usuario || !contrasena || !(await bcrypt.compare(String(contrasena), usuario.contrasena))) {
    throw error(403, 'La contraseña no es correcta.');
  }
  await _escribir(CLAVE_PIN, await bcrypt.hash(String(pin), 10));
  await _escribir(CLAVE_INTENTOS, '0');
  await _escribir(CLAVE_TITULAR, String(usuario.id));
  console.log(`PIN de pagos creado por ${usuario.nombre} (#${usuario.id}), que queda como titular`);
  return _pase(usuario_id);
}

async function desbloquear(usuario_id, { pin }) {
  await verificarPin(pin, usuario_id);
  return _pase(usuario_id);
}

async function borrarPin() {
  await Configuracion.destroy({ where: { clave: [CLAVE_PIN, CLAVE_INTENTOS, CLAVE_BLOQUEO, CLAVE_TITULAR] } });
}

module.exports = { titular, esTitular, exigirTitular, hayPin, paseValido, exigirPase, verificarPin, crearPin, desbloquear, borrarPin, MIN_PASE };
