// backend/tests/estado_cocina.test.js
jest.mock('../src/integrations/codepay/codepay.client', () => ({
  generarQr: jest.fn(),
  consultarEstado: jest.fn(),
  verificarFirmaWebhook: jest.fn(),
}));

const request = require('supertest');
const app = require('../src/app');
const bcrypt = require('bcryptjs');
const codepayClientMock = require('../src/integrations/codepay/codepay.client');
const {
  Sucursal, Categoria, Producto, ProductoStockSucursal, Usuario, Rol,
  Caja, SesionCaja, Pedido, LibroCaja, Configuracion, PagoQr,
} = require('../src/models');

describe('estado_cocina — independiente del cobro', () => {
  let sucursalId, usuarioId, cajaId, sesionId, token, productoId, configFlujoOriginal;

  beforeAll(async () => {
    configFlujoOriginal = await Configuracion.findOne({ where: { clave: 'flujo_cocina' } });

    const sucursal = await Sucursal.create({ nombre: 'Sucursal Estado Cocina Test' });
    sucursalId = sucursal.id;
    const rol = await Rol.findOne({ where: { nombre: 'Cajero' } });
    const hash = await bcrypt.hash('clave123', 10);
    const usuario = await Usuario.create({ rol_id: rol.id, nombre: 'Estado Cocina Test', email: 'estado-cocina-test@restaurante.com', contrasena: hash });
    usuarioId = usuario.id;
    await usuario.addSucursal(sucursal);
    const login = await request(app).post('/api/v1/auth/login').send({ email: 'estado-cocina-test@restaurante.com', contrasena: 'clave123' });
    token = login.body.datos.token;

    const caja = await Caja.create({ sucursal_id: sucursalId, nombre: 'Caja Estado Cocina Test' });
    cajaId = caja.id;
    const sesion = await SesionCaja.create({ usuario_id: usuarioId, sucursal_id: sucursalId, caja_id: cajaId, monto_apertura: 0 });
    sesionId = sesion.id;

    const categoria = await Categoria.create({ nombre: 'Categoria Estado Cocina Test' });
    const producto = await Producto.create({ categoria_id: categoria.id, nombre: 'Producto Estado Cocina Test', precio: 10, stock: 0 });
    productoId = producto.id;
    await ProductoStockSucursal.create({ producto_id: productoId, sucursal_id: sucursalId, stock: 20 });
  });

  afterAll(async () => {
    await PagoQr.destroy({ where: { sucursal_id: sucursalId } });
    await Pedido.destroy({ where: { usuario_id: usuarioId } });
    await LibroCaja.destroy({ where: { usuario_id: usuarioId } });
    await SesionCaja.destroy({ where: { id: sesionId } });
    await Caja.destroy({ where: { id: cajaId } });
    await ProductoStockSucursal.destroy({ where: { producto_id: productoId } });
    await Producto.destroy({ where: { id: productoId } });
    await Usuario.destroy({ where: { id: usuarioId } });
    await Sucursal.destroy({ where: { id: sucursalId } });
    if (configFlujoOriginal) await Configuracion.upsert({ clave: 'flujo_cocina', valor: configFlujoOriginal.valor });
    else await Configuracion.destroy({ where: { clave: 'flujo_cocina' } });
  });

  it("crearCompleta con metodo_pago 'efectivo' y flujo_cocina 'digital' → estado_cocina 'pendiente' (el bug original)", async () => {
    await Configuracion.upsert({ clave: 'flujo_cocina', valor: 'digital' });
    const res = await request(app)
      .post('/api/v1/ventas/completa')
      .set('Authorization', `Bearer ${token}`)
      .send({
        tipo: 'llevar', items: [{ producto_id: productoId, cantidad: 1 }],
        metodo_pago: 'efectivo', monto_recibido: 10, sesion_caja_id: sesionId,
      });
    expect(res.status).toBe(201);
    expect(res.body.datos.estado).toBe('completado');
    expect(res.body.datos.estado_cocina).toBe('pendiente');
  });

  it("crearCompleta con flujo_cocina 'fisico' → estado_cocina queda NULL", async () => {
    await Configuracion.upsert({ clave: 'flujo_cocina', valor: 'fisico' });
    const res = await request(app)
      .post('/api/v1/ventas/completa')
      .set('Authorization', `Bearer ${token}`)
      .send({
        tipo: 'llevar', items: [{ producto_id: productoId, cantidad: 1 }],
        metodo_pago: 'efectivo', monto_recibido: 10, sesion_caja_id: sesionId,
      });
    expect(res.status).toBe(201);
    expect(res.body.datos.estado_cocina).toBeNull();
  });

  it("GET /ventas/cocina incluye un pedido completado (efectivo) con estado_cocina pendiente", async () => {
    await Configuracion.upsert({ clave: 'flujo_cocina', valor: 'digital' });
    const creado = await request(app)
      .post('/api/v1/ventas/completa')
      .set('Authorization', `Bearer ${token}`)
      .send({
        tipo: 'llevar', items: [{ producto_id: productoId, cantidad: 1 }],
        metodo_pago: 'efectivo', monto_recibido: 10, sesion_caja_id: sesionId,
      });
    expect(creado.body.datos.estado).toBe('completado');

    const res = await request(app)
      .get('/api/v1/ventas/cocina')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const ids = res.body.datos.map((p) => p.id);
    expect(ids).toContain(creado.body.datos.id);
  });

  it("GET /ventas/cocina NO incluye un pedido con flujo_cocina 'fisico' (estado_cocina NULL)", async () => {
    await Configuracion.upsert({ clave: 'flujo_cocina', valor: 'fisico' });
    const creado = await request(app)
      .post('/api/v1/ventas/completa')
      .set('Authorization', `Bearer ${token}`)
      .send({
        tipo: 'llevar', items: [{ producto_id: productoId, cantidad: 1 }],
        metodo_pago: 'efectivo', monto_recibido: 10, sesion_caja_id: sesionId,
      });

    const res = await request(app)
      .get('/api/v1/ventas/cocina')
      .set('Authorization', `Bearer ${token}`);
    const ids = res.body.datos.map((p) => p.id);
    expect(ids).not.toContain(creado.body.datos.id);
  });

  it("PATCH /ventas/:id/listo actualiza estado_cocina sin tocar estado", async () => {
    await Configuracion.upsert({ clave: 'flujo_cocina', valor: 'digital' });
    const creado = await request(app)
      .post('/api/v1/ventas/completa')
      .set('Authorization', `Bearer ${token}`)
      .send({
        tipo: 'llevar', items: [{ producto_id: productoId, cantidad: 1 }],
        metodo_pago: 'efectivo', monto_recibido: 10, sesion_caja_id: sesionId,
      });
    const pedidoId = creado.body.datos.id;

    const res = await request(app)
      .patch(`/api/v1/ventas/${pedidoId}/listo`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.datos.estado_cocina).toBe('listo');
    expect(res.body.datos.estado).toBe('completado'); // sin cambios — el cobro ya estaba hecho
  });

  it("PATCH /ventas/:id/listo sobre un pedido en modo fisico (estado_cocina NULL) → 409", async () => {
    await Configuracion.upsert({ clave: 'flujo_cocina', valor: 'fisico' });
    const creado = await request(app)
      .post('/api/v1/ventas/completa')
      .set('Authorization', `Bearer ${token}`)
      .send({
        tipo: 'llevar', items: [{ producto_id: productoId, cantidad: 1 }],
        metodo_pago: 'efectivo', monto_recibido: 10, sesion_caja_id: sesionId,
      });
    const pedidoId = creado.body.datos.id;

    const res = await request(app)
      .patch(`/api/v1/ventas/${pedidoId}/listo`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(409);
  });

  it("PATCH /ventas/:id/listo dos veces seguidas → la segunda da 409 (ya estaba listo)", async () => {
    await Configuracion.upsert({ clave: 'flujo_cocina', valor: 'digital' });
    const creado = await request(app)
      .post('/api/v1/ventas/completa')
      .set('Authorization', `Bearer ${token}`)
      .send({
        tipo: 'llevar', items: [{ producto_id: productoId, cantidad: 1 }],
        metodo_pago: 'efectivo', monto_recibido: 10, sesion_caja_id: sesionId,
      });
    const pedidoId = creado.body.datos.id;

    const primera = await request(app)
      .patch(`/api/v1/ventas/${pedidoId}/listo`)
      .set('Authorization', `Bearer ${token}`);
    expect(primera.status).toBe(200);

    const segunda = await request(app)
      .patch(`/api/v1/ventas/${pedidoId}/listo`)
      .set('Authorization', `Bearer ${token}`);
    expect(segunda.status).toBe(409);
  });

  it("agregarItem sobre un pedido de mesa que cocina ya marco listo lo reabre a pendiente", async () => {
    await Configuracion.upsert({ clave: 'flujo_cocina', valor: 'digital' });
    const Mesa = require('../src/models').Mesa;
    const Area = require('../src/models').Area;
    const area = await Area.create({ nombre: 'Area Estado Cocina Test', sucursal_id: sucursalId });
    const mesa = await Mesa.create({ nombre: 'Mesa Estado Cocina Test', area_id: area.id, sucursal_id: sucursalId, estado: 'disponible' });

    const abierto = await request(app)
      .post('/api/v1/ventas')
      .set('Authorization', `Bearer ${token}`)
      .send({ tipo: 'mesa', mesa_id: mesa.id, sesion_caja_id: sesionId });
    const pedidoId = abierto.body.datos.id;

    await request(app)
      .post(`/api/v1/ventas/${pedidoId}/items`)
      .set('Authorization', `Bearer ${token}`)
      .send({ producto_id: productoId, cantidad: 1 });

    await request(app)
      .patch(`/api/v1/ventas/${pedidoId}/listo`)
      .set('Authorization', `Bearer ${token}`);

    const res = await request(app)
      .post(`/api/v1/ventas/${pedidoId}/items`)
      .set('Authorization', `Bearer ${token}`)
      .send({ producto_id: productoId, cantidad: 1 });
    expect(res.status).toBe(201);

    const pedido = await Pedido.findByPk(pedidoId);
    expect(pedido.estado_cocina).toBe('pendiente');

    await Mesa.destroy({ where: { id: mesa.id } });
    await Area.destroy({ where: { id: area.id } });
  });

  it('tiempo de cocina: el reloj arranca con la primera comida, se guarda la ronda al marcar listo y una ronda nueva reinicia', async () => {
    await Configuracion.upsert({ clave: 'flujo_cocina', valor: 'digital' });
    const { Mesa, Area, CocinaTiempo } = require('../src/models');
    const reportesService = require('../src/modules/reportes/reportes.service');
    const area = await Area.create({ nombre: 'Area Reloj Cocina Test', sucursal_id: sucursalId });
    const mesa = await Mesa.create({ nombre: 'Mesa Reloj Cocina Test', area_id: area.id, sucursal_id: sucursalId, estado: 'disponible' });
    const auth = { Authorization: `Bearer ${token}` };

    const abierto = await request(app).post('/api/v1/ventas').set(auth).send({ tipo: 'mesa', mesa_id: mesa.id, sesion_caja_id: sesionId });
    const pedidoId = abierto.body.datos.id;
    // Mesa recién abierta, sin comida: el reloj no corre todavía.
    expect((await Pedido.findByPk(pedidoId)).cocina_desde).toBeNull();

    await request(app).post(`/api/v1/ventas/${pedidoId}/items`).set(auth).send({ producto_id: productoId, cantidad: 1 });
    const primera = (await Pedido.findByPk(pedidoId)).cocina_desde;
    expect(primera).not.toBeNull();

    // Una segunda comida en la misma ronda no reinicia el reloj.
    await request(app).post(`/api/v1/ventas/${pedidoId}/items`).set(auth).send({ producto_id: productoId, cantidad: 1 });
    expect((await Pedido.findByPk(pedidoId)).cocina_desde.getTime()).toBe(primera.getTime());

    const enCocina = await reportesService.tiemposCocina({}, { acceso_todas: false, sucursal_id: sucursalId });
    expect(enCocina.esperando.map((e) => e.id)).toContain(pedidoId);
    expect(enCocina.esperando.find((e) => e.id === pedidoId).mesa).toBe('Mesa Reloj Cocina Test');

    await request(app).patch(`/api/v1/ventas/${pedidoId}/listo`).set(auth);
    const rondas = await CocinaTiempo.findAll({ where: { pedido_id: pedidoId } });
    expect(rondas).toHaveLength(1);
    expect(rondas[0].sucursal_id).toBe(sucursalId);
    expect((await Pedido.findByPk(pedidoId)).cocina_desde).toBeNull();

    const resumen = await reportesService.tiemposCocina({}, { acceso_todas: false, sucursal_id: sucursalId });
    expect(resumen.cantidad).toBeGreaterThanOrEqual(1);
    expect(resumen.promedio_seg).not.toBeNull();
    expect(resumen.esperando.map((e) => e.id)).not.toContain(pedidoId);

    // Algo nuevo sobre un pedido listo: vuelve a cocina con reloj nuevo.
    await request(app).post(`/api/v1/ventas/${pedidoId}/items`).set(auth).send({ producto_id: productoId, cantidad: 1 });
    const reabierto = await Pedido.findByPk(pedidoId);
    expect(reabierto.estado_cocina).toBe('pendiente');
    expect(reabierto.cocina_desde).not.toBeNull();

    // Otra sucursal no ve este pedido esperando.
    const otra = await reportesService.tiemposCocina({}, { acceso_todas: false, sucursal_id: 1 });
    expect(otra.esperando.map((e) => e.id)).not.toContain(pedidoId);

    await Pedido.destroy({ where: { id: pedidoId } });
    await Mesa.destroy({ where: { id: mesa.id } });
    await Area.destroy({ where: { id: area.id } });
  });

  it("agregarItem con producto invalido sobre un pedido listo NO lo reabre (I2)", async () => {
    await Configuracion.upsert({ clave: 'flujo_cocina', valor: 'digital' });
    const Mesa = require('../src/models').Mesa;
    const Area = require('../src/models').Area;
    const area = await Area.create({ nombre: 'Area I2 Test', sucursal_id: sucursalId });
    const mesa = await Mesa.create({ nombre: 'Mesa I2 Test', area_id: area.id, sucursal_id: sucursalId, estado: 'disponible' });

    const abierto = await request(app)
      .post('/api/v1/ventas')
      .set('Authorization', `Bearer ${token}`)
      .send({ tipo: 'mesa', mesa_id: mesa.id, sesion_caja_id: sesionId });
    const pedidoId = abierto.body.datos.id;

    await request(app)
      .post(`/api/v1/ventas/${pedidoId}/items`)
      .set('Authorization', `Bearer ${token}`)
      .send({ producto_id: productoId, cantidad: 1 });

    await request(app)
      .patch(`/api/v1/ventas/${pedidoId}/listo`)
      .set('Authorization', `Bearer ${token}`);

    const res = await request(app)
      .post(`/api/v1/ventas/${pedidoId}/items`)
      .set('Authorization', `Bearer ${token}`)
      .send({ producto_id: 999999999, cantidad: 1 });
    expect(res.status).toBe(404);

    const pedido = await Pedido.findByPk(pedidoId);
    expect(pedido.estado_cocina).toBe('listo');

    await Mesa.destroy({ where: { id: mesa.id } });
    await Area.destroy({ where: { id: area.id } });
  });

  it("cancelar limpia estado_cocina junto con estado", async () => {
    await Configuracion.upsert({ clave: 'flujo_cocina', valor: 'digital' });
    const Mesa = require('../src/models').Mesa;
    const Area = require('../src/models').Area;
    const area = await Area.create({ nombre: 'Area Estado Cocina Cancelar Test', sucursal_id: sucursalId });
    const mesa = await Mesa.create({ nombre: 'Mesa Estado Cocina Cancelar Test', area_id: area.id, sucursal_id: sucursalId, estado: 'disponible' });

    const abierto = await request(app)
      .post('/api/v1/ventas')
      .set('Authorization', `Bearer ${token}`)
      .send({ tipo: 'mesa', mesa_id: mesa.id, sesion_caja_id: sesionId });
    const pedidoId = abierto.body.datos.id;

    const res = await request(app)
      .post(`/api/v1/ventas/${pedidoId}/cancelar`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);

    const pedido = await Pedido.findByPk(pedidoId);
    expect(pedido.estado).toBe('cancelado');
    expect(pedido.estado_cocina).toBeNull();

    await Mesa.destroy({ where: { id: mesa.id } });
    await Area.destroy({ where: { id: area.id } });
  });

  it("un pago QR de autoservicio abandonado limpia estado_cocina al cancelarse (C2)", async () => {
    await Configuracion.upsert({ clave: 'flujo_cocina', valor: 'digital' });
    const Mesa = require('../src/models').Mesa;
    const Area = require('../src/models').Area;
    const PagoQr = require('../src/models').PagoQr;
    const area = await Area.create({ nombre: 'Area C2 Test', sucursal_id: sucursalId });
    const mesa = await Mesa.create({ nombre: 'Mesa C2 Test', area_id: area.id, sucursal_id: sucursalId, estado: 'disponible' });

    codepayClientMock.generarQr.mockResolvedValue({
      qr_code: 'data:image/png;base64,abc', tx_id: 'tx_qr_c2', amount: 10.35, net_amount: 10, commission_amount: 0.35,
    });

    const creado = await request(app)
      .post('/api/v1/ventas/completa')
      .set('Authorization', `Bearer ${token}`)
      .send({
        tipo: 'mesa', mesa_id: mesa.id, items: [{ producto_id: productoId, cantidad: 1 }],
        metodo_pago: 'qr', sesion_caja_id: sesionId, origen: 'autoservicio',
      });
    expect(creado.status).toBe(201);
    const pedidoId = creado.body.datos.pedido.id;
    expect(creado.body.datos.pedido.estado_cocina).toBe('pendiente');

    const pagoQr = await PagoQr.findOne({ where: { pedido_id: pedidoId } });
    expect(pagoQr).not.toBeNull();

    const res = await request(app)
      .post(`/api/v1/ventas/${pedidoId}/pago-qr/cancelar`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);

    const pedido = await Pedido.findByPk(pedidoId);
    expect(pedido.estado).toBe('cancelado');
    expect(pedido.estado_cocina).toBeNull();

    await Mesa.destroy({ where: { id: mesa.id } });
    await Area.destroy({ where: { id: area.id } });
  });

  it("cobrar limpia estado_cocina de una mesa que cocina ya marco lista (C1, caso cubierto)", async () => {
    await Configuracion.upsert({ clave: 'flujo_cocina', valor: 'digital' });
    const Mesa = require('../src/models').Mesa;
    const Area = require('../src/models').Area;
    const area = await Area.create({ nombre: 'Area C1 Test', sucursal_id: sucursalId });
    const mesa = await Mesa.create({ nombre: 'Mesa C1 Test', area_id: area.id, sucursal_id: sucursalId, estado: 'disponible' });

    const abierto = await request(app)
      .post('/api/v1/ventas')
      .set('Authorization', `Bearer ${token}`)
      .send({ tipo: 'mesa', mesa_id: mesa.id, sesion_caja_id: sesionId });
    const pedidoId = abierto.body.datos.id;

    await request(app)
      .post(`/api/v1/ventas/${pedidoId}/items`)
      .set('Authorization', `Bearer ${token}`)
      .send({ producto_id: productoId, cantidad: 1 });

    await request(app)
      .patch(`/api/v1/ventas/${pedidoId}/listo`)
      .set('Authorization', `Bearer ${token}`);

    const res = await request(app)
      .post(`/api/v1/ventas/${pedidoId}/cobrar`)
      .set('Authorization', `Bearer ${token}`)
      .send({ metodo_pago: 'efectivo', monto_recibido: 100 });
    expect(res.status).toBe(200);

    const pedido = await Pedido.findByPk(pedidoId);
    expect(pedido.estado).toBe('completado');
    expect(pedido.estado_cocina).toBeNull();

    await Mesa.destroy({ where: { id: mesa.id } });
    await Area.destroy({ where: { id: area.id } });
  });

  it("marcarEntregado limpia estado_cocina de un pedido listo (venta instantanea de mostrador)", async () => {
    await Configuracion.upsert({ clave: 'flujo_cocina', valor: 'digital' });
    const creado = await request(app)
      .post('/api/v1/ventas/completa')
      .set('Authorization', `Bearer ${token}`)
      .send({
        tipo: 'llevar', items: [{ producto_id: productoId, cantidad: 1 }],
        metodo_pago: 'efectivo', monto_recibido: 10, sesion_caja_id: sesionId,
      });
    const pedidoId = creado.body.datos.id;
    expect(creado.body.datos.estado).toBe('completado');
    expect(creado.body.datos.estado_cocina).toBe('pendiente');

    await request(app)
      .patch(`/api/v1/ventas/${pedidoId}/listo`)
      .set('Authorization', `Bearer ${token}`);

    const res = await request(app)
      .patch(`/api/v1/ventas/${pedidoId}/entregado`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.datos.estado_cocina).toBeNull();
    expect(res.body.datos.estado).toBe('completado'); // sin cambios

    const listado = await request(app)
      .get('/api/v1/ventas/cocina')
      .set('Authorization', `Bearer ${token}`);
    const ids = listado.body.datos.map((p) => p.id);
    expect(ids).not.toContain(pedidoId);
  });

  it("marcarEntregado sobre un pedido con estado_cocina ya NULL -> 409", async () => {
    await Configuracion.upsert({ clave: 'flujo_cocina', valor: 'fisico' });
    const creado = await request(app)
      .post('/api/v1/ventas/completa')
      .set('Authorization', `Bearer ${token}`)
      .send({
        tipo: 'llevar', items: [{ producto_id: productoId, cantidad: 1 }],
        metodo_pago: 'efectivo', monto_recibido: 10, sesion_caja_id: sesionId,
      });
    const pedidoId = creado.body.datos.id;
    expect(creado.body.datos.estado_cocina).toBeNull();

    const res = await request(app)
      .patch(`/api/v1/ventas/${pedidoId}/entregado`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(409);
  });

  it("marcarEntregado sin token -> 401", async () => {
    const res = await request(app).patch('/api/v1/ventas/1/entregado');
    expect(res.status).toBe(401);
  });
});
