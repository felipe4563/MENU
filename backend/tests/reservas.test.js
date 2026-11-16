// Reservas de mesa: crear, cruces de horario, estados y alcance por sucursal.
const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const { Sucursal, Area, Mesa, Usuario, Rol, Reserva } = require('../src/models');

describe('Reservas', () => {
  let sucursal, otra, area, areaOtra, mesa, mesaOtra, usuario, token;
  // Mañana en hora de Bolivia (yyyy-mm-dd).
  const manana = new Date(Date.now() - 4 * 3600000 + 86400000).toISOString().slice(0, 10);
  const auth = () => ({ Authorization: `Bearer ${token}` });
  const crear = (body) => request(app).post('/api/v1/reservas').set(auth()).send({ nombre_cliente: 'Familia Rojas', personas: 4, ...body });

  beforeAll(async () => {
    sucursal = await Sucursal.create({ nombre: 'Sucursal Reservas Test' });
    otra = await Sucursal.create({ nombre: 'Sucursal Reservas Otra Test' });
    area = await Area.create({ nombre: 'Area Reservas Test', sucursal_id: sucursal.id });
    areaOtra = await Area.create({ nombre: 'Area Reservas Otra Test', sucursal_id: otra.id });
    mesa = await Mesa.create({ area_id: area.id, nombre: 'Mesa Reservas 1', asientos: 6 });
    mesaOtra = await Mesa.create({ area_id: areaOtra.id, nombre: 'Mesa Reservas Otra' });
    const rol = await Rol.findOne({ where: { nombre: 'Administrador' } });
    usuario = await Usuario.create({ rol_id: rol.id, nombre: 'Reservas Test', email: 'reservas-test@restaurante.com', contrasena: await bcrypt.hash('clave123', 10) });
    await usuario.addSucursal(sucursal);
    token = (await request(app).post('/api/v1/auth/login').send({ email: 'reservas-test@restaurante.com', contrasena: 'clave123' })).body.datos.token;
  });

  afterAll(async () => {
    await Reserva.destroy({ where: { sucursal_id: [sucursal.id, otra.id] } });
    await Mesa.destroy({ where: { id: [mesa.id, mesaOtra.id] } });
    await Area.destroy({ where: { id: [area.id, areaOtra.id] } });
    await Usuario.destroy({ where: { id: usuario.id } });
    await Sucursal.destroy({ where: { id: [sucursal.id, otra.id] } });
  });

  it('crea una reserva con la hora tomada como hora de Bolivia y la lista en su día', async () => {
    const r = await crear({ fecha_hora: `${manana}T20:00`, mesa_id: mesa.id, telefono: '70000000', notas: 'Cumpleaños' });
    expect(r.status).toBe(201);
    expect(new Date(r.body.datos.fecha_hora).toISOString()).toBe(new Date(`${manana}T20:00:00-04:00`).toISOString());
    expect(r.body.datos).toMatchObject({ estado: 'pendiente', personas: 4, duracion_min: 120, mesa: { id: mesa.id } });
    const lista = await request(app).get('/api/v1/reservas').query({ fecha: manana }).set(auth());
    expect(lista.body.datos.map((x) => x.id)).toContain(r.body.datos.id);
  });

  it('no deja reservar la misma mesa en un horario que se cruza, pero sí otra hora o sin mesa', async () => {
    const cruce = await crear({ fecha_hora: `${manana}T21:00`, mesa_id: mesa.id });
    expect(cruce.status).toBe(409);
    expect(cruce.body.mensaje ?? cruce.body.error).toMatch(/20:00 a 22:00/);
    expect((await crear({ fecha_hora: `${manana}T22:00`, mesa_id: mesa.id })).status).toBe(201);
    expect((await crear({ fecha_hora: `${manana}T21:00` })).status).toBe(201);
  });

  it('al cancelar se libera el horario; volver a pendiente revisa el cruce', async () => {
    const a = (await crear({ fecha_hora: `${manana}T13:00`, mesa_id: mesa.id })).body.datos;
    const cancelada = await request(app).put(`/api/v1/reservas/${a.id}/estado`).set(auth()).send({ estado: 'cancelada' });
    expect(cancelada.body.datos.estado).toBe('cancelada');
    const b = await crear({ fecha_hora: `${manana}T13:30`, mesa_id: mesa.id });
    expect(b.status).toBe(201);
    expect((await request(app).put(`/api/v1/reservas/${a.id}/estado`).set(auth()).send({ estado: 'pendiente' })).status).toBe(409);
    expect((await request(app).put(`/api/v1/reservas/${a.id}/estado`).set(auth()).send({ estado: 'otro' })).status).toBe(400);
  });

  it('valida los datos y la mesa de otra sucursal', async () => {
    expect((await crear({ fecha_hora: `${manana}T12:00`, nombre_cliente: ' ' })).status).toBe(400);
    expect((await crear({ fecha_hora: `${manana}T12:00`, personas: 0 })).status).toBe(400);
    expect((await crear({ fecha_hora: 'mañana' })).status).toBe(400);
    expect((await crear({ fecha_hora: '2020-01-01T12:00' })).status).toBe(400);
    expect((await crear({ fecha_hora: `${manana}T12:00`, mesa_id: mesaOtra.id })).status).toBe(404);
  });

  it('editar cambia la hora y la mesa; no se ven ni se tocan reservas de otra sucursal', async () => {
    const a = (await crear({ fecha_hora: `${manana}T10:00` })).body.datos;
    const ed = await request(app).put(`/api/v1/reservas/${a.id}`).set(auth()).send({ fecha_hora: `${manana}T10:30`, mesa_id: mesa.id, personas: 2 });
    expect(ed.status).toBe(200);
    expect(ed.body.datos).toMatchObject({ personas: 2, mesa: { id: mesa.id }, nombre_cliente: 'Familia Rojas' });

    const ajena = await Reserva.create({ sucursal_id: otra.id, nombre_cliente: 'Ajena', personas: 2, fecha_hora: new Date(`${manana}T10:00:00-04:00`) });
    expect((await request(app).put(`/api/v1/reservas/${ajena.id}/estado`).set(auth()).send({ estado: 'cancelada' })).status).toBe(404);
    const lista = await request(app).get('/api/v1/reservas').query({ fecha: manana }).set(auth());
    expect(lista.body.datos.map((x) => x.id)).not.toContain(ajena.id);
  });
});
