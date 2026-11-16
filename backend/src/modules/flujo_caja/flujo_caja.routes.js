const { Router } = require('express');
const ctrl = require('./flujo_caja.controller');
const auth = require('../../middlewares/auth');
const { verificarPermiso } = require('../../middlewares/permisos');
const { requiereSucursalActiva } = require('../../middlewares/sucursalActiva');

// Quien ve el libro de caja ve el flujo; quien anota en el libro, anota acá.
const router = Router();
router.use(auth);

router.get('/', verificarPermiso('libro_caja', 'ver'), ctrl.obtener);
router.get('/movimientos', verificarPermiso('libro_caja', 'ver'), ctrl.listarMovimientos);
router.post('/movimientos', verificarPermiso('libro_caja', 'crear'), requiereSucursalActiva, ctrl.crearMovimiento);
router.put('/movimientos/:id', verificarPermiso('libro_caja', 'crear'), ctrl.editarMovimiento);
router.delete('/movimientos/:id', verificarPermiso('libro_caja', 'crear'), ctrl.eliminarMovimiento);

// Las categorías (luz, agua, sueldos…) las lee cualquiera que registre un
// gasto (el cajero las elige); las edita quien anota en el libro.
router.get('/categorias', ctrl.listarCategorias);
router.post('/categorias', verificarPermiso('libro_caja', 'crear'), ctrl.crearCategoria);
router.put('/categorias/:id', verificarPermiso('libro_caja', 'crear'), ctrl.editarCategoria);
router.delete('/categorias/:id', verificarPermiso('libro_caja', 'crear'), ctrl.eliminarCategoria);

module.exports = router;
