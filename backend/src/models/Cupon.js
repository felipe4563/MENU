const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Cupon = sequelize.define('Cupon', {
  id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
  codigo: { type: DataTypes.STRING(30), allowNull: false, unique: true },
  tipo: { type: DataTypes.ENUM('fijo', 'porcentaje'), allowNull: false, defaultValue: 'fijo' },
  valor: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
  // Límite total de canjes del código (cualquier cliente); usos_actuales es
  // el contador que se incrementa en cada canje. limite_por_cliente, si se
  // define, además tope cuántas veces puede usarlo cada cliente individual
  // (se calcula contando sus pedidos con este cupón, no es una columna
  // acumulada). cliente_id, si se define, restringe el cupón a un único
  // cliente (ej. promo de cumpleaños).
  usos_maximos: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 },
  usos_actuales: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
  limite_por_cliente: { type: DataTypes.INTEGER.UNSIGNED },
  cliente_id: { type: DataTypes.INTEGER.UNSIGNED },
  // Si se define, el cupón solo descuenta cuando ese combo está en la venta
  // (premio "combo gratis" de la ruleta). Para productos: cupon_productos.
  combo_id: { type: DataTypes.INTEGER.UNSIGNED },
  fecha_expiracion: { type: DataTypes.DATEONLY },
  activo: { type: DataTypes.TINYINT(1), defaultValue: 1 },
  usado_en: { type: DataTypes.DATE },
  creado_por: { type: DataTypes.INTEGER.UNSIGNED },
}, {
  tableName: 'cupones',
  createdAt: 'creado_en',
  updatedAt: false,
});

module.exports = Cupon;
