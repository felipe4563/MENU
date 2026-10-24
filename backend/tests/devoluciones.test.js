const request = require('supertest');
const app = require('../src/app');
const bcrypt = require('bcryptjs');
const {
  Sucursal, Categoria, Producto, Usuario, Rol, Permiso, Caja, SesionCaja, Pedido, DetallePedido,
  Devolucion, DevolucionItem, LibroCaja,
} = require('../src/models');

describe('POST /ventas/:id/anular - pedidos sin cobrar', () => {
  let sucursalId, otraSucursalId, usuarioId, sinPermisoId, cajaId, sesionId, token, tokenSinPermiso, productoId, categoriaId, rolTmpId;

  const nuevoPedido = async (cantidad = 3) => {
    const p = await request(app).post('/api/v1/ventas').set('Authorization', `Bearer ${token}`).send({ tipo: 'llevar', sesion_caja_id: sesionId });
    expect(p.status).toBe(201);
    const it = await request(app).post(`/api/v1/ventas/${p.body.datos.id}/items`).set('Authorization', `Bearer ${token}`)
      .send({ producto_id: productoId, cantidad });
    expect(it.status).toBe(201);
    const det = await DetallePedido.findOne({ where: { pedido_id: p.body.datos.id } });
    return { pedidoId: p.body.datos.id, detalleId: det.id };
  };
  const anular = (id, body, tk = token) => request(app).post(`/api/v1/ventas/${id}/anular`).set('Authorization', `Bearer ${tk}`).send(body);

  beforeAll(async () => {
    const sucursal = await Sucursal.create({ nombre: 'Sucursal Devoluciones Test' });
    sucursalId = sucursal.id;
    otraSucursalId = (await Sucursal.create({ nombre: 'Otra Sucursal Devoluciones Test' })).id;
    const hash = await bcrypt.hash('clave123', 10);

    const rol = await Rol.findOne({ where: { nombre: 'Cajero' } });
    const usuario = await Usuario.create({ rol_id: rol.id, nombre: 'Devoluciones Test', email: 'devoluciones-test@restaurante.com', contrasena: hash });
    usuarioId = usuario.id;
    await usuario.addSucursal(sucursal);
    token = (await request(app).post('/api/v1/auth/login').send({ email: 'devoluciones-test@restaurante.com', contrasena: 'clave123' })).body.datos.token;

    const rolTmp = await Rol.create({ nombre: 'Sin Anular Test', descripcion: 'Rol de prueba sin ventas.anular' });
    rolTmpId = rolTmp.id;
    const permisos = await Permiso.findAll({ where: { modulo: 'ventas' } });
    await rolTmp.setPermisos(permisos.filter((p) => p.accion !== 'anular'));
    const u2 = await Usuario.create({ rol_id: rolTmp.id, nombre: 'Sin Anular Test', email: 'sin-anular-test@restaurante.com', contrasena: hash });
    sinPermisoId = u2.id;
    await u2.addSucursal(sucursal);
    tokenSinPermiso = (await request(app).post('/api/v1/auth/login').send({ email: 'sin-anular-test@restaurante.com', contrasena: 'clave123' })).body.datos.token;

    const caja = await Caja.create({ sucursal_id: sucursalId, nombre: 'Caja Devoluciones Test' });
    cajaId = caja.id;
    sesionId = (await SesionCaja.create({ usuario_id: usuarioId, sucursal_id: sucursalId, caja_id: cajaId, monto_apertura: 0 })).id;
    categoriaId = (await Categoria.create({ nombre: 'Categoria Devoluciones Test' })).id;
    productoId = (await Producto.create({ categoria_id: categoriaId, nombre: 'Producto Devoluciones Test', precio: 10 })).id;
  });

  afterAll(async () => {
    const pedidos = await Pedido.findAll({ where: { sucursal_id: [sucursalId, otraSucursalId] }, attributes: ['id'] });
    const ids = pedidos.map((p) => p.id);
    const devs = await Devolucion.findAll({ where: { pedido_id: ids }, attributes: ['id'] });
    await DevolucionItem.destroy({ where: { devolucion_id: devs.map((d) => d.id) } });
    await Devolucion.destroy({ where: { pedido_id: ids } });
    await DetallePedido.destroy({ where: { pedido_id: ids } });
    await Pedido.destroy({ where: { id: ids } });
    await LibroCaja.destroy({ where: { usuario_id: usuarioId } });
    await SesionCaja.destroy({ where: { id: sesionId } });
    await Caja.destroy({ where: { id: cajaId } });
    await Producto.destroy({ where: { id: productoId } });
    await Categoria.destroy({ where: { id: categoriaId } });
    await Usuario.destroy({ where: { id: [usuarioId, sinPermisoId] } });
    await Rol.destroy({ where: { id: rolTmpId } });
    await Sucursal.destroy({ where: { id: [sucursalId, otraSucursalId] } });
  });

  it('anula 2 de 3: cantidad_anulada, total, sin dinero y sin libro_caja', async () => {
    const { pedidoId, detalleId } = await nuevoPedido(3);
    const antes = await LibroCaja.count({ where: { usuario_id: usuarioId } });
    const res = await anular(pedidoId, { items: [{ detalle_pedido_id: detalleId, cantidad: 2 }], motivo: 'demora' });
    expect(res.status).toBe(201);
    expect(res.body.datos.devolucion.forma).toBe('sin_dinero');
    expect(Number(res.body.datos.devolucion.monto)).toBe(0);
    expect(res.body.datos.impresion).toEqual({ cocina: null });
    expect((await DetallePedido.findByPk(detalleId)).cantidad_anulada).toBe(2);
    expect(Number((await Pedido.findByPk(pedidoId)).total)).toBe(10);
    expect(await LibroCaja.count({ where: { usuario_id: usuarioId } })).toBe(antes);

    const get = await request(app).get(`/api/v1/ventas/${pedidoId}`).set('Authorization', `Bearer ${token}`);
    expect(get.status).toBe(200);
    expect(get.body.datos.devoluciones).toHaveLength(1);
    expect(get.body.datos.devoluciones[0].usuario.id).toBe(usuarioId);
    expect(get.body.datos.devoluciones[0].items).toHaveLength(1);
  });

  it('anular 4 de 3 -> 400 y nada cambia', async () => {
    const { pedidoId, detalleId } = await nuevoPedido(3);
    const res = await anular(pedidoId, { items: [{ detalle_pedido_id: detalleId, cantidad: 4 }], motivo: 'demora' });
    expect(res.status).toBe(400);
    expect((await DetallePedido.findByPk(detalleId)).cantidad_anulada).toBe(0);
    expect(await Devolucion.count({ where: { pedido_id: pedidoId } })).toBe(0);
  });

  it('no permite anular mas que lo vigente en una segunda anulacion', async () => {
    const { pedidoId, detalleId } = await nuevoPedido(3);
    expect((await anular(pedidoId, { items: [{ detalle_pedido_id: detalleId, cantidad: 2 }], motivo: 'demora' })).status).toBe(201);
    expect((await anular(pedidoId, { items: [{ detalle_pedido_id: detalleId, cantidad: 2 }], motivo: 'demora' })).status).toBe(400);
  });

  it('motivo ausente -> 400; otro sin nota -> 400', async () => {
    const { pedidoId, detalleId } = await nuevoPedido(1);
    const items = [{ detalle_pedido_id: detalleId, cantidad: 1 }];
    expect((await anular(pedidoId, { items })).status).toBe(400);
    expect((await anular(pedidoId, { items, motivo: 'otro' })).status).toBe(400);
    expect((await anular(pedidoId, { items, motivo: 'otro', nota: 'Se cayo al piso' })).status).toBe(201);
  });

  it('pedido cancelado -> 409; pendiente_pago -> 409', async () => {
    const a = await nuevoPedido(1);
    await Pedido.update({ estado: 'cancelado' }, { where: { id: a.pedidoId } });
    expect((await anular(a.pedidoId, { items: [{ detalle_pedido_id: a.detalleId, cantidad: 1 }], motivo: 'demora' })).status).toBe(409);
    const b = await nuevoPedido(1);
    await Pedido.update({ estado: 'pendiente_pago' }, { where: { id: b.pedidoId } });
    expect((await anular(b.pedidoId, { items: [{ detalle_pedido_id: b.detalleId, cantidad: 1 }], motivo: 'demora' })).status).toBe(409);
  });

  it('usuario sin ventas.anular -> 403', async () => {
    const { pedidoId, detalleId } = await nuevoPedido(1);
    const res = await anular(pedidoId, { items: [{ detalle_pedido_id: detalleId, cantidad: 1 }], motivo: 'demora' }, tokenSinPermiso);
    expect(res.status).toBe(403);
  });

  it('pedido de otra sucursal -> mismo codigo que GET /ventas/:id', async () => {
    const otro = await Pedido.create({ sucursal_id: otraSucursalId, usuario_id: usuarioId, tipo: 'llevar', estado: 'pendiente', total: 10 });
    const det = await DetallePedido.create({ pedido_id: otro.id, producto_id: productoId, cantidad: 1, precio: 10 });
    const get = await request(app).get(`/api/v1/ventas/${otro.id}`).set('Authorization', `Bearer ${token}`);
    const res = await anular(otro.id, { items: [{ detalle_pedido_id: det.id, cantidad: 1 }], motivo: 'demora' });
    expect(res.status).toBe(get.status);
    expect(res.status).toBe(404);
  });

  it('linea por peso: anulacion parcial -> 400; completa -> 201', async () => {
    const { pedidoId, detalleId } = await nuevoPedido(2);
    await DetallePedido.update({ peso: 1.5 }, { where: { id: detalleId } });
    expect((await anular(pedidoId, { items: [{ detalle_pedido_id: detalleId, cantidad: 1 }], motivo: 'demora' })).status).toBe(400);
    expect((await anular(pedidoId, { items: [{ detalle_pedido_id: detalleId, cantidad: 2 }], motivo: 'demora' })).status).toBe(201);
  });

  it('detalle_pedido_id repetido en la solicitud -> 400', async () => {
    const { pedidoId, detalleId } = await nuevoPedido(3);
    const res = await anular(pedidoId, { items: [{ detalle_pedido_id: detalleId, cantidad: 1 }, { detalle_pedido_id: detalleId, cantidad: 1 }], motivo: 'demora' });
    expect(res.status).toBe(400);
    expect((await DetallePedido.findByPk(detalleId)).cantidad_anulada).toBe(0);
  });

  it('pedido listo se anula como sin cobrar', async () => {
    const { pedidoId, detalleId } = await nuevoPedido(2);
    await Pedido.update({ estado: 'listo' }, { where: { id: pedidoId } });
    const res = await anular(pedidoId, { items: [{ detalle_pedido_id: detalleId, cantidad: 1 }], motivo: 'demora' });
    expect(res.status).toBe(201);
    expect(res.body.datos.devolucion.forma).toBe('sin_dinero');
  });

  it('detalle de otro pedido -> 400', async () => {
    const a = await nuevoPedido(1);
    const b = await nuevoPedido(1);
    const res = await anular(a.pedidoId, { items: [{ detalle_pedido_id: b.detalleId, cantidad: 1 }], motivo: 'demora' });
    expect(res.status).toBe(400);
    expect((await DetallePedido.findByPk(b.detalleId)).cantidad_anulada).toBe(0);
  });
});
