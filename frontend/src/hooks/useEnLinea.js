import { useSyncExternalStore } from 'react';

// ¿Hay conexión con el servidor? No alcanza con navigator.onLine: en un local
// el wifi puede seguir conectado aunque se haya cortado el internet. Por eso
// también cuenta lo que pasa con los pedidos al servidor (api/cliente.js
// llama a marcarServidor): si uno falla sin respuesta, se da por caído; con
// la siguiente respuesta, vuelve.
let servidor = true;
const oyentes = new Set();
const avisar = () => oyentes.forEach((f) => f());

// Mientras el servidor está caído se le pregunta cada 15 s si volvió, aunque
// la pantalla no pida nada (si no, el aviso quedaría hasta el próximo pedido).
const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001/api/v1';
let sondeo = null;
function sondear() {
  clearInterval(sondeo);
  sondeo = setInterval(async () => {
    try {
      const r = await fetch(`${BASE}/pwa/manifest.webmanifest`, { cache: 'no-store' });
      if (r.ok) marcarServidor(true);
    } catch { /* sigue caído */ }
  }, 15000);
}

export function marcarServidor(ok) {
  if (servidor === ok) return;
  servidor = ok;
  if (ok) clearInterval(sondeo);
  else sondear();
  avisar();
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { servidor = true; avisar(); });
  window.addEventListener('offline', avisar);
}

const suscribir = (f) => { oyentes.add(f); return () => oyentes.delete(f); };
const estado = () => navigator.onLine && servidor;

export function useEnLinea() {
  return useSyncExternalStore(suscribir, estado, () => true);
}
