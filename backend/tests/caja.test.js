const request = require('supertest');
const app = require('../src/app');
const { SesionCaja, Caja, Sucursal, Usuario, Rol } = require('../src/models');
const bcrypt = require('bcryptjs');

describe('Caja API', () => {
  it('GET /api/v1/caja/estado sin token → 401', async () => {
    const res = await request(app).get('/api/v1/caja/estado');
    expect(res.status).toBe(401);
  });
});

describe('Caja — apertura por caja física', () => {
  let sucursalPropia, sucursalAjena, cajaPropia, cajaAjena, usuarioId, token;

  beforeAll(async () => {
    sucursalPropia = await Sucursal.create({ nombre: 'Sucursal Caja Fisica Propia Test' });
    sucursalAjena = await Sucursal.create({ nombre: 'Sucursal Caja Fisica Ajena Test' });
    cajaPropia = await Caja.create({ sucursal_id: sucursalPropia.id, nombre: 'Caja 1 Test' });
    cajaAjena = await Caja.create({ sucursal_id: sucursalAjena.id, nombre: 'Caja Ajena Test' });

    const rol = await Rol.findOne({ where: { nombre: 'Cajero' } });
    const hash = await bcrypt.hash('clave123', 10);
    const usuario = await Usuario.create({ rol_id: rol.id, nombre: 'Caja Fisica Test', email: 'caja-fisica-test@restaurante.com', contrasena: hash });
    await usuario.addSucursal(sucursalPropia);
    usuarioId = usuario.id;

    const login = await request(app).post('/api/v1/auth/login').send({ email: 'caja-fisica-test@restaurante.com', contrasena: 'clave123' });
    token = login.body.datos.token;
  });

  afterAll(async () => {
    await SesionCaja.destroy({ where: { usuario_id: usuarioId } });
    await Usuario.destroy({ where: { id: usuarioId } });
    await Caja.destroy({ where: { id: [cajaPropia.id, cajaAjena.id] } });
    await Sucursal.destroy({ where: { id: [sucursalPropia.id, sucursalAjena.id] } });
  });

  it('sin caja_id → 400', async () => {
    const res = await request(app)
      .post('/api/v1/caja/abrir')
      .set('Authorization', `Bearer ${token}`)
      .send({ monto_apertura: 100 });
    expect(res.status).toBe(400);
  });

  it('con caja_id inexistente → 404', async () => {
    const res = await request(app)
      .post('/api/v1/caja/abrir')
      .set('Authorization', `Bearer ${token}`)
      .send({ caja_id: 999999, monto_apertura: 100 });
    expect(res.status).toBe(404);
  });

  it('no puede abrir una caja de otra sucursal', async () => {
    const res = await request(app)
      .post('/api/v1/caja/abrir')
      .set('Authorization', `Bearer ${token}`)
      .send({ caja_id: cajaAjena.id, monto_apertura: 100 });
    expect(res.status).toBe(404);
  });

  it('abre su propia caja correctamente', async () => {
    const res = await request(app)
      .post('/api/v1/caja/abrir')
      .set('Authorization', `Bearer ${token}`)
      .send({ caja_id: cajaPropia.id, monto_apertura: 100 });
    expect(res.status).toBe(201);
    expect(res.body.datos.caja_id).toBe(cajaPropia.id);
    expect(res.body.datos.sucursal_id).toBe(sucursalPropia.id);
  });

  it('no se puede volver a abrir la misma caja mientras sigue abierta (aunque sea otro usuario)', async () => {
    const rol = await Rol.findOne({ where: { nombre: 'Cajero' } });
    const hash = await bcrypt.hash('clave123', 10);
    const otroUsuario = await Usuario.create({ rol_id: rol.id, nombre: 'Caja Fisica Otro Test', email: 'caja-fisica-otro-test@restaurante.com', contrasena: hash });
    await otroUsuario.addSucursal(sucursalPropia);
    const loginOtro = await request(app).post('/api/v1/auth/login').send({ email: 'caja-fisica-otro-test@restaurante.com', contrasena: 'clave123' });

    const res = await request(app)
      .post('/api/v1/caja/abrir')
      .set('Authorization', `Bearer ${loginOtro.body.datos.token}`)
      .send({ caja_id: cajaPropia.id, monto_apertura: 50 });
    expect(res.status).toBe(409);

    await Usuario.destroy({ where: { id: otroUsuario.id } });
  });

  it('otro usuario de la misma sucursal no puede registrar gastos en una sesión que no abrió (403)', async () => {
    const rol = await Rol.findOne({ where: { nombre: 'Cajero' } });
    const hash = await bcrypt.hash('clave123', 10);
    const otroUsuario = await Usuario.create({ rol_id: rol.id, nombre: 'Caja Fisica Gasto Otro Test', email: 'caja-fisica-gasto-otro-test@restaurante.com', contrasena: hash });
    await otroUsuario.addSucursal(sucursalPropia);
    const loginOtro = await request(app).post('/api/v1/auth/login').send({ email: 'caja-fisica-gasto-otro-test@restaurante.com', contrasena: 'clave123' });

    const sesionPropia = await SesionCaja.findOne({ where: { caja_id: cajaPropia.id, estado: 'abierta' } });

    try {
      const res = await request(app)
        .post(`/api/v1/caja/${sesionPropia.id}/gastos`)
        .set('Authorization', `Bearer ${loginOtro.body.datos.token}`)
        .send({ descripcion: 'Gasto no autorizado', monto: 10 });
      expect(res.status).toBe(403);
    } finally {
      await Usuario.destroy({ where: { id: otroUsuario.id } });
    }
  });

  it('GET /caja/estado devuelve la caja con su sesión abierta', async () => {
    const res = await request(app)
      .get('/api/v1/caja/estado')
      .query({ sucursal_id: sucursalPropia.id })
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const propia = res.body.datos.find(c => c.id === cajaPropia.id);
    expect(propia.sesion_abierta).not.toBeNull();
    expect(propia.sesion_abierta.usuario_id).toBe(usuarioId);
  });
});

