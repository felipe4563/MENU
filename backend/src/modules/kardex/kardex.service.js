// Kardex: entradas, salidas y saldo de cada insumo (insumo_movimientos) y de
// cada producto con stock (registros_inventario), valorizado a costo
// promedio ponderado:
// - Una compra entra a su costo (detalle_compras.costo_unitario).
// - Otras entradas (conteo que sobra, entrada manual) entran al costo
//   promedio del momento; si todavía no hay, al de la primera compra.
// - Toda salida (venta, conteo que falta, salida manual) sale al promedio.
// - El promedio cambia solo con las entradas: (valor del saldo + valor de
//   la entrada) ÷ (saldo + cantidad que entra).
// La cantidad de cada movimiento sale de stock_nuevo − stock_anterior, así
// un ajuste (que guarda el stock contado) cuenta como la diferencia.
const { QueryTypes } = require('sequelize');
const sequelize = require('../../config/database');

const error = (mensaje, status = 400) => Object.assign(new Error(mensaje), { status });
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const r2 = (n) => Math.round(n * 100) / 100;
const r3 = (n) => Math.round(n * 1000) / 1000;
const r4 = (n) => Math.round(n * 10000) / 10000;
const hoyBolivia = () => new Date(Date.now() - 4 * 3600000).toISOString().slice(0, 10);
const CLASES = ['insumo', 'producto'];
const PERMISO = { insumo: 'insumos.ver', producto: 'inventario.ver' };
const UNIDAD_CORTA = { kilogramo: 'kg', gramo: 'g', litro: 'L', mililitro: 'ml', arroba: '@', libra: 'lb', unidad: 'u' };

// ── Lectura ────────────────────────────────────────────────────────────────

function _sucursal(filtros, alcance) {
  if (alcance && !alcance.acceso_todas) return alcance.sucursal_id;
  return filtros.sucursal_id ? Number(filtros.sucursal_id) : null;
}

function _rango(filtros) {
  const hasta = filtros.hasta || hoyBolivia();
  const desde = filtros.desde || `${hasta.slice(0, 7)}-01`;
  if (!FECHA.test(desde) || !FECHA.test(hasta)) throw error('Fechas inválidas (usa AAAA-MM-DD)');
  if (desde > hasta) throw error('La fecha inicial es posterior a la final');
  return { desde, hasta };
}

const SQL_MOVS = {
  insumo: `SELECT m.id, m.insumo_id AS item_id, m.tipo, m.stock_anterior, m.stock_nuevo, m.nota,
                  DATE_FORMAT(m.creado_en, '%Y-%m-%d %H:%i:%s') AS fecha, u.nombre AS usuario
           FROM insumo_movimientos m LEFT JOIN usuarios u ON u.id = m.usuario_id
           WHERE (:suc IS NULL OR m.sucursal_id = :suc) AND (:item IS NULL OR m.insumo_id = :item)
           ORDER BY m.creado_en, m.id`,
  producto: `SELECT m.id, m.producto_id AS item_id, m.tipo, m.stock_anterior, m.stock_nuevo, m.nota,
                    DATE_FORMAT(m.creado_en, '%Y-%m-%d %H:%i:%s') AS fecha, u.nombre AS usuario
             FROM registros_inventario m LEFT JOIN usuarios u ON u.id = m.usuario_id
             WHERE (:suc IS NULL OR m.sucursal_id = :suc) AND (:item IS NULL OR m.producto_id = :item)
             ORDER BY m.creado_en, m.id`,
};

const SQL_ITEMS = {
  insumo: `SELECT id, nombre, unidad_medida AS unidad, stock_minimo, activo FROM insumos`,
  producto: `SELECT p.id, p.nombre, 'unidad' AS unidad, NULL AS stock_minimo, p.activo
             FROM productos p WHERE p.stock IS NOT NULL OR EXISTS (SELECT 1 FROM registros_inventario r WHERE r.producto_id = p.id)`,
};

// Costo de cada compra por ítem (si el mismo ítem viene en varias líneas, el promedio).
async function _compras(clase, item) {
  const col = clase === 'insumo' ? 'insumo_id' : 'producto_id';
  const filas = await sequelize.query(`
    SELECT dc.compra_id, dc.${col} AS item_id, SUM(dc.cantidad) AS cantidad, SUM(dc.subtotal) AS subtotal,
           COALESCE(pr.nombre, c.notas) AS de
    FROM detalle_compras dc
    JOIN compras c ON c.id = dc.compra_id
    LEFT JOIN proveedores pr ON pr.id = c.proveedor_id
    WHERE dc.${col} IS NOT NULL AND (:item IS NULL OR dc.${col} = :item)
    GROUP BY dc.compra_id, dc.${col}, de
    ORDER BY dc.compra_id`, { replacements: { item }, type: QueryTypes.SELECT });
  const costo = new Map(); // `${compra}:${item}` → costo unitario
  const de = new Map(); // compra → proveedor
  const primera = new Map(); // item → costo de su primera compra
  filas.forEach((f) => {
    const cu = Number(f.cantidad) > 0 ? Number(f.subtotal) / Number(f.cantidad) : 0;
    costo.set(`${f.compra_id}:${f.item_id}`, cu);
    if (f.de) de.set(Number(f.compra_id), f.de);
    if (!primera.has(f.item_id) && cu > 0) primera.set(f.item_id, cu);
  });
  return { costo, de, primera };
}

