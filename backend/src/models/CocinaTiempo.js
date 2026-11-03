const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Una ronda de cocina terminada: cuánto tardó un pedido desde que llegó su
// comida hasta que la marcaron lista (ver migración 058).
const CocinaTiempo = sequelize.define('CocinaTiempo', {
  id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
  pedido_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  sucursal_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  desde: { type: DataTypes.DATE, allowNull: false },
  listo_en: { type: DataTypes.DATE, allowNull: false },
  segundos: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
}, { tableName: 'cocina_tiempos', timestamps: false });

module.exports = CocinaTiempo;
