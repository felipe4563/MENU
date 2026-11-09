// El premio "producto gratis" / "combo gratis" de la ruleta da un cupón que
// solo descuenta si ese producto o combo está en la venta.
const { Op } = require('sequelize');
const { Configuracion, Cliente, Categoria, Producto, Combo, Cupon, RuletaPremio, RuletaGiro, Usuario } = require('../src/models');
const ruleta = require('../src/modules/ruleta/ruleta.service');
const cupones = require('../src/modules/cupones/cupones.service');

describe('Ruleta: cupón amarrado a su producto o combo', () => {
  const t = Date.now();
  let cliente, categoria, producto, otro, combo, configPrevia, activosPrevios, usuarioId;

  beforeAll(async () => {
    usuarioId = (await Usuario.findOne()).id;
    configPrevia = await Configuracion.findAll({ where: { clave: { [Op.like]: 'ruleta_%' } } });
    for (const [clave, valor] of [['ruleta_activa', 'true'], ['ruleta_costo_puntos', '1'], ['ruleta_max_giros_periodo', '99'], ['ruleta_periodo', 'dia'], ['ruleta_vigencia_dias_premio', '7']]) {
      await Configuracion.upsert({ clave, valor });
    }
    // Solo el premio de cada prueba queda activo, para que salga seguro.
    activosPrevios = (await RuletaPremio.findAll({ where: { activo: 1 } })).map((p) => p.id);
    await RuletaPremio.update({ activo: 0 }, { where: { id: activosPrevios } });

    cliente = await Cliente.create({ nombre: `Cliente Ruleta ${t}`, tipo_documento: 'CI', numero_documento: `RU${t}`.slice(0, 15), puntos: 100 });
    categoria = await Categoria.create({ nombre: `Cat Ruleta ${t}` });
    producto = await Producto.create({ categoria_id: categoria.id, nombre: `Salteña ${t}`, precio: 8, stock: 0 });
    otro = await Producto.create({ categoria_id: categoria.id, nombre: `Coca ${t}`, precio: 10, stock: 0 });
    combo = await Combo.create({ nombre: `Combo ${t}`, precio: 30, activo: 1 });
  });

  afterAll(async () => {
    const giros = await RuletaGiro.findAll({ where: { cliente_id: cliente.id } });
    await RuletaGiro.destroy({ where: { cliente_id: cliente.id } });
    await Cupon.destroy({ where: { id: giros.map((g) => g.cupon_id).filter(Boolean) } });
    await RuletaPremio.destroy({ where: { nombre: { [Op.like]: `% ${t}` } } });
    await RuletaPremio.update({ activo: 1 }, { where: { id: activosPrevios } });
    await Configuracion.destroy({ where: { clave: { [Op.like]: 'ruleta_%' } } });
    for (const c of configPrevia) await Configuracion.create({ clave: c.clave, valor: c.valor });
    await Combo.destroy({ where: { id: combo.id } });
    await Producto.destroy({ where: { id: [producto.id, otro.id] } });
    await Categoria.destroy({ where: { id: categoria.id } });
    await Cliente.destroy({ where: { id: cliente.id } });
  });

  async function girarCon(premio) {
    const p = await RuletaPremio.create({ ...premio, probabilidad: 1, activo: 1 });
    try { return await ruleta.girar(cliente.id, usuarioId); } finally { await p.update({ activo: 0 }); }
  }

  it('producto gratis: no descuenta en una venta sin ese producto', async () => {
    const r = await girarCon({ nombre: `Salteña gratis ${t}`, tipo: 'producto_gratis', producto_id: producto.id });
    const sinProducto = [{ producto_id: otro.id, combo_id: null, cantidad: 1, precio: 10 }];
    await expect(cupones.validar(r.cupon.codigo, 10, cliente.id, sinProducto)).rejects.toThrow(/no están en el pedido/);
  });

  it('producto gratis: con el producto en la venta descuenta su precio, una sola unidad', async () => {
    const r = await girarCon({ nombre: `Salteña gratis 2 ${t}`, tipo: 'producto_gratis', producto_id: producto.id });
    const items = [{ producto_id: producto.id, combo_id: null, cantidad: 3, precio: 8 }, { producto_id: otro.id, combo_id: null, cantidad: 1, precio: 10 }];
    const v = await cupones.validar(r.cupon.codigo, 34, cliente.id, items);
    expect(v.descuento).toBe(8);
  });

  it('combo gratis: solo descuenta si el combo está en la venta', async () => {
    const r = await girarCon({ nombre: `Combo gratis ${t}`, tipo: 'combo_gratis', combo_id: combo.id });
    await expect(cupones.validar(r.cupon.codigo, 10, cliente.id, [{ producto_id: otro.id, combo_id: null, cantidad: 1, precio: 10 }])).rejects.toThrow(/es para el combo Combo .*: agrégalo/);
    const v = await cupones.validar(r.cupon.codigo, 40, cliente.id, [{ producto_id: null, combo_id: combo.id, cantidad: 1, precio: 30 }, { producto_id: otro.id, combo_id: null, cantidad: 1, precio: 10 }]);
    expect(v.descuento).toBe(30);
  });
});
