const request = require('supertest');
const app = require('../src/app');
const bcrypt = require('bcryptjs');
const {
  Sucursal, Categoria, Producto, Usuario, Rol, Permiso, Caja, SesionCaja, Pedido, DetallePedido,
  Devolucion, DevolucionItem, LibroCaja, ProductoStockSucursal, RegistroInventario, Cliente,
} = require('../src/models');

describe('POST /ventas/:id/anular - pedidos sin cobrar', () => {
  let sucursalId, otraSucursalId, usuarioId, sinPermisoId, cajaId, sesionId, token, tokenSinPermiso, productoId, categoriaId, rolTmpId;

  const nuevoPedido = async (cantidad = 3) => {
    const p = await request(app).post('/api/v1/ventas').set('Authorization', `Bearer ${token}`).send({ tipo: 'llevar', sesion_caja_id: sesionId });
    expect(p.status).toBe(201);
    const it = await request(app).post(`/api/v1/ventas/${p.body.datos.id}/items`).set('Authorization', `Bearer ${token}`)
      .send({ producto_id: productoId, cantidad });
    expect(it.status).toBe(201);
    const det = await DetallePedido.findOne({ where: { pedido_id: p.body.datos.id } });
    return { pedidoId: p.body.datos.id, detalleId: det.id };
  };
  const anular = (id, body, tk = token) => request(app).post(`/api/v1/ventas/${id}/anular`).set('Authorization', `Bearer ${tk}`).send(body);

  beforeAll(async () => {
    const sucursal = await Sucursal.create({ nombre: 'Sucursal Devoluciones Test' });
    sucursalId = sucursal.id;
    otraSucursalId = (await Sucursal.create({ nombre: 'Otra Sucursal Devoluciones Test' })).id;
    const hash = await bcrypt.hash('clave123', 10);

    const rol = await Rol.findOne({ where: { nombre: 'Cajero' } });
    const usuario = await Usuario.create({ rol_id: rol.id, nombre: 'Devoluciones Test', email: 'devoluciones-test@restaurante.com', contrasena: hash });
    usuarioId = usuario.id;
    await usuario.addSucursal(sucursal);
    token = (await request(app).post('/api/v1/auth/login').send({ email: 'devoluciones-test@restaurante.com', contrasena: 'clave123' })).body.datos.token;

    const rolTmp = await Rol.create({ nombre: 'Sin Anular Test', descripcion: 'Rol de prueba sin ventas.anular' });
    rolTmpId = rolTmp.id;
    const permisos = await Permiso.findAll({ where: { modulo: 'ventas' } });
    await rolTmp.setPermisos(permisos.filter((p) => p.accion !== 'anular'));
    const u2 = await Usuario.create({ rol_id: rolTmp.id, nombre: 'Sin Anular Test', email: 'sin-anular-test@restaurante.com', contrasena: hash });
    sinPermisoId = u2.id;
    await u2.addSucursal(sucursal);
    tokenSinPermiso = (await request(app).post('/api/v1/auth/login').send({ email: 'sin-anular-test@restaurante.com', contrasena: 'clave123' })).body.datos.token;

    const caja = await Caja.create({ sucursal_id: sucursalId, nombre: 'Caja Devoluciones Test' });
    cajaId = caja.id;
    sesionId = (await SesionCaja.create({ usuario_id: usuarioId, sucursal_id: sucursalId, caja_id: cajaId, monto_apertura: 0 })).id;
    categoriaId = (await Categoria.create({ nombre: 'Categoria Devoluciones Test' })).id;
    productoId = (await Producto.create({ categoria_id: categoriaId, nombre: 'Producto Devoluciones Test', precio: 10 })).id;
  });

  afterAll(async () => {
    const pedidos = await Pedido.findAll({ where: { sucursal_id: [sucursalId, otraSucursalId] }, attributes: ['id'] });
    const ids = pedidos.map((p) => p.id);
    const devs = await Devolucion.findAll({ where: { pedido_id: ids }, attributes: ['id'] });
    await DevolucionItem.destroy({ where: { devolucion_id: devs.map((d) => d.id) } });
    await Devolucion.destroy({ where: { pedido_id: ids } });
    await DetallePedido.destroy({ where: { pedido_id: ids } });
    await Pedido.destroy({ where: { id: ids } });
    await LibroCaja.destroy({ where: { usuario_id: usuarioId } });
    await SesionCaja.destroy({ where: { id: sesionId } });
    await Caja.destroy({ where: { id: cajaId } });
    await Producto.destroy({ where: { id: productoId } });
    await Categoria.destroy({ where: { id: categoriaId } });
    await Usuario.destroy({ where: { id: [usuarioId, sinPermisoId] } });
    await Rol.destroy({ where: { id: rolTmpId } });
    await Sucursal.destroy({ where: { id: [sucursalId, otraSucursalId] } });
  });

  it('anula 2 de 3: cantidad_anulada, total, sin dinero y sin libro_caja', async () => {
    const { pedidoId, detalleId } = await nuevoPedido(3);
    const antes = await LibroCaja.count({ where: { usuario_id: usuarioId } });
    const res = await anular(pedidoId, { items: [{ detalle_pedido_id: detalleId, cantidad: 2 }], motivo: 'demora' });
    expect(res.status).toBe(201);
    expect(res.body.datos.devolucion.forma).toBe('sin_dinero');
    expect(Number(res.body.datos.devolucion.monto)).toBe(0);
    expect(res.body.datos.impresion).toEqual({ cocina: null });
    expect((await DetallePedido.findByPk(detalleId)).cantidad_anulada).toBe(2);
    expect(Number((await Pedido.findByPk(pedidoId)).total)).toBe(10);
    expect(await LibroCaja.count({ where: { usuario_id: usuarioId } })).toBe(antes);

    const get = await request(app).get(`/api/v1/ventas/${pedidoId}`).set('Authorization', `Bearer ${token}`);
    expect(get.status).toBe(200);
    expect(get.body.datos.devoluciones).toHaveLength(1);
    expect(get.body.datos.devoluciones[0].usuario.id).toBe(usuarioId);
    expect(get.body.datos.devoluciones[0].items).toHaveLength(1);
  });

  it('anular 4 de 3 -> 400 y nada cambia', async () => {
    const { pedidoId, detalleId } = await nuevoPedido(3);
    const res = await anular(pedidoId, { items: [{ detalle_pedido_id: detalleId, cantidad: 4 }], motivo: 'demora' });
    expect(res.status).toBe(400);
    expect((await DetallePedido.findByPk(detalleId)).cantidad_anulada).toBe(0);
    expect(await Devolucion.count({ where: { pedido_id: pedidoId } })).toBe(0);
  });

  it('no permite anular mas que lo vigente en una segunda anulacion', async () => {
    const { pedidoId, detalleId } = await nuevoPedido(3);
    expect((await anular(pedidoId, { items: [{ detalle_pedido_id: detalleId, cantidad: 2 }], motivo: 'demora' })).status).toBe(201);
    expect((await anular(pedidoId, { items: [{ detalle_pedido_id: detalleId, cantidad: 2 }], motivo: 'demora' })).status).toBe(400);
  });

  it('motivo ausente -> 400; otro sin nota -> 400', async () => {
    const { pedidoId, detalleId } = await nuevoPedido(1);
    const items = [{ detalle_pedido_id: detalleId, cantidad: 1 }];
    expect((await anular(pedidoId, { items })).status).toBe(400);
    expect((await anular(pedidoId, { items, motivo: 'otro' })).status).toBe(400);
    expect((await anular(pedidoId, { items, motivo: 'otro', nota: 'Se cayo al piso' })).status).toBe(201);
  });

  it('pedido cancelado -> 409; pendiente_pago -> 409', async () => {
    const a = await nuevoPedido(1);
    await Pedido.update({ estado: 'cancelado' }, { where: { id: a.pedidoId } });
    expect((await anular(a.pedidoId, { items: [{ detalle_pedido_id: a.detalleId, cantidad: 1 }], motivo: 'demora' })).status).toBe(409);
    const b = await nuevoPedido(1);
    await Pedido.update({ estado: 'pendiente_pago' }, { where: { id: b.pedidoId } });
    expect((await anular(b.pedidoId, { items: [{ detalle_pedido_id: b.detalleId, cantidad: 1 }], motivo: 'demora' })).status).toBe(409);
  });

  it('usuario sin ventas.anular -> 403', async () => {
    const { pedidoId, detalleId } = await nuevoPedido(1);
    const res = await anular(pedidoId, { items: [{ detalle_pedido_id: detalleId, cantidad: 1 }], motivo: 'demora' }, tokenSinPermiso);
    expect(res.status).toBe(403);
  });

  it('pedido de otra sucursal -> mismo codigo que GET /ventas/:id', async () => {
    const otro = await Pedido.create({ sucursal_id: otraSucursalId, usuario_id: usuarioId, tipo: 'llevar', estado: 'pendiente', total: 10 });
    const det = await DetallePedido.create({ pedido_id: otro.id, producto_id: productoId, cantidad: 1, precio: 10 });
    const get = await request(app).get(`/api/v1/ventas/${otro.id}`).set('Authorization', `Bearer ${token}`);
    const res = await anular(otro.id, { items: [{ detalle_pedido_id: det.id, cantidad: 1 }], motivo: 'demora' });
    expect(res.status).toBe(get.status);
    expect(res.status).toBe(404);
  });

  it('linea por peso: anulacion parcial -> 400; completa -> 201', async () => {
    const { pedidoId, detalleId } = await nuevoPedido(2);
    await DetallePedido.update({ peso: 1.5 }, { where: { id: detalleId } });
    expect((await anular(pedidoId, { items: [{ detalle_pedido_id: detalleId, cantidad: 1 }], motivo: 'demora' })).status).toBe(400);
    expect((await anular(pedidoId, { items: [{ detalle_pedido_id: detalleId, cantidad: 2 }], motivo: 'demora' })).status).toBe(201);
  });

  it('detalle_pedido_id repetido en la solicitud -> 400', async () => {
    const { pedidoId, detalleId } = await nuevoPedido(3);
    const res = await anular(pedidoId, { items: [{ detalle_pedido_id: detalleId, cantidad: 1 }, { detalle_pedido_id: detalleId, cantidad: 1 }], motivo: 'demora' });
    expect(res.status).toBe(400);
    expect((await DetallePedido.findByPk(detalleId)).cantidad_anulada).toBe(0);
  });

  it('pedido listo se anula como sin cobrar', async () => {
    const { pedidoId, detalleId } = await nuevoPedido(2);
    await Pedido.update({ estado: 'listo' }, { where: { id: pedidoId } });
    const res = await anular(pedidoId, { items: [{ detalle_pedido_id: detalleId, cantidad: 1 }], motivo: 'demora' });
    expect(res.status).toBe(201);
    expect(res.body.datos.devolucion.forma).toBe('sin_dinero');
  });

  it('detalle de otro pedido -> 400', async () => {
    const a = await nuevoPedido(1);
    const b = await nuevoPedido(1);
    const res = await anular(a.pedidoId, { items: [{ detalle_pedido_id: b.detalleId, cantidad: 1 }], motivo: 'demora' });
    expect(res.status).toBe(400);
    expect((await DetallePedido.findByPk(b.detalleId)).cantidad_anulada).toBe(0);
  });
});

