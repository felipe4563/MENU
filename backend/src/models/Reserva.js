const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ESTADOS = ['pendiente', 'llego', 'cancelada', 'no_vino'];

const Reserva = sequelize.define('Reserva', {
  id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
  sucursal_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  mesa_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
  usuario_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
  nombre_cliente: { type: DataTypes.STRING(100), allowNull: false },
  telefono: { type: DataTypes.STRING(30), allowNull: true },
  personas: { type: DataTypes.SMALLINT.UNSIGNED, allowNull: false, defaultValue: 2 },
  fecha_hora: { type: DataTypes.DATE, allowNull: false },
  duracion_min: { type: DataTypes.SMALLINT.UNSIGNED, allowNull: false, defaultValue: 120 },
  notas: { type: DataTypes.STRING(255), allowNull: true },
  estado: { type: DataTypes.ENUM(...ESTADOS), allowNull: false, defaultValue: 'pendiente', validate: { isIn: [ESTADOS] } },
}, {
  tableName: 'reservas',
  createdAt: 'creado_en',
  updatedAt: 'actualizado_en',
});

Reserva.ESTADOS = ESTADOS;
module.exports = Reserva;
