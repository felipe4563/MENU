const bcrypt = require('bcryptjs');
const {
  sequelize, Sucursal, Rol, Usuario, Pedido, DetallePedido, Devolucion, DevolucionItem,
} = require('../src/models');

describe('Devoluciones — modelos y permiso', () => {
  let sucursal, usuario, pedido, detalle, devolucion;

  beforeAll(async () => {
    sucursal = await Sucursal.create({ nombre: 'Sucursal Devoluciones Test' });
    const rol = await Rol.findOne({ where: { nombre: 'Cajero' } });
    usuario = await Usuario.create({
      rol_id: rol.id, nombre: 'Devoluciones Test', email: 'devoluciones-model-test@restaurante.com',
      contrasena: await bcrypt.hash('clave123', 10),
    });
    pedido = await Pedido.create({ sucursal_id: sucursal.id, usuario_id: usuario.id, tipo: 'llevar', total: 20 });
    detalle = await DetallePedido.create({ pedido_id: pedido.id, cantidad: 2, precio: 10 });
  });

  afterAll(async () => {
    if (devolucion) {
      await DevolucionItem.destroy({ where: { devolucion_id: devolucion.id } });
      await Devolucion.destroy({ where: { id: devolucion.id } });
    }
    if (detalle) await DetallePedido.destroy({ where: { id: detalle.id } });
    if (pedido) await Pedido.destroy({ where: { id: pedido.id } });
    if (usuario) await Usuario.destroy({ where: { id: usuario.id } });
    if (sucursal) await Sucursal.destroy({ where: { id: sucursal.id } });
    await sequelize.close();
  });

  it('DetallePedido.cantidad_anulada tiene default 0', async () => {
    expect(DetallePedido.rawAttributes.cantidad_anulada.defaultValue).toBe(0);
    await detalle.reload();
    expect(detalle.cantidad_anulada).toBe(0);
  });

  it('Pedido.total_devuelto y SesionCaja.total_devoluciones existen con default 0', async () => {
    const { SesionCaja } = require('../src/models');
    expect(Pedido.rawAttributes.total_devuelto.defaultValue).toBe(0);
    expect(SesionCaja.rawAttributes.total_devoluciones.defaultValue).toBe(0);
  });

  it('crea una devolución con item y la carga por asociación', async () => {
    devolucion = await Devolucion.create({
      pedido_id: pedido.id, usuario_id: usuario.id, motivo: 'demora', monto: 10, forma: 'efectivo',
    });
    await DevolucionItem.create({
      devolucion_id: devolucion.id, detalle_pedido_id: detalle.id, cantidad: 1, monto: 10, vuelve_stock: 1,
    });
    const p = await Pedido.findByPk(pedido.id, {
      include: [{ model: Devolucion, as: 'devoluciones', include: ['items'] }],
    });
    expect(p.devoluciones).toHaveLength(1);
    expect(p.devoluciones[0].items[0].cantidad).toBe(1);
  });

  it('el rol Cajero tiene el permiso ventas.anular', async () => {
    const [filas] = await sequelize.query(
      `SELECT 1 FROM roles_permisos rp
       JOIN roles r ON r.id = rp.rol_id AND r.nombre = 'Cajero'
       JOIN permisos p ON p.id = rp.permiso_id AND p.modulo = 'ventas' AND p.accion = 'anular'`
    );
    expect(filas.length).toBe(1);
  });
});