const _compraDe = (nota) => {
  const m = /^Compra #(\d+)/.exec(nota || '');
  return m ? Number(m[1]) : null;
};

function _detalle(m, delta, compras) {
  const compra = _compraDe(m.nota);
  if (compra) return `Compra #${compra}${compras.de.get(compra) ? ` · ${compras.de.get(compra)}` : ''}`;
  if (m.tipo === 'ajuste') {
    if (Number(m.stock_anterior) === 0 && /inicial/i.test(m.nota || '')) return 'Inventario inicial';
    const dif = delta > 0 ? 'sobró' : delta < 0 ? 'faltó' : 'sin diferencia';
    return `${m.nota && !/inicial/i.test(m.nota) ? m.nota : 'Conteo de inventario'} (${dif})`;
  }
  if (m.tipo === 'entrada') return m.nota ? `Entrada · ${m.nota}` : 'Entrada manual';
  if (m.tipo === 'salida') return m.nota ? `Salida · ${m.nota}` : 'Salida manual';
  return m.nota || (m.tipo === 'consumo_venta' || m.tipo === 'venta' ? 'Venta' : m.tipo);
}

// Tipo de movimiento para los totales: compra, venta, ajuste, otro.
function _motivo(m) {
  if (_compraDe(m.nota) || m.tipo === 'compra') return 'compra';
  if (m.tipo === 'consumo_venta' || m.tipo === 'venta') return 'venta';
  if (m.tipo === 'ajuste') return 'ajuste';
  return 'manual';
}

/** Recorre los movimientos de un ítem en orden y valoriza cada uno. */
function _valorizar(movs, compras, itemId) {
  let saldo = 0;
  let valor = 0;
  let promedio = compras.primera.get(itemId) ?? 0;
  const filas = [];
  movs.forEach((m, i) => {
    if (i === 0) { saldo = Number(m.stock_anterior); valor = saldo * promedio; }
    const delta = Number(m.stock_nuevo) - Number(m.stock_anterior);
    const compra = _compraDe(m.nota);
    let costo;
    if (delta > 0) {
      const deCompra = compra != null ? compras.costo.get(`${compra}:${itemId}`) : undefined;
      costo = deCompra ?? (promedio || compras.primera.get(itemId) || 0);
      const nuevoSaldo = saldo + delta;
      valor += delta * costo;
      promedio = nuevoSaldo > 0.0005 && valor > 0 ? valor / nuevoSaldo : costo;
      saldo = nuevoSaldo;
    } else {
      costo = promedio;
      saldo += delta;
      valor = saldo > 0.0005 ? valor + delta * promedio : saldo * promedio;
    }
    filas.push({
      id: m.id, fecha: m.fecha, tipo: m.tipo, motivo: _motivo(m), detalle: _detalle(m, delta, compras), usuario: m.usuario,
      entrada: delta > 0 ? r3(delta) : 0, salida: delta < 0 ? r3(-delta) : 0, saldo: r3(saldo),
      costo_unitario: r4(costo), entrada_valor: delta > 0 ? r2(delta * costo) : 0, salida_valor: delta < 0 ? r2(-delta * costo) : 0,
      saldo_valor: r2(valor), costo_promedio: r4(promedio),
    });
  });
  return filas;
}

