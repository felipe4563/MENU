const test = require('node:test');
const assert = require('node:assert/strict');
const ticket = require('../ticketPagoParcial');

// Esc de prueba: misma interfaz que la de agent.js, pero guarda el texto por
// líneas en vez de bytes.
class EscPrueba {
  constructor(cols) { this.COLS = cols || 48; this.lineas = []; this.actual = ''; }
  text(s) { this.actual += String(s != null ? s : ''); return this; }
  line(s) { this.text(s); this.lineas.push(this.actual); this.actual = ''; return this; }
  lf(n = 1) { for (let i = 0; i < n; i++) this.line(''); return this; }
  rule(c) { return this.line((c || '-').repeat(this.COLS)); }
  cols(l, r) {
    r = String(r != null ? r : ''); l = String(l != null ? l : '');
    const lw = this.COLS - r.length;
    return this.line((l.length > lw ? l.substring(0, lw - 1) + '.' : l.padEnd(lw)) + r);
  }
  left() { return this; } center() { return this; } right() { return this; }
  bold() { return this; } normal() { return this; } dbl() { return this; } dblH() { return this; } dblW() { return this; }
  get texto() { return this.lineas.join('\n'); }
}

const datos = (pago_parcial) => ({
  pedido: { id: 7, tipo: 'mesa', mesa: { nombre: 'Mesa 3' }, total: '55.00' },
  config: { nombre_negocio: 'Sal y Brasas', simbolo_moneda: 'Bs.' },
  numero_orden_diario: 5,
  pago_parcial,
});

test('buildCaja con pago_parcial imprime el comprobante con PAGO PARCIAL y FALTA', () => {
  const t = new EscPrueba(48);
  ticket.pagoParcial(t, datos({
    pago_id: 1, numero: 1, persona: 'Juan', modo: 'platos', monto: 30, metodo_pago: 'efectivo',
    monto_recibido: 50, cambio: 20, pagado: 30, falta: 25, partes_iguales_de: null,
    items: [{ nombre: 'Plato A', cantidad: 1, subtotal: 30 }],
  }));
  const s = t.texto;
  assert.match(s, /SAL Y BRASAS/);
  assert.match(s, /PAGO PARCIAL/);
  assert.match(s, /MESA 3/);
  assert.match(s, /Persona: Juan/);
  assert.match(s, /1 PLATO A\s+30\.00/);
  assert.match(s, /Monto\s+Bs\. 30\.00/);
  assert.match(s, /Recibido\s+Bs\. 50\.00/);
  assert.match(s, /Cambio\s+Bs\. 20\.00/);
  assert.match(s, /Pagado\s+Bs\. 30\.00/);
  assert.match(s, /FALTA\s+Bs\. 25\.00/);
  // Sin el total ni la lista completa del pedido.
  assert.doesNotMatch(s, /TOTAL/);
  assert.doesNotMatch(s, /Parte de la cuenta/);
  // ASCII: el agente maneja su propia tabla de letras.
  assert.ok(/^[\x00-\x7F]*$/.test(s));
});

test('una parte sin platos dice "Parte de la cuenta" y por QR no lleva recibido ni cambio', () => {
  const t = new EscPrueba(32);
  ticket.pagoParcial(t, datos({
    pago_id: 2, numero: 2, persona: null, modo: 'iguales', monto: 40, metodo_pago: 'qr',
    monto_recibido: 40, cambio: 0, pagado: 70, falta: 0.5, partes_iguales_de: null, items: [],
  }));
  const s = t.texto;
  assert.match(s, /Parte de la cuenta/);
  assert.match(s, /QR/);
  assert.doesNotMatch(s, /Persona/);
  assert.doesNotMatch(s, /Recibido/);
  assert.match(s, /FALTA\s+Bs\. 0\.50/);
  assert.ok(t.lineas.every((l) => l.length <= 32));
});

test('bloquePartes lista una línea por parte', () => {
  const t = new EscPrueba(48);
  ticket.bloquePartes(t, [
    { numero: 1, persona: 'Ana', metodo_pago: 'efectivo', monto: 60 },
    { numero: 2, persona: null, metodo_pago: 'qr', monto: 40 },
  ], 'Bs.');
  const s = t.texto;
  assert.match(s, /PAGOS/);
  assert.match(s, /Parte 1 - Ana - Efectivo\s+Bs\. 60\.00/);
  assert.match(s, /Parte 2 - QR\s+Bs\. 40\.00/);
});
