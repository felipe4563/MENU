// Nombres de las formas de pago, en un solo lugar. Al agregar una forma de
// pago nueva, se agrega acá y todas las pantallas y tickets la conocen.
// - corto: insignias, listas y exportes.
// - largo: cierre de caja (pantalla e impresión).
// - ticket: línea "Pago:" del ticket de venta.
// El agente de impresión (print-agent/) es un programa aparte y tiene su
// propia copia: si cambia un nombre de ticket, cambiarlo también allá.
export const METODOS_PAGO = {
  efectivo: { corto: 'Efectivo', largo: 'Efectivo', ticket: 'Efectivo' },
  qr: { corto: 'QR', largo: 'QR', ticket: 'QR / Transferencia' },
  app_externa: { corto: 'App', largo: 'App externa', ticket: 'Pagado en la app' },
  mixto: { corto: 'Mixto', largo: 'Mixto', ticket: 'Mixto' },
  diferido: { corto: 'Por cobrar', largo: 'Pendiente de cobro', ticket: 'Pendiente de cobro' },
};

const mapa = (forma) => Object.fromEntries(Object.entries(METODOS_PAGO).map(([k, v]) => [k, v[forma]]));

export const METODO = mapa('corto');
export const METODO_LARGO = mapa('largo');
export const METODO_TICKET = mapa('ticket');

// Nombre de una forma de pago; si no se conoce, el valor tal cual.
export const nombreMetodo = (metodo, forma = 'corto') => METODOS_PAGO[metodo]?.[forma] ?? metodo ?? '';
