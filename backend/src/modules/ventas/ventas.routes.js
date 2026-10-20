const { Router } = require('express');
const ctrl = require('./ventas.controller');
const auth = require('../../middlewares/auth');
const { verificarPermiso } = require('../../middlewares/permisos');
const { requiereSucursalActiva } = require('../../middlewares/sucursalActiva');

const router = Router();
router.use(auth);

router.get('/cocina', verificarPermiso('cocina', 'ver'), ctrl.listarCocina);
router.get('/mis-ventas-hoy', verificarPermiso('ventas', 'ver'), ctrl.misVentasHoy);
// La lista de pedidos de apps externas tiene su propio permiso (pantalla "Pedidos externos").
router.get('/', (req, res, next) => (
  req.query.origen === 'app_externa'
    ? verificarPermiso('pedidos_externos', 'ver')
    : verificarPermiso('ventas', 'ver')
)(req, res, next), ctrl.listar);
router.post('/', verificarPermiso('ventas', 'crear'), requiereSucursalActiva, ctrl.crear);
router.post('/completa', verificarPermiso('ventas', 'crear'), requiereSucursalActiva, ctrl.crearCompleta);
router.get('/:id', verificarPermiso('ventas', 'ver'), ctrl.obtener);
router.post('/:id/reimprimir', verificarPermiso('ventas', 'cobrar'), ctrl.reimprimir);
router.post('/:id/items', verificarPermiso('ventas', 'crear'), ctrl.agregarItem);
router.put('/:id/items/:item_id', verificarPermiso('ventas', 'crear'), ctrl.actualizarItem);
router.delete('/:id/items/:item_id', verificarPermiso('ventas', 'crear'), ctrl.eliminarItem);
router.post('/:id/cobrar', verificarPermiso('ventas', 'cobrar'), requiereSucursalActiva, ctrl.cobrar);
router.get('/:id/pago-qr/estado', verificarPermiso('ventas', 'cobrar'), ctrl.estadoPagoQr);
router.post('/:id/pago-qr/cancelar', verificarPermiso('ventas', 'cobrar'), ctrl.cancelarPagoQr);
router.post('/:id/cancelar', verificarPermiso('ventas', 'cancelar'), ctrl.cancelar);
router.patch('/:id/listo', verificarPermiso('cocina', 'ver'), ctrl.marcarListo);
router.patch('/:id/entregado', verificarPermiso('cocina', 'ver'), ctrl.marcarEntregado);

module.exports = router;
