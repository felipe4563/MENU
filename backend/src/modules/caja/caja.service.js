const { Op } = require('sequelize');
const { SesionCaja, DetalleArqueo, Gasto, LibroCaja, Usuario, Pedido, Mesa, Caja, Sucursal, MarcacionPersonal, sequelize } = require('../../models');
const { categoriaPara } = require('../flujo_caja/categorias');

// Cierre ciego: mientras la caja está abierta no se entrega nada con lo que
// se pueda sacar el efectivo esperado (ni el esperado ni las ventas en
// efectivo). Se ve recién en el resumen, después de cerrar.
const _esCiegoAbierta = (s) => s.estado === 'abierta' && s.sucursal?.modo_cierre_caja === 'ciego';

async function listarConEstado(sucursal_id) {
  const cajas = await Caja.findAll({
    where: { sucursal_id, activo: 1 },
    order: [['nombre', 'ASC']],
  });
  const sesiones = await SesionCaja.findAll({
    where: { caja_id: cajas.map(c => c.id), estado: 'abierta' },
    include: [
      { model: Usuario, as: 'usuario', attributes: ['id', 'nombre'] },
      { model: Sucursal, as: 'sucursal', attributes: ['id', 'nombre', 'modo_cierre_caja', 'tolerancia_cierre_caja'] },
    ],
  });
  return cajas.map(c => {
    const sesion = sesiones.find(s => s.caja_id === c.id) ?? null;
    return { id: c.id, nombre: c.nombre, sesion_abierta: sesion };
  });
}

async function listar(alcance = {}) {
  const where = alcance.acceso_todas ? {} : { sucursal_id: alcance.sucursal_id };
  return SesionCaja.findAll({
    where,
    include: [
      { model: Usuario, as: 'usuario', attributes: ['id', 'nombre'] },
      { model: Sucursal, as: 'sucursal', attributes: ['id', 'nombre', 'modo_cierre_caja', 'tolerancia_cierre_caja'] },
    ],
    order: [['abierto_en', 'DESC']],
    limit: 50,
  });
}

function _verificarAlcance(sesion, alcance) {
  if (alcance && !alcance.acceso_todas && sesion.sucursal_id !== alcance.sucursal_id) {
    throw Object.assign(new Error('Sesión no encontrada'), { status: 404 });
  }
}

async function obtener(id, alcance) {
  const s = await SesionCaja.findByPk(id, {
    include: [
      { model: Usuario, as: 'usuario', attributes: ['id', 'nombre'] },
      { model: Sucursal, as: 'sucursal', attributes: ['id', 'nombre', 'modo_cierre_caja', 'tolerancia_cierre_caja'] },
      { model: DetalleArqueo, as: 'detalle_arqueo' },
      { model: Gasto, as: 'gastos' },
      // Cómo imprime esa caja: el resumen del cierre y el adelanto de una reserva salen por ese canal.
      { model: Caja, as: 'caja', attributes: ['id', 'nombre', 'modo_impresion', 'ancho_papel_bluetooth', 'conexion_bluetooth', 'imprimir_logo', 'imprimir_ticket_cliente'] },
    ],
  });
  if (!s) throw Object.assign(new Error('Sesión no encontrada'), { status: 404 });
  _verificarAlcance(s, alcance);

  const [ventasEfectivo, ventasQR] = await Promise.all([
    LibroCaja.sum('monto', { where: { sesion_caja_id: s.id, tipo: 'ingreso', metodo_pago: 'efectivo' } }),
    LibroCaja.sum('monto', { where: { sesion_caja_id: s.id, tipo: 'ingreso', metodo_pago: 'qr' } }),
  ]);

  const datos = s.toJSON();
  datos.ventas_efectivo = ventasEfectivo || 0;
  datos.ventas_qr       = ventasQR       || 0;
  datos.efectivo_esperado = parseFloat(s.monto_apertura) + datos.ventas_efectivo
    - parseFloat(s.total_gastos) - parseFloat(s.total_devoluciones || 0);
  if (_esCiegoAbierta(s)) {
    datos.cierre_ciego = true;
    datos.ventas_efectivo = null;
    datos.efectivo_esperado = null;
  }
  return datos;
}

