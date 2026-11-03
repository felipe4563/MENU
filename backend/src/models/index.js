const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const RolesPermisos = sequelize.define('roles_permisos', {
  rol_id: { type: DataTypes.INTEGER.UNSIGNED },
  permiso_id: { type: DataTypes.INTEGER.UNSIGNED },
}, { tableName: 'roles_permisos', timestamps: false });

const UsuariosSucursales = sequelize.define('usuarios_sucursales', {
  usuario_id: { type: DataTypes.INTEGER.UNSIGNED },
  sucursal_id: { type: DataTypes.INTEGER.UNSIGNED },
}, { tableName: 'usuarios_sucursales', timestamps: false });

const CuponProductos = sequelize.define('cupon_productos', {
  cupon_id: { type: DataTypes.INTEGER.UNSIGNED },
  producto_id: { type: DataTypes.INTEGER.UNSIGNED },
}, { tableName: 'cupon_productos', timestamps: false });

const PromocionProductos = sequelize.define('promocion_productos', {
  promocion_id: { type: DataTypes.INTEGER.UNSIGNED },
  producto_id: { type: DataTypes.INTEGER.UNSIGNED },
}, { tableName: 'promocion_productos', timestamps: false });

const Rol = require('./Rol');
const Permiso = require('./Permiso');
const Usuario = require('./Usuario');
const Area = require('./Area');
const Mesa = require('./Mesa');
const MesaSesion = require('./MesaSesion');
const Categoria = require('./Categoria');
const Producto = require('./Producto');
const GrupoOpciones = require('./GrupoOpciones');
const Opcion = require('./Opcion');
const ProductoGrupoOpciones = require('./ProductoGrupoOpciones');
const Cliente = require('./Cliente');
const ClientePinVerificacion = require('./ClientePinVerificacion');
const SesionCaja = require('./SesionCaja');
const Pedido = require('./Pedido');
const DetallePedido = require('./DetallePedido');
const DetalleArqueo = require('./DetalleArqueo');
const Gasto = require('./Gasto');
const LibroCaja = require('./LibroCaja');
const Devolucion = require('./Devolucion');
const DevolucionItem = require('./DevolucionItem');
const Proveedor = require('./Proveedor');
const Compra = require('./Compra');
const DetalleCompra = require('./DetalleCompra');
const RegistroInventario = require('./RegistroInventario');
const Configuracion = require('./Configuracion');
const Sucursal = require('./Sucursal');
const ProductoStockSucursal = require('./ProductoStockSucursal');
const Caja = require('./Caja');
const PagoQr = require('./PagoQr');
const Combo = require('./Combo');
const ComboProducto = require('./ComboProducto');
const Promocion = require('./Promocion');
const Cupon = require('./Cupon');
const RuletaPremio = require('./RuletaPremio');
const RuletaGiro = require('./RuletaGiro');
const Insumo = require('./Insumo');
const InsumoStockSucursal = require('./InsumoStockSucursal');
const InsumoMovimiento = require('./InsumoMovimiento');
const CocinaTiempo = require('./CocinaTiempo');
const RecetaInsumo = require('./RecetaInsumo');
const DetallePedidoOpcion = require('./DetallePedidoOpcion');
const DetallePedidoComboOpcion = require('./DetallePedidoComboOpcion');
const IntegracionApiKey = require('./IntegracionApiKey');
const HorarioPersonal = require('./HorarioPersonal');
const MarcacionPersonal = require('./MarcacionPersonal');

// Roles y Permisos
Rol.belongsToMany(Permiso, { through: RolesPermisos, foreignKey: 'rol_id', otherKey: 'permiso_id', as: 'permisos' });
Permiso.belongsToMany(Rol, { through: RolesPermisos, foreignKey: 'permiso_id', otherKey: 'rol_id', as: 'roles' });

// Usuario
Usuario.belongsTo(Rol, { foreignKey: 'rol_id', as: 'rol' });
Rol.hasMany(Usuario, { foreignKey: 'rol_id', as: 'usuarios' });

// Sucursales
// NOTE: 'as' is passed as { singular, plural } instead of a plain string because
// Sequelize's English inflection library mis-singularizes 'sucursales' as
// 'sucursale' (not 'sucursal'), which would otherwise produce hasSucursale/
// addSucursale instead of the hasSucursal/addSucursal mixins this codebase relies on.
Usuario.belongsToMany(Sucursal, { through: UsuariosSucursales, foreignKey: 'usuario_id', otherKey: 'sucursal_id', as: { singular: 'sucursal', plural: 'sucursales' } });
Sucursal.belongsToMany(Usuario, { through: UsuariosSucursales, foreignKey: 'sucursal_id', otherKey: 'usuario_id', as: 'usuarios' });

