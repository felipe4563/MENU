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

// Aparato habilitado: el login con sucursal concreta deja un dispositivo_token
// con el que el personal de esa sucursal entra con su PIN.
describe('Entrar con PIN en un aparato habilitado', () => {
  const jwt = require('jsonwebtoken');
  let sucA, sucB, rolCajero, cajeroA, mozoA, bloqueadoA, inactivoA, sinPinA, soloB, todas;
  let dispositivoA;
  const login = (email) => request(app).post('/api/v1/auth/login').send({ email, contrasena: 'clave123' });
  const lista = (dispositivo_token) => request(app).post('/api/v1/auth/pin/usuarios').send({ dispositivo_token });
  const entrar = (usuario_id, pin, dispositivo_token = dispositivoA) =>
    request(app).post('/api/v1/auth/pin').send({ dispositivo_token, usuario_id, pin });

  beforeAll(async () => {
    sucA = await Sucursal.create({ nombre: 'Sucursal PIN A' });
    sucB = await Sucursal.create({ nombre: 'Sucursal PIN B' });
    rolCajero = await Rol.findOne({ where: { nombre: 'Cajero' } });
    const hash = await bcrypt.hash('clave123', 10);
    const pin = await bcrypt.hash('1234', 10);
    const crear = (nombre, extra = {}) => Usuario.create({
      rol_id: rolCajero.id, nombre, email: `${nombre.toLowerCase().replace(/ /g, '-')}@restaurante.com`,
      contrasena: hash, pin, ...extra,
    });
    cajeroA = await crear('PIN Cajero A');
    mozoA = await crear('PIN Mozo A');
    bloqueadoA = await crear('PIN Bloqueado A', { pin_bloqueado: 1, pin_intentos: 5 });
    inactivoA = await crear('PIN Inactivo A', { activo: 0 });
    sinPinA = await crear('PIN Sin Pin A', { pin: null });
    soloB = await crear('PIN Solo B');
    todas = await crear('PIN Todas', { acceso_todas_sucursales: 1 });
    for (const u of [cajeroA, mozoA, bloqueadoA, inactivoA, sinPinA]) await u.addSucursal(sucA);
    await soloB.addSucursal(sucB);
  });

  afterAll(async () => {
    await Usuario.destroy({ where: { id: [cajeroA, mozoA, bloqueadoA, inactivoA, sinPinA, soloB, todas].map(u => u.id) } });
    await Sucursal.destroy({ where: { id: [sucA.id, sucB.id] } });
  });

  it('el login con sucursal concreta trae dispositivo_token', async () => {
    const r = await login(cajeroA.email);
    expect(r.status).toBe(200);
    dispositivoA = r.body.datos.dispositivo_token;
    expect(dispositivoA).toBeDefined();
    const p = jwt.verify(dispositivoA, process.env.JWT_SECRET);
    expect(p.tipo).toBe('dispositivo');
    expect(p.sucursal_id).toBe(sucA.id);
    expect(p.id).toBeUndefined();
  });

  it("con 'Todas las sucursales' no trae dispositivo_token", async () => {
    const r = await login(todas.email);
    expect(r.body.datos.requiere_sucursal).toBe(true);
    const s = await request(app).post('/api/v1/auth/login/sucursal').send({ pre_token: r.body.datos.pre_token, sucursal_id: null });
    expect(s.status).toBe(200);
    expect(s.body.datos.token).toBeDefined();
    expect(s.body.datos.dispositivo_token).toBeUndefined();
    // Eligiendo una sucursal concreta sí lo trae.
    const r2 = await login(todas.email);
    const s2 = await request(app).post('/api/v1/auth/login/sucursal').send({ pre_token: r2.body.datos.pre_token, sucursal_id: sucA.id });
    expect(jwt.verify(s2.body.datos.dispositivo_token, process.env.JWT_SECRET).sucursal_id).toBe(sucA.id);
  });

  it('lista solo usuarios de la sucursal con PIN, activos y no bloqueados', async () => {
    const r = await lista(dispositivoA);
    expect(r.status).toBe(200);
    const ids = r.body.datos.map(u => u.id);
    expect(ids).toEqual(expect.arrayContaining([cajeroA.id, mozoA.id, todas.id]));
    for (const u of [bloqueadoA, inactivoA, sinPinA, soloB]) expect(ids).not.toContain(u.id);
    for (const u of r.body.datos) expect(Object.keys(u).sort()).toEqual(['avatar', 'id', 'nombre']);
    const nombres = r.body.datos.map(u => u.nombre);
    expect(nombres).toEqual([...nombres].sort((a, b) => a.localeCompare(b)));
  });

  it('entra con PIN y no cierra la otra sesión del mismo usuario', async () => {
    const previo = await login(mozoA.email);
    const tokenPrevio = previo.body.datos.token;
    const r = await entrar(mozoA.id, '1234');
    expect(r.status).toBe(200);
    expect(r.body.datos.token).toBeDefined();
    expect(r.body.datos.refresh_token).toBeDefined();
    expect(r.body.datos.dispositivo_token).toBeDefined();
    expect(r.body.datos.usuario.id).toBe(mozoA.id);
    expect(r.body.datos.usuario.tiene_pin).toBe(true);
    expect(r.body.datos.usuario.sucursal_activa).toEqual({ id: sucA.id, nombre: 'Sucursal PIN A' });
    expect(r.body.datos.usuario).not.toHaveProperty('pin');
    const viejo = await request(app).get('/api/v1/auth/yo').set('Authorization', `Bearer ${tokenPrevio}`);
    expect(viejo.status).toBe(200);
    const nuevo = await request(app).get('/api/v1/auth/yo').set('Authorization', `Bearer ${r.body.datos.token}`);
    expect(nuevo.status).toBe(200);
    expect(nuevo.body.datos.sucursal_id).toBe(sucA.id);
    expect(nuevo.body.datos.tiene_pin).toBe(true);
    expect(nuevo.body.datos).not.toHaveProperty('pin');
    const ref = await request(app).post('/api/v1/auth/refresh').send({ refresh_token: r.body.datos.refresh_token });
    expect(ref.status).toBe(200);
  });

  it('usuario de otra sucursal ⇒ 403', async () => {
    const r = await entrar(soloB.id, '1234');
    expect(r.status).toBe(403);
    expect(r.body.mensaje).toBe('Ese usuario no es de esta sucursal');
    const i = await entrar(inactivoA.id, '1234');
    expect(i.status).toBe(403);
  });

  it('PIN que no son 4 números ⇒ 400 y no cuenta como intento', async () => {
    const r = await entrar(cajeroA.id, '12a4');
    expect(r.status).toBe(400);
    expect(r.body.mensaje).toBe('El PIN son 4 números');
    await cajeroA.reload();
    expect(cajeroA.pin_intentos).toBe(0);
  });

  it('PIN correcto resetea intentos', async () => {
    const mal = await entrar(cajeroA.id, '9999');
    expect(mal.status).toBe(401);
    expect(mal.body.mensaje).toBe('PIN incorrecto');
    expect(mal.body.intentos_restantes).toBe(4);
    await cajeroA.reload();
    expect(cajeroA.pin_intentos).toBe(1);
    const bien = await entrar(cajeroA.id, '1234');
    expect(bien.status).toBe(200);
    await cajeroA.reload();
    expect(cajeroA.pin_intentos).toBe(0);
  });

  it('5 PIN mal ⇒ 423 y ya no aparece en la lista', async () => {
    for (let i = 1; i <= 4; i++) {
      const r = await entrar(cajeroA.id, '0000');
      expect(r.status).toBe(401);
      expect(r.body.intentos_restantes).toBe(5 - i);
    }
    const quinto = await entrar(cajeroA.id, '0000');
    expect(quinto.status).toBe(423);
    expect(quinto.body.mensaje).toBe('PIN bloqueado: entra con tu correo');
    await cajeroA.reload();
    expect(cajeroA.pin_bloqueado).toBe(1);
    // Ni con el PIN correcto entra.
    const correcto = await entrar(cajeroA.id, '1234');
    expect(correcto.status).toBe(423);
    const l = await lista(dispositivoA);
    expect(l.body.datos.map(u => u.id)).not.toContain(cajeroA.id);
    const b = await entrar(bloqueadoA.id, '1234');
    expect(b.status).toBe(423);
  });

  it('PIN mal en ráfaga: no se prueban más de 5 y queda bloqueado', async () => {
    await mozoA.update({ pin_intentos: 0, pin_bloqueado: 0 });
    const rs = await Promise.all(Array.from({ length: 8 }, () => entrar(mozoA.id, '0000')));
    const estados = rs.map(r => r.status);
    for (const e of estados) expect([401, 423]).toContain(e);
    // A lo más 4 "PIN incorrecto"; el 5.º y los que sobran, bloqueados.
    expect(estados.filter(e => e === 401).length).toBeLessThanOrEqual(4);
    expect(estados.filter(e => e === 423).length).toBeGreaterThanOrEqual(4);
    await mozoA.reload();
    expect(mozoA.pin_bloqueado).toBe(1);
    expect(mozoA.pin_intentos).toBeLessThanOrEqual(5);
  });

  it('PIN correcto en paralelo con PIN mal no entra si se bloqueó', async () => {
    await mozoA.update({ pin_intentos: 4, pin_bloqueado: 0 });
    // Un PIN mal llega primero y usa el último intento; el correcto, a la vez.
    const [mal, bien] = await Promise.all([entrar(mozoA.id, '0000'), entrar(mozoA.id, '1234')]);
    await mozoA.reload();
    if (bien.status === 200) {
      // El correcto reservó el último intento: el mal no pudo probar nada.
      expect(mal.status).toBe(423);
      expect(mozoA.pin_bloqueado).toBe(0);
    } else {
      expect(bien.status).toBe(423);
      expect(mal.status).toBe(423);
      expect(mozoA.pin_bloqueado).toBe(1);
    }
    // Ya bloqueado: ni en paralelo entra el correcto.
    await mozoA.update({ pin_intentos: 5, pin_bloqueado: 1 });
    const rs = await Promise.all([entrar(mozoA.id, '1234'), entrar(mozoA.id, '0000'), entrar(mozoA.id, '1234')]);
    for (const r of rs) expect(r.status).toBe(423);
    await mozoA.update({ pin_intentos: 0, pin_bloqueado: 0 });
  });

  it('usuario_id no canónico ("05", "5.0", "0x5") ⇒ 400', async () => {
    for (const id of [`0${mozoA.id}`, `${mozoA.id}.0`, `0x${mozoA.id.toString(16)}`, `${mozoA.id}e0`, ' 5', -1, 1.5, true]) {
      const r = await entrar(id, '1234');
      expect(r.status).toBe(400);
      expect(r.body.mensaje).toBe('Usuario no válido');
    }
    // El número y su texto canónico sí valen.
    expect((await entrar(String(mozoA.id), '1234')).status).toBe(200);
    expect((await entrar(mozoA.id, '1234')).status).toBe(200);
  });

  it('dispositivo_token vencido o de tipo distinto ⇒ 401', async () => {
    const msg = 'Este aparato ya no está habilitado: entra con tu correo';
    const vencido = jwt.sign({ tipo: 'dispositivo', sucursal_id: sucA.id }, process.env.JWT_SECRET, { expiresIn: '-1s' });
    const sesion = await login(mozoA.email);
    const { token, refresh_token } = sesion.body.datos;
    const otroSecreto = jwt.sign({ tipo: 'dispositivo', sucursal_id: sucA.id }, 'otro-secreto', { expiresIn: '30d' });
    for (const t of [vencido, refresh_token, token, otroSecreto, '', null]) {
      const r = await entrar(mozoA.id, '1234', t);
      expect(r.status).toBe(401);
      expect(r.body.mensaje).toBe(msg);
      const l = await lista(t);
      expect(l.status).toBe(401);
      expect(l.body.mensaje).toBe(msg);
    }
  });

  it('un dispositivo_token no sirve como token de acceso ni de refresh', async () => {
    const yo = await request(app).get('/api/v1/auth/yo').set('Authorization', `Bearer ${dispositivoA}`);
    expect(yo.status).toBe(401);
    // Aunque traiga un id de usuario, si es de tipo dispositivo no sirve.
    await mozoA.reload();
    const datos = { tipo: 'dispositivo', id: mozoA.id, sucursal_id: sucA.id, sesion_version: mozoA.sesion_version };
    const conId = jwt.sign(datos, process.env.JWT_SECRET, { expiresIn: '30d' });
    const yo2 = await request(app).get('/api/v1/auth/yo').set('Authorization', `Bearer ${conId}`);
    expect(yo2.status).toBe(401);
    const ref = await request(app).post('/api/v1/auth/refresh').send({ refresh_token: dispositivoA });
    expect(ref.status).toBe(401);
    const conIdRefresh = jwt.sign(datos, process.env.JWT_REFRESH_SECRET, { expiresIn: '30d' });
    const ref2 = await request(app).post('/api/v1/auth/refresh').send({ refresh_token: conIdRefresh });
    expect(ref2.status).toBe(401);
  });
});

