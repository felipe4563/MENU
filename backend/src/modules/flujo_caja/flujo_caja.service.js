// Flujo de caja del mes, día por día y separado en efectivo y QR, armado
// desde el libro de caja (ventas, compras, gastos, devoluciones y lo que se
// anota a mano: sueldos, servicios, retiros, traspasos, ajustes).
const { Op, QueryTypes } = require('sequelize');
const sequelize = require('../../config/database');
const { LibroCaja, Usuario } = require('../../models');
const { emitir } = require('../../socket');
const { GRUPOS, cargar } = require('./categorias');

const error = (mensaje, status = 400) => Object.assign(new Error(mensaje), { status });
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const MES = /^\d{4}-\d{2}$/;

// Hoy en Bolivia (-04:00), yyyy-mm-dd.
const hoyBolivia = () => new Date(Date.now() - 4 * 3600000).toISOString().slice(0, 10);

// ── Lectura ────────────────────────────────────────────────────────────────

// QR, transferencias y apps de delivery van juntos: plata que no está en el cajón.
const METODO_SQL = "CASE WHEN lc.metodo_pago = 'efectivo' THEN 'efectivo' ELSE 'qr' END";
// La conexión trabaja en hora de Bolivia, así que DATE(creado_en) ya es el día local.
const DIA_SQL = 'COALESCE(lc.fecha, DATE(lc.creado_en))';
const ES_VENTA = "(lc.tipo = 'ingreso' AND lc.concepto LIKE 'Venta #%')";
const ES_DEVOLUCION = "(lc.tipo = 'egreso' AND lc.concepto LIKE 'Devolución venta #%')";
// Sin categoría elegida, la que corresponde por de dónde vino el movimiento.
const CAT_SQL = `COALESCE(lc.categoria, CASE
  WHEN lc.compra_id IS NOT NULL THEN 'compras'
  WHEN ${ES_VENTA} THEN 'ventas'
  WHEN ${ES_DEVOLUCION} THEN 'devoluciones'
  WHEN lc.tipo = 'ingreso' THEN 'otro_ingreso'
  ELSE 'gastos_caja' END)`;
// Lo que se anotó sin categoría se desglosa por su concepto (como las filas del Excel).
const DETALLE_SQL = `CASE
  WHEN lc.categoria IS NULL AND lc.compra_id IS NULL AND NOT ${ES_VENTA} AND NOT ${ES_DEVOLUCION}
  THEN LEFT(TRIM(lc.concepto), 80) ELSE lc.detalle END`;
const SUC_SQL = 'COALESCE(sc.sucursal_id, lc.sucursal_id, co.sucursal_id)';
const DESDE_TABLAS = `FROM libro_caja lc
  LEFT JOIN sesiones_caja sc ON sc.id = lc.sesion_caja_id
  LEFT JOIN compras co ON co.id = lc.compra_id`;
// Los movimientos sin sucursal (de antes de la migración 069) se ven en todas.
const FILTRO_SUC = `(:suc IS NULL OR ${SUC_SQL} = :suc OR ${SUC_SQL} IS NULL)`;
// Rango por día sin envolver las columnas en funciones (usa los índices).
const EN_RANGO = `((lc.fecha BETWEEN :desde AND :hasta)
  OR (lc.fecha IS NULL AND lc.creado_en >= :desde AND lc.creado_en < DATE_ADD(:hasta, INTERVAL 1 DAY)))`;
const ANTES = '(lc.fecha < :desde OR (lc.fecha IS NULL AND lc.creado_en < :desde))';

function _sucursal(filtros, alcance) {
  if (alcance && !alcance.acceso_todas) return alcance.sucursal_id;
  return filtros.sucursal_id ? Number(filtros.sucursal_id) : null;
}

function _rangoMes(mes) {
  if (!MES.test(mes || '')) throw error('Mes inválido (usa AAAA-MM)');
  const [a, m] = mes.split('-').map(Number);
  const dias = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return { desde: `${mes}-01`, hasta: `${mes}-${String(dias).padStart(2, '0')}`, dias };
}

