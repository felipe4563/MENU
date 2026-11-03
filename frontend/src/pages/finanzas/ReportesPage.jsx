import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine } from 'recharts';
import { getReporteVentasResumen, getReporteVentasProductos, getReporteVentas, getReporteFinanzasResumen, getReporteFinanzasSerie, getReporteArqueos } from '../../api/reportes';
import { usePermisos } from '../../hooks/usePermisos';
import { useMoneda } from '../../hooks/useConfig';
import { Cargando, Encabezado, Pagina, Segmentado, SinPermiso, Vacio, Insignia } from '../../components/ui/piezas';
import { useRango, SelectorRango, exportarCsv, BotonCsv, Paginador } from './comun';
import { MOTIVOS_DEVOLUCION } from '../../utils/ticketDevolucion';
import { etiquetaDestino } from '../vender/datosCatalogo';
import { PorHora, FormasPago } from '../hoy/graficos';
import { cx, dinero, fechaHora, hoyISO } from '../../lib/util';

const METODO = { efectivo: 'Efectivo', qr: 'QR', app_externa: 'App' };

function Kpi({ etiqueta, valor, tono, nota }) {
  return (
    <div className="ficha p-4">
      <p className="text-[13px] text-tenue">{etiqueta}</p>
      <p className={cx('num text-2xl sm:text-[28px] font-extrabold mt-1 leading-none', tono)}>{valor}</p>
      {nota && <p className="text-xs text-tenue mt-1.5">{nota}</p>}
    </div>
  );
}

// Días del rango (yyyy-mm-dd), para que los días sin ventas también aparezcan en 0.
function diasDe({ desde, hasta }) {
  const out = [];
  for (let d = new Date(`${desde}T12:00`); d <= new Date(`${hasta}T12:00`) && out.length < 120; d.setDate(d.getDate() + 1)) {
    out.push(new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10));
  }
  return out;
}

const corto = (v) => (v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : `${Math.round(v)}`);

