// PIN de usuarios: crear/cambiar, reiniciar y que el hash nunca se exponga.
const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const { Sucursal, Usuario, Rol } = require('../src/models');

describe('PIN de usuarios', () => {
  let sucursal, admin, cajero, tokenAdmin, tokenCajero;
  const authA = () => ({ Authorization: `Bearer ${tokenAdmin}` });
  const authC = () => ({ Authorization: `Bearer ${tokenCajero}` });
  const login = (email) => request(app).post('/api/v1/auth/login').send({ email, contrasena: 'clave123' });

  beforeAll(async () => {
    sucursal = await Sucursal.create({ nombre: 'Sucursal PIN Test' });
    const rolAdmin = await Rol.findOne({ where: { nombre: 'Administrador' } });
    const rolCajero = await Rol.findOne({ where: { nombre: 'Cajero' } });
    const hash = await bcrypt.hash('clave123', 10);
    admin = await Usuario.create({ rol_id: rolAdmin.id, nombre: 'Admin PIN Test', email: 'admin-pin-test@restaurante.com', contrasena: hash });
    cajero = await Usuario.create({ rol_id: rolCajero.id, nombre: 'Cajero PIN Test', email: 'cajero-pin-test@restaurante.com', contrasena: hash });
    await admin.addSucursal(sucursal);
    await cajero.addSucursal(sucursal);
    tokenAdmin = (await login('admin-pin-test@restaurante.com')).body.datos.token;
    tokenCajero = (await login('cajero-pin-test@restaurante.com')).body.datos.token;
  });

  afterAll(async () => {
    await Usuario.destroy({ where: { id: [admin.id, cajero.id] } });
    await Sucursal.destroy({ where: { id: sucursal.id } });
  });

  it('crea el PIN con la contraseña correcta', async () => {
    const r = await request(app).put('/api/v1/perfil/pin').set(authC()).send({ contrasena: 'clave123', pin: '1234' });
    expect(r.status).toBe(200);
    expect(r.body.datos).toEqual({ tiene_pin: true });
    await cajero.update({ pin_intentos: 3, pin_bloqueado: 1 });
    await request(app).put('/api/v1/perfil/pin').set(authC()).send({ contrasena: 'clave123', pin: '4321' });
    await cajero.reload();
    expect(cajero.pin).not.toBe('4321');
    expect(await bcrypt.compare('4321', cajero.pin)).toBe(true);
    expect(cajero.pin_intentos).toBe(0);
    expect(cajero.pin_bloqueado).toBe(0);
  });

  it('rechaza PIN que no son 4 números', async () => {
    for (const pin of ['12a4', '123', '12345']) {
      const r = await request(app).put('/api/v1/perfil/pin').set(authC()).send({ contrasena: 'clave123', pin });
      expect(r.status).toBe(400);
      expect(r.body.mensaje).toBe('El PIN son 4 números');
    }
  });

  it('rechaza contraseña incorrecta', async () => {
    const r = await request(app).put('/api/v1/perfil/pin').set(authC()).send({ contrasena: 'mala', pin: '1234' });
    expect(r.status).toBe(401);
    expect(r.body.mensaje).toBe('La contraseña no es correcta');
  });

  it('el login devuelve tiene_pin', async () => {
    const r = await login('cajero-pin-test@restaurante.com');
    expect(r.body.datos.usuario.tiene_pin).toBe(true);
    tokenCajero = r.body.datos.token;
    const a = await login('admin-pin-test@restaurante.com');
    expect(a.body.datos.usuario.tiene_pin).toBe(false);
    tokenAdmin = a.body.datos.token;
    const p = await request(app).get('/api/v1/perfil').set(authC());
    expect(p.body.datos.tiene_pin).toBe(true);
    expect(p.body.datos.pin).toBeUndefined();
  });

  it('GET /usuarios no expone pin', async () => {
    const lista = await request(app).get('/api/v1/usuarios').set(authA());
    expect(lista.status).toBe(200);
    for (const u of lista.body.datos) expect(u).not.toHaveProperty('pin');
    const uno = await request(app).get(`/api/v1/usuarios/${cajero.id}`).set(authA());
    expect(uno.body.datos).not.toHaveProperty('pin');
  });

  it('el admin reinicia el PIN de otro', async () => {
    await cajero.update({ pin_intentos: 4, pin_bloqueado: 1 });
    const r = await request(app).delete(`/api/v1/usuarios/${cajero.id}/pin`).set(authA());
    expect(r.status).toBe(200);
    await cajero.reload();
    expect(cajero.pin).toBeNull();
    expect(cajero.pin_intentos).toBe(0);
    expect(cajero.pin_bloqueado).toBe(0);
  });

  it('cajero sin usuarios.editar no puede reiniciar', async () => {
    const r = await request(app).delete(`/api/v1/usuarios/${admin.id}/pin`).set(authC());
    expect(r.status).toBe(403);
  });

  it('login con correo pone pin_intentos 0 y pin_bloqueado 0', async () => {
    await cajero.update({ pin_intentos: 5, pin_bloqueado: 1 });
    expect((await login('cajero-pin-test@restaurante.com')).status).toBe(200);
    await cajero.reload();
    expect(cajero.pin_intentos).toBe(0);
    expect(cajero.pin_bloqueado).toBe(0);
  });
});
