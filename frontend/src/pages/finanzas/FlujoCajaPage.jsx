// Finanzas › Flujo de caja: el mes día por día, en efectivo y QR, como la
// planilla de Excel del negocio pero llena sola con lo que ya registra el
// sistema (ventas, compras, gastos de caja, devoluciones). Lo que pasa fuera
// de la caja (sueldos, luz, retiros, traspasos) se anota acá.
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine } from 'recharts';
import { ChevronDown, ChevronLeft, ChevronRight, Pencil, Plus, Tags, Trash2, Wallet, QrCode, ArrowLeftRight } from 'lucide-react';
import { getFlujoCaja, getMovimientosFlujo, crearMovimientoFlujo, editarMovimientoFlujo, eliminarMovimientoFlujo } from '../../api/flujoCaja';
import { usePermisos } from '../../hooks/usePermisos';
import { useMoneda } from '../../hooks/useConfig';
import { useSocket } from '../../hooks/useSocket';
import Hoja from '../../components/ui/Hoja';
import { Cargando, Campo, Encabezado, Pagina, Segmentado, SinPermiso, Tarjeta, Vacio, useConfirmar } from '../../components/ui/piezas';
import { numero } from '../../components/ui/formulario';
import { avisar } from '../../components/ui/Aviso';
import { BotonCsv, exportarCsv } from './comun';
import ClasificarGastos from './ClasificarGastos';
import { armarFlujo, totalDe } from '../../lib/flujoCaja';
import { cx, dinero, errorDe, hoyISO } from '../../lib/util';

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const nombreMes = (mes) => `${MESES[Number(mes.slice(5, 7)) - 1]} ${mes.slice(0, 4)}`;
const moverMes = (mes, d) => {
  const [a, m] = mes.split('-').map(Number);
  const f = new Date(Date.UTC(a, m - 1 + d, 1));
  return `${f.getUTCFullYear()}-${String(f.getUTCMonth() + 1).padStart(2, '0')}`;
};
const VISTAS = [
  { valor: 'total', etiqueta: 'Total' },
  { valor: 'efectivo', etiqueta: 'Efectivo' },
  { valor: 'qr', etiqueta: 'QR' },
  { valor: 'separado', etiqueta: 'Efectivo y QR' },
];
const cifra = (n) => (Math.abs(n) < 0.005 ? '' : n.toLocaleString('es-BO', { minimumFractionDigits: 0, maximumFractionDigits: 2 }));

// ── Resumen ────────────────────────────────────────────────────────────────

function Kpi({ etiqueta, v, moneda, tono, nota, signo = '' }) {
  return (
    <div className="ficha p-4 min-w-0">
      <p className="text-[13px] text-tenue">{etiqueta}</p>
      <p className={cx('num font-display font-bold text-2xl mt-1 truncate', tono)}>{signo}{dinero(Math.abs(totalDe(v)), moneda)}</p>
      <p className="text-[12px] text-tenue mt-1 num truncate">
        <Wallet className="inline w-3 h-3 -mt-0.5" /> {dinero(v.efectivo, moneda)} · <QrCode className="inline w-3 h-3 -mt-0.5" /> {dinero(v.qr, moneda)}
      </p>
      {nota && <p className="text-[12px] text-tenue mt-0.5 truncate">{nota}</p>}
    </div>
  );
}

