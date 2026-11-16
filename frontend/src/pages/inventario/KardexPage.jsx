// Inventario › Kardex: entradas, salidas y saldo de cada insumo y bebida,
// valorizado a costo promedio ponderado (lo calcula el servidor). Arriba el
// resumen de todo el inventario en el período; al tocar un ítem, su kardex
// movimiento por movimiento.
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { ScrollText } from 'lucide-react';
import { getKardex, getKardexItem } from '../../api/kardex';
import { usePermisos } from '../../hooks/usePermisos';
import { useMoneda } from '../../hooks/useConfig';
import Hoja from '../../components/ui/Hoja';
import { Buscador, Cargando, Encabezado, Insignia, Pagina, Segmentado, SinPermiso, Vacio } from '../../components/ui/piezas';
import { BotonCsv, BotonExportar, SelectorRango, exportarCsv, useRango } from '../finanzas/comun';
import { cx, dinero, normalizar } from '../../lib/util';

const cant = (n) => Number(n || 0).toLocaleString('es-BO', { maximumFractionDigits: 3 });
// 'AAAA-MM-DD' solo se leería como medianoche UTC (el día anterior en Bolivia).
const fechaCorta = (f) => new Date(f.length === 10 ? `${f}T12:00:00` : f.replace(' ', 'T')).toLocaleDateString('es-BO', { day: '2-digit', month: 'short' });
const horaDe = (f) => (f.length > 10 ? f.slice(11, 16) : '');
// Montos sin símbolo dentro de la tabla (la columna ya dice la moneda).
const bs = (n) => dinero(n, '').trim();
const CLASE = { insumo: 'Insumo', producto: 'Bebida / producto' };

function Kpi({ etiqueta, valor, tono, nota }) {
  return (
    <div className="ficha p-4">
      <p className="text-[13px] text-tenue">{etiqueta}</p>
      <p className={cx('num text-2xl font-extrabold mt-1 leading-none', tono)}>{valor}</p>
      {nota && <p className="text-xs text-tenue mt-1.5">{nota}</p>}
    </div>
  );
}

// Junta las ventas de un mismo día en una sola fila (un plato = una fila es
// demasiado para leer un mes).
function juntarVentas(movs) {
  const out = [];
  for (const m of movs) {
    const prev = out[out.length - 1];
    const dia = m.fecha.slice(0, 10);
    if (m.motivo === 'venta' && prev?.motivo === 'venta' && prev.fecha.slice(0, 10) === dia) {
      prev.salida += m.salida; prev.entrada += m.entrada;
      prev.salida_valor += m.salida_valor; prev.entrada_valor += m.entrada_valor;
      prev.saldo = m.saldo; prev.saldo_valor = m.saldo_valor; prev.costo_promedio = m.costo_promedio;
      prev.ventas += 1;
      prev.detalle = `Ventas del día (${prev.ventas})`;
      prev.costo_unitario = prev.salida ? prev.salida_valor / prev.salida : m.costo_unitario;
      prev.fecha = dia;
    } else out.push({ ...m, ventas: 1 });
  }
  return out;
}

// ── PDF e impresión (hoja carta apaisada, ver utils/reporteDocumento.js) ──

const signo = (v) => (v > 0 ? '+' : v < 0 ? '−' : '');

function reporteResumen(d, items, rango, moneda) {
  const m = (v) => dinero(v, moneda);
  const t = d.totales;
  const seccion = (clase, titulo) => {
    const lista = items.filter((i) => i.clase === clase);
    return {
      titulo, vacio: 'Sin ítems.',
      columnas: [{ titulo: 'Ítem' }, { titulo: 'Saldo inicial', derecha: true }, { titulo: 'Valor inicial', derecha: true }, { titulo: 'Entradas', derecha: true },
        { titulo: 'Salidas', derecha: true }, { titulo: 'Saldo final', derecha: true }, { titulo: 'Costo prom.', derecha: true }, { titulo: 'Valor final', derecha: true }],
      filas: lista.map((i) => [i.nombre, `${cant(i.inicial.cantidad)} ${i.unidad}`, m(i.inicial.valor), i.totales.entradas ? `+${cant(i.totales.entradas)}` : '',
        i.totales.salidas ? `−${cant(i.totales.salidas)}` : '', `${cant(i.final.cantidad)} ${i.unidad}`, m(i.final.costo_promedio), m(i.final.valor)]),
      pie: [`Total (${lista.length})`, '', m(lista.reduce((s, i) => s + i.inicial.valor, 0)), '', '', '', '', m(lista.reduce((s, i) => s + i.final.valor, 0))],
    };
  };
  const clases = [...new Set(items.map((i) => i.clase))];
  return {
    titulo: 'Kardex valorizado', rango, horizontal: true,
    resumen: [
      { etiqueta: 'Valor del inventario', valor: m(t.final_valor) },
      { etiqueta: 'Compras que entraron', valor: m(t.compras_valor) },
      { etiqueta: 'Consumo en ventas', valor: m(t.ventas_valor) },
      { etiqueta: 'Diferencias de conteo', valor: `${signo(t.ajustes_valor)}${m(Math.abs(t.ajustes_valor))}` },
    ],
    secciones: [
      ...(clases.includes('insumo') ? [seccion('insumo', 'Insumos')] : []),
      ...(clases.includes('producto') ? [seccion('producto', 'Bebidas y productos con stock')] : []),
    ],
  };
}

