const { SesionCaja, Pedido, Producto, Combo, Configuracion } = require('../../models');
const mesasService = require('../mesas/mesas.service');
const ventasService = require('../ventas/ventas.service');
const cuponesService = require('../cupones/cupones.service');
const clientesService = require('../clientes/clientes.service');
const { listarProductos } = require('../productos/productos.service');
const { listarActivos: listarCombosActivos } = require('../combos/combos.service');
const { listarActivas: listarPromocionesActivas } = require('../promociones/promociones.service');

async function _mesaConSesionActiva(codigo_qr) {
  const mesa = await mesasService.obtenerMesaPorCodigoQr(codigo_qr);
  const sesion = await mesasService.obtenerSesionActiva(mesa.id);
  if (!sesion) {
    throw Object.assign(
      new Error('Esta mesa no está habilitada para pedir ahora. Llamá al mozo o cajero.'),
      { status: 409 }
    );
  }
  return { mesa, sesion };
}

// El dueño puede apagar los pedidos desde la mesa (Ajustes › Salón y mesas):
// el QR sigue mostrando el menú, pero no deja pedir. Además solo se puede
// pedir con un cobro QR que se confirme solo (ver qrConfirmaSolo).
async function aceptaPedidos() {
  const fila = await Configuracion.findOne({ where: { clave: 'autoservicio_pedidos' } });
  if (fila?.valor === 'false') return false;
  return ventasService.qrConfirmaSolo();
}

async function obtenerMenu(codigo_qr) {
  const { mesa } = await _mesaConSesionActiva(codigo_qr);
  const alcance = { sucursal_id: mesa.area.sucursal_id, acceso_todas: false };
  const [productos, combos, promociones, puede_pedir] = await Promise.all([
    listarProductos({ solo_vendibles: true, solo_disponibles: true, solo_disponibles_hoy: true }, alcance),
    listarCombosActivos(),
    listarPromocionesActivas(),
    aceptaPedidos(),
  ]);
  return { mesa: { id: mesa.id, nombre: mesa.nombre }, productos, combos, promociones, puede_pedir };
}

// Previsualización de cupón para el checkout público: no confía en los
// precios que mande el navegador (podrían venir manipulados), así que
// recalcula el subtotal con los precios reales de la base de datos antes de
// llamar a cuponesService.validar — la misma función que usa el checkout
// del staff. Esto es solo una vista previa; el pedido real vuelve a validar
// el cupón (y su límite de usos) dentro de la transacción de crearCompleta.
async function validarCupon(codigo_qr, { codigo, items }) {
  await _mesaConSesionActiva(codigo_qr);

  const idsProducto = [...new Set((items || []).filter((i) => i.producto_id).map((i) => Number(i.producto_id)))];
  const idsCombo = [...new Set((items || []).filter((i) => i.combo_id).map((i) => Number(i.combo_id)))];
  const [productos, combos] = await Promise.all([
    idsProducto.length > 0 ? Producto.findAll({ where: { id: idsProducto }, attributes: ['id', 'precio'] }) : [],
    idsCombo.length > 0 ? Combo.findAll({ where: { id: idsCombo }, attributes: ['id', 'precio'] }) : [],
  ]);
  const preciosProducto = new Map(productos.map((p) => [p.id, parseFloat(p.precio)]));
  const preciosCombo = new Map(combos.map((c) => [c.id, parseFloat(c.precio)]));

  const itemsConPrecio = (items || []).map((i) => (
    i.combo_id
      ? { producto_id: null, cantidad: i.cantidad, precio: preciosCombo.get(Number(i.combo_id)) ?? 0 }
      : { producto_id: i.producto_id, cantidad: i.cantidad, precio: preciosProducto.get(Number(i.producto_id)) ?? 0 }
  ));
  const subtotal = itemsConPrecio.reduce((s, i) => s + i.precio * i.cantidad, 0);

  return cuponesService.validar(codigo, subtotal, null, itemsConPrecio);
}

