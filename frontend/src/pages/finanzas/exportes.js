// Qué lleva cada reporte al exportarlo a PDF o imprimirlo (hoja carta).
// Siempre trae TODOS los datos del rango (limite: 0), no solo la página que
// se está viendo en pantalla.
import { getReporteVentasResumen, getReporteVentasProductos, getReporteVentas, getReporteFinanzasResumen, getReporteFinanzasSerie, getReporteArqueos, getGananciaPlatos } from '../../api/reportes';
import { getLibroCaja, getResumenLibroCaja } from '../../api/libroCaja';
import { MOTIVOS_DEVOLUCION } from '../../utils/ticketDevolucion';
import { etiquetaDestino } from '../vender/datosCatalogo';
import { dinero, fechaHora } from '../../lib/util';

const METODO = { efectivo: 'Efectivo', qr: 'QR', app_externa: 'App' };
const n = (v) => Number(v || 0);
const dia = (f) => new Date(`${f}T12:00`).toLocaleDateString('es-BO', { weekday: 'short', day: '2-digit', month: '2-digit' });

export async function armarVentas(rango, moneda) {
  const unDia = rango.desde === rango.hasta;
  const [d, productos, serie, ventas] = await Promise.all([
    getReporteVentasResumen(rango),
    getReporteVentasProductos(rango),
    unDia ? Promise.resolve([]) : getReporteFinanzasSerie(rango),
    getReporteVentas({ ...rango, limite: 0 }),
  ]);
  const m = (v) => dinero(v, moneda);
  const lista = [...(productos ?? [])].sort((a, b) => b.monto - a.monto);
  const totalProd = lista.reduce((t, x) => t + x.monto, 0) || 1;
  const filasVentas = ventas?.filas ?? [];
  const secciones = [];
  if (!unDia) {
    secciones.push({
      titulo: 'Ventas por día',
      columnas: [{ titulo: 'Día' }, { titulo: 'Vendido', derecha: true }],
      filas: (serie ?? []).filter((x) => n(x.ingresos) > 0).map((x) => [dia(x.fecha), m(x.ingresos)]),
    });
  }
  secciones.push(
    {
      titulo: 'Cómo te pagaron',
      columnas: [{ titulo: 'Forma de pago' }, { titulo: 'Monto', derecha: true }],
      filas: [['Efectivo', m(d?.ventas_efectivo)], ['QR', m(d?.ventas_qr)], ['Apps de delivery', m(d?.ventas_app_externa)]],
      pie: ['Total', m(n(d?.ventas_efectivo) + n(d?.ventas_qr) + n(d?.ventas_app_externa))],
    },
    {
      titulo: 'Productos vendidos',
      columnas: [{ titulo: '#' }, { titulo: 'Producto' }, { titulo: 'Cantidad', derecha: true }, { titulo: 'Monto', derecha: true }, { titulo: '% de ventas', derecha: true }],
      filas: lista.map((x, i) => [i + 1, x.nombre + (x.tipo === 'combo' ? ' (combo)' : ''), `${x.cantidad}${x.unidad === 'kg' ? ' kg' : ''}`, m(x.monto), `${((x.monto / totalProd) * 100).toFixed(1)}%`]),
    },
  );
  if ((d?.devoluciones_por_motivo ?? []).length) {
    secciones.push({
      titulo: 'Devoluciones',
      columnas: [{ titulo: 'Motivo' }, { titulo: 'Monto', derecha: true }],
      filas: d.devoluciones_por_motivo.map((x) => [MOTIVOS_DEVOLUCION[x.motivo] ?? x.motivo, m(x.monto)]),
      pie: ['Total devuelto', m(d.total_devoluciones)],
    });
  }
  secciones.push({
    titulo: `Todas las ventas (${filasVentas.length})`,
    columnas: [{ titulo: 'N°' }, { titulo: 'Fecha' }, { titulo: 'Destino' }, { titulo: 'Cobró' }, { titulo: 'Pago' }, { titulo: 'Total', derecha: true }],
    filas: filasVentas.map((v) => [v.id, fechaHora(v.creado_en), etiquetaDestino(v), v.usuario?.nombre ?? '-', METODO[v.metodo_pago] ?? v.metodo_pago, m(v.total)]),
    pie: ['', '', '', '', 'Total', m(filasVentas.reduce((t, v) => t + n(v.total), 0))],
  });
  return {
    titulo: 'Reporte de ventas',
    rango,
    resumen: [
      { etiqueta: 'Ventas netas', valor: m(d?.ventas_netas) },
      { etiqueta: 'Pedidos', valor: d?.cantidad ?? 0 },
      { etiqueta: 'Por pedido', valor: m(d?.cantidad ? n(d.ventas_netas) / d.cantidad : 0) },
      { etiqueta: 'Devuelto', valor: m(d?.total_devoluciones) },
    ],
    secciones,
  };
}

