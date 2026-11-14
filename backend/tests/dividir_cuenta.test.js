// Dividir la cuenta: cobrar un pedido en varias partes (por platos o en partes iguales).
const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const {
  Sucursal, Caja, SesionCaja, Usuario, Rol, Categoria, Producto, Pedido, DetallePedido,
  PedidoPago, PedidoPagoItem,
} = require('../src/models');

describe('Dividir cuenta', () => {
  let sucursal, caja, usuario, sesion, categoria, platoA, platoB, token;

  // Crea un pedido de mesa y le agrega las líneas [{ producto, cantidad }]
  const nuevoPedido = async (lineas) => {
    const p = await request(app).post('/api/v1/ventas').set('Authorization', `Bearer ${token}`)
      .send({ tipo: 'llevar', sesion_caja_id: sesion.id });
    expect(p.status).toBe(201);
    for (const l of lineas) {
      const it = await request(app).post(`/api/v1/ventas/${p.body.datos.id}/items`).set('Authorization', `Bearer ${token}`)
        .send({ producto_id: l.producto.id, cantidad: l.cantidad });
      expect(it.status).toBe(201);
    }
    return p.body.datos.id;
  };

  beforeAll(async () => {
    sucursal = await Sucursal.create({ nombre: 'Sucursal Dividir Cuenta Test' });
    caja = await Caja.create({ sucursal_id: sucursal.id, nombre: 'Caja Dividir Cuenta Test' });
    const rol = await Rol.findOne({ where: { nombre: 'Administrador' } });
    const hash = await bcrypt.hash('clave123', 10);
    usuario = await Usuario.create({ rol_id: rol.id, nombre: 'Cajero Dividir Test', email: 'dividir-cuenta-test@restaurante.com', contrasena: hash });
    await usuario.addSucursal(sucursal);
    token = (await request(app).post('/api/v1/auth/login').send({ email: 'dividir-cuenta-test@restaurante.com', contrasena: 'clave123' })).body.datos.token;
    sesion = await SesionCaja.create({ usuario_id: usuario.id, sucursal_id: sucursal.id, caja_id: caja.id, monto_apertura: 0 });
    categoria = await Categoria.create({ nombre: 'Categoria Dividir Cuenta Test' });
    platoA = await Producto.create({ categoria_id: categoria.id, nombre: 'Plato A', precio: 30 });
    platoB = await Producto.create({ categoria_id: categoria.id, nombre: 'Plato B', precio: 25 });
  });

  afterAll(async () => {
    const ids = (await Pedido.findAll({ where: { sucursal_id: sucursal.id }, attributes: ['id'] })).map((p) => p.id);
    const pagos = (await PedidoPago.findAll({ where: { pedido_id: ids }, attributes: ['id'] })).map((p) => p.id);
    await PedidoPagoItem.destroy({ where: { pedido_pago_id: pagos } });
    await PedidoPago.destroy({ where: { pedido_id: ids } });
    await DetallePedido.destroy({ where: { pedido_id: ids } });
    await Pedido.destroy({ where: { id: ids } });
    await SesionCaja.destroy({ where: { id: sesion.id } });
    await Producto.destroy({ where: { id: [platoA.id, platoB.id] } });
    await Categoria.destroy({ where: { id: categoria.id } });
    await Usuario.destroy({ where: { id: usuario.id } });
    await Caja.destroy({ where: { id: caja.id } });
    await Sucursal.destroy({ where: { id: sucursal.id } });
  });

  it('el pedido nace sin pagos', async () => {
    const id = await nuevoPedido([{ producto: platoA, cantidad: 1 }, { producto: platoB, cantidad: 1 }]);
    const get = await request(app).get(`/api/v1/ventas/${id}`).set('Authorization', `Bearer ${token}`);
    expect(get.status).toBe(200);
    expect(get.body.datos.pagado).toBe('0.00');
    expect(await PedidoPago.count({ where: { pedido_id: id } })).toBe(0);
  });
});
