// Reservas con platos y adelanto: datos (tablas, asociaciones y modo de pago).
const bcrypt = require('bcryptjs');
const { Sucursal, Rol, Usuario, Reserva, ReservaItem, ReservaPago, Pedido, PedidoPago, CategoriaFlujo } = require('../src/models');

describe('Reservas con platos y adelanto (datos)', () => {
  let sucursal, usuario, reserva, pedido;

  beforeAll(async () => {
    sucursal = await Sucursal.create({ nombre: 'Sucursal Reservas Platos Test' });
    const rol = await Rol.findOne({ where: { nombre: 'Administrador' } });
    usuario = await Usuario.create({ rol_id: rol.id, nombre: 'Reservas Platos Test', email: 'reservas-platos-test@restaurante.com', contrasena: await bcrypt.hash('clave123', 10) });
    reserva = await Reserva.create({ sucursal_id: sucursal.id, nombre_cliente: 'Familia Platos', personas: 4, fecha_hora: new Date(Date.now() + 86400000) });
  });

  afterAll(async () => {
    if (pedido) { await PedidoPago.destroy({ where: { pedido_id: pedido.id } }); await Pedido.destroy({ where: { id: pedido.id } }); }
    await Reserva.destroy({ where: { sucursal_id: sucursal.id } });
    await Usuario.destroy({ where: { id: usuario.id } });
    await Sucursal.destroy({ where: { id: sucursal.id } });
  });

  it('crea reserva con items y pagos y los trae por asociación', async () => {
    await ReservaItem.create({ reserva_id: reserva.id, nombre: 'Pique macho', cantidad: 2, precio: 55.5 });
    await ReservaPago.create({ reserva_id: reserva.id, usuario_id: usuario.id, tipo: 'adelanto', metodo_pago: 'efectivo', monto: 50 });
    const r = await Reserva.findByPk(reserva.id, { include: ['items', 'pagos'] });
    expect(r.items.length).toBe(1);
    expect(r.pagos[0].tipo).toBe('adelanto');
    expect(r.pagos[0].estado).toBe('completado');
    expect(Number(r.items[0].precio)).toBe(55.5);
  });

  it('pedido_pagos acepta modo adelanto', async () => {
    pedido = await Pedido.create({ sucursal_id: sucursal.id, usuario_id: usuario.id, tipo: 'llevar', total: 10 });
    await expect(PedidoPago.create({ pedido_id: pedido.id, usuario_id: usuario.id, metodo_pago: 'efectivo', monto: 10, modo: 'adelanto' })).resolves.toBeDefined();
  });

  it('existe la categoría de flujo adelantos_reserva', async () => {
    const c = await CategoriaFlujo.findOne({ where: { clave: 'adelantos_reserva' } });
    expect(c).toMatchObject({ grupo: 'ingresos', auto: true, sistema: true });
  });
});

