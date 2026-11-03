const { Router } = require('express');
const ctrl = require('./configuracion.controller');
const auth = require('../../middlewares/auth');
const { verificarPermiso } = require('../../middlewares/permisos');

const router = Router();

// Ruta pública — solo nombre y logo, sin token
router.get('/publica', ctrl.obtenerPublica);

router.use(auth);
router.get('/', verificarPermiso('configuracion', 'ver'), ctrl.obtenerTodo);
router.put('/', verificarPermiso('configuracion', 'editar'), ctrl.actualizar);
// Cobro con QR: verlo requiere configuracion.ver; cambiarlo, su propio permiso.
router.get('/cobro-qr', verificarPermiso('configuracion', 'ver'), ctrl.obtenerCobroQr);
router.put('/cobro-qr', verificarPermiso('pagos_qr', 'configurar'), ctrl.guardarCobroQr);
router.post('/cobro-qr/probar', verificarPermiso('pagos_qr', 'configurar'), ctrl.probarBaneco);

module.exports = router;
