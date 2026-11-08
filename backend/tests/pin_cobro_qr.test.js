const request = require('supertest');
const app = require('../src/app');
const bcrypt = require('bcryptjs');
const { Configuracion, Usuario, Rol, Sucursal } = require('../src/models');
const { borrarPin } = require('../src/modules/configuracion/pinCobroQr');

const CLAVE_ADMIN = process.env.ADMIN_PASSWORD || 'admin123';
const GUARDADAS = ['qr_proveedor', 'qr_propio_imagen', 'qr_ultimo_cambio'];

describe('PIN de pagos (Cobro con QR)', () => {
  let token, antes, otroAdmin, tokenOtro;
  const api = (metodo, ruta, pase) => {
    const r = request(app)[metodo](`/api/v1/configuracion/cobro-qr${ruta}`).set('Authorization', `Bearer ${token}`);
    return pase ? r.set('x-pase-cobro-qr', pase) : r;
  };

  beforeAll(async () => {
    const login = await request(app).post('/api/v1/auth/login').send({ email: 'admin@restaurante.com', contrasena: CLAVE_ADMIN });
    token = login.body.datos.token;
    antes = await Configuracion.findAll({ where: { clave: GUARDADAS } });
    await borrarPin();
    // Otro administrador del mismo negocio: tiene el permiso, pero no es el titular.
    const rol = await Rol.findOne({ where: { nombre: 'Administrador' } });
    otroAdmin = await Usuario.create({ rol_id: rol.id, nombre: 'Encargada PinQr Test', email: 'encargada-pinqr-test@restaurante.com', contrasena: await bcrypt.hash('clave123', 10) });
    await otroAdmin.addSucursal(await Sucursal.findOne({ order: [['id', 'ASC']] }));
    const l2 = await request(app).post('/api/v1/auth/login').send({ email: otroAdmin.email, contrasena: 'clave123' });
    tokenOtro = l2.body.datos.token ?? (await request(app).post('/api/v1/auth/login/sucursal')
      .send({ pre_token: l2.body.datos.pre_token, sucursal_id: l2.body.datos.sucursales[0].id })).body.datos.token;
  });

  afterAll(async () => {
    await borrarPin();
    await otroAdmin.setSucursales([]);
    await otroAdmin.destroy();
    await Configuracion.destroy({ where: { clave: GUARDADAS } });
    for (const f of antes) await Configuracion.create({ clave: f.clave, valor: f.valor });
  });

  test('sin PIN creado: la pantalla no muestra datos y pide crearlo', async () => {
    const res = await api('get', '');
    expect(res.status).toBe(200);
    expect(res.body.datos.pin_creado).toBe(false);
    expect(res.body.datos.desbloqueado).toBe(false);
    expect(res.body.datos.baneco.usuario).toBeUndefined();
    expect(res.body.datos.qr_propio_imagen).toBeUndefined();
  });

  test('crear el PIN pide la contraseña y rechaza PIN fáciles', async () => {
    expect((await api('post', '/pin').send({ pin: '123456', contrasena: CLAVE_ADMIN })).status).toBe(400);
    expect((await api('post', '/pin').send({ pin: '111111', contrasena: CLAVE_ADMIN })).status).toBe(400);
    expect((await api('post', '/pin').send({ pin: '12a456', contrasena: CLAVE_ADMIN })).status).toBe(400);
    expect((await api('post', '/pin').send({ pin: '482916', contrasena: 'mala' })).status).toBe(403);

    const ok = await api('post', '/pin').send({ pin: '482916', contrasena: CLAVE_ADMIN });
    expect(ok.status).toBe(200);
    expect(ok.body.datos.pase).toBeTruthy();
    expect((await api('post', '/pin').send({ pin: '573920', contrasena: CLAVE_ADMIN })).status).toBe(409);
  });

  test('quien creó el PIN queda como titular: otro administrador no entra ni con el PIN', async () => {
    const otro = (metodo, ruta) => request(app)[metodo](`/api/v1/configuracion/cobro-qr${ruta}`).set('Authorization', `Bearer ${tokenOtro}`);
    const ver = await otro('get', '');
    expect(ver.body.datos.puede_configurar).toBe(false);
    expect(ver.body.datos.titular.nombre).toBeTruthy();
    expect(ver.body.datos.baneco.usuario).toBeUndefined();

    const abrir = await otro('post', '/desbloquear').send({ pin: '482916' });
    expect(abrir.status).toBe(403);
    expect(abrir.body.codigo).toBe('NO_TITULAR');
    expect((await otro('post', '/pin').send({ pin: '573920', contrasena: 'clave123' })).status).toBe(409);

    const mio = await api('get', '');
    expect(mio.body.datos.puede_configurar).toBe(true);
  });

  test('el pase no sirve como token de sesión', async () => {
    const { body } = await api('post', '/desbloquear').send({ pin: '482916' });
    const res = await request(app).get('/api/v1/configuracion').set('Authorization', `Bearer ${body.datos.pase}`);
    expect(res.status).toBe(401);
  });

  test('con el pase se ven los datos; guardar exige el pase y el PIN', async () => {
    const { body } = await api('post', '/desbloquear').send({ pin: '482916' });
    const pase = body.datos.pase;

    const ver = await api('get', '', pase);
    expect(ver.body.datos.desbloqueado).toBe(true);
    expect(ver.body.datos.pin_creado).toBe(true);

    const cambio = { qr_proveedor: 'propio', qr_propio_imagen: '/uploads/qr-test.png' };
    const sinPase = await api('put', '').send({ ...cambio, pin: '482916' });
    expect(sinPase.status).toBe(403);
    expect(sinPase.body.codigo).toBe('PIN_REQUERIDO');
    expect((await api('put', '', pase).send({ ...cambio, pin: '000001' })).status).toBe(403);

    const ok = await api('put', '', pase).send({ ...cambio, pin: '482916' });
    expect(ok.status).toBe(200);
    expect(ok.body.datos.qr_proveedor).toBe('propio');
    expect(ok.body.datos.desbloqueado).toBe(true);
  });

  test('probar conexión exige el pase', async () => {
    expect((await api('post', '/probar')).status).toBe(403);
  });

  test('5 PIN fallados bloquean, aunque después se escriba el correcto', async () => {
    for (let i = 0; i < 4; i++) {
      const r = await api('post', '/desbloquear').send({ pin: '000000' });
      expect(r.status).toBe(403);
    }
    const quinto = await api('post', '/desbloquear').send({ pin: '000000' });
    expect(quinto.status).toBe(423);
    const correcto = await api('post', '/desbloquear').send({ pin: '482916' });
    expect(correcto.status).toBe(423);
    expect(correcto.body.codigo).toBe('PIN_BLOQUEADO');
  });

  test('la configuración general no deja leer ni tocar el PIN', async () => {
    const todo = await request(app).get('/api/v1/configuracion').set('Authorization', `Bearer ${token}`);
    expect(Object.keys(todo.body.datos).some((k) => k.startsWith('qr_pin'))).toBe(false);
    const tocar = await request(app).put('/api/v1/configuracion').set('Authorization', `Bearer ${token}`).send({ qr_pin_bloqueo: '' });
    expect(tocar.status).toBe(403);
  });
});
