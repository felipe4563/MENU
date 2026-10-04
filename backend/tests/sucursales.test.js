const request = require('supertest');
const app = require('../src/app');

let adminToken;

beforeAll(async () => {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'admin@restaurante.com', contrasena: process.env.ADMIN_PASSWORD || 'admin123' });
  adminToken = res.body.datos.token;
});

describe('Sucursales API', () => {
  it('rechaza sin token', async () => {
    const res = await request(app).get('/api/v1/sucursales');
    expect(res.status).toBe(401);
  });

  it('lista sucursales para admin (incluye la Sucursal Principal del seed)', async () => {
    const res = await request(app)
      .get('/api/v1/sucursales')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.datos.some(s => s.nombre === 'Sucursal Principal')).toBe(true);
  });

  it('crea, edita y elimina una sucursal', async () => {
    const crear = await request(app)
      .post('/api/v1/sucursales')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ nombre: 'Sucursal CRUD Test', direccion: 'Av. Siempre Viva 123', telefono: '70000000' });
    expect(crear.status).toBe(201);
    expect(crear.body.datos.nombre).toBe('Sucursal CRUD Test');
    const id = crear.body.datos.id;

    const editar = await request(app)
      .put(`/api/v1/sucursales/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ nombre: 'Sucursal CRUD Test Editada' });
    expect(editar.status).toBe(200);
    expect(editar.body.datos.nombre).toBe('Sucursal CRUD Test Editada');

    const eliminar = await request(app)
      .delete(`/api/v1/sucursales/${id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(eliminar.status).toBe(200);
  });

  it('crea con radio_geocerca_metros y lo puede editar después', async () => {
    const crear = await request(app)
      .post('/api/v1/sucursales')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ nombre: 'Sucursal Geocerca Test', latitud: -17.3938, longitud: -63.1905, radio_geocerca_metros: 200 });
    expect(crear.status).toBe(201);
    expect(crear.body.datos.radio_geocerca_metros).toBe(200);
    const id = crear.body.datos.id;

    const editar = await request(app)
      .put(`/api/v1/sucursales/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ radio_geocerca_metros: 75 });
    expect(editar.status).toBe(200);
    expect(editar.body.datos.radio_geocerca_metros).toBe(75);

    await request(app).delete(`/api/v1/sucursales/${id}`).set('Authorization', `Bearer ${adminToken}`);
  });

  it('crea sin radio_geocerca_metros y queda en el default 150', async () => {
    const crear = await request(app)
      .post('/api/v1/sucursales')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ nombre: 'Sucursal Geocerca Default Test' });
    expect(crear.status).toBe(201);
    expect(crear.body.datos.radio_geocerca_metros).toBe(150);

    await request(app).delete(`/api/v1/sucursales/${crear.body.datos.id}`).set('Authorization', `Bearer ${adminToken}`);
  });

  it('crea con modo_cierre_caja y tolerancia_cierre_caja, y los puede editar después', async () => {
    const crear = await request(app)
      .post('/api/v1/sucursales')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ nombre: 'Sucursal Modo Cierre Test', modo_cierre_caja: 'ciego', tolerancia_cierre_caja: 25 });
    expect(crear.status).toBe(201);
    expect(crear.body.datos.modo_cierre_caja).toBe('ciego');
    expect(parseFloat(crear.body.datos.tolerancia_cierre_caja)).toBe(25);
    const id = crear.body.datos.id;

    const editar = await request(app)
      .put(`/api/v1/sucursales/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ modo_cierre_caja: 'directo', tolerancia_cierre_caja: 15 });
    expect(editar.status).toBe(200);
    expect(editar.body.datos.modo_cierre_caja).toBe('directo');
    expect(parseFloat(editar.body.datos.tolerancia_cierre_caja)).toBe(15);

    await request(app).delete(`/api/v1/sucursales/${id}`).set('Authorization', `Bearer ${adminToken}`);
  });

  it('crea una sucursal sin especificar modo/tolerancia y usa los defaults', async () => {
    const crear = await request(app)
      .post('/api/v1/sucursales')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ nombre: 'Sucursal Defaults Cierre Test' });
    expect(crear.status).toBe(201);
    expect(crear.body.datos.modo_cierre_caja).toBe('directo');
    expect(parseFloat(crear.body.datos.tolerancia_cierre_caja)).toBe(10);

    await request(app).delete(`/api/v1/sucursales/${crear.body.datos.id}`).set('Authorization', `Bearer ${adminToken}`);
  });

  it('rechaza crear sin nombre', async () => {
    const res = await request(app)
      .post('/api/v1/sucursales')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ direccion: 'Sin nombre' });
    expect(res.status).toBe(400);
  });

  it('GET /sucursales/publico no requiere token y devuelve solo id+nombre', async () => {
    const crear = await request(app)
      .post('/api/v1/sucursales')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ nombre: 'Sucursal Publica Test', direccion: 'Dir', telefono: '70000000' });
    const id = crear.body.datos.id;

    const res = await request(app).get('/api/v1/sucursales/publico');
    expect(res.status).toBe(200);

    const encontrada = res.body.datos.find((s) => s.id === id);
    expect(encontrada).toBeDefined();
    expect(Object.keys(encontrada).sort()).toEqual(['id', 'nombre']);

    await request(app).delete(`/api/v1/sucursales/${id}`).set('Authorization', `Bearer ${adminToken}`);
  });

  it('GET /sucursales/publico no incluye sucursales inactivas', async () => {
    const crear = await request(app)
      .post('/api/v1/sucursales')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ nombre: 'Sucursal Publica Inactiva Test', direccion: 'Dir', telefono: '70000000', activo: 0 });
    const id = crear.body.datos.id;

    const res = await request(app).get('/api/v1/sucursales/publico');
    expect(res.status).toBe(200);
    expect(res.body.datos.some((s) => s.id === id)).toBe(false);

    await request(app).delete(`/api/v1/sucursales/${id}`).set('Authorization', `Bearer ${adminToken}`);
  });
});
