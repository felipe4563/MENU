const authService = require('./auth.service');

async function login(req, res, next) {
  try {
    const { email, contrasena } = req.body;
    if (!email || !contrasena) {
      return res.status(400).json({ ok: false, mensaje: 'Email y contraseña requeridos' });
    }
    const datos = await authService.login(email, contrasena);
    res.json({ ok: true, datos });
  } catch (err) {
    next(err);
  }
}

async function loginSucursal(req, res, next) {
  try {
    const { pre_token, sucursal_id } = req.body;
    if (!pre_token) {
      return res.status(400).json({ ok: false, mensaje: 'pre_token requerido' });
    }
    const datos = await authService.loginConSucursal(pre_token, sucursal_id);
    res.json({ ok: true, datos });
  } catch (err) {
    next(err);
  }
}

async function refresh(req, res, next) {
  try {
    const { refresh_token } = req.body;
    if (!refresh_token) return res.status(400).json({ ok: false, mensaje: 'refresh_token requerido' });
    const datos = await authService.refresh(refresh_token);
    res.json({ ok: true, datos });
  } catch (err) {
    if (err.status === 401 && err.codigo === 'SESION_REEMPLAZADA') {
      return res.status(401).json({ ok: false, codigo: err.codigo, mensaje: err.message });
    }
    next(err);
  }
}

async function usuariosPin(req, res, next) {
  try {
    const datos = await authService.usuariosConPin(req.body?.dispositivo_token);
    res.json({ ok: true, datos });
  } catch (err) {
    next(err);
  }
}

// PIN incorrecto: se avisa cuántos intentos quedan antes del bloqueo.
function errorPin(err, res, next) {
  if (err.status === 401 && err.intentos_restantes !== undefined) {
    return res.status(401).json({ ok: false, mensaje: err.message, intentos_restantes: err.intentos_restantes });
  }
  next(err);
}

async function entrarPin(req, res, next) {
  try {
    const { dispositivo_token, usuario_id, pin } = req.body || {};
    const datos = await authService.entrarConPin(dispositivo_token, usuario_id, pin);
    res.json({ ok: true, datos });
  } catch (err) {
    errorPin(err, res, next);
  }
}

async function entrarPinMismo(req, res, next) {
  try {
    const datos = await authService.entrarConPinMismo(req.usuario, req.body?.pin);
    res.json({ ok: true, datos });
  } catch (err) {
    errorPin(err, res, next);
  }
}

function yo(req, res) {
  res.json({ ok: true, datos: req.usuario });
}

module.exports = { login, loginSucursal, refresh, yo, usuariosPin, entrarPin, entrarPinMismo };
