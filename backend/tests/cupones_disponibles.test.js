// Cupones del cliente que se ofrecen en el cobro para elegirlos con un toque.
const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const { Sucursal, Usuario, Rol, Cliente, Cupon, RuletaPremio, RuletaGiro } = require('../src/models');

describe('GET /api/v1/cupones/disponibles', () => {
  let sucursal, usuario, cliente, otro, premio, token;
  const t = Date.now();

  beforeAll(async () => {
    sucursal = await Sucursal.create({ nombre: `Sucursal Cupones Disp ${t}` });
    const rol = await Rol.findOne({ where: { nombre: 'Cajero' } });
    usuario = await Usuario.create({ rol_id: rol.id, nombre: `Cupones Disp ${t}`, email: `cupones-disp-${t}@restaurante.com`, contrasena: await bcrypt.hash('clave123', 10) });
    await usuario.addSucursal(sucursal);
    cliente = await Cliente.create({ nombre: `Cliente Cupones ${t}`, tipo_documento: 'CI', numero_documento: `CD${t}`.slice(0, 15) });
    otro = await Cliente.create({ nombre: `Otro Cupones ${t}`, tipo_documento: 'CI', numero_documento: `CO${t}`.slice(0, 15) });
    premio = await RuletaPremio.create({ nombre: `Salteña gratis ${t}`, tipo: 'fijo', valor: 8, probabilidad: 1, activo: 0 });

    const manana = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const ruleta = await Cupon.create({ codigo: `RULETA${cliente.id}-T${String(t).slice(-5)}`, tipo: 'fijo', valor: 8, usos_maximos: 1, cliente_id: cliente.id, fecha_expiracion: manana });
    await RuletaGiro.create({ cliente_id: cliente.id, premio_id: premio.id, cupon_id: ruleta.id, usuario_id: usuario.id, puntos_gastados: 50 });
    await Cupon.create({ codigo: `CUMPLE${cliente.id}-T${String(t).slice(-4)}`, tipo: 'porcentaje', valor: 15, usos_maximos: 1, cliente_id: cliente.id, fecha_expiracion: manana });
    await Cupon.create({ codigo: `USADO${t}`.slice(0, 30), tipo: 'fijo', valor: 5, usos_maximos: 1, usos_actuales: 1, cliente_id: cliente.id });
    await Cupon.create({ codigo: `AJENO${t}`.slice(0, 30), tipo: 'fijo', valor: 5, usos_maximos: 1, cliente_id: otro.id });

    const login = await request(app).post('/api/v1/auth/login').send({ email: usuario.email, contrasena: 'clave123' });
    token = login.body.datos.token;
  });

  afterAll(async () => {
    await RuletaGiro.destroy({ where: { cliente_id: cliente.id } });
    await Cupon.destroy({ where: { cliente_id: [cliente.id, otro.id] } });
    await RuletaPremio.destroy({ where: { id: premio.id } });
    await Cliente.destroy({ where: { id: [cliente.id, otro.id] } });
    await Usuario.destroy({ where: { id: usuario.id } });
    await Sucursal.destroy({ where: { id: sucursal.id } });
  });

  it('lista solo los cupones vigentes del cliente, con un nombre para elegirlos', async () => {
    const res = await request(app).get('/api/v1/cupones/disponibles').query({ cliente_id: cliente.id }).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const porOrigen = Object.fromEntries(res.body.datos.map((c) => [c.origen, c]));
    expect(res.body.datos).toHaveLength(2);
    expect(porOrigen.ruleta).toMatchObject({ descripcion: `Salteña gratis ${t}` });
    expect(porOrigen.cumpleanos).toMatchObject({ descripcion: 'Regalo de cumpleaños' });
  });

  it('sin cliente devuelve una lista vacía', async () => {
    const res = await request(app).get('/api/v1/cupones/disponibles').set('Authorization', `Bearer ${token}`);
    expect(res.body.datos).toEqual([]);
  });
});