function reporteItem(d, filas, rango, moneda) {
  const u = d.item.unidad;
  return {
    titulo: `Kardex · ${d.item.nombre}`, rango, horizontal: true,
    resumen: [
      { etiqueta: `Saldo inicial (${u})`, valor: `${cant(d.inicial.cantidad)} · ${dinero(d.inicial.valor, moneda)}` },
      { etiqueta: `Entradas (${u})`, valor: `${cant(d.totales.entradas)} · ${dinero(d.totales.entradas_valor, moneda)}` },
      { etiqueta: `Salidas (${u})`, valor: `${cant(d.totales.salidas)} · ${dinero(d.totales.salidas_valor, moneda)}` },
      { etiqueta: `Saldo final (${u})`, valor: `${cant(d.final.cantidad)} · ${dinero(d.final.valor, moneda)}` },
    ],
    secciones: [{
      titulo: `Movimientos · costo promedio ponderado · cantidades en ${u}, valores en ${moneda}`,
      columnas: [{ titulo: 'Fecha' }, { titulo: 'Detalle' }, { titulo: 'Entra', derecha: true }, { titulo: 'Sale', derecha: true }, { titulo: 'Saldo', derecha: true },
        { titulo: 'Costo u.', derecha: true }, { titulo: 'Entra Bs', derecha: true }, { titulo: 'Sale Bs', derecha: true }, { titulo: 'Saldo Bs', derecha: true }],
      filas: [
        [fechaCorta(rango.desde), 'Saldo inicial', '', '', cant(d.inicial.cantidad), bs(d.inicial.costo_promedio), '', '', bs(d.inicial.valor)],
        ...filas.map((f) => [`${fechaCorta(f.fecha)} ${horaDe(f.fecha)}`.trim(), f.detalle, f.entrada ? cant(f.entrada) : '', f.salida ? cant(f.salida) : '',
          cant(f.saldo), bs(f.costo_unitario), f.entrada_valor ? bs(f.entrada_valor) : '', f.salida_valor ? bs(f.salida_valor) : '', bs(f.saldo_valor)]),
      ],
      pie: ['', 'Totales y saldo final', cant(d.totales.entradas), cant(d.totales.salidas), cant(d.final.cantidad), bs(d.final.costo_promedio),
        bs(d.totales.entradas_valor), bs(d.totales.salidas_valor), bs(d.final.valor)],
    }],
  };
}

