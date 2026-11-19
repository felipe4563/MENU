// La reserva pasa a cocina como pedido: precio congelado, el adelanto ya
// pagado se descuenta (sin contarlo dos veces en la caja) y "Llegó" puede
// pasar a una mesa el pedido que salió para llevar.
const request = require('supertest');
const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');
const app = require('../src/app');
const push = require('../src/modules/push/push.service');
const convertir = require('../src/modules/reservas/convertir.service');
const {
  Sucursal, Area, Mesa, Rol, Usuario, Caja, SesionCaja, LibroCaja, Categoria, Producto, RegistroInventario,
  Reserva, ReservaItem, ReservaPago, Pedido, DetallePedido, PedidoPago, PedidoPagoItem, Configuracion,
} = require('../src/models');

describe('Convertir la reserva en pedido', () => {
  let sucursal, area, mesa1, mesa2, usuario, token, caja, sesion, categoria, plato, aviso, flujoAntes;
  const manana = new Date(Date.now() - 4 * 3600000 + 86400000).toISOString().slice(0, 10);
  const auth = () => ({ Authorization: `Bearer ${token}` });
  let hora = 8;
  // Cada reserva a otra hora, para que no se crucen en la misma mesa.
  const nueva = async (body = {}) => {
    hora += 1;
    const res = await request(app).post('/api/v1/reservas').set(auth())
      .send({ nombre_cliente: 'Familia Cocina', personas: 4, fecha_hora: `${manana}T${String(hora).padStart(2, '0')}:00`, ...body });
    expect(res.status).toBe(201);
    return res.body.datos;
  };
  const cocina = (id) => request(app).post(`/api/v1/reservas/${id}/cocina`).set(auth());
  const delReserva = (id) => ({ notas: { [Op.or]: [{ [Op.eq]: `Reserva #${id}` }, { [Op.like]: `Reserva #${id} · %` }] } });

  beforeAll(async () => {
    sucursal = await Sucursal.create({ nombre: 'Sucursal Convertir Reserva Test' });
    area = await Area.create({ nombre: 'Area Convertir Reserva Test', sucursal_id: sucursal.id });
    mesa1 = await Mesa.create({ area_id: area.id, nombre: 'Mesa Convertir 1' });
    mesa2 = await Mesa.create({ area_id: area.id, nombre: 'Mesa Convertir 2' });
    const rol = await Rol.findOne({ where: { nombre: 'Administrador' } });
    usuario = await Usuario.create({ rol_id: rol.id, nombre: 'Convertir Test', email: 'convertir-reserva-test@restaurante.com', contrasena: await bcrypt.hash('clave123', 10) });
    await usuario.addSucursal(sucursal);
    token = (await request(app).post('/api/v1/auth/login').send({ email: 'convertir-reserva-test@restaurante.com', contrasena: 'clave123' })).body.datos.token;
    caja = await Caja.create({ sucursal_id: sucursal.id, nombre: 'Caja Convertir Test' });
    sesion = await SesionCaja.create({ usuario_id: usuario.id, sucursal_id: sucursal.id, caja_id: caja.id, monto_apertura: 0 });
    categoria = await Categoria.create({ nombre: 'Categoria Convertir Test' });
    plato = await Producto.create({ categoria_id: categoria.id, nombre: 'Plato Convertir', precio: 50 });
    // Cocina en pantalla: el pedido de la reserva aparece en Cocina.
    flujoAntes = await Configuracion.findOne({ where: { clave: 'flujo_cocina' } });
    await Configuracion.upsert({ clave: 'flujo_cocina', valor: 'digital' });
  });

  beforeEach(() => { aviso = jest.spyOn(push, 'aPermiso').mockResolvedValue(0); });
  afterEach(() => { aviso.mockRestore(); });

  afterAll(async () => {
    if (flujoAntes) await Configuracion.upsert({ clave: 'flujo_cocina', valor: flujoAntes.valor });
    else await Configuracion.destroy({ where: { clave: 'flujo_cocina' } });
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
    await SesionCaja.destroy({ where: { id: sesion.id } });
    await Caja.destroy({ where: { id: caja.id } });
    await RegistroInventario.destroy({ where: { producto_id: plato.id } });
    await Producto.destroy({ where: { id: plato.id } });
    await Categoria.destroy({ where: { id: categoria.id } });
    await Mesa.destroy({ where: { id: [mesa1.id, mesa2.id] } });
    await Area.destroy({ where: { id: area.id } });
    await Usuario.destroy({ where: { id: usuario.id } });
    await Sucursal.destroy({ where: { id: sucursal.id } });
  });

  let convertida;

  it('convierte con precio congelado y descuenta el adelanto', async () => {
    const r = await nueva({ items: [{ producto_id: plato.id, cantidad: 2 }] });
    const ad = await request(app).post(`/api/v1/reservas/${r.id}/adelantos`).set(auth()).send({ metodo_pago: 'efectivo', monto: 40 });
    expect(ad.status).toBe(201);
    await plato.update({ precio: 70 });

    const res = await cocina(r.id);
    expect(res.status).toBe(200);
    const { reserva, pedido } = res.body.datos;
    expect(Number(pedido.total)).toBe(100);
    expect(Number(pedido.pagado)).toBe(40);
    expect(pedido.estado).toBe('pendiente');
    expect(pedido.estado_cocina).not.toBeNull();
    expect(pedido.notas).toBe(`Reserva #${r.id}`);
    expect(pedido.nombre_cliente).toBe('Familia Cocina');
    expect(pedido.pagos).toHaveLength(1);
    expect(pedido.pagos[0]).toMatchObject({ modo: 'adelanto', persona: 'Adelanto reserva', metodo_pago: 'efectivo', estado: 'completado', sesion_caja_id: sesion.id });
    expect(Number(pedido.pagos[0].monto)).toBe(40);
    expect(reserva.pedido_id).toBe(pedido.id);
    expect(reserva.enviada_cocina_en).not.toBeNull();
    // El adelanto no vuelve a entrar a la caja al convertir.
    expect(await LibroCaja.count({ where: { sesion_caja_id: sesion.id, referencia_id: pedido.id, categoria: { [Op.ne]: 'adelantos_reserva' } } })).toBe(0);
    expect(Number((await SesionCaja.findByPk(sesion.id)).total_ventas)).toBe(40);

    await new Promise((resolve) => setImmediate(resolve));
    expect(aviso).toHaveBeenCalledWith(
      { modulo: 'ventas', accion: 'crear', sucursal_id: sucursal.id },
      { titulo: 'Reserva en cocina', cuerpo: `Reserva de Familia Cocina (${String(hora).padStart(2, '0')}:00) · ya está en cocina`, url: `/vender/pedido/${pedido.id}`, etiqueta: `reserva-${r.id}` },
    );
    convertida = { reserva: r, pedido };
  });

  it('cobrar lo que falta no cuenta dos veces el adelanto', async () => {
    const { reserva, pedido } = convertida;
    const res = await request(app).post(`/api/v1/ventas/${pedido.id}/cobrar`).set(auth()).send({ metodo_pago: 'efectivo', monto_recibido: 60 });
    expect(res.status).toBe(200);
    // El ticket final muestra el adelanto como la primera parte pagada.
    const partes = res.body.datos.datos_impresion?.caja?.partes;
    if (partes) {
      expect(partes).toEqual([
        { numero: 1, persona: 'Adelanto reserva', metodo_pago: 'efectivo', monto: 40 },
        { numero: 2, persona: null, metodo_pago: 'efectivo', monto: 60 },
      ]);
    }
    const final = await Pedido.findByPk(pedido.id);
    expect(final.estado).toBe('completado');
    expect(Number(final.pagado)).toBe(100);
    const delPedido = await LibroCaja.sum('monto', { where: { sesion_caja_id: sesion.id, tipo: 'ingreso', referencia_id: pedido.id, concepto: { [Op.like]: `Venta #${pedido.id}%` } } });
    const deLaReserva = await LibroCaja.sum('monto', { where: { sesion_caja_id: sesion.id, tipo: 'ingreso', referencia_id: reserva.id, categoria: 'adelantos_reserva' } });
    expect(Number(delPedido)).toBe(60);
    expect(Number(deLaReserva)).toBe(40);
    expect(Number(delPedido) + Number(deLaReserva)).toBe(Number(final.total));
    expect(await LibroCaja.count({ where: { sesion_caja_id: sesion.id, tipo: 'ingreso', monto: 100 } })).toBe(0);
    expect(Number((await SesionCaja.findByPk(sesion.id)).total_ventas)).toBe(100);
  });

  it('adelantos mixtos: una parte por método y la devolución se descuenta', async () => {
    const r = await nueva({ items: [{ producto_id: plato.id, cantidad: 2 }] });
    await request(app).post(`/api/v1/reservas/${r.id}/adelantos`).set(auth()).send({ metodo_pago: 'efectivo', monto: 30 });
    await request(app).post(`/api/v1/reservas/${r.id}/adelantos`).set(auth()).send({ metodo_pago: 'qr', monto: 50 });
    await require('../src/modules/reservas/adelantos.service').devolverAdelanto(r.id, usuario.id, { metodo_pago: 'efectivo', monto: 10 }, { sucursal_id: sucursal.id, acceso_todas: false });
    const res = await cocina(r.id);
    expect(res.status).toBe(200);
    const { pedido } = res.body.datos;
    expect(Number(pedido.total)).toBe(140);
    expect(Number(pedido.pagado)).toBe(70);
    expect(pedido.pagos.map((p) => [p.metodo_pago, Number(p.monto), p.modo])).toEqual([['efectivo', 20, 'adelanto'], ['qr', 50, 'adelanto']]);
  });

  it('una devolución por otro método se descuenta del otro adelanto', () => {
    const { _adelantosPorMetodo } = convertir;
    const pagos = [
      { id: 1, tipo: 'adelanto', metodo_pago: 'qr', monto: '50.00', estado: 'completado', sesion_caja_id: 7, usuario_id: 3 },
      { id: 2, tipo: 'devolucion', metodo_pago: 'efectivo', monto: '20.00', estado: 'completado', sesion_caja_id: 8, usuario_id: 3 },
      { id: 3, tipo: 'adelanto', metodo_pago: 'efectivo', monto: '99.00', estado: 'anulado', sesion_caja_id: 8, usuario_id: 3 },
    ];
    expect(_adelantosPorMetodo(pagos)).toEqual([{ metodo_pago: 'qr', monto: 30, sesion_caja_id: 7, usuario_id: 3 }]);
    expect(_adelantosPorMetodo([{ ...pagos[0] }, { ...pagos[1], monto: '50.00' }])).toEqual([]);
  });

  it('convertir dos veces crea un solo pedido', async () => {
    const r = await nueva({ items: [{ producto_id: plato.id, cantidad: 1 }] });
    const [a, b] = await Promise.all([
      convertir.convertirEnPedido(r.id, usuario.id),
      convertir.convertirEnPedido(r.id, usuario.id),
    ]);
    expect(await Pedido.count({ where: delReserva(r.id) })).toBe(1);
    expect(a.pedido.id).toBe(b.pedido.id);
    expect((await Reserva.findByPk(r.id)).pedido_id).toBe(a.pedido.id);
    // Una tercera vez tampoco crea otro.
    const c = await convertir.convertirEnPedido(r.id, usuario.id);
    expect(c.pedido.id).toBe(a.pedido.id);
    expect(await Pedido.count({ where: delReserva(r.id) })).toBe(1);
  });

  it('sin platos no crea pedido', async () => {
    const r = await nueva();
    const res = await cocina(r.id);
    expect(res.status).toBe(200);
    expect(res.body.datos.pedido).toBeNull();
    expect(res.body.datos.reserva.pedido_id).toBeNull();
    expect(await Pedido.count({ where: delReserva(r.id) })).toBe(0);
  });

  it('mesa ocupada => llevar y luego llegó con mesa libre la pasa a mesa', async () => {
    const r = await nueva({ mesa_id: mesa1.id, items: [{ producto_id: plato.id, cantidad: 1 }] });
    await mesa1.update({ estado: 'ocupada' });
    const res = await cocina(r.id);
    expect(res.status).toBe(200);
    const { pedido } = res.body.datos;
    expect(pedido).toMatchObject({ tipo: 'llevar', mesa_id: null });

    // La otra mesa también ocupada: 409 y nada cambia.
    await mesa2.update({ estado: 'ocupada' });
    const ocupada = await request(app).put(`/api/v1/reservas/${r.id}/estado`).set(auth()).send({ estado: 'llego', mesa_id: mesa2.id });
    expect(ocupada.status).toBe(409);
    expect(ocupada.body.mensaje).toBe('Mesa ya ocupada');
    expect((await Reserva.findByPk(r.id)).estado).toBe('pendiente');
    await mesa2.update({ estado: 'disponible' });

    const llego = await request(app).put(`/api/v1/reservas/${r.id}/estado`).set(auth()).send({ estado: 'llego', mesa_id: mesa2.id });
    expect(llego.status).toBe(200);
    expect(llego.body.datos.estado).toBe('llego');
    const enMesa = await Pedido.findByPk(pedido.id);
    expect(enMesa).toMatchObject({ tipo: 'mesa', mesa_id: mesa2.id });
    expect((await Mesa.findByPk(mesa2.id)).estado).toBe('ocupada');
    expect(await Pedido.count({ where: delReserva(r.id) })).toBe(1);
    await mesa1.update({ estado: 'disponible' });
  });

  it('llegó sin pedido lo manda a cocina en la mesa elegida', async () => {
    const r = await nueva({ items: [{ producto_id: plato.id, cantidad: 1 }] });
    await mesa1.update({ estado: 'disponible' });
    const res = await request(app).put(`/api/v1/reservas/${r.id}/estado`).set(auth()).send({ estado: 'llego', mesa_id: mesa1.id });
    expect(res.status).toBe(200);
    expect(res.body.datos.estado).toBe('llego');
    const pedido = await Pedido.findByPk(res.body.datos.pedido_id);
    expect(pedido).toMatchObject({ tipo: 'mesa', mesa_id: mesa1.id, estado: 'pendiente' });
    expect((await Mesa.findByPk(mesa1.id)).estado).toBe('ocupada');
    await mesa1.update({ estado: 'disponible' });
  });

  it('llegó con la mesa elegida ocupada: sale para llevar y queda llegó', async () => {
    const r = await nueva({ items: [{ producto_id: plato.id, cantidad: 1 }] });
    await mesa2.update({ estado: 'ocupada' });
    const res = await request(app).put(`/api/v1/reservas/${r.id}/estado`).set(auth()).send({ estado: 'llego', mesa_id: mesa2.id });
    expect(res.status).toBe(200);
    expect(res.body.datos.estado).toBe('llego');
    expect(await Pedido.findByPk(res.body.datos.pedido_id)).toMatchObject({ tipo: 'llevar', mesa_id: null });
    await mesa2.update({ estado: 'disponible' });
  });

  it('sin caja abierta en la sucursal => 409', async () => {
    const r = await nueva({ items: [{ producto_id: plato.id, cantidad: 1 }] });
    await sesion.update({ estado: 'cerrada' });
    try {
      const res = await cocina(r.id);
      expect(res.status).toBe(409);
      expect(res.body.mensaje).toBe('Abre una caja para mandar la reserva a cocina');
      const llego = await request(app).put(`/api/v1/reservas/${r.id}/estado`).set(auth()).send({ estado: 'llego' });
      expect(llego.status).toBe(409);
      expect((await Reserva.findByPk(r.id)).estado).toBe('pendiente');
      expect(await Pedido.count({ where: delReserva(r.id) })).toBe(0);
    } finally {
      await sesion.update({ estado: 'abierta' });
    }
  });

  it('crearCompleta por HTTP ignora precios_fijos', async () => {
    const res = await request(app).post('/api/v1/ventas/completa').set(auth()).send({
      tipo: 'llevar', sesion_caja_id: sesion.id, items: [{ producto_id: plato.id, cantidad: 1 }],
      metodo_pago: 'efectivo', monto_recibido: 100, precios_fijos: [1],
    });
    expect(res.status).toBe(201);
    expect(Number(res.body.datos.total)).toBe(70);
    expect(Number(res.body.datos.detalles[0].precio)).toBe(70);
  });

  it('la venta del servicio sí respeta precios_fijos', async () => {
    const ventas = require('../src/modules/ventas/ventas.service');
    const creado = await ventas.crearCompleta({
      tipo: 'llevar', sesion_caja_id: sesion.id, usuario_id: usuario.id, items: [{ producto_id: plato.id, cantidad: 2 }],
      metodo_pago: 'diferido', precios_fijos: [45.5],
    });
    expect(Number(creado.total)).toBe(91);
    expect(Number(creado.detalles[0].precio)).toBe(45.5);
  });

  it('convertirEnPedido revisa el alcance desde la API', async () => {
    const otra = await Sucursal.create({ nombre: 'Sucursal Ajena Convertir Test' });
    try {
      const r = await Reserva.create({ sucursal_id: otra.id, nombre_cliente: 'Ajena', personas: 2, fecha_hora: `${manana}T20:00:00-04:00` });
      const res = await cocina(r.id);
      expect(res.status).toBe(404);
      await Reserva.destroy({ where: { id: r.id } });
    } finally {
      await Sucursal.destroy({ where: { id: otra.id } });
    }
  });

  it('no convierte una reserva cancelada', async () => {
    const r = await nueva({ items: [{ producto_id: plato.id, cantidad: 1 }] });
    await Reserva.update({ estado: 'cancelada' }, { where: { id: r.id } });
    const res = await cocina(r.id);
    expect(res.status).toBe(409);
    await expect(convertir.convertirEnPedido(r.id, usuario.id)).rejects.toMatchObject({ status: 409 });
  });
});
