const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Plata que el cliente adelanta por una reserva (adelanto) o que se le
// devuelve (devolucion).
const ReservaPago = sequelize.define('ReservaPago', {
  id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
  reserva_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  usuario_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  sesion_caja_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
  tipo: { type: DataTypes.ENUM('adelanto', 'devolucion'), allowNull: false },
  metodo_pago: { type: DataTypes.ENUM('efectivo', 'qr'), allowNull: false },
  monto: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
  monto_recibido: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
  cambio: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
  estado: { type: DataTypes.ENUM('completado', 'anulado'), allowNull: false, defaultValue: 'completado' },
}, {
  tableName: 'reserva_pagos',
  createdAt: 'creado_en',
  updatedAt: 'actualizado_en',
});

module.exports = ReservaPago;
