const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Faltas justificadas: no se descuentan del sueldo (migración 071).
const AusenciaPersonal = sequelize.define('AusenciaPersonal', {
  id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
  usuario_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  fecha: { type: DataTypes.DATEONLY, allowNull: false },
  motivo: { type: DataTypes.STRING(120) },
  registrado_por: { type: DataTypes.INTEGER.UNSIGNED },
}, { tableName: 'ausencias_personal', createdAt: 'creado_en', updatedAt: 'actualizado_en' });

module.exports = AusenciaPersonal;
