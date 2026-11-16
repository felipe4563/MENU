const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Pagos, adelantos, bonos y descuentos de sueldo (migración 071).
const PagoPersonal = sequelize.define('PagoPersonal', {
  id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
  usuario_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  tipo: { type: DataTypes.ENUM('pago', 'adelanto', 'bono', 'descuento'), allowNull: false },
  monto: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
  fecha: { type: DataTypes.DATEONLY, allowNull: false },
  nota: { type: DataTypes.STRING(160) },
  metodo_pago: { type: DataTypes.ENUM('efectivo', 'qr') },
  sucursal_id: { type: DataTypes.INTEGER.UNSIGNED },
  sesion_caja_id: { type: DataTypes.INTEGER.UNSIGNED },
  gasto_id: { type: DataTypes.INTEGER.UNSIGNED },
  libro_caja_id: { type: DataTypes.INTEGER.UNSIGNED },
  registrado_por: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
}, { tableName: 'pagos_personal', createdAt: 'creado_en', updatedAt: 'actualizado_en' });

module.exports = PagoPersonal;
