const svc = require('./sueldos.service');

const _alcance = (req) => ({ sucursal_id: req.usuario.sucursal_id, acceso_todas: req.usuario.acceso_todas });
const responder = (fn, status = 200) => async (req, res, next) => {
  try { res.status(status).json({ ok: true, datos: await fn(req) }); } catch (err) { next(err); }
};
const id = (req) => Number(req.params.usuario_id);

module.exports = {
  resumen: responder((req) => svc.resumen(_alcance(req))),
  mio: responder((req) => svc.mio(req.usuario.id)),
  detalle: responder((req) => svc.detalle(id(req))),
  configurar: responder((req) => svc.configurar(id(req), req.body, req.usuario.id)),
  eliminarSueldo: responder((req) => svc.eliminarSueldo(id(req), Number(req.params.sueldo_id))),
  registrar: responder((req) => svc.registrar(id(req), req.body, req.usuario.id, _alcance(req)), 201),
  anular: responder(async (req) => { await svc.anular(id(req), Number(req.params.pago_id), _alcance(req)); return null; }),
  justificar: responder((req) => svc.justificar(id(req), req.body, req.usuario.id)),
  quitarJustificacion: responder((req) => svc.quitarJustificacion(id(req), req.params.fecha)),
};
