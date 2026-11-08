const svc = require('./configuracion.service');
const banecoClient = require('../../integrations/baneco/baneco.client');
const pin = require('./pinCobroQr');

const paseDe = (req) => req.get('x-pase-cobro-qr');

async function obtenerTodo(req, res, next) {
  try { res.json({ ok: true, datos: await svc.obtenerTodo() }); }
  catch (err) { next(err); }
}

async function obtenerPublica(req, res, next) {
  try { res.json({ ok: true, datos: await svc.obtenerPublica() }); }
  catch (err) { next(err); }
}

async function actualizar(req, res, next) {
  try {
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({ ok: false, mensaje: 'Body debe ser un objeto { clave: valor }' });
    }
    res.json({ ok: true, datos: await svc.actualizar(req.body) });
  } catch (err) { next(err); }
}

async function probarBaneco(req, res, next) {
  try {
    pin.exigirPase(paseDe(req), req.usuario.id);
    await pin.exigirTitular(req.usuario.id);
    res.json({ ok: true, datos: await banecoClient.probarConexion() });
  } catch (err) { next(err); }
}

async function crearPin(req, res, next) {
  try { res.json({ ok: true, datos: await pin.crearPin(req.usuario.id, req.body || {}) }); }
  catch (err) { next(err); }
}

async function desbloquear(req, res, next) {
  try { res.json({ ok: true, datos: await pin.desbloquear(req.usuario.id, req.body || {}) }); }
  catch (err) { next(err); }
}

async function obtenerCobroQr(req, res, next) {
  try { res.json({ ok: true, datos: await svc.obtenerCobroQr({ puedeConfigurar: req.usuario.permisos.includes('pagos_qr.configurar'), usuario_id: req.usuario.id, pase: paseDe(req) }) }); }
  catch (err) { next(err); }
}

async function guardarCobroQr(req, res, next) {
  try { res.json({ ok: true, datos: await svc.guardarCobroQr(req.usuario.id, req.body || {}, paseDe(req)) }); }
  catch (err) { next(err); }
}

module.exports = { obtenerTodo, obtenerPublica, actualizar, probarBaneco, crearPin, desbloquear, obtenerCobroQr, guardarCobroQr };
