// Reservas con platos y adelanto: datos (tablas, asociaciones y modo de pago).
const bcrypt = require('bcryptjs');
const { Sucursal, Rol, Usuario, Reserva, ReservaItem, ReservaPago, Pedido, PedidoPago, CategoriaFlujo } = require('../src/models');

describe('Reservas con platos y adelanto (datos)', () => {
  let sucursal, usuario, reserva, pedido;

  beforeAll(async () => {
    sucursal = await Sucursal.create({ nombre: 'Sucursal Reservas Platos Test' });
    const rol = await Rol.findOne({ where: { nombre: 'Administrador' } });
    usuario = await Usuario.create({ rol_id: rol.id, nombre: 'Reservas Platos Test', email: 'reservas-platos-test@restaurante.com', contrasena: await bcrypt.hash('clave123', 10) });
    reserva = await Reserva.create({ sucursal_id: sucursal.id, nombre_cliente: 'Familia Platos', personas: 4, fecha_hora: new Date(Date.now() + 86400000) });
  });

  afterAll(async () => {
    if (pedido) { await PedidoPago.destroy({ where: { pedido_id: pedido.id } }); await Pedido.destroy({ where: { id: pedido.id } }); }
    await Reserva.destroy({ where: { sucursal_id: sucursal.id } });
    await Usuario.destroy({ where: { id: usuario.id } });
    await Sucursal.destroy({ where: { id: sucursal.id } });
  });

  it('crea reserva con items y pagos y los trae por asociación', async () => {
    await ReservaItem.create({ reserva_id: reserva.id, nombre: 'Pique macho', cantidad: 2, precio: 55.5 });
    await ReservaPago.create({ reserva_id: reserva.id, usuario_id: usuario.id, tipo: 'adelanto', metodo_pago: 'efectivo', monto: 50 });
    const r = await Reserva.findByPk(reserva.id, { include: ['items', 'pagos'] });
    expect(r.items.length).toBe(1);
    expect(r.pagos[0].tipo).toBe('adelanto');
    expect(r.pagos[0].estado).toBe('completado');
    expect(Number(r.items[0].precio)).toBe(55.5);
  });

  it('pedido_pagos acepta modo adelanto', async () => {
    pedido = await Pedido.create({ sucursal_id: sucursal.id, usuario_id: usuario.id, tipo: 'llevar', total: 10 });
    await expect(PedidoPago.create({ pedido_id: pedido.id, usuario_id: usuario.id, metodo_pago: 'efectivo', monto: 10, modo: 'adelanto' })).resolves.toBeDefined();
  });

  it('existe la categoría de flujo adelantos_reserva', async () => {
    const c = await CategoriaFlujo.findOne({ where: { clave: 'adelantos_reserva' } });
    expect(c).toMatchObject({ grupo: 'ingresos', auto: true, sistema: true });
  });
});
