// Recordatorio por correo de cupones por vencer.
const { Op } = require('sequelize');
const { Configuracion, Cliente, Cupon } = require('../src/models');
const { avisarCuponesPorVencer } = require('../src/jobs/avisoCupones.job');

const hoy = () => new Date(Date.now() - 4 * 3600 * 1000).toISOString().slice(0, 10);
const masDias = (n) => { const d = new Date(`${hoy()}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

describe('Job: aviso de cupones por vencer', () => {
  const t = Date.now();
  let conCorreo, sinCorreo, previa;
  const enviados = [];
  const enviar = async (m) => { enviados.push(m); };
  const configurado = () => true;

  beforeAll(async () => {
    previa = await Configuracion.findAll({ where: { clave: ['cupones_aviso_activo', 'cupones_aviso_dias'] } });
    await Configuracion.upsert({ clave: 'cupones_aviso_activo', valor: 'true' });
    await Configuracion.upsert({ clave: 'cupones_aviso_dias', valor: '2' });
    conCorreo = await Cliente.create({ nombre: `Ana Aviso ${t}`, tipo_documento: 'CI', numero_documento: `AV${t}`.slice(0, 15), email: `ana-${t}@correo.test` });
    sinCorreo = await Cliente.create({ nombre: `Beto Aviso ${t}`, tipo_documento: 'CI', numero_documento: `BV${t}`.slice(0, 15) });
    const base = { tipo: 'fijo', valor: 5, usos_maximos: 1, activo: 1 };
    await Cupon.bulkCreate([
      { ...base, codigo: `AVMAN${t}`.slice(0, 30), cliente_id: conCorreo.id, fecha_expiracion: masDias(1) },
      { ...base, codigo: `AVLEJ${t}`.slice(0, 30), cliente_id: conCorreo.id, fecha_expiracion: masDias(10) },
      { ...base, codigo: `AVUSA${t}`.slice(0, 30), cliente_id: conCorreo.id, fecha_expiracion: masDias(1), usos_actuales: 1 },
      { ...base, codigo: `AVSIN${t}`.slice(0, 30), cliente_id: sinCorreo.id, fecha_expiracion: masDias(1) },
    ]);
  });

  afterAll(async () => {
    await Cupon.destroy({ where: { cliente_id: [conCorreo.id, sinCorreo.id] } });
    await Cliente.destroy({ where: { id: [conCorreo.id, sinCorreo.id] } });
    await Configuracion.destroy({ where: { clave: ['cupones_aviso_activo', 'cupones_aviso_dias'] } });
    for (const c of previa) await Configuracion.create({ clave: c.clave, valor: c.valor });
  });

  it('avisa solo el cupón vigente que vence pronto, del cliente con correo', async () => {
    const r = await avisarCuponesPorVencer({ enviar, configurado });
    const mios = enviados.filter((m) => m.to === conCorreo.email);
    expect(mios).toHaveLength(1);
    expect(mios[0]).toMatchObject({ codigo: `AVMAN${t}`.slice(0, 30), vence: 'mañana' });
    expect(r.enviados).toBeGreaterThanOrEqual(1);
  });

  it('no repite el aviso del mismo cupón', async () => {
    enviados.length = 0;
    await avisarCuponesPorVencer({ enviar, configurado });
    expect(enviados.filter((m) => m.to === conCorreo.email)).toHaveLength(0);
  });

  it('si el correo falla, no lo marca como avisado', async () => {
    const c = await Cupon.create({ codigo: `AVFAL${t}`.slice(0, 30), tipo: 'fijo', valor: 5, usos_maximos: 1, activo: 1, cliente_id: conCorreo.id, fecha_expiracion: hoy() });
    await avisarCuponesPorVencer({ enviar: async () => { throw new Error('smtp caído'); }, configurado });
    await c.reload();
    expect(c.aviso_vencimiento_en).toBeNull();
  });

  it('apagado en Ajustes, no envía nada', async () => {
    await Configuracion.upsert({ clave: 'cupones_aviso_activo', valor: 'false' });
    expect(await avisarCuponesPorVencer({ enviar, configurado })).toEqual({ enviados: 0 });
    await Configuracion.upsert({ clave: 'cupones_aviso_activo', valor: 'true' });
  });
});
