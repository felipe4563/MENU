const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const LibroCaja = sequelize.define('LibroCaja', {
  id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
  sesion_caja_id: { type: DataTypes.INTEGER.UNSIGNED },
  usuario_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  tipo: { type: DataTypes.ENUM('ingreso', 'egreso'), allowNull: false },
  sucursal_id: { type: DataTypes.INTEGER.UNSIGNED }, // movimientos fuera de una caja (ver migración 069)
  concepto: { type: DataTypes.STRING(255), allowNull: false },
  // Flujo de caja: categoría (ver modules/flujo_caja/categorias.js), a quién
  // o qué, y el día en que pasó si no es el de hoy.
  categoria: { type: DataTypes.STRING(40) },
  detalle: { type: DataTypes.STRING(120) },
  fecha: { type: DataTypes.DATEONLY },
  monto: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
  metodo_pago: { type: DataTypes.ENUM('efectivo', 'qr', 'app_externa'), defaultValue: 'efectivo' },
  referencia_id: { type: DataTypes.INTEGER.UNSIGNED },
  compra_id: { type: DataTypes.INTEGER.UNSIGNED }, // egreso que paga una compra (Finanzas lo cuenta como compra)
}, { tableName: 'libro_caja', createdAt: 'creado_en', updatedAt: 'actualizado_en' });

module.exports = LibroCaja;
