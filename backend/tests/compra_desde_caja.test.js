// Compras pagadas con la plata de la caja abierta: un solo egreso en el libro
// de caja, cuenta como gasto del turno y Finanzas no la cuenta dos veces.
const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const {
  Sucursal, Caja, SesionCaja, Usuario, Rol, Insumo, InsumoStockSucursal,
  Compra, DetalleCompra, Gasto, LibroCaja, Proveedor,
} = require('../src/models');
const compras = require('../src/modules/compras/compras.service');
const reportes = require('../src/modules/reportes/reportes.service');

describe('Compra pagada con la caja', () => {
  let sucursal, caja, admin, otro, sesion, insumo, proveedor;
  const alcance = () => ({ sucursal_id: sucursal.id, acceso_todas: false });

  beforeAll(async () => {
    sucursal = await Sucursal.create({ nombre: 'Sucursal Compra Caja Test' });
    caja = await Caja.create({ sucursal_id: sucursal.id, nombre: 'Caja Compra Test' });
    const rol = await Rol.findOne({ where: { nombre: 'Administrador' } });
    admin = await Usuario.create({ rol_id: rol.id, nombre: 'Cajero Compra Test', email: 'compra-caja-test@restaurante.com', contrasena: 'x' });
    otro = await Usuario.create({ rol_id: rol.id, nombre: 'Otro Compra Test', email: 'compra-caja-otro@restaurante.com', contrasena: 'x' });
    sesion = await SesionCaja.create({ usuario_id: admin.id, sucursal_id: sucursal.id, caja_id: caja.id, monto_apertura: 500 });
    insumo = await Insumo.create({ nombre: 'Tomate Compra Caja Test', unidad_medida: 'kilogramo' });
    proveedor = await Proveedor.create({ nombre: 'Proveedor Compra Caja Test' });
  });

  afterAll(async () => {
    const ids = (await Compra.findAll({ where: { sucursal_id: sucursal.id }, attributes: ['id'] })).map((c) => c.id);
    await LibroCaja.destroy({ where: { compra_id: ids } });
    await Gasto.destroy({ where: { sesion_caja_id: sesion.id } });
    await DetalleCompra.destroy({ where: { compra_id: ids } });
    await Compra.destroy({ where: { id: ids } });
    await InsumoStockSucursal.destroy({ where: { insumo_id: insumo.id } });
    await Insumo.destroy({ where: { id: insumo.id } });
    await Proveedor.destroy({ where: { id: proveedor.id } });
    await SesionCaja.destroy({ where: { id: sesion.id } });
    await Usuario.destroy({ where: { id: [admin.id, otro.id] } });
    await Caja.destroy({ where: { id: caja.id } });
    await Sucursal.destroy({ where: { id: sucursal.id } });
  });

  const stock = async () => Number((await InsumoStockSucursal.findOne({ where: { insumo_id: insumo.id, sucursal_id: sucursal.id } }))?.stock ?? 0);

  it('compra al paso sin proveedor: queda recibida, sube el stock y es un gasto del turno', async () => {
    const antes = await stock();
    const c = await compras.crearCompra(admin.id, sucursal.id, {
      notas: 'Verduras del mercado', sesion_caja_id: sesion.id,
      items: [{ insumo_id: insumo.id, cantidad: 3, costo_unitario: 10 }],
    });
    expect(c.estado).toBe('recibido');
    expect(c.proveedor_id).toBeNull();
    expect(c.sesion_caja_id).toBe(sesion.id);
    expect(await stock()).toBeCloseTo(antes + 3);

    const gasto = await Gasto.findOne({ where: { compra_id: c.id } });
    expect(Number(gasto.monto)).toBe(30);
    expect(gasto.descripcion).toContain('Verduras del mercado');
    const libro = await LibroCaja.findAll({ where: { compra_id: c.id } });
    expect(libro).toHaveLength(1); // un solo egreso, no dos
    expect(libro[0].sesion_caja_id).toBe(sesion.id);
    expect(libro[0].referencia_id).toBe(gasto.id);
    await sesion.reload();
    expect(Number(sesion.total_gastos)).toBe(30);
  });

  it('pagar con la caja una compra que estaba por recibir', async () => {
    const pendiente = await compras.crearCompra(admin.id, sucursal.id, { proveedor_id: proveedor.id, items: [{ insumo_id: insumo.id, cantidad: 2, costo_unitario: 25 }] });
    expect(pendiente.estado).toBe('pendiente');
    const r = await compras.recibirCompra(pendiente.id, admin.id, alcance(), { sesion_caja_id: sesion.id });
    expect(r.estado).toBe('recibido');
    expect(await LibroCaja.count({ where: { compra_id: pendiente.id } })).toBe(1);
    expect(await Gasto.count({ where: { compra_id: pendiente.id } })).toBe(1);
    await sesion.reload();
    expect(Number(sesion.total_gastos)).toBe(80);
  });

  it('recibir pagando por fuera de la caja: egreso sin sesión y sin gasto del turno', async () => {
    const pendiente = await compras.crearCompra(admin.id, sucursal.id, { proveedor_id: proveedor.id, items: [{ insumo_id: insumo.id, cantidad: 1, costo_unitario: 40 }] });
    await compras.recibirCompra(pendiente.id, admin.id, alcance());
    const libro = await LibroCaja.findOne({ where: { compra_id: pendiente.id } });
    expect(libro.sesion_caja_id).toBeNull();
    expect(await Gasto.count({ where: { compra_id: pendiente.id } })).toBe(0);
    await sesion.reload();
    expect(Number(sesion.total_gastos)).toBe(80);
  });

  it('no se puede recibir dos veces', async () => {
    const pendiente = await compras.crearCompra(admin.id, sucursal.id, { proveedor_id: proveedor.id, items: [{ insumo_id: insumo.id, cantidad: 1, costo_unitario: 5 }] });
    await compras.recibirCompra(pendiente.id, admin.id, alcance(), { sesion_caja_id: sesion.id });
    await expect(compras.recibirCompra(pendiente.id, admin.id, alcance(), { sesion_caja_id: sesion.id })).rejects.toMatchObject({ status: 409 });
    expect(await LibroCaja.count({ where: { compra_id: pendiente.id } })).toBe(1);
  });

  it('solo quien abrió la caja puede pagar con ella, y nada queda a medias', async () => {
    const pendiente = await compras.crearCompra(admin.id, sucursal.id, { proveedor_id: proveedor.id, items: [{ insumo_id: insumo.id, cantidad: 1, costo_unitario: 7 }] });
    const antes = await stock();
    await expect(compras.recibirCompra(pendiente.id, otro.id, alcance(), { sesion_caja_id: sesion.id })).rejects.toMatchObject({ status: 403 });
    await pendiente.reload();
    expect(pendiente.estado).toBe('pendiente');
    expect(await stock()).toBeCloseTo(antes);
    await expect(compras.crearCompra(otro.id, sucursal.id, { sesion_caja_id: sesion.id, items: [{ insumo_id: insumo.id, cantidad: 1, costo_unitario: 1 }] })).rejects.toMatchObject({ status: 403 });
  });

  it('sin caja, una compra sigue necesitando proveedor', async () => {
    await expect(compras.crearCompra(admin.id, sucursal.id, { items: [{ insumo_id: insumo.id, cantidad: 1, costo_unitario: 1 }] })).rejects.toMatchObject({ status: 400 });
  });

  it('Finanzas cuenta la compra pagada con la caja como compra, no también como gasto operativo', async () => {
    const antes = await reportes.finanzasResumen({}, alcance());
    await compras.crearCompra(admin.id, sucursal.id, { notas: 'Gas', sesion_caja_id: sesion.id, items: [{ insumo_id: insumo.id, cantidad: 1, costo_unitario: 60 }] });
    const despues = await reportes.finanzasResumen({}, alcance());
    expect(despues.gastos_operativos).toBeCloseTo(antes.gastos_operativos);
    expect(despues.compras - antes.compras).toBeCloseTo(60);
  });

  it('un cajero sin el permiso de recibir compras no puede pagar una compra con la caja (403)', async () => {
    const rol = await Rol.findOne({ where: { nombre: 'Cajero' } });
    const hash = await bcrypt.hash('clave123', 10);
    const cajero = await Usuario.create({ rol_id: rol.id, nombre: 'Cajero Sin Compras Test', email: 'compra-caja-cajero@restaurante.com', contrasena: hash });
    await cajero.addSucursal(sucursal);
    try {
      const login = await request(app).post('/api/v1/auth/login').send({ email: 'compra-caja-cajero@restaurante.com', contrasena: 'clave123' });
      const res = await request(app).post('/api/v1/compras').set('Authorization', `Bearer ${login.body.datos.token}`)
        .send({ sesion_caja_id: sesion.id, items: [{ insumo_id: insumo.id, cantidad: 1, costo_unitario: 1 }] });
      expect(res.status).toBe(403);
    } finally {
      await Usuario.destroy({ where: { id: cajero.id } });
    }
  });
});