// Mesas
Mesa.belongsTo(Area, { foreignKey: 'area_id', as: 'area' });
Area.hasMany(Mesa, { foreignKey: 'area_id', as: 'mesas' });
Mesa.hasMany(MesaSesion, { foreignKey: 'mesa_id', as: 'sesiones' });
MesaSesion.belongsTo(Mesa, { foreignKey: 'mesa_id', as: 'mesa' });
MesaSesion.belongsTo(Sucursal, { foreignKey: 'sucursal_id', as: 'sucursal' });

// Productos
Producto.belongsTo(Categoria, { foreignKey: 'categoria_id', as: 'categoria' });
Categoria.hasMany(Producto, { foreignKey: 'categoria_id', as: 'productos' });

// Opciones de producto
GrupoOpciones.hasMany(Opcion, { foreignKey: 'grupo_opciones_id', as: 'opciones' });
Opcion.belongsTo(GrupoOpciones, { foreignKey: 'grupo_opciones_id', as: 'grupo' });
Producto.belongsToMany(GrupoOpciones, { through: ProductoGrupoOpciones, foreignKey: 'producto_id', otherKey: 'grupo_opciones_id', as: 'grupos_opciones' });
GrupoOpciones.belongsToMany(Producto, { through: ProductoGrupoOpciones, foreignKey: 'grupo_opciones_id', otherKey: 'producto_id', as: 'productos' });

// Pedidos
Pedido.belongsTo(Mesa, { foreignKey: 'mesa_id', as: 'mesa' });
Pedido.belongsTo(MesaSesion, { foreignKey: 'mesa_sesion_id', as: 'mesa_sesion' });
Pedido.belongsTo(Usuario, { foreignKey: 'usuario_id', as: 'usuario' });
Pedido.belongsTo(Cliente, { foreignKey: 'cliente_id', as: 'cliente' });
Pedido.belongsTo(SesionCaja, { foreignKey: 'sesion_caja_id', as: 'sesion_caja' });
Pedido.hasMany(DetallePedido, { foreignKey: 'pedido_id', as: 'detalles' });
MesaSesion.hasMany(Pedido, { foreignKey: 'mesa_sesion_id', as: 'pedidos' });
DetallePedido.belongsTo(Pedido, { foreignKey: 'pedido_id' });
DetallePedido.belongsTo(Producto, { foreignKey: 'producto_id', as: 'producto' });
DetallePedido.belongsTo(Combo, { foreignKey: 'combo_id', as: 'combo' });

// Combos y promociones
Combo.belongsToMany(Producto, { through: ComboProducto, foreignKey: 'combo_id', otherKey: 'producto_id', as: 'productos' });
Producto.belongsToMany(Combo, { through: ComboProducto, foreignKey: 'producto_id', otherKey: 'combo_id', as: 'combos' });
// Una promoción puede afectar a varios productos (ver migración 033).
Promocion.belongsToMany(Producto, { through: PromocionProductos, foreignKey: 'promocion_id', otherKey: 'producto_id', as: 'productos' });
Producto.belongsToMany(Promocion, { through: PromocionProductos, foreignKey: 'producto_id', otherKey: 'promocion_id', as: 'promociones' });

// Cupones
Pedido.belongsTo(Cupon, { foreignKey: 'cupon_id', as: 'cupon' });
Cupon.belongsTo(Usuario, { foreignKey: 'creado_por', as: 'creador' });
Cupon.belongsTo(Cliente, { foreignKey: 'cliente_id', as: 'cliente' });
// Productos a los que se restringe el cupón (opcional — sin filas acá,
// el cupón descuenta sobre todo el carrito, como siempre).
Cupon.belongsToMany(Producto, { through: CuponProductos, foreignKey: 'cupon_id', otherKey: 'producto_id', as: 'productos' });

// Ruleta de premios
RuletaGiro.belongsTo(Cliente, { foreignKey: 'cliente_id', as: 'cliente' });
RuletaGiro.belongsTo(RuletaPremio, { foreignKey: 'premio_id', as: 'premio' });
RuletaGiro.belongsTo(Cupon, { foreignKey: 'cupon_id', as: 'cupon' });
RuletaGiro.belongsTo(Usuario, { foreignKey: 'usuario_id', as: 'usuario' });
RuletaPremio.belongsTo(Producto, { foreignKey: 'producto_id', as: 'producto' });
RuletaPremio.belongsTo(Combo, { foreignKey: 'combo_id', as: 'combo' });

// SesionCaja
SesionCaja.belongsTo(Usuario, { foreignKey: 'usuario_id', as: 'usuario' });
SesionCaja.hasMany(Pedido, { foreignKey: 'sesion_caja_id', as: 'pedidos' });

