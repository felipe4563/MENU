const { Router } = require('express');
const auth = require('../../middlewares/auth');
const { verificarPermiso } = require('../../middlewares/permisos');
const ctrl = require('./devoluciones.controller');

const router = Router();
router.use(auth);

router.get('/pendientes', verificarPermiso('ventas', 'anular'), ctrl.pendientes);
router.patch('/:id/transferida', verificarPermiso('ventas', 'anular'), ctrl.transferida);

module.exports = router;