// Desbloquear la sesión propia con PIN sin aparato habilitado (ej. "Todas las sucursales").
describe('Desbloquear con PIN la sesión propia', () => {
  let rolCajero, todas, sucursal;
  const mismo = (token, pin) => request(app).post('/api/v1/auth/pin/mismo').set('Authorization', `Bearer ${token}`).send({ pin });
  async function sesionTodas() {
    const r = await request(app).post('/api/v1/auth/login').send({ email: todas.email, contrasena: 'clave123' });
    const s = await request(app).post('/api/v1/auth/login/sucursal').send({ pre_token: r.body.datos.pre_token, sucursal_id: null });
    return s.body.datos;
  }

  beforeAll(async () => {
    rolCajero = await Rol.findOne({ where: { nombre: 'Cajero' } });
    sucursal = await Sucursal.create({ nombre: 'Sucursal PIN Mismo' });
    todas = await Usuario.create({
      rol_id: rolCajero.id, nombre: 'PIN Mismo Todas', email: 'pin-mismo-todas@restaurante.com',
      contrasena: await bcrypt.hash('clave123', 10), pin: await bcrypt.hash('1234', 10), acceso_todas_sucursales: 1,
    });
  });

  afterAll(async () => {
    await Usuario.destroy({ where: { id: todas.id } });
    await Sucursal.destroy({ where: { id: sucursal.id } });
  });

  it("con 'Todas las sucursales' devuelve tokens del mismo usuario y sucursal, sin cerrar la sesión", async () => {
    const s = await sesionTodas();
    await todas.reload();
    const version = todas.sesion_version;
    const r = await mismo(s.token, '1234');
    expect(r.status).toBe(200);
    expect(r.body.datos.usuario.id).toBe(todas.id);
    expect(r.body.datos.usuario.sucursal_activa.id).toBeNull();
    expect(r.body.datos.refresh_token).toBeDefined();
    expect(r.body.datos.dispositivo_token).toBeUndefined();
    await todas.reload();
    expect(todas.sesion_version).toBe(version);
    // El token viejo y el nuevo siguen sirviendo.
    expect((await request(app).get('/api/v1/auth/yo').set('Authorization', `Bearer ${s.token}`)).status).toBe(200);
    const yo = await request(app).get('/api/v1/auth/yo').set('Authorization', `Bearer ${r.body.datos.token}`);
    expect(yo.status).toBe(200);
    expect(yo.body.datos.sucursal_id).toBeNull();
  });

  it('con sucursal concreta mantiene la sucursal y trae dispositivo_token', async () => {
    const r = await request(app).post('/api/v1/auth/login').send({ email: todas.email, contrasena: 'clave123' });
    const s = await request(app).post('/api/v1/auth/login/sucursal').send({ pre_token: r.body.datos.pre_token, sucursal_id: sucursal.id });
    const m = await mismo(s.body.datos.token, '1234');
    expect(m.status).toBe(200);
    expect(m.body.datos.usuario.sucursal_activa).toEqual({ id: sucursal.id, nombre: 'Sucursal PIN Mismo' });
    expect(m.body.datos.dispositivo_token).toBeDefined();
  });

  it('PIN mal cuenta para el mismo bloqueo; a los 5 ⇒ 423', async () => {
    const s = await sesionTodas();
    await todas.update({ pin_intentos: 0, pin_bloqueado: 0 });
    const r = await mismo(s.token, '9999');
    expect(r.status).toBe(401);
    expect(r.body.mensaje).toBe('PIN incorrecto');
    expect(r.body.intentos_restantes).toBe(4);
    await todas.reload();
    expect(todas.pin_intentos).toBe(1);
    for (let i = 0; i < 3; i++) expect((await mismo(s.token, '9999')).status).toBe(401);
    const quinto = await mismo(s.token, '9999');
    expect(quinto.status).toBe(423);
    expect(quinto.body.mensaje).toBe('PIN bloqueado: entra con tu correo');
    const correcto = await mismo(s.token, '1234');
    expect(correcto.status).toBe(423);
    await todas.reload();
    expect(todas.pin_bloqueado).toBe(1);
  });

  it('quitado de la sucursal del token ⇒ 403 y no gasta intento', async () => {
    await todas.update({ pin_intentos: 0, pin_bloqueado: 0, acceso_todas_sucursales: 0 });
    await todas.addSucursal(sucursal);
    const r = await request(app).post('/api/v1/auth/login').send({ email: todas.email, contrasena: 'clave123' });
    const token = r.body.datos.token;
    expect(r.body.datos.usuario.sucursal_activa.id).toBe(sucursal.id);
    expect((await mismo(token, '1234')).status).toBe(200);
    await todas.removeSucursal(sucursal);
    const m = await mismo(token, '9999');
    expect(m.status).toBe(403);
    expect(m.body.mensaje).toBe('Ese usuario no es de esta sucursal');
    await todas.reload();
    expect(todas.pin_intentos).toBe(0);
    await todas.update({ acceso_todas_sucursales: 1 });
  });

  it("'Todas las sucursales' tras quitarle acceso a todas ⇒ 403", async () => {
    const s = await sesionTodas();
    await todas.update({ acceso_todas_sucursales: 0 });
    const m = await mismo(s.token, '1234');
    expect(m.status).toBe(403);
    expect(m.body.mensaje).toBe('Ese usuario no es de esta sucursal');
    await todas.reload();
    expect(todas.pin_intentos).toBe(0);
    await todas.update({ acceso_todas_sucursales: 1 });
  });

  it('PIN que no son 4 números ⇒ 400; sin token ⇒ 401', async () => {
    await todas.update({ pin_intentos: 0, pin_bloqueado: 0 });
    const s = await sesionTodas();
    const r = await mismo(s.token, '12');
    expect(r.status).toBe(400);
    expect(r.body.mensaje).toBe('El PIN son 4 números');
    const sin = await request(app).post('/api/v1/auth/pin/mismo').send({ pin: '1234' });
    expect(sin.status).toBe(401);
  });
});

// El socket solo acepta tokens de sesión: uno con `tipo` (dispositivo, pre_login) se rechaza.
describe('socket: identificar', () => {
  const jwt = require('jsonwebtoken');
  const { identificar } = require('../src/socket');
  const probar = (token) => new Promise((resolve) => {
    const socket = { handshake: { auth: { token } }, data: {} };
    identificar(socket, (err) => resolve({ err, socket }));
  });

  it('rechaza un token con tipo', async () => {
    const t = jwt.sign({ tipo: 'dispositivo', id: 1, sucursal_id: 1, sesion_version: 0 }, process.env.JWT_SECRET, { expiresIn: '1m' });
    const { err, socket } = await probar(t);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('No autorizado');
    expect(socket.data.quien).toBeUndefined();
  });
});
