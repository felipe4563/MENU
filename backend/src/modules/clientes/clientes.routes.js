const { Router } = require('express');
const ctrl = require('./clientes.controller');
const auth = require('../../middlewares/auth');
const { verificarPermiso } = require('../../middlewares/permisos');

const router = Router();
router.use(auth);

router.get('/', verificarPermiso('clientes', 'ver'), ctrl.listar);
router.post('/', verificarPermiso('clientes', 'crear'), ctrl.crear);
// Antes de "/:id" — si no, Express matchea estas rutas como :id.
router.get('/buscar-documento/:numero', verificarPermiso('clientes', 'crear'), ctrl.buscarDocumento);
router.get('/buscar-nombre', verificarPermiso('clientes', 'crear'), ctrl.buscarNombre);
router.get('/buscar-codigo/:codigo', verificarPermiso('clientes', 'crear'), ctrl.buscarCodigo);
router.get('/:id/ficha', verificarPermiso('clientes', 'ver'), ctrl.ficha);
router.get('/:id', verificarPermiso('clientes', 'ver'), ctrl.obtener);
router.put('/:id', verificarPermiso('clientes', 'editar'), ctrl.actualizar);
router.post('/:id/resetear-pin', verificarPermiso('clientes', 'editar'), ctrl.resetearPin);

module.exports = router;
