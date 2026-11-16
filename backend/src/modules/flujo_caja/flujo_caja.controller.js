const svc = require('./flujo_caja.service');
const cats = require('./categorias');

const _alcance = (req) => ({ sucursal_id: req.usuario.sucursal_id, acceso_todas: req.usuario.acceso_todas });
const responder = (fn, status = 200) => async (req, res, next) => {
  try { res.status(status).json({ ok: true, datos: await fn(req) }); } catch (err) { next(err); }
};

module.exports = {
  obtener: responder((req) => svc.obtener(req.query, _alcance(req))),
  listarMovimientos: responder((req) => svc.listarMovimientos(req.query, _alcance(req))),
  crearMovimiento: responder((req) => svc.crearMovimiento(req.usuario.id, req.body, _alcance(req)), 201),
  editarMovimiento: responder((req) => svc.editarMovimiento(Number(req.params.id), req.body, _alcance(req))),
  listarCategorias: responder(() => cats.listar()),
  crearCategoria: responder((req) => cats.crear(req.body), 201),
  editarCategoria: responder((req) => cats.editar(Number(req.params.id), req.body)),
  eliminarCategoria: responder((req) => cats.eliminar(Number(req.params.id))),
  eliminarMovimiento: responder(async (req) => { await svc.eliminarMovimiento(Number(req.params.id), _alcance(req)); return null; }),
};
