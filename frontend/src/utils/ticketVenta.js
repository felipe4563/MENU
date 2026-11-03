import { imprimirHtml } from './imprimirHtml';
// Ancho real de la columna de producto en el ticket de venta: col-prod es
// 46% de los 248px del body. Si el nombre no entra a fsMax en una sola
// línea, se achica hasta fsMin — el CSS de .prod-nombre (nowrap/ellipsis)
// es la red de seguridad si ni así alcanza.
function _fsNombre(nombre, anchoColPx, fsMax) {
  const fsMin = 8;
  if (!nombre) return fsMax;
  // Ancho aproximado de un carácter en una fuente monoespaciada: ~0.6 del font-size.
  const fsNecesario = Math.floor((anchoColPx - 4) / (nombre.length * 0.6));
  return Math.max(fsMin, Math.min(fsMax, fsNecesario));
}

// Agrupa las opciones elegidas de un combo por producto_id, para poder
// mostrarlas junto a cada producto en el listado del combo (ej. "2x Papas
// (Grande)"). `comboOpciones` viene de detalle.combo_opciones (ver
// INCLUDE_PEDIDO_COMPLETO en ventas.service.js).
function _opcionesPorProducto(comboOpciones) {
  const mapa = {};
  (comboOpciones || []).forEach((co) => {
    if (!co.opcion?.nombre) return;
    (mapa[co.producto_id] ??= []).push(co.opcion.nombre);
  });
  return mapa;
}

