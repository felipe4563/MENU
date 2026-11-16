const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Cómo y cuánto se le paga a cada trabajador, desde qué día (migración 071).
const SueldoPersonal = sequelize.define('SueldoPersonal', {
  id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
  usuario_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  modalidad: { type: DataTypes.ENUM('diario', 'semanal', 'quincenal', 'mensual', 'ninguno'), allowNull: false },
  monto: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
  descontar_faltas: { type: DataTypes.BOOLEAN, defaultValue: true },
  vigente_desde: { type: DataTypes.DATEONLY, allowNull: false },
  creado_por: { type: DataTypes.INTEGER.UNSIGNED },
}, { tableName: 'sueldos_personal', createdAt: 'creado_en', updatedAt: 'actualizado_en' });

module.exports = SueldoPersonal;
