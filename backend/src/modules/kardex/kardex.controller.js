const svc = require('./kardex.service');

const _alcance = (req) => ({ sucursal_id: req.usuario.sucursal_id, acceso_todas: req.usuario.acceso_todas });
const responder = (fn) => async (req, res, next) => {
  try { res.json({ ok: true, datos: await fn(req) }); } catch (err) { next(err); }
};

module.exports = {
  resumen: responder((req) => svc.resumen(req.query, _alcance(req), req.usuario.permisos)),
  detalle: responder((req) => svc.detalle(req.params.clase, Number(req.params.id), req.query, _alcance(req), req.usuario.permisos)),
};
