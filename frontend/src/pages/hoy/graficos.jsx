import { useMemo, useState } from 'react';
import { ResponsiveContainer, AreaChart, Area, BarChart, Bar, Cell, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine, PieChart, Pie } from 'recharts';
import { cx, dinero } from '../../lib/util';
import { etiquetaDestino } from '../vender/datosCatalogo';

const EJE = { fontSize: 11, fill: 'rgb(var(--tenue))' };
const corto = (v) => (v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : `${Math.round(v)}`);

function Globo({ active, payload, label, titulo, moneda }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-linea bg-papel px-3 py-2 shadow-lg text-[13px]">
      <p className="font-semibold mb-1">{titulo ? titulo(label, payload) : label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: p.stroke && p.stroke !== 'none' ? p.stroke : p.color }} />
          <span className="text-tenue">{p.name}</span>
          <span className="num font-semibold ml-auto pl-3">{dinero(p.value, moneda)}</span>
        </p>
      ))}
    </div>
  );
}

// Ventas por hora: hoy contra ayer.
export function PorHora({ hoy = [], ayer = [], moneda, nombre = 'Hoy', comparar = 'Ayer', hastaAhora = true }) {
  const { datos, pico } = useMemo(() => {
    const sumar = (filas) => filas.reduce((m, p) => { const h = new Date(p.creado_en).getHours(); m[h] = (m[h] ?? 0) + Number(p.total ?? 0); return m; }, {});
    const a = sumar(hoy); const b = sumar(ayer);
    const horas = [...Object.keys(a), ...Object.keys(b)].map(Number);
    const ahora = hastaAhora ? new Date().getHours() : 23;
    const desde = Math.min(8, ...horas); const hasta = Math.max(22, hastaAhora ? ahora : 0, ...horas);
    const datos = [];
    for (let h = desde; h <= hasta; h++) datos.push({ hora: h, hoy: h <= ahora ? a[h] ?? 0 : null, ayer: b[h] ?? 0 });
    const pico = Object.entries(a).sort((x, y) => y[1] - x[1])[0];
    return { datos, pico: pico ? Number(pico[0]) : null };
  }, [hoy, ayer, hastaAhora]);
  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 mb-3 text-[13px]">
        <p className="text-sm text-tenue mr-auto">Ventas por hora{pico != null && <> · lo más fuerte fue a las <b className="text-tinta num">{pico}:00</b></>}</p>
        {comparar && <span className="flex items-center gap-1.5"><span className="w-4 h-[3px] rounded bg-tinta" /> {nombre}</span>}
        {comparar && <span className="flex items-center gap-1.5 text-tenue"><span className="w-4 border-t-2 border-dashed border-tenue" /> {comparar}</span>}
      </div>
      <div className="h-52">
        <ResponsiveContainer>
          <AreaChart data={datos} margin={{ top: 6, right: 6, left: -12, bottom: 0 }}>
            <defs>
              <linearGradient id="relleno-hoy" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgb(var(--aji))" stopOpacity={0.35} />
                <stop offset="100%" stopColor="rgb(var(--aji))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="rgb(var(--linea))" />
            <XAxis dataKey="hora" tick={EJE} tickLine={false} axisLine={false} tickFormatter={(h) => `${h}h`} interval="preserveStartEnd" minTickGap={16} />
            <YAxis tick={EJE} tickLine={false} axisLine={false} tickFormatter={corto} width={44} />
            <Tooltip cursor={{ stroke: 'rgb(var(--tenue))', strokeDasharray: '3 3' }} content={<Globo moneda={moneda} titulo={(h) => `${h}:00 – ${h}:59`} />} />
            {comparar && <Area type="monotone" dataKey="ayer" name={comparar} stroke="rgb(var(--tenue))" strokeWidth={2} strokeDasharray="5 4" fill="none" dot={false} activeDot={{ r: 4 }} />}
            <Area type="monotone" dataKey="hoy" name={nombre} stroke="rgb(var(--tinta))" strokeWidth={2.5} fill="url(#relleno-hoy)" dot={datos.filter((d) => d.hoy != null).length < 3 ? { r: 3, fill: 'rgb(var(--tinta))' } : false} activeDot={{ r: 5, stroke: 'rgb(var(--papel))', strokeWidth: 2 }} connectNulls={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// Formas de pago en dona, con leyenda y montos.
export function FormasPago({ resumen, moneda }) {
  const partes = [
    { clave: 'efectivo', nombre: 'Efectivo', valor: resumen?.ventas_efectivo ?? 0, color: 'rgb(var(--serie-1))' },
    { clave: 'qr', nombre: 'QR', valor: resumen?.ventas_qr ?? 0, color: 'rgb(var(--serie-2))' },
    { clave: 'app', nombre: 'Apps delivery', valor: resumen?.ventas_app_externa ?? 0, color: 'rgb(var(--serie-3))' },
  ];
  const total = partes.reduce((s, p) => s + p.valor, 0);
  return (
    <div className="flex flex-col sm:flex-row lg:flex-col min-[1800px]:flex-row items-center gap-6">
      <div className="relative w-40 h-40 shrink-0">
        {total > 0 ? (
          <ResponsiveContainer>
            <PieChart>
              <Pie data={partes.filter((p) => p.valor > 0)} dataKey="valor" nameKey="nombre" innerRadius="70%" outerRadius="100%" paddingAngle={0} stroke={partes.filter((p) => p.valor > 0).length > 1 ? 'rgb(var(--papel))' : 'none'} strokeWidth={2} isAnimationActive={false}>
                {partes.filter((p) => p.valor > 0).map((p) => <Cell key={p.clave} fill={p.color} />)}
              </Pie>
              <Tooltip content={({ active, payload }) => active && payload?.[0] ? <div className="rounded-xl border border-linea bg-papel px-3 py-2 shadow-lg text-[13px]"><b>{payload[0].name}</b> <span className="num">{dinero(payload[0].value, moneda)}</span></div> : null} />
            </PieChart>
          </ResponsiveContainer>
        ) : <div className="w-full h-full rounded-full border-[16px] border-hundido" />}
        <div className="absolute inset-0 grid place-items-center pointer-events-none text-center">
          <div><p className="text-[11px] text-tenue">Cobrado</p><p className="num font-extrabold">{corto(total)}</p></div>
        </div>
      </div>
      <ul className="w-full space-y-3">
        {partes.map((p) => (
          <li key={p.clave} className="flex items-center gap-2.5 text-sm">
            <span className="w-3 h-3 rounded-[4px] shrink-0" style={{ background: p.color }} />
            <span className="flex-1 whitespace-nowrap">{p.nombre}</span>
            <span className="num text-tenue w-10 text-right">{total ? Math.round((p.valor / total) * 100) : 0}%</span>
            <span className="num font-semibold w-24 text-right">{dinero(p.valor, moneda)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Barras de 30 días con el promedio; hoy resaltado.
export function Tendencia({ serie = [], dias = 30, moneda, haceDias }) {
  const datos = useMemo(() => {
    const porDia = Object.fromEntries(serie.map((d) => [d.fecha, d.ingresos]));
    return Array.from({ length: dias }, (_, i) => { const f = haceDias(dias - 1 - i); return { fecha: f, ingresos: porDia[f] ?? 0, hoy: i === dias - 1 }; });
  }, [serie, dias, haceDias]);
  const conVenta = datos.filter((d) => d.ingresos > 0);
  const promedio = conVenta.length ? conVenta.reduce((s, d) => s + d.ingresos, 0) / conVenta.length : 0;
  const mejor = conVenta.reduce((m, d) => (d.ingresos > (m?.ingresos ?? 0) ? d : m), null);
  const etiqueta = (f) => new Date(`${f}T12:00`).toLocaleDateString('es-BO', { day: 'numeric', month: 'short' });
  return (
    <div>
      <div className="flex flex-wrap gap-x-8 gap-y-2 mb-4">
        <div><p className="num text-xl font-bold">{dinero(datos.reduce((s, d) => s + d.ingresos, 0), moneda)}</p><p className="text-[13px] text-tenue">en {dias} días</p></div>
        <div><p className="num text-xl font-bold">{dinero(promedio, moneda)}</p><p className="text-[13px] text-tenue">promedio por día abierto</p></div>
        {mejor && <div><p className="num text-xl font-bold">{dinero(mejor.ingresos, moneda)}</p><p className="text-[13px] text-tenue">mejor día · {etiqueta(mejor.fecha)}</p></div>}
      </div>
      <div className="h-48">
        <ResponsiveContainer>
          <BarChart data={datos} margin={{ top: 6, right: 6, left: -12, bottom: 0 }} barCategoryGap="18%">
            <CartesianGrid vertical={false} stroke="rgb(var(--linea))" />
            <XAxis dataKey="fecha" tick={EJE} tickLine={false} axisLine={false} tickFormatter={(f) => new Date(`${f}T12:00`).getDate()} interval="preserveStartEnd" minTickGap={10} />
            <YAxis tick={EJE} tickLine={false} axisLine={false} tickFormatter={corto} width={44} />
            <Tooltip cursor={{ fill: 'rgb(var(--hundido))' }} content={<Globo moneda={moneda} titulo={(f) => new Date(`${f}T12:00`).toLocaleDateString('es-BO', { weekday: 'long', day: 'numeric', month: 'long' })} />} />
            {promedio > 0 && <ReferenceLine y={promedio} stroke="rgb(var(--tenue))" strokeDasharray="4 4" label={{ value: 'promedio', position: 'insideTopRight', fontSize: 11, fill: 'rgb(var(--tenue))' }} />}
            <Bar dataKey="ingresos" name="Vendido" radius={[4, 4, 0, 0]} minPointSize={2}>
              {datos.map((d) => <Cell key={d.fecha} fill={d.hoy ? 'rgb(var(--aji))' : 'rgb(var(--tinta) / 0.75)'} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// Mapa de calor día × hora: un solo tono (ají) de claro a oscuro, en 5
// escalones relativos a la mejor celda; vacío = sin ventas.
const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const DIAS_LARGO = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
const ESCALONES = [0.14, 0.3, 0.48, 0.7, 1];

export function MapaCalor({ celdas = [], moneda, semanas = 4 }) {
  const [foco, setFoco] = useState(null);
  const { mapa, horas, max, mejor, porDia } = useMemo(() => {
    const mapa = new Map(celdas.map((c) => [`${c.dia}-${c.hora}`, c]));
    const hs = celdas.map((c) => c.hora);
    const desde = Math.min(8, ...hs); const hasta = Math.max(22, ...hs);
    const horas = Array.from({ length: hasta - desde + 1 }, (_, i) => desde + i);
    const max = Math.max(0, ...celdas.map((c) => c.total));
    const mejor = celdas.reduce((m, c) => (c.total > (m?.total ?? 0) ? c : m), null);
    const porDia = DIAS.map((_, d) => celdas.filter((c) => c.dia === d).reduce((s, c) => s + c.total, 0));
    return { mapa, horas, max, mejor, porDia };
  }, [celdas]);
  const nivel = (t) => (t > 0 && max > 0 ? Math.min(4, Math.ceil((t / max) * 5) - 1) : -1);
  const diaFuerte = porDia.indexOf(Math.max(...porDia));

  if (!celdas.length) return <p className="text-sm text-tenue py-6">Aún no hay ventas en las últimas {semanas} semanas.</p>;
  return (
    <div>
      <div className="flex flex-wrap gap-x-8 gap-y-2 mb-4">
        {mejor && <div><p className="num text-xl font-bold first-letter:uppercase">{DIAS_LARGO[mejor.dia]} {mejor.hora}:00</p><p className="text-[13px] text-tenue">la hora más fuerte · {dinero(mejor.total / semanas, moneda)} por semana</p></div>}
        {porDia[diaFuerte] > 0 && <div><p className="num text-xl font-bold first-letter:uppercase">{DIAS_LARGO[diaFuerte]}</p><p className="text-[13px] text-tenue">el día que más vendes · {dinero(porDia[diaFuerte] / semanas, moneda)} por semana</p></div>}
      </div>

      <div className="overflow-x-auto sin-scroll -mx-1 px-1">
        <div className="grid gap-[2px] min-w-[560px]" style={{ gridTemplateColumns: `2.5rem repeat(${horas.length}, minmax(0, 1fr))` }} onMouseLeave={() => setFoco(null)}>
          {DIAS.map((d, di) => (
            <div key={d} className="contents">
              <span className="text-[11px] text-tenue self-stretch flex items-center sticky left-0 z-10 bg-papel">{d}</span>
              {horas.map((h) => {
                const c = mapa.get(`${di}-${h}`);
                const n = nivel(c?.total ?? 0);
                const activo = foco && foco.dia === di && foco.hora === h;
                return (
                  <div key={h} tabIndex={0} role="img"
                    aria-label={`${DIAS_LARGO[di]} ${h}:00, ${dinero(c?.total ?? 0, moneda)}, ${c?.pedidos ?? 0} pedidos`}
                    onMouseEnter={() => setFoco({ dia: di, hora: h })} onFocus={() => setFoco({ dia: di, hora: h })} onBlur={() => setFoco(null)}
                    className={cx('h-7 rounded-[4px] outline-none', n < 0 && 'bg-hundido', activo && 'ring-2 ring-tinta ring-offset-1 ring-offset-papel')}
                    style={n >= 0 ? { background: `rgb(var(--aji) / ${ESCALONES[n]})` } : undefined} />
                );
              })}
            </div>
          ))}
          <span />
          {horas.map((h) => <span key={h} className="text-[11px] text-tenue text-center pt-1 num">{h % 2 === 0 ? `${h}h` : ''}</span>)}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mt-3 text-[13px]">
        <p className="text-tenue min-h-5 mr-auto">
          {foco ? (() => { const c = mapa.get(`${foco.dia}-${foco.hora}`); return <><b className="text-tinta first-letter:uppercase inline-block">{DIAS_LARGO[foco.dia]} {foco.hora}:00–{foco.hora}:59</b> · <span className="num">{dinero(c?.total ?? 0, moneda)}</span> en {semanas} semanas · <span className="num">{c?.pedidos ?? 0}</span> pedidos</>; })()
            : `Toca o pasa sobre una celda para ver el detalle. Últimas ${semanas} semanas.`}
        </p>
        <span className="flex items-center gap-1.5 text-tenue">Menos
          <span className="w-3.5 h-3.5 rounded-[3px] bg-hundido" />
          {ESCALONES.map((a) => <span key={a} className="w-3.5 h-3.5 rounded-[3px]" style={{ background: `rgb(var(--aji) / ${a})` }} />)}
          Más</span>
      </div>
    </div>
  );
}

// Tiempo de cocina: promedio de hoy contra los 7 días anteriores y lo que
// espera ahora, lo más antiguo primero; en rojo lo que pasa del umbral.
function duracion(seg) {
  if (seg == null) return '—';
  const m = Math.round(seg / 60);
  if (m < 1) return 'menos de 1 min';
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
}

export function TiempoCocina({ datos }) {
  if (!datos) return null;
  const { cantidad, promedio_seg, max_seg, semana, esperando = [], atrasados, min_atraso } = datos;
  const diff = promedio_seg != null && semana?.promedio_seg != null ? Math.round((promedio_seg - semana.promedio_seg) / 60) : null;
  return (
    <div className="grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-6 md:gap-10">
      <div className="flex flex-wrap gap-x-8 gap-y-4 content-start">
        <div>
          <p className="num text-[32px] font-extrabold leading-none">{duracion(promedio_seg)}</p>
          <p className="text-[13px] text-tenue mt-1">tarda un pedido en promedio hoy</p>
          {diff != null && diff !== 0 && (
            <p className={cx('text-sm font-semibold mt-1.5', diff < 0 ? 'text-hierba' : 'text-locoto')}>
              {Math.abs(diff)} min {diff < 0 ? 'más rápido' : 'más lento'} que los 7 días anteriores
            </p>
          )}
          {diff === 0 && <p className="text-sm text-tenue mt-1.5">Igual que los 7 días anteriores</p>}
        </div>
        <div><p className="num text-xl font-bold">{cantidad}</p><p className="text-[13px] text-tenue">pedidos listos hoy</p></div>
        <div><p className="num text-xl font-bold">{duracion(max_seg)}</p><p className="text-[13px] text-tenue">el más lento hoy</p></div>
      </div>
      <div className="min-w-0">
        <p className="text-sm text-tenue mb-2">
          {esperando.length === 0 ? 'Nada esperando en cocina ahora.'
            : <>Esperando ahora: <b className="text-tinta num">{esperando.length}</b>{atrasados > 0 && <span className="text-locoto font-semibold"> · {atrasados} con más de {min_atraso} min</span>}</>}
        </p>
        {esperando.length > 0 && (
          <ul className="divide-y divide-dashed divide-linea">
            {esperando.slice(0, 5).map((e) => {
              const tarde = e.segundos >= min_atraso * 60;
              return (
                <li key={e.id} className="flex items-baseline gap-3 py-2 text-sm">
                  <span className={cx('w-2 h-2 rounded-full shrink-0 self-center', tarde ? 'bg-locoto' : 'bg-tenue/50')} />
                  <span className="font-medium truncate">{etiquetaDestino({ ...e, mesa: e.mesa ? { nombre: e.mesa } : null })}</span>
                  <span className="text-tenue truncate">{e.nombre_cliente}</span>
                  <span className={cx('num ml-auto shrink-0', tarde ? 'text-locoto font-semibold' : 'text-tenue')}>{duracion(e.segundos)}</span>
                </li>
              );
            })}
          </ul>
        )}
        {esperando.length > 5 && <p className="text-[13px] text-tenue mt-1">Y {esperando.length - 5} más en la pantalla de Cocina.</p>}
      </div>
    </div>
  );
}

// Cómo llegan los pedidos: barras horizontales de una sola tinta.
export function Canales({ pedidos = [] }) {
  const filas = [
    { nombre: 'En mesa', n: pedidos.filter((p) => p.tipo === 'mesa' && p.origen !== 'autoservicio').length },
    { nombre: 'Para llevar', n: pedidos.filter((p) => p.tipo === 'llevar' && p.origen !== 'autoservicio').length },
    { nombre: 'Delivery', n: pedidos.filter((p) => p.tipo === 'delivery').length },
    { nombre: 'Menú QR (autoservicio)', n: pedidos.filter((p) => p.origen === 'autoservicio' && p.tipo !== 'delivery').length },
  ];
  const max = Math.max(1, ...filas.map((f) => f.n));
  const total = filas.reduce((s, f) => s + f.n, 0);
  if (!total) return <p className="text-sm text-tenue py-6">Aún no hay pedidos hoy.</p>;
  return (
    <ul className="space-y-3.5">
      {filas.map((f) => (
        <li key={f.nombre}>
          <div className="flex items-baseline text-sm mb-1"><span className="flex-1">{f.nombre}</span><span className="num font-semibold">{f.n}</span><span className="num text-tenue w-12 text-right">{Math.round((f.n / total) * 100)}%</span></div>
          <div className="h-2 rounded-full bg-hundido"><div className={cx('h-full rounded-full', f.n ? 'bg-tinta' : '')} style={{ width: `${(f.n / max) * 100}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}

// Resultado del mes: a dónde se fue cada boliviano vendido.
export function ResultadoMes({ datos, moneda }) {
  const ingresos = datos?.ingresos ?? 0;
  const gastos = datos?.gastos_operativos ?? 0;
  const compras = datos?.compras ?? 0;
  const neto = ingresos - gastos - compras;
  const base = Math.max(ingresos, gastos + compras, 1);
  const tramos = [
    { nombre: 'Compras', valor: compras, clase: 'bg-tenue' },
    { nombre: 'Gastos', valor: gastos, clase: 'bg-locoto' },
    { nombre: neto >= 0 ? 'Te queda' : 'Pérdida', valor: Math.abs(neto), clase: neto >= 0 ? 'bg-hierba' : 'bg-locoto/40' },
  ];
  return (
    <div>
      <div className="flex flex-wrap gap-x-10 gap-y-3 mb-5">
        <div><p className="text-[13px] text-tenue">Vendido</p><p className="num text-2xl font-bold">{dinero(ingresos, moneda)}</p></div>
        <div><p className="text-[13px] text-tenue">Compras</p><p className="num text-2xl font-bold">{dinero(compras, moneda)}</p></div>
        <div><p className="text-[13px] text-tenue">Gastos de caja</p><p className="num text-2xl font-bold">{dinero(gastos, moneda)}</p></div>
        <div><p className="text-[13px] text-tenue">{neto >= 0 ? 'Te queda' : 'Pérdida'}</p><p className={cx('num text-2xl font-extrabold', neto >= 0 ? 'text-hierba' : 'text-locoto')}>{dinero(neto, moneda)}</p></div>
      </div>
      <div className="flex h-4 rounded-full overflow-hidden bg-hundido gap-[2px]">
        {tramos.filter((t) => t.valor > 0).map((t) => <div key={t.nombre} className={t.clase} style={{ width: `${(t.valor / base) * 100}%` }} title={`${t.nombre}: ${dinero(t.valor, moneda)}`} />)}
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2.5 text-[13px] text-tenue">
        {tramos.map((t) => <span key={t.nombre} className="flex items-center gap-1.5"><span className={cx('w-2.5 h-2.5 rounded-[3px]', t.clase)} />{t.nombre} {ingresos > 0 && <span className="num">{Math.round((t.valor / ingresos) * 100)}%</span>}</span>)}
      </div>
    </div>
  );
}
