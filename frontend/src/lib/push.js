// Notificaciones push en este dispositivo (Mi perfil).
// En iPhone y iPad solo funcionan con la app instalada en la pantalla de
// inicio (iOS 16.4 o más nuevo); en Android y computadora, en Chrome, Edge o
// Firefox, instalada o no.
import api from '../api/cliente';
import { esApple } from './instalarApp';

const instalada = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;

/** 'ok' | 'sin-soporte' | 'instalar' (iPhone/iPad sin instalar) */
export function soportePush() {
  const tiene = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (esApple() && !instalada()) return 'instalar';
  return tiene ? 'ok' : 'sin-soporte';
}

// El service worker solo existe en la versión instalable (el build), no en
// desarrollo: ahí no se puede activar.
async function registro() {
  const r = await navigator.serviceWorker.getRegistration();
  if (!r) throw new Error('Esta versión no tiene service worker (en desarrollo no funciona: probar con el build).');
  return navigator.serviceWorker.ready;
}

// La clave del servidor viene en base64url y PushManager la pide en bytes.
function bytes(base64url) {
  const b64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

const nombreDispositivo = () => {
  const ua = navigator.userAgent;
  const so = /iPhone/.test(ua) ? 'iPhone' : /iPad|Macintosh.*Mobile/.test(ua) || (esApple() && /Macintosh/.test(ua)) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'Mac' : 'Otro';
  const nav = /Edg\//.test(ua) ? 'Edge' : /Firefox|FxiOS/.test(ua) ? 'Firefox' : /Chrome|CriOS/.test(ua) ? 'Chrome' : /Safari/.test(ua) ? 'Safari' : '';
  return `${so}${nav ? ` · ${nav}` : ''}`;
};

/** La suscripción de este dispositivo, si hay. */
export async function suscripcionActual() {
  if (soportePush() !== 'ok') return null;
  const r = await navigator.serviceWorker.getRegistration();
  return r ? r.pushManager.getSubscription() : null;
}

/** Pide permiso y activa. Devuelve 'activado' | 'denegado'. */
export async function activarPush() {
  const permiso = await Notification.requestPermission();
  if (permiso !== 'granted') return 'denegado';
  const reg = await registro();
  const { data } = await api.get('/push/clave');
  const clave = bytes(data.datos.clave);
  let sub = await reg.pushManager.getSubscription();
  // Si la suscripción es de otra clave (se cambiaron en el servidor), se rehace.
  const actual = sub?.options?.applicationServerKey;
  if (sub && actual && new Uint8Array(actual).join() !== clave.join()) { await sub.unsubscribe(); sub = null; }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: clave });
  await api.post('/push/suscripcion', { suscripcion: sub.toJSON(), dispositivo: nombreDispositivo() });
  return 'activado';
}

export async function desactivarPush() {
  const sub = await suscripcionActual();
  if (!sub) return;
  await api.delete('/push/suscripcion', { data: { endpoint: sub.endpoint } }).catch(() => {});
  await sub.unsubscribe();
}

export const probarPush = () => api.post('/push/probar');

/**
 * Al iniciar sesión: si el dispositivo ya tenía las notificaciones activadas,
 * pasan al usuario que entró. Al cerrar sesión se sacan del servidor, para
 * que no le lleguen al siguiente que use el aparato.
 */
export async function vincularPush() {
  try {
    const sub = await suscripcionActual();
    if (sub && Notification.permission === 'granted') await api.post('/push/suscripcion', { suscripcion: sub.toJSON(), dispositivo: nombreDispositivo() });
  } catch { /* sin internet: se vincula la próxima vez */ }
}

// sinRefrescar: al cambiar de usuario en la pantalla de bloqueo la sesión del
// anterior puede estar vencida; un 401 acá no debe refrescar ni cerrar la
// sesión del que acaba de entrar (api/cliente.js salta el refresco con _reintentado).
export async function desvincularPush({ sinRefrescar = false } = {}) {
  try {
    const sub = await suscripcionActual();
    if (sub) await api.delete('/push/suscripcion', { data: { endpoint: sub.endpoint }, timeout: 4000, ...(sinRefrescar && { _reintentado: true }) });
  } catch { /* sin internet: el servidor la sigue teniendo hasta que entre otro */ }
}