function HojaKardex({ clase, id, rango, moneda, onCerrar }) {
  const [juntar, setJuntar] = useState(true);
  const q = useQuery({ queryKey: ['kardex', clase, id, rango], queryFn: () => getKardexItem(clase, id, rango) });
  const d = q.data;
  const filas = useMemo(() => (d ? (juntar ? juntarVentas(d.movimientos) : d.movimientos) : []), [d, juntar]);
  const u = d?.item.unidad ?? '';

  const exportar = () => {
    const cols = [
      { titulo: 'Fecha', valor: (f) => f.fecha }, { titulo: 'Detalle', valor: (f) => f.detalle },
      { titulo: `Entrada (${u})`, valor: (f) => f.entrada || '' }, { titulo: `Salida (${u})`, valor: (f) => f.salida || '' }, { titulo: `Saldo (${u})`, valor: (f) => f.saldo },
      { titulo: 'Costo unitario', valor: (f) => f.costo_unitario }, { titulo: 'Entrada Bs', valor: (f) => f.entrada_valor || '' },
      { titulo: 'Salida Bs', valor: (f) => f.salida_valor || '' }, { titulo: 'Saldo Bs', valor: (f) => f.saldo_valor }, { titulo: 'Costo promedio', valor: (f) => f.costo_promedio },
    ];
    const inicial = { fecha: rango.desde, detalle: 'Saldo inicial', saldo: d.inicial.cantidad, saldo_valor: d.inicial.valor, costo_unitario: d.inicial.costo_promedio, costo_promedio: d.inicial.costo_promedio };
    exportarCsv(`kardex-${d.item.nombre}-${rango.desde}-a-${rango.hasta}`, cols, [inicial, ...filas]);
  };

  return (
    <Hoja onCerrar={onCerrar} ancho="max-w-6xl" titulo={d ? `Kardex · ${d.item.nombre}` : 'Kardex'}
      subtitulo={d ? `${CLASE[clase]} · en ${u} · costo promedio ponderado` : ''}>
      {!d ? <Cargando /> : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi etiqueta="Saldo inicial" valor={`${cant(d.inicial.cantidad)} ${u}`} nota={dinero(d.inicial.valor, moneda)} />
            <Kpi etiqueta="Entradas" valor={`${cant(d.totales.entradas)} ${u}`} tono="text-hierba" nota={dinero(d.totales.entradas_valor, moneda)} />
            <Kpi etiqueta="Salidas" valor={`${cant(d.totales.salidas)} ${u}`} nota={dinero(d.totales.salidas_valor, moneda)} />
            <Kpi etiqueta="Saldo final" valor={`${cant(d.final.cantidad)} ${u}`} tono={d.final.cantidad <= 0 ? 'text-locoto' : ''}
              nota={`${dinero(d.final.valor, moneda)} · ${dinero(d.final.costo_promedio, moneda)} por ${u}`} />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={juntar} onChange={(e) => setJuntar(e.target.checked)} /> Juntar las ventas de cada día</label>
            <span className="text-[13px] text-tenue">{d.totales.cantidad} movimientos en el período</span>
            <span className="ml-auto flex gap-2"><BotonCsv onClick={exportar} /><BotonExportar armar={async () => reporteItem(d, filas, rango, moneda)} /></span>
          </div>
          <div className="ficha overflow-x-auto">
            <table className="w-full text-sm whitespace-nowrap">
              <thead className="text-[12px] text-tenue text-right">
                <tr className="border-b border-linea">
                  <th className="text-left font-medium px-3 py-2" rowSpan={2}>Fecha</th>
                  <th className="text-left font-medium px-3 py-2" rowSpan={2}>Detalle</th>
                  <th className="font-medium px-3 pt-2 text-center border-l border-linea" colSpan={3}>Cantidad ({u})</th>
                  <th className="font-medium px-3 pt-2 border-l border-linea" rowSpan={2}>Costo u.</th>
                  <th className="font-medium px-3 pt-2 text-center border-l border-linea" colSpan={3}>Valor ({moneda})</th>
                </tr>
                <tr className="border-b border-linea">
                  <th className="font-medium px-3 pb-2 border-l border-linea">Entra</th><th className="font-medium px-3 pb-2">Sale</th><th className="font-medium px-3 pb-2">Saldo</th>
                  <th className="font-medium px-3 pb-2 border-l border-linea">Entra</th><th className="font-medium px-3 pb-2">Sale</th><th className="font-medium px-3 pb-2">Saldo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-linea">
                <tr className="bg-hundido/60 font-semibold">
                  <td className="px-3 py-2">{fechaCorta(rango.desde)}</td><td className="px-3 py-2">Saldo inicial</td>
                  <td className="border-l border-linea" /><td /><td className="num text-right px-3">{cant(d.inicial.cantidad)}</td>
                  <td className="num text-right px-3 border-l border-linea">{bs(d.inicial.costo_promedio)}</td>
                  <td className="border-l border-linea" /><td /><td className="num text-right px-3">{bs(d.inicial.valor)}</td>
                </tr>
                {filas.map((f) => (
                  <tr key={f.id} className={cx(f.motivo === 'compra' && 'bg-hierba/5', f.motivo === 'ajuste' && 'bg-aji/10')}>
                    <td className="px-3 py-1.5 text-tenue">{fechaCorta(f.fecha)} <span className="text-[11px]">{horaDe(f.fecha)}</span></td>
                    <td className="px-3 py-1.5 max-w-[320px] truncate" title={f.usuario ? `${f.detalle} · ${f.usuario}` : f.detalle}>{f.detalle}</td>
                    <td className="num text-right px-3 border-l border-linea text-hierba">{f.entrada ? cant(f.entrada) : ''}</td>
                    <td className="num text-right px-3">{f.salida ? cant(f.salida) : ''}</td>
                    <td className={cx('num text-right px-3 font-semibold', f.saldo < 0 && 'text-locoto')}>{cant(f.saldo)}</td>
                    <td className="num text-right px-3 border-l border-linea text-tenue">{bs(f.costo_unitario)}</td>
                    <td className="num text-right px-3 border-l border-linea text-hierba">{f.entrada_valor ? bs(f.entrada_valor) : ''}</td>
                    <td className="num text-right px-3">{f.salida_valor ? bs(f.salida_valor) : ''}</td>
                    <td className="num text-right px-3 font-semibold">{bs(f.saldo_valor)}</td>
                  </tr>
                ))}
                {!filas.length && <tr><td colSpan={9} className="px-3 py-6 text-center text-tenue">Sin movimientos en estas fechas.</td></tr>}
                <tr className="bg-hundido/60 font-semibold">
                  <td className="px-3 py-2">{fechaCorta(rango.hasta)}</td><td className="px-3 py-2">Totales y saldo final</td>
                  <td className="num text-right px-3 border-l border-linea text-hierba">{cant(d.totales.entradas)}</td>
                  <td className="num text-right px-3">{cant(d.totales.salidas)}</td>
                  <td className="num text-right px-3">{cant(d.final.cantidad)}</td>
                  <td className="num text-right px-3 border-l border-linea">{bs(d.final.costo_promedio)}</td>
                  <td className="num text-right px-3 border-l border-linea text-hierba">{bs(d.totales.entradas_valor)}</td>
                  <td className="num text-right px-3">{bs(d.totales.salidas_valor)}</td>
                  <td className="num text-right px-3">{bs(d.final.valor)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-[12px] text-tenue">
            Las compras entran a su costo; las ventas y los conteos que faltan salen al costo promedio del momento. El promedio solo cambia cuando entra mercadería.
          </p>
        </div>
      )}
    </Hoja>
  );
}

