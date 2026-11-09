// Endpoints públicos que usa el agente de impresión para auto-actualizarse.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agente-dist-'));
process.env.AGENTE_DIST_DIR = dir;

const request = require('supertest');
const app = require('../src/app');

function publicar(version, contenido = 'exe falso ' + version) {
  const datos = Buffer.from(contenido);
  fs.writeFileSync(path.join(dir, 'agente-impresion.exe'), datos);
  fs.writeFileSync(path.join(dir, 'agente.json'), JSON.stringify({
    version, sha256: crypto.createHash('sha256').update(datos).digest('hex'), tamano: datos.length, generado_en: '2026-11-08T00:00:00.000Z',
  }));
  // mtime distinto para que el servicio relea el json
  const t = new Date(Date.now() + Math.random() * 100000);
  fs.utimesSync(path.join(dir, 'agente.json'), t, t);
  return datos;
}

describe('GET /api/v1/agente', () => {
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('sin agente publicado → 404 en version y descargar', async () => {
    expect((await request(app).get('/api/v1/agente/version')).status).toBe(404);
    expect((await request(app).get('/api/v1/agente/descargar')).status).toBe(404);
  });

  it('devuelve versión, sha256 y tamaño sin pedir login', async () => {
    const datos = publicar('1.1.2');
    const res = await request(app).get('/api/v1/agente/version');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      version: '1.1.2', tamano: datos.length, generado_en: '2026-11-08T00:00:00.000Z',
      sha256: crypto.createHash('sha256').update(datos).digest('hex'),
    });
  });

  it('descargar entrega el mismo exe que anuncia /version', async () => {
    const datos = publicar('1.1.3', 'otro exe');
    const res = await request(app).get('/api/v1/agente/descargar').buffer(true).parse((r, cb) => {
      const partes = []; r.on('data', (c) => partes.push(c)); r.on('end', () => cb(null, Buffer.concat(partes)));
    });
    expect(res.status).toBe(200);
    expect(res.headers['x-agente-version']).toBe('1.1.3');
    expect(Buffer.compare(res.body, datos)).toBe(0);
  });

  it('si el exe no coincide con el tamaño del json (a medio copiar) → 404', async () => {
    publicar('1.1.4');
    fs.appendFileSync(path.join(dir, 'agente-impresion.exe'), 'basura');
    const t = new Date(Date.now() + 200000);
    fs.utimesSync(path.join(dir, 'agente.json'), t, t);
    expect((await request(app).get('/api/v1/agente/version')).status).toBe(404);
  });
});
