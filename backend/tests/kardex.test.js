// Kardex: cada movimiento valorizado a costo promedio ponderado.
const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const { Sucursal, Usuario, Rol, Insumo, InsumoMovimiento, InsumoStockSucursal, Compra, DetalleCompra } = require('../src/models');
const { _valorizar } = require('../src/modules/kardex/kardex.service');

describe('valorización (costo promedio ponderado)', () => {
  const mov = (id, anterior, nuevo, tipo, nota, fecha = `2026-10-0${id} 10:00:00`) => ({ id, tipo, stock_anterior: anterior, stock_nuevo: nuevo, nota, fecha });
  const compras = { costo: new Map([['1:7', 10], ['2:7', 13]]), de: new Map([[1, 'Avícola'], [2, 'Avícola']]), primera: new Map([[7, 10]]) };

  it('compra a su costo, venta al promedio, el promedio cambia solo con entradas', () => {
    const f = _valorizar([
      mov(1, 0, 10, 'compra', 'Compra #1'), // 10 u a 10 → saldo 100
      mov(2, 10, 6, 'consumo_venta', 'Venta #5'), // salen 4 a 10 → saldo 60
      mov(3, 6, 12, 'compra', 'Compra #2'), // entran 6 a 13 → 60 + 78 = 138 / 12 = 11.5
      mov(4, 12, 10, 'consumo_venta', 'Venta #6'), // salen 2 a 11.5 → 115
    ], compras, 7);
    expect(f.map((x) => x.saldo)).toEqual([10, 6, 12, 10]);
    expect(f.map((x) => x.saldo_valor)).toEqual([100, 60, 138, 115]);
    expect(f[2].costo_promedio).toBe(11.5);
    expect(f[3]).toMatchObject({ salida: 2, costo_unitario: 11.5, salida_valor: 23 });
    expect(f[0].detalle).toBe('Compra #1 · Avícola');
  });

  it('un conteo que sobra entra al promedio y uno que falta sale al promedio', () => {
    const f = _valorizar([
      mov(1, 0, 10, 'compra', 'Compra #1'),
      mov(2, 10, 12, 'ajuste', 'Conteo semanal'), // sobran 2 a 10
      mov(3, 12, 9, 'ajuste', null), // faltan 3 a 10
    ], compras, 7);
    expect(f[1]).toMatchObject({ entrada: 2, entrada_valor: 20, saldo_valor: 120, detalle: 'Conteo semanal (sobró)', motivo: 'ajuste' });
    expect(f[2]).toMatchObject({ salida: 3, salida_valor: 30, saldo_valor: 90, detalle: 'Conteo de inventario (faltó)' });
  });

  it('el inventario inicial sin costo toma el de la primera compra', () => {
    const f = _valorizar([mov(1, 0, 5, 'ajuste', 'Inventario inicial'), mov(2, 5, 3, 'consumo_venta', 'Venta #1')], compras, 7);
    expect(f[0]).toMatchObject({ detalle: 'Inventario inicial', entrada_valor: 50 });
    expect(f[1].salida_valor).toBe(20);
  });
});

