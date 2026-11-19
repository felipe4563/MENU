const svc = require('./reservas.service');

const _alcance = (req) => ({ sucursal_id: req.usuario.sucursal_id, acceso_todas: req.usuario.acceso_todas });

async function listar(req, res, next) {
  try { res.json({ ok: true, datos: await svc.listar(req.query, _alcance(req)) }); } catch (e) { next(e); }
}

async function obtener(req, res, next) {
  try { res.json({ ok: true, datos: await svc.obtener(req.params.id, _alcance(req)) }); } catch (e) { next(e); }
}

async function platosDelDia(req, res, next) {
  try { res.json({ ok: true, datos: await svc.platosDelDia(req.query, _alcance(req)) }); } catch (e) { next(e); }
}

async function crear(req, res, next) {
  try { res.status(201).json({ ok: true, datos: await svc.crear(req.body, req.usuario.id, req.usuario.sucursal_id) }); } catch (e) { next(e); }
}

async function actualizar(req, res, next) {
  try { res.json({ ok: true, datos: await svc.actualizar(req.params.id, req.body, _alcance(req)) }); } catch (e) { next(e); }
}

async function cambiarEstado(req, res, next) {
  try { res.json({ ok: true, datos: await svc.cambiarEstado(req.params.id, req.body?.estado, _alcance(req)) }); } catch (e) { next(e); }
}

module.exports = { listar, obtener, platosDelDia, crear, actualizar, cambiarEstado };
