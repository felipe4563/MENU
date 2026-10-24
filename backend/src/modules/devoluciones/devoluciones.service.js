const { Pedido, DetallePedido, Devolucion, DevolucionItem, sequelize } = require('../../models');
const { emitir } = require('../../socket');
const ventasService = require('../ventas/ventas.service');
const { cantidadVigente, round2 } = require('./calculo');

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
  return { ...resultado, impresion: { cocina: null } };
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
    lineas.push({ detalle, cantidad, vuelve_stock: !!it.vuelve_stock });
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

// Task 4 implementa la anulación de pedidos cobrados.
async function _anularCobrado() {
  throw _error('Anular pedidos cobrados aún no está implementado', 501);
}

module.exports = { anular };