function PorDia({ rango, serie = [], moneda }) {
  const porDia = Object.fromEntries(serie.map((x) => [x.fecha, x.ingresos]));
  const datos = diasDe(rango).map((f) => ({ fecha: f, ingresos: porDia[f] ?? 0 }));
  const conVenta = datos.filter((x) => x.ingresos > 0);
  const promedio = conVenta.length ? conVenta.reduce((t, x) => t + x.ingresos, 0) / conVenta.length : 0;
  const mejor = conVenta.reduce((m, x) => (x.ingresos > (m?.ingresos ?? 0) ? x : m), null);
  const largo = datos.length > 14;
  const etiqueta = (f) => new Date(`${f}T12:00`).toLocaleDateString('es-BO', largo ? { day: 'numeric' } : { weekday: 'short', day: 'numeric' });
  return (
    <div>
      <div className="flex flex-wrap gap-x-8 gap-y-2 mb-4 text-sm">
        <p><span className="text-tenue">Promedio por día con ventas </span><b className="num">{dinero(promedio, moneda)}</b></p>
        {mejor && <p><span className="text-tenue">Mejor día </span><b className="num">{dinero(mejor.ingresos, moneda)}</b><span className="text-tenue"> · {new Date(`${mejor.fecha}T12:00`).toLocaleDateString('es-BO', { weekday: 'long', day: 'numeric', month: 'short' })}</span></p>}
      </div>
      <div className="h-64">
        <ResponsiveContainer>
          <BarChart data={datos} margin={{ top: 6, right: 6, left: -12, bottom: 0 }} barCategoryGap="18%">
            <CartesianGrid vertical={false} stroke="rgb(var(--linea))" />
            <XAxis dataKey="fecha" tick={{ fontSize: 11, fill: 'rgb(var(--tenue))' }} tickLine={false} axisLine={false} tickFormatter={etiqueta} interval="preserveStartEnd" minTickGap={8} />
            <YAxis tick={{ fontSize: 11, fill: 'rgb(var(--tenue))' }} tickLine={false} axisLine={false} tickFormatter={corto} width={44} />
            <Tooltip cursor={{ fill: 'rgb(var(--hundido))' }} contentStyle={{ borderRadius: 12, border: '1px solid rgb(var(--linea))', background: 'rgb(var(--papel))' }}
              labelFormatter={(f) => new Date(`${f}T12:00`).toLocaleDateString('es-BO', { weekday: 'long', day: 'numeric', month: 'long' })} formatter={(v) => [dinero(v, moneda), 'Vendido']} />
            {promedio > 0 && <ReferenceLine y={promedio} stroke="rgb(var(--tenue))" strokeDasharray="4 4" />}
            <Bar dataKey="ingresos" radius={[4, 4, 0, 0]} minPointSize={2} maxBarSize={56} fill="rgb(var(--aji))" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function Ranking({ productos = [], moneda, rango }) {
  const [orden, setOrden] = useState('monto');
  const [todos, setTodos] = useState(false);
  const lista = [...productos].sort((x, y) => y[orden] - x[orden]);
  const total = productos.reduce((t, x) => t + x.monto, 0) || 1;
  const max = Math.max(1, ...lista.map((x) => x[orden]));
  const visibles = todos ? lista : lista.slice(0, 12);
  return (
    <section className="ficha">
      <header className="flex flex-wrap items-center gap-3 px-5 pt-4 pb-1">
        <h2 className="font-display font-semibold text-lg mr-auto">Productos vendidos <span className="text-sm text-tenue font-normal">· {productos.length}</span></h2>
        <Segmentado tamano="sm" valor={orden} onCambio={setOrden} opciones={[{ valor: 'monto', etiqueta: 'Por monto' }, { valor: 'cantidad', etiqueta: 'Por cantidad' }]} />
        <BotonCsv disabled={!productos.length} onClick={() => exportarCsv(`productos_${rango.desde}_${rango.hasta}`, [
          { titulo: 'Producto', valor: (x) => x.nombre }, { titulo: 'Cantidad', valor: (x) => x.cantidad }, { titulo: 'Unidad', valor: (x) => x.unidad }, { titulo: 'Monto', valor: (x) => x.monto.toFixed(2) },
        ], lista)} />
      </header>
      {!productos.length ? <p className="px-5 py-8 text-sm text-tenue">Sin ventas en estas fechas.</p> : (
        <>
          <ol className="grid md:grid-cols-2 gap-x-10 px-5 py-2">
            {visibles.map((x, i) => (
              <li key={`${x.tipo}${x.id}`} className="py-2.5 border-b border-linea flex items-center gap-3">
                <span className={cx('num w-7 text-center text-sm font-bold shrink-0', i < 3 ? 'text-tinta' : 'text-tenue')}>{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-3 text-sm">
                    <span className="flex-1 truncate font-medium">{x.nombre}{x.tipo === 'combo' && <span className="text-tenue font-normal"> · combo</span>}</span>
                    <span className="num text-tenue">{x.cantidad}{x.unidad === 'kg' ? ' kg' : ' u'}</span>
                    <span className="num font-semibold w-24 text-right">{dinero(x.monto, moneda)}</span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="flex-1 h-1.5 rounded-full bg-hundido"><div className="h-full rounded-full bg-aji" style={{ width: `${(x[orden] / max) * 100}%` }} /></div>
                    <span className="num text-[11px] text-tenue w-9 text-right">{((x.monto / total) * 100).toFixed(0)}%</span>
                  </div>
                </div>
              </li>
            ))}
          </ol>
          {lista.length > 12 && (
            <div className="px-5 pb-4 pt-1"><button className="btn-fantasma" onClick={() => setTodos(!todos)}>{todos ? 'Ver solo los 12 primeros' : `Ver los ${lista.length} productos`}</button></div>
          )}
        </>
      )}
    </section>
  );
}

function Ventas({ rango, moneda }) {
  const [pagina, setPagina] = useState(1);
  const unDia = rango.desde === rango.hasta;
  const r = useQuery({ queryKey: ['rep-ventas-res', rango], queryFn: () => getReporteVentasResumen(rango) });
  const p = useQuery({ queryKey: ['rep-ventas-prod', rango], queryFn: () => getReporteVentasProductos(rango) });
  const s = useQuery({ queryKey: ['rep-fin-serie', rango], queryFn: () => getReporteFinanzasSerie(rango), enabled: !unDia });
  const h = useQuery({ queryKey: ['rep-ventas-dia', rango], queryFn: () => getReporteVentas({ ...rango, limite: 0 }), enabled: unDia });
  const l = useQuery({ queryKey: ['rep-ventas-lista', rango, pagina], queryFn: () => getReporteVentas({ ...rango, pagina, limite: 20 }), placeholderData: (x) => x });
  const d = r.data;
  if (r.isLoading) return <Cargando />;
  const devoluciones = d?.devoluciones_por_motivo ?? [];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi etiqueta="Ventas netas" valor={dinero(d?.ventas_netas, moneda)} nota={d?.total_devoluciones ? `${dinero(d.total_ventas, moneda)} − ${dinero(d.total_devoluciones, moneda)} devuelto` : undefined} />
        <Kpi etiqueta="Pedidos" valor={d?.cantidad ?? 0} nota={d?.cantidad ? `${dinero((d.ventas_netas ?? 0) / d.cantidad, moneda)} por pedido` : undefined} />
        <Kpi etiqueta="Efectivo" valor={dinero(d?.ventas_efectivo, moneda)} />
        <Kpi etiqueta="QR y apps" valor={dinero((d?.ventas_qr ?? 0) + (d?.ventas_app_externa ?? 0), moneda)} />
      </div>
      <div className="grid lg:grid-cols-12 gap-4 items-stretch">
        <section className="ficha p-5 sm:p-6 lg:col-span-8">
          <h2 className="font-display font-semibold text-lg mb-3">{unDia ? 'Ventas del día por hora' : 'Ventas por día'}</h2>
          {unDia
            ? <PorHora hoy={h.data?.filas} moneda={moneda} nombre="Vendido" comparar={null} hastaAhora={rango.desde === hoyISO()} />
            : <PorDia rango={rango} serie={s.data} moneda={moneda} />}
        </section>
        <div className="lg:col-span-4 flex flex-col gap-4">
          <section className="ficha p-5 sm:p-6">
            <h2 className="font-display font-semibold text-lg mb-5">Cómo te pagaron</h2>
            <FormasPago resumen={d} moneda={moneda} />
          </section>
          <section className="ficha p-5 sm:p-6 flex-1">
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="font-display font-semibold text-lg">Devoluciones</h2>
              <span className="num font-bold">{dinero(d?.total_devoluciones ?? 0, moneda)}</span>
            </div>
            {devoluciones.length === 0 ? <p className="text-sm text-tenue">Ninguna en estas fechas.</p> : (
              <ul className="space-y-2.5 text-sm">
                {devoluciones.map((m) => (
                  <li key={m.motivo}>
                    <div className="flex justify-between"><span>{MOTIVOS_DEVOLUCION[m.motivo] ?? m.motivo}</span><span className="num">{dinero(m.monto, moneda)}</span></div>
                    <div className="mt-1 h-1.5 rounded-full bg-hundido"><div className="h-full rounded-full bg-locoto" style={{ width: `${(m.monto / (d.total_devoluciones || 1)) * 100}%` }} /></div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      <Ranking productos={p.data ?? []} moneda={moneda} rango={rango} />
      <section className="ficha">
        <header className="flex items-center gap-2 px-5 pt-4">
          <h2 className="font-display font-semibold text-lg flex-1">Todas las ventas <span className="text-sm text-tenue font-normal">· {l.data?.total ?? 0}</span></h2>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-sm mt-2">
            <thead className="text-left text-[13px] text-tenue"><tr className="border-b border-linea">
              <th className="px-5 py-2 font-medium">#</th><th className="px-3 py-2 font-medium">Fecha</th><th className="px-3 py-2 font-medium">Destino</th><th className="px-3 py-2 font-medium">Cobró</th><th className="px-3 py-2 font-medium">Pago</th><th className="px-5 py-2 font-medium text-right">Total</th>
            </tr></thead>
            <tbody className="divide-y divide-linea">
              {(l.data?.filas ?? []).map((v) => (
                <tr key={v.id}>
                  <td className="px-5 py-2.5 num text-tenue">{v.id}</td>
                  <td className="px-3 py-2.5">{fechaHora(v.creado_en)}</td>
                  <td className="px-3 py-2.5">{etiquetaDestino(v)}</td>
                  <td className="px-3 py-2.5">{v.usuario?.nombre ?? '—'}</td>
                  <td className="px-3 py-2.5"><Insignia>{METODO[v.metodo_pago] ?? v.metodo_pago}</Insignia></td>
                  <td className="px-5 py-2.5 num font-semibold text-right">{dinero(v.total, moneda)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="pb-4"><Paginador pagina={pagina} total={l.data?.total_paginas} onCambio={setPagina} /></div>
      </section>
    </div>
  );
}

function Resultado({ rango, moneda }) {
  const r = useQuery({ queryKey: ['rep-fin-res', rango], queryFn: () => getReporteFinanzasResumen(rango) });
  const s = useQuery({ queryKey: ['rep-fin-serie', rango], queryFn: () => getReporteFinanzasSerie(rango) });
  if (r.isLoading) return <Cargando />;
  const d = r.data ?? {};
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi etiqueta="Ingresos" valor={dinero(d.ingresos, moneda)} />
        <Kpi etiqueta="Gastos de caja" valor={dinero(d.gastos_operativos, moneda)} />
        <Kpi etiqueta="Compras" valor={dinero(d.compras, moneda)} />
        <Kpi etiqueta="Resultado" valor={dinero(d.resultado_neto, moneda)} tono={d.resultado_neto >= 0 ? 'text-hierba' : 'text-locoto'} />
      </div>
      <section className="ficha p-5">
        <h2 className="font-display font-semibold text-lg mb-4">Día por día</h2>
        {(s.data ?? []).length === 0 ? <Vacio titulo="Sin movimientos" /> : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={s.data} margin={{ left: -12, right: 8 }}>
                <CartesianGrid vertical={false} stroke="rgb(var(--linea))" />
                <XAxis dataKey="fecha" tickFormatter={(f) => f.slice(8, 10) + '/' + f.slice(5, 7)} tick={{ fontSize: 12, fill: 'rgb(var(--tenue))' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: 'rgb(var(--tenue))' }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: 'rgb(var(--hundido))' }} contentStyle={{ borderRadius: 12, border: '1px solid rgb(var(--linea))', background: 'rgb(var(--papel))' }} formatter={(v) => dinero(v, moneda)} />
                <Bar dataKey="ingresos" name="Ingresos" fill="rgb(var(--aji))" radius={[6, 6, 0, 0]} />
                <Bar dataKey="gastos_operativos" name="Gastos" fill="rgb(var(--locoto))" radius={[6, 6, 0, 0]} />
                <Bar dataKey="compras" name="Compras" fill="rgb(var(--tenue))" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>
    </div>
  );
}

function Arqueos({ rango, moneda }) {
  const [pagina, setPagina] = useState(1);
  const q = useQuery({ queryKey: ['rep-arqueos', rango, pagina], queryFn: () => getReporteArqueos({ ...rango, pagina, limite: 20 }), placeholderData: (x) => x });
  if (q.isLoading) return <Cargando />;
  const filas = q.data?.filas ?? [];
  if (!filas.length) return <Vacio titulo="Sin cierres de caja en estas fechas" />;
  return (
    <section className="ficha overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-[13px] text-tenue"><tr className="border-b border-linea">
          <th className="px-5 py-3 font-medium">Cierre</th><th className="px-3 py-3 font-medium">Cajero</th><th className="px-3 py-3 font-medium text-right">Esperado</th><th className="px-3 py-3 font-medium text-right">Contado</th><th className="px-5 py-3 font-medium text-right">Diferencia</th>
        </tr></thead>
        <tbody className="divide-y divide-linea">
          {filas.map((s) => {
            const dif = Number(s.diferencia || 0);
            return (
              <tr key={s.id} className={cx(s.fuera_de_tolerancia && 'bg-locoto/5')}>
                <td className="px-5 py-2.5"><a className="underline decoration-linea underline-offset-4 hover:decoration-tinta" href={`/caja/cierre/${s.id}`}>{fechaHora(s.cerrado_en)}</a></td>
                <td className="px-3 py-2.5">{s.usuario?.nombre}{s.nota_diferencia && <span className="block text-xs text-tenue">“{s.nota_diferencia}”</span>}</td>
                <td className="px-3 py-2.5 num text-right">{dinero(Number(s.monto_cierre || 0) - dif, moneda)}</td>
                <td className="px-3 py-2.5 num text-right">{dinero(s.monto_cierre, moneda)}</td>
                <td className={cx('px-5 py-2.5 num text-right font-semibold', Math.abs(dif) < 0.005 ? 'text-hierba' : s.fuera_de_tolerancia ? 'text-locoto' : '')}>{dif > 0 ? '+' : ''}{dif.toFixed(2)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="pb-4"><Paginador pagina={pagina} total={q.data?.total_paginas} onCambio={setPagina} /></div>
    </section>
  );
}

export default function ReportesPage() {
  const { tiene } = usePermisos();
  const moneda = useMoneda();
  const r = useRango('7d');
  const [tab, setTab] = useState('ventas');
  if (!tiene('reportes', 'ver')) return <SinPermiso />;
  return (
    <Pagina>
      <Encabezado titulo="Reportes" texto={`Del ${r.rango.desde} al ${r.rango.hasta}`} />
      <div className="flex flex-wrap gap-3 items-center mb-5">
        <Segmentado valor={tab} onCambio={setTab} opciones={[{ valor: 'ventas', etiqueta: 'Ventas' }, { valor: 'resultado', etiqueta: 'Ganancia' }, { valor: 'arqueos', etiqueta: 'Cierres de caja' }]} />
        <div className="sm:ml-auto"><SelectorRango r={r} /></div>
      </div>
      {tab === 'ventas' && <Ventas rango={r.rango} moneda={moneda} />}
      {tab === 'resultado' && <Resultado rango={r.rango} moneda={moneda} />}
      {tab === 'arqueos' && <Arqueos rango={r.rango} moneda={moneda} />}
    </Pagina>
  );
}
