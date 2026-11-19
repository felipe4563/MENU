const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Un plato (o combo) anotado en una reserva. El precio es el unitario con
// extras, congelado al anotar; el nombre se guarda para mostrarlo sin joins.
const ReservaItem = sequelize.define('ReservaItem', {
  id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
  reserva_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  producto_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
  combo_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
  cantidad: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 },
  peso: { type: DataTypes.DECIMAL(10, 3), allowNull: true },
  nota: { type: DataTypes.STRING(255), allowNull: true },
  opcion_ids: { type: DataTypes.JSON, allowNull: true },
  opciones_por_producto: { type: DataTypes.JSON, allowNull: true },
  precio: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
  nombre: { type: DataTypes.STRING(150), allowNull: false },
}, {
  tableName: 'reserva_items',
  createdAt: 'creado_en',
  updatedAt: 'actualizado_en',
});

module.exports = ReservaItem;
