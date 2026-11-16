// Sueldos: cuánto gana cada uno según su forma de pago y los días que marcó,
// y los pagos que salen de la caja (gasto de la caja + libro + flujo).
const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const {
  Sucursal, Usuario, Rol, Caja, SesionCaja, LibroCaja, Gasto, MarcacionPersonal,
  SueldoPersonal, PagoPersonal, AusenciaPersonal, HorarioPersonal,
} = require('../src/models');
const { calcular, periodoDe, sumarDias } = require('../src/modules/sueldos/calculo');

const set = (arr) => new Set(arr);
const dias = (desde, hasta) => { const r = []; for (let f = desde; f <= hasta; f = sumarDias(f, 1)) r.push(f); return r; };
const LUN_A_SAB = set([1, 2, 3, 4, 5, 6]);

describe('cálculo de sueldos', () => {
  it('períodos: semana de lunes a domingo, quincenas y mes', () => {
    expect(periodoDe('semanal', '2026-11-18')).toEqual(['2026-11-16', '2026-11-22']);
    expect(periodoDe('quincenal', '2026-11-15')).toEqual(['2026-11-01', '2026-11-15']);
    expect(periodoDe('quincenal', '2026-02-20')).toEqual(['2026-02-16', '2026-02-28']);
    expect(periodoDe('mensual', '2026-11-30')).toEqual(['2026-11-01', '2026-11-30']);
  });

  it('diario: gana cada día que marcó; los adelantos se restan', () => {
    const c = calcular({
      sueldos: [{ modalidad: 'diario', monto: 100, vigente_desde: '2026-11-01' }],
      marcados: set(['2026-11-01', '2026-11-02', '2026-11-04']), justificados: set([]), laborables: null,
      movimientos: [{ tipo: 'pago', monto: 200, fecha: '2026-11-03' }], hoy: '2026-11-05',
    });
    expect(c.totales).toMatchObject({ ganado: 300, pagado: 200, debe: 100 });
    expect(c.proximo.fecha).toBe('2026-11-05');
  });

  it('mensual: descuenta faltas (no las justificadas) y al final resta los adelantos', () => {
    // Noviembre 2026 de lunes a sábado: 25 días → Bs 120 el día.
    const laborables = dias('2026-11-01', '2026-11-30').filter((f) => new Date(`${f}T12:00:00Z`).getUTCDay() !== 0);
    const faltas = ['2026-11-10', '2026-11-20'];
    const c = calcular({
      sueldos: [{ modalidad: 'mensual', monto: 3000, descontar_faltas: true, vigente_desde: '2026-11-01' }],
      marcados: set(laborables.filter((f) => !faltas.includes(f) && f !== '2026-11-12')),
      justificados: set(['2026-11-12']), laborables: LUN_A_SAB,
      movimientos: [{ tipo: 'adelanto', monto: 500, fecha: '2026-11-15' }, { tipo: 'bono', monto: 50, fecha: '2026-11-20' }],
      hoy: '2026-11-30',
    });
    const p = c.periodos[0];
    expect(p).toMatchObject({ dias_del_periodo: 25, valor_dia: 120, dias_trabajados: 23, faltas, justificadas: ['2026-11-12'], descuento_faltas: 240, ganado: 2760 });
    expect(c.totales.debe).toBe(2760 + 50 - 500);
    expect(c.proximo).toEqual({ fecha: '2026-11-30', monto: 2310 });
  });

  it('mensual a medio mes: lo ganado hasta hoy y lo que cobraría al cierre', () => {
    const c = calcular({
      sueldos: [{ modalidad: 'mensual', monto: 3000, descontar_faltas: true, vigente_desde: '2026-11-01' }],
      marcados: set(dias('2026-11-02', '2026-11-14')), justificados: set([]), laborables: LUN_A_SAB,
      movimientos: [{ tipo: 'adelanto', monto: 500, fecha: '2026-11-10' }], hoy: '2026-11-16',
    });
    // Marcó 12 días hábiles (2–7, 9–14); hoy lunes 16 todavía puede marcar.
    expect(c.actual).toMatchObject({ dias_trabajados: 12, ganado: 1440, proyectado: 3000, faltas: [] });
    expect(c.totales.debe).toBe(940);
    expect(c.proximo).toEqual({ fecha: '2026-11-30', monto: 2500 });
    expect(c.periodo_actual.adelantos).toBe(500);
  });

  it('sin descontar faltas (o sin horario) cobra el período completo', () => {
    const c = calcular({
      sueldos: [{ modalidad: 'semanal', monto: 700, descontar_faltas: false, vigente_desde: '2026-11-09' }],
      marcados: set(['2026-11-09']), justificados: set([]), laborables: LUN_A_SAB, hoy: '2026-11-15',
    });
    expect(c.totales.ganado).toBe(700);
    const sinHorario = calcular({
      sueldos: [{ modalidad: 'semanal', monto: 700, descontar_faltas: true, vigente_desde: '2026-11-09' }],
      marcados: set([]), justificados: set([]), laborables: null, hoy: '2026-11-15',
    });
    expect(sinHorario.totales.ganado).toBe(700);
    expect(sinHorario.actual.sin_horario).toBe(true);
  });

  it('entrar a mitad de quincena paga en proporción', () => {
    const c = calcular({
      sueldos: [{ modalidad: 'quincenal', monto: 1500, descontar_faltas: true, vigente_desde: '2026-11-10' }],
      marcados: set(dias('2026-11-10', '2026-11-14')), justificados: set([]), laborables: LUN_A_SAB, hoy: '2026-11-15',
    });
    // 1–15 nov de lunes a sábado: 12 días hábiles (1, 8 y 15 son domingo). Trabajó 5 (10–14).
    expect(c.actual.dias_del_periodo).toBe(12);
    expect(c.totales.ganado).toBe(625);
  });

  it('un aumento rige desde su día y "ninguno" deja de sumar', () => {
    const c = calcular({
      sueldos: [
        { modalidad: 'diario', monto: 100, vigente_desde: '2026-11-01' },
        { modalidad: 'diario', monto: 120, vigente_desde: '2026-11-03' },
        { modalidad: 'ninguno', monto: 0, vigente_desde: '2026-11-05' },
      ],
      marcados: set(dias('2026-11-01', '2026-11-06')), justificados: set([]), laborables: null, hoy: '2026-11-06',
    });
    expect(c.totales.ganado).toBe(100 + 100 + 120 + 120);
    expect(c.proximo).toBeNull();
  });
});

