const { validationResult } = require('express-validator');
const svc = require('./devoluciones.service');

function _alcance(req) {
  return { sucursal_id: req.usuario.sucursal_id, acceso_todas: req.usuario.acceso_todas };
}

async function anular(req, res, next) {
  try {
    const errores = validationResult(req);
    if (!errores.isEmpty()) {
      return res.status(400).json({ ok: false, mensaje: errores.array()[0].msg });
    }
    const { items, motivo, nota, forma } = req.body;
    const datos = await svc.anular(req.params.id, req.usuario.id, { items, motivo, nota, forma }, _alcance(req));
    res.status(201).json({ ok: true, datos });
  } catch (err) { next(err); }
}

async function pendientes(req, res, next) {
  try {
    res.json({ ok: true, datos: await svc.listarPendientes(_alcance(req)) });
  } catch (err) { next(err); }
}

async function transferida(req, res, next) {
  try {
    res.json({ ok: true, datos: await svc.marcarTransferida(req.params.id, _alcance(req)) });
  } catch (err) { next(err); }
}

module.exports = { anular, pendientes, transferida };