function GraficoSaldo({ flujo, moneda }) {
  const datos = flujo.dias.filter((d) => !d.futuro).map((d) => {
    const i = d.n - 1;
    return { dia: d.n, efectivo: flujo.filas.saldoFinal[i].efectivo, qr: flujo.filas.saldoFinal[i].qr };
  });
  if (datos.length < 2) return null;
  const corto = (v) => (Math.abs(v) >= 1000 ? `${Math.round(v / 100) / 10}k` : v);
  return (
    <Tarjeta titulo="Saldo al cerrar cada día" acciones={(
      <span className="flex items-center gap-3 text-[12px] text-tenue">
        <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-aji rounded" /> Efectivo</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-cielo rounded" /> QR</span>
      </span>
    )}>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={datos} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="rgb(var(--linea))" />
            <XAxis dataKey="dia" tick={{ fontSize: 11, fill: 'rgb(var(--tenue))' }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={10} />
            <YAxis tick={{ fontSize: 11, fill: 'rgb(var(--tenue))' }} tickLine={false} axisLine={false} tickFormatter={corto} width={44} />
            <ReferenceLine y={0} stroke="rgb(var(--tenue))" />
            <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid rgb(var(--linea))', background: 'rgb(var(--papel))' }}
              labelFormatter={(d) => `Día ${d}`} formatter={(v, k) => [dinero(v, moneda), k === 'qr' ? 'QR' : 'Efectivo']} />
            <Line type="monotone" dataKey="efectivo" stroke="rgb(var(--aji))" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
            <Line type="monotone" dataKey="qr" stroke="rgb(var(--cielo))" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Tarjeta>
  );
}

// ── Grilla ─────────────────────────────────────────────────────────────────

function valores(v, vista) {
  if (vista === 'separado') return [v.efectivo, v.qr];
  if (vista === 'efectivo') return [v.efectivo];
  if (vista === 'qr') return [v.qr];
  return [v.efectivo + v.qr];
}

// Filas a mostrar, en orden, ya aplanadas (para la tabla y para el Excel).
function filasGrilla(flujo, abiertos, todas) {
  const f = [];
  const { filas } = flujo;
  const b = (k) => flujo.bloques.find((x) => x.clave === k);
  const bloque = (blq, signo) => {
    f.push({ clave: blq.clave, tipo: 'grupo', nombre: `${signo} ${blq.nombre}`, porDia: blq.porDia, total: blq.total, abrible: true });
    if (!abiertos.has(blq.clave)) return;
    for (const c of (todas ? blq.categorias : blq.conMovimiento)) {
      const conDetalle = c.detalles.length > 0;
      f.push({ clave: c.clave, tipo: 'cat', nombre: c.nombre, porDia: c.porDia, total: c.total, abrible: conDetalle, auto: c.auto });
      if (conDetalle && abiertos.has(c.clave)) c.detalles.forEach((d) => f.push({ clave: `${c.clave}|${d.nombre}`, tipo: 'det', nombre: d.nombre, porDia: d.porDia, total: d.total }));
    }
  };
  const sumaMes = (arr) => arr.reduce((s, v) => ({ efectivo: s.efectivo + v.efectivo, qr: s.qr + v.qr }), { efectivo: 0, qr: 0 });
  f.push({ clave: 'saldo_ini', tipo: 'saldo', nombre: 'Saldo al empezar el día', porDia: filas.saldoInicial, total: filas.saldoInicial[0] });
  bloque(b('ingresos'), '(+)');
  ['costo_variable', 'costo_fijo', 'otros_gastos'].forEach((k) => bloque(b(k), '(−)'));
  f.push({ clave: 'gastos', tipo: 'calc', nombre: 'Total gastos de la operación', porDia: filas.gastos, total: sumaMes(filas.gastos) });
  f.push({ clave: 'flujo', tipo: 'calc', nombre: 'Flujo del día', porDia: filas.flujo, total: sumaMes(filas.flujo), rojo: true });
  bloque(b('no_operativo'), '(−)');
  if (filas.traspasos.some((v) => v.efectivo || v.qr)) bloque(b('traspaso'), '(±)');
  if (filas.ajustes.some((v) => v.efectivo || v.qr)) bloque(b('ajuste'), '(±)');
  f.push({ clave: 'saldo_fin', tipo: 'saldo', nombre: 'Saldo al cerrar el día', porDia: filas.saldoFinal, total: flujo.resumen.saldoFinal, rojo: true });
  return f;
}

function Grilla({ flujo, vista, abiertos, alternar, todas }) {
  const filas = filasGrilla(flujo, abiertos, todas);
  const sub = vista === 'separado';
  const anchoCelda = sub ? 'min-w-[4.25rem]' : 'min-w-[4.75rem]';
  const ESTILO = {
    saldo: 'font-semibold bg-hundido',
    grupo: 'font-semibold',
    cat: '',
    det: 'text-[12px] text-tenue',
    calc: 'font-semibold border-t-2 border-linea',
  };
  return (
    <div className="ficha overflow-auto max-h-[72vh] scroll-fino">
      <table className="text-[13px] num border-separate border-spacing-0 w-max min-w-full">
        <thead className="sticky top-0 z-20 bg-papel">
          <tr>
            <th rowSpan={sub ? 2 : 1} className="sticky left-0 z-30 bg-papel text-left font-semibold px-3 py-2 border-b border-linea min-w-[15rem]">Concepto</th>
            {flujo.dias.map((d) => (
              <th key={d.n} colSpan={sub ? 2 : 1} className={cx('px-2 py-1.5 border-b border-linea font-semibold text-center', d.hoy && 'bg-aji/15', d.finde && !d.hoy && 'bg-hundido/60', d.futuro && 'text-tenue/60')}>
                <span className="block text-[11px] font-normal text-tenue">{d.letra}</span>{d.n}
              </th>
            ))}
            <th colSpan={sub ? 2 : 1} className="sticky right-0 z-30 bg-papel px-3 py-1.5 border-b border-l border-linea font-semibold text-right">Mes</th>
          </tr>
          {sub && (
            <tr>
              {[...flujo.dias, { n: 'mes' }].flatMap((d) => [
                <th key={`${d.n}e`} className={cx('px-2 pb-1 border-b border-linea text-[11px] font-normal text-tenue', d.n === 'mes' && 'sticky right-24 w-24 min-w-24 bg-papel border-l')}>Efe.</th>,
                <th key={`${d.n}q`} className={cx('px-2 pb-1 border-b border-linea text-[11px] font-normal text-tenue', d.n === 'mes' && 'sticky right-0 w-24 min-w-24 bg-papel')}>QR</th>,
              ])}
            </tr>
          )}
        </thead>
        <tbody>
          {filas.map((f) => {
            const abierto = abiertos.has(f.clave);
            return (
              <tr key={f.clave} className={cx('group', ESTILO[f.tipo])}>
                <td className={cx('sticky left-0 z-10 px-3 py-1.5 border-b border-linea/60 whitespace-nowrap', f.tipo === 'saldo' ? 'bg-hundido' : 'bg-papel group-hover:bg-hundido')}>
                  {f.abrible ? (
                    <button onClick={() => alternar(f.clave)} className={cx('flex items-center gap-1.5 text-left', f.tipo === 'cat' && 'pl-4')}>
                      <ChevronDown className={cx('w-3.5 h-3.5 shrink-0 transition-transform', !abierto && '-rotate-90')} />
                      {f.nombre}
                    </button>
                  ) : (
                    <span className={cx(f.tipo === 'cat' && 'pl-9', f.tipo === 'det' && 'pl-14', 'block max-w-[18rem] truncate')} title={f.nombre}>
                      {f.nombre}{f.auto && <span className="ml-1.5 text-[10px] text-tenue font-normal">auto</span>}
                    </span>
                  )}
                </td>
                {f.porDia.map((v, i) => {
                  const d = flujo.dias[i];
                  const ocultar = f.tipo === 'saldo' && d.futuro;
                  return valores(v, vista).map((n, k) => (
                    <td key={`${i}${k}`} className={cx('px-2 py-1.5 border-b border-linea/60 text-right', anchoCelda,
                      d.hoy && 'bg-aji/10', d.finde && !d.hoy && f.tipo !== 'saldo' && 'bg-hundido/40',
                      f.rojo && n < -0.005 && 'text-locoto', sub && k === 1 && 'text-tenue')}>
                      {ocultar ? '' : cifra(n)}
                    </td>
                  ));
                })}
                {valores(f.total, vista).map((n, k, arr) => (
                  <td key={`t${k}`} className={cx('sticky z-10 px-3 py-1.5 border-b border-linea/60 text-right font-semibold whitespace-nowrap',
                    arr.length === 2 && k === 0 ? 'right-24 border-l' : 'right-0', arr.length === 2 && 'w-24 min-w-24', arr.length === 1 && 'border-l',
                    f.tipo === 'saldo' ? 'bg-hundido' : 'bg-papel group-hover:bg-hundido', f.rojo && n < -0.005 && 'text-locoto')}>
                    {cifra(n) || '—'}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Anotar un movimiento ───────────────────────────────────────────────────

function HojaMovimiento({ mov, mes, categorias, grupos, detallesUsados, onCerrar }) {
  const qc = useQueryClient();
  // Las ocultas no se ofrecen, salvo la que ya tenía el movimiento.
  const elegibles = categorias.filter((c) => !c.auto && (c.activo !== false || c.clave === mov?.categoria));
  const hoy = hoyISO();
  const diaInicial = mov?.fecha ?? (hoy.startsWith(mes) ? hoy : `${mes}-01`);
  const [f, setF] = useState({
    fecha: diaInicial, categoria: mov?.categoria ?? 'sueldos', detalle: mov?.detalle ?? '',
    metodo_pago: mov?.metodo_pago ?? 'efectivo', monto: mov ? String(Number(mov.monto)) : '', tipo: mov?.tipo ?? 'ingreso',
  });
  const [error, setError] = useState('');
  const cat = elegibles.find((c) => c.clave === f.categoria);
  const esTraspaso = f.categoria === 'traspaso';
  const esAjuste = f.categoria === 'ajuste';
  const guardar = useMutation({
    mutationFn: () => {
      const datos = { ...f, monto: Number(f.monto), detalle: f.detalle.trim() || null };
      return mov ? editarMovimientoFlujo(mov.id, datos) : crearMovimientoFlujo(datos);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['flujo'] }); qc.invalidateQueries({ queryKey: ['libro'] }); avisar.ok(mov ? 'Movimiento actualizado' : 'Movimiento anotado'); onCerrar(); },
    onError: (e) => setError(errorDe(e)),
  });
  const poner = (k) => (e) => { setF({ ...f, [k]: e.target.value }); setError(''); };
  const valido = f.fecha && f.categoria && Number(f.monto) > 0;

  return (
    <Hoja onCerrar={onCerrar} bloquear={guardar.isPending} titulo={mov ? 'Editar movimiento' : 'Anotar movimiento'} ancho="max-w-md"
      subtitulo="Lo que pasa fuera de la caja: sueldos, servicios, retiros, traspasos."
      pie={(
        <div className="w-full space-y-2">
          {error && <p className="text-sm text-locoto">{error}</p>}
          <button data-principal className="btn-aji w-full" disabled={!valido || guardar.isPending} onClick={() => guardar.mutate()}>{mov ? 'Guardar cambios' : 'Anotar'}</button>
        </div>
      )}>
      <div className="space-y-3">
        <Campo etiqueta="Categoría" ayuda={cat?.ayuda}>
          <select className="campo" value={f.categoria} onChange={poner('categoria')} disabled={!!mov && mov.categoria === 'traspaso'}>
            {grupos.map((g) => {
              const cs = elegibles.filter((c) => c.grupo === g.clave);
              return cs.length ? <optgroup key={g.clave} label={g.nombre}>{cs.map((c) => <option key={c.clave} value={c.clave}>{c.nombre}</option>)}</optgroup> : null;
            })}
          </select>
        </Campo>
        {esAjuste && (
          <Segmentado className="w-full" valor={f.tipo} onCambio={(v) => setF({ ...f, tipo: v })} opciones={[{ valor: 'ingreso', etiqueta: 'Suma al saldo' }, { valor: 'egreso', etiqueta: 'Resta al saldo' }]} />
        )}
        <div className="grid grid-cols-2 gap-3">
          <Campo etiqueta="Día"><input type="date" className="campo" value={f.fecha} max={hoy} onChange={poner('fecha')} /></Campo>
          <Campo etiqueta="Monto"><input className="campo num" inputMode="decimal" value={f.monto} onChange={(e) => setF({ ...f, monto: numero(e.target.value) })} autoFocus={!mov} /></Campo>
        </div>
        <Campo etiqueta={esTraspaso ? 'Pasa de' : 'Medio'}>
          <Segmentado className="w-full" valor={f.metodo_pago} onCambio={(v) => setF({ ...f, metodo_pago: v })} opciones={esTraspaso
            ? [{ valor: 'qr', etiqueta: 'QR a efectivo', Icono: ArrowLeftRight }, { valor: 'efectivo', etiqueta: 'Efectivo a QR', Icono: ArrowLeftRight }]
            : [{ valor: 'efectivo', etiqueta: 'Efectivo', Icono: Wallet }, { valor: 'qr', etiqueta: 'QR / banco', Icono: QrCode }]} />
        </Campo>
        <Campo etiqueta={cat?.pideDetalle === 'persona' ? 'Persona' : 'Detalle'}>
          <input className="campo" list="detalles-flujo" value={f.detalle} onChange={poner('detalle')} maxLength={120}
            placeholder={cat?.pideDetalle === 'persona' ? 'Ej.: Jhoselin' : 'Opcional, ej.: Recibo de septiembre'} />
          <datalist id="detalles-flujo">{detallesUsados.map((d) => <option key={d} value={d} />)}</datalist>
        </Campo>
      </div>
    </Hoja>
  );
}

function ListaMovimientos({ movs, categorias, moneda, puedeEditar, onEditar }) {
  const qc = useQueryClient();
  const [confirmacion, confirmar] = useConfirmar();
  const borrar = useMutation({
    mutationFn: (m) => eliminarMovimientoFlujo(m.id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['flujo'] }); qc.invalidateQueries({ queryKey: ['libro'] }); avisar.ok('Movimiento borrado'); },
    onError: (e) => avisar.error(errorDe(e)),
  });
  const nombre = (k) => categorias.find((c) => c.clave === k)?.nombre ?? k;
  if (!movs.length) return <p className="text-sm text-tenue py-4">Todavía no anotaste nada este mes. Las ventas, compras y gastos de caja ya aparecen solos en la tabla.</p>;
  return (
    <ul className="divide-y divide-linea">
      {movs.map((m) => {
        const sale = m.tipo === 'egreso';
        return (
          <li key={m.id} className="py-2.5 flex items-center gap-3">
            <span className="num text-[13px] text-tenue w-12 shrink-0">{m.fecha.slice(8, 10)}/{m.fecha.slice(5, 7)}</span>
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{nombre(m.categoria)}{m.detalle ? <span className="text-tenue font-normal"> · {m.detalle}</span> : null}</p>
              <p className="text-[12px] text-tenue">
                {m.categoria === 'traspaso' ? `${m.metodo_pago === 'qr' ? 'QR' : 'Efectivo'} → ${m.destino === 'qr' ? 'QR' : 'Efectivo'}` : (m.metodo_pago === 'qr' ? 'QR / banco' : 'Efectivo')}
                {m.usuario?.nombre ? ` · ${m.usuario.nombre}` : ''}
              </p>
            </div>
            <span className={cx('num font-semibold', m.categoria === 'traspaso' ? '' : sale ? 'text-locoto' : 'text-hierba')}>
              {m.categoria === 'traspaso' ? '' : sale ? '−' : '+'}{dinero(Number(m.monto), moneda)}
            </span>
            {puedeEditar && (
              <span className="flex">
                <button className="btn-icono btn-fantasma h-8 w-8" onClick={() => onEditar(m)} aria-label="Editar"><Pencil className="w-4 h-4" /></button>
                <button className="btn-icono btn-fantasma h-8 w-8 text-locoto" disabled={borrar.isPending} aria-label="Borrar"
                  onClick={async () => { if (await confirmar({ titulo: '¿Borrar este movimiento?', texto: `${nombre(m.categoria)} por ${dinero(Number(m.monto), moneda)}. Se quita del flujo y del libro de caja.`, confirmar: 'Borrar', peligro: true })) borrar.mutate(m); }}>
                  <Trash2 className="w-4 h-4" />
                </button>
              </span>
            )}
          </li>
        );
      })}
      {confirmacion}
    </ul>
  );
}

// ── Página ─────────────────────────────────────────────────────────────────

export default function FlujoCajaPage() {
  const qc = useQueryClient();
  const moneda = useMoneda();
  const { tiene } = usePermisos();
  const [mes, setMes] = useState(() => hoyISO().slice(0, 7));
  const [vista, setVista] = useState('total');
  const [todas, setTodas] = useState(false);
  const [abiertos, setAbiertos] = useState(() => new Set(['ingresos', 'costo_variable', 'costo_fijo', 'otros_gastos', 'no_operativo', 'traspaso', 'ajuste']));
  const [hoja, setHoja] = useState(null); // null | { mov? }
  const [clasificar, setClasificar] = useState(false);
  const puedeVer = tiene('libro_caja', 'ver');
  const puedeEditar = tiene('libro_caja', 'crear');

  const q = useQuery({ queryKey: ['flujo', mes], queryFn: () => getFlujoCaja(mes), enabled: puedeVer, placeholderData: (x) => x });
  const movsQ = useQuery({ queryKey: ['flujo', 'movs', mes], queryFn: () => getMovimientosFlujo(mes), enabled: puedeVer });
  useSocket('restaurante:actualizar', () => qc.invalidateQueries({ queryKey: ['flujo'] }));
  const flujo = useMemo(() => (q.data ? armarFlujo(q.data) : null), [q.data]);
  const alternar = (k) => setAbiertos((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  if (!puedeVer) return <SinPermiso />;
  const movs = movsQ.data ?? [];
  const detallesUsados = [...new Set(movs.map((m) => m.detalle).filter(Boolean))];
  const r = flujo?.resumen;
  const esteMes = hoyISO().slice(0, 7);

  const exportar = () => {
    const filas = filasGrilla(flujo, new Set(flujo.bloques.flatMap((b) => [b.clave, ...b.categorias.map((c) => c.clave)])), todas);
    const sub = vista === 'separado';
    const columnas = [{ titulo: 'Concepto', valor: (f) => (f.tipo === 'cat' ? `  ${f.nombre}` : f.tipo === 'det' ? `      ${f.nombre}` : f.nombre) }];
    flujo.dias.forEach((d, i) => {
      if (sub) {
        columnas.push({ titulo: `${d.n} Efectivo`, valor: (f) => f.porDia[i].efectivo || '' });
        columnas.push({ titulo: `${d.n} QR`, valor: (f) => f.porDia[i].qr || '' });
      } else columnas.push({ titulo: String(d.n), valor: (f) => valores(f.porDia[i], vista)[0] || '' });
    });
    if (sub) {
      columnas.push({ titulo: 'Mes Efectivo', valor: (f) => f.total.efectivo });
      columnas.push({ titulo: 'Mes QR', valor: (f) => f.total.qr });
    } else columnas.push({ titulo: 'Mes', valor: (f) => valores(f.total, vista)[0] });
    exportarCsv(`flujo-de-caja-${mes}`, columnas, filas);
  };

  return (
    <Pagina>
      <Encabezado titulo="Flujo de caja" texto="Cuánta plata entra y sale cada día, en efectivo y QR. Las ventas, compras y gastos de caja se cargan solos."
        acciones={(
          <div className="flex flex-wrap items-center gap-2">
            {flujo && <BotonCsv onClick={exportar} />}
            {puedeEditar && <button className="btn-suave" onClick={() => setClasificar(true)}><Tags className="w-4 h-4" /> Clasificar gastos</button>}
            {puedeEditar && <button className="btn-aji" onClick={() => setHoja({})}><Plus className="w-4 h-4" /> Anotar movimiento</button>}
          </div>
        )} />

      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="flex items-center gap-1">
          <button className="btn-icono btn-fantasma" onClick={() => setMes(moverMes(mes, -1))} aria-label="Mes anterior"><ChevronLeft className="w-5 h-5" /></button>
          <p className="font-display font-bold text-xl w-48 text-center first-letter:uppercase">{nombreMes(mes)}</p>
          <button className="btn-icono btn-fantasma" onClick={() => setMes(moverMes(mes, 1))} disabled={mes >= esteMes} aria-label="Mes siguiente"><ChevronRight className="w-5 h-5" /></button>
          {mes !== esteMes && <button className="btn-suave h-9 ml-1" onClick={() => setMes(esteMes)}>Este mes</button>}
        </div>
      </div>

      {q.isLoading || !flujo ? <Cargando /> : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <Kpi etiqueta="Saldo al empezar" v={r.saldoInicial} moneda={moneda} tono={totalDe(r.saldoInicial) < 0 ? 'text-locoto' : ''} signo={totalDe(r.saldoInicial) < 0 ? '−' : ''} />
            <Kpi etiqueta="Entró" v={r.ingresos} moneda={moneda} tono="text-hierba" />
            <Kpi etiqueta="Gastos de la operación" v={r.gastos} moneda={moneda} nota={r.mayorGasto && totalDe(r.mayorGasto.total) > 0 ? `El mayor: ${r.mayorGasto.nombre}` : null} />
            <Kpi etiqueta="Retiros y fuera del negocio" v={r.fuera} moneda={moneda} />
            <Kpi etiqueta={r.mesEnCurso ? 'Saldo hoy' : 'Saldo al cerrar el mes'} v={r.saldoFinal} moneda={moneda}
              tono={totalDe(r.saldoFinal) < 0 ? 'text-locoto' : ''} signo={totalDe(r.saldoFinal) < 0 ? '−' : ''}
              nota={r.diasEnRojo ? `${r.diasEnRojo} ${r.diasEnRojo === 1 ? 'día' : 'días'} con flujo negativo` : null} />
          </div>

          <GraficoSaldo flujo={flujo} moneda={moneda} />

          <div className="flex flex-wrap items-center gap-3">
            <Segmentado tamano="sm" valor={vista} onCambio={setVista} opciones={VISTAS} />
            <label className="flex items-center gap-2 text-[13px] text-tenue">
              <input type="checkbox" checked={todas} onChange={(e) => setTodas(e.target.checked)} /> Mostrar también las categorías sin movimiento
            </label>
          </div>
          <Grilla flujo={flujo} vista={vista} abiertos={abiertos} alternar={alternar} todas={todas} />
          <p className="text-[12px] text-tenue">
            “Saldo al empezar” es todo lo registrado antes de este mes. Si el sistema es nuevo, anota con cuánto empezaste con “Saldo inicial o ajuste”.
            El flujo del día es ingresos menos gastos de la operación; los retiros, traspasos y ajustes cambian el saldo pero no el flujo.
          </p>

          <Tarjeta titulo="Anotado a mano este mes">
            {movsQ.isLoading ? <Cargando /> : (
              <ListaMovimientos movs={movs} categorias={q.data.categorias} moneda={moneda} puedeEditar={puedeEditar} onEditar={(m) => setHoja({ mov: m })} />
            )}
          </Tarjeta>
        </div>
      )}
      {!q.isLoading && !flujo && <Vacio titulo="No se pudo cargar el flujo" />}

      {hoja && q.data && (
        <HojaMovimiento mov={hoja.mov} mes={mes} categorias={q.data.categorias} grupos={q.data.grupos} detallesUsados={detallesUsados} onCerrar={() => setHoja(null)} />
      )}
      {clasificar && <ClasificarGastos onCerrar={() => setClasificar(false)} />}
    </Pagina>
  );
}

