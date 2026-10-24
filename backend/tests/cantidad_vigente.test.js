// backend/tests/cantidad_vigente.test.js
jest.mock('../src/integrations/codepay/codepay.client', () => ({
  generarQr: jest.fn(),
  consultarEstado: jest.fn(),
  verificarFirmaWebhook: jest.fn(),
}));

const request = require('supertest');
const app = require('../src/app');
const bcrypt = require('bcryptjs');
const {
  Sucursal, Area, Mesa, Categoria, Producto, ProductoStockSucursal, Usuario, Rol,
  Caja, SesionCaja, Pedido, DetallePedido, LibroCaja, RegistroInventario, Configuracion,
} = require('../src/models');
const { cantidadVigente } = require('../src/modules/devoluciones/calculo');
const ventasService = require('../src/modules/ventas/ventas.service');
const reportesService = require('../src/modules/reportes/reportes.service');
const cajaService = require('../src/modules/caja/caja.service');

describe('cantidad vigente (cantidad - cantidad_anulada)', () => {
  let sucursalId, usuarioId, cajaId, sesionId, token, mesaId, productoId, otroId, configFlujoOriginal;
  const api = (m, url) => request(app)[m](`/api/v1${url}`).set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    configFlujoOriginal = await Configuracion.findOne({ where: { clave: 'flujo_cocina' } });
    await Configuracion.upsert({ clave: 'flujo_cocina', valor: 'digital' });
    const sucursal = await Sucursal.create({ nombre: 'Sucursal Vigente Test' });
    sucursalId = sucursal.id;
    const area = await Area.create({ nombre: 'Area Vigente Test', sucursal_id: sucursalId });
    mesaId = (await Mesa.create({ area_id: area.id, nombre: 'Mesa Vigente Test' })).id;
    const rol = await Rol.findOne({ where: { nombre: 'Cajero' } });
    const hash = await bcrypt.hash('clave123', 10);
    const usuario = await Usuario.create({ rol_id: rol.id, nombre: 'Vigente Test', email: 'vigente-test@restaurante.com', contrasena: hash });
    usuarioId = usuario.id;
    await usuario.addSucursal(sucursal);
    const login = await request(app).post('/api/v1/auth/login').send({ email: 'vigente-test@restaurante.com', contrasena: 'clave123' });
    token = login.body.datos.token;
    cajaId = (await Caja.create({ sucursal_id: sucursalId, nombre: 'Caja Vigente Test' })).id;
    sesionId = (await SesionCaja.create({ usuario_id: usuarioId, sucursal_id: sucursalId, caja_id: cajaId, monto_apertura: 0 })).id;
    const categoria = await Categoria.create({ nombre: 'Categoria Vigente Test' });
    productoId = (await Producto.create({ categoria_id: categoria.id, nombre: 'Producto Vigente Test', precio: 10, stock: 0 })).id;
    otroId = (await Producto.create({ categoria_id: categoria.id, nombre: 'Otro Vigente Test', precio: 7, stock: 0 })).id;
    await ProductoStockSucursal.create({ producto_id: productoId, sucursal_id: sucursalId, stock: 20 });
    await ProductoStockSucursal.create({ producto_id: otroId, sucursal_id: sucursalId, stock: 20 });
  });

  afterAll(async () => {
    const pedidos = await Pedido.findAll({ where: { usuario_id: usuarioId }, attributes: ['id'] });
    await DetallePedido.destroy({ where: { pedido_id: pedidos.map((p) => p.id) } });
    await RegistroInventario.destroy({ where: { usuario_id: usuarioId } });
    await Pedido.destroy({ where: { usuario_id: usuarioId } });
    await LibroCaja.destroy({ where: { usuario_id: usuarioId } });
    await SesionCaja.destroy({ where: { id: sesionId } });
    await Caja.destroy({ where: { id: cajaId } });
    await ProductoStockSucursal.destroy({ where: { producto_id: [productoId, otroId] } });
    await Producto.destroy({ where: { id: [productoId, otroId] } });
    await Usuario.destroy({ where: { id: usuarioId } });
    await Mesa.destroy({ where: { id: mesaId } });
    await Area.destroy({ where: { sucursal_id: sucursalId } });
    await Sucursal.destroy({ where: { id: sucursalId } });
    if (configFlujoOriginal) await Configuracion.upsert({ clave: 'flujo_cocina', valor: configFlujoOriginal.valor });
    else await Configuracion.destroy({ where: { clave: 'flujo_cocina' } });
  });

  // Pedido de mesa con 3 x producto (2 anuladas) y 1 x otro (totalmente anulado)
  async function pedidoConAnulaciones() {
    const ped = await api('post', '/ventas').send({ mesa_id: mesaId, tipo: 'mesa', sesion_caja_id: sesionId });
    expect(ped.status).toBe(201);
    const id = ped.body.datos.id;
    const l1 = await api('post', `/ventas/${id}/items`).send({ producto_id: productoId, cantidad: 3 });
    expect(l1.status).toBe(201);
    await DetallePedido.update({ cantidad_anulada: 2 }, { where: { id: l1.body.datos.id } });
    const l2 = await api('post', `/ventas/${id}/items`).send({ producto_id: otroId, cantidad: 1 });
    expect(l2.status).toBe(201);
    await DetallePedido.update({ cantidad_anulada: 1 }, { where: { id: l2.body.datos.id } });
    const l3 = await api('post', `/ventas/${id}/items`).send({ producto_id: otroId, cantidad: 2 });
    expect(l3.status).toBe(201);
    return { id, l1: l1.body.datos.id, l2: l2.body.datos.id };
  }

  it('cantidadVigente resta lo anulado', () => {
    expect(cantidadVigente({ cantidad: 3, cantidad_anulada: 2 })).toBe(1);
    expect(cantidadVigente({ cantidad: 3 })).toBe(3);
  });

  it('_recalcularTotal usa solo la cantidad vigente', async () => {
    const { id } = await pedidoConAnulaciones();
    const p = await Pedido.findByPk(id);
    expect(parseFloat(p.total)).toBe(10 + 14);
  });

  it('cobrar descuenta del stock solo la cantidad vigente', async () => {
    const { id } = await pedidoConAnulaciones();
    const antes = (await ProductoStockSucursal.findOne({ where: { producto_id: productoId, sucursal_id: sucursalId } })).stock;
    const antesOtro = (await ProductoStockSucursal.findOne({ where: { producto_id: otroId, sucursal_id: sucursalId } })).stock;
    const res = await api('post', `/ventas/${id}/cobrar`).send({ metodo_pago: 'efectivo', monto_recibido: 100 });
    expect(res.status).toBe(200);
    const despues = (await ProductoStockSucursal.findOne({ where: { producto_id: productoId, sucursal_id: sucursalId } })).stock;
    const despuesOtro = (await ProductoStockSucursal.findOne({ where: { producto_id: otroId, sucursal_id: sucursalId } })).stock;
    expect(antes - despues).toBe(1);
    expect(antesOtro - despuesOtro).toBe(2);
  });

  it('GET /ventas/cocina muestra cantidad vigente y oculta líneas totalmente anuladas', async () => {
    const { id, l1, l2 } = await pedidoConAnulaciones();
    await Pedido.update({ estado_cocina: 'pendiente' }, { where: { id } });
    const datos = await ventasService.listarCocina({ sucursal_id: sucursalId });
    const pedido = datos.find((p) => p.id === id);
    const linea1 = pedido.detalles.find((d) => d.id === l1);
    expect(linea1.cantidad).toBe(1);
    expect(pedido.detalles.find((d) => d.id === l2)).toBeUndefined();
  });

  it('PUT y DELETE de ítems sobre un pedido completado → 409', async () => {
    const { id, l1 } = await pedidoConAnulaciones();
    const cobro = await api('post', `/ventas/${id}/cobrar`).send({ metodo_pago: 'efectivo', monto_recibido: 100 });
    expect(cobro.status).toBe(200);
    const put = await api('put', `/ventas/${id}/items/${l1}`).send({ cantidad: 5 });
    expect(put.status).toBe(409);
    const del = await api('delete', `/ventas/${id}/items/${l1}`);
    expect(del.status).toBe(409);
  });

  it('reportes (ventasProductos, ventasVariantes) y caja.reporte cuentan solo lo vigente', async () => {
    // Otros tests ya dejaron pedidos completados en la sucursal: se compara por delta.
    const alcance = { acceso_todas: false, sucursal_id: sucursalId };
    const leer = async () => {
      const prod = await reportesService.ventasProductos({}, alcance);
      const vars = await reportesService.ventasVariantes({}, alcance);
      const rep = await cajaService.reporte(sesionId, { acceso_todas: true });
      const get = (arr, f) => arr.find(f) || {};
      return {
        p: get(prod, (x) => x.id === productoId), o: get(prod, (x) => x.id === otroId),
        vp: get(vars, (x) => x.nombre === 'Producto Vigente Test'), vo: get(vars, (x) => x.nombre === 'Otro Vigente Test'),
        cp: get(rep.productos_vendidos, (x) => x.nombre === 'Producto Vigente Test'),
      };
    };
    const antes = await leer();
    const { id } = await pedidoConAnulaciones();
    const cobro = await api('post', `/ventas/${id}/cobrar`).send({ metodo_pago: 'efectivo', monto_recibido: 100 });
    expect(cobro.status).toBe(200);
    const despues = await leer();
    const d = (k, c) => parseFloat(despues[k][c] || 0) - parseFloat(antes[k][c] || 0);

    expect(d('p', 'cantidad')).toBe(1);
    expect(d('p', 'monto')).toBe(10);
    expect(d('o', 'cantidad')).toBe(2);
    expect(d('o', 'monto')).toBe(14);
    expect(d('vp', 'cantidad')).toBe(1);
    expect(d('vp', 'monto')).toBe(10);
    expect(d('vo', 'cantidad')).toBe(2);
    expect(d('vo', 'ventas')).toBe(1);
    expect(d('cp', 'total_cantidad')).toBe(1);
    expect(d('cp', 'total')).toBe(10);
  });
});
