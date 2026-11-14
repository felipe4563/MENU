// Constructor de comandos ESC/POS para impresión térmica desde el navegador
// (impresión Bluetooth vía RawBT — ver rawbt.js). Es un port directo de la
// clase `Esc` y las funciones `buildCaja`/`buildCocina` de
// print-agent/agent.js (el agente de Windows que imprime en impresora
// física): mismo protocolo, mismos datos de entrada (el payload que ya
// arma el backend en `_emitirImpresion`), para que el ticket salga igual
// sin importar el canal.
import { MOTIVOS_DEVOLUCION, FORMAS_DEVOLUCION } from './ticketDevolucion';

// Columnas de texto según el ancho de papel configurado en la caja (ver
// ancho_papel_bluetooth en el modelo Caja) — 58mm imprime ~32 columnas con
// la fuente normal, 80mm ~48, igual que la impresora de mostrador.
const COLS_POR_ANCHO = { '58mm': 32, '80mm': 48 };
// Tamaño máximo del logo en píxeles (a 203dpi, 8 dots/mm) — ~30x30mm,
// pensado como un logo chico arriba del ticket, no ocupar todo el ancho del
// papel. Es el mismo para 58mm y 80mm: 30mm entra cómodo en ambos.
export const LOGO_MAX_PX = 240;

// Cada impresora Bluetooth (sobre todo las clon) entiende una tabla de letras
// distinta para la ñ y las tildes. Cada dispositivo elige la suya en
// "Probar impresora" (/impresora), que imprime una muestra con todas; se
// guarda en este navegador. Sin elegir, cp1252, que era el único que había.
const LATIN_1 = { // cp1252 / ISO-8859-1
  'á':0xE1,'é':0xE9,'í':0xED,'ó':0xF3,'ú':0xFA,
  'Á':0xC1,'É':0xC9,'Í':0xCD,'Ó':0xD3,'Ú':0xDA,
  'ñ':0xF1,'Ñ':0xD1,'ü':0xFC,'Ü':0xDC,
  '¡':0xA1,'¿':0xBF,'°':0xB0,'·':0xB7,
};
const DOS_850 = { // cp850 / cp858
  'á':0xA0,'é':0x82,'í':0xA1,'ó':0xA2,'ú':0xA3,
  'Á':0xB5,'É':0x90,'Í':0xD6,'Ó':0xE0,'Ú':0xE9,
  'ñ':0xA4,'Ñ':0xA5,'ü':0x81,'Ü':0x9A,
  '¡':0xAD,'¿':0xA8,'°':0xF8,'·':0xFA,
};
// cp437 no tiene las mayúsculas con tilde: salen sin tilde.
const DOS_437 = { ...DOS_850, 'Á':0x41,'Í':0x49,'Ó':0x4F,'Ú':0x55 };

// La letra es lo que se imprime al lado de cada muestra, para elegir.
export const CODIFICACIONES = [
  { id: 'cp1252', letra: 'A', nombre: 'Windows 1252', escT: 16, mapa: LATIN_1 },
  { id: 'cp850', letra: 'B', nombre: 'PC850 (latino)', escT: 2, mapa: DOS_850 },
  { id: 'cp858', letra: 'C', nombre: 'PC858 (latino con €)', escT: 19, mapa: DOS_850 },
  { id: 'cp437', letra: 'D', nombre: 'PC437 (EE.UU.)', escT: 0, mapa: DOS_437 },
  { id: 'iso8859-1', letra: 'E', nombre: 'ISO 8859-1', escT: 23, mapa: LATIN_1 },
  { id: 'ascii', letra: 'F', nombre: 'Sin tildes (seguro)', escT: 0, mapa: null },
];
const CLAVE_CODIFICACION = 'rusoft-impresora-bt-letras';
const POR_DEFECTO = 'cp1252';
const buscarCodificacion = (id) => CODIFICACIONES.find((c) => c.id === id) ?? CODIFICACIONES.find((c) => c.id === POR_DEFECTO);
export function codificacionGuardada() {
  try { return buscarCodificacion(localStorage.getItem(CLAVE_CODIFICACION)).id; } catch { return POR_DEFECTO; }
}
export function guardarCodificacion(id) {
  try { localStorage.setItem(CLAVE_CODIFICACION, buscarCodificacion(id).id); } catch { /* sin almacenamiento */ }
}
const SIMBOLOS = { '★':0x2A, '—':0x2D, '–':0x2D, '“':0x22, '”':0x22, '‘':0x27, '’':0x27, '…':0x2E };
const REEMPLAZO_ASCII = {
  'á':'a','é':'e','í':'i','ó':'o','ú':'u',
  'Á':'A','É':'E','Í':'I','Ó':'O','Ú':'U',
  'ñ':'n','Ñ':'N','ü':'u','Ü':'U',
  // Sin equivalente ASCII razonable: se eliminan en vez de dejar un "?"
  // duelto — "¿Sabor?" se leía peor como "?Sabor?" que sin el signo inicial.
  '¡':'','¿':'','°':'o','·':'.',
  '★':'*','—':'-',
};

