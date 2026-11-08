const request = require('supertest');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const { Op } = require('sequelize');
const { Sucursal, Area, Mesa, MesaSesion, Rol, Usuario, Pedido, DetallePedido, PagoQr, Categoria, Producto, ProductoStockSucursal, Caja, SesionCaja, Cupon, Cliente, Configuracion, Combo, ComboProducto, Promocion } = require('../src/models');

describe('Autoservicio API', () => {
  it('GET .../mesa/:codigo_qr con código inexistente → 404', async () => {
    const res = await request(app).get('/api/v1/autoservicio/mesa/no-existe-123');
    expect(res.status).toBe(404);
  });

  describe('con una mesa real', () => {
    let sucursal, area, mesa;

    beforeAll(async () => {
      sucursal = await Sucursal.create({ nombre: 'Sucursal Autoservicio Test' });
      area = await Area.create({ nombre: 'Area Autoservicio Test', sucursal_id: sucursal.id });
      mesa = await Mesa.create({ area_id: area.id, nombre: 'Mesa Autoservicio Test', codigo_qr: 'test-qr-001' });
    });

    afterAll(async () => {
      await MesaSesion.destroy({ where: { mesa_id: mesa.id } });
      await Mesa.destroy({ where: { id: mesa.id } });
      await Area.destroy({ where: { id: area.id } });
      await Sucursal.destroy({ where: { id: sucursal.id } });
    });

    it('mesa sin sesión activa → 409 al pedir el menú', async () => {
      const res = await request(app).get(`/api/v1/autoservicio/mesa/${mesa.codigo_qr}`);
      expect(res.status).toBe(409);
    });

    it('mesa con sesión activa → devuelve el menú', async () => {
      await MesaSesion.create({ mesa_id: mesa.id, sucursal_id: sucursal.id, abierta_por: 'staff' });
      const res = await request(app).get(`/api/v1/autoservicio/mesa/${mesa.codigo_qr}`);
      expect(res.status).toBe(200);
      expect(res.body.datos.mesa.id).toBe(mesa.id);
      expect(Array.isArray(res.body.datos.productos)).toBe(true);
      expect(Array.isArray(res.body.datos.combos)).toBe(true);
      expect(Array.isArray(res.body.datos.promociones)).toBe(true);
    });

    it('el menú incluye combos activos y promociones vigentes, con la categoría de cada producto', async () => {
      const timestamp = Date.now();
      const categoria = await Categoria.create({ nombre: `Categoria Menu Test ${timestamp}` });
      const producto = await Producto.create({ categoria_id: categoria.id, nombre: `Producto Menu Test ${timestamp}`, precio: 15, es_vendible: 1 });
      const combo = await Combo.create({ nombre: `Combo Menu Test ${timestamp}`, precio: 20, activo: 1 });
      await ComboProducto.create({ combo_id: combo.id, producto_id: producto.id, cantidad: 1 });
      const promo = await Promocion.create({ nombre: `Promo Menu Test ${timestamp}`, tipo: 'porcentaje', valor: 10, activo: 1 });
      await promo.setProductos([producto.id]);

      const res = await request(app).get(`/api/v1/autoservicio/mesa/${mesa.codigo_qr}`);

      expect(res.status).toBe(200);
      const productoEnMenu = res.body.datos.productos.find((p) => p.id === producto.id);
      expect(productoEnMenu.categoria.id).toBe(categoria.id);
      expect(res.body.datos.combos.some((c) => c.id === combo.id)).toBe(true);
      expect(res.body.datos.promociones.some((p) => p.producto_id === producto.id)).toBe(true);

      await promo.destroy();
      await combo.destroy();
      await producto.destroy();
      await categoria.destroy();
    });

    it('con el QR propio como proveedor, el menú queda solo para ver y el pedido → 409', async () => {
      const previa = await Configuracion.findOne({ where: { clave: 'qr_proveedor' } });
      await Configuracion.upsert({ clave: 'qr_proveedor', valor: 'propio' });
      try {
        const menuRes = await request(app).get(`/api/v1/autoservicio/mesa/${mesa.codigo_qr}`);
        expect(menuRes.status).toBe(200);
        expect(menuRes.body.datos.puede_pedir).toBe(false);

        const res = await request(app)
          .post(`/api/v1/autoservicio/mesa/${mesa.codigo_qr}/pedido`)
          .send({ items: [{ producto_id: 1, cantidad: 1 }] });
        expect(res.status).toBe(409);
        expect(res.body.mensaje).toMatch(/mozo/);
      } finally {
        if (previa) await Configuracion.upsert({ clave: 'qr_proveedor', valor: previa.valor });
        else await Configuracion.destroy({ where: { clave: 'qr_proveedor' } });
      }
      const otraVez = await request(app).get(`/api/v1/autoservicio/mesa/${mesa.codigo_qr}`);
      expect(otraVez.body.datos.puede_pedir).toBe(true);
    });

    it('con los pedidos desde la mesa apagados, el menú queda solo para ver y el pedido → 409', async () => {
      await Configuracion.upsert({ clave: 'autoservicio_pedidos', valor: 'false' });
      try {
        const menuRes = await request(app).get(`/api/v1/autoservicio/mesa/${mesa.codigo_qr}`);
        expect(menuRes.status).toBe(200);
        expect(menuRes.body.datos.puede_pedir).toBe(false);
        const res = await request(app)
          .post(`/api/v1/autoservicio/mesa/${mesa.codigo_qr}/pedido`)
          .send({ items: [{ producto_id: 1, cantidad: 1 }] });
        expect(res.status).toBe(409);
      } finally {
        await Configuracion.destroy({ where: { clave: 'autoservicio_pedidos' } });
      }
      const otraVez = await request(app).get(`/api/v1/autoservicio/mesa/${mesa.codigo_qr}`);
      expect(otraVez.body.datos.puede_pedir).toBe(true);
    });

    it('crear pedido sin caja abierta en la sucursal → 409', async () => {
      const res = await request(app)
        .post(`/api/v1/autoservicio/mesa/${mesa.codigo_qr}/pedido`)
        .send({ items: [{ producto_id: 1, cantidad: 1 }] });
      expect(res.status).toBe(409);
    });

    it('crear pedido sin items → 400', async () => {
      const res = await request(app)
        .post(`/api/v1/autoservicio/mesa/${mesa.codigo_qr}/pedido`)
        .send({ items: [] });
      expect(res.status).toBe(400);
    });

    it('crear pedido con cantidad negativa → 400 (no llega a ventasService)', async () => {
      const res = await request(app)
        .post(`/api/v1/autoservicio/mesa/${mesa.codigo_qr}/pedido`)
        .send({ items: [{ producto_id: 1, cantidad: -30 }] });
      expect(res.status).toBe(400);
      expect(res.body.mensaje).toMatch(/Cantidad inválida/);
    });

    it('crear pedido con cantidad no entera → 400', async () => {
      const res = await request(app)
        .post(`/api/v1/autoservicio/mesa/${mesa.codigo_qr}/pedido`)
        .send({ items: [{ producto_id: 1, cantidad: 1.5 }] });
      expect(res.status).toBe(400);
    });

    it('crear pedido sin producto_id ni combo_id → 400', async () => {
      const res = await request(app)
        .post(`/api/v1/autoservicio/mesa/${mesa.codigo_qr}/pedido`)
        .send({ items: [{ cantidad: 1 }] });
      expect(res.status).toBe(400);
    });

    it('crear pedido con producto_id y combo_id a la vez → 400', async () => {
      const res = await request(app)
        .post(`/api/v1/autoservicio/mesa/${mesa.codigo_qr}/pedido`)
        .send({ items: [{ producto_id: 1, combo_id: 2, cantidad: 1 }] });
      expect(res.status).toBe(400);
    });

    it('crear pedido con producto_id no positivo → 400', async () => {
      const res = await request(app)
        .post(`/api/v1/autoservicio/mesa/${mesa.codigo_qr}/pedido`)
        .send({ items: [{ producto_id: 0, cantidad: 1 }] });
      expect(res.status).toBe(400);
    });

    it('crear pedido con más de 50 ítems → 400', async () => {
      const items = Array.from({ length: 51 }, () => ({ producto_id: 1, cantidad: 1 }));
      const res = await request(app)
        .post(`/api/v1/autoservicio/mesa/${mesa.codigo_qr}/pedido`)
        .send({ items });
      expect(res.status).toBe(400);
    });
  });

  describe('tope de pagos QR pendientes por sesión de mesa', () => {
    let sucursal, area, mesa, sesion, usuario, pedidos = [];

    beforeAll(async () => {
      sucursal = await Sucursal.create({ nombre: 'Sucursal Autoservicio Tope Test' });
      area = await Area.create({ nombre: 'Area Autoservicio Tope Test', sucursal_id: sucursal.id });
      mesa = await Mesa.create({ area_id: area.id, nombre: 'Mesa Tope Test', codigo_qr: 'test-qr-tope' });
      sesion = await MesaSesion.create({ mesa_id: mesa.id, sucursal_id: sucursal.id, abierta_por: 'staff' });

      const rol = await Rol.findOne({ where: { nombre: 'Cajero' } });
      const hash = await bcrypt.hash('clave123', 10);
      usuario = await Usuario.create({ rol_id: rol.id, nombre: 'Autoservicio Tope Test', email: 'autoservicio-tope-test@restaurante.com', contrasena: hash });

      // 3 pedidos con pago QR en curso creados directamente en la BD — no hace
      // falta el flujo completo de CodePay, el tope sólo cuenta filas.
      for (let i = 0; i < 3; i++) {
        pedidos.push(await Pedido.create({
          sucursal_id: sucursal.id, mesa_id: mesa.id, mesa_sesion_id: sesion.id,
          usuario_id: usuario.id, tipo: 'mesa', origen: 'autoservicio',
          estado: 'pendiente_pago', total: 10,
        }));
      }
    });

    afterAll(async () => {
      await Pedido.destroy({ where: { mesa_id: mesa.id } });
      await Usuario.destroy({ where: { id: usuario.id } });
      await MesaSesion.destroy({ where: { mesa_id: mesa.id } });
      await Mesa.destroy({ where: { id: mesa.id } });
      await Area.destroy({ where: { id: area.id } });
      await Sucursal.destroy({ where: { id: sucursal.id } });
    });

    it('un 4º pedido con 3 pagos pendientes en la misma sesión → 429', async () => {
      const res = await request(app)
        .post(`/api/v1/autoservicio/mesa/${mesa.codigo_qr}/pedido`)
        .send({ items: [{ producto_id: 1, cantidad: 1 }] });
      expect(res.status).toBe(429);
    });
  });

  describe('aislamiento entre mesas al consultar estado de pedido', () => {
    // Regresión: consultarEstadoPedido debía verificar que el pedido_id
    // pertenece a la sesión de ESTA mesa antes de llamar a
    // ventasService.consultarEstadoPagoQr — esa función no solo lee, puede
    // finalizar o revertir el pago (efectos reales: stock, libro caja,
    // sockets, CodePay) para el pedido_id que se le pase, sin importar si
    // después el 404 se devuelve igual. Antes del fix, alguien con el QR de
    // su propia mesa podía probar pedido_id de mesas/sucursales ajenas y
    // disparar esos efectos secundarios antes de recibir el 404.
    let sucursal, area, mesaPropia, mesaAjena, sesionAjena, usuario, pedidoAjeno;

    beforeAll(async () => {
      sucursal = await Sucursal.create({ nombre: 'Sucursal Autoservicio Aislamiento Test' });
      area = await Area.create({ nombre: 'Area Autoservicio Aislamiento Test', sucursal_id: sucursal.id });
      mesaPropia = await Mesa.create({ area_id: area.id, nombre: 'Mesa Propia Test', codigo_qr: 'test-qr-propia' });
      mesaAjena = await Mesa.create({ area_id: area.id, nombre: 'Mesa Ajena Test', codigo_qr: 'test-qr-ajena' });

      await MesaSesion.create({ mesa_id: mesaPropia.id, sucursal_id: sucursal.id, abierta_por: 'staff' });
      sesionAjena = await MesaSesion.create({ mesa_id: mesaAjena.id, sucursal_id: sucursal.id, abierta_por: 'staff' });

      const rol = await Rol.findOne({ where: { nombre: 'Cajero' } });
      const hash = await bcrypt.hash('clave123', 10);
      usuario = await Usuario.create({ rol_id: rol.id, nombre: 'Autoservicio Aislamiento Test', email: 'autoservicio-aislamiento-test@restaurante.com', contrasena: hash });

      pedidoAjeno = await Pedido.create({
        sucursal_id: sucursal.id,
        mesa_id: mesaAjena.id,
        mesa_sesion_id: sesionAjena.id,
        usuario_id: usuario.id,
        tipo: 'mesa',
        origen: 'autoservicio',
        estado: 'pendiente_pago',
        total: 10,
      });
    });

    afterAll(async () => {
      await Pedido.destroy({ where: { id: pedidoAjeno.id } });
      await Usuario.destroy({ where: { id: usuario.id } });
      await MesaSesion.destroy({ where: { mesa_id: [mesaPropia.id, mesaAjena.id] } });
      await Mesa.destroy({ where: { id: [mesaPropia.id, mesaAjena.id] } });
      await Area.destroy({ where: { id: area.id } });
      await Sucursal.destroy({ where: { id: sucursal.id } });
    });

    it('consultar el estado de un pedido de OTRA mesa con el código QR propio → 404, sin tocar el pedido ajeno', async () => {
      const res = await request(app)
        .get(`/api/v1/autoservicio/mesa/${mesaPropia.codigo_qr}/pedido/${pedidoAjeno.id}/estado`);
      expect(res.status).toBe(404);

      // El pedido ajeno no debe haber sido tocado — si consultarEstadoPagoQr
      // se hubiera llamado antes del chequeo de pertenencia, podría haber
      // intentado finalizarlo/revertirlo contra CodePay.
      const sinTocar = await Pedido.findByPk(pedidoAjeno.id);
      expect(sinTocar.estado).toBe('pendiente_pago');
    });
  });

  describe('cupón en el pedido de autoservicio', () => {
    // El código viaja tal cual a ventasService.crearCompleta, que ya sabe
    // validar/aplicar cupones (misma lógica que usa el cajero) — acá solo se
    // prueba que autoservicio lo deja pasar y que un código inválido corta
    // ANTES de llegar a CodePay (mismo límite de las pruebas de arriba: no
    // hay mock de CodePay en esta suite, así que el camino feliz de
    // "cupón válido + pago QR real" queda fuera de esta prueba).
    let sucursal, area, mesa, usuario, caja;

    beforeAll(async () => {
      const timestamp = Date.now();
      sucursal = await Sucursal.create({ nombre: `Sucursal Autoservicio Cupon Test ${timestamp}` });
      area = await Area.create({ nombre: `Area Autoservicio Cupon Test ${timestamp}`, sucursal_id: sucursal.id });
      mesa = await Mesa.create({ area_id: area.id, nombre: 'Mesa Cupon Test', codigo_qr: `test-qr-cupon-${timestamp}` });
      await MesaSesion.create({ mesa_id: mesa.id, sucursal_id: sucursal.id, abierta_por: 'staff' });

      const categoria = await Categoria.create({ nombre: `Categoria Autoservicio Cupon Test ${timestamp}` });
      const producto = await Producto.create({ categoria_id: categoria.id, nombre: `Producto Autoservicio Cupon Test ${timestamp}`, precio: 25, stock: 0 });
      await ProductoStockSucursal.create({ producto_id: producto.id, sucursal_id: sucursal.id, stock: 10 });

      const rol = await Rol.findOne({ where: { nombre: 'Cajero' } });
      const hash = await bcrypt.hash('clave123', 10);
      usuario = await Usuario.create({ rol_id: rol.id, nombre: `Autoservicio Cupon Test ${timestamp}`, email: `autoservicio-cupon-test-${timestamp}@restaurante.com`, contrasena: hash });

      caja = await Caja.create({ sucursal_id: sucursal.id, nombre: 'Caja Autoservicio Cupon Test' });
      await SesionCaja.create({ usuario_id: usuario.id, sucursal_id: sucursal.id, caja_id: caja.id, monto_apertura: 0 });

      mesa.productoId = producto.id;
      mesa.cupon = await Cupon.create({ codigo: `CUPONTEST${timestamp}`, tipo: 'fijo', valor: 5, usos_maximos: 10 });
    });

    afterAll(async () => {
      await Cupon.destroy({ where: { id: mesa.cupon.id } });
      // El pedido "sin cupon_codigo" sigue de largo hasta crearCompleta y
      // deja Pedido/DetallePedido/PagoQr reales — hay que limpiarlos antes
      // de borrar Usuario/Caja/Sucursal o la FK lo impide.
      const pedidosDeLaMesa = await Pedido.findAll({ where: { mesa_id: mesa.id }, attributes: ['id'] });
      const pedidoIds = pedidosDeLaMesa.map((p) => p.id);
      await PagoQr.destroy({ where: { pedido_id: { [Op.in]: pedidoIds } } });
      await DetallePedido.destroy({ where: { pedido_id: { [Op.in]: pedidoIds } } });
      await Pedido.destroy({ where: { mesa_id: mesa.id } });
      await SesionCaja.destroy({ where: { caja_id: caja.id } });
      await Caja.destroy({ where: { id: caja.id } });
      await Usuario.destroy({ where: { id: usuario.id } });
      await MesaSesion.destroy({ where: { mesa_id: mesa.id } });
      await Mesa.destroy({ where: { id: mesa.id } });
      await Area.destroy({ where: { id: area.id } });
      await Sucursal.destroy({ where: { id: sucursal.id } });
    });

    it('cupón inexistente → 400 con el mensaje de cupones.service, sin llegar a CodePay', async () => {
      const res = await request(app)
        .post(`/api/v1/autoservicio/mesa/${mesa.codigo_qr}/pedido`)
        .send({ items: [{ producto_id: mesa.productoId, cantidad: 1 }], cupon_codigo: 'NOEXISTE123' });

      expect(res.status).toBe(400);
      expect(res.body.mensaje).toMatch(/cupón/i);
    });

    it('sin cupon_codigo, el pedido sigue su curso normal (no lo exige)', async () => {
      const res = await request(app)
        .post(`/api/v1/autoservicio/mesa/${mesa.codigo_qr}/pedido`)
        .send({ items: [{ producto_id: mesa.productoId, cantidad: 1 }] });

      // Sin caja abierta específica de ESTA sucursal ya se cubre en otra
      // prueba — acá lo que importa es que la ausencia de cupon_codigo no
      // sea, por sí sola, motivo de rechazo (no debe dar 400 de validación).
      expect(res.status).not.toBe(400);
    });
  });

  describe('combo en el pedido de autoservicio', () => {
    // Igual que con los cupones: el item con combo_id viaja tal cual a
    // ventasService.crearCompleta, que ya sabe resolver combos (misma lógica
    // que usa el cajero) — acá solo se prueba que autoservicio lo deja pasar
    // y que el detalle del pedido queda con combo_id (no producto_id).
    let sucursal, area, mesa, usuario, caja, combo;

    beforeAll(async () => {
      const timestamp = Date.now();
      sucursal = await Sucursal.create({ nombre: `Sucursal Autoservicio Combo Test ${timestamp}` });
      area = await Area.create({ nombre: `Area Autoservicio Combo Test ${timestamp}`, sucursal_id: sucursal.id });
      mesa = await Mesa.create({ area_id: area.id, nombre: 'Mesa Combo Test', codigo_qr: `test-qr-combo-${timestamp}` });
      await MesaSesion.create({ mesa_id: mesa.id, sucursal_id: sucursal.id, abierta_por: 'staff' });

      const categoria = await Categoria.create({ nombre: `Categoria Autoservicio Combo Test ${timestamp}` });
      const producto = await Producto.create({ categoria_id: categoria.id, nombre: `Producto Autoservicio Combo Test ${timestamp}`, precio: 25, stock: 0 });
      await ProductoStockSucursal.create({ producto_id: producto.id, sucursal_id: sucursal.id, stock: 10 });
      combo = await Combo.create({ nombre: `Combo Autoservicio Test ${timestamp}`, precio: 40, activo: 1 });
      await ComboProducto.create({ combo_id: combo.id, producto_id: producto.id, cantidad: 1 });

      const rol = await Rol.findOne({ where: { nombre: 'Cajero' } });
      const hash = await bcrypt.hash('clave123', 10);
      usuario = await Usuario.create({ rol_id: rol.id, nombre: `Autoservicio Combo Test ${timestamp}`, email: `autoservicio-combo-test-${timestamp}@restaurante.com`, contrasena: hash });

      caja = await Caja.create({ sucursal_id: sucursal.id, nombre: 'Caja Autoservicio Combo Test' });
      await SesionCaja.create({ usuario_id: usuario.id, sucursal_id: sucursal.id, caja_id: caja.id, monto_apertura: 0 });
    });

    afterAll(async () => {
      const pedidosDeLaMesa = await Pedido.findAll({ where: { mesa_id: mesa.id }, attributes: ['id'] });
      const pedidoIds = pedidosDeLaMesa.map((p) => p.id);
      await PagoQr.destroy({ where: { pedido_id: { [Op.in]: pedidoIds } } });
      await DetallePedido.destroy({ where: { pedido_id: { [Op.in]: pedidoIds } } });
      await Pedido.destroy({ where: { mesa_id: mesa.id } });
      await Combo.destroy({ where: { id: combo.id } });
      await SesionCaja.destroy({ where: { caja_id: caja.id } });
      await Caja.destroy({ where: { id: caja.id } });
      await Usuario.destroy({ where: { id: usuario.id } });
      await MesaSesion.destroy({ where: { mesa_id: mesa.id } });
      await Mesa.destroy({ where: { id: mesa.id } });
      await Area.destroy({ where: { id: area.id } });
      await Sucursal.destroy({ where: { id: sucursal.id } });
    });

    it('un pedido con combo_id no lo rechaza por validación, y el detalle queda con combo_id (no producto_id)', async () => {
      const res = await request(app)
        .post(`/api/v1/autoservicio/mesa/${mesa.codigo_qr}/pedido`)
        .send({ items: [{ combo_id: combo.id, cantidad: 1 }] });

      // Sin mock de CodePay en esta suite, el camino feliz completo (QR real
      // generado) queda fuera de esta prueba — lo que importa es que no lo
      // corte la validación de items/combo en sí.
      expect(res.status).not.toBe(400);

      const detalle = await DetallePedido.findOne({ where: { combo_id: combo.id } });
      expect(detalle).not.toBeNull();
      expect(detalle.producto_id).toBeNull();
      expect(parseFloat(detalle.precio)).toBe(40);
    });
  });

  describe('POST .../cupon/validar — previsualización de cupón antes de pagar', () => {
    let sucursal, area, mesa, cupon;

    beforeAll(async () => {
      const timestamp = Date.now();
      sucursal = await Sucursal.create({ nombre: `Sucursal Autoservicio ValidarCupon Test ${timestamp}` });
      area = await Area.create({ nombre: `Area Autoservicio ValidarCupon Test ${timestamp}`, sucursal_id: sucursal.id });
      mesa = await Mesa.create({ area_id: area.id, nombre: 'Mesa ValidarCupon Test', codigo_qr: `vc-${timestamp}` });
      await MesaSesion.create({ mesa_id: mesa.id, sucursal_id: sucursal.id, abierta_por: 'staff' });

      const categoria = await Categoria.create({ nombre: `Categoria Autoservicio ValidarCupon Test ${timestamp}` });
      const producto = await Producto.create({ categoria_id: categoria.id, nombre: `Producto Autoservicio ValidarCupon Test ${timestamp}`, precio: 40, stock: 0 });
      mesa.productoId = producto.id;

      cupon = await Cupon.create({ codigo: `VALCUPON${timestamp}`, tipo: 'fijo', valor: 5, usos_maximos: 10 });
    });

    afterAll(async () => {
      await Cupon.destroy({ where: { id: cupon.id } });
      await MesaSesion.destroy({ where: { mesa_id: mesa.id } });
      await Mesa.destroy({ where: { id: mesa.id } });
      await Area.destroy({ where: { id: area.id } });
      await Sucursal.destroy({ where: { id: sucursal.id } });
    });

    it('cupón válido → 200 con el descuento calculado con precios del servidor (ignora el precio que mande el cliente)', async () => {
      const res = await request(app)
        .post(`/api/v1/autoservicio/mesa/${mesa.codigo_qr}/cupon/validar`)
        .send({ codigo: cupon.codigo, items: [{ producto_id: mesa.productoId, cantidad: 1, precio: 999 }] });

      expect(res.status).toBe(200);
      expect(res.body.datos.codigo).toBe(cupon.codigo);
      expect(res.body.datos.descuento).toBe(5);
    });

    it('cupón inválido → 400 con el mensaje de cupones.service', async () => {
      const res = await request(app)
        .post(`/api/v1/autoservicio/mesa/${mesa.codigo_qr}/cupon/validar`)
        .send({ codigo: 'NOEXISTE123', items: [{ producto_id: mesa.productoId, cantidad: 1 }] });

      expect(res.status).toBe(400);
      expect(res.body.mensaje).toMatch(/cupón/i);
    });

    it('sin codigo en el body → 400 de validación, sin tocar el service', async () => {
      const res = await request(app)
        .post(`/api/v1/autoservicio/mesa/${mesa.codigo_qr}/cupon/validar`)
        .send({ items: [{ producto_id: mesa.productoId, cantidad: 1 }] });

      expect(res.status).toBe(400);
      expect(res.body.mensaje).toMatch(/codigo/i);
    });

    it('mesa sin sesión activa → 409, sin llegar a validar el cupón', async () => {
      const timestamp = Date.now();
      const mesaSinSesion = await Mesa.create({ area_id: area.id, nombre: 'Mesa Sin Sesion', codigo_qr: `ss-${timestamp}` });

      const res = await request(app)
        .post(`/api/v1/autoservicio/mesa/${mesaSinSesion.codigo_qr}/cupon/validar`)
        .send({ codigo: cupon.codigo, items: [] });

      expect(res.status).toBe(409);
      await Mesa.destroy({ where: { id: mesaSinSesion.id } });
    });
  });

  describe('numero_documento en el pedido — identificación opcional para sumar puntos', () => {
    // No se mockea personas.client: en este entorno de test PERSONAS_API_URL
    // no apunta a nada real, así que buscarPorDocumento falla (fetch la
    // rechaza) para cualquier CI que no exista ya como Cliente — eso es
    // justo lo que se quiere probar: la falla se traga en silencio y el
    // pedido sigue su curso sin cliente_id, nunca bloquea al cliente.
    let sucursal, area, mesa, usuario, caja, clienteExistente;

    beforeAll(async () => {
      const timestamp = Date.now();
      sucursal = await Sucursal.create({ nombre: `Sucursal Autoservicio Doc Test ${timestamp}` });
      area = await Area.create({ nombre: `Area Autoservicio Doc Test ${timestamp}`, sucursal_id: sucursal.id });
      mesa = await Mesa.create({ area_id: area.id, nombre: 'Mesa Doc Test', codigo_qr: `doc-${timestamp}` });
      await MesaSesion.create({ mesa_id: mesa.id, sucursal_id: sucursal.id, abierta_por: 'staff' });

      const categoria = await Categoria.create({ nombre: `Categoria Autoservicio Doc Test ${timestamp}` });
      const producto = await Producto.create({ categoria_id: categoria.id, nombre: `Producto Autoservicio Doc Test ${timestamp}`, precio: 15, stock: 0 });
      await ProductoStockSucursal.create({ producto_id: producto.id, sucursal_id: sucursal.id, stock: 10 });
      mesa.productoId = producto.id;

      const rol = await Rol.findOne({ where: { nombre: 'Cajero' } });
      const hash = await bcrypt.hash('clave123', 10);
      usuario = await Usuario.create({ rol_id: rol.id, nombre: `Autoservicio Doc Test ${timestamp}`, email: `autoservicio-doc-test-${timestamp}@restaurante.com`, contrasena: hash });

      caja = await Caja.create({ sucursal_id: sucursal.id, nombre: 'Caja Autoservicio Doc Test' });
      await SesionCaja.create({ usuario_id: usuario.id, sucursal_id: sucursal.id, caja_id: caja.id, monto_apertura: 0 });

      clienteExistente = await Cliente.create({ nombre: 'Cliente Autoservicio Doc Test', numero_documento: `DOC${timestamp}` });
    });

    afterAll(async () => {
      const pedidosDeLaMesa = await Pedido.findAll({ where: { mesa_id: mesa.id }, attributes: ['id'] });
      const pedidoIds = pedidosDeLaMesa.map((p) => p.id);
      await PagoQr.destroy({ where: { pedido_id: { [Op.in]: pedidoIds } } });
      await DetallePedido.destroy({ where: { pedido_id: { [Op.in]: pedidoIds } } });
      await Pedido.destroy({ where: { mesa_id: mesa.id } });
      await SesionCaja.destroy({ where: { caja_id: caja.id } });
      await Caja.destroy({ where: { id: caja.id } });
      await Usuario.destroy({ where: { id: usuario.id } });
      await Cliente.destroy({ where: { id: clienteExistente.id } });
      await MesaSesion.destroy({ where: { mesa_id: mesa.id } });
      await Mesa.destroy({ where: { id: mesa.id } });
      await Area.destroy({ where: { id: area.id } });
      await Sucursal.destroy({ where: { id: sucursal.id } });
    });

    it('CI de un cliente ya registrado → el pedido queda ligado a ese cliente_id', async () => {
      const res = await request(app)
        .post(`/api/v1/autoservicio/mesa/${mesa.codigo_qr}/pedido`)
        .send({ items: [{ producto_id: mesa.productoId, cantidad: 1 }], numero_documento: clienteExistente.numero_documento });

      expect(res.status).not.toBe(400);
      const pedido = await Pedido.findByPk(res.body.datos.pedido.id);
      expect(pedido.cliente_id).toBe(clienteExistente.id);
    });

    it('CI que no matchea ningún cliente ni la API de personas → el pedido sigue sin bloquear, sin cliente_id', async () => {
      const res = await request(app)
        .post(`/api/v1/autoservicio/mesa/${mesa.codigo_qr}/pedido`)
        .send({ items: [{ producto_id: mesa.productoId, cantidad: 1 }], numero_documento: '00000000-NOEXISTE' });

      expect(res.status).not.toBe(400);
      const pedido = await Pedido.findByPk(res.body.datos.pedido.id);
      expect(pedido.cliente_id).toBeNull();
    });

    it('sin numero_documento, el pedido sigue su curso normal (no lo exige)', async () => {
      const res = await request(app)
        .post(`/api/v1/autoservicio/mesa/${mesa.codigo_qr}/pedido`)
        .send({ items: [{ producto_id: mesa.productoId, cantidad: 1 }] });

      expect(res.status).not.toBe(400);
      const pedido = await Pedido.findByPk(res.body.datos.pedido.id);
      expect(pedido.cliente_id).toBeNull();
    });
  });

  describe('canje de puntos en el pedido de autoservicio', () => {
    let sucursal, area, mesa, usuario, caja, clienteConPuntos, clienteB;
    let configPrevia = {};

    // El canje por QR está detrás de dos flags de Configuracion
    // (fidelidad_activa, fidelidad_canje_qr) que en la base de datos de
    // desarrollo compartida vienen en 'false' por defecto — sin esto
    // encendido, iniciarPagoQr nunca reserva puntos y las pruebas de canje
    // pasarían igual aunque el gate estuviera roto. Se guarda el valor
    // previo para restaurarlo en afterAll y no afectar otras suites que
    // corren contra la misma base compartida.
    const CLAVES_FIDELIDAD = ['fidelidad_activa', 'fidelidad_canje_qr'];

    beforeAll(async () => {
      const timestamp = Date.now();
      sucursal = await Sucursal.create({ nombre: `Sucursal Autoservicio Canje Test ${timestamp}` });
      area = await Area.create({ nombre: `Area Autoservicio Canje Test ${timestamp}`, sucursal_id: sucursal.id });
      mesa = await Mesa.create({ area_id: area.id, nombre: 'Mesa Canje Test', codigo_qr: `cj-${timestamp}` });
      await MesaSesion.create({ mesa_id: mesa.id, sucursal_id: sucursal.id, abierta_por: 'staff' });

      const categoria = await Categoria.create({ nombre: `Categoria Autoservicio Canje Test ${timestamp}` });
      const producto = await Producto.create({ categoria_id: categoria.id, nombre: `Producto Autoservicio Canje Test ${timestamp}`, precio: 20, stock: 0 });
      await ProductoStockSucursal.create({ producto_id: producto.id, sucursal_id: sucursal.id, stock: 10 });
      mesa.productoId = producto.id;

      const rol = await Rol.findOne({ where: { nombre: 'Cajero' } });
      const hash = await bcrypt.hash('clave123', 10);
      usuario = await Usuario.create({ rol_id: rol.id, nombre: `Autoservicio Canje Test ${timestamp}`, email: `autoservicio-canje-test-${timestamp}@restaurante.com`, contrasena: hash });

      caja = await Caja.create({ sucursal_id: sucursal.id, nombre: 'Caja Autoservicio Canje Test' });
      await SesionCaja.create({ usuario_id: usuario.id, sucursal_id: sucursal.id, caja_id: caja.id, monto_apertura: 0 });

      // pin_hash seteado porque authClienteOpcional ahora exige una sesión
      // vigente (ver fix de "PIN reseteado no revoca el token"): en la
      // realidad un token de cliente solo se emite después de que
      // verificarPin/confirmarPin confirman que el PIN ya existe.
      clienteConPuntos = await Cliente.create({ nombre: 'Cliente Con Puntos', numero_documento: `pts-${timestamp}`, puntos: 1000, pin_hash: await bcrypt.hash('1234', 10) });
      clienteB = await Cliente.create({ nombre: 'Cliente B (ajeno)', numero_documento: `ajeno-${timestamp}`, puntos: 500 });

      for (const clave of CLAVES_FIDELIDAD) {
        const fila = await Configuracion.findOne({ where: { clave } });
        configPrevia[clave] = fila ? fila.valor : null;
        await Configuracion.upsert({ clave, valor: 'true' });
      }
    });

    afterAll(async () => {
      for (const clave of CLAVES_FIDELIDAD) {
        if (configPrevia[clave] === null) {
          await Configuracion.destroy({ where: { clave } });
        } else {
          await Configuracion.upsert({ clave, valor: configPrevia[clave] });
        }
      }

      const pedidosDeLaMesa = await Pedido.findAll({ where: { mesa_id: mesa.id }, attributes: ['id'] });
      const pedidoIds = pedidosDeLaMesa.map((p) => p.id);
      await PagoQr.destroy({ where: { pedido_id: { [Op.in]: pedidoIds } } });
      await DetallePedido.destroy({ where: { pedido_id: { [Op.in]: pedidoIds } } });
      await Pedido.destroy({ where: { mesa_id: mesa.id } });
      await SesionCaja.destroy({ where: { caja_id: caja.id } });
      await Caja.destroy({ where: { id: caja.id } });
      await Usuario.destroy({ where: { id: usuario.id } });
      await Cliente.destroy({ where: { id: [clienteConPuntos.id, clienteB.id] } });
      await MesaSesion.destroy({ where: { mesa_id: mesa.id } });
      await Mesa.destroy({ where: { id: mesa.id } });
      await Area.destroy({ where: { id: area.id } });
      await Sucursal.destroy({ where: { id: sucursal.id } });
    });

    function tokenPara(clienteId) {
      return jwt.sign({ cliente_id: clienteId, tipo: 'cliente' }, process.env.JWT_SECRET, { expiresIn: '180d' });
    }

    it('sin token, puntos_canjear en el body se ignora (no descuenta puntos ni pisa cliente_id)', async () => {
      const res = await request(app)
        .post(`/api/v1/autoservicio/mesa/${mesa.codigo_qr}/pedido`)
        .send({ items: [{ producto_id: mesa.productoId, cantidad: 1 }], puntos_canjear: 100, numero_documento: clienteConPuntos.numero_documento });

      expect(res.status).not.toBe(400);
      const pedido = await Pedido.findByPk(res.body.datos.pedido.id);
      // Sin token, cliente_id se resuelve igual por CI (comportamiento ya
      // existente), pero puntos_canjear no se aplica: ni se anota en el
      // pedido ni se descuenta del balance del cliente.
      expect(pedido.cliente_id).toBe(clienteConPuntos.id);
      expect(pedido.puntos_canjeados).toBe(0);

      const clienteRecargado = await Cliente.findByPk(clienteConPuntos.id);
      expect(clienteRecargado.puntos).toBe(1000);

      // Libera el cupo de MAX_PAGOS_PENDIENTES para las siguientes pruebas
      // de este describe (todas comparten la misma mesa/sesión).
      await pedido.update({ estado: 'completado' });
    });

    it('con token válido, puntos_canjear descuenta los puntos del cliente y usa el cliente_id del token', async () => {
      const res = await request(app)
        .post(`/api/v1/autoservicio/mesa/${mesa.codigo_qr}/pedido`)
        .set('Authorization', `Bearer ${tokenPara(clienteConPuntos.id)}`)
        .send({ items: [{ producto_id: mesa.productoId, cantidad: 1 }], puntos_canjear: 100 });

      // Mismo límite que el resto de esta suite: sin mock de CodePay, no se
      // afirma un status exacto de éxito (podría depender de la red), solo
      // que no fue rechazado como error de validación.
      expect(res.status).not.toBe(400);
      const pedido = await Pedido.findByPk(res.body.datos.pedido.id);
      expect(pedido.cliente_id).toBe(clienteConPuntos.id);
      expect(pedido.puntos_canjeados).toBe(100);

      const clienteRecargado = await Cliente.findByPk(clienteConPuntos.id);
      expect(clienteRecargado.puntos).toBe(900);

      await pedido.update({ estado: 'completado' });
    });

    it('con token inválido, se comporta como si no hubiera token (no rompe el pedido)', async () => {
      const res = await request(app)
        .post(`/api/v1/autoservicio/mesa/${mesa.codigo_qr}/pedido`)
        .set('Authorization', 'Bearer token-basura')
        .send({ items: [{ producto_id: mesa.productoId, cantidad: 1 }] });

      expect(res.status).not.toBe(400);
      expect(res.status).not.toBe(401);

      if (res.body?.datos?.pedido?.id) {
        await Pedido.update({ estado: 'completado' }, { where: { id: res.body.datos.pedido.id } });
      }
    });

    it('token de A + numero_documento de B en el mismo body → el pedido queda en A, B no se toca', async () => {
      const res = await request(app)
        .post(`/api/v1/autoservicio/mesa/${mesa.codigo_qr}/pedido`)
        .set('Authorization', `Bearer ${tokenPara(clienteConPuntos.id)}`)
        .send({
          items: [{ producto_id: mesa.productoId, cantidad: 1 }],
          numero_documento: clienteB.numero_documento,
          puntos_canjear: 50,
        });

      expect(res.status).not.toBe(400);
      const pedido = await Pedido.findByPk(res.body.datos.pedido.id);
      // La sesión autenticada (A) gana por sobre el CI suelto en el body (B)
      // — el cortocircuito clienteIdAutenticado || resolverOCrearPorDocumento
      // nunca llega a mirar numero_documento cuando hay token.
      expect(pedido.cliente_id).toBe(clienteConPuntos.id);
      expect(pedido.puntos_canjeados).toBe(50);

      const bSinTocar = await Cliente.findByPk(clienteB.id);
      expect(bSinTocar.puntos).toBe(500);
    });

    it('puntos_canjear fraccionario → 400, no llega a ventasService', async () => {
      const res = await request(app)
        .post(`/api/v1/autoservicio/mesa/${mesa.codigo_qr}/pedido`)
        .set('Authorization', `Bearer ${tokenPara(clienteConPuntos.id)}`)
        .send({ items: [{ producto_id: mesa.productoId, cantidad: 1 }], puntos_canjear: 0.4 });

      expect(res.status).toBe(400);
      expect(res.body.mensaje).toMatch(/puntos_canjear/);
    });

    it('puntos_canjear negativo → 400', async () => {
      const res = await request(app)
        .post(`/api/v1/autoservicio/mesa/${mesa.codigo_qr}/pedido`)
        .set('Authorization', `Bearer ${tokenPara(clienteConPuntos.id)}`)
        .send({ items: [{ producto_id: mesa.productoId, cantidad: 1 }], puntos_canjear: -10 });

      expect(res.status).toBe(400);
      expect(res.body.mensaje).toMatch(/puntos_canjear/);
    });
  });
});
