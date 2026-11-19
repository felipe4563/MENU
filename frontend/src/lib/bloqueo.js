// Pantalla de bloqueo: ¿esta pestaña ya se desbloqueó?
//
// La marca vive en sessionStorage: sobrevive a un F5 pero se pierde al cerrar
// la pestaña o la app. Así, abrir el sistema de nuevo pide el PIN aunque la
// sesión siga guardada.
//
// El verificador local deja entrar sin internet al último usuario que entró
// con PIN en este aparato: se guarda un PBKDF2 del PIN (nunca el PIN).
import { useSyncExternalStore } from 'react';

const MARCA = 'rusoft-desbloqueado';
// Bloqueo a propósito (botón Bloquear o inactividad) en esta pestaña: sin esta
// marca, el bloqueo viene del arranque (pestaña nueva).
const MARCA_A_MANO = 'rusoft-bloqueado-a-mano';
const CLAVE_LOCAL = 'rusoft-pin-local';
const ITERACIONES = 150000;
const MAX_INTENTOS_LOCALES = 5;

const oyentes = new Set();
const avisar = () => oyentes.forEach((f) => f());
const suscribir = (f) => { oyentes.add(f); return () => oyentes.delete(f); };

export function estaDesbloqueado() {
  try { return sessionStorage.getItem(MARCA) === '1'; } catch { return true; }
}

export function marcarDesbloqueado() {
  try {
    sessionStorage.setItem(MARCA, '1');
    sessionStorage.removeItem(MARCA_A_MANO);
  } catch { /* sin sessionStorage */ }
  avisar();
}

export function bloquear() {
  try {
    sessionStorage.removeItem(MARCA);
    sessionStorage.setItem(MARCA_A_MANO, '1');
  } catch { /* sin sessionStorage */ }
  avisar();
}

/** ¿El bloqueo de esta pestaña fue a propósito (y no al abrirla)? */
export function bloqueadoAMano() {
  try { return sessionStorage.getItem(MARCA_A_MANO) === '1'; } catch { return false; }
}

export function useBloqueado() {
  return !useSyncExternalStore(suscribir, estaDesbloqueado, () => true);
}

// ---------- Verificador local (sin internet) ----------

const aBase64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const deBase64 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

async function derivar(pin, sal) {
  const llave = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: sal, iterations: ITERACIONES }, llave, 256);
}

function leer() {
  try { return JSON.parse(localStorage.getItem(CLAVE_LOCAL)) || null; } catch { return null; }
}

/** Guarda el verificador del PIN de este usuario (reemplaza al anterior). */
export async function guardarVerificador(usuario_id, pin) {
  try {
    const sal = crypto.getRandomValues(new Uint8Array(16));
    const hash = await derivar(pin, sal);
    localStorage.setItem(CLAVE_LOCAL, JSON.stringify({ usuario_id, sal: aBase64(sal), hash: aBase64(hash) }));
  } catch { /* sin crypto.subtle o sin localStorage: solo se podrá entrar con internet */ }
}

/** ¿Se puede revisar el PIN de este usuario sin internet? */
export function puedeVerificarLocal(usuario_id) {
  const v = leer();
  return Boolean(v && v.usuario_id === usuario_id && (v.intentos ?? 0) < MAX_INTENTOS_LOCALES);
}

/** Revisa el PIN contra el verificador guardado. Tras 5 fallos deja de aceptar (pide internet). */
export async function verificarLocal(usuario_id, pin) {
  const v = leer();
  if (!v || v.usuario_id !== usuario_id || (v.intentos ?? 0) >= MAX_INTENTOS_LOCALES) return false;
  let hash;
  try { hash = new Uint8Array(await derivar(pin, deBase64(v.sal))); } catch { return false; }
  const guardado = deBase64(v.hash);
  const igual = hash.length === guardado.length && hash.every((b, i) => b === guardado[i]);
  localStorage.setItem(CLAVE_LOCAL, JSON.stringify({ ...v, intentos: igual ? 0 : (v.intentos ?? 0) + 1 }));
  return igual;
}

/** Borra el verificador. Con `salvoUsuarioId`, lo deja si es de ese usuario. */
export function borrarVerificador(salvoUsuarioId) {
  try {
    if (salvoUsuarioId != null && leer()?.usuario_id === salvoUsuarioId) return;
    localStorage.removeItem(CLAVE_LOCAL);
  } catch { /* sin localStorage */ }
}
