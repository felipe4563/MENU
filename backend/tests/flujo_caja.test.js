// Flujo de caja: arma el mes desde el libro de caja (ventas, compras con su
// detalle, gastos de caja, devoluciones) y lo anotado a mano (sueldos,
// traspasos, ajustes), con el saldo que viene del mes anterior.
const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const {
  Sucursal, Usuario, Rol, Caja, SesionCaja, LibroCaja, Compra, DetalleCompra, Insumo, Gasto, CategoriaFlujo,
} = require('../src/models');

describe('Flujo de caja', () => {
  let sucursal, otra, usuario, caja, sesion, insumo, compra, token;
  const auth = () => ({ Authorization: `Bearer ${token}` });
  // Un mes cerrado del pasado, para que las fechas no dependan de hoy.
  const MES = '2026-09';
  const ANTERIOR = '2026-08-20';
  const flujo = () => request(app).get('/api/v1/flujo-caja').query({ mes: MES }).set(auth());
  const anotar = (body) => request(app).post('/api/v1/flujo-caja/movimientos').set(auth()).send(body);
  const fila = (filas, q) => filas.filter((f) => Object.entries(q).every(([k, v]) => f[k] === v));
  const suma = (filas) => filas.reduce((s, f) => s + f.total, 0);

  beforeAll(async () => {
    sucursal = await Sucursal.create({ nombre: 'Sucursal Flujo Test' });
    otra = await Sucursal.create({ nombre: 'Sucursal Flujo Otra Test' });
    const rol = await Rol.findOne({ where: { nombre: 'Administrador' } });
    usuario = await Usuario.create({ rol_id: rol.id, nombre: 'Flujo Test', email: 'flujo-test@restaurante.com', contrasena: await bcrypt.hash('clave123', 10) });
    await usuario.addSucursal(sucursal);
    token = (await request(app).post('/api/v1/auth/login').send({ email: 'flujo-test@restaurante.com', contrasena: 'clave123' })).body.datos.token;
    caja = await Caja.create({ sucursal_id: sucursal.id, nombre: 'Caja Flujo Test' });
    sesion = await SesionCaja.create({ usuario_id: usuario.id, sucursal_id: sucursal.id, caja_id: caja.id, monto_apertura: 0 });
    const cajaOtra = await Caja.create({ sucursal_id: otra.id, nombre: 'Caja Flujo Otra Test' });
    const sesionOtra = await SesionCaja.create({ usuario_id: usuario.id, sucursal_id: otra.id, caja_id: cajaOtra.id, monto_apertura: 0 });
    insumo = await Insumo.create({ nombre: 'Pescado Flujo Test', unidad_medida: 'kg' });

    const libro = (d) => LibroCaja.create({ usuario_id: usuario.id, sesion_caja_id: sesion.id, ...d });
    // Ventas del 3 de septiembre: efectivo y QR.
    await libro({ tipo: 'ingreso', concepto: 'Venta #9001', monto: 100, metodo_pago: 'efectivo', referencia_id: 9001, creado_en: new Date('2026-09-03T12:00:00-04:00') });
    await libro({ tipo: 'ingreso', concepto: 'Venta #9002 · parte 1', monto: 40, metodo_pago: 'qr', referencia_id: 9002, creado_en: new Date('2026-09-03T13:00:00-04:00') });
    // Gasto de caja sin categoría y devolución.
    await libro({ tipo: 'egreso', concepto: 'Bolsas de basura', monto: 7, metodo_pago: 'efectivo', creado_en: new Date('2026-09-03T14:00:00-04:00') });
    await libro({ tipo: 'egreso', concepto: 'Devolución venta #9001', monto: 10, metodo_pago: 'efectivo', creado_en: new Date('2026-09-03T15:00:00-04:00') });
    // Compra con detalle por insumo.
    compra = await Compra.create({ sucursal_id: sucursal.id, usuario_id: usuario.id, total: 50, estado: 'recibido', sesion_caja_id: sesion.id });
    await DetalleCompra.create({ compra_id: compra.id, insumo_id: insumo.id, cantidad: 2, costo_unitario: 20, subtotal: 40 });
    await libro({ tipo: 'egreso', concepto: `Compra #${compra.id}`, monto: 50, metodo_pago: 'efectivo', compra_id: compra.id, creado_en: new Date('2026-09-04T09:00:00-04:00') });
    // Del mes anterior: entra al saldo inicial.
    await libro({ tipo: 'ingreso', concepto: 'Venta #8999', monto: 300, metodo_pago: 'efectivo', creado_en: new Date(`${ANTERIOR}T12:00:00-04:00`) });
    // De otra sucursal: no se ve.
    await LibroCaja.create({ usuario_id: usuario.id, sesion_caja_id: sesionOtra.id, tipo: 'ingreso', concepto: 'Venta #9100', monto: 999, metodo_pago: 'efectivo', creado_en: new Date('2026-09-03T12:00:00-04:00') });
  });

  afterAll(async () => {
    await CategoriaFlujo.destroy({ where: { sistema: false, nombre: { [require('sequelize').Op.like]: '%Test%' } } });
    await LibroCaja.destroy({ where: { usuario_id: usuario.id } });
    await Gasto.destroy({ where: { usuario_id: usuario.id } });
    await DetalleCompra.destroy({ where: { compra_id: compra.id } });
    await Compra.destroy({ where: { id: compra.id } });
    await Insumo.destroy({ where: { id: insumo.id } });
    await SesionCaja.destroy({ where: { usuario_id: usuario.id } });
    await Caja.destroy({ where: { sucursal_id: [sucursal.id, otra.id] } });
    await Usuario.destroy({ where: { id: usuario.id } });
    await Sucursal.destroy({ where: { id: [sucursal.id, otra.id] } });
  });

  it('arma el mes por día y medio, con cada movimiento en su categoría', async () => {
    const r = await flujo();
    expect(r.status).toBe(200);
    const { filas, dias, saldo_inicial: si } = r.body.datos;
    expect(dias).toBe(30);
    expect(suma(fila(filas, { dia: '2026-09-03', categoria: 'ventas', metodo: 'efectivo' }))).toBe(100);
    expect(suma(fila(filas, { dia: '2026-09-03', categoria: 'ventas', metodo: 'qr' }))).toBe(40);
    expect(fila(filas, { categoria: 'gastos_caja' })[0]).toMatchObject({ detalle: 'Bolsas de basura', total: 7, tipo: 'egreso' });
    expect(suma(fila(filas, { categoria: 'devoluciones' }))).toBe(10);
    // La compra se desglosa por insumo y lo que no tiene detalle queda aparte.
    const compras = fila(filas, { dia: '2026-09-04', categoria: 'compras' });
    expect(compras.find((c) => c.detalle === 'Pescado Flujo Test').total).toBe(40);
    expect(compras.find((c) => c.detalle === 'Sin detalle').total).toBe(10);
    // Saldo que viene de agosto; lo de la otra sucursal no aparece.
    expect(si.efectivo).toBe(300);
    expect(suma(fila(filas, { categoria: 'ventas' }))).toBe(140);
  });

  it('la devolución de un adelanto de reserva llega como egreso en su categoría de ingresos', async () => {
    const libro = (d) => LibroCaja.create({ usuario_id: usuario.id, sesion_caja_id: sesion.id, categoria: 'adelantos_reserva', metodo_pago: 'efectivo', ...d });
    await libro({ tipo: 'ingreso', concepto: 'Adelanto reserva #1 · Ana', monto: 50, creado_en: new Date('2026-09-09T10:00:00-04:00') });
    await libro({ tipo: 'egreso', concepto: 'Devolución adelanto reserva #1 · Ana', monto: 20, creado_en: new Date('2026-09-10T10:00:00-04:00') });
    const { filas, grupos, categorias } = (await flujo()).body.datos;
    expect(categorias.find((c) => c.clave === 'adelantos_reserva').grupo).toBe('ingresos');
    expect(grupos.find((g) => g.clave === 'ingresos').tipo).toBe('ingreso');
    // La pantalla resta la fila egreso dentro del grupo de ingresos (signoFila).
    expect(fila(filas, { dia: '2026-09-09', categoria: 'adelantos_reserva' })).toEqual([expect.objectContaining({ tipo: 'ingreso', total: 50 })]);
    expect(fila(filas, { dia: '2026-09-10', categoria: 'adelantos_reserva' })).toEqual([expect.objectContaining({ tipo: 'egreso', total: 20 })]);
  });

  it('anota sueldos con su persona y el día en que se pagaron', async () => {
    const r = await anotar({ fecha: '2026-09-05', categoria: 'sueldos', detalle: 'Jhoselin', metodo_pago: 'efectivo', monto: 70 });
    expect(r.status).toBe(201);
    expect(r.body.datos).toMatchObject({ tipo: 'egreso', categoria: 'sueldos', detalle: 'Jhoselin', fecha: '2026-09-05', sucursal_id: sucursal.id });
    const { filas } = (await flujo()).body.datos;
    expect(fila(filas, { dia: '2026-09-05', categoria: 'sueldos', detalle: 'Jhoselin' })[0].total).toBe(70);
  });

  it('un traspaso sale de un medio y entra al otro', async () => {
    const r = await anotar({ fecha: '2026-09-06', categoria: 'traspaso', metodo_pago: 'qr', monto: 25 });
    expect(r.status).toBe(201);
    const { filas } = (await flujo()).body.datos;
    expect(fila(filas, { dia: '2026-09-06', categoria: 'traspaso', metodo: 'qr', tipo: 'egreso' })[0].total).toBe(25);
    expect(fila(filas, { dia: '2026-09-06', categoria: 'traspaso', metodo: 'efectivo', tipo: 'ingreso' })[0].total).toBe(25);
    // En la lista se ve una sola vez; borrarlo borra los dos lados.
    const lista = (await request(app).get('/api/v1/flujo-caja/movimientos').query({ mes: MES }).set(auth())).body.datos;
    const t = lista.filter((m) => m.categoria === 'traspaso');
    expect(t).toHaveLength(1);
    expect(t[0].destino).toBe('efectivo');
    expect((await request(app).delete(`/api/v1/flujo-caja/movimientos/${t[0].id}`).set(auth())).status).toBe(200);
    expect(await LibroCaja.count({ where: { usuario_id: usuario.id, categoria: 'traspaso' } })).toBe(0);
  });

  it('un ajuste de saldo suma o resta según se elija, y se puede editar', async () => {
    expect((await anotar({ fecha: '2026-09-01', categoria: 'ajuste', metodo_pago: 'efectivo', monto: 500 })).status).toBe(400);
    const r = await anotar({ fecha: '2026-09-01', categoria: 'ajuste', tipo: 'ingreso', metodo_pago: 'efectivo', monto: 500, detalle: 'Saldo con que empezamos' });
    expect(r.status).toBe(201);
    const e = await request(app).put(`/api/v1/flujo-caja/movimientos/${r.body.datos.id}`).set(auth())
      .send({ fecha: '2026-09-02', categoria: 'ajuste', tipo: 'ingreso', metodo_pago: 'efectivo', monto: 450 });
    expect(e.status).toBe(200);
    expect(e.body.datos).toMatchObject({ fecha: '2026-09-02', monto: '450.00' });
  });

  it('no deja anotar categorías del sistema, días del futuro ni montos inválidos', async () => {
    expect((await anotar({ fecha: '2026-09-05', categoria: 'ventas', monto: 10 })).status).toBe(400);
    expect((await anotar({ fecha: '2999-01-01', categoria: 'luz', monto: 10 })).status).toBe(400);
    expect((await anotar({ fecha: '2026-09-05', categoria: 'luz', monto: -3 })).status).toBe(400);
    expect((await request(app).get('/api/v1/flujo-caja').query({ mes: '2026-9' }).set(auth())).status).toBe(400);
  });

  it('el gasto de caja y el libro guardan la categoría elegida', async () => {
    const g = await request(app).post(`/api/v1/caja/${sesion.id}/gastos`).set(auth()).send({ descripcion: 'Gas de la cocina', monto: 30, categoria: 'gas' });
    expect(g.status).toBe(201);
    expect(await LibroCaja.count({ where: { referencia_id: g.body.datos.id, categoria: 'gas' } })).toBe(1);
    const mal = await request(app).post(`/api/v1/caja/${sesion.id}/gastos`).set(auth()).send({ descripcion: 'x', monto: 1, categoria: 'inyeccion' });
    expect(mal.status).toBe(400);
    const l = await request(app).post('/api/v1/libro-caja').set(auth()).send({ tipo: 'egreso', concepto: 'Recibo de luz', monto: 120, metodo_pago: 'qr', categoria: 'luz' });
    expect(l.status).toBe(201);
    expect(l.body.datos).toMatchObject({ categoria: 'luz', sucursal_id: sucursal.id });
  });

  describe('clasificar gastos (ABM de categorías)', () => {
    const cats = () => request(app).get('/api/v1/flujo-caja/categorias').set(auth());
    const nueva = (body) => request(app).post('/api/v1/flujo-caja/categorias').set(auth()).send(body);

    it('lista las categorías con sus grupos y cuántas veces se usaron', async () => {
      const r = await cats();
      expect(r.status).toBe(200);
      const luz = r.body.datos.categorias.find((c) => c.clave === 'luz');
      expect(luz).toMatchObject({ nombre: 'Electricidad', grupo: 'costo_fijo', sistema: false, activo: true });
      expect(r.body.datos.categorias.find((c) => c.clave === 'ventas')).toMatchObject({ auto: true, sistema: true });
    });

    it('crea una categoría, se puede usar al anotar y aparece en el flujo', async () => {
      const r = await nueva({ nombre: 'Wifi Test', grupo: 'costo_fijo' });
      expect(r.status).toBe(201);
      expect(r.body.datos).toMatchObject({ clave: 'wifi_test', nombre: 'Wifi Test', grupo: 'costo_fijo', activo: true });
      expect((await nueva({ nombre: 'wifi test', grupo: 'otros_gastos' })).status).toBe(409);
      expect((await nueva({ nombre: 'Algo Test', grupo: 'ajuste' })).status).toBe(400);
      expect((await nueva({ nombre: '  ', grupo: 'costo_fijo' })).status).toBe(400);
      expect((await anotar({ fecha: '2026-09-07', categoria: 'wifi_test', monto: 99 })).status).toBe(201);
      const { filas, categorias } = (await flujo()).body.datos;
      expect(categorias.find((c) => c.clave === 'wifi_test')).toBeTruthy();
      expect(fila(filas, { dia: '2026-09-07', categoria: 'wifi_test' })[0].total).toBe(99);
    });

    it('renombrar no cambia la clave; con movimientos no pasa de gasto a ingreso', async () => {
      const id = (await cats()).body.datos.categorias.find((c) => c.clave === 'wifi_test').id;
      const e = await request(app).put(`/api/v1/flujo-caja/categorias/${id}`).set(auth()).send({ nombre: 'Internet Wifi Test', grupo: 'otros_gastos' });
      expect(e.status).toBe(200);
      expect(e.body.datos).toMatchObject({ clave: 'wifi_test', nombre: 'Internet Wifi Test', grupo: 'otros_gastos' });
      expect((await request(app).put(`/api/v1/flujo-caja/categorias/${id}`).set(auth()).send({ grupo: 'ingresos' })).status).toBe(409);
    });

    it('borrar: con movimientos se oculta y ya no se ofrece; sin movimientos se borra; las del sistema no', async () => {
      const lista = (await cats()).body.datos.categorias;
      const usada = lista.find((c) => c.clave === 'wifi_test');
      const b = await request(app).delete(`/api/v1/flujo-caja/categorias/${usada.id}`).set(auth());
      expect(b.body.datos).toMatchObject({ ocultada: true, borrada: false });
      expect((await anotar({ fecha: '2026-09-08', categoria: 'wifi_test', monto: 5 })).status).toBe(400);
      expect(fila((await flujo()).body.datos.filas, { categoria: 'wifi_test' })).toHaveLength(1);

      const libre = (await nueva({ nombre: 'Basura Test', grupo: 'otros_gastos' })).body.datos;
      expect((await request(app).delete(`/api/v1/flujo-caja/categorias/${libre.id}`).set(auth())).body.datos.borrada).toBe(true);
      expect(await CategoriaFlujo.count({ where: { id: libre.id } })).toBe(0);

      const ventas = lista.find((c) => c.clave === 'ventas');
      expect((await request(app).delete(`/api/v1/flujo-caja/categorias/${ventas.id}`).set(auth())).status).toBe(409);
      expect((await request(app).put(`/api/v1/flujo-caja/categorias/${ventas.id}`).set(auth()).send({ grupo: 'costo_fijo' })).status).toBe(400);
    });

    it('el gasto de caja acepta una categoría creada por el usuario', async () => {
      const c = (await nueva({ nombre: 'Hielo Test', grupo: 'costo_variable' })).body.datos;
      const g = await request(app).post(`/api/v1/caja/${sesion.id}/gastos`).set(auth()).send({ descripcion: 'Hielo', monto: 12, categoria: c.clave });
      expect(g.status).toBe(201);
    });
  });
});
