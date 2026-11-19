const { Router } = require('express');
const auth = require('../../middlewares/auth');
const svc = require('./push.service');

// Notificaciones push de cada usuario en su dispositivo (Mi perfil).
const router = Router();
router.use(auth);

const responder = (fn, status = 200) => async (req, res, next) => {
  try { res.status(status).json({ ok: true, datos: await fn(req) }); } catch (err) { next(err); }
};

router.get('/clave', responder(async () => ({ clave: await svc.clavePublica() })));
router.post('/suscripcion', responder((req) => svc.suscribir(req.usuario.id, req.body?.suscripcion, req.body?.dispositivo), 201));
router.delete('/suscripcion', responder(async (req) => { await svc.quitar(req.usuario.id, req.body?.endpoint); return null; }));
router.post('/probar', responder((req) => svc.probar(req.usuario.id)));

module.exports = router;
