// Manifest e íconos de la PWA con el nombre y el logo del restaurante.
const request = require('supertest');
const app = require('../src/app');
const { Configuracion } = require('../src/models');

describe('PWA: /api/v1/pwa', () => {
  let previo;
  beforeAll(async () => {
    previo = await Configuracion.findOne({ where: { clave: 'logo' } });
  });
  afterAll(async () => {
    if (previo) await Configuracion.update({ valor: previo.valor }, { where: { clave: 'logo' } });
  });

  it('el manifest lleva el nombre del negocio e íconos generados, sin login', async () => {
    const res = await request(app).get('/api/v1/pwa/manifest.webmanifest');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/manifest\+json/);
    const m = JSON.parse(res.text);
    expect(m.start_url).toBe('/');
    expect(m.name).toBeTruthy();
    expect(m.icons.map((i) => i.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));
    expect(m.icons.some((i) => i.purpose === 'maskable')).toBe(true);
    // Sin ".png": el nginx del frontend serviría esa ruta como archivo estático.
    expect(m.icons.every((i) => /^\/api\/v1\/pwa\/icono\/\d+\?v=/.test(i.src))).toBe(true);
  });

  it('genera el ícono PNG del tamaño pedido aunque no haya logo', async () => {
    await Configuracion.update({ valor: '' }, { where: { clave: 'logo' } });
    const res = await request(app).get('/api/v1/pwa/icono/192').buffer(true);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.body.subarray(1, 4).toString()).toBe('PNG');
  });

  it('no acepta rutas de logo fuera de uploads ni tamaños raros', async () => {
    await Configuracion.update({ valor: '/uploads/../../.env' }, { where: { clave: 'logo' } });
    expect((await request(app).get('/api/v1/pwa/icono/64')).status).toBe(200); // cae a las iniciales
    expect((await request(app).get('/api/v1/pwa/icono/999')).status).toBe(404);
  });
});