describe('Kardex (API)', () => {
  let sucursal, usuario, cajero, insumo, compra, token, tokenCajero;
  const auth = (t) => ({ Authorization: `Bearer ${t}` });

  beforeAll(async () => {
    sucursal = await Sucursal.create({ nombre: 'Sucursal Kardex Test' });
    const clave = await bcrypt.hash('clave123', 10);
    const admin = await Rol.findOne({ where: { nombre: 'Administrador' } });
    const rolSin = await Rol.create({ nombre: 'Sin inventario Kardex Test' });
    usuario = await Usuario.create({ rol_id: admin.id, nombre: 'Kardex Test', email: 'kardex-test@restaurante.com', contrasena: clave });
    cajero = await Usuario.create({ rol_id: rolSin.id, nombre: 'Kardex Sin Permiso', email: 'kardex-sin@restaurante.com', contrasena: clave });
    await usuario.addSucursal(sucursal);
    await cajero.addSucursal(sucursal);
    const login = async (email) => (await request(app).post('/api/v1/auth/login').send({ email, contrasena: 'clave123' })).body.datos.token;
    token = await login(usuario.email);
    tokenCajero = await login(cajero.email);
    insumo = await Insumo.create({ nombre: 'Pollo Kardex Test', unidad_medida: 'kilogramo' });
    compra = await Compra.create({ sucursal_id: sucursal.id, usuario_id: usuario.id, total: 200, estado: 'recibido' });
    await DetalleCompra.create({ compra_id: compra.id, insumo_id: insumo.id, cantidad: 10, costo_unitario: 20, subtotal: 200 });
    const m = (anterior, nuevo, tipo, nota, creado_en) => InsumoMovimiento.create({
      insumo_id: insumo.id, sucursal_id: sucursal.id, usuario_id: usuario.id, tipo, cantidad: Math.abs(nuevo - anterior), stock_anterior: anterior, stock_nuevo: nuevo, nota, creado_en: new Date(creado_en),
    });
    await m(0, 10, 'compra', `Compra #${compra.id}`, '2026-09-30T12:00:00-04:00');
    await m(10, 8, 'consumo_venta', 'Venta #1', '2026-10-02T12:00:00-04:00');
    await m(8, 7.5, 'consumo_venta', 'Venta #2', '2026-10-03T12:00:00-04:00');
    await InsumoStockSucursal.create({ insumo_id: insumo.id, sucursal_id: sucursal.id, stock: 7.5 });
  });

  afterAll(async () => {
    await InsumoMovimiento.destroy({ where: { insumo_id: insumo.id } });
    await InsumoStockSucursal.destroy({ where: { insumo_id: insumo.id } });
    await DetalleCompra.destroy({ where: { compra_id: compra.id } });
    await Compra.destroy({ where: { id: compra.id } });
    await Insumo.destroy({ where: { id: insumo.id } });
    await Usuario.destroy({ where: { id: [usuario.id, cajero.id] } });
    await Rol.destroy({ where: { nombre: 'Sin inventario Kardex Test' } });
    await Sucursal.destroy({ where: { id: sucursal.id } });
  });

  it('el detalle trae el saldo inicial del período, cada movimiento y los totales', async () => {
    const r = await request(app).get(`/api/v1/kardex/insumo/${insumo.id}`).query({ desde: '2026-10-01', hasta: '2026-10-31' }).set(auth(token));
    expect(r.status).toBe(200);
    expect(r.body.datos.inicial).toMatchObject({ cantidad: 10, valor: 200, costo_promedio: 20 });
    expect(r.body.datos.movimientos).toHaveLength(2);
    expect(r.body.datos.final).toMatchObject({ cantidad: 7.5, valor: 150 });
    expect(r.body.datos.totales).toMatchObject({ salidas: 2.5, salidas_valor: 50, ventas_valor: 50, compras_valor: 0 });
  });

  it('el resumen valoriza todo el inventario', async () => {
    const r = await request(app).get('/api/v1/kardex').query({ desde: '2026-09-01', hasta: '2026-09-30', clase: 'insumo' }).set(auth(token));
    expect(r.status).toBe(200);
    const it = r.body.datos.items.find((i) => i.id === insumo.id);
    expect(it).toMatchObject({ unidad: 'kg', inicial: { cantidad: 0 }, final: { cantidad: 10, valor: 200 } });
    expect(it.totales.compras_valor).toBe(200);
  });

  it('sin permiso de insumos ni inventario no entra; fechas al revés dan error', async () => {
    expect((await request(app).get('/api/v1/kardex').set(auth(tokenCajero))).status).toBe(403);
    expect((await request(app).get('/api/v1/kardex').query({ desde: '2026-10-31', hasta: '2026-10-01' }).set(auth(token))).status).toBe(400);
  });
});
