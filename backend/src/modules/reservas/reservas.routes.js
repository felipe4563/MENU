const { Router } = require('express');
const ctrl = require('./reservas.controller');
const auth = require('../../middlewares/auth');
const { verificarPermiso } = require('../../middlewares/permisos');
const { requiereSucursalActiva } = require('../../middlewares/sucursalActiva');

// Quien ve las ventas ve las reservas; quien puede tomar pedidos las anota.
const router = Router();
router.use(auth);

router.get('/', verificarPermiso('ventas', 'ver'), ctrl.listar);
router.post('/', verificarPermiso('ventas', 'crear'), requiereSucursalActiva, ctrl.crear);
router.put('/:id', verificarPermiso('ventas', 'crear'), ctrl.actualizar);
router.put('/:id/estado', verificarPermiso('ventas', 'crear'), ctrl.cambiarEstado);

module.exports = router;
