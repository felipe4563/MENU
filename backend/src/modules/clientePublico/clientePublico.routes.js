const { Router } = require('express');
const ctrl = require('./clientePublico.controller');
const { authCliente } = require('../../middlewares/authCliente');

const limitador = require('../../middlewares/limitador');

const router = Router();

// Cada IP tiene pocos intentos: esto manda correos y valida PINs de 4 dígitos.
router.use(['/estado', '/pin/solicitar', '/pin/confirmar', '/pin/verificar', '/pin/recuperar/solicitar', '/pin/recuperar/confirmar'],
  limitador({ ventanaMs: 15 * 60_000, maximo: 15, mensaje: 'Demasiados intentos. Espera 15 minutos y vuelve a intentar.' }));

router.post('/estado', ctrl.estado);
router.post('/pin/solicitar', ctrl.solicitarPin);
router.post('/pin/confirmar', ctrl.confirmarPin);
router.post('/pin/verificar', ctrl.verificarPin);
router.post('/pin/recuperar/solicitar', ctrl.recuperarPinSolicitar);
router.post('/pin/recuperar/confirmar', ctrl.recuperarPinConfirmar);
router.put('/pin', authCliente, ctrl.cambiarPin);
router.get('/perfil', authCliente, ctrl.perfil);
router.get('/pedidos', authCliente, ctrl.historial);

module.exports = router;
