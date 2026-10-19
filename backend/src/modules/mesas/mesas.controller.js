const svc = require('./mesas.service');

function _alcance(req) {
  return { sucursal_id: req.usuario.sucursal_id, acceso_todas: req.usuario.acceso_todas };
}

async function listarAreas(req, res, next) {
  try { res.json({ ok: true, datos: await svc.listarAreas(_alcance(req)) }); }
  catch (err) { next(err); }
}

async function crearArea(req, res, next) {
  try {
    if (!req.body.nombre) return res.status(400).json({ ok: false, mensaje: 'nombre es requerido' });
    res.status(201).json({ ok: true, datos: await svc.crearArea(req.body, req.usuario.sucursal_id) });
  } catch (err) { next(err); }
}

async function actualizarArea(req, res, next) {
  try { res.json({ ok: true, datos: await svc.actualizarArea(req.params.id, req.body, _alcance(req)) }); }
  catch (err) { next(err); }
}

async function eliminarArea(req, res, next) {
  try { await svc.eliminarArea(req.params.id, _alcance(req)); res.json({ ok: true, datos: null }); }
  catch (err) { next(err); }
}

async function listarMesas(req, res, next) {
  try { res.json({ ok: true, datos: await svc.listarMesas(req.query.area_id, _alcance(req)) }); }
  catch (err) { next(err); }
}

async function obtenerMesa(req, res, next) {
  try { res.json({ ok: true, datos: await svc.obtenerMesa(req.params.id, _alcance(req)) }); }
  catch (err) { next(err); }
}

async function crearMesa(req, res, next) {
  try {
    const { area_id, nombre } = req.body;
    if (!area_id || !nombre) return res.status(400).json({ ok: false, mensaje: 'area_id y nombre son requeridos' });
    res.status(201).json({ ok: true, datos: await svc.crearMesa(req.body, req.usuario.sucursal_id) });
  } catch (err) { next(err); }
}

async function actualizarMesa(req, res, next) {
  try { res.json({ ok: true, datos: await svc.actualizarMesa(req.params.id, req.body, _alcance(req)) }); }
  catch (err) { next(err); }
}

async function eliminarMesa(req, res, next) {
  try { await svc.eliminarMesa(req.params.id, _alcance(req)); res.json({ ok: true, datos: null }); }
  catch (err) { next(err); }
}

async function regenerarCodigoQr(req, res, next) {
  try { res.json({ ok: true, datos: await svc.regenerarCodigoQr(req.params.id, _alcance(req)) }); }
  catch (err) { next(err); }
}

async function abrirSesionMesa(req, res, next) {
  try {
    const mesa = await svc.obtenerMesa(req.params.id, _alcance(req));
    const sesion = await svc.abrirSesion(mesa.id, mesa.area.sucursal_id, 'staff');
    res.status(201).json({ ok: true, datos: sesion });
  } catch (err) { next(err); }
}

async function cerrarSesionMesa(req, res, next) {
  try {
    const mesa = await svc.obtenerMesa(req.params.id, _alcance(req));
    await svc.cerrarSesion(mesa.id);
    res.json({ ok: true, datos: null });
  } catch (err) { next(err); }
}

module.exports = {
  listarAreas, crearArea, actualizarArea, eliminarArea,
  listarMesas, obtenerMesa, crearMesa, actualizarMesa, eliminarMesa, regenerarCodigoQr,
  abrirSesionMesa, cerrarSesionMesa,
};
