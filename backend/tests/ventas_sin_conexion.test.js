// Ventas hechas sin internet que la caja sube después: no se duplican, quedan
// con su hora, se aceptan aunque la caja ya se cerró y solo efectivo/llevar.
const request = require('supertest');
const app = require('../src/app');
const bcrypt = require('bcryptjs');
const {
  Sucursal, Categoria, Producto, ProductoStockSucursal, Usuario, Rol,
  Caja, SesionCaja, Pedido, LibroCaja, Configuracion,
} = require('../src/models');

describe('Ventas sin internet', () => {
  let sucursal, usuario, otroUsuario, caja, sesion, categoria, producto, token, tokenOtro, flujoOriginal;
  const auth = (t = token) => ({ Authorization: `Bearer ${t}` });
  const subir = (body, t) => request(app).post('/api/v1/ventas/completa').set(auth(t)).send({
    tipo: 'llevar', items: [{ producto_id: producto.id, cantidad: 2 }], metodo_pago: 'efectivo', monto_recibido: 50,
    sesion_caja_id: sesion.id, sin_conexion: true, ...body,
  });

  beforeAll(async () => {
    flujoOriginal = await Configuracion.findOne({ where: { clave: 'flujo_cocina' } });
    await Configuracion.upsert({ clave: 'flujo_cocina', valor: 'digital' });
    sucursal = await Sucursal.create({ nombre: 'Sucursal Sin Conexion Test' });
    const rol = await Rol.findOne({ where: { nombre: 'Cajero' } });
    const hash = await bcrypt.hash('clave123', 10);
    usuario = await Usuario.create({ rol_id: rol.id, nombre: 'Sin Conexion Test', email: 'sin-conexion-test@restaurante.com', contrasena: hash });
    otroUsuario = await Usuario.create({ rol_id: rol.id, nombre: 'Sin Conexion Otro', email: 'sin-conexion-otro@restaurante.com', contrasena: hash });
    await usuario.addSucursal(sucursal);
    await otroUsuario.addSucursal(sucursal);
    token = (await request(app).post('/api/v1/auth/login').send({ email: 'sin-conexion-test@restaurante.com', contrasena: 'clave123' })).body.datos.token;
    tokenOtro = (await request(app).post('/api/v1/auth/login').send({ email: 'sin-conexion-otro@restaurante.com', contrasena: 'clave123' })).body.datos.token;
    caja = await Caja.create({ sucursal_id: sucursal.id, nombre: 'Caja Sin Conexion Test' });
    sesion = await SesionCaja.create({ usuario_id: usuario.id, sucursal_id: sucursal.id, caja_id: caja.id, monto_apertura: 0 });
    categoria = await Categoria.create({ nombre: 'Categoria Sin Conexion Test' });
    producto = await Producto.create({ categoria_id: categoria.id, nombre: 'Salteña Sin Conexion Test', precio: 10, stock: 0 });
    await ProductoStockSucursal.create({ producto_id: producto.id, sucursal_id: sucursal.id, stock: 50 });
  });

  afterAll(async () => {
    await Pedido.destroy({ where: { usuario_id: [usuario.id, otroUsuario.id] } });
    await LibroCaja.destroy({ where: { usuario_id: [usuario.id, otroUsuario.id] } });
    await SesionCaja.destroy({ where: { caja_id: caja.id } });
    await Caja.destroy({ where: { id: caja.id } });
    await ProductoStockSucursal.destroy({ where: { producto_id: producto.id } });
    await Producto.destroy({ where: { id: producto.id } });
    await Categoria.destroy({ where: { id: categoria.id } });
    await Usuario.destroy({ where: { id: [usuario.id, otroUsuario.id] } });
    await Sucursal.destroy({ where: { id: sucursal.id } });
    if (flujoOriginal) await Configuracion.upsert({ clave: 'flujo_cocina', valor: flujoOriginal.valor });
    else await Configuracion.destroy({ where: { clave: 'flujo_cocina' } });
  });

  it('registra la venta con la hora en que se hizo, sin ticket y fuera de la pantalla de cocina', async () => {
    const vendido_en = new Date(Date.now() - 40 * 60000).toISOString();
    const r = await subir({ clave_offline: 'off-hora-1', vendido_en });
    expect(r.status).toBe(201);
    expect(r.body.datos).toMatchObject({ estado: 'completado', sin_conexion: true, clave_offline: 'off-hora-1', estado_cocina: null, datos_impresion: null });
    expect(Number(r.body.datos.cambio)).toBe(30);
    const p = await Pedido.findByPk(r.body.datos.id);
    expect(Math.abs(new Date(p.creado_en).getTime() - new Date(vendido_en).getTime())).toBeLessThan(1000);
  });

  it('la misma venta subida dos veces se registra una sola vez', async () => {
    const a = await subir({ clave_offline: 'off-doble-1' });
    const b = await subir({ clave_offline: 'off-doble-1' });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(b.body.datos.id).toBe(a.body.datos.id);
    expect(b.body.datos.repetida).toBe(true);
    expect(await Pedido.count({ where: { clave_offline: 'off-doble-1' } })).toBe(1);
    expect(await LibroCaja.count({ where: { concepto: `Venta #${a.body.datos.id}` } })).toBe(1);
  });

  it('una venta con internet que trae su clave tampoco se duplica al reintentarla', async () => {
    const a = await subir({ clave_offline: 'off-online-1', sin_conexion: false });
    const b = await subir({ clave_offline: 'off-online-1' });
    expect(a.status).toBe(201);
    expect(a.body.datos.sin_conexion).toBe(false);
    expect(b.body.datos.id).toBe(a.body.datos.id);
  });

  it('se acepta aunque la caja ya se cerró, y el ingreso cae en la caja abierta', async () => {
    const vieja = await SesionCaja.create({ usuario_id: usuario.id, sucursal_id: sucursal.id, caja_id: caja.id, monto_apertura: 0, estado: 'cerrada' });
    const r = await subir({ clave_offline: 'off-cerrada-1', sesion_caja_id: vieja.id });
    expect(r.status).toBe(201);
    expect(r.body.datos.sesion_caja_id).toBe(vieja.id);
    const asiento = await LibroCaja.findOne({ where: { concepto: `Venta #${r.body.datos.id}` } });
    expect(asiento.sesion_caja_id).toBe(sesion.id);
  });

  it('si el precio subió mientras no había internet, la venta entra igual', async () => {
    await producto.update({ precio: 12 });
    const r = await subir({ clave_offline: 'off-precio-1', monto_recibido: 20 });
    await producto.update({ precio: 10 });
    expect(r.status).toBe(201);
    expect(Number(r.body.datos.total)).toBe(24);
  });

  it('solo efectivo y para llevar, con su clave, en la caja propia', async () => {
    expect((await subir({ clave_offline: 'off-mal-1', tipo: 'delivery', direccion_entrega: 'x' })).status).toBe(400);
    expect((await subir({ clave_offline: 'off-mal-2', metodo_pago: 'qr' })).status).toBe(400);
    expect((await subir({ clave_offline: null })).status).toBe(400);
    expect((await subir({ clave_offline: 'off-mal-3' }, tokenOtro)).status).toBe(403);
    expect(await Pedido.count({ where: { clave_offline: ['off-mal-1', 'off-mal-2', 'off-mal-3'] } })).toBe(0);
  });

  it('una clave que subió otra persona no devuelve su venta', async () => {
    const r = await subir({ clave_offline: 'off-hora-1', sin_conexion: false }, tokenOtro);
    expect(r.status).toBe(409);
  });
});