/**
 * Todo lo del mes agrupado por día, medio, categoría y detalle, más el saldo
 * con que empieza el mes (todo lo anterior). El armado de la grilla (subtotales,
 * flujo del día, saldo acumulado) lo hace la pantalla.
 */
async function obtener(filtros = {}, alcance) {
  const { desde, hasta, dias } = _rangoMes(filtros.mes);
  const suc = _sucursal(filtros, alcance);
  const repl = { desde, hasta, suc };
  const { CATEGORIAS, POR_CLAVE } = await cargar();

  const [movs, saldos, compras] = await Promise.all([
    sequelize.query(`
      SELECT DATE_FORMAT(${DIA_SQL}, '%Y-%m-%d') AS dia_flujo, ${METODO_SQL} AS metodo_flujo, lc.tipo,
             ${CAT_SQL} AS cat_flujo, ${DETALLE_SQL} AS det_flujo,
             SUM(lc.monto) AS total, COUNT(*) AS cantidad
      ${DESDE_TABLAS}
      WHERE ${EN_RANGO} AND ${FILTRO_SUC}
      GROUP BY dia_flujo, metodo_flujo, lc.tipo, cat_flujo, det_flujo`, { replacements: repl, type: QueryTypes.SELECT }),
    sequelize.query(`
      SELECT ${METODO_SQL} AS metodo_flujo,
             SUM(CASE WHEN lc.tipo = 'ingreso' THEN lc.monto ELSE -lc.monto END) AS saldo
      ${DESDE_TABLAS}
      WHERE ${ANTES} AND ${FILTRO_SUC}
      GROUP BY metodo_flujo`, { replacements: repl, type: QueryTypes.SELECT }),
    // Las compras se desglosan por lo que se compró (insumo o producto).
    sequelize.query(`
      SELECT DATE_FORMAT(${DIA_SQL}, '%Y-%m-%d') AS dia_flujo, ${METODO_SQL} AS metodo_flujo,
             COALESCE(i.nombre, p.nombre, 'Otro') AS det_flujo, SUM(dc.subtotal) AS total
      ${DESDE_TABLAS}
      JOIN detalle_compras dc ON dc.compra_id = lc.compra_id
      LEFT JOIN insumos i ON i.id = dc.insumo_id
      LEFT JOIN productos p ON p.id = dc.producto_id
      WHERE lc.compra_id IS NOT NULL AND lc.tipo = 'egreso' AND lc.categoria IS NULL
        AND ${EN_RANGO} AND ${FILTRO_SUC}
      GROUP BY dia_flujo, metodo_flujo, det_flujo`, { replacements: repl, type: QueryTypes.SELECT }),
  ]);

  const num = (v) => Math.round(Number(v || 0) * 100) / 100;
  // Los alias de SQL no se llaman como columnas (MariaDB agruparía por la columna).
  movs.forEach((m) => { m.dia = m.dia_flujo; m.metodo = m.metodo_flujo; m.categoria = m.cat_flujo; m.detalle = m.det_flujo; });
  compras.forEach((c) => { c.dia = c.dia_flujo; c.metodo = c.metodo_flujo; c.detalle = c.det_flujo; });
  saldos.forEach((x) => { x.metodo = x.metodo_flujo; });
  const filas = movs.filter((m) => m.categoria !== 'compras').map((m) => ({
    dia: m.dia, metodo: m.metodo, tipo: m.tipo, categoria: POR_CLAVE[m.categoria] ? m.categoria : (m.tipo === 'ingreso' ? 'otro_ingreso' : 'otro_gasto'),
    detalle: m.detalle || null, total: num(m.total), cantidad: Number(m.cantidad),
  }));

  // Compras: el detalle por insumo; si el detalle no llega al total pagado
  // (compra sin renglones, redondeos), la diferencia va como "Sin detalle".
  const comprasTotal = {};
  movs.filter((m) => m.categoria === 'compras').forEach((m) => {
    const k = `${m.dia}|${m.metodo}`;
    comprasTotal[k] = (comprasTotal[k] || 0) + Number(m.total);
  });
  const comprasDetalle = {};
  compras.forEach((c) => {
    const k = `${c.dia}|${c.metodo}`;
    comprasDetalle[k] = (comprasDetalle[k] || 0) + Number(c.total);
    filas.push({ dia: c.dia, metodo: c.metodo, tipo: 'egreso', categoria: 'compras', detalle: c.detalle, total: num(c.total), cantidad: 1 });
  });
  Object.entries(comprasTotal).forEach(([k, total]) => {
    const resto = num(total - (comprasDetalle[k] || 0));
    if (Math.abs(resto) >= 0.01) {
      const [dia, metodo] = k.split('|');
      filas.push({ dia, metodo, tipo: 'egreso', categoria: 'compras', detalle: 'Sin detalle', total: resto, cantidad: 1 });
    }
  });

  const saldo_inicial = { efectivo: 0, qr: 0 };
  saldos.forEach((s) => { saldo_inicial[s.metodo] = num(s.saldo); });

  return { mes: filtros.mes, desde, hasta, dias, hoy: hoyBolivia(), saldo_inicial, filas, grupos: GRUPOS, categorias: CATEGORIAS };
}

