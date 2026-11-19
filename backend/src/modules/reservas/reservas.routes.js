const { Router } = require('express');
const ctrl = require('./reservas.controller');
const auth = require('../../middlewares/auth');
const { verificarPermiso } = require('../../middlewares/permisos');
const { requiereSucursalActiva } = require('../../middlewares/sucursalActiva');

// Quien ve las ventas ve las reservas; quien puede tomar pedidos las anota.
const router = Router();
router.use(auth);

// Los platos de las reservas de hoy los ve caja y también cocina.
const ventasOCocina = (req, res, next) => {
  const permisos = req.usuario?.permisos || [];
  if (permisos.includes('ventas.ver') || permisos.includes('cocina.ver')) return next();
  return res.status(403).json({ ok: false, mensaje: 'Sin permiso: ventas.ver' });
};

router.get('/', verificarPermiso('ventas', 'ver'), ctrl.listar);
router.get('/hoy/platos', ventasOCocina, ctrl.platosDelDia);
router.get('/:id', verificarPermiso('ventas', 'ver'), ctrl.obtener);
router.post('/', verificarPermiso('ventas', 'crear'), requiereSucursalActiva, ctrl.crear);
router.put('/:id', verificarPermiso('ventas', 'crear'), ctrl.actualizar);
router.put('/:id/estado', verificarPermiso('ventas', 'crear'), ctrl.cambiarEstado);

module.exports = router;
