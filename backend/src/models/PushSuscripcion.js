const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Dispositivos con notificaciones push activadas (migración 072).
const PushSuscripcion = sequelize.define('PushSuscripcion', {
  id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
  usuario_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  endpoint: { type: DataTypes.TEXT, allowNull: false },
  endpoint_hash: { type: DataTypes.CHAR(64), allowNull: false, unique: true },
  p256dh: { type: DataTypes.STRING(255), allowNull: false },
  auth: { type: DataTypes.STRING(255), allowNull: false },
  dispositivo: { type: DataTypes.STRING(120) },
}, { tableName: 'push_suscripciones', createdAt: 'creado_en', updatedAt: 'actualizado_en' });

module.exports = PushSuscripcion;
