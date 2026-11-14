const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Plato (y unidades) que cubre un pago parcial hecho en modo 'platos'.
const PedidoPagoItem = sequelize.define('PedidoPagoItem', {
  id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
  pedido_pago_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  detalle_pedido_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  cantidad: { type: DataTypes.INTEGER, allowNull: false },
}, { tableName: 'pedido_pago_items', timestamps: false });

module.exports = PedidoPagoItem;
