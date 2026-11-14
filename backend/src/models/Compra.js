const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Compra = sequelize.define('Compra', {
  id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
  sucursal_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  proveedor_id: { type: DataTypes.INTEGER.UNSIGNED }, // null = compra al paso (mercado)
  usuario_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  sesion_caja_id: { type: DataTypes.INTEGER.UNSIGNED }, // pagada con efectivo de esta caja
  total: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0 },
  notas: { type: DataTypes.TEXT },
  estado: { type: DataTypes.ENUM('pendiente', 'recibido'), defaultValue: 'pendiente' },
}, { tableName: 'compras', createdAt: 'creado_en', updatedAt: 'actualizado_en' });

module.exports = Compra;
