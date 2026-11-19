const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Un cobro parcial de un pedido dividido (por platos o en partes iguales).
const PedidoPago = sequelize.define('PedidoPago', {
  id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
  pedido_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  usuario_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  sesion_caja_id: { type: DataTypes.INTEGER.UNSIGNED },
  metodo_pago: { type: DataTypes.ENUM('efectivo', 'qr'), allowNull: false },
  monto: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
  monto_recibido: { type: DataTypes.DECIMAL(10, 2) },
  cambio: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
  persona: { type: DataTypes.STRING(80) },
  modo: { type: DataTypes.ENUM('platos', 'iguales', 'adelanto'), allowNull: false },
  // Partes iguales: "Parte parte_numero de partes_de" (null por platos).
  parte_numero: { type: DataTypes.TINYINT.UNSIGNED },
  partes_de: { type: DataTypes.TINYINT.UNSIGNED },
  estado: { type: DataTypes.ENUM('pendiente', 'completado', 'anulado'), allowNull: false, defaultValue: 'completado' },
}, {
  tableName: 'pedido_pagos',
  createdAt: 'creado_en',
  updatedAt: 'actualizado_en',
});

module.exports = PedidoPago;
