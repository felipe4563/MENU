const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Cliente, ClientePinVerificacion } = require('../../models');
const clientesService = require('../clientes/clientes.service');
const ventasService = require('../ventas/ventas.service');
const { enviarCodigoPin } = require('../../integrations/email/email.client');

const CODIGO_EXPIRA_MINUTOS = 10;
const CODIGO_INTENTOS_MAX = 5;
const PIN_REGEX = /^\d{4}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PIN_INTENTOS_MAX = 5;
const PIN_BLOQUEO_MINUTOS = 5;
const SOLICITUD_MIN_INTERVALO_MS = 60_000;

function emitirToken(cliente_id) {
  return jwt.sign({ cliente_id, tipo: 'cliente' }, process.env.JWT_SECRET, { expiresIn: '180d' });
}

function _generarCodigo() {
  return String(crypto.randomInt(100000, 1000000));
}

async function _resolverCliente(numero_documento) {
  const cliente_id = await clientesService.resolverOCrearPorDocumento(numero_documento);
  if (!cliente_id) {
    throw Object.assign(new Error('No se pudo identificar ese CI. Verificá el número.'), { status: 404 });
  }
  return Cliente.findByPk(cliente_id);
}

async function estado(numero_documento) {
  const cliente = await _resolverCliente(numero_documento);
  return { tiene_pin: !!cliente.pin_hash };
}

async function solicitarPin({ numero_documento, pin, email }) {
  if (!PIN_REGEX.test(pin || '')) {
    throw Object.assign(new Error('El PIN debe ser de 4 dígitos'), { status: 400 });
  }
  if (!EMAIL_REGEX.test(email || '')) {
    throw Object.assign(new Error('Email inválido'), { status: 400 });
  }

  const cliente = await _resolverCliente(numero_documento);
  if (cliente.pin_hash) {
    throw Object.assign(new Error('Este CI ya tiene un PIN configurado'), { status: 409 });
  }

  const pendienteExistente = await ClientePinVerificacion.findOne({ where: { cliente_id: cliente.id } });
  if (pendienteExistente && pendienteExistente.creado_en > new Date(Date.now() - SOLICITUD_MIN_INTERVALO_MS)) {
    throw Object.assign(new Error('Ya te mandamos un código hace poco, esperá un momento antes de pedir otro'), { status: 429 });
  }

  const codigo = _generarCodigo();
  const [pin_hash, codigo_hash] = await Promise.all([
    bcrypt.hash(pin, 10),
    bcrypt.hash(codigo, 10),
  ]);

  await ClientePinVerificacion.destroy({ where: { cliente_id: cliente.id } });
  await ClientePinVerificacion.create({
    cliente_id: cliente.id,
    pin_hash,
    email,
    codigo_hash,
    intentos: 0,
    expira_en: new Date(Date.now() + CODIGO_EXPIRA_MINUTOS * 60_000),
  });

  await enviarCodigoPin({ to: email, codigo });
  return { ok: true };
}

async function confirmarPin({ numero_documento, codigo }) {
  const cliente = await _resolverCliente(numero_documento);
  const pendiente = await ClientePinVerificacion.findOne({ where: { cliente_id: cliente.id } });

  if (!pendiente || pendiente.expira_en < new Date()) {
    if (pendiente) await pendiente.destroy();
    throw Object.assign(new Error('Código vencido, pedí uno nuevo'), { status: 400 });
  }
  if (pendiente.intentos >= CODIGO_INTENTOS_MAX) {
    throw Object.assign(new Error('Demasiados intentos, pedí un código nuevo'), { status: 429 });
  }

  const coincide = await bcrypt.compare(String(codigo || ''), pendiente.codigo_hash);
  if (!coincide) {
    await pendiente.update({ intentos: pendiente.intentos + 1 });
    throw Object.assign(new Error('Código incorrecto'), { status: 400 });
  }

  await cliente.update({ pin_hash: pendiente.pin_hash, email: pendiente.email });
  await pendiente.destroy();

  return { token: emitirToken(cliente.id) };
}

async function verificarPin({ numero_documento, pin }) {
  const cliente = await _resolverCliente(numero_documento);
  if (!cliente.pin_hash) {
    throw Object.assign(new Error('Este CI todavía no tiene un PIN configurado'), { status: 409 });
  }

  if (cliente.pin_bloqueado_hasta && cliente.pin_bloqueado_hasta > new Date()) {
    throw Object.assign(new Error('Demasiados intentos, esperá unos minutos y volvé a intentar'), { status: 429 });
  }

  const coincide = await bcrypt.compare(String(pin || ''), cliente.pin_hash);
  if (!coincide) {
    const intentos = cliente.pin_intentos_fallidos + 1;
    if (intentos >= PIN_INTENTOS_MAX) {
      await cliente.update({ pin_intentos_fallidos: 0, pin_bloqueado_hasta: new Date(Date.now() + PIN_BLOQUEO_MINUTOS * 60_000) });
    } else {
      await cliente.update({ pin_intentos_fallidos: intentos });
    }
    throw Object.assign(new Error('PIN incorrecto'), { status: 401 });
  }

  await cliente.update({ pin_intentos_fallidos: 0 });
  return { token: emitirToken(cliente.id) };
}

