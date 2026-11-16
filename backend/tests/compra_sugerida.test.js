// Compra sugerida (insumos en su mínimo, agrupados por proveedor) y aviso de
// platos con poco margen.
const request = require('supertest');
const app = require('../src/app');
const {
  Sucursal, Proveedor, Compra, DetalleCompra, Insumo, InsumoStockSucursal, InsumoMovimiento,
  Categoria, Producto, RecetaInsumo, Pedido, DetallePedido, Configuracion,
} = require('../src/models');
const compras = require('../src/modules/compras/compras.service');
const reportes = require('../src/modules/reportes/reportes.service');

describe('Compra sugerida', () => {
  let sucursal, prov, carne, papa, sal, sobrado;
  const comprasIds = [];

  beforeAll(async () => {
    sucursal = await Sucursal.create({ nombre: 'Sucursal Compra Sugerida Test' });
    prov = await Proveedor.create({ nombre: 'Proveedor Sugerida Test' });
    carne = await Insumo.create({ nombre: 'Carne Sugerida Test', unidad_medida: 'kilogramo', stock_minimo: 5 });
    papa = await Insumo.create({ nombre: 'Papa Sugerida Test', unidad_medida: 'kilogramo', stock_minimo: 10 });
    sal = await Insumo.create({ nombre: 'Huevo Sugerida Test', unidad_medida: 'unidad', stock_minimo: 12 });
    sobrado = await Insumo.create({ nombre: 'Aceite Sugerida Test', unidad_medida: 'litro', stock_minimo: 1 });
    await InsumoStockSucursal.bulkCreate([
      { insumo_id: carne.id, sucursal_id: sucursal.id, stock: 2 },
      { insumo_id: papa.id, sucursal_id: sucursal.id, stock: 10 },
      { insumo_id: sal.id, sucursal_id: sucursal.id, stock: 3.5 },
      { insumo_id: sobrado.id, sucursal_id: sucursal.id, stock: 20 },
    ]);
    // Carne: se gastan 30 kg en 2 semanas (15 por semana) → la semana pesa más que 2 × mínimo.
    await InsumoMovimiento.create({ insumo_id: carne.id, sucursal_id: sucursal.id, tipo: 'consumo_venta', cantidad: 30, stock_anterior: 0, stock_nuevo: 0 });
    // Carne y papa se compraron a prov: manda la última compra recibida (60/kg), no la pendiente.
    const compra = async (estado, detalles, fecha) => {
      const c = await Compra.create({ sucursal_id: sucursal.id, proveedor_id: prov.id, usuario_id: 1, estado, total: 0 });
      if (fecha) await Compra.update({ creado_en: fecha }, { where: { id: c.id }, silent: true });
      await DetalleCompra.bulkCreate(detalles.map((d) => ({ compra_id: c.id, cantidad: 1, subtotal: d.costo_unitario, ...d })));
      comprasIds.push(c.id);
    };
    await compra('recibido', [{ insumo_id: carne.id, costo_unitario: 50 }], new Date(Date.now() - 3 * 86400000));
    await compra('recibido', [{ insumo_id: carne.id, costo_unitario: 60 }, { insumo_id: papa.id, costo_unitario: 4 }], new Date(Date.now() - 86400000));
    await compra('pendiente', [{ insumo_id: carne.id, costo_unitario: 99 }]);
  });

  afterAll(async () => {
    await DetalleCompra.destroy({ where: { compra_id: comprasIds } });
    await Compra.destroy({ where: { id: comprasIds } });
    await InsumoMovimiento.destroy({ where: { sucursal_id: sucursal.id } });
    await InsumoStockSucursal.destroy({ where: { sucursal_id: sucursal.id } });
    await Insumo.destroy({ where: { id: [carne.id, papa.id, sal.id, sobrado.id] } });
    await prov.destroy();
    await sucursal.destroy();
  });

  it('sugiere cuánto comprar de lo que llegó al mínimo, agrupado por el último proveedor', async () => {
    const r = await compras.compraSugerida(sucursal.id);
    const nuestros = r.grupos.map((g) => ({ ...g, items: g.items.filter((i) => / Sugerida Test$/.test(i.nombre)) })).filter((g) => g.items.length);
    const deProv = nuestros.find((g) => g.proveedor?.id === prov.id);
    expect(deProv.items.map((i) => [i.nombre, i.cantidad, i.costo_unitario, i.subtotal])).toEqual([
      ['Carne Sugerida Test', 13, 60, 780], // semana 15 − stock 2
      ['Papa Sugerida Test', 10, 4, 40],    // 2 × 10 − 10
    ]);
    // Nunca comprado: sin proveedor ni costo; las unidades se redondean hacia arriba.
    const sinProv = nuestros.find((g) => g.proveedor === null);
    expect(sinProv.items).toEqual([expect.objectContaining({ nombre: 'Huevo Sugerida Test', cantidad: 21, costo_unitario: null, subtotal: null })]);
    // Lo que está sobre su mínimo no aparece.
    expect(nuestros.flatMap((g) => g.items).find((i) => i.nombre === 'Aceite Sugerida Test')).toBeUndefined();
    // "Sin proveedor" va al final.
    expect(r.grupos[r.grupos.length - 1].proveedor).toBeNull();
  });

  it('la ruta responde para la sucursal del usuario', async () => {
    const tk = (await request(app).post('/api/v1/auth/login').send({ email: 'admin@restaurante.com', contrasena: process.env.ADMIN_PASSWORD || 'admin123' })).body.datos.token;
    const res = await request(app).get('/api/v1/compras/sugerida').set('Authorization', `Bearer ${tk}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.datos.grupos)).toBe(true);
  });
});

describe('Platos con poco margen', () => {
  let sucursal, prov, categoria, insumo, caro, barato, compra, pedido, cfgAntes;

  beforeAll(async () => {
    sucursal = await Sucursal.create({ nombre: 'Sucursal Margen Test' });
    prov = await Proveedor.create({ nombre: 'Proveedor Margen Test' });
    categoria = await Categoria.create({ nombre: 'Categoria Margen Test' });
    insumo = await Insumo.create({ nombre: 'Lomo Margen Test', unidad_medida: 'kilogramo' });
    caro = await Producto.create({ categoria_id: categoria.id, nombre: 'Plato Caro Margen Test', precio: 50 });
    barato = await Producto.create({ categoria_id: categoria.id, nombre: 'Plato Bueno Margen Test', precio: 100 });
    await RecetaInsumo.bulkCreate([
      { producto_id: caro.id, insumo_id: insumo.id, cantidad: 0.3 },   // 0.3 × 80 = 24 → 48%
      { producto_id: barato.id, insumo_id: insumo.id, cantidad: 0.3 }, // 24 de 100 → 24%
    ]);
    compra = await Compra.create({ sucursal_id: sucursal.id, proveedor_id: prov.id, usuario_id: 1, estado: 'recibido', total: 80 });
    await DetalleCompra.create({ compra_id: compra.id, insumo_id: insumo.id, cantidad: 1, costo_unitario: 80, subtotal: 80 });
    pedido = await Pedido.create({ sucursal_id: sucursal.id, usuario_id: 1, tipo: 'llevar', estado: 'completado', total: 150 });
    await DetallePedido.bulkCreate([
      { pedido_id: pedido.id, producto_id: caro.id, cantidad: 1, precio: 50 },
      { pedido_id: pedido.id, producto_id: barato.id, cantidad: 1, precio: 100 },
    ]);
    cfgAntes = await Configuracion.findOne({ where: { clave: 'alerta_costo_pct' } });
  });

  afterAll(async () => {
    await Configuracion.destroy({ where: { clave: 'alerta_costo_pct' } });
    if (cfgAntes) await Configuracion.create({ clave: 'alerta_costo_pct', valor: cfgAntes.valor });
    await DetallePedido.destroy({ where: { pedido_id: pedido.id } });
    await pedido.destroy();
    await DetalleCompra.destroy({ where: { compra_id: compra.id } });
    await compra.destroy();
    await RecetaInsumo.destroy({ where: { insumo_id: insumo.id } });
    await Producto.destroy({ where: { id: [caro.id, barato.id] } });
    await insumo.destroy();
    await categoria.destroy();
    await prov.destroy();
    await sucursal.destroy();
  });

  const alcance = () => ({ acceso_todas: false, sucursal_id: sucursal.id });

  it('avisa el plato cuyo costo pasa el 40% del precio, no el que tiene buen margen', async () => {
    await Configuracion.destroy({ where: { clave: 'alerta_costo_pct' } });
    const r = await reportes.margenBajo({}, alcance());
    expect(r.umbral).toBe(40);
    expect(r.platos.find((p) => p.id === caro.id)).toMatchObject({ costo: 24, costo_pct: 48, ganancia_unitaria: 26, vendidos: 1 });
    expect(r.platos.find((p) => p.id === barato.id)).toBeUndefined();
  });

  it('usa el porcentaje configurado', async () => {
    await Configuracion.upsert({ clave: 'alerta_costo_pct', valor: '20' });
    const r = await reportes.margenBajo({}, alcance());
    expect(r.umbral).toBe(20);
    expect(r.platos.map((p) => p.id)).toEqual(expect.arrayContaining([caro.id, barato.id]));
  });
});