function quitarAcentos(str) {
  return str.replace(/[áéíóúÁÉÍÓÚñÑüÜ¡¿°·★—]/g, (ch) => REEMPLAZO_ASCII[ch] ?? ch);
}

// Agrupa las opciones elegidas de un combo por producto_id — ver la misma
// función en ticketVenta.js/ticketCocina.js (el HTML), acá replicada para
// el camino ESC/POS Bluetooth.
function _opcionesPorProducto(comboOpciones) {
  const mapa = {};
  (comboOpciones || []).forEach((co) => {
    if (!co.opcion || !co.opcion.nombre) return;
    if (!mapa[co.producto_id]) mapa[co.producto_id] = [];
    mapa[co.producto_id].push(co.opcion.nombre);
  });
  return mapa;
}

class Esc {
  constructor(anchoPapel = '80mm', codificacion = codificacionGuardada()) {
    this.b = [];
    this.anchoCols = COLS_POR_ANCHO[anchoPapel] || COLS_POR_ANCHO['80mm'];
    this.cod = buscarCodificacion(codificacion);
  }
  raw(bytes) { this.b.push(...bytes); return this; }
  init() { return this.raw([0x1B, 0x40]); }
  // Cambia la tabla de letras (sirve también a mitad del ticket: la muestra
  // de /impresora imprime una línea con cada una).
  charset(codificacion) {
    if (codificacion) this.cod = buscarCodificacion(codificacion);
    // FS . apaga el "modo chino" que traen de fábrica muchas impresoras clon
    // (MTP-3, Xprinter…): en ese modo cada byte de ñ/tilde se junta con la
    // letra siguiente como un carácter chino y el texto sale entrecortado.
    // En las que no lo tienen, el comando no hace nada.
    return this.raw([0x1C, 0x2E, 0x1B, 0x74, this.cod.escT]);
  }
  cut() { return this.raw([0x1D, 0x56, 0x41, 0x05]); }
  lf(n = 1) { for (let i = 0; i < n; i++) this.b.push(0x0A); return this; }
  left() { return this.raw([0x1B, 0x61, 0x00]); }
  center() { return this.raw([0x1B, 0x61, 0x01]); }
  right() { return this.raw([0x1B, 0x61, 0x02]); }
  bold(on) { return this.raw([0x1B, 0x45, on ? 1 : 0]); }
  normal() { return this.raw([0x1D, 0x21, 0x00]); }
  dbl() { return this.raw([0x1D, 0x21, 0x11]); }
  dblH() { return this.raw([0x1D, 0x21, 0x01]); }
  dblW() { return this.raw([0x1D, 0x21, 0x10]); }
  text(s) {
    let str = String(s != null ? s : '');
    const mapa = this.cod.mapa;
    if (!mapa) str = quitarAcentos(str);
    for (const ch of str) {
      const code = ch.charCodeAt(0);
      const byte = mapa?.[ch] ?? SIMBOLOS[ch];
      // Lo que la tabla no tiene sale sin tilde ("ç" no, pero "ñ" → "n") o "?".
      const plano = byte == null && code >= 128 ? quitarAcentos(ch).normalize('NFD').replace(/[̀-ͯ]/g, '') : null;
      if (byte != null) this.b.push(byte);
      else if (code < 128) this.b.push(code);
      else for (const p of plano || '?') this.b.push(p.charCodeAt(0) < 128 ? p.charCodeAt(0) : 0x3F);
    }
    return this;
  }
  line(s) { return this.text(s != null ? s : '').lf(); }
  rule(c) { const ch = c || '-'; return this.line(ch.repeat(this.anchoCols)); }
  cols(left, right) {
    const r = String(right != null ? right : '');
    const l = String(left != null ? left : '');
    const lw = this.anchoCols - r.length;
    const lp = l.length > lw ? l.substring(0, Math.max(0, lw - 1)) + '.' : l.padEnd(lw);
    return this.line(lp + r);
  }
  // Comando GS v 0 (raster bit image) — usado para el logo (ver logoEscPos.js).
  imagen(anchoBytes, alto, datos) {
    return this.raw([0x1D, 0x76, 0x30, 0x00, anchoBytes & 0xFF, (anchoBytes >> 8) & 0xFF, alto & 0xFF, (alto >> 8) & 0xFF, ...datos]);
  }
  build() { return Uint8Array.from(this.b); }
}

