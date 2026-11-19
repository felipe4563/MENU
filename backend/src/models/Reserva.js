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
  // Pedido en que se convirtió la reserva (con platos) y cuándo se mandó a cocina.
  pedido_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
  envio_cocina: { type: DataTypes.ENUM('al_llegar', 'antes', 'manual'), allowNull: true },
  enviada_cocina_en: { type: DataTypes.DATE, allowNull: true },
  // Qué pasó con el adelanto que no se usó en un pedido.
  destino_adelanto: { type: DataTypes.ENUM('retenido', 'devuelto'), allowNull: true },
  aviso_no_vino_en: { type: DataTypes.DATE, allowNull: true },
}, {
  tableName: 'reservas',
  createdAt: 'creado_en',
  updatedAt: 'actualizado_en',
});

Reserva.ESTADOS = ESTADOS;
module.exports = Reserva;
