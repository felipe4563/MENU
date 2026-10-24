const _esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export const MOTIVOS_DEVOLUCION = {
  demora: 'Demora',
  error_pedido: 'Error en el pedido',
  cliente_arrepentido: 'Cliente se arrepintió',
  producto_mal_estado: 'Producto en mal estado',
  otro: 'Otro',
};

export const FORMAS_DEVOLUCION = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  app: 'La devuelve la app',
  sin_dinero: 'Sin devolución de dinero',
};

// Comprobante de devolución (HTML + window.print), mismo patrón que ticketCierreCaja.js.
// `devolucion.items` puede traer `nombre` por ítem; si no, se resuelve contra pedido.detalles.
export function imprimirComprobanteDevolucion(pedido, devolucion, config = {}) {
  const nombre = config.nombre_negocio ?? 'Restaurante';
  const simbolo = config.simbolo_moneda ?? 'Bs';
  const detalles = pedido?.detalles ?? [];

  const nombreDe = (it) => {
    if (it.nombre) return it.nombre;
    const d = detalles.find((x) => x.id === it.detalle_pedido_id);
    if (!d) return 'Producto';
    return d.combo ? `Combo: ${d.combo.nombre}` : (d.producto?.nombre ?? 'Producto');
  };

  const fecha = new Date(devolucion.creado_en ?? Date.now()).toLocaleString('es-BO', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
  const monto = parseFloat(devolucion.monto ?? 0);

  const filas = (devolucion.items ?? []).map((it) => `
    <tr>
      <td>${_esc(nombreDe(it))}</td>
      <td style="text-align:center">x${it.cantidad}</td>
      <td style="text-align:right">${simbolo} ${parseFloat(it.monto ?? 0).toFixed(2)}</td>
    </tr>`).join('');

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Courier New', Courier, monospace; font-size: 11px; line-height: 1.3; width: 248px; margin: 0 auto; padding: 4px 4px 16px; color: #000; background: #fff; }
    .centro { text-align: center; }
    .nombre { font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; }
    .titulo { font-size: 12px; font-weight: 700; letter-spacing: 2px; margin: 4px 0; }
    hr { border: none; border-top: 1px dashed #666; margin: 4px 0; }
    .fila { display: flex; justify-content: space-between; gap: 6px; }
    table { width: 100%; border-collapse: collapse; }
    td { padding: 1px 0; vertical-align: top; }
    .total { font-size: 13px; font-weight: 700; border-top: 1px solid #000; margin-top: 3px; padding-top: 3px; }
    @media print { @page { margin: 0; } }
  </style>
</head>
<body>
  <div class="centro nombre">${_esc(nombre)}</div>
  <div class="centro titulo">COMPROBANTE DE DEVOLUCIÓN</div>
  <hr/>
  <div class="fila"><span>Pedido</span><span>#${pedido?.id ?? ''}</span></div>
  <div class="fila"><span>Fecha</span><span>${fecha}</span></div>
  <div class="fila"><span>Cajero</span><span>${_esc(devolucion.usuario?.nombre ?? '—')}</span></div>
  <div class="fila"><span>Motivo</span><span>${_esc(MOTIVOS_DEVOLUCION[devolucion.motivo] ?? devolucion.motivo)}</span></div>
  ${devolucion.nota ? `<div>Nota: ${_esc(devolucion.nota)}</div>` : ''}
  <hr/>
  <table><tbody>${filas}</tbody></table>
  <hr/>
  <div class="fila"><span>Forma</span><span>${_esc(FORMAS_DEVOLUCION[devolucion.forma] ?? devolucion.forma)}</span></div>
  <div class="fila total"><span>TOTAL DEVUELTO</span><span>${simbolo} ${monto.toFixed(2)}</span></div>
  <hr/>
  <div class="centro">— firma del cliente —</div>
  <div style="height:28px"></div>
</body>
</html>`;

  const win = window.open('', '_blank', 'width=420,height=700');
  if (win) { win.document.write(html); win.document.close(); win.focus(); setTimeout(() => win.print(), 400); }
}
