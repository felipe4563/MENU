const {
  Pedido, DetallePedido, Devolucion, DevolucionItem, SesionCaja, LibroCaja, Producto, Cliente, sequelize,
} = require('../../models');
const { ajustarStockSucursal } = require('../inventario/stock.service');
const { emitir } = require('../../socket');
const ventasService = require('../ventas/ventas.service');
const { cantidadVigente, calcularDevolucion, round2 } = require('./calculo');

const _error = (mensaje, status) => Object.assign(new Error(mensaje), { status });

// Anula productos de un pedido. Pedido sin cobrar (pendiente/listo): se
// descuentan de la cuenta y no se mueve dinero. Pedido cobrado: Task 4.
async function anular(pedido_id, usuario_id, { items, motivo, nota, forma }, alcance) {
  const resultado = await sequelize.transaction(async (transaction) => {
    const pedido = await Pedido.findByPk(pedido_id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!pedido) throw _error('Pedido no encontrado', 404);
    ventasService.verificarAlcance(pedido, alcance);

    if (pedido.estado === 'completado') {
      return _anularCobrado(pedido, usuario_id, { items, motivo, nota, forma }, transaction);
    }
    if (pedido.estado === 'pendiente' || pedido.estado === 'listo') {
      return _anularSinCobrar(pedido, usuario_id, { items, motivo, nota }, transaction);
    }
    throw _error(`No se pueden anular productos de un pedido ${pedido.estado === 'pendiente_pago' ? 'pendiente de pago' : pedido.estado}`, 409);
  });

  emitir('restaurante:actualizar', { tipo: 'pedido_items' });
  // Ya con la transacción confirmada: avisar a cocina (best-effort).
  let cocina = null;
  try {
    cocina = await ventasService.emitirAnulacionCocina(
      pedido_id, items.map(i => ({ detalle_pedido_id: i.detalle_pedido_id, cantidad: i.cantidad })),
    );
  } catch (e) {
    console.error('Error avisando anulación a cocina:', e.message);
  }
  return { ...resultado, impresion: { cocina } };
}

// Valida las cantidades contra la cantidad vigente (ya con el pedido bloqueado).
async function _cargarLineas(pedido, items, transaction) {
  const vistos = new Set();
  const lineas = [];
  for (const it of items) {
    const id = Number(it.detalle_pedido_id);
    if (vistos.has(id)) throw _error('Línea repetida en la solicitud', 400);
    vistos.add(id);
    const detalle = await DetallePedido.findOne({ where: { id, pedido_id: pedido.id }, transaction });
    if (!detalle) throw _error('Item no encontrado en el pedido', 400);
    const vigente = cantidadVigente(detalle);
    const cantidad = Number(it.cantidad);
    if (!Number.isInteger(cantidad) || cantidad < 1) throw _error('Cantidad inválida', 400);
    if (cantidad > vigente) throw _error('La cantidad a anular supera la cantidad vigente', 400);
    if (detalle.peso !== null && detalle.peso !== undefined && cantidad !== vigente) {
      throw _error('Las líneas por peso solo se anulan completas', 400);
    }
    // vuelve_stock queda undefined si el cliente no lo envió (default por línea en pedidos cobrados).
    lineas.push({ detalle, cantidad, vuelve_stock: it.vuelve_stock });
  }
  return lineas;
}

async function _anularSinCobrar(pedido, usuario_id, { items, motivo, nota }, transaction) {
  const lineas = await _cargarLineas(pedido, items, transaction);

  const devolucion = await Devolucion.create({
    pedido_id: pedido.id, sesion_caja_id: null, usuario_id, motivo, nota: nota || null,
    monto: 0, forma: 'sin_dinero', estado_transferencia: null,
  }, { transaction });

  for (const { detalle, cantidad } of lineas) {
    await DevolucionItem.create({
      devolucion_id: devolucion.id, detalle_pedido_id: detalle.id, cantidad,
      monto: round2(Number(detalle.precio) * cantidad),
      vuelve_stock: false,
    }, { transaction });
    await detalle.increment('cantidad_anulada', { by: cantidad, transaction });
  }

  await ventasService.recalcularTotal(pedido.id, { transaction });
  await pedido.reload({ transaction });
  const dev = await Devolucion.findByPk(devolucion.id, {
    include: [{ model: DevolucionItem, as: 'items' }], transaction,
  });
  return { pedido, devolucion: dev };
}

