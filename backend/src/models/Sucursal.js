const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Sucursal = sequelize.define('Sucursal', {
  id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
  nombre: { type: DataTypes.STRING(255), allowNull: false },
  direccion: { type: DataTypes.STRING(255) },
  telefono: { type: DataTypes.STRING(50) },
  latitud: { type: DataTypes.DECIMAL(10, 7) },
  longitud: { type: DataTypes.DECIMAL(10, 7) },
  radio_geocerca_metros: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 150 },
  modo_cierre_caja: { type: DataTypes.ENUM('directo', 'ciego'), allowNull: false, defaultValue: 'directo' },
  tolerancia_cierre_caja: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 10.00 },
  activo: { type: DataTypes.TINYINT(1), defaultValue: 1 },
}, {
  tableName: 'sucursales',
  createdAt: 'creado_en',
  updatedAt: 'actualizado_en',
});

module.exports = Sucursal;