export default function KardexPage() {
  const { tiene } = usePermisos();
  const moneda = useMoneda();
  const r = useRango('mes');
  const [clase, setClase] = useState('todos');
  const [busca, setBusca] = useState('');
  const [params, setParams] = useSearchParams();
  const puede = tiene('insumos', 'ver') || tiene('inventario', 'ver');
  const q = useQuery({
    queryKey: ['kardex', 'resumen', r.rango, clase],
    queryFn: () => getKardex({ ...r.rango, ...(clase !== 'todos' ? { clase } : {}) }),
    enabled: puede, placeholderData: (x) => x,
  });
  // ?ver=insumo-3 abre el kardex de ese ítem (enlace desde Insumos y Stock).
  const ver = params.get('ver');
  const abierto = ver ? { clase: ver.split('-')[0], id: Number(ver.split('-')[1]) } : null;
  const abrir = (i) => setParams(i ? { ver: `${i.clase}-${i.id}` } : {}, { replace: true });

  const items = useMemo(() => {
    const t = normalizar(busca.trim());
    return (q.data?.items ?? []).filter((i) => !t || normalizar(i.nombre).includes(t));
  }, [q.data, busca]);

  if (!puede) return <SinPermiso />;
  const d = q.data;
  const tot = d?.totales;
  // Con permiso para los dos, el filtro se ve siempre (no según lo que trajo la respuesta).
  const ambas = tiene('insumos', 'ver') && tiene('inventario', 'ver');

  const exportar = () => exportarCsv(`inventario-valorizado-${r.rango.desde}-a-${r.rango.hasta}`, [
    { titulo: 'Tipo', valor: (i) => CLASE[i.clase] }, { titulo: 'Nombre', valor: (i) => i.nombre }, { titulo: 'Unidad', valor: (i) => i.unidad },
    { titulo: 'Saldo inicial', valor: (i) => i.inicial.cantidad }, { titulo: 'Valor inicial', valor: (i) => i.inicial.valor },
    { titulo: 'Entradas', valor: (i) => i.totales.entradas }, { titulo: 'Entradas Bs', valor: (i) => i.totales.entradas_valor },
    { titulo: 'Salidas', valor: (i) => i.totales.salidas }, { titulo: 'Salidas Bs', valor: (i) => i.totales.salidas_valor },
    { titulo: 'Saldo final', valor: (i) => i.final.cantidad }, { titulo: 'Costo promedio', valor: (i) => i.final.costo_promedio }, { titulo: 'Valor final', valor: (i) => i.final.valor },
  ], items);

  return (
    <Pagina>
      <Encabezado titulo="Kardex" texto="Entradas, salidas y saldo de cada insumo y bebida, en cantidad y en plata (costo promedio ponderado)."
        acciones={d && (
          <div className="flex gap-2">
            <BotonCsv onClick={exportar} disabled={!items.length} />
            <BotonExportar disabled={!items.length} armar={async () => reporteResumen(d, items, r.rango, moneda)} />
          </div>
        )} />
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <SelectorRango r={r} />
        {ambas && <Segmentado tamano="sm" valor={clase} onCambio={setClase} opciones={[{ valor: 'todos', etiqueta: 'Todo' }, { valor: 'insumo', etiqueta: 'Insumos' }, { valor: 'producto', etiqueta: 'Bebidas' }]} />}
        <Buscador valor={busca} onCambio={setBusca} placeholder="Buscar" className="flex-1 min-w-[180px] max-w-sm" />
      </div>

      {q.isLoading || !d ? <Cargando /> : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi etiqueta="Valor del inventario" valor={dinero(tot.final_valor, moneda)}
              nota={`Al empezar: ${dinero(tot.inicial_valor, moneda)}`} />
            <Kpi etiqueta="Compras que entraron" valor={dinero(tot.compras_valor, moneda)} tono="text-hierba" />
            <Kpi etiqueta="Consumo en ventas" valor={dinero(tot.ventas_valor, moneda)} nota="Lo que costó lo que se vendió" />
            <Kpi etiqueta="Diferencias de conteo" valor={`${tot.ajustes_valor > 0 ? '+' : tot.ajustes_valor < 0 ? '−' : ''}${dinero(Math.abs(tot.ajustes_valor), moneda)}`}
              tono={tot.ajustes_valor < 0 ? 'text-locoto' : ''} nota={tot.ajustes_valor < 0 ? 'Faltó mercadería al contar' : tot.ajustes_valor > 0 ? 'Sobró mercadería al contar' : 'Sin diferencias'} />
          </div>

          {!items.length ? <Vacio Icono={ScrollText} titulo="Nada que mostrar" texto={busca ? 'Ningún ítem coincide con la búsqueda.' : 'Todavía no hay movimientos de inventario.'} /> : (
            <div className="ficha overflow-x-auto">
              <table className="w-full text-sm whitespace-nowrap">
                <thead className="text-[12px] text-tenue text-right">
                  <tr className="border-b border-linea">
                    <th className="text-left font-medium px-4 py-2">Ítem</th>
                    <th className="font-medium px-3 py-2">Saldo inicial</th>
                    <th className="font-medium px-3 py-2">Entradas</th>
                    <th className="font-medium px-3 py-2">Salidas</th>
                    <th className="font-medium px-3 py-2">Saldo final</th>
                    <th className="font-medium px-3 py-2">Costo prom.</th>
                    <th className="font-medium px-4 py-2">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-linea">
                  {items.map((i) => {
                    const bajo = i.stock_minimo != null && i.final.cantidad <= i.stock_minimo;
                    return (
                      <tr key={`${i.clase}-${i.id}`} className="cursor-pointer hover:bg-hundido/60" onClick={() => abrir(i)}>
                        <td className="px-4 py-2.5">
                          <span className="font-semibold">{i.nombre}</span>
                          {ambas && <span className="text-[12px] text-tenue"> · {i.clase === 'insumo' ? 'insumo' : 'bebida'}</span>}
                          {!i.activo && <Insignia className="ml-2">Desactivado</Insignia>}
                        </td>
                        <td className="num text-right px-3 text-tenue">{cant(i.inicial.cantidad)} {i.unidad}</td>
                        <td className="num text-right px-3 text-hierba">{i.totales.entradas ? `+${cant(i.totales.entradas)}` : ''}</td>
                        <td className="num text-right px-3">{i.totales.salidas ? `−${cant(i.totales.salidas)}` : ''}</td>
                        <td className={cx('num text-right px-3 font-semibold', (bajo || i.final.cantidad <= 0) && 'text-locoto')}>{cant(i.final.cantidad)} {i.unidad}</td>
                        <td className="num text-right px-3 text-tenue">{dinero(i.final.costo_promedio, moneda)}</td>
                        <td className="num text-right px-4 font-semibold">{dinero(i.final.valor, moneda)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-linea font-semibold">
                    <td className="px-4 py-2.5" colSpan={6}>Total ({items.length} ítems)</td>
                    <td className="num text-right px-4">{dinero(items.reduce((t, i) => t + i.final.valor, 0), moneda)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {abierto && <HojaKardex clase={abierto.clase} id={abierto.id} rango={r.rango} moneda={moneda} onCerrar={() => abrir(null)} />}
    </Pagina>
  );
}
