import { clsx } from 'clsx';

export const cx = (...a) => clsx(...a);

export function dinero(n, simbolo = 'Bs') {
  const v = Number(n || 0);
  return `${simbolo} ${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function hora(fecha) {
  if (!fecha) return '';
  return new Date(fecha).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function fechaCorta(fecha) {
  if (!fecha) return '';
  return new Date(fecha).toLocaleDateString('es-BO', { day: '2-digit', month: 'short' });
}

export function fechaHora(fecha) {
  if (!fecha) return '';
  return new Date(fecha).toLocaleString('es-BO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function hoyISO() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export function haceMinutos(fecha) {
  return Math.max(0, Math.floor((Date.now() - new Date(fecha).getTime()) / 60000));
}

export function errorDe(err, porDefecto = 'Algo salió mal. Intenta de nuevo.') {
  return err?.response?.data?.mensaje ?? (err?.message === 'Network Error' ? 'Sin conexión con el servidor.' : porDefecto);
}

// "#d97706" -> "217 119 6"
export function hexACanales(hex) {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex || '');
  if (!m) return null;
  return `${parseInt(m[1], 16)} ${parseInt(m[2], 16)} ${parseInt(m[3], 16)}`;
}

// Texto oscuro o claro según la luminancia del acento.
export function tintaSobre(canales) {
  const [r, g, b] = canales.split(' ').map(Number);
  const l = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return l > 0.55 ? '23 38 43' : '255 255 255';
}

export function iniciales(nombre = '') {
  return nombre.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
}

export function normalizar(s = '') {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}
