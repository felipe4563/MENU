// Adelantos de reservas: entran a la caja del día y se devuelven desde la caja abierta.
const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const adelantos = require('../src/modules/reservas/adelantos.service');
const { Sucursal, Rol, Usuario, Caja, SesionCaja, LibroCaja, Reserva, ReservaItem, ReservaPago } = require('../src/models');

describe('Adelantos de reservas', () => {
  let sucursal, usuario, token, caja, sesion;
  const manana = new Date(Date.now() - 4 * 3600000 + 86400000).toISOString().slice(0, 10);
  const auth = () => ({ Authorization: `Bearer ${token}` });
  const alcance = () => ({ sucursal_id: sucursal.id, acceso_todas: false });
  const nueva = (extra = {}) => Reserva.create({ sucursal_id: sucursal.id, usuario_id: usuario.id, nombre_cliente: 'Familia Adelanto', personas: 4, fecha_hora: `${manana}T20:00:00-04:00`, ...extra });
  const adelanto = (id, body) => request(app).post(`/api/v1/reservas/${id}/adelantos`).set(auth()).send(body);
  const sesionActual = () => SesionCaja.findByPk(sesion.id);

  beforeAll(async () => {
    sucursal = await Sucursal.create({ nombre: 'Sucursal Adelantos Test' });
    const rol = await Rol.findOne({ where: { nombre: 'Administrador' } });
    usuario = await Usuario.create({ rol_id: rol.id, nombre: 'Adelantos Test', email: 'adelantos-test@restaurante.com', contrasena: await bcrypt.hash('clave123', 10) });
    await usuario.addSucursal(sucursal);
    token = (await request(app).post('/api/v1/auth/login').send({ email: 'adelantos-test@restaurante.com', contrasena: 'clave123' })).body.datos.token;
    caja = await Caja.create({ sucursal_id: sucursal.id, nombre: 'Caja Adelantos Test' });
  });

  afterAll(async () => {
    const ids = (await Reserva.findAll({ where: { sucursal_id: sucursal.id }, attributes: ['id'] })).map((r) => r.id);
    await ReservaItem.destroy({ where: { reserva_id: ids } });
    await ReservaPago.destroy({ where: { reserva_id: ids } });
    await Reserva.destroy({ where: { id: ids } });
    await LibroCaja.destroy({ where: { usuario_id: usuario.id } });
    await SesionCaja.destroy({ where: { usuario_id: usuario.id } });
    await Caja.destroy({ where: { sucursal_id: sucursal.id } });
    await Usuario.destroy({ where: { id: usuario.id } });
    await Sucursal.destroy({ where: { id: sucursal.id } });
  });

  it('sin caja abierta => 409 Abre tu caja para cobrar', async () => {
    const r = await nueva();
    const res = await adelanto(r.id, { metodo_pago: 'efectivo', monto: 50 });
    expect(res.status).toBe(409);
    expect(res.body.mensaje).toBe('Abre tu caja para cobrar');
  });

  it('cobra adelanto en efectivo y entra a la caja de hoy', async () => {
    sesion = await SesionCaja.create({ usuario_id: usuario.id, sucursal_id: sucursal.id, caja_id: caja.id, monto_apertura: 100 });
    const r = await nueva();
    const res = await adelanto(r.id, { metodo_pago: 'efectivo', monto: 50, monto_recibido: 100 });
    expect(res.status).toBe(201);
    expect(res.body.datos).toMatchObject({ adelantado: 50 });
    expect(res.body.datos.pagos[0]).toMatchObject({ tipo: 'adelanto', metodo_pago: 'efectivo', sesion_caja_id: sesion.id });
    expect(Number(res.body.datos.pagos[0].cambio)).toBe(50);
    const libro = await LibroCaja.findOne({ where: { sesion_caja_id: sesion.id, referencia_id: r.id } });
    expect(libro).toMatchObject({ tipo: 'ingreso', categoria: 'adelantos_reserva', metodo_pago: 'efectivo', concepto: `Adelanto reserva #${r.id} · Familia Adelanto` });
    expect(Number(libro.monto)).toBe(50);
    expect(Number((await sesionActual()).total_ventas)).toBe(50);
  });

  it('efectivo con monto recibido insuficiente => 400', async () => {
    const r = await nueva();
    const res = await adelanto(r.id, { metodo_pago: 'efectivo', monto: 50, monto_recibido: 20 });
    expect(res.status).toBe(400);
    expect(res.body.mensaje).toBe('Monto recibido insuficiente');
  });

  it('adelanto por qr sin monto_recibido', async () => {
    const r = await nueva();
    const res = await adelanto(r.id, { metodo_pago: 'qr', monto: 30 });
    expect(res.status).toBe(201);
    expect(res.body.datos.pagos[0]).toMatchObject({ metodo_pago: 'qr', estado: 'completado', monto_recibido: null });
  });

  it('no pasa el total de los platos', async () => {
    const r = await nueva();
    await ReservaItem.create({ reserva_id: r.id, nombre: 'Plato', cantidad: 2, precio: 40 });
    const res = await adelanto(r.id, { metodo_pago: 'qr', monto: 90 });
    expect(res.status).toBe(409);
    expect(res.body.mensaje).toBe('El adelanto pasa el total de los platos');
  });

  it('sin platos el monto es libre', async () => {
    const r = await nueva();
    const res = await adelanto(r.id, { metodo_pago: 'qr', monto: 500 });
    expect(res.status).toBe(201);
  });

  it('varios adelantos suman', async () => {
    const r = await nueva();
    await ReservaItem.create({ reserva_id: r.id, nombre: 'Plato', cantidad: 2, precio: 40 });
    await adelanto(r.id, { metodo_pago: 'qr', monto: 30 });
    const res = await adelanto(r.id, { metodo_pago: 'efectivo', monto: 50 });
    expect(res.status).toBe(201);
    expect(res.body.datos).toMatchObject({ adelantado: 80, saldo: 0 });
    const tercero = await adelanto(r.id, { metodo_pago: 'qr', monto: 1 });
    expect(tercero.status).toBe(409);
  });

  it('no cobra adelanto a reserva cancelada', async () => {
    const r = await nueva({ estado: 'cancelada' });
    const res = await adelanto(r.id, { metodo_pago: 'qr', monto: 10 });
    expect(res.status).toBe(409);
  });

  it('monto no positivo => 400', async () => {
    const r = await nueva();
    expect((await adelanto(r.id, { metodo_pago: 'qr', monto: 0 })).status).toBe(400);
  });

  it('devolver en efectivo baja el efectivo esperado del cierre', async () => {
    await SesionCaja.update({ estado: 'cerrada' }, { where: { id: sesion.id } });
    const caja2 = await Caja.create({ sucursal_id: sucursal.id, nombre: 'Caja Adelantos 2' });
    const s2 = await SesionCaja.create({ usuario_id: usuario.id, sucursal_id: sucursal.id, caja_id: caja2.id, monto_apertura: 200 });
    const r = await nueva();
    await adelanto(r.id, { metodo_pago: 'efectivo', monto: 80 });
    const pago = await adelantos.devolverAdelanto(r.id, usuario.id, { metodo_pago: 'efectivo', monto: 30 }, alcance());
    expect(pago).toMatchObject({ tipo: 'devolucion', sesion_caja_id: s2.id });
    const egreso = await LibroCaja.findOne({ where: { sesion_caja_id: s2.id, tipo: 'egreso' } });
    expect(egreso).toMatchObject({ categoria: 'adelantos_reserva', concepto: `Devolución adelanto reserva #${r.id} · Familia Adelanto`, referencia_id: r.id });
    const rep = await request(app).get(`/api/v1/caja/${s2.id}/reporte`).set(auth());
    expect(rep.status).toBe(200);
    expect(Number(rep.body.datos.efectivo_esperado)).toBe(200 + 80 - 30);
    await expect(adelantos.devolverAdelanto(r.id, usuario.id, { metodo_pago: 'efectivo', monto: 51 }, alcance())).rejects.toMatchObject({ status: 409 });
    const final = await request(app).get(`/api/v1/reservas/${r.id}`).set(auth());
    expect(final.body.datos.adelantado).toBe(50);
    await SesionCaja.update({ estado: 'cerrada' }, { where: { id: s2.id } });
    await expect(adelantos.devolverAdelanto(r.id, usuario.id, { metodo_pago: 'efectivo', monto: 10 }, alcance())).rejects.toMatchObject({ status: 409, message: 'Abre tu caja para devolver' });
  });
});