// ── Cuenta dividida (mismo ticket que print-agent/ticketPagoParcial.js) ─────
const METODO_PARTE = { efectivo: 'Efectivo', qr: 'QR' };
const dineroParte = (sym, v) => sym + ' ' + Number(v || 0).toFixed(2);

// Comprobante corto de una parte que no completa el pedido (`pago_parcial`,
// ver _emitirImpresion en el backend): quién pagó, sus platos, monto,
// recibido/cambio y lo que FALTA. Sin la lista completa ni el total.
function _pagoParcial(t, data) {
  const pp = data.pago_parcial;
  const pedido = data.pedido || {};
  const cfg = data.config || {};
  const sym = cfg.simbolo_moneda || 'Bs.';
  const nombre = cfg.nombre_negocio || 'RESTAURANTE';
  const esLlevar = pedido.tipo === 'llevar';
  const nLlevar = pedido.numero_llevar != null ? pedido.numero_llevar : pedido.id;
  const nOrden = String(data.numero_orden_diario != null ? data.numero_orden_diario : (esLlevar ? nLlevar : pedido.id)).padStart(3, '0');
  const ahora = new Date();
  const fecha = ahora.toLocaleDateString('es-BO', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const hora = ahora.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' }).replace(/\s/g, ' ');

  t.rule('=');
  t.center().bold(true).line(nombre.toUpperCase()).bold(false);
  const direccionTel = [cfg.direccion, cfg.telefono ? 'Tel: ' + cfg.telefono : null].filter(Boolean).join(' - ');
  if (direccionTel) t.center().line(direccionTel);
  t.rule('=');
  t.center().bold(true).dblH().line('PAGO PARCIAL').normal().bold(false);
  t.rule('-');

  t.left().cols('Pedido Nro. ' + nOrden, hora);
  t.left().line('Fecha: ' + fecha);
  if (pedido.tipo === 'delivery') t.left().line('DELIVERY — ' + (pedido.nombre_cliente || 'Cliente'));
  else if (esLlevar) t.left().line('PARA LLEVAR — ' + (pedido.cliente?.numero_documento || pedido.nombre_cliente || 'Cliente'));
  else t.left().line((pedido.mesa?.nombre || '---').toUpperCase());
  t.left().line('Parte ' + pp.numero);
  if (pp.persona) t.left().bold(true).line('Persona: ' + pp.persona).bold(false);
  t.rule('-');

  const items = pp.items || [];
  if (items.length) {
    for (const it of items) t.left().cols(it.cantidad + ' ' + String(it.nombre || '').toUpperCase(), Number(it.subtotal || 0).toFixed(2));
  } else {
    t.left().line(pp.partes_iguales_de ? 'Parte de la cuenta (1 de ' + pp.partes_iguales_de + ')' : 'Parte de la cuenta');
  }
  t.rule('-');

  t.left().bold(true).cols('Monto', dineroParte(sym, pp.monto)).bold(false);
  t.left().line('Pago: ' + (METODO_PARTE[pp.metodo_pago] || pp.metodo_pago));
  if (pp.metodo_pago === 'efectivo') {
    t.left().cols('Recibido', dineroParte(sym, pp.monto_recibido));
    t.left().cols('Cambio', dineroParte(sym, pp.cambio));
  }
  t.rule('-');
  t.left().cols('Pagado', dineroParte(sym, pp.pagado));
  t.left().bold(true).dblH().cols('FALTA', dineroParte(sym, pp.falta)).normal().bold(false);
  t.rule('=');

  t.lf(1).center().line('Gracias por su preferencia').center().line(nombre).lf(2);
  return t;
}

// Bloque PAGOS del ticket final: "Parte N · Persona · Efectivo   Bs X".
function _bloquePartes(t, partes, sym) {
  t.center().bold(true).line('PAGOS').bold(false);
  for (const p of partes) {
    const etiqueta = ['Parte ' + p.numero, p.persona, METODO_PARTE[p.metodo_pago] || p.metodo_pago].filter(Boolean).join(' · ');
    t.left().cols(etiqueta, dineroParte(sym, p.monto));
  }
  t.rule('-');
  return t;
}

function buildCaja(data, logo) {
  const pedido = data.pedido;
  const metodo_pago = data.metodo_pago;
  const cfg = data.config || {};
  const esLlevar = pedido.tipo === 'llevar';
  const esDelivery = pedido.tipo === 'delivery';
  const nLevar = pedido.numero_llevar != null ? pedido.numero_llevar : pedido.id;
  const nOrden = String(data.numero_orden_diario != null ? data.numero_orden_diario : (esLlevar ? nLevar : pedido.id)).padStart(3, '0');
  const ahora = new Date();
  const fecha = ahora.toLocaleDateString('es-BO', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const hora = ahora.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' });
  const sym = cfg.simbolo_moneda || 'Bs.';
  const nombre = cfg.nombre_negocio || 'RESTAURANTE';

  const detallesTotal = pedido.detalles || [];
  const subtotalLineas = detallesTotal.reduce((s, d) => s + parseFloat(d.precio) * d.cantidad, 0);
  const montoRecibido = pedido.monto_recibido != null ? parseFloat(pedido.monto_recibido) : null;
  const cambioTotal = parseFloat(pedido.cambio || 0);
  const total = montoRecibido != null ? montoRecibido - cambioTotal : subtotalLineas;
  const descuento = parseFloat(pedido.descuento || 0);
  const propina = parseFloat(pedido.propina || 0);
  const descuentoCupon = parseFloat(pedido.descuento_cupon || 0);
  const puntosGanados = pedido.puntos_ganados || 0;
  const puntosCanjeados = pedido.puntos_canjeados || 0;
  const descuentoPuntos = Math.max(0, subtotalLineas - descuento - descuentoCupon + propina - total);
  const hayAjustes = descuento > 0 || descuentoCupon > 0 || descuentoPuntos > 0 || propina > 0;

  const t = new Esc(data.ancho_papel_bluetooth);
  t.init().charset();

  if (logo) t.center().imagen(logo.anchoBytes, logo.alto, logo.datos).lf();

  // Parte de una cuenta dividida que no completa el pedido: comprobante corto.
  if (data.pago_parcial) return _pagoParcial(t, data).build();

  t.rule('=');
  t.center().bold(true).line(nombre.toUpperCase()).bold(false);
  const direccionTel = [cfg.direccion, cfg.telefono ? 'Tel: ' + cfg.telefono : null].filter(Boolean).join(' - ');
  if (direccionTel) t.center().line(direccionTel);
  t.rule('=');

  t.left().bold(true).cols('NOTA DE VENTA', 'Nro. ' + nOrden).bold(false);
  t.rule('-');

  t.left().cols('Fecha: ' + fecha, hora);
  if (esDelivery) {
    t.left().line('DELIVERY' + (pedido.origen_app ? ' · ' + pedido.origen_app : '') + ' — ' + (pedido.nombre_cliente || 'Cliente'));
    if (pedido.direccion_entrega) t.left().line(pedido.direccion_entrega);
    if (pedido.telefono_cliente) t.left().line('Tel: ' + pedido.telefono_cliente);
  } else if (esLlevar) {
    t.left().line('PARA LLEVAR — ' + ((pedido.cliente && pedido.cliente.numero_documento) || pedido.nombre_cliente || 'Cliente'));
  } else {
    const mesaNombre = (pedido.mesa && pedido.mesa.nombre) ? pedido.mesa.nombre : '---';
    t.left().line(mesaNombre.toUpperCase());
  }
  t.rule('-');

  t.left().line('Descripcion');
  t.rule('-');
  const detalles = pedido.detalles || [];
  for (const d of detalles) {
    const esCombo = !!d.combo;
    const prod = String(esCombo ? ('COMBO: ' + d.combo.nombre) : ((d.producto && d.producto.nombre) ? d.producto.nombre : '')).toUpperCase();
    const sub = (parseFloat(d.precio) * d.cantidad).toFixed(2);
    if (d.peso != null) {
      const pesoKg = parseFloat(d.peso).toFixed(3);
      const precioKg = parseFloat((d.producto && d.producto.precio) || 0).toFixed(2);
      t.left().cols(pesoKg + 'kg ' + prod, sub);
      t.left().line('  (' + sym + ' ' + precioKg + '/kg)');
    } else {
      const qty = d.cantidad;
      const pu = parseFloat(d.precio).toFixed(2);
      t.left().cols(qty + ' ' + prod, sub);
      if (qty > 1) t.left().line('  (' + sym + ' ' + pu + ' c/u)');
    }
    if (esCombo && d.combo.productos && d.combo.productos.length) {
      const opcionesPorProducto = _opcionesPorProducto(d.combo_opciones);
      const contenidoCombo = d.combo.productos.map((p) => {
        const cant = (p.ComboProducto && p.ComboProducto.cantidad) || 1;
        const opciones = opcionesPorProducto[p.id];
        return cant + 'x ' + p.nombre + (opciones && opciones.length ? ' (' + opciones.join(', ') + ')' : '');
      }).join(', ');
      t.left().line('  (' + contenidoCombo + ')');
    } else if (d.opciones && d.opciones.length) {
      t.left().line('  (' + d.opciones.map((o) => o.nombre).join(', ') + ')');
    }
    if (d.nota) t.left().bold(true).line('  >> ' + d.nota).bold(false);
  }
  t.rule('-');

  if (hayAjustes) {
    t.left().cols('Subtotal', sym + ' ' + subtotalLineas.toFixed(2));
    if (descuento > 0) t.left().cols('Descuento', '-' + sym + ' ' + descuento.toFixed(2));
    if (descuentoCupon > 0) {
      const etiquetaCupon = 'Cupon' + (pedido.cupon ? ' (' + pedido.cupon.codigo + ')' : '');
      t.left().cols(etiquetaCupon, '-' + sym + ' ' + descuentoCupon.toFixed(2));
      const esCuponCumple = pedido.cupon && /^CUMPLE/.test(pedido.cupon.codigo);
      if (esCuponCumple) {
        const nombreCumple = (pedido.cliente && pedido.cliente.nombre) ? pedido.cliente.nombre.toUpperCase() : '';
        t.center().bold(true).line('*** FELIZ CUMPLEAÑOS' + (nombreCumple ? ' ' + nombreCumple : '') + ' ***').bold(false);
      }
    }
    if (descuentoPuntos > 0) t.left().cols('Puntos (' + puntosCanjeados + ')', '-' + sym + ' ' + descuentoPuntos.toFixed(2));
    if (propina > 0) t.left().cols('Propina', sym + ' ' + propina.toFixed(2));
  }
  t.left().bold(true).cols('TOTAL ' + sym, total.toFixed(2)).bold(false);
  t.rule('=');

  const METODO_PAGO_LABEL = { qr: 'QR / Transferencia', app_externa: 'Pagado en la app', diferido: 'Pendiente de cobro', mixto: 'Mixto' };
  t.left().line('Pago: ' + (METODO_PAGO_LABEL[metodo_pago] || 'Efectivo'));
  t.rule('-');

  if (data.partes?.length) _bloquePartes(t, data.partes, sym);

  if (pedido.cliente && (puntosGanados > 0 || pedido.cliente.puntos != null)) {
    if (pedido.cliente.numero_documento || pedido.cliente.nombre) t.left().line('Cliente: ' + (pedido.cliente.numero_documento || pedido.cliente.nombre));
    if (puntosGanados > 0) t.left().line('+ ' + puntosGanados + ' puntos ganados');
    if (pedido.cliente.puntos != null) t.left().bold(true).line('Saldo puntos: ' + pedido.cliente.puntos).bold(false);
    t.rule('-');
  }

  // Sin `.cut()`: las impresoras Bluetooth portátiles casi nunca tienen
  // cuchilla automática, así que ese comando solo alimentaba papel de más
  // (interpretado como avance sin nada que cortar) — se corta a mano contra
  // el borde dentado de la impresora, con poco margen alcanza.
  t.lf(1).center().line('Gracias por su preferencia').center().line(nombre).lf(2);
  return t.build();
}

function buildCocina(data) {
  const pedido = data.pedido;
  const cfg = data.config || {};
  const t = new Esc(data.ancho_papel_bluetooth);
  const esLlevar = pedido.tipo === 'llevar';
  const esDelivery = pedido.tipo === 'delivery';
  const nLevar = pedido.numero_llevar != null ? pedido.numero_llevar : pedido.id;
  const nOrden = String(data.numero_orden_diario != null ? data.numero_orden_diario : (esLlevar ? nLevar : pedido.id)).padStart(3, '0');
  const ahora = new Date();
  const hora = ahora.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' });
  const sym = cfg.simbolo_moneda || 'Bs.';
  // Aviso de productos anulados: encabezado "ANULAR", prefijo "ANULAR" por
  // línea y sin precios ni total (ver buildCocina en print-agent/agent.js).
  const esAnulacion = !!data.anulacion;

  t.init().charset();

  t.rule('#');
  if (esAnulacion) t.center().bold(true).dbl().line('ANULAR').normal().bold(false);
  else t.center().bold(true).dblW().line('COCINA').normal().bold(false);
  t.rule('#');

  if (esDelivery) {
    t.center().dbl().bold(true).line('DELIVERY').normal().bold(false);
    t.center().dbl().bold(true).line('# ' + nOrden).normal().bold(false);
  } else if (esLlevar) {
    t.center().dbl().bold(true).line('PARA LLEVAR').normal().bold(false);
    t.center().dbl().bold(true).line('# ' + nOrden).normal().bold(false);
  } else {
    const mesaNombre2 = (pedido.mesa && pedido.mesa.nombre) ? pedido.mesa.nombre : '---';
    t.center().dbl().bold(true).line(mesaNombre2.toUpperCase()).normal().bold(false);
    t.center().dbl().bold(true).line('# ' + nOrden).normal().bold(false);
  }
  t.rule('#');

  if (esDelivery) {
    t.left().bold(true).dblH().line('Cliente: ' + (pedido.nombre_cliente || '-')).normal().bold(false);
    if (pedido.direccion_entrega) t.left().line(pedido.direccion_entrega);
    if (pedido.telefono_cliente) t.left().line('Tel: ' + pedido.telefono_cliente);
  } else if (esLlevar) {
    t.left().bold(true).dblH().line('Cliente: ' + (pedido.nombre_cliente || '-')).normal().bold(false);
  }
  t.left().line('Hora: ' + hora);
  t.rule('#');

  const detalles2 = pedido.detalles || [];
  for (const d2 of detalles2) {
    const esCombo2 = !!d2.combo;
    const prod2 = String(esCombo2 ? ('COMBO: ' + d2.combo.nombre) : ((d2.producto && d2.producto.nombre) ? d2.producto.nombre : '')).toUpperCase();
    const sub2 = (parseFloat(d2.precio) * d2.cantidad).toFixed(2);
    if (esAnulacion) {
      const cantAnul = d2.peso != null ? parseFloat(d2.peso).toFixed(3) + 'kg' : d2.cantidad;
      t.left().dbl().bold(true).line('ANULAR ' + cantAnul + '  ' + prod2).normal().bold(false);
    } else if (d2.peso != null) {
      const pesoKg2 = parseFloat(d2.peso).toFixed(3);
      const precioKg2 = parseFloat((d2.producto && d2.producto.precio) || 0).toFixed(2);
      t.left().dbl().bold(true).line(pesoKg2 + 'kg  ' + prod2).normal().bold(false);
      t.left().line(sym + ' ' + precioKg2 + '/kg  Sub: ' + sym + ' ' + sub2);
    } else {
      const qty2 = d2.cantidad;
      const pu2 = parseFloat(d2.precio).toFixed(2);
      t.left().dbl().bold(true).line(qty2 + '  ' + prod2).normal().bold(false);
      t.left().line(sym + ' ' + pu2 + ' c/u  Sub: ' + sym + ' ' + sub2);
    }
    if (esCombo2 && d2.combo.productos && d2.combo.productos.length) {
      const opcionesPorProducto2 = _opcionesPorProducto(d2.combo_opciones);
      const contenidoCombo2 = d2.combo.productos.map((p) => {
        const cant = (p.ComboProducto && p.ComboProducto.cantidad) || 1;
        const opciones = opcionesPorProducto2[p.id];
        return cant + 'x ' + p.nombre + (opciones && opciones.length ? ' (' + opciones.join(', ') + ')' : '');
      }).join(', ');
      t.left().bold(true).line('>> Incluye: ' + contenidoCombo2).bold(false);
    } else if (d2.opciones && d2.opciones.length) {
      t.left().bold(true).line('>> ' + d2.opciones.map((o) => o.nombre).join(', ')).bold(false);
    }
    if (d2.nota) t.left().bold(true).dblH().line('>> ' + d2.nota).normal().bold(false);
    t.rule('-');
  }
  t.rule('#');

  // Total: el dueño pidió que cocina también vea cuánto se consumió, no solo caja.
  if (!esAnulacion) {
    const totalCocina = detalles2.reduce((s, d) => s + parseFloat(d.precio) * d.cantidad, 0);
    t.left().bold(true).dblH().cols('TOTAL', sym + ' ' + totalCocina.toFixed(2)).normal().bold(false);
    t.rule('#');
  }

  if (pedido.notas) {
    t.center().bold(true).line('!! NOTA ESPECIAL !!').bold(false);
    t.left().bold(true).dblH().line(pedido.notas).normal().bold(false);
    t.rule('#');
  }

  t.center().line('-- ticket de cocina --').lf(2);
  return t.build();
}

// Resumen del cierre de turno para impresora Bluetooth: mismos datos que
// ticketCierreCaja.js (HTML) y el agente, en ESC/POS.
function buildCierre(reporte, cfg = {}, ancho = '80mm', logo = null) {
  const { sesion, ventas_por_metodo: metodos = [], productos_vendidos: productos = [], efectivo_esperado } = reporte;
  const sym = cfg.simbolo_moneda || 'Bs.';
  const n = (v) => parseFloat(v || 0);
  const m = (v) => sym + ' ' + n(v).toFixed(2);
  const fh = (f) => (f ? new Date(f).toLocaleString('es-BO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-');
  const METODO = { efectivo: 'Efectivo', qr: 'QR', app_externa: 'App externa', mixto: 'Mixto' };
  const efectivo = n(metodos.find((x) => x.metodo_pago === 'efectivo')?.total);
  const totalVentas = metodos.reduce((a, x) => a + n(x.total), 0);
  const dif = n(sesion.diferencia);

  const t = new Esc(ancho);
  t.init().charset();
  if (logo) t.center().imagen(logo.anchoBytes, logo.alto, logo.datos).lf();
  t.center().bold(true).line((cfg.nombre_negocio || 'RESTAURANTE').toUpperCase()).bold(false);
  t.center().dblH().bold(true).line('CIERRE DE TURNO').normal().bold(false);
  t.center().line('Turno #' + sesion.id + (sesion.sucursal?.nombre ? ' - ' + sesion.sucursal.nombre : ''));
  t.rule('=');
  t.left().cols('Cajero', sesion.usuario?.nombre || '-');
  if (sesion.caja?.nombre) t.cols('Caja', sesion.caja.nombre);
  t.cols('Apertura', fh(sesion.abierto_en)).cols('Cierre', fh(sesion.cerrado_en));
  t.rule('-');
  t.center().bold(true).line('VENTAS').bold(false).left();
  metodos.forEach((x) => t.cols((METODO[x.metodo_pago] || x.metodo_pago) + ' (' + x.cantidad + ')', m(x.total)));
  t.bold(true).cols('Total vendido', m(totalVentas)).bold(false);
  t.rule('-');
  t.center().bold(true).line('EFECTIVO EN CAJA').bold(false).left();
  t.cols('Apertura', m(sesion.monto_apertura)).cols('+ Efectivo vendido', m(efectivo));
  t.cols('- Gastos', m(sesion.total_gastos)).cols('- Devoluciones', m(sesion.total_devoluciones));
  t.bold(true).cols('Esperado', m(efectivo_esperado)).cols('Contado', sesion.monto_cierre != null ? m(sesion.monto_cierre) : '-').bold(false);
  t.rule('=');
  t.dblH().bold(true).cols('DIFERENCIA', (dif > 0 ? '+' : '') + dif.toFixed(2)).normal().bold(false);
  if (sesion.nota_diferencia) t.line('Motivo: ' + sesion.nota_diferencia);
  if ((sesion.gastos || []).length) {
    t.rule('-').center().bold(true).line('GASTOS').bold(false).left();
    sesion.gastos.forEach((g) => t.cols(g.descripcion, n(g.monto).toFixed(2)));
  }
  const devoluciones = reporte.devoluciones || [];
  if (devoluciones.length) {
    t.rule('-').center().bold(true).line('DEVOLUCIONES (' + devoluciones.length + ')').bold(false).left();
    devoluciones.forEach((d) => {
      t.bold(true).cols('Venta #' + d.pedido_id + ' - ' + (FORMAS_DEVOLUCION[d.forma] || d.forma), n(d.monto).toFixed(2)).bold(false);
      t.line('  ' + (MOTIVOS_DEVOLUCION[d.motivo] || d.motivo) + (d.nota ? ': ' + d.nota : ''));
      (d.items || []).forEach((i) => t.line('  ' + n(i.cantidad) + 'x ' + (i.nombre || '-')));
    });
  }
  if (productos.length) {
    t.rule('-').center().bold(true).line('PRODUCTOS VENDIDOS').bold(false).left();
    productos.forEach((p) => t.cols(n(p.total_cantidad) + ' ' + p.nombre, n(p.total).toFixed(2)));
  }
  t.rule('=');
  t.center().line('Impreso ' + fh(new Date())).lf(3).cut();
  return t.build();
}

export { Esc, buildCaja, buildCocina, buildCierre };
