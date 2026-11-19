// Ayudas de reservas compartidas por el salón y la pantalla de reservas.

// Una mesa se ve reservada desde una hora antes de la reserva hasta media
// hora después (si no llegaron todavía).
export const ANTES_MIN = 60;
export const TOLERANCIA_MIN = 30;

export const ESTADOS_RESERVA = {
  pendiente: { nombre: 'Por llegar', tono: 'bg-aji/20 text-tinta' },
  llego: { nombre: 'Llegaron', tono: 'bg-hierba/15 text-hierba' },
  cancelada: { nombre: 'Cancelada', tono: 'bg-hundido text-tenue' },
  no_vino: { nombre: 'No vino', tono: 'bg-locoto/10 text-locoto' },
};

// La reserva por llegar que tiene ahora la mesa, o null.
export function reservaDeMesa(reservas, mesaId, ahora = Date.now()) {
  return (reservas ?? []).find((r) => {
    if (r.estado !== 'pendiente' || r.mesa_id !== mesaId) return false;
    const t = new Date(r.fecha_hora).getTime();
    return ahora >= t - ANTES_MIN * 60000 && ahora <= t + TOLERANCIA_MIN * 60000;
  }) ?? null;
}

// Ya pasó la hora (con la tolerancia) y no llegaron.
export const atrasada = (r, ahora = Date.now()) => r.estado === 'pendiente' && ahora > new Date(r.fecha_hora).getTime() + TOLERANCIA_MIN * 60000;

// 'yyyy-mm-dd' + n días.
export function sumarDias(ymd, n) {
  const d = new Date(`${ymd}T12:00:00`);
  d.setDate(d.getDate() + n);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

// Fecha ISO de la reserva → { fecha: 'yyyy-mm-dd', hora: 'HH:MM' } en hora local.
export function partesFecha(iso) {
  const d = new Date(iso);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString();
  return { fecha: local.slice(0, 10), hora: local.slice(11, 16) };
}

// Cuándo pasan a cocina los platos de una reserva (null: lo que diga Ajustes).
export const ENVIOS_COCINA = [
  { valor: null, etiqueta: 'Como en Ajustes' },
  { valor: 'al_llegar', etiqueta: 'Al llegar' },
  { valor: 'antes', etiqueta: 'Antes de la hora' },
  { valor: 'manual', etiqueta: 'Cuando lo mande' },
];

// Reserva activa (por llegar o ya llegaron).
export const reservaActiva = (r) => ['pendiente', 'llego'].includes(r.estado);

// "2× Pique macho · 1× Sopa de maní"
export const resumenPlatos = (items = []) => items.map((i) => `${i.cantidad}× ${i.nombre}`).join(' · ');

export const EN_COCINA_TEXTO = 'Ya está en cocina: los cambios se hacen en el pedido';

// Platos guardados de la reserva → líneas editables.
export const lineasDeReserva = (items = []) => items.map((i) => ({
  id: `r${i.id}`, clave: `r${i.id}`,
  producto_id: i.producto_id ?? undefined, combo_id: i.combo_id ?? undefined,
  nombre: i.nombre, precio: Number(i.precio), cantidad: Number(i.cantidad), nota: i.nota ?? null,
  peso: i.peso ? Number(i.peso) : undefined, opcion_ids: i.opcion_ids ?? undefined, opciones_por_producto: i.opciones_por_producto ?? undefined,
}));

// Líneas → `items` que espera el backend.
export const itemsParaGuardar = (lineas) => lineas.map((l) => ({
  producto_id: l.producto_id, combo_id: l.combo_id, cantidad: l.cantidad, nota: l.nota?.trim() || null,
  peso: l.peso, opcion_ids: l.opcion_ids, opciones_por_producto: l.opciones_por_producto,
}));

export const totalLineas = (lineas) => lineas.reduce((s, l) => s + l.precio * l.cantidad, 0);
