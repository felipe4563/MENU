const bcrypt = require('bcryptjs');
const { Usuario, Rol } = require('../../models');

// Devuelve el usuario sin el hash del PIN, con tiene_pin en su lugar.
function conTienePin(u) {
  const { pin, ...resto } = u.toJSON();
  return { ...resto, tiene_pin: !!pin };
}

async function obtener(req, res, next) {
  try {
    const u = await Usuario.findByPk(req.usuario.id, {
      attributes: { exclude: ['contrasena'] },
      include: [{ model: Rol, as: 'rol', attributes: ['id', 'nombre'] }],
    });
    res.json({ ok: true, datos: conTienePin(u) });
  } catch (err) { next(err); }
}

async function actualizar(req, res, next) {
  try {
    const { nombre, email, avatar } = req.body;
    if (!nombre && !email && avatar === undefined) {
      return res.status(400).json({ ok: false, mensaje: 'Proporciona al menos nombre, email o avatar' });
    }
    const u = await Usuario.findByPk(req.usuario.id);
    const datos = {};
    if (nombre) datos.nombre = nombre.trim();
    if (email)  datos.email  = email.trim().toLowerCase();
    if (avatar !== undefined) datos.avatar = avatar || null;

    // Check email uniqueness if changing
    if (datos.email && datos.email !== u.email) {
      const existe = await Usuario.findOne({ where: { email: datos.email } });
      if (existe) return res.status(409).json({ ok: false, mensaje: 'Ese correo ya está en uso' });
    }

    await u.update(datos);
    // Return updated user without sensitive fields
    const actualizado = await Usuario.findByPk(u.id, {
      attributes: { exclude: ['contrasena'] },
      include: [{ model: Rol, as: 'rol', attributes: ['id', 'nombre'] }],
    });
    res.json({ ok: true, datos: conTienePin(actualizado) });
  } catch (err) { next(err); }
}

async function cambiarContrasena(req, res, next) {
  try {
    const { contrasena_actual, nueva_contrasena } = req.body;
    if (!contrasena_actual || !nueva_contrasena) {
      return res.status(400).json({ ok: false, mensaje: 'contrasena_actual y nueva_contrasena son requeridos' });
    }
    if (nueva_contrasena.length < 6) {
      return res.status(400).json({ ok: false, mensaje: 'La nueva contraseña debe tener al menos 6 caracteres' });
    }

    const u = await Usuario.findByPk(req.usuario.id);
    const valida = await bcrypt.compare(contrasena_actual, u.contrasena);
    if (!valida) {
      return res.status(401).json({ ok: false, mensaje: 'La contraseña actual es incorrecta' });
    }

    await u.update({ contrasena: await bcrypt.hash(nueva_contrasena, 10), debe_cambiar_contrasena: 0 });
    res.json({ ok: true, datos: null });
  } catch (err) { next(err); }
}

async function guardarPin(req, res, next) {
  try {
    const { contrasena, pin } = req.body;
    if (typeof pin !== 'string' || !/^\d{4}$/.test(pin)) {
      return res.status(400).json({ ok: false, mensaje: 'El PIN son 4 números' });
    }
    const u = await Usuario.findByPk(req.usuario.id);
    const valida = typeof contrasena === 'string' && await bcrypt.compare(contrasena, u.contrasena);
    if (!valida) {
      return res.status(401).json({ ok: false, mensaje: 'La contraseña no es correcta' });
    }
    await u.update({ pin: await bcrypt.hash(pin, 10), pin_intentos: 0, pin_bloqueado: 0 });
    res.json({ ok: true, datos: { tiene_pin: true } });
  } catch (err) { next(err); }
}

module.exports = { obtener, actualizar, cambiarContrasena, guardarPin };
