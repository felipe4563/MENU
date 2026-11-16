// Cuenta dividida en el ticket de caja del agente (ver buildCaja en agent.js):
//  - pagoParcial: comprobante corto de una parte que NO completa el pedido
//    (`data.pago_parcial`, ver _emitirImpresion en el backend): quién pagó,
//    sus platos, monto, recibido/cambio y lo que FALTA. Sin la lista completa
//    ni el total del pedido.
//  - bloquePartes: bloque PAGOS del ticket final (`data.partes`), una línea
//    por parte.
// Va en un módulo aparte porque agent.js arranca el servidor al cargarse y no
// se puede probar directo. Recibe el Esc de agent.js (o uno con la misma
// interfaz) ya inicializado. Textos fijos en ASCII: el agente traduce las
// letras con su propia tabla.

var METODO = { efectivo: 'Efectivo', qr: 'QR' };

function _dinero(sym, v) { return sym + ' ' + Number(v || 0).toFixed(2); }

function _metodo(m) { return METODO[m] || m || 'Efectivo'; }

// Escribe el comprobante completo (encabezado a pie), sin cortar el papel.
function pagoParcial(t, data) {
  var pp     = data.pago_parcial;
  var pedido = data.pedido || {};
  var cfg    = data.config || {};
  var sym    = cfg.simbolo_moneda || 'Bs.';
  var nombre = cfg.nombre_negocio || 'RESTAURANTE';
  var esLlevar   = pedido.tipo === 'llevar';
  var esDelivery = pedido.tipo === 'delivery';
  var nLlevar = pedido.numero_llevar != null ? pedido.numero_llevar : pedido.id;
  var nOrden  = String(data.numero_orden_diario != null ? data.numero_orden_diario : (esLlevar ? nLlevar : pedido.id)).padStart(3, '0');
  var ahora = new Date();
  var fecha = ahora.toLocaleDateString('es-BO', { day: '2-digit', month: '2-digit', year: 'numeric' });
  // Algunas versiones de Node separan "a. m." con espacios no ASCII.
  var hora  = ahora.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' }).replace(/\s/g, ' ');

  // ── Encabezado ────────────────────────────────────────────────────────────
  t.rule('=');
  t.center().bold(true).line(nombre.toUpperCase()).bold(false);
  var direccionTel = [cfg.direccion, cfg.telefono ? 'Tel: ' + cfg.telefono : null].filter(Boolean).join(' - ');
  if (direccionTel) t.center().line(direccionTel);
  t.rule('=');
  t.center().bold(true).dblH().line('PAGO PARCIAL').normal().bold(false);
  t.rule('-');

  // ── Pedido / mesa ─────────────────────────────────────────────────────────
  t.left().cols('Pedido Nro. ' + nOrden, hora);
  t.left().line('Fecha: ' + fecha);
  if (esDelivery) t.left().line('DELIVERY - ' + (pedido.nombre_cliente || 'Cliente'));
  else if (esLlevar) t.left().line('PARA LLEVAR - ' + ((pedido.cliente && pedido.cliente.numero_documento) || pedido.nombre_cliente || 'Cliente'));
  else t.left().line(((pedido.mesa && pedido.mesa.nombre) || '---').toUpperCase());
  t.left().line(pp.partes_iguales_de ? 'Parte ' + (pp.parte_numero || 1) + ' de ' + pp.partes_iguales_de : 'Parte ' + pp.numero);
  if (pp.persona) t.left().bold(true).line('Persona: ' + pp.persona).bold(false);
  t.rule('-');

  // ── Lo que paga ───────────────────────────────────────────────────────────
  var items = pp.items || [];
  if (items.length) {
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      t.left().cols(it.cantidad + ' ' + String(it.nombre || '').toUpperCase(), Number(it.subtotal || 0).toFixed(2));
    }
  } else {
    t.left().line(pp.partes_iguales_de ? 'Dividida en ' + pp.partes_iguales_de + ' partes iguales' : 'Parte de la cuenta');
  }
  t.rule('-');

  // ── Pago ──────────────────────────────────────────────────────────────────
  t.left().bold(true).cols('Monto', _dinero(sym, pp.monto)).bold(false);
  t.left().line('Forma de pago: ' + _metodo(pp.metodo_pago));
  if (pp.metodo_pago === 'efectivo') {
    t.left().cols('Recibido', _dinero(sym, pp.monto_recibido));
    t.left().cols('Cambio', _dinero(sym, pp.cambio));
  }
  t.rule('-');
  t.left().cols('Pagado', _dinero(sym, pp.pagado));
  t.left().bold(true).dblH().cols('FALTA', _dinero(sym, pp.falta)).normal().bold(false);
  t.rule('=');

  t.lf(1).center().line('Gracias por su preferencia').center().line(nombre);
  return t;
}

// Bloque PAGOS del ticket final: "Parte N - Persona - Efectivo   Bs X".
function bloquePartes(t, partes, sym) {
  if (!partes || !partes.length) return t;
  t.center().bold(true).line('PAGOS').bold(false);
  for (var i = 0; i < partes.length; i++) {
    var p = partes[i];
    var etiqueta = [p.partes_de ? 'Parte ' + p.parte_numero + ' de ' + p.partes_de : 'Parte ' + p.numero, p.persona, _metodo(p.metodo_pago)].filter(Boolean).join(' - ');
    t.left().cols(etiqueta, _dinero(sym || 'Bs.', p.monto));
  }
  t.rule('-');
  return t;
}

module.exports = { pagoParcial, bloquePartes };
