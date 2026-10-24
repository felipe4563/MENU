export const vigente = (d) => Number(d.cantidad) - Number(d.cantidad_anulada || 0);

// Un pedido admite anulaciones si no está cancelado/pendiente_pago y le queda alguna línea vigente.
export function puedeAnularPedido(pedido) {
  if (!pedido || ['cancelado', 'pendiente_pago'].includes(pedido.estado)) return false;
  return (pedido.detalles ?? []).some((d) => vigente(d) > 0);
}