// ── Movimientos anotados a mano ────────────────────────────────────────────

// Los que se pueden editar desde el flujo: anotados fuera de una caja, con
// categoría que no llena el sistema.
// Los pagos de sueldo se anotan y anulan desde Equipo › Sueldos.
const DONDE_MANUAL = {
  sesion_caja_id: null, compra_id: null, categoria: { [Op.ne]: null },
  id: { [Op.notIn]: sequelize.literal('(SELECT libro_caja_id FROM pagos_personal WHERE libro_caja_id IS NOT NULL)') },
};

function _verificarAlcance(mov, alcance) {
  if (alcance && !alcance.acceso_todas && mov.sucursal_id && mov.sucursal_id !== alcance.sucursal_id) {
    throw error('Movimiento no encontrado', 404);
  }
}

async function listarMovimientos(filtros = {}, alcance) {
  const { desde, hasta } = _rangoMes(filtros.mes);
  const suc = _sucursal(filtros, alcance);
  const where = { ...DONDE_MANUAL, fecha: { [Op.between]: [desde, hasta] } };
  if (suc) where[Op.or] = [{ sucursal_id: suc }, { sucursal_id: null }];
  const lista = await LibroCaja.findAll({
    where,
    include: [{ model: Usuario, as: 'usuario', attributes: ['id', 'nombre'] }],
    order: [['fecha', 'DESC'], ['id', 'DESC']],
  });
  // Un traspaso son dos filas (sale de un medio, entra al otro): se muestra una.
  return lista.filter((m) => !(m.categoria === 'traspaso' && m.tipo === 'ingreso')).map((m) => {
    const j = m.toJSON();
    if (j.categoria === 'traspaso') j.destino = j.metodo_pago === 'efectivo' ? 'qr' : 'efectivo';
    return j;
  });
}

// `actual`: la categoría que ya tenía el movimiento (al editar se puede
// dejar aunque se haya ocultado).
async function _validar(datos, actual) {
  const cat = (await cargar()).POR_CLAVE[datos.categoria];
  if (!cat || cat.auto) throw error('Elige una categoría');
  if (!cat.activo && cat.clave !== actual) throw error('Esa categoría está oculta: elige otra');
  if (!FECHA.test(datos.fecha || '')) throw error('Elige el día');
  if (datos.fecha > hoyBolivia()) throw error('El día todavía no llegó');
  if (datos.fecha < '2000-01-01') throw error('Día inválido');
  const monto = Math.round(Number(datos.monto) * 100) / 100;
  if (!(monto > 0) || monto > 10000000) throw error('Monto inválido');
  const metodo = datos.metodo_pago === 'qr' ? 'qr' : 'efectivo';
  const detalle = String(datos.detalle ?? '').trim().slice(0, 120) || null;
  const grupo = GRUPOS.find((g) => g.clave === cat.grupo);
  let tipo = grupo.tipo;
  if (tipo === 'ajuste') {
    if (!['ingreso', 'egreso'].includes(datos.tipo)) throw error('Elige si el ajuste suma o resta');
    tipo = datos.tipo;
  }
  const concepto = `${cat.nombre}${detalle ? ` · ${detalle}` : ''}`.slice(0, 255);
  return { cat, tipo, monto, metodo, detalle, concepto, fecha: datos.fecha };
}

