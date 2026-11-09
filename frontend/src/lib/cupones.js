// Textos y enlaces de los cupones del cliente (cobro y ficha).

const hoyBolivia = () => new Date(Date.now() - 4 * 3600 * 1000).toISOString().slice(0, 10);
const diasHasta = (fecha) => Math.round((new Date(`${fecha}T00:00:00Z`) - new Date(`${hoyBolivia()}T00:00:00Z`)) / 86400000);

// { texto: 'vence mañana', urgente: true } — urgente si vence en 3 días o menos.
export function vencimiento(fecha) {
  if (!fecha) return { texto: 'sin vencimiento', urgente: false };
  const d = diasHasta(fecha);
  if (d < 0) return { texto: 'vencido', urgente: true };
  if (d === 0) return { texto: 'vence hoy', urgente: true };
  if (d === 1) return { texto: 'vence mañana', urgente: true };
  if (d <= 3) return { texto: `vence en ${d} días`, urgente: true };
  return { texto: `vence el ${new Date(`${fecha}T12:00`).toLocaleDateString('es-BO', { day: 'numeric', month: 'short' })}`, urgente: false };
}

// Número para wa.me: los celulares de Bolivia (8 dígitos, empiezan en 6 o 7)
// llevan el 591 adelante. null si no parece un celular.
export function numeroWhatsApp(telefono) {
  const d = String(telefono || '').replace(/\D/g, '');
  if (/^[67]\d{7}$/.test(d)) return `591${d}`;
  if (/^591[67]\d{7}$/.test(d)) return d;
  return d.length >= 10 ? d : null;
}

// Enlace que abre WhatsApp con el recordatorio del cupón ya escrito.
export function whatsappCupon({ telefono, cliente, negocio, cupon }) {
  const numero = numeroWhatsApp(telefono);
  if (!numero) return null;
  const nombre = String(cliente || '').split(' ')[0];
  const premio = cupon.descripcion ? `: ${cupon.descripcion}` : '';
  const { texto } = vencimiento(cupon.fecha_expiracion);
  const msj = `Hola ${nombre}, tienes un cupón sin usar en ${negocio || 'nuestro restaurante'}${premio} (código ${cupon.codigo}). Tu cupón ${texto}. ¡Te esperamos!`;
  return `https://wa.me/${numero}?text=${encodeURIComponent(msj)}`;
}
