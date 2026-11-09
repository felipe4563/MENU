jest.mock('../src/socket', () => ({
  emitir: jest.fn(), init: jest.fn(),
  estadoAgentes: jest.fn(() => []),
  desconectadoEn: jest.fn(() => null),
}));
const { estadoAgentes } = require('../src/socket');
const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const { Sucursal, Caja, Usuario, Rol } = require('../src/models');

describe('GET /api/v1/impresion/estado-agentes', () => {
  let sucursal, cajaFisica, cajaBluetooth, usuario;
  let token;

  beforeAll(async () => {
    const timestamp = Date.now();
    sucursal = await Sucursal.create({ nombre: `Sucursal Impresion Estado Test ${timestamp}` });
    cajaFisica = await Caja.create({ sucursal_id: sucursal.id, nombre: 'Caja Fisica Estado Test', modo_impresion: 'fisica' });
    cajaBluetooth = await Caja.create({ sucursal_id: sucursal.id, nombre: 'Caja BT Estado Test', modo_impresion: 'bluetooth' });

    const rol = await Rol.findOne({ where: { nombre: 'Cajero' } });
    const hash = await bcrypt.hash('clave123', 10);
    usuario = await Usuario.create({ rol_id: rol.id, nombre: `Impresion Estado Test ${timestamp}`, email: `impresion-estado-test-${timestamp}@restaurante.com`, contrasena: hash });
    await usuario.addSucursal(sucursal);

    const login = await request(app).post('/api/v1/auth/login').send({ email: usuario.email, contrasena: 'clave123' });
    token = login.body.datos.token;
  });

  afterAll(async () => {
    await Usuario.destroy({ where: { id: usuario.id } });
    await Caja.destroy({ where: { sucursal_id: sucursal.id } });
    await Sucursal.destroy({ where: { id: sucursal.id } });
  });

  it('sin token → 401', async () => {
    const res = await request(app).get('/api/v1/impresion/estado-agentes');
    expect(res.status).toBe(401);
  });

  it('solo lista cajas físicas (nunca bluetooth), marcando conectado según estadoAgentes()', async () => {
    estadoAgentes.mockReturnValue([{ sucursal_id: sucursal.id, caja_id: cajaFisica.id, conectado_en: Date.now() }]);

    const res = await request(app)
      .get('/api/v1/impresion/estado-agentes')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const ids = res.body.datos.map((a) => a.caja_id);
    expect(ids).toContain(cajaFisica.id);
    expect(ids).not.toContain(cajaBluetooth.id);
    expect(res.body.datos.find((a) => a.caja_id === cajaFisica.id).conectado).toBe(true);
  });

  it('caja física sin agente conectado → conectado: false', async () => {
    estadoAgentes.mockReturnValue([]);

    const res = await request(app)
      .get('/api/v1/impresion/estado-agentes')
      .set('Authorization', `Bearer ${token}`);

    expect(res.body.datos.find((a) => a.caja_id === cajaFisica.id).conectado).toBe(false);
  });

  it('muestra la versión del agente, la pendiente y si se auto-actualiza', async () => {
    estadoAgentes.mockReturnValue([{ sucursal_id: sucursal.id, caja_id: cajaFisica.id, conectado_en: Date.now(), version: '1.1.2', version_pendiente: '1.1.3', autoactualizacion: true }]);

    const res = await request(app)
      .get('/api/v1/impresion/estado-agentes')
      .set('Authorization', `Bearer ${token}`);

    expect(res.body.datos.find((a) => a.caja_id === cajaFisica.id)).toMatchObject({
      conectado: true, version: '1.1.2', version_pendiente: '1.1.3', autoactualizacion: true, desconectado_en: null,
    });
  });
});
