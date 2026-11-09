const svc = require('./clientes.service');

async function listar(req, res, next) {
  try { res.json({ ok: true, datos: await svc.listar(req.query) }); }
  catch (err) { next(err); }
}

async function obtener(req, res, next) {
  try { res.json({ ok: true, datos: await svc.obtener(req.params.id) }); }
  catch (err) { next(err); }
}

async function buscarDocumento(req, res, next) {
  try { res.json({ ok: true, datos: await svc.buscarPorDocumento(req.params.numero) }); }
  catch (err) { next(err); }
}

async function buscarNombre(req, res, next) {
  try { res.json({ ok: true, datos: await svc.buscarPorNombre(req.query.q) }); }
  catch (err) { next(err); }
}

async function buscarCodigo(req, res, next) {
  try { res.json({ ok: true, datos: await svc.buscarPorCodigo(req.params.codigo) }); }
  catch (err) { next(err); }
}

async function crear(req, res, next) {
  try {
    if (!req.body.nombre) return res.status(400).json({ ok: false, mensaje: 'nombre es requerido' });
    res.status(201).json({ ok: true, datos: await svc.crear(req.body) });
  } catch (err) { next(err); }
}

async function actualizar(req, res, next) {
  try { res.json({ ok: true, datos: await svc.actualizar(req.params.id, req.body) }); }
  catch (err) { next(err); }
}

async function resetearPin(req, res, next) {
  try { res.json({ ok: true, datos: await svc.resetearPin(req.params.id) }); }
  catch (err) { next(err); }
}

async function ficha(req, res, next) {
  try { res.json({ ok: true, datos: await require('./ficha.service').ficha(req.params.id) }); }
  catch (err) { next(err); }
}

module.exports = { ficha, listar, obtener, crear, actualizar, buscarDocumento, buscarNombre, buscarCodigo, resetearPin };
