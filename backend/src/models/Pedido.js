const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Pedido = sequelize.define('Pedido', {
  id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
  sucursal_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  mesa_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
  mesa_sesion_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
  usuario_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  cliente_id: { type: DataTypes.INTEGER.UNSIGNED },
  sesion_caja_id: { type: DataTypes.INTEGER.UNSIGNED },
  tipo: { type: DataTypes.ENUM('mesa', 'llevar', 'delivery'), defaultValue: 'mesa' },
  origen: { type: DataTypes.ENUM('staff', 'autoservicio', 'app_externa'), defaultValue: 'staff' },
  origen_app: { type: DataTypes.STRING(100), allowNull: true },
  numero_llevar: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
  estado: { type: DataTypes.ENUM('pendiente','listo','pendiente_pago','completado','cancelado'), defaultValue: 'pendiente' },
  estado_cocina: { type: DataTypes.ENUM('pendiente','listo'), allowNull: true, defaultValue: null },
  // Desde cuándo espera en cocina la ronda en curso (ver migración 058).
  cocina_desde: { type: DataTypes.DATE, allowNull: true },
  tipo_documento: { type: DataTypes.STRING(50), defaultValue: 'Ticket' },
  nombre_cliente: { type: DataTypes.STRING(255), defaultValue: 'Público General' },
  documento_cliente: { type: DataTypes.STRING(50) },
  direccion_entrega: { type: DataTypes.STRING(255), allowNull: true },
  telefono_cliente: { type: DataTypes.STRING(50), allowNull: true },
  total: { type: DataTypes.DECIMAL(10,2), defaultValue: 0 },
  total_devuelto: { type: DataTypes.DECIMAL(10,2), allowNull: false, defaultValue: 0 },
  descuento: { type: DataTypes.DECIMAL(10,2), defaultValue: 0 },
  cupon_id: { type: DataTypes.INTEGER.UNSIGNED },
  descuento_cupon: { type: DataTypes.DECIMAL(10,2), defaultValue: 0 },
  propina: { type: DataTypes.DECIMAL(10,2), defaultValue: 0 },
  puntos_ganados: { type: DataTypes.INTEGER, defaultValue: 0 },
  puntos_canjeados: { type: DataTypes.INTEGER, defaultValue: 0 },
  metodo_pago: { type: DataTypes.ENUM('efectivo','qr','app_externa'), defaultValue: 'efectivo' },
  // Cómo se confirmó un cobro QR: por CodePay, por Banco Económico, o a mano
  // por el cajero (QR propio del negocio) — en ese caso, quién lo confirmó.
  qr_tipo: { type: DataTypes.ENUM('codepay', 'manual', 'baneco'), allowNull: true },
  qr_confirmado_por: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
  monto_recibido: { type: DataTypes.DECIMAL(10,2) },
  cambio: { type: DataTypes.DECIMAL(10,2), defaultValue: 0 },
  notas: { type: DataTypes.TEXT },
}, {
  tableName: 'pedidos',
  createdAt: 'creado_en',
  updatedAt: 'actualizado_en',
});

module.exports = Pedido;