async function crearMovimiento(usuario_id, datos, alcance) {
  const v = await _validar(datos);
  const base = { usuario_id, sucursal_id: alcance?.sucursal_id ?? null, categoria: v.cat.clave, detalle: v.detalle, fecha: v.fecha, concepto: v.concepto, monto: v.monto };
  const creado = await sequelize.transaction(async (t) => {
    if (v.tipo === 'traspaso') {
      const destino = v.metodo === 'efectivo' ? 'qr' : 'efectivo';
      const sale = await LibroCaja.create({ ...base, tipo: 'egreso', metodo_pago: v.metodo }, { transaction: t });
      const entra = await LibroCaja.create({ ...base, tipo: 'ingreso', metodo_pago: destino, referencia_id: sale.id }, { transaction: t });
      await sale.update({ referencia_id: entra.id }, { transaction: t });
      return sale;
    }
    return LibroCaja.create({ ...base, tipo: v.tipo, metodo_pago: v.metodo }, { transaction: t });
  });
  emitir('restaurante:actualizar', { tipo: 'flujo_caja' }, alcance?.sucursal_id);
  return creado;
}

async function _manual(id, alcance, t) {
  // Op.and: DONDE_MANUAL también filtra por id (excluye los pagos de sueldo).
  const mov = await LibroCaja.findOne({ where: { [Op.and]: [{ id }, DONDE_MANUAL] }, transaction: t });
  if (!mov || (await cargar()).POR_CLAVE[mov.categoria]?.auto) throw error('Movimiento no encontrado', 404);
  _verificarAlcance(mov, alcance);
  // De un traspaso se edita/borra el par completo.
  const par = mov.categoria === 'traspaso' && mov.referencia_id
    ? await LibroCaja.findOne({ where: { id: mov.referencia_id, categoria: 'traspaso' }, transaction: t })
    : null;
  return { mov, par };
}

async function editarMovimiento(id, datos, alcance) {
  await sequelize.transaction(async (t) => {
    const { mov, par } = await _manual(id, alcance, t);
    const v = await _validar(datos, mov.categoria);
    const eraTraspaso = mov.categoria === 'traspaso';
    if (eraTraspaso !== (v.tipo === 'traspaso')) throw error('Un traspaso no se puede cambiar a otra categoría: bórralo y anótalo de nuevo');
    const comun = { categoria: v.cat.clave, detalle: v.detalle, fecha: v.fecha, concepto: v.concepto, monto: v.monto };
    if (eraTraspaso) {
      const sale = mov.tipo === 'egreso' ? mov : par;
      const entra = mov.tipo === 'egreso' ? par : mov;
      await sale.update({ ...comun, metodo_pago: v.metodo }, { transaction: t });
      if (entra) await entra.update({ ...comun, metodo_pago: v.metodo === 'efectivo' ? 'qr' : 'efectivo' }, { transaction: t });
    } else {
      await mov.update({ ...comun, tipo: v.tipo, metodo_pago: v.metodo }, { transaction: t });
    }
  });
  emitir('restaurante:actualizar', { tipo: 'flujo_caja' }, alcance?.sucursal_id);
  return LibroCaja.findByPk(id);
}

async function eliminarMovimiento(id, alcance) {
  await sequelize.transaction(async (t) => {
    const { mov, par } = await _manual(id, alcance, t);
    if (par) await par.destroy({ transaction: t });
    await mov.destroy({ transaction: t });
  });
  emitir('restaurante:actualizar', { tipo: 'flujo_caja' }, alcance?.sucursal_id);
}

module.exports = { obtener, listarMovimientos, crearMovimiento, editarMovimiento, eliminarMovimiento };
