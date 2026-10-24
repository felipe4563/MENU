const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const DetallePedido = sequelize.define('DetallePedido', {
  id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
  pedido_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  producto_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
  combo_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
  cantidad: { type: DataTypes.INTEGER, defaultValue: 1 },
  cantidad_anulada: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  peso: { type: DataTypes.DECIMAL(10,3) },
  precio: { type: DataTypes.DECIMAL(10,2), allowNull: false },
  nota: { type: DataTypes.STRING(255) },
  estado: { type: DataTypes.ENUM('pendiente','preparando','servido'), defaultValue: 'pendiente' },
}, {
  tableName: 'detalle_pedidos',
  createdAt: 'creado_en',
  updatedAt: 'actualizado_en',
});

module.exports = DetallePedido;
