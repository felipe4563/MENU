const { Router } = require('express');
const ctrl = require('./mesas.controller');
const auth = require('../../middlewares/auth');
const { verificarPermiso } = require('../../middlewares/permisos');
const { requiereSucursalActiva } = require('../../middlewares/sucursalActiva');

const router = Router();
router.use(auth);

router.get('/', verificarPermiso('ventas', 'ver'), ctrl.listarMesas);
router.post('/', verificarPermiso('configuracion', 'editar'), requiereSucursalActiva, ctrl.crearMesa);
router.get('/:id', verificarPermiso('ventas', 'ver'), ctrl.obtenerMesa);
router.put('/:id', verificarPermiso('configuracion', 'editar'), ctrl.actualizarMesa);
router.delete('/:id', verificarPermiso('configuracion', 'editar'), ctrl.eliminarMesa);
router.post('/:id/regenerar-qr', verificarPermiso('configuracion', 'editar'), ctrl.regenerarCodigoQr);
router.post('/:id/sesion', verificarPermiso('ventas', 'crear'), requiereSucursalActiva, ctrl.abrirSesionMesa);
router.delete('/:id/sesion', verificarPermiso('ventas', 'crear'), ctrl.cerrarSesionMesa);

module.exports = router;
