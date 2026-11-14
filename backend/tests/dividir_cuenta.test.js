// Dividir la cuenta: cobrar un pedido en varias partes (por platos o en partes iguales).
const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const {
  Sucursal, Area, Mesa, Caja, SesionCaja, Usuario, Rol, Categoria, Producto, ProductoStockSucursal, RegistroInventario,
  Pedido, DetallePedido, LibroCaja, PedidoPago, PedidoPagoItem, PagoQr, Configuracion,
} = require('../src/models');

// Las partes por QR usan el QR propio del negocio (lo confirma el cajero).
const CLAVES_QR = ['qr_proveedor', 'qr_propio_imagen'];

describe('Dividir cuenta', () => {
  let sucursal, area, caja, caja2, caja3, rol, usuario, usuario2, usuario3, sesion, sesion2, categoria, platoA, platoB, platoC;
  let token, token2, token3;
  const mesas = [];
  const sesionesExtra = [];
  let configQrAntes = [];

  const crearCajero = async (nombre, email) => {
    const hash = await bcrypt.hash('clave123', 10);
    const u = await Usuario.create({ rol_id: rol.id, nombre, email, contrasena: hash });
    await u.addSucursal(sucursal);
    const tk = (await request(app).post('/api/v1/auth/login').send({ email, contrasena: 'clave123' })).body.datos.token;
    return { u, tk };
  };

  // Crea un pedido (de mesa con una mesa nueva, o para llevar) y le agrega
  // las líneas [{ producto, cantidad }].
  const nuevoPedido = async (lineas, { mesa = false, sesionId, tk } = {}) => {
    const body = { tipo: 'llevar', sesion_caja_id: sesionId || sesion.id };
    if (mesa) {
      const m = await Mesa.create({ area_id: area.id, nombre: `Mesa Dividir ${mesas.length + 1}` });
      mesas.push(m);
      body.tipo = 'mesa';
      body.mesa_id = m.id;
    }
    const p = await request(app).post('/api/v1/ventas').set('Authorization', `Bearer ${tk || token}`).send(body);
    expect(p.status).toBe(201);
    for (const l of lineas) {
      const it = await request(app).post(`/api/v1/ventas/${p.body.datos.id}/items`).set('Authorization', `Bearer ${tk || token}`)
        .send({ producto_id: l.producto.id, cantidad: l.cantidad });
      expect(it.status).toBe(201);
    }
    return p.body.datos.id;
  };

  // Cobra una parte del pedido: POST /ventas/:id/pagos
  const parte = (id, body, tk = token) => request(app).post(`/api/v1/ventas/${id}/pagos`)
    .set('Authorization', `Bearer ${tk}`).send(body);

  const ver = async (id) => (await request(app).get(`/api/v1/ventas/${id}`).set('Authorization', `Bearer ${token}`)).body.datos;

  const detalleDe = (pedido, producto) => pedido.detalles.find((d) => d.producto_id === producto.id);

  const stockDe = async (producto) => (await ProductoStockSucursal.findOne({ where: { producto_id: producto.id, sucursal_id: sucursal.id } })).stock;

  beforeAll(async () => {
    sucursal = await Sucursal.create({ nombre: 'Sucursal Dividir Cuenta Test' });
    area = await Area.create({ nombre: 'Area Dividir Cuenta Test', sucursal_id: sucursal.id });
    caja = await Caja.create({ sucursal_id: sucursal.id, nombre: 'Caja Dividir Cuenta Test' });
    caja2 = await Caja.create({ sucursal_id: sucursal.id, nombre: 'Caja 2 Dividir Cuenta Test' });
    caja3 = await Caja.create({ sucursal_id: sucursal.id, nombre: 'Caja 3 Dividir Cuenta Test' });
    rol = await Rol.findOne({ where: { nombre: 'Administrador' } });
    ({ u: usuario, tk: token } = await crearCajero('Cajero Dividir Test', 'dividir-cuenta-test@restaurante.com'));
    ({ u: usuario2, tk: token2 } = await crearCajero('Cajero 2 Dividir Test', 'dividir-cuenta-test2@restaurante.com'));
    ({ u: usuario3, tk: token3 } = await crearCajero('Cajero 3 Dividir Test', 'dividir-cuenta-test3@restaurante.com'));
    sesion = await SesionCaja.create({ usuario_id: usuario.id, sucursal_id: sucursal.id, caja_id: caja.id, monto_apertura: 0 });
    sesion2 = await SesionCaja.create({ usuario_id: usuario2.id, sucursal_id: sucursal.id, caja_id: caja2.id, monto_apertura: 0 });
    categoria = await Categoria.create({ nombre: 'Categoria Dividir Cuenta Test' });
    platoA = await Producto.create({ categoria_id: categoria.id, nombre: 'Plato A', precio: 30, stock: 50 });
    platoB = await Producto.create({ categoria_id: categoria.id, nombre: 'Plato B', precio: 25, stock: 50 });
    platoC = await Producto.create({ categoria_id: categoria.id, nombre: 'Plato C', precio: 100 });
    await ProductoStockSucursal.create({ producto_id: platoA.id, sucursal_id: sucursal.id, stock: 50 });
    await ProductoStockSucursal.create({ producto_id: platoB.id, sucursal_id: sucursal.id, stock: 50 });

    configQrAntes = await Configuracion.findAll({ where: { clave: CLAVES_QR } });
    await Configuracion.upsert({ clave: 'qr_proveedor', valor: 'propio' });
    await Configuracion.upsert({ clave: 'qr_propio_imagen', valor: '/uploads/qr-dividir-cuenta-test.png' });
  });

  afterAll(async () => {
    const ids = (await Pedido.findAll({ where: { sucursal_id: sucursal.id }, attributes: ['id'] })).map((p) => p.id);
    const pagos = (await PedidoPago.findAll({ where: { pedido_id: ids }, attributes: ['id'] })).map((p) => p.id);
    const sesiones = [sesion.id, sesion2.id, ...sesionesExtra.map((s) => s.id)];
    const productos = [platoA.id, platoB.id, platoC.id];
    await Configuracion.destroy({ where: { clave: CLAVES_QR } });
    for (const f of configQrAntes) await Configuracion.create({ clave: f.clave, valor: f.valor });
    await PagoQr.destroy({ where: { pedido_id: ids } });
    await PedidoPagoItem.destroy({ where: { pedido_pago_id: pagos } });
    await PedidoPago.destroy({ where: { pedido_id: ids } });
    await LibroCaja.destroy({ where: { sesion_caja_id: sesiones } });
    await DetallePedido.destroy({ where: { pedido_id: ids } });
    await Pedido.destroy({ where: { id: ids } });
    await SesionCaja.destroy({ where: { id: sesiones } });
    await RegistroInventario.destroy({ where: { producto_id: productos } });
    await ProductoStockSucursal.destroy({ where: { producto_id: productos } });
    await Producto.destroy({ where: { id: productos } });
    await Categoria.destroy({ where: { id: categoria.id } });
    await Usuario.destroy({ where: { id: [usuario.id, usuario2.id, usuario3.id] } });
    await Mesa.destroy({ where: { id: mesas.map((m) => m.id) } });
    await Area.destroy({ where: { id: area.id } });
    await Caja.destroy({ where: { id: [caja.id, caja2.id, caja3.id] } });
    await Sucursal.destroy({ where: { id: sucursal.id } });
  });

  it('el pedido nace sin pagos', async () => {
    const id = await nuevoPedido([{ producto: platoA, cantidad: 1 }, { producto: platoB, cantidad: 1 }]);
    const get = await request(app).get(`/api/v1/ventas/${id}`).set('Authorization', `Bearer ${token}`);
    expect(get.status).toBe(200);
    expect(get.body.datos.pagado).toBe('0.00');
    expect(get.body.datos.pagos).toEqual([]);
    expect(await PedidoPago.count({ where: { pedido_id: id } })).toBe(0);
  });

  it('por platos: tres personas pagan sus platos y el pedido se completa', async () => {
    const stockA = await stockDe(platoA);
    const stockB = await stockDe(platoB);
    const id = await nuevoPedido([{ producto: platoA, cantidad: 2 }, { producto: platoB, cantidad: 2 }], { mesa: true });
    const pedido = await ver(id);
    expect(pedido.total).toBe('110.00');
    const dA = detalleDe(pedido, platoA);
    const dB = detalleDe(pedido, platoB);

    const juanita = await parte(id, {
      modo: 'platos', persona: 'Juanita', items: [{ detalle_pedido_id: dA.id, cantidad: 1 }], metodo_pago: 'efectivo', monto_recibido: 50,
    });
    expect(juanita.status).toBe(201);
    expect(juanita.body.datos.completado).toBe(false);
    expect(juanita.body.datos.pago.monto).toBe('30.00');
    expect(juanita.body.datos.pago.cambio).toBe('20.00');
    expect(juanita.body.datos.pedido.pagado).toBe('30.00');
    expect(juanita.body.datos.datos_impresion).toBeNull();

    const felipe = await parte(id, {
      modo: 'platos', persona: 'Felipe', items: [{ detalle_pedido_id: dA.id, cantidad: 1 }, { detalle_pedido_id: dB.id, cantidad: 1 }],
      metodo_pago: 'efectivo', monto_recibido: 55,
    });
    expect(felipe.status).toBe(201);
    expect(felipe.body.datos.completado).toBe(false);
    expect(felipe.body.datos.pago.cambio).toBe('0.00');

    const julio = await parte(id, {
      modo: 'platos', persona: 'Julio', items: [{ detalle_pedido_id: dB.id, cantidad: 1 }], metodo_pago: 'efectivo', monto_recibido: 25,
    });
    expect(julio.status).toBe(201);
    expect(julio.body.datos.completado).toBe(true);

    const final = await ver(id);
    expect(final.estado).toBe('completado');
    expect(final.metodo_pago).toBe('efectivo');
    expect(final.pagado).toBe('110.00');
    expect(final.monto_recibido).toBe('130.00');
    expect(final.cambio).toBe('20.00');
    expect(final.estado_cocina).toBeNull();
    expect(final.mesa.estado).toBe('disponible');
    expect(final.pagos.map((p) => p.persona)).toEqual(['Juanita', 'Felipe', 'Julio']);
    expect(final.pagos[1].items).toHaveLength(2);
    expect(final.pagos[0].usuario.nombre).toBe('Cajero Dividir Test');

    const asientos = await LibroCaja.findAll({ where: { referencia_id: id, tipo: 'ingreso' }, order: [['id', 'ASC']] });
    expect(asientos).toHaveLength(3);
    expect(asientos.map((a) => a.concepto)).toEqual([
      `Venta #${id} · parte 1 (Juanita)`, `Venta #${id} · parte 2 (Felipe)`, `Venta #${id} · parte 3 (Julio)`,
    ]);
    expect(asientos.map((a) => a.monto)).toEqual(['30.00', '55.00', '25.00']);

    // El stock se descuenta una sola vez, al completarse.
    expect(await stockDe(platoA)).toBe(stockA - 2);
    expect(await stockDe(platoB)).toBe(stockB - 2);
  });

  it('partes iguales: 100 entre 3 suma exacto', async () => {
    const id = await nuevoPedido([{ producto: platoC, cantidad: 1 }]);
    for (const [monto, completado] of [[33.33, false], [33.33, false], [33.34, true]]) {
      const r = await parte(id, { modo: 'iguales', monto, metodo_pago: 'efectivo', monto_recibido: monto });
      expect(r.status).toBe(201);
      expect(r.body.datos.completado).toBe(completado);
    }
    const final = await ver(id);
    expect(final.estado).toBe('completado');
    expect(final.pagado).toBe('100.00');
    expect(final.metodo_pago).toBe('efectivo');
  });

  it('no se puede pagar más de lo que falta', async () => {
    const id = await nuevoPedido([{ producto: platoC, cantidad: 1 }]);
    const primera = await parte(id, { modo: 'iguales', monto: 60, metodo_pago: 'efectivo', monto_recibido: 60 });
    expect(primera.status).toBe(201);
    const r = await parte(id, { modo: 'iguales', monto: 41, metodo_pago: 'efectivo', monto_recibido: 50 });
    expect(r.status).toBe(409);
    expect(r.body.mensaje).toBe('Es más de lo que falta');
    const pedido = await ver(id);
    expect(pedido.pagado).toBe('60.00');
    expect(pedido.estado).toBe('pendiente');
  });

  it('no se puede pagar dos veces la misma unidad', async () => {
    const id = await nuevoPedido([{ producto: platoA, cantidad: 1 }, { producto: platoB, cantidad: 1 }]);
    const dA = detalleDe(await ver(id), platoA);
    const primera = await parte(id, { modo: 'platos', items: [{ detalle_pedido_id: dA.id, cantidad: 1 }], metodo_pago: 'efectivo', monto_recibido: 30 });
    expect(primera.status).toBe(201);
    const r = await parte(id, { modo: 'platos', items: [{ detalle_pedido_id: dA.id, cantidad: 1 }], metodo_pago: 'efectivo', monto_recibido: 30 });
    expect(r.status).toBe(409);
    expect(r.body.mensaje).toBe('Ese plato ya está pagado');
    expect(await PedidoPago.count({ where: { pedido_id: id } })).toBe(1);
  });

  it('el efectivo recibido no alcanza', async () => {
    const id = await nuevoPedido([{ producto: platoC, cantidad: 1 }]);
    const r = await parte(id, { modo: 'iguales', monto: 50, metodo_pago: 'efectivo', monto_recibido: 40 });
    expect(r.status).toBe(400);
    expect(r.body.mensaje).toBe('Monto recibido insuficiente');
  });

  it('cada parte va a la caja de quien la cobra', async () => {
    const id = await nuevoPedido([{ producto: platoA, cantidad: 1 }, { producto: platoB, cantidad: 1 }]);
    const ventasAntes = Number((await SesionCaja.findByPk(sesion.id)).total_ventas);

    const r1 = await parte(id, { modo: 'iguales', monto: 30, metodo_pago: 'efectivo', monto_recibido: 30 });
    expect(r1.status).toBe(201);
    const r2 = await parte(id, { modo: 'iguales', monto: 25, metodo_pago: 'efectivo', monto_recibido: 25 }, token2);
    expect(r2.status).toBe(201);
    expect(r2.body.datos.completado).toBe(true);
    expect(r2.body.datos.pago.sesion_caja_id).toBe(sesion2.id);

    const asientos = await LibroCaja.findAll({ where: { referencia_id: id, tipo: 'ingreso' }, order: [['id', 'ASC']] });
    expect(asientos.map((a) => a.sesion_caja_id)).toEqual([sesion.id, sesion2.id]);
    expect(asientos[1].usuario_id).toBe(usuario2.id);
    expect(Number((await SesionCaja.findByPk(sesion.id)).total_ventas)).toBeCloseTo(ventasAntes + 30, 2);
    expect((await SesionCaja.findByPk(sesion2.id)).total_ventas).toBe('25.00');
  });

  it('sin caja abierta no se cobra', async () => {
    // El pedido se abrió en una sesión que ya se cerró y quien cobra no tiene caja abierta.
    const sesionVieja = await SesionCaja.create({ usuario_id: usuario3.id, sucursal_id: sucursal.id, caja_id: caja3.id, monto_apertura: 0 });
    sesionesExtra.push(sesionVieja);
    const id = await nuevoPedido([{ producto: platoC, cantidad: 1 }], { sesionId: sesionVieja.id, tk: token3 });
    await sesionVieja.update({ estado: 'cerrada' });

    const r = await parte(id, { modo: 'iguales', monto: 50, metodo_pago: 'efectivo', monto_recibido: 50 }, token3);
    expect(r.status).toBe(409);
    expect(r.body.mensaje).toBe('Abre tu caja para cobrar');
    expect(await PedidoPago.count({ where: { pedido_id: id } })).toBe(0);
  });

  it('se agregan platos después de un pago y el saldo crece', async () => {
    const id = await nuevoPedido([{ producto: platoA, cantidad: 2 }, { producto: platoB, cantidad: 2 }], { mesa: true });
    const r1 = await parte(id, { modo: 'iguales', monto: 50, metodo_pago: 'efectivo', monto_recibido: 50 });
    expect(r1.status).toBe(201);

    const it = await request(app).post(`/api/v1/ventas/${id}/items`).set('Authorization', `Bearer ${token}`)
      .send({ producto_id: platoB.id, cantidad: 1 });
    expect(it.status).toBe(201);

    const pedido = await ver(id);
    expect(pedido.total).toBe('135.00');
    expect(Number(pedido.total) - Number(pedido.pagado)).toBe(85);

    const r2 = await parte(id, { modo: 'iguales', monto: 85, metodo_pago: 'efectivo', monto_recibido: 100 });
    expect(r2.status).toBe(201);
    expect(r2.body.datos.completado).toBe(true);
    const final = await ver(id);
    expect(final.estado).toBe('completado');
    expect(final.pagado).toBe('135.00');
    expect(final.cambio).toBe('15.00');
  });

  it('valida el modo y el origen del pedido', async () => {
    const id = await nuevoPedido([{ producto: platoC, cantidad: 1 }]);
    const sinModo = await parte(id, { modo: 'otro', monto: 10, metodo_pago: 'efectivo', monto_recibido: 10 });
    expect(sinModo.status).toBe(400);
    const sinItems = await parte(id, { modo: 'platos', items: [], metodo_pago: 'efectivo', monto_recibido: 10 });
    expect(sinItems.status).toBe(400);

    await Pedido.update({ origen: 'autoservicio' }, { where: { id } });
    const autoservicio = await parte(id, { modo: 'iguales', monto: 10, metodo_pago: 'efectivo', monto_recibido: 10 });
    expect(autoservicio.status).toBe(409);
    expect(autoservicio.body.mensaje).toBe('Este pedido se cobra completo');
  });

  it('una parte no acepta descuentos, cupones, puntos ni propina', async () => {
    const id = await nuevoPedido([{ producto: platoC, cantidad: 1 }]);
    const base = { modo: 'iguales', monto: 50, metodo_pago: 'efectivo', monto_recibido: 50 };
    for (const extra of [{ descuento: 5 }, { cupon_codigo: 'PROMO' }, { puntos_canjear: 10 }, { propina: 2 }]) {
      const r = await parte(id, { ...base, ...extra });
      expect(r.status).toBe(400);
      expect(r.body.mensaje).toBe('Con pagos parciales no se aplican descuentos, cupones ni puntos');
    }
    // En cero o vacíos no molestan.
    const ok = await parte(id, { ...base, descuento: 0, cupon_codigo: '', puntos_canjear: 0, propina: 0 });
    expect(ok.status).toBe(201);
    expect(await PedidoPago.count({ where: { pedido_id: id } })).toBe(1);
  });

  // Confirma o cancela a mano el QR propio pendiente del pedido.
  const qr = (id, accion) => request(app).post(`/api/v1/ventas/${id}/pago-qr/${accion}`).set('Authorization', `Bearer ${token}`);

  it('una parte por QR queda pendiente y al confirmarse completa el pedido', async () => {
    const id = await nuevoPedido([{ producto: platoA, cantidad: 1 }, { producto: platoB, cantidad: 1 }], { mesa: true });
    const pedido = await ver(id);
    const dA = detalleDe(pedido, platoA);
    const dB = detalleDe(pedido, platoB);

    const efectivo = await parte(id, { modo: 'platos', persona: 'Ana', items: [{ detalle_pedido_id: dA.id, cantidad: 1 }], metodo_pago: 'efectivo', monto_recibido: 30 });
    expect(efectivo.status).toBe(201);

    const conQr = await parte(id, { modo: 'platos', persona: 'Beto', items: [{ detalle_pedido_id: dB.id, cantidad: 1 }], metodo_pago: 'qr' });
    expect(conQr.status).toBe(201);
    expect(conQr.body.datos.completado).toBe(false);
    expect(conQr.body.datos.pago.estado).toBe('pendiente');
    expect(conQr.body.datos.pago.items).toHaveLength(1);
    expect(conQr.body.datos.pago_qr.proveedor).toBe('propio');
    expect(Number(conQr.body.datos.pago_qr.monto_neto)).toBe(25);

    const pagoQr = await PagoQr.findOne({ where: { pedido_id: id } });
    expect(pagoQr.pedido_pago_id).toBe(conQr.body.datos.pago.id);
    expect(pagoQr.order_id).toBe(`pedido_${id}_1`);

    const enEspera = await ver(id);
    expect(enEspera.estado).toBe('pendiente');
    expect(enEspera.pagado).toBe('30.00');

    const confirmar = await qr(id, 'confirmar');
    expect(confirmar.status).toBe(200);

    const final = await ver(id);
    expect(final.estado).toBe('completado');
    expect(final.metodo_pago).toBe('mixto');
    expect(final.pagado).toBe('55.00');
    expect(final.mesa.estado).toBe('disponible');
    expect((await PedidoPago.findByPk(conQr.body.datos.pago.id)).estado).toBe('completado');
    expect((await PagoQr.findByPk(pagoQr.id)).estado).toBe('completado');

    const asientos = await LibroCaja.findAll({ where: { referencia_id: id, tipo: 'ingreso' }, order: [['id', 'ASC']] });
    expect(asientos).toHaveLength(2);
    expect(asientos.map((a) => a.concepto)).toEqual([`Venta #${id} · parte 1 (Ana)`, `Venta #${id} · parte 2 (Beto)`]);
    expect(asientos.map((a) => a.metodo_pago)).toEqual(['efectivo', 'qr']);
    expect(asientos[1].monto).toBe('25.00');
    expect(asientos[1].sesion_caja_id).toBe(sesion.id);
    expect(asientos[1].usuario_id).toBe(usuario.id);
  });

  it('mientras hay un QR pendiente no se cobra otra parte', async () => {
    const id = await nuevoPedido([{ producto: platoC, cantidad: 1 }]);
    const conQr = await parte(id, { modo: 'iguales', monto: 40, metodo_pago: 'qr' });
    expect(conQr.status).toBe(201);

    const otra = await parte(id, { modo: 'iguales', monto: 30, metodo_pago: 'efectivo', monto_recibido: 30 });
    expect(otra.status).toBe(409);
    expect(otra.body.mensaje).toBe('Hay un QR esperando confirmación');
    expect(await PedidoPago.count({ where: { pedido_id: id } })).toBe(1);
  });

  it('si el QR de una parte se cancela, la parte se anula y el saldo vuelve', async () => {
    const id = await nuevoPedido([{ producto: platoA, cantidad: 1 }, { producto: platoB, cantidad: 1 }]);
    const dA = detalleDe(await ver(id), platoA);

    const conQr = await parte(id, { modo: 'platos', items: [{ detalle_pedido_id: dA.id, cantidad: 1 }], metodo_pago: 'qr' });
    expect(conQr.status).toBe(201);

    const cancelar = await qr(id, 'cancelar');
    expect(cancelar.status).toBe(200);

    expect((await PedidoPago.findByPk(conQr.body.datos.pago.id)).estado).toBe('anulado');
    const pedido = await ver(id);
    expect(pedido.estado).toBe('pendiente');
    expect(pedido.pagado).toBe('0.00');
    expect(await LibroCaja.count({ where: { referencia_id: id, sesion_caja_id: [sesion.id, sesion2.id] } })).toBe(0);

    // El plato vuelve a estar libre.
    const otra = await parte(id, { modo: 'platos', items: [{ detalle_pedido_id: dA.id, cantidad: 1 }], metodo_pago: 'efectivo', monto_recibido: 30 });
    expect(otra.status).toBe(201);
  });

  // El banco ya cobró: confirmar un QR de parte nunca falla por falta de caja.
  describe('confirmar un QR de parte con las cajas cerradas', () => {
    // Usuario3 abre caja, cobra una parte por QR y cierra su caja (que es
    // también la del pedido) antes de que el QR se confirme.
    const parteQrYCerrar = async () => {
      const sesionQr = await SesionCaja.create({ usuario_id: usuario3.id, sucursal_id: sucursal.id, caja_id: caja3.id, monto_apertura: 0 });
      sesionesExtra.push(sesionQr);
      const id = await nuevoPedido([{ producto: platoC, cantidad: 1 }], { sesionId: sesionQr.id, tk: token3 });
      const conQr = await parte(id, { modo: 'iguales', monto: 40, metodo_pago: 'qr' }, token3);
      expect(conQr.status).toBe(201);
      expect(conQr.body.datos.pago.sesion_caja_id).toBe(sesionQr.id);
      await sesionQr.update({ estado: 'cerrada' });
      return { id, sesionQr, pago_id: conQr.body.datos.pago.id };
    };

    // Cierra temporalmente otras cajas de la sucursal y las reabre al final.
    const conCajasCerradas = async (sesiones, fn) => {
      await SesionCaja.update({ estado: 'cerrada' }, { where: { id: sesiones.map((x) => x.id) } });
      try { await fn(); } finally {
        await SesionCaja.update({ estado: 'abierta' }, { where: { id: sesiones.map((x) => x.id) } });
      }
    };

    it('sin ninguna caja abierta se asienta en la caja donde se generó el QR', async () => {
      const { id, sesionQr, pago_id } = await parteQrYCerrar();
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        await conCajasCerradas([sesion, sesion2], async () => {
          const confirmar = await qr(id, 'confirmar');
          expect(confirmar.status).toBe(200);
        });
        expect(warn).toHaveBeenCalled();
      } finally { warn.mockRestore(); }

      const pago = await PedidoPago.findByPk(pago_id);
      expect(pago.estado).toBe('completado');
      expect(pago.sesion_caja_id).toBe(sesionQr.id);
      const asientos = await LibroCaja.findAll({ where: { referencia_id: id, tipo: 'ingreso', sesion_caja_id: sesionQr.id } });
      expect(asientos).toHaveLength(1);
      expect(asientos[0].monto).toBe('40.00');
      expect((await ver(id)).pagado).toBe('40.00');
    });

    it('si hay otra caja abierta en la sucursal se asienta ahí', async () => {
      const { id, pago_id } = await parteQrYCerrar();
      await conCajasCerradas([sesion], async () => {
        const confirmar = await qr(id, 'confirmar');
        expect(confirmar.status).toBe(200);
      });

      const pago = await PedidoPago.findByPk(pago_id);
      expect(pago.estado).toBe('completado');
      expect(pago.sesion_caja_id).toBe(sesion2.id);
      const asientos = await LibroCaja.findAll({ where: { referencia_id: id, tipo: 'ingreso', sesion_caja_id: [sesion.id, sesion2.id, ...sesionesExtra.map((x) => x.id)] } });
      expect(asientos.map((a) => a.sesion_caja_id)).toEqual([sesion2.id]);
    });
  });
});
