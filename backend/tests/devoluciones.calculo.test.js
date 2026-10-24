const { calcularDevolucion } = require('../src/modules/devoluciones/calculo');

const base = { total: 100, monto_recibido: 100, cambio: 0, propina: 0, total_devuelto: 0, puntos_ganados: 0, cliente_id: null };
const linea = (cantidad, precio = 10) => ({ detalle: { id: 1, precio, cantidad: 5, cantidad_anulada: 0 }, cantidad });

describe('calcularDevolucion', () => {
  it('total 100, cobrado 100, anular 2 x 10 -> 20', () => {
    const r = calcularDevolucion({ pedido: base, lineas: [linea(2)] });
    expect(r.monto).toBe(20);
    expect(r.lineas).toEqual([{ detalle_pedido_id: 1, cantidad: 2, monto: 20 }]);
  });
  it('con descuento (cobrado 80) -> 16', () => {
    const r = calcularDevolucion({ pedido: { ...base, monto_recibido: 80 }, lineas: [linea(2)] });
    expect(r.monto).toBe(16);
  });
  it('la propina no se devuelve (recibido 105, propina 5) -> 20', () => {
    const r = calcularDevolucion({ pedido: { ...base, monto_recibido: 105, propina: 5 }, lineas: [linea(2)] });
    expect(r.monto).toBe(20);
  });
  it('recorta a cobrado - total_devuelto', () => {
    const r = calcularDevolucion({ pedido: { ...base, total_devuelto: 90 }, lineas: [linea(2)] });
    expect(r.monto).toBe(10);
    expect(r.lineas.reduce((s, l) => s + l.monto, 0)).toBeCloseTo(10, 2);
  });
  it('cobrado 0 -> monto 0 y puntos 0', () => {
    const r = calcularDevolucion({ pedido: { ...base, monto_recibido: 0, puntos_ganados: 10, cliente_id: 1 }, lineas: [linea(2)] });
    expect(r.monto).toBe(0);
    expect(r.puntosARestar).toBe(0);
  });
  it('puntos: ganados 10, devuelve 25 de 100 -> 2', () => {
    const r = calcularDevolucion({ pedido: { ...base, puntos_ganados: 10, cliente_id: 1 }, lineas: [linea(1, 25)] });
    expect(r.monto).toBe(25);
    expect(r.puntosARestar).toBe(2);
  });
  it('sin cliente -> puntos 0', () => {
    const r = calcularDevolucion({ pedido: { ...base, puntos_ganados: 10 }, lineas: [linea(1, 25)] });
    expect(r.puntosARestar).toBe(0);
  });
});