async function abrir(usuario_id, caja_id, monto_apertura = 0) {
  const caja = await Caja.findByPk(caja_id);
  if (!caja || !caja.activo) throw Object.assign(new Error('Caja no encontrada'), { status: 404 });

  const abierta = await SesionCaja.findOne({ where: { caja_id, estado: 'abierta' } });
  if (abierta) throw Object.assign(new Error('Esta caja ya tiene una sesión abierta'), { status: 409 });

  return SesionCaja.create({ usuario_id, caja_id, sucursal_id: caja.sucursal_id, monto_apertura });
}

async function registrarGasto(sesion_id, usuario_id, { descripcion, monto, categoria }, alcance) {
  const cat = await categoriaPara(categoria, 'egreso');
  const sesion = await SesionCaja.findByPk(sesion_id);
  if (!sesion) throw Object.assign(new Error('Sesión no encontrada'), { status: 404 });
  _verificarAlcance(sesion, alcance);
  if (sesion.estado !== 'abierta') throw Object.assign(new Error('La sesión ya está cerrada'), { status: 409 });
  if (sesion.usuario_id !== usuario_id) throw Object.assign(new Error('Solo el cajero que abrió puede registrar gastos en esta sesión'), { status: 403 });

  const gasto = await Gasto.create({ sesion_caja_id: sesion_id, usuario_id, descripcion, monto });

  await LibroCaja.create({
    sesion_caja_id: sesion_id,
    usuario_id,
    tipo: 'egreso',
    concepto: descripcion,
    categoria: cat,
    monto,
    metodo_pago: 'efectivo',
    referencia_id: gasto.id,
  });

  await SesionCaja.increment('total_gastos', { by: parseFloat(monto), where: { id: sesion_id } });

  return gasto;
}

async function listarGastos(sesion_id, alcance) {
  const sesion = await SesionCaja.findByPk(sesion_id);
  if (!sesion) throw Object.assign(new Error('Sesión no encontrada'), { status: 404 });
  _verificarAlcance(sesion, alcance);
  return Gasto.findAll({
    where: { sesion_caja_id: sesion_id },
    include: [{ model: Usuario, as: 'usuario', attributes: ['id', 'nombre'] }],
    order: [['creado_en', 'DESC']],
  });
}

