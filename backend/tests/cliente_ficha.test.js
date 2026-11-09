// Ficha del cliente: resumen, lo que más pide, cupones, ruleta y puntos.
const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const { Sucursal, Usuario, Rol, Cliente, Categoria, Producto, Pedido, DetallePedido } = require('../src/models');

describe('GET /api/v1/clientes/:id/ficha', () => {
  const t = Date.now();
  let sucursal, usuario, cliente, categoria, salteña, coca, token;

  beforeAll(async () => {
    sucursal = await Sucursal.create({ nombre: `Sucursal Ficha ${t}` });
    const rol = await Rol.findOne({ where: { nombre: 'Administrador' } });
    usuario = await Usuario.create({ rol_id: rol.id, nombre: `Ficha ${t}`, email: `ficha-${t}@restaurante.com`, contrasena: await bcrypt.hash('clave123', 10) });
    await usuario.addSucursal(sucursal);
    cliente = await Cliente.create({ nombre: `Cliente Ficha ${t}`, tipo_documento: 'CI', numero_documento: `FI${t}`.slice(0, 15), puntos: 40 });
    categoria = await Categoria.create({ nombre: `Cat Ficha ${t}` });
    salteña = await Producto.create({ categoria_id: categoria.id, nombre: `Salteña ${t}`, precio: 8, stock: 0 });
    coca = await Producto.create({ categoria_id: categoria.id, nombre: `Coca ${t}`, precio: 10, stock: 0 });
    const venta = (total, ganados, canjeados, lineas) => Pedido.create({ sucursal_id: sucursal.id, usuario_id: usuario.id, cliente_id: cliente.id, tipo: 'llevar', estado: 'completado', total, puntos_ganados: ganados, puntos_canjeados: canjeados })
      .then((p) => DetallePedido.bulkCreate(lineas.map(([prod, cant]) => ({ pedido_id: p.id, producto_id: prod.id, cantidad: cant, precio: prod.precio }))));
    await venta(34, 30, 0, [[salteña, 3], [coca, 1]]);
    await venta(16, 10, 5, [[salteña, 2]]);
    const login = await request(app).post('/api/v1/auth/login').send({ email: usuario.email, contrasena: 'clave123' });
    token = login.body.datos.token;
  });

  afterAll(async () => {
    const pedidos = await Pedido.findAll({ where: { cliente_id: cliente.id } });
    await DetallePedido.destroy({ where: { pedido_id: pedidos.map((p) => p.id) } });
    await Pedido.destroy({ where: { cliente_id: cliente.id } });
    await Producto.destroy({ where: { id: [salteña.id, coca.id] } });
    await Categoria.destroy({ where: { id: categoria.id } });
    await Cliente.destroy({ where: { id: cliente.id } });
    await Usuario.destroy({ where: { id: usuario.id } });
    await Sucursal.destroy({ where: { id: sucursal.id } });
  });

  it('junta visitas, lo que más pide y los movimientos de puntos', async () => {
    const res = await request(app).get(`/api/v1/clientes/${cliente.id}/ficha`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const d = res.body.datos;
    expect(d.resumen).toMatchObject({ visitas: 2, gastado: 50 });
    expect(d.favoritos[0]).toMatchObject({ nombre: `Salteña ${t}`, cantidad: 5, veces: 2 });
    expect(d.movimientos.map((m) => m.puntos).sort((a, b) => a - b)).toEqual([-5, 10, 30]);
    expect(d.cupones).toEqual([]);
    expect(d.giros).toEqual([]);
  });

  it('cliente que no existe → 404', async () => {
    const res = await request(app).get('/api/v1/clientes/999999999/ficha').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});
