// Notificaciones push (llegan aunque la app esté cerrada).
//
// Las claves VAPID (las que identifican a este servidor ante Google, Apple y
// Mozilla) se crean solas la primera vez y quedan en `configuraciones`, la
// privada cifrada con CONFIG_SECRET. Así cada restaurante tiene las suyas sin
// tocar el .env. Si se cambian, los dispositivos tienen que volver a activar
// las notificaciones.
//
// Enviar nunca rompe lo que lo provoca (una venta, un pedido): los errores se
// registran y se sigue.
const crypto = require('crypto');
const webpush = require('web-push');
const { QueryTypes } = require('sequelize');
const { sequelize, Configuracion, PushSuscripcion } = require('../../models');
const { cifrarSecreto, descifrarSecreto } = require('../../utils/secretos');

const CLAVE_PUBLICA = 'push_vapid_publica';
const CLAVE_PRIVADA = 'push_vapid_privada';

let claves = null; // { publica, privada }

async function _claves() {
  if (claves) return claves;
  const filas = await Configuracion.findAll({ where: { clave: [CLAVE_PUBLICA, CLAVE_PRIVADA] } });
  const valor = (k) => filas.find((f) => f.clave === k)?.valor;
  if (valor(CLAVE_PUBLICA) && valor(CLAVE_PRIVADA)) {
    claves = { publica: valor(CLAVE_PUBLICA), privada: descifrarSecreto(valor(CLAVE_PRIVADA)) };
  } else {
    const nuevas = webpush.generateVAPIDKeys();
    // Si dos procesos las crean a la vez, se queda la primera que se guardó.
    await sequelize.query('INSERT IGNORE INTO configuraciones (clave, valor) VALUES (?, ?), (?, ?)', {
      replacements: [CLAVE_PUBLICA, nuevas.publicKey, CLAVE_PRIVADA, cifrarSecreto(nuevas.privateKey)],
    });
    claves = null;
    return _claves();
  }
  return claves;
}

// Contacto que piden los servicios push (una URL https o un mailto).
const _contacto = () => (/^https:\/\//.test(process.env.PUBLIC_API_URL || '') ? process.env.PUBLIC_API_URL : 'mailto:soporte@rusoft.dev');

const _hash = (endpoint) => crypto.createHash('sha256').update(endpoint).digest('hex');

async function clavePublica() {
  return (await _claves()).publica;
}

function _validar(sub) {
  const ok = sub && typeof sub.endpoint === 'string' && /^https:\/\//.test(sub.endpoint) && sub.endpoint.length <= 2000
    && typeof sub.keys?.p256dh === 'string' && typeof sub.keys?.auth === 'string'
    && sub.keys.p256dh.length <= 255 && sub.keys.auth.length <= 255;
  if (!ok) throw Object.assign(new Error('Suscripción inválida'), { status: 400 });
}

/** Guarda (o pasa a este usuario) la suscripción de este dispositivo. */
async function suscribir(usuario_id, suscripcion, dispositivo) {
  _validar(suscripcion);
  const datos = {
    usuario_id,
    endpoint: suscripcion.endpoint,
    endpoint_hash: _hash(suscripcion.endpoint),
    p256dh: suscripcion.keys.p256dh,
    auth: suscripcion.keys.auth,
    dispositivo: dispositivo ? String(dispositivo).slice(0, 120) : null,
  };
  const ya = await PushSuscripcion.findOne({ where: { endpoint_hash: datos.endpoint_hash } });
  if (ya) await ya.update(datos);
  else await PushSuscripcion.create(datos);
  return { activo: true };
}

async function quitar(usuario_id, endpoint) {
  if (typeof endpoint !== 'string') throw Object.assign(new Error('Falta el endpoint'), { status: 400 });
  await PushSuscripcion.destroy({ where: { endpoint_hash: _hash(endpoint), usuario_id } });
}

/**
 * Manda a cada suscripción. payload: { titulo, cuerpo, url, etiqueta }.
 * Las que el servicio da por muertas (404/410: se desinstaló la app, se
 * revocó el permiso) se borran.
 */
async function _enviar(suscripciones, payload) {
  if (!suscripciones.length) return 0;
  const { publica, privada } = await _claves();
  const cuerpo = JSON.stringify(payload);
  let enviadas = 0;
  await Promise.all(suscripciones.map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        cuerpo,
        { TTL: 60 * 60, urgency: 'high', vapidDetails: { subject: _contacto(), publicKey: publica, privateKey: privada } },
      );
      enviadas++;
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) await PushSuscripcion.destroy({ where: { id: s.id } });
      else console.error(`Push: no se pudo enviar (${e.statusCode ?? e.message})`);
    }
  }));
  return enviadas;
}

async function aUsuarios(usuario_ids, payload) {
  const ids = [...new Set(usuario_ids.filter(Boolean))];
  if (!ids.length) return 0;
  return _enviar(await PushSuscripcion.findAll({ where: { usuario_id: ids } }), payload);
}

/**
 * A los usuarios activos con ese permiso que trabajan en la sucursal (o en
 * todas: los que no tienen ninguna sucursal asignada).
 */
async function aPermiso({ modulo, accion, sucursal_id }, payload) {
  const filas = await sequelize.query(`
    SELECT DISTINCT u.id FROM usuarios u
    JOIN roles_permisos rp ON rp.rol_id = u.rol_id
    JOIN permisos p ON p.id = rp.permiso_id AND p.modulo = :modulo AND p.accion = :accion
    WHERE u.activo = 1 AND (
      :sucursal IS NULL
      OR EXISTS (SELECT 1 FROM usuarios_sucursales us WHERE us.usuario_id = u.id AND us.sucursal_id = :sucursal)
      OR NOT EXISTS (SELECT 1 FROM usuarios_sucursales us WHERE us.usuario_id = u.id)
    )`, { replacements: { modulo, accion, sucursal: sucursal_id ?? null }, type: QueryTypes.SELECT });
  return aUsuarios(filas.map((f) => f.id), payload);
}

/** "Bs 45.00" con el símbolo del negocio. */
async function dinero(n) {
  const { obtenerPublica } = require('../configuracion/configuracion.service');
  const cfg = await obtenerPublica();
  return `${cfg.simbolo_moneda || cfg.moneda || 'Bs'} ${Number(n || 0).toFixed(2)}`;
}

/** Lo de arriba, sin esperar ni fallar: para llamar desde ventas, cocina… */
function avisar(fn) {
  Promise.resolve().then(fn).catch((e) => console.error('Push:', e.message));
}

async function probar(usuario_id) {
  const n = await aUsuarios([usuario_id], { titulo: 'Notificaciones activadas', cuerpo: 'Así te van a llegar los avisos del restaurante.', url: '/perfil', etiqueta: 'prueba' });
  if (!n) throw Object.assign(new Error('Este usuario no tiene ningún dispositivo con notificaciones activadas.'), { status: 409 });
  return { enviadas: n };
}

module.exports = { clavePublica, suscribir, quitar, aUsuarios, aPermiso, avisar, probar, dinero, _reiniciarClaves: () => { claves = null; } };
