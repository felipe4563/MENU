const { Router } = require('express');
const ctrl = require('./kardex.controller');
const auth = require('../../middlewares/auth');

// Kardex de insumos (insumos.ver) y de productos con stock (inventario.ver).
// Basta con uno de los dos: el servicio muestra solo lo que cada uno puede ver.
const router = Router();
router.use(auth);
router.use((req, res, next) => {
  const p = req.usuario?.permisos ?? [];
  if (p.includes('insumos.ver') || p.includes('inventario.ver')) return next();
  return res.status(403).json({ ok: false, mensaje: 'Sin permiso: insumos.ver o inventario.ver' });
});

router.get('/', ctrl.resumen);
router.get('/:clase/:id', ctrl.detalle);

module.exports = router;
