// backend/src/modules/inventario/stock.service.js
const { Producto, ProductoStockSucursal, RegistroInventario } = require('../../models');

async function ajustarStockSucursal({ producto_id, sucursal_id, tipo, cantidad: cantidadRecibida, usuario_id, nota, transaction }) {
  // DetalleCompra.cantidad es DECIMAL y Sequelize lo devuelve como string
  // ("48.000"): sin convertir, `stock + cantidad` concatena (12 + "48.000"
  // → "1248.000") y el stock del producto queda inflado.
  const cantidad = Number(cantidadRecibida);
  const [fila] = await ProductoStockSucursal.findOrCreate({
    where: { producto_id, sucursal_id },
    defaults: { stock: 0 },
    transaction,
  });

  const stock_anterior = fila.stock;
  let stock_nuevo;

  if (tipo === 'entrada' || tipo === 'compra') {
    stock_nuevo = stock_anterior + cantidad;
  } else if (tipo === 'salida' || tipo === 'venta') {
    if (stock_anterior < cantidad) {
      throw Object.assign(new Error('Stock insuficiente en esta sucursal'), { status: 409 });
    }
    stock_nuevo = stock_anterior - cantidad;
  } else if (tipo === 'ajuste') {
    stock_nuevo = cantidad;
  } else {
    throw Object.assign(new Error(`Tipo de movimiento inválido: ${tipo}`), { status: 400 });
  }

  await fila.update({ stock: stock_nuevo }, { transaction });

  const total = await ProductoStockSucursal.sum('stock', { where: { producto_id }, transaction });
  await Producto.update({ stock: total || 0 }, { where: { id: producto_id }, transaction });

  await RegistroInventario.create({
    producto_id, sucursal_id, usuario_id, tipo, cantidad, stock_anterior, stock_nuevo, nota,
  }, { transaction });

  return { stock_anterior, stock_nuevo };
}

async function mezclarStockPorSucursal(productos, { sucursal_id, acceso_todas } = {}) {
  const productoIds = productos.map(p => p.id ?? p.dataValues?.id);
  const filas = await ProductoStockSucursal.findAll({
    where: { producto_id: productoIds },
    include: [{ model: require('../../models').Sucursal, as: 'sucursal', attributes: ['id', 'nombre'] }],
  });

  return productos.map(p => {
    const plano = typeof p.toJSON === 'function' ? p.toJSON() : { ...p };
    if (plano.stock === null || plano.stock === undefined) {
      plano.sucursal_id = acceso_todas ? null : (sucursal_id ?? null);
      return plano; // no trackea inventario
    }

    const filasProducto = filas.filter(f => f.producto_id === plano.id);

    if (acceso_todas) {
      plano.stock_por_sucursal = filasProducto.map(f => ({
        sucursal_id: f.sucursal_id,
        nombre: f.sucursal?.nombre,
        stock: f.stock,
      }));
      return plano; // stock queda como el total agregado
    }

    const propia = filasProducto.find(f => f.sucursal_id === sucursal_id);
    plano.stock = propia ? propia.stock : 0;
    // Deja explícito a qué sucursal corresponde ese `stock` — sin esto, un
    // cliente externo (ej. la app de pedidos) no tiene forma de saberlo a
    // partir del producto solo, ya que no viene en ningún otro campo.
    plano.sucursal_id = sucursal_id ?? null;
    return plano;
  });
}

module.exports = { ajustarStockSucursal, mezclarStockPorSucursal };
