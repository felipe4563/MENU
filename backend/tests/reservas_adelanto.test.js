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
    // Cómo imprime la caja donde se cobró (para el ticket, sin pedir caja.ver).
    expect(res.body.datos.impresion).toMatchObject({ id: caja.id, nombre: 'Caja Adelantos Test', modo_impresion: 'fisica', imprimir_ticket_cliente: true });
  });

  it('devuelve la impresión bluetooth de la caja y su ticket de cliente apagado', async () => {
    await caja.update({ modo_impresion: 'bluetooth', ancho_papel_bluetooth: '58mm', conexion_bluetooth: 'rawbt', imprimir_ticket_cliente: 0 });
    try {
      const r = await nueva();
      const res = await adelanto(r.id, { metodo_pago: 'qr', monto: 20 });
      expect(res.status).toBe(201);
      expect(res.body.datos.impresion).toMatchObject({ modo_impresion: 'bluetooth', ancho_papel_bluetooth: '58mm', conexion_bluetooth: 'rawbt', imprimir_ticket_cliente: false });
    } finally {
      await caja.update({ modo_impresion: 'fisica', ancho_papel_bluetooth: '80mm', conexion_bluetooth: 'directo', imprimir_ticket_cliente: 1 });
    }
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

// Cerrar una reserva con adelanto: no vino o cancelada, quedándose el adelanto
// (retenido) o devolviéndolo; si ya estaba en cocina, el pedido se cancela.
describe('Cerrar reservas con adelanto', () => {
  const ventasService = require('../src/modules/ventas/ventas.service');
  const push = require('../src/modules/push/push.service');
  const { Op } = require('sequelize');
  const {
    Area, Mesa, Permiso, Categoria, Producto, RegistroInventario, Pedido, DetallePedido, PedidoPago, Configuracion,
  } = require('../src/models');
  let sucursal, area, mesa, usuario, sinAnular, rolSinAnular, token, tokenSinAnular, caja, sesion, categoria, plato, flujoAntes;
  const manana = new Date(Date.now() - 4 * 3600000 + 86400000).toISOString().slice(0, 10);
  const auth = (t = token) => ({ Authorization: `Bearer ${t}` });
  let hora = 8;
  const nueva = async (body = {}) => {
    hora += 1;
    const res = await request(app).post('/api/v1/reservas').set(auth())
      .send({ nombre_cliente: 'Familia Cierre', personas: 2, fecha_hora: `${manana}T${String(hora).padStart(2, '0')}:00`, ...body });
    expect(res.status).toBe(201);
    return res.body.datos;
  };
  const adelanto = async (id, monto, metodo_pago = 'efectivo') => {
    const res = await request(app).post(`/api/v1/reservas/${id}/adelantos`).set(auth()).send({ metodo_pago, monto });
    expect(res.status).toBe(201);
  };
  const estado = (id, body, t = token) => request(app).put(`/api/v1/reservas/${id}/estado`).set(auth(t)).send(body);

  beforeAll(async () => {
    sucursal = await Sucursal.create({ nombre: 'Sucursal Cierre Reservas Test' });
    area = await Area.create({ nombre: 'Area Cierre Reservas Test', sucursal_id: sucursal.id });
    mesa = await Mesa.create({ area_id: area.id, nombre: 'Mesa Cierre 1' });
    const hash = await bcrypt.hash('clave123', 10);
    const rol = await Rol.findOne({ where: { nombre: 'Administrador' } });
    usuario = await Usuario.create({ rol_id: rol.id, nombre: 'Cierre Test', email: 'cierre-reservas-test@restaurante.com', contrasena: hash });
    await usuario.addSucursal(sucursal);
    token = (await request(app).post('/api/v1/auth/login').send({ email: 'cierre-reservas-test@restaurante.com', contrasena: 'clave123' })).body.datos.token;
    rolSinAnular = await Rol.create({ nombre: 'Sin Anular Reservas Test', descripcion: 'Rol de prueba sin ventas.anular' });
    const permisos = await Permiso.findAll({ where: { modulo: 'ventas' } });
    await rolSinAnular.setPermisos(permisos.filter((p) => p.accion !== 'anular'));
    sinAnular = await Usuario.create({ rol_id: rolSinAnular.id, nombre: 'Cajero Sin Anular', email: 'cierre-sin-anular-test@restaurante.com', contrasena: hash });
    await sinAnular.addSucursal(sucursal);
    tokenSinAnular = (await request(app).post('/api/v1/auth/login').send({ email: 'cierre-sin-anular-test@restaurante.com', contrasena: 'clave123' })).body.datos.token;
    caja = await Caja.create({ sucursal_id: sucursal.id, nombre: 'Caja Cierre Test' });
    sesion = await SesionCaja.create({ usuario_id: usuario.id, sucursal_id: sucursal.id, caja_id: caja.id, monto_apertura: 100 });
    categoria = await Categoria.create({ nombre: 'Categoria Cierre Test' });
    plato = await Producto.create({ categoria_id: categoria.id, nombre: 'Plato Cierre', precio: 50 });
    flujoAntes = await Configuracion.findOne({ where: { clave: 'flujo_cocina' } });
    await Configuracion.upsert({ clave: 'flujo_cocina', valor: 'digital' });
  });

  beforeEach(() => { jest.spyOn(push, 'aPermiso').mockResolvedValue(0); });
  afterEach(() => { jest.restoreAllMocks(); });

  afterAll(async () => {
    if (flujoAntes) await Configuracion.upsert({ clave: 'flujo_cocina', valor: flujoAntes.valor });
    else await Configuracion.destroy({ where: { clave: 'flujo_cocina' } });
    const reservas = (await Reserva.findAll({ where: { sucursal_id: sucursal.id }, attributes: ['id'] })).map((r) => r.id);
    const pedidos = (await Pedido.findAll({ where: { sucursal_id: sucursal.id }, attributes: ['id'] })).map((p) => p.id);
    await ReservaItem.destroy({ where: { reserva_id: reservas } });
    await ReservaPago.destroy({ where: { reserva_id: reservas } });
    await Reserva.destroy({ where: { id: reservas } });
    await PedidoPago.destroy({ where: { pedido_id: pedidos } });
    await DetallePedido.destroy({ where: { pedido_id: pedidos } });
    await Pedido.destroy({ where: { id: pedidos } });
    await LibroCaja.destroy({ where: { sesion_caja_id: sesion.id } });
    await SesionCaja.destroy({ where: { id: sesion.id } });
    await Caja.destroy({ where: { id: caja.id } });
    await RegistroInventario.destroy({ where: { producto_id: plato.id } });
    await Producto.destroy({ where: { id: plato.id } });
    await Categoria.destroy({ where: { id: categoria.id } });
    await Mesa.destroy({ where: { id: mesa.id } });
    await Area.destroy({ where: { id: area.id } });
    await Usuario.destroy({ where: { id: [usuario.id, sinAnular.id] } });
    await Rol.destroy({ where: { id: rolSinAnular.id } });
    await Sucursal.destroy({ where: { id: sucursal.id } });
  });

  it('no vino sin elegir destino => 400', async () => {
    const r = await nueva();
    await adelanto(r.id, 40);
    const res = await estado(r.id, { estado: 'no_vino' });
    expect(res.status).toBe(400);
    expect(res.body.mensaje).toBe('Elige si te quedas el adelanto o lo devuelves');
    expect((await Reserva.findByPk(r.id)).estado).toBe('pendiente');
  });

  it('sin adelanto no pide destino', async () => {
    const r = await nueva();
    const res = await estado(r.id, { estado: 'cancelada' });
    expect(res.status).toBe(200);
    expect(res.body.datos).toMatchObject({ estado: 'cancelada', destino_adelanto: null });
  });

  it('no vino reteniendo', async () => {
    const r = await nueva();
    await adelanto(r.id, 40);
    const res = await estado(r.id, { estado: 'no_vino', destino_adelanto: 'retenido' });
    expect(res.status).toBe(200);
    expect(res.body.datos).toMatchObject({ estado: 'no_vino', destino_adelanto: 'retenido', adelantado: 40 });
    expect(await LibroCaja.count({ where: { referencia_id: r.id, tipo: 'egreso', categoria: 'adelantos_reserva' } })).toBe(0);
    // Reabrirla deja el adelanto otra vez a favor del cliente.
    const reabierta = await estado(r.id, { estado: 'pendiente' });
    expect(reabierta.status).toBe(200);
    expect(reabierta.body.datos).toMatchObject({ estado: 'pendiente', destino_adelanto: null, adelantado: 40 });
  });

  it('cancelada devolviendo en efectivo => egreso y destino devuelto', async () => {
    const r = await nueva();
    await adelanto(r.id, 30);
    await adelanto(r.id, 20, 'qr');
    const antes = Number((await SesionCaja.findByPk(sesion.id)).total_devoluciones);
    const res = await estado(r.id, { estado: 'cancelada', destino_adelanto: 'devuelto', metodo_devolucion: 'efectivo' });
    expect(res.status).toBe(200);
    expect(res.body.datos).toMatchObject({ estado: 'cancelada', destino_adelanto: 'devuelto', adelantado: 0 });
    const egreso = await LibroCaja.findOne({ where: { referencia_id: r.id, tipo: 'egreso', categoria: 'adelantos_reserva' } });
    expect(egreso).toMatchObject({ sesion_caja_id: sesion.id, metodo_pago: 'efectivo', concepto: `Devolución adelanto reserva #${r.id} · Familia Cierre` });
    expect(Number(egreso.monto)).toBe(50);
    expect(Number((await SesionCaja.findByPk(sesion.id)).total_devoluciones)).toBe(antes + 50);
    // Ya devuelto: no se puede volver a pendiente.
    const reabrir = await estado(r.id, { estado: 'pendiente' });
    expect(reabrir.status).toBe(409);
    expect(reabrir.body.mensaje).toBe('El adelanto ya se devolvió');
  });

  it('devolver sin elegir cómo => 400', async () => {
    const r = await nueva();
    await adelanto(r.id, 10);
    const res = await estado(r.id, { estado: 'cancelada', destino_adelanto: 'devuelto' });
    expect(res.status).toBe(400);
    expect((await Reserva.findByPk(r.id)).estado).toBe('pendiente');
  });

  it('cajero sin permiso anular no puede devolver => 403', async () => {
    const r = await nueva();
    await adelanto(r.id, 40);
    const res = await estado(r.id, { estado: 'no_vino', destino_adelanto: 'devuelto', metodo_devolucion: 'efectivo' }, tokenSinAnular);
    expect(res.status).toBe(403);
    expect(res.body.mensaje).toBe('Sin permiso: ventas.anular');
    expect(await Reserva.findByPk(r.id)).toMatchObject({ estado: 'pendiente', destino_adelanto: null });
    expect(await LibroCaja.count({ where: { referencia_id: r.id, tipo: 'egreso' } })).toBe(0);
    // Quedarse el adelanto sí puede.
    const retiene = await estado(r.id, { estado: 'no_vino', destino_adelanto: 'retenido' }, tokenSinAnular);
    expect(retiene.status).toBe(200);
  });

  it('no vino con pedido en cocina lo cancela y libera la mesa', async () => {
    const anulacion = jest.spyOn(ventasService, 'emitirAnulacionCocina');
    const r = await nueva({ mesa_id: mesa.id, items: [{ producto_id: plato.id, cantidad: 2 }] });
    await adelanto(r.id, 40);
    const conv = await request(app).post(`/api/v1/reservas/${r.id}/cocina`).set(auth());
    expect(conv.status).toBe(200);
    const { pedido } = conv.body.datos;
    expect(pedido).toMatchObject({ tipo: 'mesa', mesa_id: mesa.id });
    expect((await Mesa.findByPk(mesa.id)).estado).toBe('ocupada');

    const res = await estado(r.id, { estado: 'no_vino', destino_adelanto: 'retenido' });
    expect(res.status).toBe(200);
    expect(res.body.datos).toMatchObject({ estado: 'no_vino', destino_adelanto: 'retenido', adelantado: 40 });
    const cancelado = await Pedido.findByPk(pedido.id);
    expect(cancelado).toMatchObject({ estado: 'cancelado', estado_cocina: null });
    expect(Number(cancelado.pagado)).toBe(0);
    const pagos = await PedidoPago.findAll({ where: { pedido_id: pedido.id } });
    expect(pagos.map((p) => [p.modo, p.estado])).toEqual([['adelanto', 'anulado']]);
    expect((await Mesa.findByPk(mesa.id)).estado).toBe('disponible');
    // Cocina se entera de que ya no va.
    expect(anulacion).toHaveBeenCalledWith(pedido.id, expect.any(Array), expect.objectContaining({ estadoCocinaPrevio: 'pendiente' }));
    // El adelanto no salió de la caja.
    expect(await LibroCaja.count({ where: { referencia_id: r.id, tipo: 'egreso' } })).toBe(0);
  });

  it('con el pedido ya cobrado => 409 Esta reserva ya se cobró', async () => {
    const r = await nueva({ items: [{ producto_id: plato.id, cantidad: 1 }] });
    await adelanto(r.id, 20);
    const conv = await request(app).post(`/api/v1/reservas/${r.id}/cocina`).set(auth());
    const { pedido } = conv.body.datos;
    const cobro = await request(app).post(`/api/v1/ventas/${pedido.id}/cobrar`).set(auth()).send({ metodo_pago: 'efectivo', monto_recibido: 30 });
    expect(cobro.status).toBe(200);
    const res = await estado(r.id, { estado: 'cancelada', destino_adelanto: 'devuelto', metodo_devolucion: 'efectivo' });
    expect(res.status).toBe(409);
    expect(res.body.mensaje).toBe('Esta reserva ya se cobró');
    expect((await Reserva.findByPk(r.id)).estado).toBe('pendiente');
    expect(await LibroCaja.count({ where: { referencia_id: r.id, tipo: 'egreso' } })).toBe(0);
  });

  it('llegó sin platos deja el adelanto retenido', async () => {
    const r = await nueva();
    await adelanto(r.id, 60);
    const res = await estado(r.id, { estado: 'llego' });
    expect(res.status).toBe(200);
    expect(res.body.datos).toMatchObject({ estado: 'llego', destino_adelanto: 'retenido', pedido_id: null });
    expect(await Pedido.count({ where: { sucursal_id: sucursal.id, notas: { [Op.like]: `Reserva #${r.id}%` } } })).toBe(0);
  });
});
