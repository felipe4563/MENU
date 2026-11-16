const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Insumo = sequelize.define('Insumo', {
  id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
  nombre: { type: DataTypes.STRING(100), allowNull: false },
  unidad_medida: {
    type: DataTypes.ENUM('kilogramo', 'gramo', 'litro', 'mililitro', 'arroba', 'libra', 'unidad'),
    allowNull: false,
  },
  stock_minimo: { type: DataTypes.DECIMAL(10, 3), allowNull: true, defaultValue: null },
  activo: { type: DataTypes.TINYINT(1), allowNull: false, defaultValue: 1 },
}, { tableName: 'insumos', createdAt: 'creado_en', updatedAt: 'actualizado_en' });

module.exports = Insumo;
