// Instalar el sistema como app (PWA). Chrome y Edge (Android y computadora)
// avisan con `beforeinstallprompt` que se puede instalar: el aviso llega una
// sola vez, al cargar, así que se guarda acá (main.jsx importa este archivo)
// para usarlo cuando el usuario toque "Instalar". En iPhone y iPad no hay
// aviso: se instala a mano desde Compartir.
import { useSyncExternalStore } from 'react';

let aviso = null;
let recienInstalada = false;
const oyentes = new Set();
const avisar = () => oyentes.forEach((f) => f());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // sin el cartel propio del navegador: lo abre el botón
    aviso = e;
    avisar();
  });
  window.addEventListener('appinstalled', () => {
    aviso = null;
    recienInstalada = true;
    avisar();
  });
}

const ua = () => (typeof navigator === 'undefined' ? '' : navigator.userAgent);
// El iPad se presenta como Mac, pero con pantalla táctil.
export const esApple = () => /iPhone|iPad|iPod/.test(ua()) || (/Macintosh/.test(ua()) && navigator.maxTouchPoints > 1);
// Chrome, Edge y Firefox de iOS: solo Safari tenía "Agregar a inicio" antes de iOS 16.4.
export const esSafariApple = () => esApple() && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua());
const abiertaComoApp = () => typeof window !== 'undefined'
  && (window.matchMedia?.('(display-mode: standalone)').matches || window.matchMedia?.('(display-mode: window-controls-overlay)').matches || navigator.standalone === true);

/** 'instalada' | 'lista' (hay botón) | 'apple' (a mano) | 'manual' (menú del navegador) */
function estado() {
  if (abiertaComoApp() || recienInstalada) return 'instalada';
  if (aviso) return 'lista';
  return esApple() ? 'apple' : 'manual';
}

const suscribir = (f) => { oyentes.add(f); return () => oyentes.delete(f); };
export const useInstalarApp = () => useSyncExternalStore(suscribir, estado, () => 'manual');

/** Abre el cartel de instalación del navegador. Devuelve true si aceptó. */
export async function instalar() {
  if (!aviso) return false;
  const e = aviso;
  aviso = null; // cada aviso sirve una sola vez
  e.prompt();
  const { outcome } = await e.userChoice;
  avisar();
  return outcome === 'accepted';
}
