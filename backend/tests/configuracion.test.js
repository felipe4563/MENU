const request = require('supertest');
const app = require('../src/app');

describe('Configuración API', () => {
  it('GET /api/v1/configuracion sin token → 401', async () => {
    const res = await request(app).get('/api/v1/configuracion');
    expect(res.status).toBe(401);
  });
});

describe('Configuración pública incluye colores de marca', () => {
  let adminToken;
  let valoresPrevios;

  beforeAll(async () => {
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@restaurante.com', contrasena: process.env.ADMIN_PASSWORD || 'admin123' });
    adminToken = login.body.datos.token;

    const previo = await request(app)
      .get('/api/v1/configuracion')
      .set('Authorization', `Bearer ${adminToken}`);
    valoresPrevios = {
      color_primario: previo.body.datos.color_primario ?? '',
      color_secundario: previo.body.datos.color_secundario ?? '',
    };
  });

  afterAll(async () => {
    await request(app)
      .put('/api/v1/configuracion')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(valoresPrevios);
  });

  it('PUT /api/v1/configuracion con color_primario/color_secundario, luego GET /api/v1/configuracion/publica los incluye', async () => {
    await request(app)
      .put('/api/v1/configuracion')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ color_primario: '#245b62', color_secundario: '#d97706' })
      .expect(200);

    const res = await request(app).get('/api/v1/configuracion/publica');
    expect(res.status).toBe(200);
    expect(res.body.datos.color_primario).toBe('#245b62');
    expect(res.body.datos.color_secundario).toBe('#d97706');
  });
});

// Todos los que usan el sistema (no solo quien ve los ajustes) necesitan
// saber cada cuánto se bloquea la pantalla por inactividad.
describe('Configuración pública incluye el bloqueo por inactividad', () => {
  let adminToken;
  let previo;

  beforeAll(async () => {
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@restaurante.com', contrasena: process.env.ADMIN_PASSWORD || 'admin123' });
    adminToken = login.body.datos.token;
    const r = await request(app).get('/api/v1/configuracion').set('Authorization', `Bearer ${adminToken}`);
    previo = r.body.datos.bloqueo_inactividad_min ?? '0';
  });

  afterAll(async () => {
    await request(app)
      .put('/api/v1/configuracion')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ bloqueo_inactividad_min: previo });
  });

  it('GET /api/v1/configuracion/publica devuelve bloqueo_inactividad_min', async () => {
    await request(app)
      .put('/api/v1/configuracion')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ bloqueo_inactividad_min: '10' })
      .expect(200);

    const res = await request(app).get('/api/v1/configuracion/publica');
    expect(res.status).toBe(200);
    expect(String(res.body.datos.bloqueo_inactividad_min)).toBe('10');
  });
});
