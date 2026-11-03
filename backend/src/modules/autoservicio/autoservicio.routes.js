const { Router } = require('express');
const ctrl = require('./autoservicio.controller');
const { authClienteOpcional } = require('../../middlewares/authCliente');

const limitador = require('../../middlewares/limitador');

const router = Router();

router.get('/mesa/:codigo_qr', ctrl.obtenerMenu);
router.post('/mesa/:codigo_qr/cupon/validar', limitador({ ventanaMs: 10 * 60_000, maximo: 20, mensaje: 'Demasiados intentos con cupones. Espera unos minutos.' }), ctrl.validarCupon);
router.post('/mesa/:codigo_qr/pedido', limitador({ ventanaMs: 10 * 60_000, maximo: 20, mensaje: 'Demasiados pedidos seguidos. Espera unos minutos.' }), authClienteOpcional, ctrl.crearPedido);
router.get('/mesa/:codigo_qr/pedido/:pedido_id/estado', ctrl.estadoPedido);

module.exports = router;
