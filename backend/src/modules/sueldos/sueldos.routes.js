const { Router } = require('express');
const ctrl = require('./sueldos.controller');
const auth = require('../../middlewares/auth');
const { verificarPermiso } = require('../../middlewares/permisos');

// Equipo › Sueldos. Todo con personal.pagar (mueve plata de la caja), salvo
// "lo mío": cada trabajador ve lo que ganó y lo que se le pagó.
const router = Router();
router.use(auth);

router.get('/mio', ctrl.mio);

const pagar = verificarPermiso('personal', 'pagar');
router.get('/', pagar, ctrl.resumen);
router.get('/:usuario_id', pagar, ctrl.detalle);
router.put('/:usuario_id/sueldo', pagar, ctrl.configurar);
router.delete('/:usuario_id/sueldo/:sueldo_id', pagar, ctrl.eliminarSueldo);
router.post('/:usuario_id/movimientos', pagar, ctrl.registrar);
router.delete('/:usuario_id/movimientos/:pago_id', pagar, ctrl.anular);
router.post('/:usuario_id/justificadas', pagar, ctrl.justificar);
router.delete('/:usuario_id/justificadas/:fecha', pagar, ctrl.quitarJustificacion);

module.exports = router;