async function cerrar(sesion_id, usuario_id, { denominaciones = [], monto_cierre, confirmar_pese_a_diferencia = false, nota_diferencia } = {}, alcance) {
  const sesion = await SesionCaja.findByPk(sesion_id);
  if (!sesion) throw Object.assign(new Error('Sesión no encontrada'), { status: 404 });
  _verificarAlcance(sesion, alcance);
  if (sesion.estado !== 'abierta') throw Object.assign(new Error('La sesión ya está cerrada'), { status: 409 });
  if (sesion.usuario_id !== usuario_id) throw Object.assign(new Error('Solo el cajero que abrió puede cerrar la sesión'), { status: 403 });

  // Dos formas de cerrar: conteo detallado por denominación, o un monto total
  // anotado directamente. Son mutuamente excluyentes — si hay denominaciones,
  // el total sale de ahí y se guarda el detalle del arqueo; si no, se usa el
  // monto anotado y no queda detalle de billetes/monedas.
  const total_fisico = denominaciones.length > 0
    ? denominaciones.reduce((sum, d) => sum + (parseFloat(d.denominacion) * parseInt(d.cantidad)), 0)
    : parseFloat(monto_cierre);

  if (!Number.isFinite(total_fisico) || total_fisico <= 0) {
    throw Object.assign(new Error('Debes indicar el conteo de efectivo o el monto total para cerrar la caja'), { status: 400 });
  }

  const sucursal = await Sucursal.findByPk(sesion.sucursal_id);
  const modoCierre = sucursal?.modo_cierre_caja ?? 'directo';
  const toleranciaSucursal = sucursal?.tolerancia_cierre_caja ?? 10;

  const ventasEfectivo = await LibroCaja.sum('monto', {
    where: { sesion_caja_id: sesion_id, tipo: 'ingreso', metodo_pago: 'efectivo' },
  }) || 0;

  const efectivo_esperado = parseFloat(sesion.monto_apertura) + ventasEfectivo
    - parseFloat(sesion.total_gastos) - parseFloat(sesion.total_devoluciones || 0);
  const diferencia = total_fisico - efectivo_esperado;
  const tolerancia = parseFloat(toleranciaSucursal);
  const fueraDeTolerancia = Math.abs(diferencia) > tolerancia;

  if (fueraDeTolerancia) {
    if (modoCierre === 'ciego' && !confirmar_pese_a_diferencia) {
      // Primer intento en modo ciego: no se revela nada ni se persiste el
      // conteo — el cajero decide entre recontar o cerrar igual sin saber el
      // monto, que es todo el sentido del arqueo ciego.
      throw Object.assign(new Error('Hay una diferencia con lo esperado'), {
        status: 409,
        codigo: 'DIFERENCIA_FUERA_TOLERANCIA',
      });
    }
    if (typeof nota_diferencia !== 'string' || !nota_diferencia.trim()) {
      throw Object.assign(new Error('Debes indicar el motivo de la diferencia para cerrar la caja'), {
        status: 400,
        codigo: 'MOTIVO_REQUERIDO',
      });
    }
    if (nota_diferencia.trim().length > 255) {
      throw Object.assign(new Error('El motivo no puede superar 255 caracteres'), { status: 400 });
    }
  }

  if (denominaciones.length > 0) {
    await DetalleArqueo.destroy({ where: { sesion_caja_id: sesion_id } });
    await DetalleArqueo.bulkCreate(
      denominaciones.map(d => ({
        sesion_caja_id: sesion_id,
        denominacion: d.denominacion,
        cantidad: d.cantidad,
        subtotal: parseFloat(d.denominacion) * parseInt(d.cantidad),
      }))
    );
  }

  await sesion.update({
    monto_cierre: total_fisico,
    diferencia,
    nota_diferencia: fueraDeTolerancia ? nota_diferencia.trim() : null,
    estado: 'cerrada',
    cerrado_en: new Date(),
  });

  return obtener(sesion_id, alcance);
}

// Quién trabajó durante el turno de caja, para repartir las propinas: las
// marcaciones de la sucursal que se cruzan con el horario del turno, y
// cuántos minutos de cada persona caen dentro. Si alguien no marcó salida,
// se cuenta hasta el cierre del turno (o hasta ahora si sigue abierto).
async function _personalDelTurno(sesion) {
  const inicio = new Date(sesion.abierto_en);
  const fin = sesion.cerrado_en ? new Date(sesion.cerrado_en) : new Date();
  const marcaciones = await MarcacionPersonal.findAll({
    where: {
      sucursal_id: sesion.sucursal_id,
      hora_entrada: { [Op.lt]: fin },
      [Op.or]: [{ hora_salida: null }, { hora_salida: { [Op.gt]: inicio } }],
    },
    include: [{ model: Usuario, as: 'usuario', attributes: ['id', 'nombre'] }],
  });
  const porPersona = new Map();
  for (const m of marcaciones) {
    const desde = Math.max(inicio.getTime(), new Date(m.hora_entrada).getTime());
    const hasta = Math.min(fin.getTime(), m.hora_salida ? new Date(m.hora_salida).getTime() : fin.getTime());
    const minutos = Math.round((hasta - desde) / 60000);
    if (minutos <= 0) continue;
    const p = porPersona.get(m.usuario_id) || { usuario_id: m.usuario_id, nombre: m.usuario?.nombre ?? 'Sin nombre', minutos: 0 };
    p.minutos += minutos;
    porPersona.set(m.usuario_id, p);
  }
  return Array.from(porPersona.values()).sort((a, b) => b.minutos - a.minutos || a.nombre.localeCompare(b.nombre));
}