// Caja
SesionCaja.hasMany(DetalleArqueo, { foreignKey: 'sesion_caja_id', as: 'detalle_arqueo' });
DetalleArqueo.belongsTo(SesionCaja, { foreignKey: 'sesion_caja_id' });

SesionCaja.hasMany(Gasto, { foreignKey: 'sesion_caja_id', as: 'gastos' });
Gasto.belongsTo(SesionCaja, { foreignKey: 'sesion_caja_id' });
Gasto.belongsTo(Usuario, { foreignKey: 'usuario_id', as: 'usuario' });

SesionCaja.hasMany(LibroCaja, { foreignKey: 'sesion_caja_id', as: 'libro_caja' });
LibroCaja.belongsTo(SesionCaja, { foreignKey: 'sesion_caja_id', as: 'sesion_caja' });
LibroCaja.belongsTo(Usuario, { foreignKey: 'usuario_id', as: 'usuario' });

// Compras
Proveedor.hasMany(Compra, { foreignKey: 'proveedor_id', as: 'compras' });
Compra.belongsTo(Proveedor, { foreignKey: 'proveedor_id', as: 'proveedor' });
Compra.belongsTo(Usuario, { foreignKey: 'usuario_id', as: 'usuario' });
Compra.hasMany(DetalleCompra, { foreignKey: 'compra_id', as: 'detalles' });
DetalleCompra.belongsTo(Compra, { foreignKey: 'compra_id' });
DetalleCompra.belongsTo(Producto, { foreignKey: 'producto_id', as: 'producto' });
DetalleCompra.belongsTo(Insumo, { foreignKey: 'insumo_id', as: 'insumo' });

// Inventario
RegistroInventario.belongsTo(Producto, { foreignKey: 'producto_id', as: 'producto' });
RegistroInventario.belongsTo(Usuario, { foreignKey: 'usuario_id', as: 'usuario' });
Producto.hasMany(RegistroInventario, { foreignKey: 'producto_id', as: 'movimientos' });

// Sucursal_id operativo (Fase 2)
Area.belongsTo(Sucursal, { foreignKey: 'sucursal_id', as: 'sucursal' });
SesionCaja.belongsTo(Sucursal, { foreignKey: 'sucursal_id', as: 'sucursal' });
Pedido.belongsTo(Sucursal, { foreignKey: 'sucursal_id', as: 'sucursal' });
Compra.belongsTo(Sucursal, { foreignKey: 'sucursal_id', as: 'sucursal' });
RegistroInventario.belongsTo(Sucursal, { foreignKey: 'sucursal_id', as: 'sucursal' });

// Stock por sucursal
Producto.hasMany(ProductoStockSucursal, { foreignKey: 'producto_id', as: 'stock_sucursales' });
ProductoStockSucursal.belongsTo(Producto, { foreignKey: 'producto_id', as: 'producto' });
ProductoStockSucursal.belongsTo(Sucursal, { foreignKey: 'sucursal_id', as: 'sucursal' });

// Cajas físicas (Fase 6)
Caja.belongsTo(Sucursal, { foreignKey: 'sucursal_id', as: 'sucursal' });
Sucursal.hasMany(Caja, { foreignKey: 'sucursal_id', as: 'cajas' });
Caja.hasMany(SesionCaja, { foreignKey: 'caja_id', as: 'sesiones' });
SesionCaja.belongsTo(Caja, { foreignKey: 'caja_id', as: 'caja' });

// Integraciones API keys por sucursal
IntegracionApiKey.belongsTo(Sucursal, { foreignKey: 'sucursal_id', as: 'sucursal' });
Sucursal.hasMany(IntegracionApiKey, { foreignKey: 'sucursal_id', as: 'integraciones_api_keys' });

// Insumos (ingredientes, no vendibles) y su stock/movimientos por sucursal
Insumo.hasMany(InsumoStockSucursal, { foreignKey: 'insumo_id', as: 'stock_sucursales' });
InsumoStockSucursal.belongsTo(Insumo, { foreignKey: 'insumo_id', as: 'insumo' });
InsumoStockSucursal.belongsTo(Sucursal, { foreignKey: 'sucursal_id', as: 'sucursal' });
Insumo.hasMany(InsumoMovimiento, { foreignKey: 'insumo_id', as: 'movimientos' });
InsumoMovimiento.belongsTo(Insumo, { foreignKey: 'insumo_id', as: 'insumo' });
InsumoMovimiento.belongsTo(Sucursal, { foreignKey: 'sucursal_id', as: 'sucursal' });
InsumoMovimiento.belongsTo(Usuario, { foreignKey: 'usuario_id', as: 'usuario' });
CocinaTiempo.belongsTo(Pedido, { foreignKey: 'pedido_id', as: 'pedido' });