export async function armarResultado(rango, moneda) {
  const [d, serie] = await Promise.all([getReporteFinanzasResumen(rango), getReporteFinanzasSerie(rango)]);
  const m = (v) => dinero(v, moneda);
  const filas = serie ?? [];
  const tot = (k) => filas.reduce((t, x) => t + n(x[k]), 0);
  return {
    titulo: 'Ganancia del periodo',
    rango,
    resumen: [
      { etiqueta: 'Ingresos', valor: m(d?.ingresos) },
      { etiqueta: 'Gastos de caja', valor: m(d?.gastos_operativos) },
      { etiqueta: 'Compras', valor: m(d?.compras) },
      { etiqueta: 'Resultado', valor: m(d?.resultado_neto) },
    ],
    secciones: [{
      titulo: 'Día por día',
      vacio: 'Sin movimientos en estas fechas.',
      columnas: [{ titulo: 'Día' }, { titulo: 'Ingresos', derecha: true }, { titulo: 'Gastos', derecha: true }, { titulo: 'Compras', derecha: true }, { titulo: 'Resultado', derecha: true }],
      filas: filas.map((x) => [dia(x.fecha), m(x.ingresos), m(x.gastos_operativos), m(x.compras), m(n(x.ingresos) - n(x.gastos_operativos) - n(x.compras))]),
      pie: ['Total', m(tot('ingresos')), m(tot('gastos_operativos')), m(tot('compras')), m(tot('ingresos') - tot('gastos_operativos') - tot('compras'))],
    }],
  };
}

export async function armarArqueos(rango, moneda) {
  const r = await getReporteArqueos({ ...rango, limite: 0 });
  const filas = r?.filas ?? [];
  const m = (v) => dinero(v, moneda);
  const difTotal = filas.reduce((t, s) => t + n(s.diferencia), 0);
  return {
    titulo: 'Cierres de caja',
    rango,
    resumen: [
      { etiqueta: 'Cierres', valor: filas.length },
      { etiqueta: 'Contado en total', valor: m(filas.reduce((t, s) => t + n(s.monto_cierre), 0)) },
      { etiqueta: 'Diferencia acumulada', valor: `${difTotal > 0 ? '+' : ''}${difTotal.toFixed(2)}` },
      { etiqueta: 'Fuera de tolerancia', valor: filas.filter((s) => s.fuera_de_tolerancia).length },
    ],
    secciones: [{
      titulo: 'Detalle de cierres',
      vacio: 'Sin cierres de caja en estas fechas.',
      columnas: [{ titulo: 'Cierre' }, { titulo: 'Cajero' }, { titulo: 'Motivo de diferencia' }, { titulo: 'Esperado', derecha: true }, { titulo: 'Contado', derecha: true }, { titulo: 'Diferencia', derecha: true }],
      filas: filas.map((s) => {
        const dif = n(s.diferencia);
        return [fechaHora(s.cerrado_en), s.usuario?.nombre ?? '-', s.nota_diferencia ?? '', m(n(s.monto_cierre) - dif), m(s.monto_cierre), `${dif > 0 ? '+' : ''}${dif.toFixed(2)}`];
      }),
    }],
  };
}

