import { imprimirHtml } from './imprimirHtml';
import { imprimirBluetoothAdelanto } from './rawbt';
import { METODO_TICKET } from '../lib/metodosPago';
import { partesFecha } from '../lib/reservas';

const _esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Lo que lleva el comprobante de un adelanto: la reserva ya actualizada (con
// sus montos) y el pago recién cobrado. Lo usan la versión HTML y la ESC/POS.
export function datosTicketAdelanto(reserva, pago) {
  const { fecha, hora } = partesFecha(reserva.fecha_hora);
  const [a, m, d] = fecha.split('-');
  const num = (v) => Number(v || 0);
  return {
    reserva_id: reserva.id,
    nombre_cliente: reserva.nombre_cliente,
    personas: reserva.personas,
    fecha: `${d}/${m}/${a}`,
    hora,
    items: (reserva.items ?? []).map((i) => ({ nombre: i.nombre, cantidad: num(i.cantidad), precio: num(i.precio) })),
    total_platos: num(reserva.total_platos),
    adelantado: num(reserva.adelantado),
    saldo: num(reserva.saldo),
    monto: num(pago.monto),
    metodo_pago: pago.metodo_pago,
    monto_recibido: pago.metodo_pago === 'efectivo' && pago.monto_recibido != null ? num(pago.monto_recibido) : null,
    cambio: num(pago.cambio),
    cajero: pago.usuario?.nombre ?? '',
    cobrado_en: new Date(pago.creado_en ?? Date.now()).toLocaleString('es-BO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
  };
}

// Versión HTML (window.print), mismo patrón que ticketDevolucion.js.
export function imprimirTicketAdelantoHtml(d, config = {}) {
  const sym = config.simbolo_moneda ?? 'Bs';
  const m = (v) => `${sym} ${Number(v || 0).toFixed(2)}`;
  const fila = (izq, der, clase = '') => `<div class="fila ${clase}"><span>${_esc(izq)}</span><span>${_esc(der)}</span></div>`;
  const platos = d.items.map((i) => `
    <tr>
      <td>${i.cantidad}x ${_esc(i.nombre)}</td>
      <td style="text-align:right">${(i.precio * i.cantidad).toFixed(2)}</td>
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
    .titulo { font-size: 13px; font-weight: 700; letter-spacing: 1px; margin: 4px 0 2px; }
    hr { border: none; border-top: 1px dashed #666; margin: 4px 0; }
    .fila { display: flex; justify-content: space-between; gap: 6px; }
    .fuerte { font-weight: 700; }
    .grande { font-size: 14px; font-weight: 700; }
    table { width: 100%; border-collapse: collapse; }
    td { padding: 1px 0; vertical-align: top; }
    @media print { @page { margin: 0; } }
  </style>
</head>
<body>
  <div class="centro nombre">${_esc(config.nombre_negocio ?? 'Restaurante')}</div>
  <div class="centro titulo">ADELANTO DE RESERVA</div>
  <div class="centro">Reserva #${d.reserva_id}</div>
  <hr/>
  <div class="fuerte">${_esc(d.nombre_cliente)}</div>
  ${fila('Fecha', d.fecha)}
  ${fila('Hora', d.hora)}
  ${d.personas ? fila('Personas', d.personas) : ''}
  ${d.items.length ? `<hr/><div class="centro fuerte">PLATOS</div><table><tbody>${platos}</tbody></table>${fila('Total platos', m(d.total_platos))}` : ''}
  <hr/>
  ${fila('Adelanto', m(d.monto), 'grande')}
  ${d.adelantado > d.monto + 0.005 ? fila('Total adelantado', m(d.adelantado)) : ''}
  ${d.items.length ? fila('Saldo', m(d.saldo), 'fuerte') : '<div>Queda como garantía de la reserva</div>'}
  ${fila('Método', METODO_TICKET[d.metodo_pago] ?? d.metodo_pago)}
  ${d.monto_recibido != null ? fila('Recibido', m(d.monto_recibido)) + fila('Cambio', m(d.cambio)) : ''}
  ${fila('Cajero', d.cajero || '—')}
  <hr/>
  <div class="centro">${_esc(d.cobrado_en)}</div>
  <div style="height:28px"></div>
</body>
</html>`;

  imprimirHtml(html);
}

// Imprime el comprobante por el canal de la caja donde se cobró, que viene en
// la respuesta del cobro (`reserva.impresion`): por Bluetooth si esa caja
// imprime por Bluetooth; si no, el diálogo de impresión del navegador (el
// agente de la PC solo sabe imprimir ventas, comandas y cierres). Nada si la
// caja tiene apagado el ticket de cliente.
export async function imprimirAdelanto(reserva, pago, config = {}) {
  if (!reserva || !pago) return;
  const caja = reserva.impresion;
  if (caja?.imprimir_ticket_cliente === false) return;
  const datos = datosTicketAdelanto(reserva, pago);
  if (caja?.modo_impresion === 'bluetooth') return imprimirBluetoothAdelanto(datos, config, caja);
  imprimirTicketAdelantoHtml(datos, config);
}