// Receta: qué insumo(s) consume un producto al venderse (base o por opción)
Producto.hasMany(RecetaInsumo, { foreignKey: 'producto_id', as: 'receta' });
RecetaInsumo.belongsTo(Producto, { foreignKey: 'producto_id', as: 'producto' });
RecetaInsumo.belongsTo(Opcion, { foreignKey: 'opcion_id', as: 'opcion' });
RecetaInsumo.belongsTo(Insumo, { foreignKey: 'insumo_id', as: 'insumo' });

// Opciones elegidas por línea de pedido (para poder resolver la receta al vender)
DetallePedido.belongsToMany(Opcion, { through: DetallePedidoOpcion, foreignKey: 'detalle_pedido_id', otherKey: 'opcion_id', as: 'opciones' });
Opcion.belongsToMany(DetallePedido, { through: DetallePedidoOpcion, foreignKey: 'opcion_id', otherKey: 'detalle_pedido_id', as: 'detalles_pedido' });

// Opciones elegidas por producto dentro de un combo (ver migración 043) —
// el combo sigue siendo una sola fila de DetallePedido; esta tabla guarda,
// por separado, qué opción se eligió para cada producto componente.
DetallePedido.hasMany(DetallePedidoComboOpcion, { foreignKey: 'detalle_pedido_id', as: 'combo_opciones' });
DetallePedidoComboOpcion.belongsTo(DetallePedido, { foreignKey: 'detalle_pedido_id' });
DetallePedidoComboOpcion.belongsTo(Producto, { foreignKey: 'producto_id', as: 'producto' });
DetallePedidoComboOpcion.belongsTo(Opcion, { foreignKey: 'opcion_id', as: 'opcion' });

// Pagos QR (CodePay)
Pedido.hasMany(PagoQr, { foreignKey: 'pedido_id', as: 'pagosQr' });
PagoQr.belongsTo(Pedido, { foreignKey: 'pedido_id', as: 'pedido' });
PagoQr.belongsTo(Sucursal, { foreignKey: 'sucursal_id', as: 'sucursal' });

// Control de personal (entrada/salida por GPS + horarios semanales)
Usuario.hasMany(HorarioPersonal, { foreignKey: 'usuario_id', as: 'horarios_personal' });
HorarioPersonal.belongsTo(Usuario, { foreignKey: 'usuario_id', as: 'usuario' });

Usuario.hasMany(MarcacionPersonal, { foreignKey: 'usuario_id', as: 'marcaciones' });
MarcacionPersonal.belongsTo(Usuario, { foreignKey: 'usuario_id', as: 'usuario' });
MarcacionPersonal.belongsTo(Sucursal, { foreignKey: 'sucursal_id', as: 'sucursal' });
MarcacionPersonal.belongsTo(Usuario, { foreignKey: 'aprobado_por', as: 'aprobador' });

// Devoluciones
Pedido.hasMany(Devolucion, { foreignKey: 'pedido_id', as: 'devoluciones' });
Devolucion.belongsTo(Pedido, { foreignKey: 'pedido_id', as: 'pedido' });
Devolucion.belongsTo(Usuario, { foreignKey: 'usuario_id', as: 'usuario' });
Devolucion.belongsTo(SesionCaja, { foreignKey: 'sesion_caja_id', as: 'sesion_caja' });
SesionCaja.hasMany(Devolucion, { foreignKey: 'sesion_caja_id', as: 'devoluciones' });
Devolucion.hasMany(DevolucionItem, { foreignKey: 'devolucion_id', as: 'items' });
DevolucionItem.belongsTo(Devolucion, { foreignKey: 'devolucion_id' });
DevolucionItem.belongsTo(DetallePedido, { foreignKey: 'detalle_pedido_id', as: 'detalle' });

module.exports = {
  sequelize,
  Rol, Permiso, Usuario,
  Area, Mesa, MesaSesion,
  Categoria, Producto,
  GrupoOpciones, Opcion, ProductoGrupoOpciones,
  Cliente, ClientePinVerificacion,
  SesionCaja, Pedido, DetallePedido,
  DetalleArqueo, Gasto, LibroCaja, Devolucion, DevolucionItem,
  Proveedor, Compra, DetalleCompra,
  RegistroInventario,
  Configuracion,
  Sucursal,
  ProductoStockSucursal,
  Caja,
  PagoQr,
  Combo, ComboProducto, Promocion,
  Cupon,
  RuletaPremio, RuletaGiro,
  Insumo, InsumoStockSucursal, InsumoMovimiento, CocinaTiempo, RecetaInsumo, DetallePedidoOpcion, DetallePedidoComboOpcion,
  IntegracionApiKey,
  HorarioPersonal, MarcacionPersonal,
};
