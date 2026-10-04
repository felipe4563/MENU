const { Router } = require('express');
const ctrl = require('./reportes.controller');
const auth = require('../../middlewares/auth');
const { verificarPermiso } = require('../../middlewares/permisos');

const router = Router();
router.use(auth);

router.get('/ventas/resumen',   verificarPermiso('reportes', 'ver'), ctrl.getVentasResumen);
router.get('/ventas/productos', verificarPermiso('reportes', 'ver'), ctrl.getVentasProductos);
router.get('/ventas/variantes', verificarPermiso('reportes', 'ver'), ctrl.getVentasVariantes);
router.get('/ventas',           verificarPermiso('reportes', 'ver'), ctrl.getVentas);
router.get('/inventario/resumen', verificarPermiso('reportes', 'ver'), ctrl.getInventarioResumen);
router.get('/inventario',         verificarPermiso('reportes', 'ver'), ctrl.getInventario);
router.get('/compras/resumen', verificarPermiso('reportes', 'ver'), ctrl.getComprasResumen);
router.get('/compras',        verificarPermiso('reportes', 'ver'), ctrl.getCompras);
router.get('/caja/resumen',   verificarPermiso('reportes', 'ver'), ctrl.getCajaResumen);
router.get('/caja',           verificarPermiso('reportes', 'ver'), ctrl.getCaja);
router.get('/arqueos/resumen', verificarPermiso('reportes', 'ver'), ctrl.getArqueosResumen);
router.get('/arqueos',         verificarPermiso('reportes', 'ver'), ctrl.getArqueos);

module.exports = router;