export async function armarLibro(filtros, moneda) {
  const [res, lista] = await Promise.all([getResumenLibroCaja(filtros), getLibroCaja({ ...filtros, limite: 0 })]);
  const m = (v) => dinero(v, moneda);
  const filas = lista?.filas ?? [];
  const ingresos = n(res?.total_ingresos);
  const egresos = n(res?.total_egresos);
  return {
    titulo: 'Libro de caja',
    rango: { desde: filtros.desde, hasta: filtros.hasta },
    resumen: [
      { etiqueta: 'Entró', valor: m(ingresos) },
      { etiqueta: 'Salió', valor: m(egresos) },
      { etiqueta: 'Saldo', valor: m(ingresos - egresos) },
      { etiqueta: 'Movimientos', valor: filas.length },
    ],
    secciones: [{
      titulo: filtros.tipo === 'ingreso' ? 'Entradas' : filtros.tipo === 'egreso' ? 'Salidas' : 'Movimientos',
      vacio: 'Sin movimientos en estas fechas.',
      columnas: [{ titulo: 'Fecha' }, { titulo: 'Concepto' }, { titulo: 'Medio' }, { titulo: 'Usuario' }, { titulo: 'Entrada', derecha: true }, { titulo: 'Salida', derecha: true }],
      filas: filas.map((x) => [fechaHora(x.creado_en), x.concepto, METODO[x.metodo_pago] ?? x.metodo_pago, x.usuario?.nombre ?? '-', x.tipo === 'ingreso' ? m(x.monto) : '', x.tipo === 'egreso' ? m(x.monto) : '']),
      pie: ['', '', '', 'Total', m(filas.filter((x) => x.tipo === 'ingreso').reduce((t, x) => t + n(x.monto), 0)), m(filas.filter((x) => x.tipo === 'egreso').reduce((t, x) => t + n(x.monto), 0))],
    }],
  };
}

export async function armarGananciaPlatos(rango, moneda) {
  const d = await getGananciaPlatos(rango);
  const m = (v) => (v == null ? '-' : dinero(v, moneda));
  const res = d?.resumen ?? {};
  const platos = d?.platos ?? [];
  const conCosto = platos.filter((p) => p.costo != null).sort((a, b) => b.ganancia_total - a.ganancia_total);
  const sinCosto = platos.filter((p) => p.costo == null && p.ventas > 0).sort((a, b) => b.ventas - a.ventas);
  return {
    titulo: 'Ganancia por plato',
    rango,
    resumen: [
      { etiqueta: 'Vendido (con costo)', valor: m(res.ventas) },
      { etiqueta: 'Costo de ingredientes', valor: m(res.costo) },
      { etiqueta: 'Ganancia sobre ingredientes', valor: m(res.ganancia) },
      { etiqueta: 'Se va en ingredientes', valor: res.costo_pct == null ? '-' : `${res.costo_pct}%` },
    ],
    secciones: [
      {
        titulo: 'Platos con costo',
        vacio: 'Todavía no hay platos con receta y compras cargadas.',
        columnas: [{ titulo: 'Plato' }, { titulo: 'Precio', derecha: true }, { titulo: 'Costo', derecha: true }, { titulo: 'Ganas c/u', derecha: true }, { titulo: '% costo', derecha: true }, { titulo: 'Vendidos', derecha: true }, { titulo: 'Ganancia', derecha: true }],
        filas: conCosto.map((p) => [p.nombre, m(p.precio), m(p.costo), m(p.ganancia_unitaria), p.costo_pct == null ? '-' : `${p.costo_pct}%`, p.vendidos, m(p.ganancia_total)]),
        pie: ['Total', '', '', '', '', conCosto.reduce((t, p) => t + n(p.vendidos), 0), m(conCosto.reduce((t, p) => t + n(p.ganancia_total), 0))],
      },
      {
        titulo: 'Vendidos sin costo cargado',
        vacio: 'Todos los platos vendidos tienen costo.',
        columnas: [{ titulo: 'Plato' }, { titulo: 'Por qué no tiene costo' }, { titulo: 'Vendidos', derecha: true }, { titulo: 'Vendido', derecha: true }],
        filas: sinCosto.map((p) => [p.nombre, p.motivo ?? '', p.vendidos, m(p.ventas)]),
      },
    ],
  };
}