// Tope de pedidos con pago QR en curso por sesión de mesa. Cada POST dispara
// una llamada real (y facturable) a CodePay para generar el QR, y el endpoint
// es anónimo: quien haya fotografiado el QR de una mesa podría scriptearlo.
// No es un rate limiter con ventana de tiempo (eso queda para un middleware
// dedicado, fuera de alcance acá): simplemente no se deja acumular más de
// MAX_PAGOS_PENDIENTES pagos sin resolver en la misma sesión.
const MAX_PAGOS_PENDIENTES = 3;

async function crearPedido(codigo_qr, { items, cupon_codigo, numero_documento, puntos_canjear, clienteIdAutenticado }) {
  const { mesa, sesion } = await _mesaConSesionActiva(codigo_qr);
  if (!(await aceptaPedidos())) {
    throw Object.assign(new Error('Este local no recibe pedidos desde la mesa. Pide al mozo.'), { status: 409 });
  }
  // El cliente_id que gana puntos puede venir de un CI suelto (silencioso,
  // sin PIN) o de una sesión de cliente autenticada — la sesión manda si
  // está presente. Solo con sesión autenticada se permite canjear puntos:
  // sin eso, cualquiera podría mandar el CI de otro y gastarle los puntos
  // solo con saber ese número (ver spec de fidelidad).
  const cliente_id = clienteIdAutenticado || await clientesService.resolverOCrearPorDocumento(numero_documento);
  const puntosCanjearFinal = clienteIdAutenticado ? (puntos_canjear || 0) : 0;

  const pendientes = await Pedido.count({ where: { mesa_sesion_id: sesion.id, estado: 'pendiente_pago' } });
  if (pendientes >= MAX_PAGOS_PENDIENTES) {
    throw Object.assign(
      new Error('Ya tenés pagos pendientes en esta mesa. Esperá a que se confirmen o expiren antes de pedir de nuevo.'),
      { status: 429 }
    );
  }

  const sesionCaja = await SesionCaja.findOne({ where: { sucursal_id: mesa.area.sucursal_id, estado: 'abierta' } });
  if (!sesionCaja) {
    throw Object.assign(new Error('El local no está tomando pedidos por autoservicio en este momento.'), { status: 409 });
  }

  return ventasService.crearCompleta({
    tipo: 'mesa',
    mesa_id: mesa.id,
    items,
    metodo_pago: 'qr',
    sesion_caja_id: sesionCaja.id,
    usuario_id: sesionCaja.usuario_id,
    cliente_id,
    puntos_canjear: puntosCanjearFinal,
    mesa_sesion_id: sesion.id,
    origen: 'autoservicio',
    // crearCompleta ya sabe validar y aplicar el cupón (misma lógica que usa
    // el cajero) — acá solo se deja pasar el código, sin reglas nuevas. Un
    // cupón "exclusivo de un cliente" o con límite por cliente sigue
    // fallando si no se identificó con CI (cliente_id null) — eso es
    // esperable, no un bug.
    cupon_codigo,
  });
}

async function consultarEstadoPedido(codigo_qr, pedido_id) {
  const { sesion } = await _mesaConSesionActiva(codigo_qr);

  // Chequeo de pertenencia ANTES de llamar a consultarEstadoPagoQr: esa
  // función no solo lee, puede finalizar el pago (confirmar stock/libro
  // caja/sockets) o revertirlo contra CodePay para el pedido_id que se le
  // pase. Si se llamara primero y se filtrara por sesión después, cualquiera
  // con un QR válido de su propia mesa podría probar pedido_id al azar y
  // disparar esos efectos secundarios sobre pedidos de otras mesas/sucursales
  // antes de que el 404 llegara a devolverse. Por eso la pertenencia se
  // resuelve acá con un findByPk liviano, de solo lectura, y se corta con
  // 404 (no 403, para no confirmarle a un caller anónimo que el id existe)
  // sin tocar consultarEstadoPagoQr en absoluto si no matchea.
  const pedido = await Pedido.findByPk(pedido_id, { attributes: ['id', 'mesa_sesion_id'] });
  if (!pedido || pedido.mesa_sesion_id !== sesion.id) {
    throw Object.assign(new Error('Pedido no encontrado'), { status: 404 });
  }

  return ventasService.consultarEstadoPagoQr(pedido_id, null);
}

module.exports = { obtenerMenu, validarCupon, crearPedido, consultarEstadoPedido };
