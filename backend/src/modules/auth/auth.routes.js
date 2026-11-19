const { Router } = require('express');
const { login, loginSucursal, refresh, yo, usuariosPin, entrarPin, entrarPinMismo } = require('./auth.controller');
const { usuarioIdCanonico } = require('./auth.service');
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

// Entrar con PIN en un aparato habilitado: mismos topes que el login, pero
// contando por usuario_id (el PIN son solo 4 números). La clave es el id
// canónico; los ids con otra forma se rechazan con 400 en el servicio.
const mensajePin = 'Demasiados intentos con PIN. Espera 15 minutos o entra con tu correo.';
const limitePinPorIp = limitador({ ventanaMs: 15 * 60_000, maximo: 100, mensaje: mensajePin });
const limitePinPorUsuario = limitador({ ventanaMs: 15 * 60_000, maximo: 10, mensaje: mensajePin, clave: (req) => String(usuarioIdCanonico(req.body?.usuario_id)) });
router.post('/pin/usuarios', limitePinPorIp, usuariosPin);
router.post('/pin', limitePinPorIp, limitePinPorUsuario, entrarPin);
// Desbloquear la sesión propia con PIN (sin aparato habilitado): mismo tope, por usuario de la sesión.
const limitePinMismo = limitador({ ventanaMs: 15 * 60_000, maximo: 10, mensaje: mensajePin, clave: (req) => String(req.usuario.id) });
router.post('/pin/mismo', limitePinPorIp, auth, limitePinMismo, entrarPinMismo);
router.post('/refresh', limitador({ ventanaMs: 15 * 60_000, maximo: 60, mensaje: 'Demasiados pedidos. Espera unos minutos.' }), refresh);
router.get('/yo', auth, yo);

module.exports = router;