async function reporte(sesion_id, alcance) {
  const sesion = await obtener(sesion_id, alcance);
  if (sesion.cierre_ciego) {
    throw Object.assign(new Error('Con cierre ciego, el resumen se ve después de cerrar la caja'), { status: 409, codigo: 'CIERRE_CIEGO' });
  }

  const ventasPorMetodoArr = await sequelize.query(
    `SELECT metodo_pago, COUNT(*) as cantidad, SUM(monto) as total
     FROM libro_caja
     WHERE sesion_caja_id = ? AND tipo = 'ingreso'
     GROUP BY metodo_pago`,
    { replacements: [sesion_id], type: sequelize.QueryTypes.SELECT }
  );

  const pedidos = await Pedido.findAll({
    where: { sesion_caja_id: sesion_id, estado: 'completado' },
    include: [{ model: Mesa, as: 'mesa', attributes: ['id', 'nombre'] }],
    order: [['creado_en', 'DESC']],
  });

  const productosVendidos = await sequelize.query(
    `SELECT pr.nombre, SUM(dp.cantidad - dp.cantidad_anulada) AS total_cantidad, SUM((dp.cantidad - dp.cantidad_anulada) * dp.precio) AS total
     FROM detalle_pedidos dp
     JOIN pedidos pe ON pe.id = dp.pedido_id
     JOIN productos pr ON pr.id = dp.producto_id
     WHERE pe.sesion_caja_id = ? AND pe.estado = 'completado'
     GROUP BY dp.producto_id, pr.nombre
     ORDER BY total_cantidad DESC`,
    { replacements: [sesion_id], type: sequelize.QueryTypes.SELECT }
  );

  // Devoluciones del turno: las de efectivo salen del cajón (sesion_caja_id);
  // las de transferencia/app o anuladas antes de cobrar no tienen sesión, se
  // toman por el turno en que se vendió el pedido.
  const devoluciones = await sequelize.query(
    `SELECT d.id, d.pedido_id, d.monto, d.forma, d.motivo, d.nota, d.creado_en, u.nombre AS usuario
     FROM devoluciones d
     JOIN pedidos pe ON pe.id = d.pedido_id
     LEFT JOIN usuarios u ON u.id = d.usuario_id
     WHERE d.sesion_caja_id = ? OR (d.sesion_caja_id IS NULL AND pe.sesion_caja_id = ?)
     ORDER BY d.creado_en`,
    { replacements: [sesion_id, sesion_id], type: sequelize.QueryTypes.SELECT }
  );
  if (devoluciones.length) {
    const items = await sequelize.query(
      `SELECT di.devolucion_id, di.cantidad, di.monto, COALESCE(pr.nombre, co.nombre) AS nombre
       FROM devolucion_items di
       JOIN detalle_pedidos dp ON dp.id = di.detalle_pedido_id
       LEFT JOIN productos pr ON pr.id = dp.producto_id
       LEFT JOIN combos co ON co.id = dp.combo_id
       WHERE di.devolucion_id IN (?)
       ORDER BY di.id`,
      { replacements: [devoluciones.map((d) => d.id)], type: sequelize.QueryTypes.SELECT }
    );
    for (const d of devoluciones) d.items = items.filter((i) => i.devolucion_id === d.id);
  }

  const efectivoEsperado =
    parseFloat(sesion.monto_apertura) +
    parseFloat(ventasPorMetodoArr.find(v => v.metodo_pago === 'efectivo')?.total ?? 0) -
    parseFloat(sesion.total_gastos) -
    parseFloat(sesion.total_devoluciones || 0);

  // Propinas del turno: ya están sumadas en lo cobrado por cada método (y en
  // el efectivo esperado); acá se muestran aparte para repartirlas.
  const propinas = { total: 0, efectivo: 0, qr: 0, otros: 0, cantidad: 0 };
  pedidos.forEach((p) => {
    const monto = parseFloat(p.propina || 0);
    if (monto <= 0) return;
    propinas.total += monto;
    propinas.cantidad += 1;
    if (p.metodo_pago === 'efectivo' || p.metodo_pago === 'qr') propinas[p.metodo_pago] += monto;
    else propinas.otros += monto;
  });
  for (const k of ['total', 'efectivo', 'qr', 'otros']) propinas[k] = Math.round(propinas[k] * 100) / 100;

  return {
    sesion,
    propinas,
    personal_turno: await _personalDelTurno(sesion),
    ventas_por_metodo: ventasPorMetodoArr,
    pedidos,
    efectivo_esperado: efectivoEsperado,
    productos_vendidos: productosVendidos,
    devoluciones,
  };
}

module.exports = { listarConEstado, listar, obtener, abrir, registrarGasto, listarGastos, cerrar, reporte };
