// Cálculos puros de anulaciones/devoluciones.

// Cantidad vigente de una línea: lo pedido menos lo anulado.
function cantidadVigente(detalle) {
  return Number(detalle.cantidad) - Number(detalle.cantidad_anulada || 0);
}

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// Monto a devolver por las líneas indicadas de un pedido cobrado.
// cobrado = monto_recibido - cambio - propina (la propina nunca se devuelve);
// cada línea se prorratea con ratio = cobrado / total y el monto total se
// recorta a lo que aún queda por devolver (cobrado - total_devuelto).
function calcularDevolucion({ pedido, lineas }) {
  const total = Number(pedido.total) || 0;
  const cobrado = Math.max(
    0,
    Number(pedido.monto_recibido || 0) - Number(pedido.cambio || 0) - Number(pedido.propina || 0)
  );
  const ratio = total > 0 ? cobrado / total : 0;
  const disponible = Math.max(0, round2(cobrado - Number(pedido.total_devuelto || 0)));

  let restante = disponible;
  const resultado = lineas.map(({ detalle, cantidad }) => {
    const bruto = round2(Number(detalle.precio) * Number(cantidad) * ratio);
    const monto = Math.min(bruto, restante);
    restante = round2(restante - monto);
    return { detalle_pedido_id: detalle.id, cantidad: Number(cantidad), monto };
  });

  const monto = round2(resultado.reduce((s, l) => s + l.monto, 0));
  const puntosARestar = (cobrado > 0 && pedido.cliente_id)
    ? Math.floor((Number(pedido.puntos_ganados || 0) * monto) / cobrado)
    : 0;
  return { lineas: resultado, monto, puntosARestar };
}

module.exports = { cantidadVigente, calcularDevolucion };