async function cambiarPin(cliente_id, { pin_actual, pin_nuevo }) {
  if (!PIN_REGEX.test(pin_nuevo || '')) {
    throw Object.assign(new Error('El PIN nuevo debe ser de 4 dígitos'), { status: 400 });
  }
  const cliente = await Cliente.findByPk(cliente_id);
  const coincide = cliente?.pin_hash && await bcrypt.compare(String(pin_actual || ''), cliente.pin_hash);
  if (!coincide) {
    throw Object.assign(new Error('El PIN actual no coincide'), { status: 401 });
  }
  await cliente.update({ pin_hash: await bcrypt.hash(pin_nuevo, 10) });
  return { ok: true };
}

async function perfil(cliente_id) {
  const cliente = await Cliente.findByPk(cliente_id, { attributes: ['nombre', 'puntos'] });
  if (!cliente) throw Object.assign(new Error('Cliente no encontrado'), { status: 404 });
  return { nombre: cliente.nombre, puntos: cliente.puntos };
}

async function historial(cliente_id) {
  return ventasService.listar({ cliente_id, estado: 'completado', acceso_todas: true });
}

// Enmascara el email para mostrarlo en pantalla sin revelarlo completo
// (ej. "ru***@gmail.com") — el cliente ya lo conoce, esto es solo para que
// reconozca a cuál cuenta le llegó el código sin exponerlo a quien mire por
// encima del hombro en un dispositivo compartido de mesa.
function _enmascararEmail(email) {
  const [usuario, dominio] = email.split('@');
  const visible = usuario.slice(0, 2);
  return `${visible}${'*'.repeat(Math.max(1, usuario.length - visible.length))}@${dominio}`;
}

async function recuperarPinSolicitar({ numero_documento }) {
  const cliente = await _resolverCliente(numero_documento);
  if (!cliente.pin_hash) {
    throw Object.assign(new Error('Este CI todavía no tiene un PIN configurado'), { status: 409 });
  }
  if (!cliente.email) {
    throw Object.assign(new Error('No tenés un email registrado para recuperar el PIN. Pedile al staff que te ayude.'), { status: 409 });
  }

  const pendienteExistente = await ClientePinVerificacion.findOne({ where: { cliente_id: cliente.id } });
  if (pendienteExistente && pendienteExistente.creado_en > new Date(Date.now() - SOLICITUD_MIN_INTERVALO_MS)) {
    throw Object.assign(new Error('Ya te mandamos un código hace poco, esperá un momento antes de pedir otro'), { status: 429 });
  }

  const codigo = _generarCodigo();
  const codigo_hash = await bcrypt.hash(codigo, 10);

  await ClientePinVerificacion.destroy({ where: { cliente_id: cliente.id } });
  await ClientePinVerificacion.create({
    cliente_id: cliente.id,
    pin_hash: null,
    email: cliente.email,
    codigo_hash,
    intentos: 0,
    expira_en: new Date(Date.now() + CODIGO_EXPIRA_MINUTOS * 60_000),
  });

  await enviarCodigoPin({ to: cliente.email, codigo });
  return { ok: true, email_parcial: _enmascararEmail(cliente.email) };
}

async function recuperarPinConfirmar({ numero_documento, codigo, pin_nuevo }) {
  if (!PIN_REGEX.test(pin_nuevo || '')) {
    throw Object.assign(new Error('El PIN nuevo debe ser de 4 dígitos'), { status: 400 });
  }

  const cliente = await _resolverCliente(numero_documento);
  const pendiente = await ClientePinVerificacion.findOne({ where: { cliente_id: cliente.id } });

  if (!pendiente || pendiente.expira_en < new Date()) {
    if (pendiente) await pendiente.destroy();
    throw Object.assign(new Error('Código vencido, pedí uno nuevo'), { status: 400 });
  }
  if (pendiente.intentos >= CODIGO_INTENTOS_MAX) {
    throw Object.assign(new Error('Demasiados intentos, pedí un código nuevo'), { status: 429 });
  }

  const coincide = await bcrypt.compare(String(codigo || ''), pendiente.codigo_hash);
  if (!coincide) {
    await pendiente.update({ intentos: pendiente.intentos + 1 });
    throw Object.assign(new Error('Código incorrecto'), { status: 400 });
  }

  await cliente.update({
    pin_hash: await bcrypt.hash(pin_nuevo, 10),
    pin_intentos_fallidos: 0,
    pin_bloqueado_hasta: null,
  });
  await pendiente.destroy();

  return { token: emitirToken(cliente.id) };
}

module.exports = {
  estado, solicitarPin, confirmarPin, verificarPin, cambiarPin, perfil, historial, emitirToken,
  recuperarPinSolicitar, recuperarPinConfirmar,
};
