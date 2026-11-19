// Job de cada minuto: manda a cocina las reservas "antes" cuando llega su hora
// y avisa una sola vez de la que no llegó.
const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const push = require('../src/modules/push/push.service');
const { procesarReservas } = require('../src/jobs/reservas.job');
const {
  Sucursal, Rol, Usuario, Caja, SesionCaja, LibroCaja, Categoria, Producto, RegistroInventario,
  Reserva, ReservaItem, ReservaPago, Pedido, DetallePedido, PedidoPago, PedidoPagoItem, Configuracion,
} = require('../src/models');

const CLAVES = ['reservas_envio_cocina', 'reservas_minutos_antes', 'reservas_tolerancia_no_vino'];

describe('Job de reservas', () => {
  let sucursal, usuario, token, caja, sesion, categoria, plato, aviso, previas;
  const auth = () => ({ Authorization: `Bearer ${token}` });
  const MIN = 60000;
  // Bolivia (-04:00) en el formato que recibe la API.
  const local = (f) => new Date(f.getTime() - 4 * 3600000).toISOString().slice(0, 16);
  const config = (envio, antes = 30, tolerancia = 30) => Promise.all([
    Configuracion.upsert({ clave: 'reservas_envio_cocina', valor: envio }),
    Configuracion.upsert({ clave: 'reservas_minutos_antes', valor: String(antes) }),
    Configuracion.upsert({ clave: 'reservas_tolerancia_no_vino', valor: String(tolerancia) }),
  ]);
  const nueva = async (minutosDesdeAhora, body = {}) => {
    const res = await request(app).post('/api/v1/reservas').set(auth()).send({
      nombre_cliente: 'Familia Job', personas: 2, fecha_hora: local(new Date(Date.now() + minutosDesdeAhora * MIN)),
      items: [{ producto_id: plato.id, cantidad: 1 }], ...body,
    });
    expect(res.status).toBe(201);
    return res.body.datos;
  };
  // Se guarda lejos (no sale al guardar) y luego se mueve la hora directo en la
  // BD, para probar solo lo que hace el job.
  const nuevaLuego = async (minutosDesdeAhora, body = {}) => {
    const r = await nueva(24 * 60, body);
    await Reserva.update({ fecha_hora: new Date(Date.now() + minutosDesdeAhora * MIN) }, { where: { id: r.id } });
    return r;
  };
  const recargar = (id) => Reserva.findByPk(id);
  // Cada prueba arranca sin reservas de la sucursal.
  const limpiar = async () => {
    const reservas = (await Reserva.findAll({ where: { sucursal_id: sucursal.id }, attributes: ['id'] })).map((r) => r.id);
    const pedidos = (await Pedido.findAll({ where: { sucursal_id: sucursal.id }, attributes: ['id'] })).map((p) => p.id);
    const pagos = (await PedidoPago.findAll({ where: { pedido_id: pedidos }, attributes: ['id'] })).map((p) => p.id);
    await ReservaItem.destroy({ where: { reserva_id: reservas } });
    await ReservaPago.destroy({ where: { reserva_id: reservas } });
    await Reserva.destroy({ where: { id: reservas } });
    await PedidoPagoItem.destroy({ where: { pedido_pago_id: pagos } });
    await PedidoPago.destroy({ where: { pedido_id: pedidos } });
    await LibroCaja.destroy({ where: { sesion_caja_id: sesion.id } });
    await DetallePedido.destroy({ where: { pedido_id: pedidos } });
    await Pedido.destroy({ where: { id: pedidos } });
  };

  beforeAll(async () => {
    previas = await Configuracion.findAll({ where: { clave: CLAVES } });
    sucursal = await Sucursal.create({ nombre: 'Sucursal Job Reserva Test' });
    const rol = await Rol.findOne({ where: { nombre: 'Administrador' } });
    usuario = await Usuario.create({ rol_id: rol.id, nombre: 'Job Reserva Test', email: 'job-reserva-test@restaurante.com', contrasena: await bcrypt.hash('clave123', 10) });
    await usuario.addSucursal(sucursal);
    token = (await request(app).post('/api/v1/auth/login').send({ email: 'job-reserva-test@restaurante.com', contrasena: 'clave123' })).body.datos.token;
    caja = await Caja.create({ sucursal_id: sucursal.id, nombre: 'Caja Job Reserva Test' });
    sesion = await SesionCaja.create({ usuario_id: usuario.id, sucursal_id: sucursal.id, caja_id: caja.id, monto_apertura: 0 });
    categoria = await Categoria.create({ nombre: 'Categoria Job Reserva Test' });
    plato = await Producto.create({ categoria_id: categoria.id, nombre: 'Plato Job', precio: 50 });
  });

  beforeEach(async () => {
    aviso = jest.spyOn(push, 'aPermiso').mockResolvedValue(0);
    await config('antes', 30, 30);
  });
  afterEach(async () => { aviso.mockRestore(); await limpiar(); });

  afterAll(async () => {
    await Configuracion.destroy({ where: { clave: CLAVES } });
    for (const c of previas) await Configuracion.upsert({ clave: c.clave, valor: c.valor });
    await SesionCaja.destroy({ where: { sucursal_id: sucursal.id } });
    await Caja.destroy({ where: { id: caja.id } });
    await RegistroInventario.destroy({ where: { producto_id: plato.id } });
    await Producto.destroy({ where: { id: plato.id } });
    await Categoria.destroy({ where: { id: categoria.id } });
    await Usuario.destroy({ where: { id: usuario.id } });
    await Sucursal.destroy({ where: { id: sucursal.id } });
  });

  it('manda a cocina las de "antes" cuando llega su hora', async () => {
    const cerca = await nuevaLuego(20);
    const lejos = await nuevaLuego(60);
    const res = await procesarReservas();
    expect(res.enviadas).toBe(1);
    expect((await recargar(cerca.id)).pedido_id).toBeTruthy();
    expect((await recargar(lejos.id)).pedido_id).toBeNull();
  });

  it('al_llegar no se manda sola', async () => {
    await config('al_llegar');
    const r = await nuevaLuego(5);
    const res = await procesarReservas();
    expect(res.enviadas).toBe(0);
    expect((await recargar(r.id)).pedido_id).toBeNull();
  });

  it('el override por reserva gana a la config', async () => {
    const manual = await nuevaLuego(5, { envio_cocina: 'manual' });
    await config('al_llegar');
    const antes = await nuevaLuego(10, { envio_cocina: 'antes' });
    const res = await procesarReservas();
    expect(res.enviadas).toBe(1);
    expect((await recargar(manual.id)).pedido_id).toBeNull();
    expect((await recargar(antes.id)).pedido_id).toBeTruthy();
  });

  it('avisa una sola vez la reserva que no llegó', async () => {
    await config('manual', 30, 10);
    const r = await nuevaLuego(1);
    const despues = new Date(Date.now() + 20 * MIN);
    const primera = await procesarReservas(despues);
    expect(primera.avisadas).toBe(1);
    const segunda = await procesarReservas(new Date(despues.getTime() + MIN));
    expect(segunda.avisadas).toBe(0);
    expect((await recargar(r.id)).aviso_no_vino_en).toBeTruthy();
    const llamadas = aviso.mock.calls.filter(([, p]) => p.titulo === 'Reserva sin llegar');
    expect(llamadas).toHaveLength(1);
    expect(llamadas[0][1]).toEqual(expect.objectContaining({
      cuerpo: expect.stringContaining('Familia Job no llegó (reserva de las '), url: '/vender/reservas', etiqueta: `reserva-${r.id}`,
    }));
  });

  it('no avisa de la reserva que ya llegó', async () => {
    await config('manual', 30, 10);
    const r = await nuevaLuego(1);
    await Reserva.update({ estado: 'llego' }, { where: { id: r.id } });
    const res = await procesarReservas(new Date(Date.now() + 20 * MIN));
    expect(res.avisadas).toBe(0);
  });

  it('sin caja abierta no falla y queda para después', async () => {
    await sesion.update({ estado: 'cerrada' });
    const r = await nuevaLuego(20);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const res = await procesarReservas();
    expect(res.enviadas).toBe(0);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
    expect((await recargar(r.id)).pedido_id).toBeNull();
    await sesion.update({ estado: 'abierta' });
    const luego = await procesarReservas();
    expect(luego.enviadas).toBe(1);
    expect((await recargar(r.id)).pedido_id).toBeTruthy();
  });

  it('una reserva creada pasada la hora de envío se manda al guardar', async () => {
    const r = await nueva(10);
    expect((await recargar(r.id)).pedido_id).toBeTruthy();
    const lejos = await nueva(90);
    expect((await recargar(lejos.id)).pedido_id).toBeNull();
    // Al editarla para que quede dentro de la ventana, también sale.
    const res = await request(app).put(`/api/v1/reservas/${lejos.id}`).set(auth()).send({ fecha_hora: local(new Date(Date.now() + 15 * MIN)) });
    expect(res.status).toBe(200);
    expect((await recargar(lejos.id)).pedido_id).toBeTruthy();
  });

  it('si no hay caja al guardar, la reserva se guarda igual', async () => {
    await sesion.update({ estado: 'cerrada' });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const r = await nueva(10);
    warn.mockRestore();
    await sesion.update({ estado: 'abierta' });
    expect((await recargar(r.id)).pedido_id).toBeNull();
  });

  it('las claves de configuración se validan', async () => {
    const put = (b) => request(app).put('/api/v1/configuracion').set(auth()).send(b);
    expect((await put({ reservas_envio_cocina: 'cuando sea' })).status).toBe(400);
    expect((await put({ reservas_minutos_antes: '-5' })).status).toBe(400);
    expect((await put({ reservas_minutos_antes: '2000' })).status).toBe(400);
    expect((await put({ reservas_tolerancia_no_vino: '1' })).status).toBe(400);
    expect((await put({ reservas_tolerancia_no_vino: '45' })).status).toBe(200);
    expect((await put({ reservas_envio_cocina: 'manual' })).status).toBe(200);
  });
});