describe('Caja — acceso a todas las sucursales', () => {
  let sucursalX, cajaX, usuarioTodasId, tokenTodas;

  beforeAll(async () => {
    sucursalX = await Sucursal.create({ nombre: 'Sucursal Caja Todas X Test' });
    cajaX = await Caja.create({ sucursal_id: sucursalX.id, nombre: 'Caja Todas X Test' });

    const rol = await Rol.findOne({ where: { nombre: 'Administrador' } });
    const hash = await bcrypt.hash('clave123', 10);
    const todas = await Usuario.create({
      rol_id: rol.id, nombre: 'Caja Acceso Todas Fisica Test', email: 'caja-todas-fisica-test@restaurante.com',
      contrasena: hash, acceso_todas_sucursales: 1,
    });
    usuarioTodasId = todas.id;
    const login = await request(app).post('/api/v1/auth/login').send({ email: 'caja-todas-fisica-test@restaurante.com', contrasena: 'clave123' });
    const elegido = await request(app).post('/api/v1/auth/login/sucursal').send({ pre_token: login.body.datos.pre_token, sucursal_id: null });
    tokenTodas = elegido.body.datos.token;
  });

  afterAll(async () => {
    await SesionCaja.destroy({ where: { usuario_id: usuarioTodasId } });
    await Usuario.destroy({ where: { id: usuarioTodasId } });
    await Caja.destroy({ where: { id: cajaX.id } });
    await Sucursal.destroy({ where: { id: sucursalX.id } });
  });

  it('acceso-todas sin sucursal_id → 400 en /caja/estado', async () => {
    const res = await request(app)
      .get('/api/v1/caja/estado')
      .set('Authorization', `Bearer ${tokenTodas}`);
    expect(res.status).toBe(400);
  });

  it('acceso-todas puede ver el estado de cualquier sucursal', async () => {
    const res = await request(app)
      .get('/api/v1/caja/estado')
      .query({ sucursal_id: sucursalX.id })
      .set('Authorization', `Bearer ${tokenTodas}`);
    expect(res.status).toBe(200);
    expect(res.body.datos.some(c => c.id === cajaX.id)).toBe(true);
  });

  it('acceso-todas puede abrir cualquier caja de cualquier sucursal', async () => {
    const res = await request(app)
      .post('/api/v1/caja/abrir')
      .set('Authorization', `Bearer ${tokenTodas}`)
      .send({ caja_id: cajaX.id, monto_apertura: 100 });
    expect(res.status).toBe(201);
    expect(res.body.datos.caja_id).toBe(cajaX.id);
  });
});

