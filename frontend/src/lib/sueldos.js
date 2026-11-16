// Textos de sueldos compartidos entre Equipo › Sueldos y Mi asistencia.
import { dinero } from './util';

export const MODALIDADES = [
  { valor: 'diario', etiqueta: 'Diario', por: 'por día' },
  { valor: 'semanal', etiqueta: 'Semanal', por: 'por semana' },
  { valor: 'quincenal', etiqueta: 'Quincenal', por: 'por quincena' },
  { valor: 'mensual', etiqueta: 'Mensual', por: 'al mes' },
];
const POR = Object.fromEntries(MODALIDADES.map((m) => [m.valor, m]));

export const textoSueldo = (s, moneda) => (!s || s.modalidad === 'ninguno'
  ? 'Sin sueldo'
  : `${POR[s.modalidad].etiqueta} · ${dinero(s.monto, moneda)} ${POR[s.modalidad].por}`);

// '2026-11-30' → '30 nov' (sin pasar por la zona horaria del navegador).
export const diaCorto = (f) => (f ? new Date(`${f}T12:00:00`).toLocaleDateString('es-BO', { day: 'numeric', month: 'short' }) : '');
export const diaLargo = (f) => (f ? new Date(`${f}T12:00:00`).toLocaleDateString('es-BO', { weekday: 'long', day: 'numeric', month: 'long' }) : '');
export const rango = (a, b) => (a === b ? diaCorto(a) : `${diaCorto(a)} al ${diaCorto(b)}`);

export const TIPOS_MOV = {
  pago: { etiqueta: 'Pago', signo: '−' },
  adelanto: { etiqueta: 'Adelanto', signo: '−' },
  bono: { etiqueta: 'Bono', signo: '+' },
  descuento: { etiqueta: 'Descuento', signo: '−' },
};

// Resumen del período en curso en una línea.
export function lineaPeriodo(p, moneda) {
  if (!p) return '';
  if (p.modalidad === 'diario') return '';
  const partes = [`${rango(p.desde, p.hasta)}: ${p.dias_trabajados} de ${p.dias_del_periodo} días`];
  if (p.faltas) partes.push(`${p.faltas} ${p.faltas === 1 ? 'falta' : 'faltas'} (−${dinero(p.descuento_faltas, moneda)})`);
  if (p.adelantos) partes.push(`adelantos ${dinero(p.adelantos, moneda)}`);
  return partes.join(' · ');
}
