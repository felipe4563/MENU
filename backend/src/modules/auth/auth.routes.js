const { Router } = require('express');
const { login, loginSucursal, refresh, yo } = require('./auth.controller');
const auth = require('../../middlewares/auth');
const limitador = require('../../middlewares/limitador');

const router = Router();

// Todo el personal suele salir a internet con la misma IP del local: se
// cuentan 10 intentos por cuenta y un tope más alto para la IP entera.
const mensajeLogin = 'Demasiados intentos de inicio de sesión. Espera 15 minutos y vuelve a intentar.';
const limitePorCuenta = limitador({ ventanaMs: 15 * 60_000, maximo: 10, mensaje: mensajeLogin, clave: (req) => String(req.body?.email || '').trim().toLowerCase() });
const limitePorIp = limitador({ ventanaMs: 15 * 60_000, maximo: 100, mensaje: mensajeLogin });

router.post('/login', limitePorIp, limitePorCuenta, login);
router.post('/login/sucursal', limitePorIp, loginSucursal);
router.post('/refresh', limitador({ ventanaMs: 15 * 60_000, maximo: 60, mensaje: 'Demasiados pedidos. Espera unos minutos.' }), refresh);
router.get('/yo', auth, yo);

module.exports = router;
