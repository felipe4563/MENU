// Cálculos puros de anulaciones/devoluciones.

// Cantidad vigente de una línea: lo pedido menos lo anulado.
function cantidadVigente(detalle) {
  return Number(detalle.cantidad) - Number(detalle.cantidad_anulada || 0);
}

module.exports = { cantidadVigente };
