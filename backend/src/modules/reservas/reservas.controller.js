const svc = require('./reservas.service');
const adelantos = require('./adelantos.service');
const convertir = require('./convertir.service');

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
  try {
    const { estado, mesa_id, destino_adelanto, metodo_devolucion } = req.body || {};
    // Devolver el adelanto saca plata de la caja: pide ventas.anular.
    const puede_anular = (req.usuario.permisos || []).includes('ventas.anular');
    res.json({
      ok: true,
      datos: await svc.cambiarEstado(req.params.id, estado, _alcance(req), { mesa_id, usuario_id: req.usuario.id, destino_adelanto, metodo_devolucion, puede_anular }),
    });
  } catch (e) { next(e); }
}

async function enviarCocina(req, res, next) {
  try { res.json({ ok: true, datos: await convertir.convertirEnPedido(req.params.id, req.usuario.id, { alcance: _alcance(req) }) }); } catch (e) { next(e); }
}

async function cobrarAdelanto(req, res, next) {
  try { res.status(201).json({ ok: true, datos: await adelantos.cobrarAdelanto(req.params.id, req.usuario.id, req.body || {}, _alcance(req)) }); } catch (e) { next(e); }
}

module.exports = { cobrarAdelanto, enviarCocina, listar, obtener, platosDelDia, crear, actualizar, cambiarEstado };
