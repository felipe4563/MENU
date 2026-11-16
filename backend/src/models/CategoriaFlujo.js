const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Categorías del flujo de caja (ver migración 070 y modules/flujo_caja/categorias.js).
const CategoriaFlujo = sequelize.define('CategoriaFlujo', {
  id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
  clave: { type: DataTypes.STRING(40), allowNull: false, unique: true },
  nombre: { type: DataTypes.STRING(60), allowNull: false },
  grupo: { type: DataTypes.STRING(20), allowNull: false },
  ayuda: { type: DataTypes.STRING(120) },
  pide_persona: { type: DataTypes.BOOLEAN, defaultValue: false },
  auto: { type: DataTypes.BOOLEAN, defaultValue: false },
  sistema: { type: DataTypes.BOOLEAN, defaultValue: false },
  activo: { type: DataTypes.BOOLEAN, defaultValue: true },
  orden: { type: DataTypes.INTEGER, defaultValue: 0 },
}, { tableName: 'categorias_flujo', createdAt: 'creado_en', updatedAt: 'actualizado_en' });

module.exports = CategoriaFlujo;