describe('POST /ventas/:id/anular - pedidos cobrados', () => {
  let sucursalId, usuarioId, otroUsuarioId, cajaId, otraCajaId, sesionId, otraSesionId, token;
  let categoriaId, contadoId, nullId, clienteId;
  const productosCreados = [];

  const anular = (id, body) => request(app).post(`/api/v1/ventas/${id}/anular`).set('Authorization', `Bearer ${token}`).send(body);
  const venta = async (items, extra = {}) => {
    const r = await request(app).post('/api/v1/ventas/completa').set('Authorization', `Bearer ${token}`)
      .send({ tipo: 'llevar', items, metodo_pago: 'efectivo', sesion_caja_id: sesionId, ...extra });
    expect(r.status).toBe(201);
    const det = await DetallePedido.findAll({ where: { pedido_id: r.body.datos.id }, order: [['id', 'ASC']] });
    return { pedidoId: r.body.datos.id, detalles: det };
  };
  const ventaContado = async (cantidad = 4, extra = {}) => {
    const v = await venta([{ producto_id: contadoId, cantidad }], { monto_recibido: cantidad * 10, ...extra });
    return { pedidoId: v.pedidoId, detalleId: v.detalles[0].id };
  };
  const stockSucursal = async (pid = contadoId) => (await ProductoStockSucursal.findOne({ where: { producto_id: pid, sucursal_id: sucursalId } })).stock;
  const sesionTotal = async () => Number((await SesionCaja.findByPk(sesionId)).total_devoluciones);
  const egresos = () => LibroCaja.count({ where: { usuario_id: usuarioId, tipo: 'egreso' } });

  beforeAll(async () => {
    sucursalId = (await Sucursal.create({ nombre: 'Sucursal Devoluciones Cobrado Test' })).id;
    const hash = await bcrypt.hash('clave123', 10);
    const rol = await Rol.findOne({ where: { nombre: 'Cajero' } });
    const u = await Usuario.create({ rol_id: rol.id, nombre: 'Dev Cobrado Test', email: 'dev-cobrado-test@restaurante.com', contrasena: hash });
    usuarioId = u.id;
    await u.addSucursal(sucursalId);
    const o = await Usuario.create({ rol_id: rol.id, nombre: 'Dev Cobrado Otro Test', email: 'dev-cobrado-otro-test@restaurante.com', contrasena: hash });
    otroUsuarioId = o.id;
    await o.addSucursal(sucursalId);
    token = (await request(app).post('/api/v1/auth/login').send({ email: 'dev-cobrado-test@restaurante.com', contrasena: 'clave123' })).body.datos.token;

    cajaId = (await Caja.create({ sucursal_id: sucursalId, nombre: 'Caja Dev Cobrado Test' })).id;
    otraCajaId = (await Caja.create({ sucursal_id: sucursalId, nombre: 'Caja Dev Cobrado Otra Test' })).id;
    sesionId = (await SesionCaja.create({ usuario_id: usuarioId, sucursal_id: sucursalId, caja_id: cajaId, monto_apertura: 0 })).id;
    otraSesionId = (await SesionCaja.create({ usuario_id: otroUsuarioId, sucursal_id: sucursalId, caja_id: otraCajaId, monto_apertura: 0 })).id;

    categoriaId = (await Categoria.create({ nombre: 'Categoria Dev Cobrado Test' })).id;
    contadoId = (await Producto.create({ categoria_id: categoriaId, nombre: 'Producto Contado Dev Test', precio: 10, stock: 0 })).id;
    await ProductoStockSucursal.create({ producto_id: contadoId, sucursal_id: sucursalId, stock: 1000 });
    nullId = (await Producto.create({ categoria_id: categoriaId, nombre: 'Producto Sin Stock Dev Test', precio: 5 })).id;
    productosCreados.push(contadoId, nullId);
    clienteId = (await Cliente.create({ nombre: 'Cliente Dev Cobrado Test', puntos: 10 })).id;
  });

  afterAll(async () => {
    const pedidos = await Pedido.findAll({ where: { sucursal_id: sucursalId }, attributes: ['id'] });
    const ids = pedidos.map((p) => p.id);
    const devs = await Devolucion.findAll({ where: { pedido_id: ids }, attributes: ['id'] });
    await DevolucionItem.destroy({ where: { devolucion_id: devs.map((d) => d.id) } });
    await Devolucion.destroy({ where: { pedido_id: ids } });
    await LibroCaja.destroy({ where: { usuario_id: [usuarioId, otroUsuarioId] } });
    await DetallePedido.destroy({ where: { pedido_id: ids } });
    await Pedido.destroy({ where: { id: ids } });
    await RegistroInventario.destroy({ where: { producto_id: productosCreados } });
    await ProductoStockSucursal.destroy({ where: { producto_id: productosCreados } });
    await SesionCaja.destroy({ where: { id: [sesionId, otraSesionId] } });
    await Caja.destroy({ where: { id: [cajaId, otraCajaId] } });
    await Producto.destroy({ where: { id: productosCreados } });
    await Categoria.destroy({ where: { id: categoriaId } });
    await Cliente.destroy({ where: { id: clienteId } });
    await Usuario.destroy({ where: { id: [usuarioId, otroUsuarioId] } });
    await Sucursal.destroy({ where: { id: sucursalId } });
  });

  it('efectivo: egreso en libro_caja, total_devoluciones, total_devuelto y estado completado', async () => {
    const { pedidoId, detalleId } = await ventaContado(4);
    const antesEg = await egresos();
    const antesTot = await sesionTotal();
    const res = await anular(pedidoId, { items: [{ detalle_pedido_id: detalleId, cantidad: 2, vuelve_stock: false }], motivo: 'demora', forma: 'efectivo' });
    expect(res.status).toBe(201);
    const dev = res.body.datos.devolucion;
    expect(Number(dev.monto)).toBe(20);
    expect(dev.forma).toBe('efectivo');
    expect(dev.sesion_caja_id).toBe(sesionId);
    expect(await egresos()).toBe(antesEg + 1);
    const fila = await LibroCaja.findOne({ where: { referencia_id: dev.id, tipo: 'egreso' } });
    expect(fila.concepto).toBe(`Devolución venta #${pedidoId}`);
    expect(fila.metodo_pago).toBe('efectivo');
    expect(fila.sesion_caja_id).toBe(sesionId);
    expect(Number(fila.monto)).toBe(20);
    expect(await sesionTotal()).toBe(antesTot + 20);
    const ped = await Pedido.findByPk(pedidoId);
    expect(Number(ped.total_devuelto)).toBe(20);
    expect(ped.estado).toBe('completado');
    expect(Number(ped.total)).toBe(40);
    expect(Number((await SesionCaja.findByPk(sesionId)).total_gastos)).toBe(0);
  });

  it('vuelve_stock true repone; false no; omitido repone; stock NULL lo ignora', async () => {
    const a = await ventaContado(4);
    let antes = await stockSucursal();
    let res = await anular(a.pedidoId, { items: [{ detalle_pedido_id: a.detalleId, cantidad: 2, vuelve_stock: true }], motivo: 'demora', forma: 'transferencia' });
    expect(res.status).toBe(201);
    expect(await stockSucursal()).toBe(antes + 2);
    expect(res.body.datos.devolucion.items[0].vuelve_stock).toBeTruthy();
    const reg = await RegistroInventario.findOne({ where: { producto_id: contadoId, tipo: 'entrada', nota: `Devolución venta #${a.pedidoId}` } });
    expect(reg.cantidad).toBe(2);

    antes = await stockSucursal();
    res = await anular(a.pedidoId, { items: [{ detalle_pedido_id: a.detalleId, cantidad: 1, vuelve_stock: false }], motivo: 'demora', forma: 'transferencia' });
    expect(res.status).toBe(201);
    expect(await stockSucursal()).toBe(antes);
    expect(res.body.datos.devolucion.items[0].vuelve_stock).toBeFalsy();

    antes = await stockSucursal();
    res = await anular(a.pedidoId, { items: [{ detalle_pedido_id: a.detalleId, cantidad: 1 }], motivo: 'demora', forma: 'transferencia' });
    expect(res.status).toBe(201);
    expect(await stockSucursal()).toBe(antes + 1);

    const b = await venta([{ producto_id: nullId, cantidad: 2 }], { monto_recibido: 10 });
    res = await anular(b.pedidoId, { items: [{ detalle_pedido_id: b.detalles[0].id, cantidad: 2, vuelve_stock: true }], motivo: 'demora', forma: 'transferencia' });
    expect(res.status).toBe(201);
    expect(res.body.datos.devolucion.items[0].vuelve_stock).toBeFalsy();
    expect(await RegistroInventario.count({ where: { producto_id: nullId } })).toBe(0);
  });

  it('transferencia: sin libro_caja, estado_transferencia pendiente, total_devoluciones igual', async () => {
    const { pedidoId, detalleId } = await ventaContado(2);
    const antesEg = await egresos();
    const antesTot = await sesionTotal();
    const res = await anular(pedidoId, { items: [{ detalle_pedido_id: detalleId, cantidad: 1 }], motivo: 'demora', forma: 'transferencia' });
    expect(res.status).toBe(201);
    expect(res.body.datos.devolucion.estado_transferencia).toBe('pendiente');
    expect(res.body.datos.devolucion.sesion_caja_id).toBeNull();
    expect(Number(res.body.datos.devolucion.monto)).toBe(10);
    expect(await egresos()).toBe(antesEg);
    expect(await sesionTotal()).toBe(antesTot);
    expect(Number((await Pedido.findByPk(pedidoId)).total_devuelto)).toBe(10);
  });

  it('forma app: 400 si no es app_externa; sin movimiento de dinero si lo es', async () => {
    const { pedidoId, detalleId } = await ventaContado(2);
    const items = [{ detalle_pedido_id: detalleId, cantidad: 1 }];
    expect((await anular(pedidoId, { items, motivo: 'demora', forma: 'app' })).status).toBe(400);
    expect(await Devolucion.count({ where: { pedido_id: pedidoId } })).toBe(0);
    await Pedido.update({ metodo_pago: 'app_externa' }, { where: { id: pedidoId } });
    const antesEg = await egresos();
    const antesTot = await sesionTotal();
    const res = await anular(pedidoId, { items, motivo: 'demora', forma: 'app' });
    expect(res.status).toBe(201);
    expect(res.body.datos.devolucion.estado_transferencia).toBeNull();
    expect(await egresos()).toBe(antesEg);
    expect(await sesionTotal()).toBe(antesTot);
  });

  it('forma ausente o sin_dinero en pedido cobrado -> 400', async () => {
    const { pedidoId, detalleId } = await ventaContado(2);
    const items = [{ detalle_pedido_id: detalleId, cantidad: 1 }];
    expect((await anular(pedidoId, { items, motivo: 'demora' })).status).toBe(400);
    expect((await anular(pedidoId, { items, motivo: 'demora', forma: 'sin_dinero' })).status).toBe(400);
    expect((await DetallePedido.findByPk(detalleId)).cantidad_anulada).toBe(0);
  });

  it('puntos: cliente con 10 puntos, devolucion del 25% -> pierde 2', async () => {
    const { pedidoId, detalleId } = await ventaContado(4);
    await Pedido.update({ cliente_id: clienteId, puntos_ganados: 10 }, { where: { id: pedidoId } });
    await Cliente.update({ puntos: 10 }, { where: { id: clienteId } });
    const res = await anular(pedidoId, { items: [{ detalle_pedido_id: detalleId, cantidad: 1 }], motivo: 'demora', forma: 'transferencia' });
    expect(res.status).toBe(201);
    expect((await Cliente.findByPk(clienteId)).puntos).toBe(8);
  });

  it('puntos nunca bajan de 0', async () => {
    const { pedidoId, detalleId } = await ventaContado(2);
    await Pedido.update({ cliente_id: clienteId, puntos_ganados: 10 }, { where: { id: pedidoId } });
    await Cliente.update({ puntos: 1 }, { where: { id: clienteId } });
    const res = await anular(pedidoId, { items: [{ detalle_pedido_id: detalleId, cantidad: 2 }], motivo: 'demora', forma: 'transferencia' });
    expect(res.status).toBe(201);
    expect((await Cliente.findByPk(clienteId)).puntos).toBe(0);
  });

  it('concurrencia: dos anulaciones paralelas por la cantidad completa -> un 201, un 400, un egreso', async () => {
    const { pedidoId, detalleId } = await ventaContado(3);
    const antesEg = await egresos();
    const body = { items: [{ detalle_pedido_id: detalleId, cantidad: 3 }], motivo: 'demora', forma: 'efectivo' };
    const [r1, r2] = await Promise.all([anular(pedidoId, body), anular(pedidoId, body)]);
    expect([r1.status, r2.status].sort()).toEqual([201, 400]);
    expect(await egresos()).toBe(antesEg + 1);
    expect(await Devolucion.count({ where: { pedido_id: pedidoId } })).toBe(1);
    expect((await DetallePedido.findByPk(detalleId)).cantidad_anulada).toBe(3);
    expect(Number((await Pedido.findByPk(pedidoId)).total_devuelto)).toBe(30);
  });

  it('descuento igual al total: monto 0, sin egreso y sin total_devoluciones', async () => {
    const v = await venta([{ producto_id: contadoId, cantidad: 1 }], { descuento: 10, metodo_pago: 'app_externa' });
    const antesEg = await egresos();
    const antesTot = await sesionTotal();
    const antesStock = await stockSucursal();
    const res = await anular(v.pedidoId, { items: [{ detalle_pedido_id: v.detalles[0].id, cantidad: 1 }], motivo: 'demora', forma: 'efectivo' });
    expect(res.status).toBe(201);
    expect(Number(res.body.datos.devolucion.monto)).toBe(0);
    expect(await egresos()).toBe(antesEg);
    expect(await sesionTotal()).toBe(antesTot);
    expect((await DetallePedido.findByPk(v.detalles[0].id)).cantidad_anulada).toBe(1);
    expect(await stockSucursal()).toBe(antesStock + 1);
  });

  it('efectivo sin caja propia abierta (cerrada u otra persona) -> 409 sin cambios; transferencia -> 201', async () => {
    const { pedidoId, detalleId } = await ventaContado(3);
    const items = [{ detalle_pedido_id: detalleId, cantidad: 1 }];
    await SesionCaja.update({ estado: 'cerrada' }, { where: { id: sesionId } });
    try {
      const antesEg = await LibroCaja.count();
      const antesStock = await stockSucursal();
      const res = await anular(pedidoId, { items, motivo: 'demora', forma: 'efectivo' });
      expect(res.status).toBe(409);
      expect(JSON.stringify(res.body)).toContain('Necesitas tu caja abierta para devolver efectivo');
      expect(await LibroCaja.count()).toBe(antesEg);
      expect(await Devolucion.count({ where: { pedido_id: pedidoId } })).toBe(0);
      expect((await DetallePedido.findByPk(detalleId)).cantidad_anulada).toBe(0);
      expect(Number((await Pedido.findByPk(pedidoId)).total_devuelto)).toBe(0);
      expect(await stockSucursal()).toBe(antesStock);
      expect(Number((await SesionCaja.findByPk(otraSesionId)).total_devoluciones)).toBe(0);
      const ok = await anular(pedidoId, { items, motivo: 'demora', forma: 'transferencia' });
      expect(ok.status).toBe(201);
    } finally {
      await SesionCaja.update({ estado: 'abierta' }, { where: { id: sesionId } });
    }
  });

  it('producto desactivado repone stock; producto borrado -> 201 sin reposicion', async () => {
    const p1 = (await Producto.create({ categoria_id: categoriaId, nombre: 'Producto Desactivado Dev Test', precio: 10, stock: 0 })).id;
    const p2 = (await Producto.create({ categoria_id: categoriaId, nombre: 'Producto Borrado Dev Test', precio: 10, stock: 0 })).id;
    productosCreados.push(p1, p2);
    await ProductoStockSucursal.create({ producto_id: p1, sucursal_id: sucursalId, stock: 50 });
    await ProductoStockSucursal.create({ producto_id: p2, sucursal_id: sucursalId, stock: 50 });
    const v = await venta([{ producto_id: p1, cantidad: 2 }, { producto_id: p2, cantidad: 2 }], { monto_recibido: 40 });
    const stock1 = await stockSucursal(p1);
    await Producto.update({ activo: false }, { where: { id: p1 } });
    await DetallePedido.update({ producto_id: null }, { where: { id: v.detalles[1].id } }); // simula FK SET NULL
    await Producto.destroy({ where: { id: p2 } });
    const res = await anular(v.pedidoId, {
      items: [{ detalle_pedido_id: v.detalles[0].id, cantidad: 2 }, { detalle_pedido_id: v.detalles[1].id, cantidad: 2 }],
      motivo: 'demora', forma: 'transferencia',
    });
    expect(res.status).toBe(201);
    expect(await stockSucursal(p1)).toBe(stock1 + 2);
    const items = res.body.datos.devolucion.items;
    expect(items.find((i) => i.detalle_pedido_id === v.detalles[0].id).vuelve_stock).toBeTruthy();
    expect(items.find((i) => i.detalle_pedido_id === v.detalles[1].id).vuelve_stock).toBeFalsy();
  });
});
