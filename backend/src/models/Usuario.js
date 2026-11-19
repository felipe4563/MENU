const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Usuario = sequelize.define('Usuario', {
  id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
  rol_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  acceso_todas_sucursales: { type: DataTypes.TINYINT(1), defaultValue: 0 },
  nombre: { type: DataTypes.STRING(255), allowNull: false },
  avatar: { type: DataTypes.STRING(255), allowNull: true },
  email: { type: DataTypes.STRING(255), allowNull: false, unique: true },
  contrasena: { type: DataTypes.STRING(255), allowNull: false },
  debe_cambiar_contrasena: { type: DataTypes.TINYINT(1), defaultValue: 0 },
  sesion_version: { type: DataTypes.INTEGER.UNSIGNED, defaultValue: 0 },
  activo: { type: DataTypes.TINYINT(1), defaultValue: 1 },
  // Hash bcrypt del PIN de 4 números; nunca se devuelve en las respuestas.
  pin: { type: DataTypes.STRING(255), allowNull: true },
  pin_intentos: { type: DataTypes.TINYINT.UNSIGNED, allowNull: false, defaultValue: 0 },
  pin_bloqueado: { type: DataTypes.TINYINT(1), allowNull: false, defaultValue: 0 },
}, {
  tableName: 'usuarios',
  createdAt: 'creado_en',
  updatedAt: 'actualizado_en',
});

module.exports = Usuario;
