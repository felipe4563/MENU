const { Op } = require('sequelize');
const {
  Pedido, DetallePedido, Mesa, Producto, Cliente, SesionCaja, Caja, LibroCaja, Configuracion, PagoQr, Opcion, Combo, ComboProducto, Promocion, Cupon,
  RecetaInsumo, DetallePedidoOpcion, DetallePedidoComboOpcion, Devolucion, DevolucionItem, Usuario, sequelize,
} = require('../../models');
const { emitir } = require('../../socket');
const { ajustarStockSucursal } = require('../inventario/stock.service');
const { ajustarStockInsumoSucursal } = require('../insumos/insumos.service');
const codepayClient = require('../../integrations/codepay/codepay.client');
const banecoClient = require('../../integrations/baneco/baneco.client');
const { calcularPrecioPesable, redondearAMedio } = require('../../utils/precio');
const { estaActivoHoy } = require('../../utils/disponibilidad');
const { resolver: _resolverCupon } = require('../cupones/cupones.service');
const mesasService = require('../mesas/mesas.service');
const { cantidadVigente } = require('../devoluciones/calculo');

// Rango del día calendario en hora de Bolivia (-04:00), sin depender de la
// zona horaria del proceso de Node/VPS. Por defecto usa el momento actual;
// se puede pasar una fecha de referencia para obtener el rango del día en
// que ocurrió esa fecha (p. ej. el día en que se creó un pedido).
function _rangoDiaBolivia(referencia = new Date()) {
  const fecha = new Date(referencia.getTime() - 4 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return {
    inicio: new Date(`${fecha}T00:00:00-04:00`),
    fin: new Date(`${fecha}T23:59:59.999-04:00`),
  };
}

// Suma el precio_adicional de las opciones elegidas (ej. "sabor: fresa +2 Bs").
// Se recalcula siempre desde la BD y nunca se confía en un precio que mande
// el cliente, para que nadie pueda inflar/desinflar el total del pedido.
async function _extraPorOpciones(opcion_ids = []) {
  if (!opcion_ids || opcion_ids.length === 0) return 0;
  const opciones = await Opcion.findAll({ where: { id: opcion_ids } });
  return opciones.reduce((sum, o) => sum + parseFloat(o.precio_adicional || 0), 0);
}

// Valida que cada producto_id en opciones_por_producto realmente pertenezca
// al combo — evita que alguien mande opciones para un producto ajeno al
// combo. No valida "obligatorio": eso es solo del lado del frontend, igual
// que ya pasa hoy con productos sueltos.
async function _validarOpcionesCombo(combo_id, opcionesPorProducto = []) {
  if (!opcionesPorProducto || opcionesPorProducto.length === 0) return [];
  const comboProductos = await ComboProducto.findAll({ where: { combo_id }, attributes: ['producto_id'] });
  const idsValidos = new Set(comboProductos.map((cp) => cp.producto_id));
  for (const entrada of opcionesPorProducto) {
    if (!idsValidos.has(entrada.producto_id)) {
      throw Object.assign(new Error(`El producto ${entrada.producto_id} no pertenece a este combo`), { status: 400 });
    }
  }
  return opcionesPorProducto;
}

// Si el producto tiene una promoción vigente hoy, devuelve el precio ya
// descontado; si no, su precio normal. Se recalcula siempre desde la BD, no
// desde lo que muestre el catálogo que ya tenga el cliente en pantalla.
// Descuenta el stock de insumos según la receta del producto (líneas con
// opcion_id NULL, siempre) más la receta de las opciones que el cliente eligió
// (opcion_id IN opcion_ids). Un producto sin receta no mueve ningún insumo.
// No bloquea ni lanza error si el stock del insumo queda negativo — es una
// señal visual de alerta, no un freno a la venta (ver spec del 2026-08-08).
async function _descontarInsumosPorVenta({ producto_id, opcion_ids = [], cantidadVendida, sucursal_id, usuario_id, notaBase, transaction }) {
  const condiciones = [{ opcion_id: null }];
  if (opcion_ids.length) condiciones.push({ opcion_id: opcion_ids });
  const lineas = await RecetaInsumo.findAll({ where: { producto_id, [Op.or]: condiciones }, transaction });

  for (const linea of lineas) {
    await ajustarStockInsumoSucursal({
      insumo_id: linea.insumo_id, sucursal_id, tipo: 'consumo_venta',
      cantidad: parseFloat(linea.cantidad) * cantidadVendida,
      usuario_id, nota: notaBase, transaction,
    });
  }
}

async function _precioConPromocion(producto) {
  const base = parseFloat(producto.precio);
  // Si hay más de una promoción activa para el mismo producto, gana la más
  // reciente — mismo criterio que usa el frontend al armar su mapa de
  // promociones (la última que procesa pisa a las anteriores). Sin este
  // orden explícito, el resultado dependía del plan de ejecución de MySQL y
  // podía no coincidir con lo que el cliente vio en pantalla al cobrar.
  // Una promoción puede afectar a varios productos (belongsToMany) — se
  // filtra vía el `where` sobre la asociación, equivalente a un INNER JOIN.
  const promo = await Promocion.findOne({
    where: { activo: 1 },
    include: [{ model: Producto, as: 'productos', attributes: [], where: { id: producto.id }, through: { attributes: [] } }],
    order: [['id', 'DESC']],
  });
  if (!promo || !estaActivoHoy(promo)) return base;
  const descuento = promo.tipo === 'porcentaje' ? base * (parseFloat(promo.valor) / 100) : parseFloat(promo.valor);
  return redondearAMedio(Math.max(0, base - descuento));
}

// Lee la configuración del programa de fidelidad (puntos por Bs gastado y
// valor en Bs de cada punto al canjear). `transaction` es opcional: se pasa
// dentro de _finalizarVenta (fuente de verdad) y se omite en las
// validaciones tempranas antes de abrir la transacción.
async function _configFidelidad(transaction) {
  const rows = await Configuracion.findAll({
    where: { clave: ['fidelidad_activa', 'puntos_por_bs', 'valor_punto_bs', 'fidelidad_canje_efectivo', 'fidelidad_canje_qr'] },
    transaction,
  });
  const cfg = rows.reduce((o, r) => { o[r.clave] = r.valor; return o; }, {});
  return {
    activa: cfg.fidelidad_activa === 'true',
    puntosPorBs: parseFloat(cfg.puntos_por_bs || 0),
    valorPunto: parseFloat(cfg.valor_punto_bs || 0),
    // Default true por retrocompatibilidad (antes de esta config, el canje
    // en efectivo siempre estaba permitido). El de QR default false: recién
    // se puede sostener porque iniciarPagoQr reserva los puntos al generar
    // el QR (ver más abajo) — antes de eso, no había forma de hacerlo bien.
    canjeEfectivo: cfg.fidelidad_canje_efectivo !== 'false',
    canjeQr: cfg.fidelidad_canje_qr === 'true',
  };
}

// Valida y calcula el descuento en Bs de canjear `puntos_canjear` puntos del
// cliente. Se llama dos veces: sin transacción, como validación temprana
// (antes de abrir la transacción, para dar un error rápido), y de nuevo
// dentro de la transacción de _finalizarVenta con lock de fila, que es la
// que realmente descuenta los puntos — nunca se confía en el balance leído
// fuera de la transacción para el descuento real. `metodoPago` filtra por lo
// que el negocio permitió en Configuración (efectivo y QR se controlan por
// separado).
async function _resolverCanje(cliente_id, puntos_canjear, cfg, transaction, metodoPago = 'efectivo') {
  const permitido = metodoPago === 'qr' ? cfg.canjeQr : cfg.canjeEfectivo;
  if (!cfg.activa || !permitido || !cliente_id || !puntos_canjear) return { puntos: 0, descuento: 0, cliente: null };
  const cliente = await Cliente.findByPk(cliente_id, transaction ? { transaction, lock: transaction.LOCK.UPDATE } : {});
  if (!cliente || puntos_canjear > cliente.puntos) {
    throw Object.assign(new Error('El cliente no tiene suficientes puntos'), { status: 400 });
  }
  return { puntos: puntos_canjear, descuento: puntos_canjear * cfg.valorPunto, cliente };
}

// Traduce un ítem del pedido (cantidad o peso) a los valores que se guardan
// en detalle_pedidos, según si el producto se vende por peso o por unidad.
// `precioBase` ya viene con la promoción aplicada (ver _precioConPromocion) y
// `extra` es la suma de precio_adicional de las opciones elegidas (ej. sabor).
// `monto_recibido` en efectivo se autocompleta en el frontend a partir del
// total ya calculado ahí (el cajero no lo tipea), así que una diferencia de
// fracción de centavo entre ese cálculo y el recálculo del backend (p. ej.
// por redondeo de punto flotante en descuentos porcentuales) no debería
// bloquear la venta — solo importa la diferencia a nivel de centavo real.
function _montoInsuficiente(monto_recibido, monto_neto) {
  if (!monto_recibido) return true;
  return parseFloat(monto_recibido) < monto_neto - 0.005;
}

function _datosLinea(item, producto, precioBase, extra = 0) {
  if (producto.es_pesable) {
    const pesoCrudo = parseFloat(item.peso);
    if (!(pesoCrudo > 0)) {
      throw Object.assign(
        new Error(`El producto "${producto.nombre}" se vende por peso: el peso (kg) es requerido y debe ser mayor a 0`),
        { status: 400 }
      );
    }
    const peso = Math.round(pesoCrudo * 1000) / 1000;
    return { cantidad: 1, precio: calcularPrecioPesable(peso, precioBase) + extra, peso };
  }
  return { cantidad: item.cantidad ?? 1, precio: precioBase + extra, peso: null };
}

const INCLUDE_PEDIDO_COMPLETO = [
  { model: Mesa, as: 'mesa', attributes: ['id', 'nombre', 'estado'] },
  { model: Cliente, as: 'cliente', attributes: ['id', 'nombre', 'numero_documento', 'puntos'] },
  {
    model: DetallePedido, as: 'detalles',
    include: [
      { model: Producto, as: 'producto', attributes: ['id', 'nombre', 'precio', 'imagen', 'stock'], required: false },
      {
        model: Combo, as: 'combo', attributes: ['id', 'nombre', 'descripcion'], required: false,
        include: [{ model: Producto, as: 'productos', attributes: ['id', 'nombre'], through: { attributes: ['cantidad'] } }],
      },
      {
        model: DetallePedidoComboOpcion, as: 'combo_opciones', required: false,
        include: [
          { model: Producto, as: 'producto', attributes: ['id', 'nombre'] },
          { model: Opcion, as: 'opcion', attributes: ['id', 'nombre', 'precio_adicional'] },
        ],
      },
      // Opciones elegidas de un producto SUELTO (no dentro de un combo) — ej.
      // "Punto de la carne: Bien cocida". Distinto de combo_opciones, que es
      // para las opciones de los productos DENTRO de un combo.
      { model: Opcion, as: 'opciones', attributes: ['id', 'nombre', 'precio_adicional'], through: { attributes: [] }, required: false },
    ],
  },
  { model: Cupon, as: 'cupon', attributes: ['id', 'codigo', 'tipo', 'valor'], required: false },
];

async function listar({ estado, mesa_id, sucursal_id, cliente_id, origen, acceso_todas } = {}) {
  const where = {};
  if (estado) {
    where.estado = estado.includes(',') ? { [Op.in]: estado.split(',') } : estado;
  }
  if (mesa_id) where.mesa_id = mesa_id;
  if (cliente_id) where.cliente_id = cliente_id;
  if (origen) where.origen = origen;
  if (!acceso_todas) where.sucursal_id = sucursal_id;
  return Pedido.findAll({ where, include: INCLUDE_PEDIDO_COMPLETO, order: [['creado_en', 'DESC']] });
}

// Arma la URL completa de la imagen del producto a partir de la ruta relativa
// guardada en BD (ej. "/uploads/xxx.jpg"), igual que productos.service.js —
// acá se repite en vez de importar porque solo Cocina necesita la imagen
// absolutizada de las demás rutas que reutilizan INCLUDE_PEDIDO_COMPLETO.
function _urlAbsolutaImagen(ruta) {
  if (!ruta) return ruta;
  const base = (process.env.PUBLIC_API_URL || '').replace(/\/+$/, '');
  return `${base}${ruta}`;
}

// Copia del pedido (JSON) con `cantidad` = vigente y sin líneas totalmente
// anuladas. No muta la instancia de Sequelize.
function _detallesVigentes(pedidoJSON) {
  return {
    ...pedidoJSON,
    detalles: (pedidoJSON.detalles || [])
      .map((d) => ({ ...d, cantidad: cantidadVigente(d) }))
      .filter((d) => d.cantidad > 0),
  };
}

async function listarCocina({ sucursal_id, acceso_todas } = {}) {
  const where = { estado_cocina: { [Op.in]: ['pendiente', 'listo'] } };
  if (!acceso_todas) where.sucursal_id = sucursal_id;
  const pedidos = await Pedido.findAll({
    where,
    include: INCLUDE_PEDIDO_COMPLETO,
    order: [['creado_en', 'ASC']],
  });
  pedidos.forEach((pedido) => {
    pedido.detalles.forEach((detalle) => {
      if (detalle.producto) detalle.producto.imagen = _urlAbsolutaImagen(detalle.producto.imagen);
    });
  });
  // Un pedido con todo anulado no tiene nada que preparar: no se muestra.
  return pedidos
    .map((pedido) => _detallesVigentes(pedido.toJSON()))
    .filter((pedido) => pedido.detalles.length > 0);
}

function _verificarAlcance(pedido, alcance) {
  if (alcance && !alcance.acceso_todas && pedido.sucursal_id !== alcance.sucursal_id) {
    throw Object.assign(new Error('Pedido no encontrado'), { status: 404 });
  }
}

const MIS_VENTAS_LIMITE_DEFAULT = 15;
const MIS_VENTAS_LIMITE_MAX = 50;

function _paginaLimiteMisVentas({ pagina, limite } = {}) {
  const p = Math.max(parseInt(pagina, 10) || 1, 1);
  const l = Math.min(Math.max(parseInt(limite, 10) || MIS_VENTAS_LIMITE_DEFAULT, 1), MIS_VENTAS_LIMITE_MAX);
  return { pagina: p, limite: l };
}

// "Mis Ventas" del POS: página dedicada (no modal) con paginación propia,
// porque un cajero puede acumular muchas ventas en un solo día — a
// diferencia de `listar` (tablero de mesas), que siempre necesita el
// listado completo sin paginar.
async function misVentasHoy(usuario_id, alcance, filtros = {}) {
  const { pagina, limite } = _paginaLimiteMisVentas(filtros);
  const { inicio, fin } = _rangoDiaBolivia();
  const where = {
    usuario_id,
    estado: 'completado',
    creado_en: { [Op.between]: [inicio, fin] },
  };
  if (!alcance.acceso_todas) where.sucursal_id = alcance.sucursal_id;

  const { rows, count } = await Pedido.findAndCountAll({
    where,
    include: INCLUDE_PEDIDO_COMPLETO,
    order: [['creado_en', 'DESC']],
    distinct: true,
    limit: limite,
    offset: (pagina - 1) * limite,
  });

  return { filas: rows, pagina, limite, total: count, total_paginas: Math.ceil(count / limite) || 1 };
}

async function obtener(id, alcance) {
  const p = await Pedido.findByPk(id, {
    include: [
      ...INCLUDE_PEDIDO_COMPLETO,
      {
        model: Devolucion, as: 'devoluciones', required: false,
        include: [
          { model: Usuario, as: 'usuario', attributes: ['id', 'nombre'] },
          { model: DevolucionItem, as: 'items' },
        ],
      },
    ],
    order: [[{ model: Devolucion, as: 'devoluciones' }, 'creado_en', 'ASC']],
  });
  if (!p) throw Object.assign(new Error('Pedido no encontrado'), { status: 404 });
  _verificarAlcance(p, alcance);
  return p;
}

async function reimprimir(id, alcance) {
  const pedido = await obtener(id, alcance);
  if (pedido.estado !== 'completado') {
    throw Object.assign(new Error('Solo se puede reimprimir un pedido completado'), { status: 409 });
  }
  // El ticket reimpreso debe ser idéntico al original: no se puede dejar que
  // _emitirImpresion recalcule numero_orden_diario "en vivo" (eso daría el
  // conteo de HOY, no el que tenía el pedido al momento de venderse). Se
  // recalcula el número que tenía ese pedido en su propio día de creación y
  // se pasa como override.
  const numero_orden_diario = await _numeroOrdenDiarioOriginal(pedido);
  return _emitirImpresion(
    pedido, pedido.metodo_pago, parseFloat(pedido.cambio || 0), pedido.sucursal_id, numero_orden_diario,
    { esReimpresion: true }
  );
}

// Cuenta cuántos pedidos no cancelados se crearon el mismo día calendario
// (hora Bolivia) que `pedido`, hasta (e incluyendo) su propio `creado_en`.
// Es el mismo número que _emitirImpresion le asignó cuando se imprimió por
// primera vez, reutilizando el mismo rango de día y el mismo filtro de
// exclusión de cancelados.
//
// `creado_en` es un TIMESTAMP de MySQL con precisión de segundo (ver
// database/migrations/007_pedidos.sql), así que dos pedidos creados dentro
// del mismo segundo comparten el mismo valor. Para desempatar sin depender
// de sub-segundos se usa `id` (autoincremental, refleja el orden real de
// creación) como criterio secundario.
async function _numeroOrdenDiarioOriginal(pedido) {
  const { inicio } = _rangoDiaBolivia(pedido.creado_en);
  return Pedido.count({
    where: {
      estado: { [Op.ne]: 'cancelado' },
      creado_en: { [Op.gte]: inicio },
      [Op.or]: [
        { creado_en: { [Op.lt]: pedido.creado_en } },
        { creado_en: pedido.creado_en, id: { [Op.lte]: pedido.id } },
      ],
    },
  });
}

async function _siguienteNumeroLlevar() {
  const { inicio, fin } = _rangoDiaBolivia();
  const count = await Pedido.count({
    where: {
      tipo: 'llevar',
      creado_en: { [Op.between]: [inicio, fin] },
    },
  });
  return count + 1;
}

// El flujo de cocina digital necesita saber, en cuanto nace el pedido, si
// tiene que aparecer en la pantalla de Cocina — independientemente de si
// ya se cobró o no (ver spec: estado_cocina es un eje separado de estado).
// Ausencia de configuración se trata como 'digital' (mismo default que ya
// usa TabFlujo.jsx en el frontend).
async function _estadoCocinaInicial() {
  const cfg = await Configuracion.findOne({ where: { clave: 'flujo_cocina' } });
  return (!cfg || cfg.valor === 'digital') ? 'pendiente' : null;
}

async function crear({ mesa_id, tipo = 'mesa', usuario_id, cliente_id, sesion_caja_id, notas, nombre_cliente, documento_cliente, tipo_documento }) {
  if (!sesion_caja_id) {
    throw Object.assign(new Error('No hay caja abierta. Abre la caja antes de crear una orden.'), { status: 409 });
  }
  const sesionActiva = await SesionCaja.findByPk(sesion_caja_id);
  if (!sesionActiva || sesionActiva.estado !== 'abierta') {
    throw Object.assign(new Error('La sesión de caja no está abierta.'), { status: 409 });
  }
  const sucursal_id = sesionActiva.sucursal_id;

  if (tipo === 'mesa') {
    // La apertura/cierre de la sesión de autoservicio es ahora 100% explícita
    // (ver mesasService.abrirSesion/cerrarSesion invocadas solo desde
    // POST/DELETE /mesas/:id/sesion) — crear() ya no la abre como efecto
    // secundario. Igual se avisa si el staff intenta crear un pedido manual
    // en una mesa que ya tiene autoservicio activo, en vez de mezclarlo en
    // silencio (Decisión 5 del diseño). El lock de fila sobre la mesa evita
    // que dos terminales tocando "nueva orden — Mesa 8" casi al mismo tiempo
    // pasen ambas el chequeo de mesa antes de que cualquiera escriba.
    const t = await sequelize.transaction();
    let pedidoId;
    try {
      const mesa = await Mesa.findByPk(mesa_id, { transaction: t, lock: t.LOCK.UPDATE });
      if (!mesa) throw Object.assign(new Error('Mesa no encontrada'), { status: 404 });

      const sesionExistente = await mesasService.obtenerSesionActiva(mesa_id);
      if (sesionExistente) {
        throw Object.assign(
          new Error(`Mesa ya tiene una sesión activa desde las ${sesionExistente.abierta_en.toLocaleTimeString('es-BO')}`),
          { status: 409, sesion_activa: sesionExistente }
        );
      }

      const estado_cocina = await _estadoCocinaInicial();
      const pedido = await Pedido.create({
        mesa_id, tipo: 'mesa', usuario_id, cliente_id, sesion_caja_id, sucursal_id, notas,
        estado_cocina,
        nombre_cliente: nombre_cliente || 'Público General',
        documento_cliente,
        tipo_documento: tipo_documento || 'Ticket',
      }, { transaction: t });
      await mesa.update({ estado: 'ocupada' }, { transaction: t });
      await t.commit();
      pedidoId = pedido.id;
    } catch (err) {
      if (!t.finished) await t.rollback();
      throw err;
    }

    const resultado = await obtener(pedidoId);
    emitir('restaurante:actualizar', { tipo: 'pedido_nuevo' }, sucursal_id);
    return resultado;
  }

  // tipo === 'llevar'
  const numero_llevar = await _siguienteNumeroLlevar();
  const estado_cocina = await _estadoCocinaInicial();
  const pedido = await Pedido.create({
    mesa_id: null, tipo: 'llevar', numero_llevar, usuario_id, cliente_id, sesion_caja_id, sucursal_id, notas,
    estado_cocina,
    nombre_cliente: nombre_cliente || 'Cliente',
    documento_cliente,
    tipo_documento: tipo_documento || 'Ticket',
  });
  const resultado = await obtener(pedido.id);
  emitir('restaurante:actualizar', { tipo: 'pedido_nuevo' }, sucursal_id);
  return resultado;
}

// Decide en qué sesión de caja se asienta el ingreso de una venta. El caso
// normal (venta en efectivo, o QR que confirma dentro del turno) devuelve
// pedido.sesion_caja_id sin cambios. Sólo cuando esa sesión ya se cerró —un
// pago QR que confirma tarde, hasta 30 min después de generarse— se busca la
// sesión abierta actual de la sucursal para no ensuciar un arqueo ya cerrado.
// Si no hay ninguna abierta, se cae de vuelta a la original (mejor que perder
// la venta de los libros) y se deja un aviso en el log.
async function _sesionCajaParaAsiento(pedido, transaction) {
  const original = await SesionCaja.findByPk(pedido.sesion_caja_id, { transaction });
  if (!original || original.estado === 'abierta') return pedido.sesion_caja_id;

  const abierta = await SesionCaja.findOne({
    where: { sucursal_id: pedido.sucursal_id, estado: 'abierta' },
    transaction,
  });
  if (abierta) return abierta.id;

  console.warn(
    `[ventas] Pago QR del pedido #${pedido.id} confirmó después de cerrarse su sesión de caja ` +
    `#${pedido.sesion_caja_id} y no hay ninguna caja abierta en la sucursal ${pedido.sucursal_id}: ` +
    'el asiento se registra igual en la sesión cerrada.'
  );
  return pedido.sesion_caja_id;
}

/**
 * Completa una venta ya decidida (efectivo, o confirmación de un pago QR):
 * marca el pedido completado, descuenta stock, registra el ingreso en el
 * libro de caja y libera la mesa si corresponde. Debe correr dentro de una
 * transacción activa.
 */
async function _finalizarVenta({ pedido, detalles, metodo_pago, monto_recibido, descuento = 0, propina = 0, usuario_id, puntos_canjear = 0, cupon_codigo, canjeYaReservado = false }, transaction) {
  const cfgFidelidad = await _configFidelidad(transaction);

  let puntosCanjeados, descuentoPuntos, clienteBloqueado;
  let cupon, descuentoCupon;
  if (canjeYaReservado) {
    // Pago QR: los puntos y el cupón ya se reservaron al generar el QR (ver
    // iniciarPagoQr), porque el monto cobrado quedó fijo desde ese momento.
    // Acá solo se usa lo que ya quedó persistido en el pedido — no se vuelve
    // a tocar el saldo del cliente ni el contador de usos del cupón.
    puntosCanjeados = pedido.puntos_canjeados || 0;
    descuentoPuntos = puntosCanjeados * cfgFidelidad.valorPunto;
    clienteBloqueado = null;
    cupon = null;
    descuentoCupon = parseFloat(pedido.descuento_cupon || 0);
  } else {
    ({ puntos: puntosCanjeados, descuento: descuentoPuntos, cliente: clienteBloqueado } =
      await _resolverCanje(pedido.cliente_id, puntos_canjear, cfgFidelidad, transaction, metodo_pago));
    ({ cupon, descuento: descuentoCupon } =
      await _resolverCupon(cupon_codigo, parseFloat(pedido.total) - parseFloat(descuento), pedido.cliente_id, transaction, detalles));
  }

  const monto_neto = Math.max(0, parseFloat(pedido.total) - parseFloat(descuento) - descuentoPuntos - descuentoCupon + parseFloat(propina));
  const cambio = metodo_pago === 'efectivo' ? parseFloat(monto_recibido) - monto_neto : 0;
  const puntosGanados = (pedido.cliente_id && cfgFidelidad.activa) ? Math.floor(monto_neto * cfgFidelidad.puntosPorBs) : 0;

  const datosPedido = {
    estado: 'completado', metodo_pago, monto_recibido: monto_recibido || monto_neto, cambio, descuento, propina,
    puntos_ganados: puntosGanados, puntos_canjeados: puntosCanjeados, descuento_cupon: descuentoCupon,
  };
  if (!canjeYaReservado) datosPedido.cupon_id = cupon ? cupon.id : null;
  await pedido.update(datosPedido, { transaction });

  if (cupon) await cupon.update({ usos_actuales: cupon.usos_actuales + 1, usado_en: new Date() }, { transaction });

  // Si el canje ya se reservó (QR), el saldo solo se mueve para acreditar lo
  // ganado. Si no (efectivo), falta descontar el canje además de acreditar.
  const faltaDescontarCanje = !canjeYaReservado && puntosCanjeados > 0;
  if (pedido.cliente_id && (puntosGanados > 0 || faltaDescontarCanje)) {
    const cliente = clienteBloqueado ?? await Cliente.findByPk(pedido.cliente_id, { transaction, lock: transaction.LOCK.UPDATE });
    if (cliente) {
      const delta = puntosGanados - (faltaDescontarCanje ? puntosCanjeados : 0);
      await cliente.update({ puntos: cliente.puntos + delta }, { transaction });
    }
  }

  if (pedido.tipo !== 'llevar' && pedido.mesa_id) {
    // 'listo' también cuenta como pedido activo sin cobrar todavía, y
    // 'pendiente_pago' cubre un cobro QR en curso en otro pedido de la
    // misma mesa (autoservicio u otro) — si se ignora, la mesa se libera
    // de más mientras ese pago todavía puede confirmarse.
    //
    // Esto solo libera mesa.estado (el mapa visual de mesas) — la sesión de
    // autoservicio NO se cierra acá. Si se cerrara cada vez que la cocina
    // queda sin pedidos pendientes, la mesa 8 perdería el QR habilitado
    // apenas se cobra la primera ronda, aunque la familia siga sentada
    // pidiendo la ronda 2. La sesión solo la cierra el staff a mano
    // (POST/DELETE /mesas/:id/sesion) cuando la mesa realmente se desocupa.
    const activos = await Pedido.count({ where: { mesa_id: pedido.mesa_id, estado: ['pendiente', 'listo', 'pendiente_pago'] }, transaction });
    if (activos === 0) {
      await Mesa.update({ estado: 'disponible' }, { where: { id: pedido.mesa_id }, transaction });
    }
  }

  // Un pago QR tiene hasta 30 minutos para confirmarse. Si el cajero cierra
  // y arquea su turno dentro de esa ventana, escribir en pedido.sesion_caja_id
  // (la sesión abierta cuando se CREÓ el pedido) corrompe a posteriori un
  // turno ya conciliado. Se redirige el asiento a la sesión que esté abierta
  // ahora en la misma sucursal. No se toca pedido.sesion_caja_id: otras
  // lecturas (reportes, historial) siguen viendo el turno original.
  const sesionDestinoId = await _sesionCajaParaAsiento(pedido, transaction);

  await LibroCaja.create({
    sesion_caja_id: sesionDestinoId, usuario_id, tipo: 'ingreso', concepto: `Venta #${pedido.id}`, monto: monto_neto, metodo_pago, referencia_id: pedido.id,
  }, { transaction });

  await SesionCaja.increment('total_ventas', { by: monto_neto, where: { id: sesionDestinoId }, transaction });

  for (const detalle of detalles) {
    // Línea totalmente anulada antes del cobro: no se vendió nada, no se
    // descuenta stock ni insumos (evita movimientos de inventario en 0).
    if (cantidadVigente(detalle) <= 0) continue;
    if (detalle.combo_id) {
      const combo = await Combo.findByPk(detalle.combo_id, {
        include: [{ model: Producto, as: 'productos', attributes: ['id', 'stock'], through: { attributes: ['cantidad'] } }],
        transaction,
      });
      if (!combo) continue;
      for (const p of combo.productos) {
        const cantidadComponente = cantidadVigente(detalle) * p.ComboProducto.cantidad;
        if (p.stock !== null) {
          await ajustarStockSucursal({
            producto_id: p.id, sucursal_id: pedido.sucursal_id, tipo: 'venta', cantidad: cantidadComponente,
            usuario_id, nota: `Venta #${pedido.id} (combo ${combo.nombre})`, transaction,
          });
        }
        // Opciones que el cliente eligió para ESTE producto dentro del combo
        // (ver docs/superpowers/specs/2026-09-07-opciones-en-combos-design.md).
        // Antes se ignoraban acá y solo se aplicaba la receta base.
        const opcionesElegidas = detalle.id
          ? (await DetallePedidoComboOpcion.findAll({
              where: { detalle_pedido_id: detalle.id, producto_id: p.id }, transaction,
            })).map(o => o.opcion_id)
          : [];
        await _descontarInsumosPorVenta({
          producto_id: p.id, opcion_ids: opcionesElegidas, cantidadVendida: cantidadComponente, sucursal_id: pedido.sucursal_id,
          usuario_id, notaBase: `Venta #${pedido.id} (combo ${combo.nombre})`, transaction,
        });
      }
      continue;
    }
    const producto = await Producto.findByPk(detalle.producto_id, { transaction });
    if (producto && producto.stock !== null) {
      await ajustarStockSucursal({
        producto_id: detalle.producto_id, sucursal_id: pedido.sucursal_id, tipo: 'venta', cantidad: cantidadVigente(detalle),
        usuario_id, nota: `Venta #${pedido.id}`, transaction,
      });
    }
    if (producto) {
      const opcionesElegidas = detalle.id
        ? (await DetallePedidoOpcion.findAll({ where: { detalle_pedido_id: detalle.id }, transaction })).map(o => o.opcion_id)
        : [];
      await _descontarInsumosPorVenta({
        producto_id: detalle.producto_id, opcion_ids: opcionesElegidas, cantidadVendida: cantidadVigente(detalle),
        sucursal_id: pedido.sucursal_id, usuario_id, notaBase: `Venta #${pedido.id}`, transaction,
      });
    }
  }

  return monto_neto;
}

// Config del negocio + datos de la caja que hizo la venta (modo y ancho de
// impresión). Compartido por la impresión de venta/cocina y el aviso de anulación.
async function _contextoImpresion(pedido) {
  const cfgRows = await Configuracion.findAll({ where: { clave: ['nombre_negocio', 'simbolo_moneda', 'direccion', 'telefono', 'flujo_cocina', 'cocina_destino', 'cocina_pantalla_dedicada', 'logo'] } });
  const cfg = cfgRows.reduce((o, r) => { o[r.clave] = r.valor; return o; }, {});
  let caja_id = null;
  let modo_impresion = 'fisica';
  let ancho_papel_bluetooth = '80mm';
  let imprimirTicketCliente = true;
  if (pedido.sesion_caja_id) {
    const sesion = await SesionCaja.findByPk(pedido.sesion_caja_id, {
      attributes: ['caja_id'],
      include: [{ model: Caja, as: 'caja', attributes: ['modo_impresion', 'ancho_papel_bluetooth', 'imprimir_ticket_cliente'] }],
    });
    caja_id = sesion ? sesion.caja_id : null;
    modo_impresion = sesion?.caja?.modo_impresion || 'fisica';
    ancho_papel_bluetooth = sesion?.caja?.ancho_papel_bluetooth || '80mm';
    imprimirTicketCliente = sesion?.caja?.imprimir_ticket_cliente !== 0;
  }
  return { cfg, caja_id, modo_impresion, ancho_papel_bluetooth, imprimirTicketCliente };
}

// Avisa a cocina de productos anulados: ticket "ANULAR ..." por el mismo
// canal que una comanda. Solo con cocina física y pedido aún pendiente en
// cocina. Devuelve el payload (para el agente local del navegador) o null.
// Llamar DESPUÉS del commit de la anulación.
// `anulacion.devolucion_id` viaja en el payload: los deduplicadores de
// impresión (agente y pantalla de cocina) usan esa clave en vez del pedido,
// para no descartar el aviso como si fuera la comanda repetida. Si la
// anulación dejó el pedido vacío, ya limpió estado_cocina: se usa el estado
// previo (`estadoCocinaPrevio`) para decidir si avisar.
async function emitirAnulacionCocina(pedido_id, lineasAnuladas, { devolucion_id = null, estadoCocinaPrevio } = {}) {
  const pedido = await Pedido.findByPk(pedido_id, { include: INCLUDE_PEDIDO_COMPLETO });
  if (!pedido) return null;
  const estadoCocina = estadoCocinaPrevio !== undefined ? estadoCocinaPrevio : pedido.estado_cocina;
  if (estadoCocina !== 'pendiente') return null;
  const { cfg, caja_id, modo_impresion, ancho_papel_bluetooth } = await _contextoImpresion(pedido);
  if (cfg.flujo_cocina !== 'fisico') return null;

  const cantidades = new Map(lineasAnuladas.map(l => [Number(l.detalle_pedido_id), Number(l.cantidad)]));
  const json = pedido.toJSON();
  json.detalles = (json.detalles || [])
    .filter(d => cantidades.has(d.id))
    .map(d => ({ ...d, cantidad: cantidades.get(d.id) }));
  json.notas = '*** ANULAR ESTOS PRODUCTOS ***';
  if (json.detalles.length === 0) return null;

  const numero_orden_diario = await _numeroOrdenDiarioOriginal(pedido);
  const cocinaPorCaja = cfg.cocina_destino === 'por_caja';
  const datosCocina = {
    pedido: json, config: cfg, numero_orden_diario, modo_impresion, ancho_papel_bluetooth,
    caja_id: cocinaPorCaja ? caja_id : null, anulacion: { devolucion_id },
  };
  if (cocinaPorCaja) emitir('print:cocina', datosCocina, pedido.sucursal_id, caja_id);
  else emitir('print:cocina', datosCocina, pedido.sucursal_id);
  return datosCocina;
}

async function _emitirImpresion(pedido, metodo_pago, cambio, sucursal_id, numeroOrdenDiarioOverride, { esReimpresion = false, suprimirCocina = false } = {}) {
  // Los llamadores normales (crearCompleta, cobrar, _confirmarPagoQr) no
  // pasan override: se recalcula en vivo, como siempre. `reimprimir` sí pasa
  // un valor explícito (el número que tenía el pedido el día que se vendió)
  // para que el ticket reimpreso salga idéntico al original.
  let numero_orden_diario = numeroOrdenDiarioOverride;
  if (numero_orden_diario === undefined) {
    const { inicio: inicioDia, fin: finDia } = _rangoDiaBolivia();
    numero_orden_diario = await Pedido.count({
      where: { creado_en: { [Op.between]: [inicioDia, finDia] }, estado: { [Op.ne]: 'cancelado' } },
    });
  }

  // El ticket de caja va solo a la sala de la caja que hizo la venta (no a
  // toda la sucursal): si hay dos cajas en la misma sucursal, cada una tiene
  // su propio agente/impresora (o celular) y no deben imprimirse tickets
  // cruzados. `modo_impresion` viaja en el payload para que el navegador que
  // hizo la venta sepa, sin otra consulta, si tiene que mandarlo al agente
  // local (física) o armar el ESC/POS y disparar RawBT (bluetooth).
  const { cfg, caja_id, modo_impresion, ancho_papel_bluetooth, imprimirTicketCliente } = await _contextoImpresion(pedido);

  // La reimpresión manual ("Imprimir de nuevo") ignora el flag a propósito:
  // el cajero puede necesitar dar el comprobante puntualmente aunque esa
  // caja no lo imprima sola en cada venta.
  // `caja_id` viaja también DENTRO del payload (no solo como parámetro de
  // enrutamiento del socket) porque el camino principal de impresión es HTTP
  // directo del navegador a http://127.0.0.1 (ver impresionLocal.js) — ese
  // POST no pasa por las salas de socket.io, así que el agente de impresión
  // necesita el dato en el propio cuerpo para poder rechazar un ticket que
  // no le corresponde (ver agent.js). `null` en cocina compartida es
  // intencional: significa "cualquier agente de la sucursal debe imprimirlo".
  let datosCaja = null;
  if (imprimirTicketCliente || esReimpresion) {
    datosCaja = { pedido: _detallesVigentes(pedido.toJSON()), metodo_pago, cambio, config: cfg, numero_orden_diario, modo_impresion, ancho_papel_bluetooth, caja_id };
    emitir('print:caja', datosCaja, sucursal_id, caja_id);
  }

  let datosCocina = null;
  if (cfg.flujo_cocina === 'fisico' && !suprimirCocina) {
    const cocinaPorCaja = cfg.cocina_destino === 'por_caja';
    datosCocina = { pedido: _detallesVigentes(pedido.toJSON()), config: cfg, numero_orden_diario, modo_impresion, ancho_papel_bluetooth, caja_id: cocinaPorCaja ? caja_id : null };
    if (cocinaPorCaja) {
      // Cada caja imprime su propio ticket de cocina junto con el de venta
      // — para negocios chicos sin una estación de cocina fija compartida.
      emitir('print:cocina', datosCocina, sucursal_id, caja_id);
    } else {
      // Modo por defecto: un solo destino de cocina compartido por toda la
      // sucursal, sin importar qué caja vendió.
      emitir('print:cocina', datosCocina, sucursal_id);
    }
  }

  // Se devuelve además del emit por socket para que el navegador que hizo la
  // venta pueda mandarlo directo al agente local (ver print-agent/agent.js),
  // sin depender de que el socket del agente esté conectado al servidor.
  return { caja: datosCaja, cocina: datosCocina };
}

async function _borrarPedidoSinCobrar(pedidoId) {
  await sequelize.transaction(async (t) => {
    const ids = (await DetallePedido.findAll({ where: { pedido_id: pedidoId }, attributes: ['id'], transaction: t })).map((d) => d.id);
    if (ids.length) {
      await DetallePedidoOpcion.destroy({ where: { detalle_pedido_id: ids }, transaction: t });
      await DetallePedidoComboOpcion.destroy({ where: { detalle_pedido_id: ids }, transaction: t });
      await DetallePedido.destroy({ where: { pedido_id: pedidoId }, transaction: t });
    }
    await PagoQr.destroy({ where: { pedido_id: pedidoId }, transaction: t });
    await Pedido.destroy({ where: { id: pedidoId }, transaction: t });
  });
}

// Proveedor de cobro QR elegido en Ajustes › Cobro con QR.
async function _configQr() {
  const filas = await Configuracion.findAll({ where: { clave: ['qr_proveedor', 'qr_propio_imagen'] } });
  const c = Object.fromEntries(filas.map((f) => [f.clave, f.valor]));
  const proveedor = ['codepay', 'baneco', 'propio'].includes(c.qr_proveedor) ? c.qr_proveedor : 'codepay';
  return { proveedor, imagenPropia: c.qr_propio_imagen || '' };
}

const QR_TIPO = { codepay: 'codepay', baneco: 'baneco', propio: 'manual' };

// El pedido desde el QR de la mesa solo funciona con proveedores que
// confirman el pago solos (CodePay, Banco Económico): con el QR propio nadie
// confirmaría a tiempo y el cliente se quedaría esperando en la mesa.
async function qrConfirmaSolo() {
  const { proveedor } = await _configQr();
  return proveedor === 'codepay' || proveedor === 'baneco';
}

/**
 * Genera un QR de cobro (CodePay, Banco Económico o el QR propio del
 * negocio, según Ajustes) para un pedido ya persistido (con su
 * total ya calculado) y deja el pedido en 'pendiente_pago' hasta que se
 * confirme (ver consultarEstadoPagoQr / procesarWebhookPagoQr).
 */
async function iniciarPagoQr(pedido, { descuento = 0, propina = 0, puntos_canjear = 0, cupon_codigo, items } = {}) {
  const cfgFidelidad = await _configFidelidad();

  // El monto que se le cobra al cliente por CodePay queda fijo desde que se
  // genera el QR, así que el canje de puntos (si el negocio lo permite para
  // QR) se reserva ANTES de pedir el QR: se descuentan del cliente de una
  // y se guardan en el pedido. Si algo falla más abajo, se revierten. Si el
  // pago termina fallando/expirando, _revertirPagoQr los devuelve.
  let puntosCanjeados = 0;
  let descuentoPuntos = 0;
  if (cfgFidelidad.canjeQr && pedido.cliente_id && puntos_canjear) {
    await sequelize.transaction(async (t) => {
      const { puntos, descuento: desc, cliente } = await _resolverCanje(pedido.cliente_id, puntos_canjear, cfgFidelidad, t, 'qr');
      if (cliente && puntos > 0) {
        await cliente.update({ puntos: cliente.puntos - puntos }, { transaction: t });
        await pedido.update({ puntos_canjeados: puntos }, { transaction: t });
      }
      puntosCanjeados = puntos;
      descuentoPuntos = desc;
    });
  }

  // Mismo motivo que los puntos: el cupón se resuelve y se marca como usado
  // (incrementa usos_actuales) ACÁ, antes de pedir el QR — si no, dos QR
  // generados en simultáneo para el mismo cupón de un solo uso podrían
  // pasar la validación los dos. Si algo fallara después (el QR o el cobro
  // en sí), se revierte con _devolverCuponReservado / _revertirPagoQr.
  let cuponReservado = null;
  let descuentoCupon = 0;
  if (cupon_codigo) {
    try {
      await sequelize.transaction(async (t) => {
        const { cupon, descuento: desc } = await _resolverCupon(cupon_codigo, parseFloat(pedido.total) - parseFloat(descuento), pedido.cliente_id, t, items);
        await cupon.update({ usos_actuales: cupon.usos_actuales + 1, usado_en: new Date() }, { transaction: t });
        await pedido.update({ cupon_id: cupon.id, descuento_cupon: desc }, { transaction: t });
        cuponReservado = cupon;
        descuentoCupon = desc;
      });
    } catch (err) {
      if (puntosCanjeados > 0) await _devolverPuntosCanjeados(pedido, puntosCanjeados);
      throw err;
    }
  }

  try {
    const estadoPrevio = pedido.estado;
    const monto_neto = Math.max(0, parseFloat(pedido.total) - parseFloat(descuento) - descuentoPuntos - descuentoCupon + parseFloat(propina));
    const intentosPrevios = await PagoQr.count({ where: { pedido_id: pedido.id } });
    const order_id = `pedido_${pedido.id}_${intentosPrevios + 1}`;
    const expires_at = new Date(Date.now() + 30 * 60 * 1000);

    const cfg = await Configuracion.findOne({ where: { clave: 'nombre_negocio' } });
    const description = ((cfg && cfg.valor) || 'Venta').replace(/[^a-zA-Z0-9]/g, '').slice(0, 20) || 'Venta';

    const { proveedor, imagenPropia } = await _configQr();
    let respuesta;
    if (proveedor === 'propio') {
      // QR fijo del negocio: no hay API que confirme, lo confirma el cajero.
      if (!imagenPropia) throw Object.assign(new Error('Sube la imagen de tu QR en Ajustes › Cobro con QR antes de cobrar con QR'), { status: 409 });
      respuesta = { tx_id: null, qr_code: imagenPropia, commission_amount: 0, amount: monto_neto };
    } else if (proveedor === 'baneco') {
      const qr = await banecoClient.generarQr({ transactionId: order_id, amount: monto_neto, description: `${description} pedido ${pedido.id}` });
      respuesta = { tx_id: qr.qrId, qr_code: `data:image/png;base64,${qr.qrImage}`, commission_amount: 0, amount: monto_neto };
    } else {
      respuesta = await codepayClient.generarQr({
        order_id, amount: monto_neto, description, expires_at: expires_at.toISOString(),
      });
    }

    await sequelize.transaction(async (t) => {
      await PagoQr.create({
        pedido_id: pedido.id, sucursal_id: pedido.sucursal_id, proveedor, order_id,
        tx_id: respuesta.tx_id, estado: 'pendiente', estado_previo: estadoPrevio,
        monto_neto, comision: respuesta.commission_amount, monto_total: respuesta.amount,
        qr_code: respuesta.qr_code, expires_at,
      }, { transaction: t });

      await pedido.update({ estado: 'pendiente_pago', metodo_pago: 'qr', descuento, propina }, { transaction: t });
    });

    return {
      proveedor, qr_code: respuesta.qr_code, tx_id: respuesta.tx_id, expires_at,
      monto_neto, comision: respuesta.commission_amount, monto_total: respuesta.amount,
    };
  } catch (err) {
    if (puntosCanjeados > 0) await _devolverPuntosCanjeados(pedido, puntosCanjeados);
    if (cuponReservado) await _devolverCuponReservado(pedido, cuponReservado.id);
    throw err;
  }
}

// Devuelve al cliente los puntos reservados para un intento de pago QR que
// no llegó a generarse (o que falló/expiró/fue rechazado) — usado por
// iniciarPagoQr (si el propio generarQr falla) y por _revertirPagoQr.
async function _devolverPuntosCanjeados(pedido, puntos) {
  await sequelize.transaction(async (t) => {
    const cliente = await Cliente.findByPk(pedido.cliente_id, { transaction: t, lock: t.LOCK.UPDATE });
    if (cliente) await cliente.update({ puntos: cliente.puntos + puntos }, { transaction: t });
    await Pedido.update({ puntos_canjeados: 0 }, { where: { id: pedido.id }, transaction: t });
  });
}

// Devuelve el uso reservado de un cupón para un intento de pago QR que no
// llegó a generarse (o que falló/expiró/fue rechazado) — mismo rol que
// _devolverPuntosCanjeados pero para el contador usos_actuales del cupón.
async function _devolverCuponReservado(pedido, cupon_id) {
  await sequelize.transaction(async (t) => {
    const cupon = await Cupon.findByPk(cupon_id, { transaction: t, lock: t.LOCK.UPDATE });
    if (cupon) await cupon.update({ usos_actuales: Math.max(0, cupon.usos_actuales - 1) }, { transaction: t });
    await Pedido.update({ cupon_id: null, descuento_cupon: 0 }, { where: { id: pedido.id }, transaction: t });
  });
}

async function _revertirPagoQr(pagoQrInicial, nuevoEstado) {
  await sequelize.transaction(async (t) => {
    const pagoQr = await PagoQr.findByPk(pagoQrInicial.id, { transaction: t, lock: t.LOCK.UPDATE });
    if (!pagoQr || pagoQr.estado !== 'pendiente') return; // ya resuelto por otra llamada concurrente
    await pagoQr.update({ estado: nuevoEstado }, { transaction: t });

    const pedido = await Pedido.findByPk(pagoQr.pedido_id, { transaction: t, lock: t.LOCK.UPDATE });
    if (pedido && pedido.puntos_canjeados > 0) {
      const cliente = await Cliente.findByPk(pedido.cliente_id, { transaction: t, lock: t.LOCK.UPDATE });
      if (cliente) await cliente.update({ puntos: cliente.puntos + pedido.puntos_canjeados }, { transaction: t });
    }
    if (pedido && pedido.cupon_id) {
      const cupon = await Cupon.findByPk(pedido.cupon_id, { transaction: t, lock: t.LOCK.UPDATE });
      if (cupon) await cupon.update({ usos_actuales: Math.max(0, cupon.usos_actuales - 1) }, { transaction: t });
    }
    // Un pedido de autoservicio NO puede volver a su estado_previo: ese
    // estado es 'pendiente', que es una cola de cocina real (ver
    // listarCocina). Un pago abandonado/vencido se convertiría en un ticket
    // fantasma de comida que nadie pagó, y además dejaría la sesión de mesa
    // abierta para siempre (la mesa queda "ocupada" y bloqueada para todo
    // pedido futuro, de staff o autoservicio). Se cancela y se libera la
    // mesa con el mismo criterio que cancelar(). El flujo de staff sí vuelve
    // a estado_previo: ahí el pedido ya existía en cocina antes del intento
    // de cobro y el mozo sigue atendiendo la mesa.
    const esAutoservicio = pedido && pedido.origen === 'autoservicio';
    const cambiosPedido = { estado: esAutoservicio ? 'cancelado' : pagoQr.estado_previo, puntos_canjeados: 0, cupon_id: null, descuento_cupon: 0 };
    if (esAutoservicio) cambiosPedido.estado_cocina = null;
    await Pedido.update(
      cambiosPedido,
      { where: { id: pagoQr.pedido_id }, transaction: t }
    );

    // Libera mesa.estado (mapa visual) si esta era la última orden pendiente,
    // pero NO cierra la sesión de autoservicio — que un pago se haya
    // abandonado no significa que la mesa se desocupó; el cliente puede
    // seguir sentado e intentar pedir de nuevo. La sesión solo la cierra el
    // staff a mano.
    if (esAutoservicio && pedido.tipo !== 'llevar' && pedido.mesa_id) {
      const activos = await Pedido.count({
        where: { mesa_id: pedido.mesa_id, estado: ['pendiente', 'listo', 'pendiente_pago'] },
        transaction: t,
      });
      if (activos === 0) {
        await Mesa.update({ estado: 'disponible' }, { where: { id: pedido.mesa_id }, transaction: t });
      }
    }
  });
}

// Barre pagos QR vencidos sin depender de que alguien esté consultando su
// estado activamente (ver backend/src/jobs/expirarPagosQr.job.js) — mismo
// camino que usa consultarEstadoPagoQr cuando detecta un vencido al pollear.
async function revertirPagosQrVencidos() {
  const vencidos = await PagoQr.findAll({ where: { estado: 'pendiente', expires_at: { [Op.lt]: new Date() } } });
  let revertidos = 0;
  for (const pagoQr of vencidos) {
    await _revertirPagoQr(pagoQr, 'expirado');
    _anularEnBanco(pagoQr);
    revertidos++;
  }
  return { revertidos };
}

async function _confirmarPagoQr(pagoQrInicial, { confirmado_por = null } = {}) {
  const pedidoId = await sequelize.transaction(async (t) => {
    const pagoQr = await PagoQr.findByPk(pagoQrInicial.id, { transaction: t, lock: t.LOCK.UPDATE });
    if (!pagoQr || pagoQr.estado !== 'pendiente') return null; // ya resuelto por otra llamada concurrente

    const pedido = await Pedido.findByPk(pagoQr.pedido_id, { include: INCLUDE_PEDIDO_COMPLETO, transaction: t });
    const detalles = pedido.detalles.map((d) => ({ id: d.id, producto_id: d.producto_id, combo_id: d.combo_id, cantidad: d.cantidad, cantidad_anulada: d.cantidad_anulada }));

    await _finalizarVenta({
      pedido, detalles, metodo_pago: 'qr', monto_recibido: pagoQr.monto_neto,
      descuento: pedido.descuento, propina: pedido.propina, usuario_id: pedido.usuario_id,
      canjeYaReservado: true,
    }, t);
    await pagoQr.update({ estado: 'completado' }, { transaction: t });
    await Pedido.update(
      { qr_tipo: QR_TIPO[pagoQr.proveedor] ?? 'codepay', qr_confirmado_por: confirmado_por },
      { where: { id: pedido.id }, transaction: t },
    );
    // Un pago QR de autoservicio se confirma ANTES de que la comida se
    // prepare (es el pago del pedido recién hecho, no el cierre de una
    // cuenta abierta) — limpiar estado_cocina acá lo ocultaría de Cocina
    // antes de que se cocine, reproduciendo el bug original para ese
    // flujo. Para staff (una mesa que ya estaba en curso y se cobra por
    // QR), este SÍ es el evento de "ya se pagó, sale de cocina".
    if (pedido.origen !== 'autoservicio') {
      await Pedido.update({ estado_cocina: null }, { where: { id: pedido.id }, transaction: t });
    }
    return pedido.id;
  });

  if (!pedidoId) return null;

  const completado = await obtener(pedidoId);
  emitir('restaurante:actualizar', { tipo: 'pedido_cobrado' }, completado.sucursal_id);
  if (completado.origen === 'autoservicio') {
    emitir('restaurante:autoservicio_confirmado', {
      pedido_id: completado.id,
      mesa: completado.mesa?.nombre ?? null,
      monto: parseFloat(completado.total),
    }, completado.sucursal_id);
  }
  await _emitirImpresion(completado, 'qr', 0, completado.sucursal_id);
  return completado;
}

async function consultarEstadoPagoQr(pedido_id, alcance) {
  const pedido = await Pedido.findByPk(pedido_id);
  if (!pedido) throw Object.assign(new Error('Pedido no encontrado'), { status: 404 });
  _verificarAlcance(pedido, alcance);

  const pagoQr = await PagoQr.findOne({ where: { pedido_id }, order: [['id', 'DESC']] });
  if (!pagoQr) throw Object.assign(new Error('No hay un pago QR para este pedido'), { status: 404 });

  // El webhook de CodePay puede confirmar/revertir el pago entre un poll y
  // el siguiente — si ya se resolvió (por el webhook), se devuelve directo
  // en vez de volver a filtrar por estado 'pendiente' (que ya no matchea y
  // antes producía un 404 acá, dejando el modal de cobro esperando
  // indefinidamente aunque el pago ya estuviera confirmado).
  if (pagoQr.estado !== 'pendiente') {
    return { estado: pagoQr.estado, pedido: await obtener(pedido_id) };
  }

  if (new Date() > pagoQr.expires_at) {
    await _revertirPagoQr(pagoQr, 'expirado');
    _anularEnBanco(pagoQr);
    return { estado: 'expirado', pedido: await obtener(pedido_id) };
  }

  // QR propio: nadie del lado del banco avisa, queda pendiente hasta que el
  // cajero lo confirme (confirmarPagoQrManual).
  if (pagoQr.proveedor === 'propio') return { estado: 'pendiente', proveedor: 'propio', pedido: await obtener(pedido_id) };

  if (pagoQr.proveedor === 'baneco') {
    const r = await _verificarPagoBaneco(pagoQr);
    return { estado: r, pedido: await obtener(pedido_id) };
  }

  const estadoCodepay = await codepayClient.consultarEstado(pagoQr.tx_id);

  if (estadoCodepay.status === 'completed') {
    await _confirmarPagoQr(pagoQr);
    return { estado: 'completado', pedido: await obtener(pedido_id) };
  }
  if (estadoCodepay.status === 'failed') {
    await _revertirPagoQr(pagoQr, 'fallido');
    return { estado: 'fallido', pedido: await obtener(pedido_id) };
  }
  return { estado: 'pendiente', pedido: await obtener(pedido_id) };
}

async function cancelarPagoQr(pedido_id, alcance) {
  const pedido = await Pedido.findByPk(pedido_id);
  if (!pedido) throw Object.assign(new Error('Pedido no encontrado'), { status: 404 });
  _verificarAlcance(pedido, alcance);

  const pagoQr = await PagoQr.findOne({ where: { pedido_id, estado: 'pendiente' }, order: [['id', 'DESC']] });
  if (!pagoQr) throw Object.assign(new Error('No hay un pago QR pendiente para este pedido'), { status: 404 });

  await _revertirPagoQr(pagoQr, 'cancelado');
  _anularEnBanco(pagoQr);
  return obtener(pedido_id);
}

// Consulta al banco el estado de un QR de Banco Económico y aplica el
// resultado. Lo usan el polling del cobro y la notificación del banco (que
// no trae firma: nunca se confía en su cuerpo, siempre se re-consulta).
async function _verificarPagoBaneco(pagoQr) {
  const { codigo, pago } = await banecoClient.consultarEstado(pagoQr.tx_id);
  if (codigo === 1) {
    const pagado = Number(pago?.amount ?? pagoQr.monto_neto);
    if (pagado + 0.005 < Number(pagoQr.monto_neto)) {
      console.error(`Banco Económico: QR ${pagoQr.tx_id} pagado por ${pagado}, se esperaba ${pagoQr.monto_neto}`);
      return 'pendiente';
    }
    await PagoQr.update({ datos_webhook: pago }, { where: { id: pagoQr.id } });
    await _confirmarPagoQr(pagoQr);
    return 'completado';
  }
  if (codigo === 9) {
    await _revertirPagoQr(pagoQr, 'cancelado');
    return 'cancelado';
  }
  return 'pendiente';
}

// Anula en el banco un QR que el sistema ya dio por cancelado/vencido, para
// que no se pueda pagar después. Si el banco falla, solo se registra: el
// pedido ya quedó revertido de este lado.
function _anularEnBanco(pagoQr) {
  if (pagoQr.proveedor !== 'baneco' || !pagoQr.tx_id) return;
  banecoClient.anularQr(pagoQr.tx_id).catch((e) => console.error(`No se pudo anular el QR ${pagoQr.tx_id} en Banco Económico:`, e.message));
}

/** Notificación de pago de Banco Económico (POST /api/qrsimple/notifyPaymentQR). */
async function procesarNotificacionBaneco(payment) {
  if (!payment?.qrId) return;
  const pagoQr = await PagoQr.findOne({ where: { proveedor: 'baneco', tx_id: String(payment.qrId) } });
  if (!pagoQr || pagoQr.estado !== 'pendiente') return;
  await _verificarPagoBaneco(pagoQr);
}

/** El cajero confirma que recibió el pago en el QR propio del negocio. */
async function confirmarPagoQrManual(pedido_id, usuario_id, alcance) {
  const pedido = await Pedido.findByPk(pedido_id);
  if (!pedido) throw Object.assign(new Error('Pedido no encontrado'), { status: 404 });
  _verificarAlcance(pedido, alcance);
  const pagoQr = await PagoQr.findOne({ where: { pedido_id, estado: 'pendiente' }, order: [['id', 'DESC']] });
  if (!pagoQr) throw Object.assign(new Error('No hay un pago QR pendiente para este pedido'), { status: 404 });
  if (pagoQr.proveedor !== 'propio') throw Object.assign(new Error('Este cobro se confirma solo cuando el banco avisa el pago'), { status: 409 });
  const completado = await _confirmarPagoQr(pagoQr, { confirmado_por: usuario_id });
  return completado ?? obtener(pedido_id);
}

/** Cobros con QR propio que esperan que alguien confirme el pago (p. ej. del menú QR). */
async function listarPagosQrPorConfirmar({ sucursal_id, acceso_todas } = {}) {
  const where = { proveedor: 'propio', estado: 'pendiente', expires_at: { [Op.gt]: new Date() } };
  if (!acceso_todas) where.sucursal_id = sucursal_id;
  const pagos = await PagoQr.findAll({ where, order: [['creado_en', 'ASC']], attributes: ['id', 'pedido_id', 'monto_neto', 'creado_en', 'expires_at'] });
  if (!pagos.length) return [];
  const pedidos = await Pedido.findAll({ where: { id: pagos.map((p) => p.pedido_id) }, include: [{ model: Mesa, as: 'mesa', attributes: ['id', 'nombre'] }], attributes: ['id', 'tipo', 'origen', 'nombre_cliente', 'numero_llevar'] });
  const porId = Object.fromEntries(pedidos.map((p) => [p.id, p]));
  return pagos.map((p) => ({ ...p.toJSON(), pedido: porId[p.pedido_id] ?? null }));
}

/** Usado por el endpoint de webhook (Task 4). Idempotente. */
async function procesarWebhookPagoQr({ event, order_id }) {
  const pagoQr = await PagoQr.findOne({ where: { order_id } });
  if (!pagoQr || pagoQr.estado !== 'pendiente') return;

  if (event === 'payment.completed') {
    await _confirmarPagoQr(pagoQr);
  } else if (event === 'payment.failed') {
    await _revertirPagoQr(pagoQr, 'fallido');
  }
}

async function crearCompleta({ tipo, mesa_id, nombre_cliente, documento_cliente, tipo_documento, notas, items, metodo_pago, monto_recibido, descuento = 0, propina = 0, sesion_caja_id, usuario_id, cliente_id, puntos_canjear = 0, cupon_codigo, mesa_sesion_id = null, origen = 'staff', direccion_entrega = null, telefono_cliente = null, origen_app = null }) {
  if (!sesion_caja_id) {
    throw Object.assign(new Error('No hay caja abierta. Abre la caja antes de crear una orden.'), { status: 409 });
  }
  const sesionActiva = await SesionCaja.findByPk(sesion_caja_id);
  if (!sesionActiva || sesionActiva.estado !== 'abierta') {
    throw Object.assign(new Error('La sesión de caja no está abierta.'), { status: 409 });
  }
  const sucursal_id = sesionActiva.sucursal_id;

  if (!items || items.length === 0) {
    throw Object.assign(new Error('El pedido no tiene productos'), { status: 409 });
  }

  const productos = [];
  for (const item of items) {
    if (item.combo_id) {
      const combo = await Combo.findByPk(item.combo_id);
      if (!combo) throw Object.assign(new Error('Combo no encontrado'), { status: 404 });
      if (!combo.activo || !estaActivoHoy(combo)) {
        throw Object.assign(new Error(`El combo "${combo.nombre}" no está disponible`), { status: 409 });
      }
      const opcionesPorProducto = await _validarOpcionesCombo(item.combo_id, item.opciones_por_producto);
      const extraCombo = await _extraPorOpciones(opcionesPorProducto.flatMap((o) => o.opcion_ids || []));
      const linea = { cantidad: item.cantidad ?? 1, precio: parseFloat(combo.precio) + extraCombo, peso: null };
      productos.push({ item, combo, linea, opcionesPorProducto });
      continue;
    }
    const producto = await Producto.findByPk(item.producto_id);
    if (!producto) throw Object.assign(new Error('Producto no encontrado'), { status: 404 });
    if (!producto.activo || !producto.es_vendible) throw Object.assign(new Error('Producto no disponible'), { status: 409 });
    const extra = await _extraPorOpciones(item.opcion_ids);
    const precioBase = await _precioConPromocion(producto);
    const linea = _datosLinea(item, producto, precioBase, extra);
    productos.push({ item, producto, linea });
  }

  let mesa = null;
  if (tipo === 'mesa') {
    if (!mesa_id) throw Object.assign(new Error('mesa_id es requerido'), { status: 400 });
    mesa = await Mesa.findByPk(mesa_id);
    if (!mesa) throw Object.assign(new Error('Mesa no encontrada'), { status: 404 });
    if (!mesa_sesion_id && mesa.estado !== 'disponible') {
      throw Object.assign(new Error('Mesa ya ocupada'), { status: 409 });
    }
  } else if (tipo === 'delivery') {
    if (!direccion_entrega) throw Object.assign(new Error('direccion_entrega es requerida para pedidos de delivery'), { status: 400 });
  } else if (tipo !== 'llevar') {
    throw Object.assign(new Error("tipo debe ser 'mesa', 'llevar' o 'delivery'"), { status: 400 });
  }

  const cfgFidelidad = await _configFidelidad();
  const { descuento: descuentoPuntos } = await _resolverCanje(cliente_id, puntos_canjear, cfgFidelidad, null, metodo_pago);

  const total = productos.reduce((sum, { linea }) => sum + linea.cantidad * linea.precio, 0);
  const itemsCupon = productos.map(({ item, combo, linea }) => ({ producto_id: combo ? null : item.producto_id, cantidad: linea.cantidad, precio: linea.precio }));
  const { descuento: descuentoCupon } = await _resolverCupon(cupon_codigo, total - parseFloat(descuento), cliente_id, undefined, itemsCupon);
  const monto_neto = Math.max(0, total - parseFloat(descuento) - descuentoPuntos - descuentoCupon + parseFloat(propina));

  if (metodo_pago === 'efectivo' && _montoInsuficiente(monto_recibido, monto_neto)) {
    throw Object.assign(new Error('Monto recibido insuficiente'), { status: 400 });
  }

  const numero_llevar = (tipo === 'llevar' || tipo === 'delivery') ? await _siguienteNumeroLlevar() : null;
  const estadoInicial = (metodo_pago === 'qr' || metodo_pago === 'diferido') ? 'pendiente' : 'completado';
  const estado_cocina = await _estadoCocinaInicial();

  const pedidoId = await sequelize.transaction(async (t) => {
    const pedido = await Pedido.create({
      mesa_id: tipo === 'mesa' ? mesa_id : null,
      mesa_sesion_id: tipo === 'mesa' ? mesa_sesion_id : null,
      tipo, origen, origen_app, numero_llevar, usuario_id, cliente_id: cliente_id || null, sesion_caja_id, sucursal_id, notas,
      estado: estadoInicial, estado_cocina, total, descuento, propina, metodo_pago: 'efectivo',
      nombre_cliente: nombre_cliente || (tipo === 'mesa' ? 'Público General' : 'Cliente'),
      documento_cliente,
      telefono_cliente,
      direccion_entrega: tipo === 'delivery' ? direccion_entrega : null,
      tipo_documento: tipo_documento || 'Ticket',
    }, { transaction: t });

    const detalles = [];
    for (const { item, combo, linea, opcionesPorProducto } of productos) {
      const detallePedido = await DetallePedido.create({
        pedido_id: pedido.id,
        producto_id: combo ? null : item.producto_id,
        combo_id: combo ? item.combo_id : null,
        cantidad: linea.cantidad, precio: linea.precio, peso: linea.peso, nota: item.nota,
      }, { transaction: t });
      if (!combo && item.opcion_ids?.length) {
        await DetallePedidoOpcion.bulkCreate(
          item.opcion_ids.map(opcion_id => ({ detalle_pedido_id: detallePedido.id, opcion_id })),
          { transaction: t },
        );
      }
      if (combo && opcionesPorProducto?.length) {
        const filas = opcionesPorProducto.flatMap((o) =>
          (o.opcion_ids || []).map((opcion_id) => ({ detalle_pedido_id: detallePedido.id, producto_id: o.producto_id, opcion_id }))
        );
        if (filas.length) await DetallePedidoComboOpcion.bulkCreate(filas, { transaction: t });
      }
      detalles.push({ id: detallePedido.id, producto_id: combo ? null : item.producto_id, combo_id: combo ? item.combo_id : null, cantidad: linea.cantidad, precio: linea.precio });
    }

    if (metodo_pago !== 'qr' && metodo_pago !== 'diferido') {
      await _finalizarVenta({ pedido, detalles, metodo_pago, monto_recibido, descuento, propina, usuario_id, puntos_canjear, cupon_codigo }, t);
    }

    return pedido.id;
  });

  if (metodo_pago === 'qr') {
    const pedidoPendiente = await Pedido.findByPk(pedidoId);
    let pago_qr;
    try {
      pago_qr = await iniciarPagoQr(pedidoPendiente, { descuento, propina, puntos_canjear, cupon_codigo, items: itemsCupon });
    } catch (err) {
      // Sin QR el pedido no existe para nadie (no se avisó a cocina ni se
      // cobró): se borra, para que reintentar el cobro no lo duplique.
      await _borrarPedidoSinCobrar(pedidoId);
      throw err;
    }
    emitir('restaurante:actualizar', { tipo: 'pedido_nuevo' }, sucursal_id);
    return { pedido: await obtener(pedidoId), pago_qr };
  }

  if (metodo_pago === 'diferido') {
    const creado = await obtener(pedidoId);
    emitir('restaurante:actualizar', { tipo: 'pedido_nuevo' }, sucursal_id);
    // A diferencia del QR pendiente (que espera confirmación de pago antes de
    // imprimir), acá la comida hay que empezar a prepararla ya — el cobro
    // llega después, al entregar — así que se imprime cocina (y el ticket de
    // cliente, si la caja no lo desactivó) de una.
    const datos_impresion = await _emitirImpresion(creado, metodo_pago, 0, sucursal_id);
    return { ...creado.toJSON(), datos_impresion };
  }

  const creado = await obtener(pedidoId);
  emitir('restaurante:actualizar', { tipo: 'pedido_cobrado' }, sucursal_id);
  const datos_impresion = await _emitirImpresion(creado, metodo_pago, parseFloat(monto_recibido || monto_neto) - monto_neto, sucursal_id);
  return { ...creado.toJSON(), datos_impresion };
}

async function agregarItem(pedido_id, { producto_id, combo_id, cantidad = 1, nota, peso, opcion_ids, opciones_por_producto }, alcance) {
  const pedido = await Pedido.findByPk(pedido_id);
  if (!pedido) throw Object.assign(new Error('Pedido no encontrado'), { status: 404 });
  _verificarAlcance(pedido, alcance);
  if (pedido.estado !== 'pendiente') throw Object.assign(new Error('El pedido no está pendiente'), { status: 409 });

  if (combo_id) {
    const combo = await Combo.findByPk(combo_id);
    if (!combo) throw Object.assign(new Error('Combo no encontrado'), { status: 404 });
    if (!combo.activo || !estaActivoHoy(combo)) {
      throw Object.assign(new Error(`El combo "${combo.nombre}" no está disponible`), { status: 409 });
    }
    const opcionesPorProductoValidadas = await _validarOpcionesCombo(combo_id, opciones_por_producto);
    const extraCombo = await _extraPorOpciones(opcionesPorProductoValidadas.flatMap((o) => o.opcion_ids || []));
    const item = await DetallePedido.create({
      pedido_id, combo_id, producto_id: null, cantidad, precio: parseFloat(combo.precio) + extraCombo, peso: null, nota,
    });
    if (opcionesPorProductoValidadas.length) {
      const filas = opcionesPorProductoValidadas.flatMap((o) =>
        (o.opcion_ids || []).map((opcion_id) => ({ detalle_pedido_id: item.id, producto_id: o.producto_id, opcion_id }))
      );
      if (filas.length) await DetallePedidoComboOpcion.bulkCreate(filas);
    }
    await _recalcularTotal(pedido_id);
    if (pedido.estado_cocina === 'listo') {
      await pedido.update({ estado_cocina: 'pendiente' });
    }
    emitir('restaurante:actualizar', { tipo: 'pedido_items' });
    return item;
  }

  const producto = await Producto.findByPk(producto_id);
  if (!producto) throw Object.assign(new Error('Producto no encontrado'), { status: 404 });
  if (!producto.activo || !producto.es_vendible) throw Object.assign(new Error('Producto no disponible'), { status: 409 });

  const extra = await _extraPorOpciones(opcion_ids);
  const precioBase = await _precioConPromocion(producto);
  const linea = _datosLinea({ cantidad, peso }, producto, precioBase, extra);

  const item = await DetallePedido.create({
    pedido_id,
    producto_id,
    cantidad: linea.cantidad,
    precio: linea.precio,
    peso: linea.peso,
    nota,
  });

  if (opcion_ids?.length) {
    await DetallePedidoOpcion.bulkCreate(opcion_ids.map(opcion_id => ({ detalle_pedido_id: item.id, opcion_id })));
  }

  await _recalcularTotal(pedido_id);
  if (pedido.estado_cocina === 'listo') {
    await pedido.update({ estado_cocina: 'pendiente' });
  }
  emitir('restaurante:actualizar', { tipo: 'pedido_items' });
  return item;
}

async function actualizarItem(pedido_id, item_id, { cantidad, nota, estado, peso }, alcance) {
  const pedido = await Pedido.findByPk(pedido_id);
  if (!pedido) throw Object.assign(new Error('Pedido no encontrado'), { status: 404 });
  _verificarAlcance(pedido, alcance);
  if (pedido.estado !== 'pendiente') throw Object.assign(new Error('Pedido no modificable'), { status: 409 });
  const item = await DetallePedido.findOne({ where: { id: item_id, pedido_id } });
  if (!item) throw Object.assign(new Error('Item no encontrado'), { status: 404 });

  if (item.peso !== null && peso !== undefined) {
    const producto = await Producto.findByPk(item.producto_id);
    const precioBase = await _precioConPromocion(producto);
    const linea = _datosLinea({ peso }, producto, precioBase);
    await item.update({ peso: linea.peso, precio: linea.precio, nota, estado });
  } else {
    const anulada = Number(item.cantidad_anulada || 0);
    if (cantidad !== undefined && cantidad !== null && Number(cantidad) < anulada) {
      throw Object.assign(new Error(`La cantidad no puede ser menor a lo ya anulado (${anulada})`), { status: 400 });
    }
    await item.update({ cantidad, nota, estado });
  }

  await _recalcularTotal(pedido_id);
  emitir('restaurante:actualizar', { tipo: 'pedido_items' });
  return item;
}

async function eliminarItem(pedido_id, item_id, alcance) {
  const pedido = await Pedido.findByPk(pedido_id);
  if (!pedido) throw Object.assign(new Error('Pedido no encontrado'), { status: 404 });
  _verificarAlcance(pedido, alcance);
  if (pedido.estado !== 'pendiente') throw Object.assign(new Error('Pedido no modificable'), { status: 409 });
  const item = await DetallePedido.findOne({ where: { id: item_id, pedido_id } });
  if (!item) throw Object.assign(new Error('Item no encontrado'), { status: 404 });
  if (Number(item.cantidad_anulada || 0) > 0) {
    // Con anulaciones registradas la línea no se borra (devolucion_items la
    // referencia y es parte del registro): queda totalmente anulada.
    await item.update({ cantidad: item.cantidad_anulada });
  } else {
    await item.destroy();
  }
  await _recalcularTotal(pedido_id);
  emitir('restaurante:actualizar', { tipo: 'pedido_items' });
}

async function cobrar(pedido_id, usuario_id, { metodo_pago, monto_recibido, descuento = 0, propina = 0, cliente_id, puntos_canjear = 0, cupon_codigo }, alcance) {
  const pedido = await Pedido.findByPk(pedido_id, { include: INCLUDE_PEDIDO_COMPLETO });
  if (!pedido) throw Object.assign(new Error('Pedido no encontrado'), { status: 404 });
  _verificarAlcance(pedido, alcance);
  if (!['pendiente', 'listo'].includes(pedido.estado)) throw Object.assign(new Error('El pedido no puede cobrarse'), { status: 409 });
  if (!pedido.sesion_caja_id) throw Object.assign(new Error('No hay sesión de caja activa en este pedido'), { status: 409 });

  const sesion = await SesionCaja.findByPk(pedido.sesion_caja_id);
  if (!sesion || sesion.estado !== 'abierta') throw Object.assign(new Error('La sesión de caja está cerrada'), { status: 409 });

  // El cliente se puede asignar recién al cobrar (el pedido pudo crearse sin
  // uno). Una vez asignado no se pisa, para no perder puntos ya calculados.
  if (cliente_id && !pedido.cliente_id) {
    await pedido.update({ cliente_id });
  }

  const cfgFidelidad = await _configFidelidad();
  const { descuento: descuentoPuntos } = await _resolverCanje(pedido.cliente_id, puntos_canjear, cfgFidelidad, null, metodo_pago);
  const itemsCupon = pedido.detalles.map((d) => ({ producto_id: d.producto_id, cantidad: cantidadVigente(d), precio: parseFloat(d.precio) }));
  const { descuento: descuentoCupon } = await _resolverCupon(cupon_codigo, parseFloat(pedido.total) - parseFloat(descuento), pedido.cliente_id, undefined, itemsCupon);
  const monto_neto = Math.max(0, parseFloat(pedido.total) - parseFloat(descuento) - descuentoPuntos - descuentoCupon + parseFloat(propina));

  if (metodo_pago === 'efectivo' && _montoInsuficiente(monto_recibido, monto_neto)) {
    throw Object.assign(new Error('Monto recibido insuficiente'), { status: 400 });
  }

  if (metodo_pago === 'qr') {
    // El cupón (igual que los puntos) se reserva dentro de iniciarPagoQr,
    // porque el monto cobrado por QR queda fijo desde que se genera.
    const pago_qr = await iniciarPagoQr(pedido, { descuento, propina, puntos_canjear, cupon_codigo, items: itemsCupon });
    return { pedido: await obtener(pedido_id), pago_qr };
  }

  await sequelize.transaction(async (t) => {
    // Se relee el pedido bloqueado: una anulación confirmada entre la lectura
    // de arriba y este punto no debe cobrarse ni descontarse de stock.
    const bloqueado = await Pedido.findByPk(pedido_id, { transaction: t, lock: t.LOCK.UPDATE });
    if (!bloqueado || !['pendiente', 'listo'].includes(bloqueado.estado)) {
      throw Object.assign(new Error('El pedido no puede cobrarse'), { status: 409 });
    }
    if (parseFloat(bloqueado.total) !== parseFloat(pedido.total)) {
      throw Object.assign(new Error('El pedido cambió mientras se cobraba. Vuelve a intentarlo'), { status: 409 });
    }
    const filas = await DetallePedido.findAll({ where: { pedido_id }, transaction: t });
    const detalles = filas.map((d) => ({ id: d.id, producto_id: d.producto_id, combo_id: d.combo_id, cantidad: d.cantidad, cantidad_anulada: d.cantidad_anulada, precio: parseFloat(d.precio) }));
    await _finalizarVenta({ pedido: bloqueado, detalles, metodo_pago, monto_recibido, descuento, propina, usuario_id, puntos_canjear, cupon_codigo }, t);
  });
  await Pedido.update({ estado_cocina: null }, { where: { id: pedido_id } });

  const cobrado = await obtener(pedido_id);
  emitir('restaurante:actualizar', { tipo: 'pedido_cobrado' }, pedido.sucursal_id);
  // Un pedido creado por la app externa (origen: 'app_externa') pasó por la
  // rama `diferido` de crearCompleta, que ya imprimió la comanda de cocina
  // al crearse (para que empiecen a prepararla ya). Acá, al cobrar, solo
  // corresponde imprimir el comprobante de caja — reimprimir cocina sería
  // una comanda duplicada real (fuera de la ventana de dedup del agente de
  // impresión) que podría hacer que la cocina vuelva a cocinar un pedido ya
  // entregado.
  const datos_impresion = await _emitirImpresion(cobrado, metodo_pago, parseFloat(monto_recibido) - monto_neto, pedido.sucursal_id, undefined, { suprimirCocina: pedido.origen === 'app_externa' });
  return { ...cobrado.toJSON(), datos_impresion };
}

async function cancelar(pedido_id, usuario_id, alcance) {
  const pedido = await Pedido.findByPk(pedido_id);
  if (!pedido) throw Object.assign(new Error('Pedido no encontrado'), { status: 404 });
  _verificarAlcance(pedido, alcance);
  if (pedido.estado !== 'pendiente') throw Object.assign(new Error('Solo se pueden cancelar pedidos pendientes'), { status: 409 });

  await pedido.update({ estado: 'cancelado', estado_cocina: null });

  if (pedido.tipo !== 'llevar' && pedido.mesa_id) {
    // Libera mesa.estado; la sesión de autoservicio se cierra solo a mano
    // (mismo motivo que en _finalizarVenta y _revertirPagoQr).
    const activos = await Pedido.count({ where: { mesa_id: pedido.mesa_id, estado: ['pendiente', 'listo', 'pendiente_pago'] } });
    if (activos === 0) {
      await Mesa.update({ estado: 'disponible' }, { where: { id: pedido.mesa_id } });
    }
  }

  const cancelado = await obtener(pedido_id);
  emitir('restaurante:actualizar', { tipo: 'pedido_cancelado' });
  return cancelado;
}

async function _recalcularTotal(pedido_id, { transaction } = {}) {
  const [result] = await sequelize.query(
    'SELECT COALESCE(SUM((cantidad - cantidad_anulada) * precio), 0) as total FROM detalle_pedidos WHERE pedido_id = ?',
    { replacements: [pedido_id], type: sequelize.QueryTypes.SELECT, transaction }
  );
  await Pedido.update({ total: result.total }, { where: { id: pedido_id }, transaction });
}

async function marcarListo(pedido_id, alcance) {
  const pedido = await Pedido.findByPk(pedido_id);
  if (!pedido) throw Object.assign(new Error('Pedido no encontrado'), { status: 404 });
  _verificarAlcance(pedido, alcance);
  if (pedido.estado_cocina !== 'pendiente') throw Object.assign(new Error('Solo pedidos pendientes de cocina pueden marcarse como listos'), { status: 409 });
  await pedido.update({ estado_cocina: 'listo' });
  const listo = await obtener(pedido_id);
  emitir('restaurante:actualizar', { tipo: 'pedido_listo' });
  return listo;
}

// Botón manual para los casos donde nada más limpia estado_cocina solo:
// una venta instantánea de mostrador (pagada al crearse, sin un evento de
// cobro posterior) y un pedido de Autoservicio pagado por QR (el pago se
// confirma antes de que la comida se prepare). Disponible sobre cualquier
// pedido con estado_cocina en 'pendiente' o 'listo' — para una mesa que
// de todas formas se limpia sola al cobrar, tocarlo antes no hace daño.
async function marcarEntregado(pedido_id, alcance) {
  const pedido = await Pedido.findByPk(pedido_id);
  if (!pedido) throw Object.assign(new Error('Pedido no encontrado'), { status: 404 });
  _verificarAlcance(pedido, alcance);
  if (pedido.estado_cocina === null) throw Object.assign(new Error('Este pedido ya no está en Cocina'), { status: 409 });
  await pedido.update({ estado_cocina: null });
  const entregado = await obtener(pedido_id);
  emitir('restaurante:actualizar', { tipo: 'pedido_entregado' });
  return entregado;
}

module.exports = {
  listar, listarCocina, obtener, misVentasHoy, reimprimir, crear, crearCompleta, agregarItem, actualizarItem, eliminarItem,
  cobrar, cancelar, marcarListo, marcarEntregado,
  consultarEstadoPagoQr, cancelarPagoQr, procesarWebhookPagoQr, revertirPagosQrVencidos,
  procesarNotificacionBaneco, confirmarPagoQrManual, listarPagosQrPorConfirmar,
  recalcularTotal: _recalcularTotal, emitirAnulacionCocina, verificarAlcance: _verificarAlcance, qrConfirmaSolo,
};
