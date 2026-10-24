const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Devolucion = sequelize.define('Devolucion', {
  id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
  pedido_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  sesion_caja_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
  usuario_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  motivo: { type: DataTypes.ENUM('demora', 'error_pedido', 'cliente_arrepentido', 'producto_mal_estado', 'otro'), allowNull: false },
  nota: { type: DataTypes.STRING(255), allowNull: true },
  monto: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
  forma: { type: DataTypes.ENUM('efectivo', 'transferencia', 'app', 'sin_dinero'), allowNull: false },
  estado_transferencia: { type: DataTypes.ENUM('pendiente', 'hecha'), allowNull: true },
}, { tableName: 'devoluciones', createdAt: 'creado_en', updatedAt: 'actualizado_en' });

module.exports = Devolucion;
