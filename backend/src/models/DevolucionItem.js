const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const DevolucionItem = sequelize.define('DevolucionItem', {
  id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
  devolucion_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  detalle_pedido_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  cantidad: { type: DataTypes.INTEGER, allowNull: false },
  monto: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
  vuelve_stock: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 0 },
}, { tableName: 'devolucion_items', timestamps: false });

module.exports = DevolucionItem;