describe('Caja — cierre de sesión', () => {
  let sucursal, caja, usuarioId, token;

  beforeAll(async () => {
    sucursal = await Sucursal.create({ nombre: 'Sucursal Cierre Caja Test' });
    caja = await Caja.create({ sucursal_id: sucursal.id, nombre: 'Caja Cierre Test' });

    const rol = await Rol.findOne({ where: { nombre: 'Cajero' } });
    const hash = await bcrypt.hash('clave123', 10);
    const usuario = await Usuario.create({ rol_id: rol.id, nombre: 'Cierre Caja Test', email: 'cierre-caja-test@restaurante.com', contrasena: hash });
    await usuario.addSucursal(sucursal);
    usuarioId = usuario.id;

    const login = await request(app).post('/api/v1/auth/login').send({ email: 'cierre-caja-test@restaurante.com', contrasena: 'clave123' });
    token = login.body.datos.token;
  });

  afterAll(async () => {
    await SesionCaja.destroy({ where: { usuario_id: usuarioId } });
    await Usuario.destroy({ where: { id: usuarioId } });
    await Caja.destroy({ where: { id: caja.id } });
    await Sucursal.destroy({ where: { id: sucursal.id } });
  });

  async function abrirNuevaSesion() {
    const abrir = await request(app)
      .post('/api/v1/caja/abrir')
      .set('Authorization', `Bearer ${token}`)
      .send({ caja_id: caja.id, monto_apertura: 100 });
    return abrir.body.datos.id;
  }

  it('cierra con conteo detallado por denominación', async () => {
    const sesionId = await abrirNuevaSesion();
    const res = await request(app)
      .post(`/api/v1/caja/${sesionId}/cerrar`)
      .set('Authorization', `Bearer ${token}`)
      .send({ denominaciones: [{ denominacion: 100, cantidad: 1 }] });
    expect(res.status).toBe(200);
    expect(parseFloat(res.body.datos.monto_cierre)).toBe(100);
    expect(res.body.datos.estado).toBe('cerrada');
  });

  it('cierra con un monto total anotado directamente (sin denominaciones)', async () => {
    const sesionId = await abrirNuevaSesion();
    const res = await request(app)
      .post(`/api/v1/caja/${sesionId}/cerrar`)
      .set('Authorization', `Bearer ${token}`)
      .send({ monto_cierre: 137.50, nota_diferencia: 'Diferencia de prueba' });
    expect(res.status).toBe(200);
    expect(parseFloat(res.body.datos.monto_cierre)).toBe(137.50);
    expect(res.body.datos.estado).toBe('cerrada');
  });

  it('sin denominaciones ni monto_cierre → 400', async () => {
    const sesionId = await abrirNuevaSesion();
    const res = await request(app)
      .post(`/api/v1/caja/${sesionId}/cerrar`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
  });
});

describe('Caja — modo de cierre directo/ciego y tolerancia', () => {
  let sucursalDirecta, sucursalCiega, cajaDirecta, cajaCiega, usuarioId, tokenDirecta, tokenCiega;

  beforeAll(async () => {
    sucursalDirecta = await Sucursal.create({ nombre: 'Sucursal Cierre Directo Test', tolerancia_cierre_caja: 5 });
    sucursalCiega = await Sucursal.create({ nombre: 'Sucursal Cierre Ciego Test', modo_cierre_caja: 'ciego', tolerancia_cierre_caja: 5 });
    cajaDirecta = await Caja.create({ sucursal_id: sucursalDirecta.id, nombre: 'Caja Directa Tolerancia Test' });
    cajaCiega = await Caja.create({ sucursal_id: sucursalCiega.id, nombre: 'Caja Ciega Tolerancia Test' });

    const rol = await Rol.findOne({ where: { nombre: 'Cajero' } });
    const hash = await bcrypt.hash('clave123', 10);
    const usuario = await Usuario.create({ rol_id: rol.id, nombre: 'Tolerancia Cierre Test', email: 'tolerancia-cierre-test@restaurante.com', contrasena: hash });
    await usuario.addSucursal(sucursalDirecta);
    await usuario.addSucursal(sucursalCiega);
    usuarioId = usuario.id;

    // El usuario tiene acceso a dos sucursales, así que /auth/login devuelve
    // requiere_sucursal + pre_token en vez de un token directo — hay que
    // elegir sucursal explícitamente, una vez por cada una, para tener un
    // token con el sucursal_id correcto al abrir cada caja.
    const login = await request(app).post('/api/v1/auth/login').send({ email: 'tolerancia-cierre-test@restaurante.com', contrasena: 'clave123' });
    const preToken = login.body.datos.pre_token;
    const eligeDirecta = await request(app).post('/api/v1/auth/login/sucursal').send({ pre_token: preToken, sucursal_id: sucursalDirecta.id });
    tokenDirecta = eligeDirecta.body.datos.token;
    const eligeCiega = await request(app).post('/api/v1/auth/login/sucursal').send({ pre_token: preToken, sucursal_id: sucursalCiega.id });
    tokenCiega = eligeCiega.body.datos.token;
  });

  afterAll(async () => {
    await SesionCaja.destroy({ where: { usuario_id: usuarioId } });
    await Usuario.destroy({ where: { id: usuarioId } });
    await Caja.destroy({ where: { id: [cajaDirecta.id, cajaCiega.id] } });
    await Sucursal.destroy({ where: { id: [sucursalDirecta.id, sucursalCiega.id] } });
  });

  function tokenPara(cajaId) {
    return cajaId === cajaCiega.id ? tokenCiega : tokenDirecta;
  }

  async function abrir(cajaId) {
    const res = await request(app)
      .post('/api/v1/caja/abrir')
      .set('Authorization', `Bearer ${tokenPara(cajaId)}`)
      .send({ caja_id: cajaId, monto_apertura: 100 });
    return res.body.datos.id;
  }

  // Varios tests de este bloque esperan a propósito que el cierre falle
  // (400/409) y la sesión quede abierta — eso bloquearía la siguiente
  // apertura sobre la misma caja física si no se liberara. Esto solo
  // limpia el estado entre tests, no forma parte de ninguna aserción.
  async function liberarSesion(sesionId, tok) {
    await request(app)
      .post(`/api/v1/caja/${sesionId}/cerrar`)
      .set('Authorization', `Bearer ${tok}`)
      .send({ monto_cierre: 150, confirmar_pese_a_diferencia: true, nota_diferencia: 'Limpieza de sesión de prueba' });
  }

  it('modo directo, diferencia dentro de tolerancia (5), cierra sin pedir nota', async () => {
    const sesionId = await abrir(cajaDirecta.id);
    const res = await request(app)
      .post(`/api/v1/caja/${sesionId}/cerrar`)
      .set('Authorization', `Bearer ${tokenDirecta}`)
      .send({ monto_cierre: 103 }); // diferencia = 3, dentro de tolerancia 5
    expect(res.status).toBe(200);
    expect(res.body.datos.nota_diferencia).toBeNull();
  });

  it('modo directo, diferencia fuera de tolerancia sin nota → 400', async () => {
    const sesionId = await abrir(cajaDirecta.id);
    const res = await request(app)
      .post(`/api/v1/caja/${sesionId}/cerrar`)
      .set('Authorization', `Bearer ${tokenDirecta}`)
      .send({ monto_cierre: 150 }); // diferencia = 50, fuera de tolerancia 5
    expect(res.status).toBe(400);
    await liberarSesion(sesionId, tokenDirecta);
  });

  it('modo directo, diferencia fuera de tolerancia con nota → 200 y guarda la nota', async () => {
    const sesionId = await abrir(cajaDirecta.id);
    const res = await request(app)
      .post(`/api/v1/caja/${sesionId}/cerrar`)
      .set('Authorization', `Bearer ${tokenDirecta}`)
      .send({ monto_cierre: 150, nota_diferencia: 'Vuelto de más a mesa 4' });
    expect(res.status).toBe(200);
    expect(res.body.datos.nota_diferencia).toBe('Vuelto de más a mesa 4');
  });

  it('modo ciego, dentro de tolerancia, cierra normal', async () => {
    const sesionId = await abrir(cajaCiega.id);
    const res = await request(app)
      .post(`/api/v1/caja/${sesionId}/cerrar`)
      .set('Authorization', `Bearer ${tokenCiega}`)
      .send({ monto_cierre: 102 }); // diferencia = 2
    expect(res.status).toBe(200);
  });

  it('modo ciego, monto directo (sin denominaciones) fuera de tolerancia, primer intento → 409 sin revelar el monto', async () => {
    const sesionId = await abrir(cajaCiega.id);
    const res = await request(app)
      .post(`/api/v1/caja/${sesionId}/cerrar`)
      .set('Authorization', `Bearer ${tokenCiega}`)
      .send({ monto_cierre: 150 });
    expect(res.status).toBe(409);
    expect(res.body.codigo).toBe('DIFERENCIA_FUERA_TOLERANCIA');
    expect(res.body.requiere_confirmacion).toBe(true);
    expect(res.body.diferencia).toBeUndefined();
    expect(res.body.datos).toBeUndefined();

    // la sesión sigue abierta — el intento fallido no persistió nada
    const estado = await request(app)
      .get(`/api/v1/caja/${sesionId}`)
      .set('Authorization', `Bearer ${tokenCiega}`);
    expect(estado.body.datos.estado).toBe('abierta');
    await liberarSesion(sesionId, tokenCiega);
  });

  it('modo ciego, conteo por denominación fuera de tolerancia, primer intento → 409 sin revelar el monto', async () => {
    const sesionId = await abrir(cajaCiega.id);
    const res = await request(app)
      .post(`/api/v1/caja/${sesionId}/cerrar`)
      .set('Authorization', `Bearer ${tokenCiega}`)
      .send({ denominaciones: [{ denominacion: 100, cantidad: 1 }, { denominacion: 50, cantidad: 1 }] }); // 150, diferencia = 50
    expect(res.status).toBe(409);
    expect(res.body.codigo).toBe('DIFERENCIA_FUERA_TOLERANCIA');
    await liberarSesion(sesionId, tokenCiega);
  });

  it('modo ciego, segundo intento (confirmar_pese_a_diferencia) sin nota → 400', async () => {
    const sesionId = await abrir(cajaCiega.id);
    const res = await request(app)
      .post(`/api/v1/caja/${sesionId}/cerrar`)
      .set('Authorization', `Bearer ${tokenCiega}`)
      .send({ monto_cierre: 150, confirmar_pese_a_diferencia: true });
    expect(res.status).toBe(400);
    await liberarSesion(sesionId, tokenCiega);
  });

  it('modo ciego, segundo intento con nota → 200, cierra y guarda la nota', async () => {
    const sesionId = await abrir(cajaCiega.id);
    const res = await request(app)
      .post(`/api/v1/caja/${sesionId}/cerrar`)
      .set('Authorization', `Bearer ${tokenCiega}`)
      .send({ monto_cierre: 150, confirmar_pese_a_diferencia: true, nota_diferencia: 'Recontado dos veces, falta real' });
    expect(res.status).toBe(200);
    expect(res.body.datos.nota_diferencia).toBe('Recontado dos veces, falta real');
    expect(res.body.datos.estado).toBe('cerrada');
  });

  it('sucursal sin configurar explícitamente usa los defaults (directo, tolerancia 10) y el GET /caja/:id expone modo y tolerancia de la sucursal', async () => {
    const sucursalDefault = await Sucursal.create({ nombre: 'Sucursal Default Tolerancia Test' });
    expect(sucursalDefault.modo_cierre_caja).toBe('directo');
    expect(parseFloat(sucursalDefault.tolerancia_cierre_caja)).toBe(10);

    const cajaDefault = await Caja.create({ sucursal_id: sucursalDefault.id, nombre: 'Caja Default Tolerancia Test' });
    const usuarioDefault = await Usuario.create({
      rol_id: (await Rol.findOne({ where: { nombre: 'Cajero' } })).id,
      nombre: 'Default Tolerancia Test', email: 'default-tolerancia-test@restaurante.com',
      contrasena: await bcrypt.hash('clave123', 10),
    });
    await usuarioDefault.addSucursal(sucursalDefault);
    const loginDefault = await request(app).post('/api/v1/auth/login').send({ email: 'default-tolerancia-test@restaurante.com', contrasena: 'clave123' });
    const tokenDefault = loginDefault.body.datos.token;

    const abrirRes = await request(app)
      .post('/api/v1/caja/abrir')
      .set('Authorization', `Bearer ${tokenDefault}`)
      .send({ caja_id: cajaDefault.id, monto_apertura: 100 });
    const sesionId = abrirRes.body.datos.id;

    const getRes = await request(app)
      .get(`/api/v1/caja/${sesionId}`)
      .set('Authorization', `Bearer ${tokenDefault}`);
    expect(getRes.body.datos.sucursal.modo_cierre_caja).toBe('directo');
    expect(parseFloat(getRes.body.datos.sucursal.tolerancia_cierre_caja)).toBe(10);

    await SesionCaja.destroy({ where: { id: sesionId } });
    await Usuario.destroy({ where: { id: usuarioDefault.id } });
    await Caja.destroy({ where: { id: cajaDefault.id } });
    await Sucursal.destroy({ where: { id: sucursalDefault.id } });
  });

  it('tolerancia 0: diferencia exactamente 0 cierra sin pedir nota; cualquier diferencia distinta de 0 la pide', async () => {
    const sucursalCero = await Sucursal.create({ nombre: 'Sucursal Tolerancia Cero Test', tolerancia_cierre_caja: 0 });
    const cajaCero = await Caja.create({ sucursal_id: sucursalCero.id, nombre: 'Caja Tolerancia Cero Test' });
    const usuarioCero = await Usuario.create({
      rol_id: (await Rol.findOne({ where: { nombre: 'Cajero' } })).id,
      nombre: 'Tolerancia Cero Test', email: 'tolerancia-cero-test@restaurante.com',
      contrasena: await bcrypt.hash('clave123', 10),
    });
    await usuarioCero.addSucursal(sucursalCero);
    const loginCero = await request(app).post('/api/v1/auth/login').send({ email: 'tolerancia-cero-test@restaurante.com', contrasena: 'clave123' });
    const tokenCero = loginCero.body.datos.token;

    const abrirExacto = await request(app)
      .post('/api/v1/caja/abrir')
      .set('Authorization', `Bearer ${tokenCero}`)
      .send({ caja_id: cajaCero.id, monto_apertura: 100 });
    const exactoRes = await request(app)
      .post(`/api/v1/caja/${abrirExacto.body.datos.id}/cerrar`)
      .set('Authorization', `Bearer ${tokenCero}`)
      .send({ monto_cierre: 100 });
    expect(exactoRes.status).toBe(200);

    const abrirConDif = await request(app)
      .post('/api/v1/caja/abrir')
      .set('Authorization', `Bearer ${tokenCero}`)
      .send({ caja_id: cajaCero.id, monto_apertura: 100 });
    const conDifRes = await request(app)
      .post(`/api/v1/caja/${abrirConDif.body.datos.id}/cerrar`)
      .set('Authorization', `Bearer ${tokenCero}`)
      .send({ monto_cierre: 100.50 });
    expect(conDifRes.status).toBe(400);

    await SesionCaja.destroy({ where: { sucursal_id: sucursalCero.id } });
    await Usuario.destroy({ where: { id: usuarioCero.id } });
    await Caja.destroy({ where: { id: cajaCero.id } });
    await Sucursal.destroy({ where: { id: sucursalCero.id } });
  });
});