export function imprimirTicketVenta(pedido, pago, config = {}, numeroOrdenDiario = null) {
  const nombre  = config.nombre_negocio  ?? 'Restaurante';
  const dir     = config.direccion       ?? '';
  const tel     = config.telefono        ?? '';
  const simbolo = config.simbolo_moneda  ?? 'Bs.';

  const ahora = new Date();
  const fecha = ahora.toLocaleDateString('es-BO', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const hora  = ahora.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' });

  const esLlevar = pedido.tipo === 'llevar';
  const esDelivery = pedido.tipo === 'delivery';
  const nOrden   = String(
    numeroOrdenDiario != null ? numeroOrdenDiario : (esLlevar ? (pedido.numero_llevar ?? pedido.id) : pedido.id)
  ).padStart(3, '0');
  const METODO_PAGO_LABEL = { qr: 'QR / Transferencia', app_externa: 'Pagado en la app', diferido: 'Pendiente de cobro' };
  const metodoPagoLabel = METODO_PAGO_LABEL[pago.metodo_pago] ?? 'Efectivo';

  const detalles = pedido.detalles ?? [];
  const subtotalLineas = detalles.reduce((s, d) => s + parseFloat(d.precio) * d.cantidad, 0);

  // El total realmente cobrado se deriva de monto_recibido - cambio (siempre
  // coherente, tanto en efectivo como en QR — ver _finalizarVenta en el
  // backend), en vez de confiar en pago.total, que no reflejaba descuentos,
  // cupón ni puntos canjeados.
  const montoRecibido = pedido.monto_recibido != null ? parseFloat(pedido.monto_recibido) : null;
  const cambio = parseFloat(pedido.cambio || 0);
  const total = montoRecibido != null ? montoRecibido - cambio : (pago.total ?? subtotalLineas);

  const descuento = parseFloat(pedido.descuento || 0);
  const propina = parseFloat(pedido.propina || 0);
  const descuentoCupon = parseFloat(pedido.descuento_cupon || 0);
  const puntosGanados = pedido.puntos_ganados || 0;
  const puntosCanjeados = pedido.puntos_canjeados || 0;
  // El descuento en Bs por canje de puntos no se guarda como columna propia:
  // se despeja de la misma fórmula que usa _finalizarVenta para el total neto.
  const descuentoPuntos = Math.max(0, subtotalLineas - descuento - descuentoCupon + propina - total);
  const hayAjustes = descuento > 0 || descuentoCupon > 0 || descuentoPuntos > 0 || propina > 0;
  // Cupón generado por la promo de cumpleaños (ver cumpleanos.job.js en el
  // backend — código con prefijo "CUMPLE"): además de la línea normal de
  // descuento, un banner festivo con el nombre del cliente.
  const esCuponCumple = pedido.cupon && /^CUMPLE/.test(pedido.cupon.codigo);

  const filas = detalles.map(d => {
    const esCombo = !!d.combo;
    const esPesable = d.peso != null;
    const cantEtiqueta = esPesable ? parseFloat(d.peso).toFixed(3) : d.cantidad;
    const precioEtiqueta = esPesable
      ? `${parseFloat(d.producto?.precio ?? 0).toFixed(2)}/kg`
      : parseFloat(d.precio).toFixed(2);
    const subtotal = (parseFloat(d.precio) * d.cantidad).toFixed(2);
    const nombre = d.producto?.nombre ?? (esCombo ? `Combo: ${d.combo.nombre}` : '');
    const opcionesPorProducto = esCombo ? _opcionesPorProducto(d.combo_opciones) : {};
    const contenidoCombo = esCombo && d.combo.productos?.length
      ? `<br><span class="prod-combo-detalle">${d.combo.productos.map(p => {
          const opciones = opcionesPorProducto[p.id];
          return `${p.ComboProducto?.cantidad ?? 1}x ${p.nombre}${opciones?.length ? ` (${opciones.join(', ')})` : ''}`;
        }).join(', ')}</span>`
      : '';
    // Opciones de un producto SUELTO (ej. "Punto de la carne: Bien cocida") —
    // distinto de las opciones de productos dentro de un combo (arriba).
    const opcionesProducto = !esCombo && d.opciones?.length
      ? `<br><span class="prod-combo-detalle">${d.opciones.map(o => o.nombre).join(', ')}</span>`
      : '';
    const fsNombre = _fsNombre(nombre, 114, 14);
    return `
    <tr class="fila-prod">
      <td class="col-prod"><span class="prod-nombre" style="font-size:${fsNombre}px">${nombre}</span>${contenidoCombo}${opcionesProducto}</td>
      <td class="col-cant">${cantEtiqueta}</td>
      <td class="col-precio">${precioEtiqueta}</td>
      <td class="col-sub">${subtotal}</td>
    </tr>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600;700&display=swap');

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: 'IBM Plex Mono', 'Courier New', Courier, monospace;
      font-size: 10px;
      line-height: 1.3;
      width: 248px;
      margin: 0 auto;
      padding: 4px 4px 16px;
      color: #000;
      background: #fff;
    }

    .header        { text-align: center; padding-bottom: 3px; }
    .header-nombre { font-size: 13px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; }
    .header-sub    { font-size: 9px; color: #444; margin-top: 1px; }

    .nota-venta {
      text-align: center;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 3px;
      text-transform: uppercase;
      color: #333;
      margin-top: 2px;
    }

    .sep    { border: none; border-top: 1px solid #000;  margin: 3px 0; }
    .sdash  { border: none; border-top: 1px dashed #666; margin: 3px 0; }

    .badge {
      text-align: center;
      text-transform: uppercase;
      padding: 3px 0;
      margin: 3px 0;
      border-top: 2px solid #000;
      border-bottom: 2px solid #000;
    }
    .badge-tipo {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 2px;
      color: #555;
    }
    .badge-numero {
      font-size: 22px;
      font-weight: 700;
      letter-spacing: 1px;
      line-height: 1.2;
    }
    .badge.llevar { border-style: dashed; }
    .badge.llevar .badge-tipo { color: #333; }

    .info-row {
      display: flex; justify-content: space-between;
      font-size: 10px; padding: 1px 0;
    }
    .info-label { color: #555; }
    .info-valor { font-weight: 700; }

    .sec-title {
      font-size: 8px; font-weight: 700;
      letter-spacing: 2px; text-transform: uppercase;
      color: #555; margin-bottom: 2px;
    }

    table { width: 100%; border-collapse: collapse; }

    thead th {
      font-size: 8px; letter-spacing: 1px;
      text-transform: uppercase; color: #666;
      padding: 2px 0; border-bottom: 1px solid #000;
    }

    .fila-prod {
      page-break-inside: avoid;
    }
    .fila-prod td {
      padding: 3px 0; vertical-align: top;
      border-bottom: 1px dashed #bbb;
    }

    .col-prod  { width: 46%; }
    .col-cant  { width: 10%; text-align: center; font-weight: 700; font-size: 16px; }
    .col-precio{ width: 20%; text-align: right; font-size: 9.5px; color: #444; }
    .col-sub   { width: 24%; text-align: right; font-weight: 700; }

    .prod-nombre {
      display: block;
      max-width: 100%;
      font-weight: 700; font-size: 14px; line-height: 1.3;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .prod-combo-detalle { font-size: 8.5px; font-style: italic; color: #555; }

    .total-bloque { margin-top: 3px; }
    .total-row {
      display: flex; justify-content: space-between;
      padding: 1px 0; font-size: 10px;
    }
    .total-row.descuento { color: #b00; }
    .total-row.principal {
      font-size: 14px; font-weight: 700;
      margin-top: 2px; padding-top: 3px;
      border-top: 2px solid #000;
    }

    .puntos-bloque {
      margin-top: 3px; padding: 3px 5px;
      border: 1px dashed #000; font-size: 9px;
    }

    .cumple-banner {
      margin-top: 3px; padding: 3px 0;
      text-align: center; font-weight: 700; font-size: 10px;
      border-top: 1px dashed #000; border-bottom: 1px dashed #000;
    }

    .footer {
      margin-top: 8px; text-align: center;
      font-size: 9px; color: #555;
      letter-spacing: 1px;
    }
    .footer-gracias {
      font-size: 10px; font-weight: 700;
      letter-spacing: 2px; text-transform: uppercase;
      margin-bottom: 2px;
    }

    .copia { page-break-after: always; }

    @media print {
      @page { size: 70mm auto; margin: 2mm 3mm; }
      body  { width: 100%; padding: 0; }
    }
  </style>
</head>
<body>

${['', ''].map((_, i) => `
  <div class="${i === 0 ? 'copia' : ''}">

  <div class="header">
    <div class="header-nombre">${nombre}</div>
    ${dir ? `<div class="header-sub">${dir}</div>` : ''}
    ${tel ? `<div class="header-sub">Tel: ${tel}</div>` : ''}
  </div>

  <div class="nota-venta">Nota de venta</div>

  <hr class="sep"/>

  <div class="badge ${esLlevar || esDelivery ? 'llevar' : ''}">
    ${esDelivery
      ? `<div class="badge-tipo">— Delivery${pedido.origen_app ? ' · ' + pedido.origen_app : ''} —</div>
         <div class="badge-numero">${pedido.nombre_cliente ?? '—'} &nbsp;·&nbsp; # ${nOrden}</div>
         ${pedido.direccion_entrega ? `<div class="badge-numero">${pedido.direccion_entrega}</div>` : ''}
         ${pedido.telefono_cliente ? `<div class="badge-numero">Tel: ${pedido.telefono_cliente}</div>` : ''}`
      : esLlevar
        ? `<div class="badge-tipo">— Para Llevar${pedido.origen_app ? ' · ' + pedido.origen_app : ''} —</div>
           <div class="badge-numero">${pedido.cliente?.numero_documento ?? pedido.nombre_cliente ?? '—'} &nbsp;·&nbsp; # ${nOrden}</div>`
        : `<div class="badge-tipo">— Orden de Mesa —</div>
           <div class="badge-numero">${pedido.mesa?.nombre ?? '—'} &nbsp;·&nbsp; # ${nOrden}</div>`}
  </div>

  <div style="margin: 2px 0 4px">
    <div class="info-row"><span class="info-label">Fecha</span><span class="info-valor">${fecha}</span></div>
    <div class="info-row"><span class="info-label">Hora</span> <span class="info-valor">${hora}</span></div>
  </div>

  <hr class="sep"/>

  <div class="sec-title">Detalle</div>
  <table>
    <thead>
      <tr>
        <th style="text-align:left">Producto</th>
        <th>Cnt</th>
        <th style="text-align:right">P.U</th>
        <th style="text-align:right">Sub</th>
      </tr>
    </thead>
    <tbody>${filas}</tbody>
  </table>

  <div class="total-bloque">
    ${hayAjustes ? `<div class="total-row"><span>Subtotal</span><span>${simbolo} ${subtotalLineas.toFixed(2)}</span></div>` : ''}
    ${descuento > 0 ? `<div class="total-row descuento"><span>Descuento</span><span>-${simbolo} ${descuento.toFixed(2)}</span></div>` : ''}
    ${descuentoCupon > 0 ? `<div class="total-row descuento"><span>Cupón${pedido.cupon ? ` (${pedido.cupon.codigo})` : ''}</span><span>-${simbolo} ${descuentoCupon.toFixed(2)}</span></div>` : ''}
    ${esCuponCumple ? `<div class="cumple-banner">🎂 ¡Feliz cumpleaños${pedido.cliente?.nombre ? `, ${pedido.cliente.nombre}` : ''}!</div>` : ''}
    ${descuentoPuntos > 0 ? `<div class="total-row descuento"><span>Puntos canjeados (${puntosCanjeados})</span><span>-${simbolo} ${descuentoPuntos.toFixed(2)}</span></div>` : ''}
    ${propina > 0 ? `<div class="total-row"><span>Propina</span><span>${simbolo} ${propina.toFixed(2)}</span></div>` : ''}
    <div class="total-row principal">
      <span>TOTAL</span>
      <span>${simbolo} ${parseFloat(total).toFixed(2)}</span>
    </div>
  </div>

  <div class="info-row"><span class="info-label">Forma de pago</span><span class="info-valor">${metodoPagoLabel}</span></div>

  ${pedido.cliente && (puntosGanados > 0 || pedido.cliente.puntos != null) ? `
  <div class="puntos-bloque">
    ${(pedido.cliente.numero_documento || pedido.cliente.nombre) ? `<div>Cliente: <b>${pedido.cliente.numero_documento ?? pedido.cliente.nombre}</b></div>` : ''}
    ${puntosGanados > 0 ? `<div>+ ${puntosGanados} puntos ganados</div>` : ''}
    ${pedido.cliente.puntos != null ? `<div>Saldo de puntos: <b>${pedido.cliente.puntos}</b></div>` : ''}
  </div>` : ''}

  <hr class="sdash"/>

  <div class="footer">
    <div class="footer-gracias">¡Gracias por su visita!</div>
    <div>${nombre}</div>
  </div>

  </div>
`).join('')}

</body>
</html>`;

  imprimirHtml(html);
}