describe('Sueldos (API)', () => {
  let sucursal, admin, cajero, maria, caja, sesion, tokenAdmin, tokenCajero, tokenMaria;
  const hoy = new Date(Date.now() - 4 * 3600000).toISOString().slice(0, 10);
  const ayer = sumarDias(hoy, -1);
  const anteayer = sumarDias(hoy, -2);
  const login = async (email) => (await request(app).post('/api/v1/auth/login').send({ email, contrasena: 'clave123' })).body.datos.token;
  const como = (token) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    sucursal = await Sucursal.create({ nombre: 'Sucursal Sueldos Test' });
    const rolAdmin = await Rol.findOne({ where: { nombre: 'Administrador' } });
    const rolCajero = await Rol.findOne({ where: { nombre: 'Cajero' } });
    const clave = await bcrypt.hash('clave123', 10);
    admin = await Usuario.create({ rol_id: rolAdmin.id, nombre: 'Admin Sueldos Test', email: 'admin-sueldos-test@restaurante.com', contrasena: clave });
    cajero = await Usuario.create({ rol_id: rolCajero.id, nombre: 'Cajero Sueldos Test', email: 'cajero-sueldos-test@restaurante.com', contrasena: clave });
    maria = await Usuario.create({ rol_id: rolCajero.id, nombre: 'Maria Sueldos Test', email: 'maria-sueldos-test@restaurante.com', contrasena: clave });
    for (const u of [admin, cajero, maria]) await u.addSucursal(sucursal);
    [tokenAdmin, tokenCajero, tokenMaria] = [await login(admin.email), await login(cajero.email), await login(maria.email)];
    caja = await Caja.create({ sucursal_id: sucursal.id, nombre: 'Caja Sueldos Test' });
    sesion = await SesionCaja.create({ usuario_id: cajero.id, sucursal_id: sucursal.id, caja_id: caja.id, monto_apertura: 0 });
    for (const fecha of [anteayer, ayer]) {
      await MarcacionPersonal.create({ usuario_id: maria.id, sucursal_id: sucursal.id, fecha, hora_entrada: new Date(`${fecha}T08:00:00-04:00`) });
    }
  });

  afterAll(async () => {
    const ids = [admin.id, cajero.id, maria.id];
    await PagoPersonal.destroy({ where: { usuario_id: ids } });
    await SueldoPersonal.destroy({ where: { usuario_id: ids } });
    await AusenciaPersonal.destroy({ where: { usuario_id: ids } });
    await HorarioPersonal.destroy({ where: { usuario_id: ids } });
    await MarcacionPersonal.destroy({ where: { usuario_id: ids } });
    await LibroCaja.destroy({ where: { usuario_id: ids } });
    await Gasto.destroy({ where: { sesion_caja_id: sesion.id } });
    await SesionCaja.destroy({ where: { id: sesion.id } });
    await Caja.destroy({ where: { id: caja.id } });
    await Usuario.destroy({ where: { id: ids } });
    await Sucursal.destroy({ where: { id: sucursal.id } });
  });

  it('sin personal.pagar no se ve ni se paga', async () => {
    expect((await request(app).get('/api/v1/sueldos').set(como(tokenCajero))).status).toBe(403);
    expect((await request(app).post(`/api/v1/sueldos/${maria.id}/movimientos`).set(como(tokenCajero)).send({ tipo: 'pago', monto: 1 })).status).toBe(403);
  });

  it('configura diario Bs 100 y le debe los días que marcó', async () => {
    const r = await request(app).put(`/api/v1/sueldos/${maria.id}/sueldo`).set(como(tokenAdmin)).send({ modalidad: 'diario', monto: 100, vigente_desde: anteayer });
    expect(r.status).toBe(200);
    expect(r.body.datos).toMatchObject({ debe: 200, sueldo: { modalidad: 'diario', monto: 100, descontar_faltas: false } });
    expect((await request(app).put(`/api/v1/sueldos/${maria.id}/sueldo`).set(como(tokenAdmin)).send({ modalidad: 'anual', monto: 1, vigente_desde: hoy })).status).toBe(400);
    const lista = (await request(app).get('/api/v1/sueldos').set(como(tokenAdmin))).body.datos;
    expect(lista.personas.find((p) => p.usuario.id === maria.id).debe).toBe(200);
  });

  it('pagar desde la caja: gasto de la caja, libro con Sueldos y la persona, y queda en cero', async () => {
    const r = await request(app).post(`/api/v1/sueldos/${maria.id}/movimientos`).set(como(tokenAdmin)).send({ tipo: 'pago', monto: 200, sesion_caja_id: sesion.id });
    expect(r.status).toBe(201);
    expect(r.body.datos).toMatchObject({ fecha: hoy, metodo_pago: 'efectivo', sesion_caja_id: sesion.id });
    expect(Number((await SesionCaja.findByPk(sesion.id)).total_gastos)).toBe(200);
    const gasto = await Gasto.findByPk(r.body.datos.gasto_id);
    expect(gasto.descripcion).toBe('Sueldo · Maria Sueldos Test');
    expect(await LibroCaja.findByPk(r.body.datos.libro_caja_id)).toMatchObject({ categoria: 'sueldos', detalle: 'Maria Sueldos Test', sesion_caja_id: sesion.id });
    expect((await request(app).get(`/api/v1/sueldos/${maria.id}`).set(como(tokenAdmin))).body.datos.debe).toBe(0);
  });

  it('anular el pago devuelve la plata a la caja', async () => {
    const pago = await PagoPersonal.findOne({ where: { usuario_id: maria.id, tipo: 'pago' } });
    expect((await request(app).delete(`/api/v1/sueldos/${maria.id}/movimientos/${pago.id}`).set(como(tokenAdmin))).status).toBe(200);
    expect(Number((await SesionCaja.findByPk(sesion.id)).total_gastos)).toBe(0);
    expect(await Gasto.count({ where: { id: pago.gasto_id } })).toBe(0);
    expect(await LibroCaja.count({ where: { id: pago.libro_caja_id } })).toBe(0);
  });

  it('adelanto por fuera (QR) no toca la caja y no se edita desde el flujo; bono y descuento cambian lo que se debe', async () => {
    const r = await request(app).post(`/api/v1/sueldos/${maria.id}/movimientos`).set(como(tokenAdmin)).send({ tipo: 'adelanto', monto: 50, metodo_pago: 'qr', fecha: ayer });
    expect(r.status).toBe(201);
    expect(await LibroCaja.findByPk(r.body.datos.libro_caja_id)).toMatchObject({ metodo_pago: 'qr', sesion_caja_id: null, fecha: ayer, categoria: 'sueldos' });
    expect(Number((await SesionCaja.findByPk(sesion.id)).total_gastos)).toBe(0);
    const movs = (await request(app).get('/api/v1/flujo-caja/movimientos').query({ mes: ayer.slice(0, 7) }).set(como(tokenAdmin))).body.datos;
    expect(movs.find((m) => m.id === r.body.datos.libro_caja_id)).toBeUndefined();
    expect((await request(app).delete(`/api/v1/flujo-caja/movimientos/${r.body.datos.libro_caja_id}`).set(como(tokenAdmin))).status).toBe(404);

    await request(app).post(`/api/v1/sueldos/${maria.id}/movimientos`).set(como(tokenAdmin)).send({ tipo: 'bono', monto: 30 });
    const d = await request(app).post(`/api/v1/sueldos/${maria.id}/movimientos`).set(como(tokenAdmin)).send({ tipo: 'descuento', monto: 10, nota: 'Vaso roto' });
    expect(d.body.datos.libro_caja_id).toBeNull();
    expect((await request(app).get(`/api/v1/sueldos/${maria.id}`).set(como(tokenAdmin))).body.datos.debe).toBe(200 - 50 + 30 - 10);
  });

  it('mensual: una falta justificada no se descuenta', async () => {
    const dia = new Date(`${ayer}T12:00:00Z`).getUTCDay();
    // Le toca trabajar solo el día de ayer y el de anteayer.
    for (let d = 0; d < 7; d++) {
      await HorarioPersonal.create({ usuario_id: maria.id, dia_semana: d, trabaja: d === dia || d === (dia + 6) % 7 ? 1 : 0, hora_entrada: '08:00', hora_salida: '16:00' });
    }
    await MarcacionPersonal.destroy({ where: { usuario_id: maria.id, fecha: ayer } });
    await request(app).put(`/api/v1/sueldos/${maria.id}/sueldo`).set(como(tokenAdmin)).send({ modalidad: 'mensual', monto: 3000, vigente_desde: anteayer });
    let d = (await request(app).get(`/api/v1/sueldos/${maria.id}`).set(como(tokenAdmin))).body.datos;
    expect(d.periodos[0].faltas).toContain(ayer);
    const j = await request(app).post(`/api/v1/sueldos/${maria.id}/justificadas`).set(como(tokenAdmin)).send({ fecha: ayer, motivo: 'Médico' });
    expect(j.status).toBe(200);
    d = j.body.datos;
    expect(d.periodos[0].faltas).not.toContain(ayer);
    expect(d.periodos[0].justificadas).toContain(ayer);
  });

  it('cada uno ve lo suyo', async () => {
    const r = await request(app).get('/api/v1/sueldos/mio').set(como(tokenMaria));
    expect(r.status).toBe(200);
    expect(r.body.datos).toMatchObject({ configurado: true, sueldo: { modalidad: 'mensual' } });
    expect((await request(app).get('/api/v1/sueldos/mio').set(como(tokenCajero))).body.datos.configurado).toBe(false);
  });
});