const FORMAS_COBRADO = ['efectivo', 'transferencia', 'app'];

// Pedido cobrado: devuelve dinero según la forma, repone stock y ajusta puntos.
// Todo dentro de la transacción y con el pedido bloqueado por `anular`.
async function _anularCobrado(pedido, usuario_id, { items, motivo, nota, forma }, transaction) {
  if (!FORMAS_COBRADO.includes(forma)) {
    throw _error('Indica la forma de devolución: efectivo, transferencia o app', 400);
  }
  if (forma === 'app' && pedido.metodo_pago !== 'app_externa') {
    throw _error('La forma "app" solo aplica a pedidos de apps externas', 400);
  }

  const lineas = await _cargarLineas(pedido, items, transaction);
  const calculo = calcularDevolucion({ pedido, lineas });
  const monto = calculo.monto;

  // Validar la caja ANTES de escribir cualquier cosa.
  let sesion = null;
  if (forma === 'efectivo' && monto > 0) {
    sesion = await SesionCaja.findOne({
      where: { usuario_id, estado: 'abierta' }, transaction, lock: transaction.LOCK.UPDATE,
    });
    if (!sesion) throw _error('Necesitas tu caja abierta para devolver efectivo', 409);
  }

  const devolucion = await Devolucion.create({
    pedido_id: pedido.id, sesion_caja_id: sesion ? sesion.id : null, usuario_id, motivo,
    nota: nota || null, monto, forma,
    estado_transferencia: forma === 'transferencia' ? 'pendiente' : null,
  }, { transaction });

  const nombreMov = `Devolución venta #${pedido.id}`;
  for (let i = 0; i < lineas.length; i++) {
    const { detalle, cantidad, vuelve_stock: pedidoVuelve } = lineas[i];
    let repone = false;
    if (detalle.producto_id && !detalle.combo_id) {
      const producto = await Producto.findByPk(detalle.producto_id, { transaction });
      if (producto && producto.stock !== null && producto.stock !== undefined) {
        repone = pedidoVuelve === undefined || pedidoVuelve === null ? true : (pedidoVuelve === true || pedidoVuelve === 'true');
      }
    }
    if (repone) {
      await ajustarStockSucursal({
        producto_id: detalle.producto_id, sucursal_id: pedido.sucursal_id, tipo: 'entrada',
        cantidad, usuario_id, nota: nombreMov, transaction,
      });
    }
    await DevolucionItem.create({
      devolucion_id: devolucion.id, detalle_pedido_id: detalle.id, cantidad,
      monto: calculo.lineas[i].monto, vuelve_stock: repone,
    }, { transaction });
    await detalle.increment('cantidad_anulada', { by: cantidad, transaction });
  }

  if (monto > 0) {
    await pedido.increment('total_devuelto', { by: monto, transaction });
    if (sesion) {
      await LibroCaja.create({
        sesion_caja_id: sesion.id, usuario_id, tipo: 'egreso', concepto: nombreMov, monto,
        metodo_pago: 'efectivo', referencia_id: devolucion.id,
      }, { transaction });
      await sesion.increment('total_devoluciones', { by: monto, transaction });
    }
  }

  if (pedido.cliente_id && calculo.puntosARestar > 0) {
    const cliente = await Cliente.findByPk(pedido.cliente_id, { transaction, lock: transaction.LOCK.UPDATE });
    if (cliente) {
      await cliente.update({ puntos: Math.max(0, Number(cliente.puntos || 0) - calculo.puntosARestar) }, { transaction });
    }
  }

  await pedido.reload({ transaction });
  const dev = await Devolucion.findByPk(devolucion.id, {
    include: [{ model: DevolucionItem, as: 'items' }], transaction,
  });
  return { pedido, devolucion: dev };
}

module.exports = { anular };
