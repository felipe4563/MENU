// Notificaciones push: claves VAPID, suscripciones y a quién le llega cada aviso.
const request = require('supertest');
const bcrypt = require('bcryptjs');
const webpush = require('web-push');
const app = require('../src/app');
const { Sucursal, Usuario, Rol, PushSuscripcion } = require('../src/models');
const push = require('../src/modules/push/push.service');

const sub = (n) => ({ endpoint: `https://push.ejemplo.test/envio/${n}`, keys: { p256dh: `p256dh-${n}`, auth: `auth-${n}` } });

describe('Push', () => {
  let sucursal, otra, admin, cajeroOtra, sinPermiso, rolSin, token, tokenSin;
  const auth = (t) => ({ Authorization: `Bearer ${t}` });
  let envio;

  beforeAll(async () => {
    sucursal = await Sucursal.create({ nombre: 'Sucursal Push Test' });
    otra = await Sucursal.create({ nombre: 'Sucursal Push Otra Test' });
    const clave = await bcrypt.hash('clave123', 10);
    const rolAdmin = await Rol.findOne({ where: { nombre: 'Administrador' } });
    rolSin = await Rol.create({ nombre: 'Sin ventas Push Test' });
    admin = await Usuario.create({ rol_id: rolAdmin.id, nombre: 'Push Admin', email: 'push-admin@restaurante.com', contrasena: clave });
    cajeroOtra = await Usuario.create({ rol_id: rolAdmin.id, nombre: 'Push Otra', email: 'push-otra@restaurante.com', contrasena: clave });
    sinPermiso = await Usuario.create({ rol_id: rolSin.id, nombre: 'Push Sin', email: 'push-sin@restaurante.com', contrasena: clave });
    await admin.addSucursal(sucursal);
    await cajeroOtra.addSucursal(otra);
    await sinPermiso.addSucursal(sucursal);
    const login = async (email) => (await request(app).post('/api/v1/auth/login').send({ email, contrasena: 'clave123' })).body.datos.token;
    token = await login(admin.email);
    tokenSin = await login(sinPermiso.email);
  });

  beforeEach(() => { envio = jest.spyOn(webpush, 'sendNotification').mockResolvedValue({ statusCode: 201 }); });
  afterEach(() => envio.mockRestore());

  afterAll(async () => {
    await PushSuscripcion.destroy({ where: { usuario_id: [admin.id, cajeroOtra.id, sinPermiso.id] } });
    await Usuario.destroy({ where: { id: [admin.id, cajeroOtra.id, sinPermiso.id] } });
    await rolSin.destroy();
    await Sucursal.destroy({ where: { id: [sucursal.id, otra.id] } });
  });

  it('da siempre la misma clave pública, creada la primera vez', async () => {
    const a = await request(app).get('/api/v1/push/clave').set(auth(token));
    push._reiniciarClaves();
    const b = await request(app).get('/api/v1/push/clave').set(auth(token));
    expect(a.status).toBe(200);
    expect(a.body.datos.clave).toMatch(/^[A-Za-z0-9_-]{80,}$/);
    expect(b.body.datos.clave).toBe(a.body.datos.clave);
  });

  it('guarda la suscripción, y si otro usuario entra en el mismo dispositivo pasa a él', async () => {
    expect((await request(app).post('/api/v1/push/suscripcion').set(auth(token)).send({ suscripcion: sub(1), dispositivo: 'Chrome' })).status).toBe(201);
    expect((await request(app).post('/api/v1/push/suscripcion').set(auth(tokenSin)).send({ suscripcion: sub(1) })).status).toBe(201);
    const filas = await PushSuscripcion.findAll({ where: { endpoint: sub(1).endpoint } });
    expect(filas).toHaveLength(1);
    expect(filas[0].usuario_id).toBe(sinPermiso.id);
  });

  it('rechaza una suscripción que no es de un servicio push', async () => {
    const r = await request(app).post('/api/v1/push/suscripcion').set(auth(token)).send({ suscripcion: { endpoint: 'http://inseguro.test/x', keys: { p256dh: 'a', auth: 'b' } } });
    expect(r.status).toBe(400);
  });

  it('avisa solo a quien tiene el permiso y trabaja en esa sucursal', async () => {
    await push.suscribir(admin.id, sub(2));
    await push.suscribir(cajeroOtra.id, sub(3));
    await push.suscribir(sinPermiso.id, sub(4));
    const n = await push.aPermiso({ modulo: 'ventas', accion: 'crear', sucursal_id: sucursal.id }, { titulo: 'Pedido' });
    const destinos = envio.mock.calls.map((c) => c[0].endpoint);
    expect(destinos).toContain(sub(2).endpoint);
    expect(destinos).not.toContain(sub(3).endpoint);
    expect(destinos).not.toContain(sub(4).endpoint);
    expect(n).toBe(destinos.length);
    expect(JSON.parse(envio.mock.calls[0][1])).toEqual({ titulo: 'Pedido' });
  });

  it('borra la suscripción que el servicio da por muerta (410)', async () => {
    envio.mockRejectedValueOnce(Object.assign(new Error('Gone'), { statusCode: 410 }));
    await push.aUsuarios([cajeroOtra.id], { titulo: 'x' });
    expect(await PushSuscripcion.count({ where: { usuario_id: cajeroOtra.id } })).toBe(0);
  });

  it('probar: avisa en el propio dispositivo; sin dispositivos responde 409', async () => {
    expect((await request(app).post('/api/v1/push/probar').set(auth(token))).status).toBe(200);
    await request(app).delete('/api/v1/push/suscripcion').set(auth(token)).send({ endpoint: sub(2).endpoint });
    expect((await request(app).post('/api/v1/push/probar').set(auth(token))).status).toBe(409);
  });
});