// Platos de la reserva por la API: precio congelado, reemplazo al editar y
// "reservas de hoy" para cocina.
describe('Reservas con platos (API)', () => {
  const request = require('supertest');
  const app = require('../src/app');
  const { Categoria, Producto } = require('../src/models');
  let sucursal, usuario, token, categoria, plato, bebida, noVendible;
  const manana = new Date(Date.now() - 4 * 3600000 + 86400000).toISOString().slice(0, 10);
  const hoy = new Date(Date.now() - 4 * 3600000).toISOString().slice(0, 10);
  const auth = () => ({ Authorization: `Bearer ${token}` });
  const crear = (body) => request(app).post('/api/v1/reservas').set(auth()).send({ nombre_cliente: 'Familia Platos API', personas: 4, fecha_hora: `${manana}T20:00`, ...body });

  beforeAll(async () => {
    sucursal = await Sucursal.create({ nombre: 'Sucursal Reservas Platos API Test' });
    const rol = await Rol.findOne({ where: { nombre: 'Administrador' } });
    usuario = await Usuario.create({ rol_id: rol.id, nombre: 'Reservas Platos API Test', email: 'reservas-platos-api-test@restaurante.com', contrasena: await bcrypt.hash('clave123', 10) });
    await usuario.addSucursal(sucursal);
    token = (await request(app).post('/api/v1/auth/login').send({ email: 'reservas-platos-api-test@restaurante.com', contrasena: 'clave123' })).body.datos.token;
    categoria = await Categoria.create({ nombre: 'Categoria Reservas Platos Test' });
    plato = await Producto.create({ categoria_id: categoria.id, nombre: 'Silpancho Reservas Test', precio: 40, stock: null });
    bebida = await Producto.create({ categoria_id: categoria.id, nombre: 'Limonada Reservas Test', precio: 10.5, stock: null });
    noVendible = await Producto.create({ categoria_id: categoria.id, nombre: 'Insumo Reservas Test', precio: 3, stock: null, es_vendible: 0 });
  });

  afterAll(async () => {
    const reservas = await Reserva.findAll({ where: { sucursal_id: sucursal.id }, attributes: ['id'] });
    const ids = reservas.map((r) => r.id);
    await ReservaItem.destroy({ where: { reserva_id: ids } });
    await ReservaPago.destroy({ where: { reserva_id: ids } });
    await Reserva.destroy({ where: { id: ids } });
    await Pedido.destroy({ where: { sucursal_id: sucursal.id } });
    await Producto.destroy({ where: { categoria_id: categoria.id } });
    await Categoria.destroy({ where: { id: categoria.id } });
    await Usuario.destroy({ where: { id: usuario.id } });
    await Sucursal.destroy({ where: { id: sucursal.id } });
  });

  it('guarda platos con precio congelado', async () => {
    const r = await crear({ items: [{ producto_id: plato.id, cantidad: 2, nota: 'sin cebolla' }, { producto_id: bebida.id, cantidad: 1 }], envio_cocina: 'antes' });
    expect(r.status).toBe(201);
    expect(r.body.datos).toMatchObject({ envio_cocina: 'antes', total_platos: 90.5, adelantado: 0, saldo: 90.5 });
    expect(r.body.datos.items).toHaveLength(2);
    await plato.update({ precio: 99 });
    const g = await request(app).get(`/api/v1/reservas/${r.body.datos.id}`).set(auth());
    expect(g.status).toBe(200);
    const silpancho = g.body.datos.items.find((i) => i.producto_id === plato.id);
    expect(silpancho).toMatchObject({ nombre: 'Silpancho Reservas Test', cantidad: 2, nota: 'sin cebolla' });
    expect(Number(silpancho.precio)).toBe(40);
    expect(g.body.datos.total_platos).toBe(90.5);
    await plato.update({ precio: 40 });
  });

  it('rechaza producto no vendible', async () => {
    const r = await crear({ items: [{ producto_id: noVendible.id, cantidad: 1 }] });
    expect(r.status).toBe(409);
  });

  it('reemplaza los platos al editar y calcula el saldo con lo adelantado', async () => {
    const r = (await crear({ fecha_hora: `${manana}T13:00`, items: [{ producto_id: plato.id, cantidad: 1 }] })).body.datos;
    await ReservaPago.create({ reserva_id: r.id, usuario_id: usuario.id, tipo: 'adelanto', metodo_pago: 'efectivo', monto: 30 });
    await ReservaPago.create({ reserva_id: r.id, usuario_id: usuario.id, tipo: 'adelanto', metodo_pago: 'qr', monto: 5, estado: 'anulado' });
    const e = await request(app).put(`/api/v1/reservas/${r.id}`).set(auth()).send({ items: [{ producto_id: bebida.id, cantidad: 4 }] });
    expect(e.status).toBe(200);
    expect(e.body.datos.items).toHaveLength(1);
    expect(e.body.datos.items[0].producto_id).toBe(bebida.id);
    expect(e.body.datos).toMatchObject({ total_platos: 42, adelantado: 30, saldo: 12 });
    expect(e.body.datos.pagos.find((p) => p.estado === 'completado').usuario.nombre).toBe('Reservas Platos API Test');
    // Sin "items" no se tocan los platos.
    const sinItems = await request(app).put(`/api/v1/reservas/${r.id}`).set(auth()).send({ personas: 6 });
    expect(sinItems.body.datos.items).toHaveLength(1);
    expect(sinItems.body.datos.personas).toBe(6);
    // Bajar los platos por debajo de lo adelantado no se deja.
    const baja = await request(app).put(`/api/v1/reservas/${r.id}`).set(auth()).send({ items: [{ producto_id: bebida.id, cantidad: 1 }] });
    expect(baja.status).toBe(409);
    expect(baja.body.mensaje).toBe('Lo adelantado (Bs 30.00) pasa el total de los platos: devuelve la diferencia primero');
  });

  it('no deja editar platos de una reserva ya en cocina', async () => {
    const r = (await crear({ fecha_hora: `${manana}T15:00`, items: [{ producto_id: plato.id, cantidad: 1 }] })).body.datos;
    const enCocina = await Pedido.create({ sucursal_id: sucursal.id, usuario_id: usuario.id, tipo: 'llevar', total: 40 });
    await Reserva.update({ pedido_id: enCocina.id }, { where: { id: r.id } });
    const e = await request(app).put(`/api/v1/reservas/${r.id}`).set(auth()).send({ items: [{ producto_id: plato.id, cantidad: 3 }] });
    expect(e.status).toBe(409);
    expect(e.body.mensaje).toBe('Esta reserva ya está en cocina: cambia el pedido');
    const hora = await request(app).put(`/api/v1/reservas/${r.id}`).set(auth()).send({ fecha_hora: `${manana}T16:00` });
    expect(hora.status).toBe(409);
    // Lo demás (personas, notas) sí se puede cambiar.
    expect((await request(app).put(`/api/v1/reservas/${r.id}`).set(auth()).send({ personas: 5 })).status).toBe(200);
  });

  it('reservas de hoy suma platos de varias reservas', async () => {
    const base = { sucursal_id: sucursal.id, personas: 2 };
    const a = await Reserva.create({ ...base, nombre_cliente: 'Hoy A', fecha_hora: new Date(`${hoy}T21:00:00-04:00`) });
    const b = await Reserva.create({ ...base, nombre_cliente: 'Hoy B', fecha_hora: new Date(`${hoy}T19:30:00-04:00`) });
    const c = await Reserva.create({ ...base, nombre_cliente: 'Hoy C', fecha_hora: new Date(`${hoy}T20:00:00-04:00`), estado: 'cancelada' });
    await ReservaItem.create({ reserva_id: a.id, producto_id: plato.id, nombre: 'Silpancho Reservas Test', cantidad: 3, precio: 40 });
    await ReservaItem.create({ reserva_id: b.id, producto_id: plato.id, nombre: 'Silpancho Reservas Test', cantidad: 5, precio: 40, nota: 'bien cocido' });
    await ReservaItem.create({ reserva_id: b.id, producto_id: bebida.id, nombre: 'Limonada Reservas Test', cantidad: 1, precio: 10.5 });
    await ReservaItem.create({ reserva_id: c.id, producto_id: plato.id, nombre: 'Silpancho Reservas Test', cantidad: 7, precio: 40 });
    const r = await request(app).get('/api/v1/reservas/hoy/platos').query({ fecha: hoy }).set(auth());
    expect(r.status).toBe(200);
    expect(r.body.datos.fecha).toBe(hoy);
    const nuestros = r.body.datos.totales.filter((t) => /Reservas Test$/.test(t.nombre));
    expect(nuestros[0]).toEqual({ nombre: 'Silpancho Reservas Test', cantidad: 8 });
    expect(nuestros[1]).toEqual({ nombre: 'Limonada Reservas Test', cantidad: 1 });
    const mias = r.body.datos.reservas.filter((x) => [a.id, b.id, c.id].includes(x.id));
    expect(mias.map((x) => x.id)).toEqual([b.id, a.id]);
    expect(mias[0]).toMatchObject({ hora: '19:30', nombre_cliente: 'Hoy B', personas: 2, mesa: null });
    expect(mias[0].items).toContainEqual({ nombre: 'Silpancho Reservas Test', cantidad: 5, nota: 'bien cocido' });
  });
});