// Saldo inicial, movimientos del período y totales, a partir de las filas valorizadas.
function _periodo(filas, desde, hasta) {
  const antes = filas.filter((f) => f.fecha.slice(0, 10) < desde);
  const dentro = filas.filter((f) => f.fecha.slice(0, 10) >= desde && f.fecha.slice(0, 10) <= hasta);
  const ult = antes[antes.length - 1];
  const inicial = { cantidad: ult?.saldo ?? 0, valor: ult?.saldo_valor ?? 0, costo_promedio: ult?.costo_promedio ?? (filas[0]?.costo_promedio ?? 0) };
  const fin = dentro[dentro.length - 1];
  const final = fin ? { cantidad: fin.saldo, valor: fin.saldo_valor, costo_promedio: fin.costo_promedio } : { ...inicial };
  const suma = (k, motivo) => r2(dentro.filter((f) => !motivo || f.motivo === motivo).reduce((t, f) => t + f[k], 0));
  const sumaQ = (k) => r3(dentro.reduce((t, f) => t + f[k], 0));
  return {
    inicial, final, movimientos: dentro,
    totales: {
      entradas: sumaQ('entrada'), salidas: sumaQ('salida'), entradas_valor: suma('entrada_valor'), salidas_valor: suma('salida_valor'),
      compras_valor: suma('entrada_valor', 'compra'), ventas_valor: suma('salida_valor', 'venta'),
      // Diferencias de conteo: lo que sobró menos lo que faltó.
      ajustes_valor: r2(suma('entrada_valor', 'ajuste') - suma('salida_valor', 'ajuste')),
      manual_valor: r2(suma('entrada_valor', 'manual') - suma('salida_valor', 'manual')),
      cantidad: dentro.length,
    },
  };
}

const _clasesPermitidas = (permisos = []) => CLASES.filter((c) => permisos.includes(PERMISO[c]));

// ── Público ────────────────────────────────────────────────────────────────

/** Resumen valorizado de todo el inventario en el período. */
async function resumen(filtros = {}, alcance, permisos) {
  const { desde, hasta } = _rango(filtros);
  const suc = _sucursal(filtros, alcance);
  const pedidas = filtros.clase && CLASES.includes(filtros.clase) ? [filtros.clase] : CLASES;
  const clases = _clasesPermitidas(permisos).filter((c) => pedidas.includes(c));
  const items = [];
  for (const clase of clases) {
    const [lista, movs, compras] = await Promise.all([
      sequelize.query(SQL_ITEMS[clase], { type: QueryTypes.SELECT }),
      sequelize.query(SQL_MOVS[clase], { replacements: { suc, item: null }, type: QueryTypes.SELECT }),
      _compras(clase, null),
    ]);
    const porItem = new Map();
    movs.forEach((m) => { if (!porItem.has(m.item_id)) porItem.set(m.item_id, []); porItem.get(m.item_id).push(m); });
    for (const it of lista) {
      const propios = porItem.get(it.id) ?? [];
      if (!propios.length && !it.activo) continue;
      const p = _periodo(_valorizar(propios, compras, it.id), desde, hasta);
      items.push({
        clase, id: it.id, nombre: it.nombre, unidad: UNIDAD_CORTA[it.unidad] ?? it.unidad, activo: !!it.activo,
        stock_minimo: it.stock_minimo == null ? null : Number(it.stock_minimo),
        inicial: p.inicial, final: p.final, totales: p.totales,
      });
    }
  }
  items.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  const total = (fn) => r2(items.reduce((t, i) => t + fn(i), 0));
  return {
    desde, hasta, clases, items,
    totales: {
      inicial_valor: total((i) => i.inicial.valor), final_valor: total((i) => i.final.valor),
      compras_valor: total((i) => i.totales.compras_valor), ventas_valor: total((i) => i.totales.ventas_valor),
      ajustes_valor: total((i) => i.totales.ajustes_valor), manual_valor: total((i) => i.totales.manual_valor),
      entradas_valor: total((i) => i.totales.entradas_valor), salidas_valor: total((i) => i.totales.salidas_valor),
    },
  };
}

/** Kardex de un ítem: saldo inicial, cada movimiento del período valorizado, totales. */
async function detalle(clase, id, filtros = {}, alcance, permisos) {
  if (!CLASES.includes(clase)) throw error('Tipo inválido', 404);
  if (!_clasesPermitidas(permisos).includes(clase)) throw error(`Sin permiso: ${PERMISO[clase]}`, 403);
  const { desde, hasta } = _rango(filtros);
  const suc = _sucursal(filtros, alcance);
  const item = (await sequelize.query(`${SQL_ITEMS[clase]} ${clase === 'insumo' ? 'WHERE' : 'AND'} ${clase === 'insumo' ? 'id' : 'p.id'} = :id`, { replacements: { id }, type: QueryTypes.SELECT }))[0];
  if (!item) throw error('No encontrado', 404);
  const [movs, compras] = await Promise.all([
    sequelize.query(SQL_MOVS[clase], { replacements: { suc, item: id }, type: QueryTypes.SELECT }),
    _compras(clase, id),
  ]);
  const p = _periodo(_valorizar(movs, compras, id), desde, hasta);
  return {
    clase, desde, hasta,
    item: { id: item.id, nombre: item.nombre, unidad: UNIDAD_CORTA[item.unidad] ?? item.unidad, stock_minimo: item.stock_minimo == null ? null : Number(item.stock_minimo) },
    ...p,
  };
}

module.exports = { resumen, detalle, _valorizar };
