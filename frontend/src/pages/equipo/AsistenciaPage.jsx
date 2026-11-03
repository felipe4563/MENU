import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, ListChecks, Pencil, AlertTriangle, MapPinOff } from 'lucide-react';
import { getFiltrosPersonal, getMarcacionesPersonal, getHorarioPersonal, guardarHorarioPersonal, resolverMarcacionPersonal, editarMarcacionPersonal } from '../../api/personal';
import { usePermisos } from '../../hooks/usePermisos';
import Hoja from '../../components/ui/Hoja';
import { Cargando, Campo, Encabezado, Pagina, Segmentado, SinPermiso, Vacio, Insignia } from '../../components/ui/piezas';
import { avisar } from '../../components/ui/Aviso';
import { cx, errorDe, hora, hoyISO, iniciales } from '../../lib/util';

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const hhmm = (f) => (f ? new Date(f).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit', hour12: false }) : '');
const iso = (fecha, h) => `${fecha}T${h}:00-04:00`;
const horas = (a, b) => (b ? ((new Date(b) - new Date(a)) / 3600000) : 0);

function HojaCorregir({ m, onCerrar }) {
  const qc = useQueryClient();
  const [entrada, setEntrada] = useState(hhmm(m.hora_entrada));
  const [salida, setSalida] = useState(hhmm(m.hora_salida_propuesta ?? m.hora_salida));
  const guardar = useMutation({
    mutationFn: () => (m.estado === 'cierre_automatico'
      ? resolverMarcacionPersonal(m.id, iso(m.fecha, salida))
      : editarMarcacionPersonal(m.id, { hora_entrada: iso(m.fecha, entrada), hora_salida: salida ? iso(m.fecha, salida) : undefined })),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['marcaciones'] }); avisar.ok('Registro corregido'); onCerrar(); },
    onError: (e) => avisar.error(errorDe(e)),
  });
  return (
    <Hoja onCerrar={onCerrar} titulo={`${m.usuario?.nombre} · ${m.fecha}`} ancho="max-w-sm"
      pie={<button data-principal className="btn-aji w-full" disabled={!salida || guardar.isPending} onClick={() => guardar.mutate()}>Guardar</button>}>
      {m.hora_salida_propuesta && <p className="text-sm rounded-xl bg-aji/20 px-3 py-2 mb-3">Propuso salir a las {hhmm(m.hora_salida_propuesta)}{m.nota_propuesta ? `: “${m.nota_propuesta}”` : ''}.</p>}
      <div className="grid grid-cols-2 gap-3">
        <Campo etiqueta="Entrada"><input type="time" className="campo" value={entrada} disabled={m.estado === 'cierre_automatico'} onChange={(e) => setEntrada(e.target.value)} /></Campo>
        <Campo etiqueta="Salida"><input type="time" className="campo" value={salida} onChange={(e) => setSalida(e.target.value)} /></Campo>
      </div>
    </Hoja>
  );
}

function Salida({ m }) {
  if (m.hora_salida) return <span className="num">{hora(m.hora_salida)}</span>;
  return m.estado === 'abierto' ? <Insignia tono="ok">Trabajando</Insignia> : <Insignia tono="alerta"><AlertTriangle className="w-3 h-3" /> Sin salida</Insignia>;
}

// En el celular la tabla no entra: lista agrupada por día, una fila por persona.
function ListaMovil({ lista, onEditar }) {
  const dias = [];
  for (const m of lista) {
    const ultimo = dias[dias.length - 1];
    if (ultimo?.fecha === m.fecha) ultimo.filas.push(m); else dias.push({ fecha: m.fecha, filas: [m] });
  }
  return (
    <div className="md:hidden space-y-4">
      {dias.map((d) => (
        <section key={d.fecha}>
          <h3 className="text-[13px] font-semibold text-tenue mb-1.5 px-1 first-letter:uppercase">
            {new Date(`${d.fecha}T12:00`).toLocaleDateString('es-BO', { weekday: 'long', day: 'numeric', month: 'long' })}
            <span className="font-normal"> · {d.filas.reduce((s, m) => s + horas(m.hora_entrada, m.hora_salida), 0).toFixed(1)} h</span>
          </h3>
          <ul className="ficha divide-y divide-linea">
            {d.filas.map((m) => (
              <li key={m.id}>
                <button onClick={() => onEditar(m)} className={cx('w-full text-left flex items-center gap-3 px-4 py-3', m.estado === 'cierre_automatico' && 'bg-aji/10')}>
                  <span className="w-9 h-9 rounded-full bg-hundido grid place-items-center text-xs font-bold shrink-0">{iniciales(m.usuario?.nombre)}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block font-semibold truncate">{m.usuario?.nombre}</span>
                    <span className="flex items-center gap-1.5 text-sm text-tenue">
                      <span className="num">{hora(m.hora_entrada)}</span>
                      {m.verificacion_entrada === 'fuera_de_rango' && <MapPinOff className="w-3.5 h-3.5 text-locoto" aria-label="Fuera del local" />}
                      <span>→</span><Salida m={m} />
                    </span>
                  </span>
                  <span className="num font-bold text-lg">{m.hora_salida ? `${horas(m.hora_entrada, m.hora_salida).toFixed(1)} h` : ''}</span>
                  <Pencil className="w-4 h-4 text-tenue shrink-0" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function Registros({ filtros }) {
  const [desde, setDesde] = useState(() => { const d = new Date(Date.now() - 6 * 86400000); return d.toISOString().slice(0, 10); });
  const [hasta, setHasta] = useState(hoyISO());
  const [usuario, setUsuario] = useState('');
  const [editar, setEditar] = useState(null);
  const q = useQuery({ queryKey: ['marcaciones', desde, hasta, usuario], queryFn: () => getMarcacionesPersonal({ desde, hasta, usuario_id: usuario || undefined }) });
  const lista = q.data ?? [];
  const total = lista.reduce((s, m) => s + horas(m.hora_entrada, m.hora_salida), 0);
  return (
    <>
      <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 mb-4">
        <input type="date" className="campo sm:w-auto" value={desde} onChange={(e) => setDesde(e.target.value)} aria-label="Desde" />
        <input type="date" className="campo sm:w-auto" value={hasta} onChange={(e) => setHasta(e.target.value)} aria-label="Hasta" />
        <select className="campo col-span-2 sm:w-auto" value={usuario} onChange={(e) => setUsuario(e.target.value)}>
          <option value="">Todo el personal</option>
          {(filtros?.empleados ?? []).map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
        </select>
        <p className="col-span-2 sm:ml-auto self-center text-sm text-tenue rounded-xl bg-hundido sm:bg-transparent px-3 py-2.5 sm:p-0"><b className="num text-tinta">{total.toFixed(1)} h</b> trabajadas en el periodo · <span className="num">{lista.length}</span> registros</p>
      </div>
      {q.isLoading ? <Cargando /> : lista.length === 0 ? <Vacio Icono={ListChecks} titulo="Sin registros en estas fechas" /> : (
        <>
        <ListaMovil lista={lista} onEditar={setEditar} />
        <div className="ficha overflow-x-auto hidden md:block">
          <table className="w-full text-sm">
            <thead className="text-left text-tenue text-[13px]"><tr className="border-b border-linea">
              <th className="px-4 py-3 font-medium">Persona</th><th className="px-4 py-3 font-medium">Día</th><th className="px-4 py-3 font-medium">Entrada</th><th className="px-4 py-3 font-medium">Salida</th><th className="px-4 py-3 font-medium text-right">Horas</th><th />
            </tr></thead>
            <tbody className="divide-y divide-linea">
              {lista.map((m) => (
                <tr key={m.id} className={cx(m.estado === 'cierre_automatico' && 'bg-aji/10')}>
                  <td className="px-4 py-2.5 font-medium">{m.usuario?.nombre}<span className="block text-xs text-tenue font-normal">{m.sucursal?.nombre}</span></td>
                  <td className="px-4 py-2.5">{new Date(`${m.fecha}T12:00`).toLocaleDateString('es-BO', { weekday: 'short', day: 'numeric', month: 'short' })}</td>
                  <td className="px-4 py-2.5 num">{hora(m.hora_entrada)} {m.verificacion_entrada === 'fuera_de_rango' && <MapPinOff className="inline w-3.5 h-3.5 text-locoto" aria-label="Fuera del local" />}</td>
                  <td className="px-4 py-2.5"><Salida m={m} /></td>
                  <td className="px-4 py-2.5 num text-right">{m.hora_salida ? horas(m.hora_entrada, m.hora_salida).toFixed(1) : '—'}</td>
                  <td className="px-2"><button className="btn-icono btn-fantasma h-8 w-8" onClick={() => setEditar(m)} aria-label="Corregir"><Pencil className="w-4 h-4" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}
      {editar && <HojaCorregir m={editar} onCerrar={() => setEditar(null)} />}
    </>
  );
}

function Horarios({ filtros }) {
  const qc = useQueryClient();
  const [usuario, setUsuario] = useState('');
  const q = useQuery({ queryKey: ['horario', usuario], queryFn: () => getHorarioPersonal(usuario), enabled: !!usuario });
  const [dias, setDias] = useState(null);
  const actuales = dias ?? q.data;
  const guardar = useMutation({
    mutationFn: () => guardarHorarioPersonal(usuario, actuales.map((d) => ({ ...d, hora_entrada: d.hora_entrada?.slice(0, 5) ?? null, hora_salida: d.hora_salida?.slice(0, 5) ?? null }))),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['horario', usuario] }); setDias(null); avisar.ok('Horario guardado'); },
    onError: (e) => avisar.error(errorDe(e)),
  });
  const set = (i, k, v) => setDias(actuales.map((d, j) => (j === i ? { ...d, [k]: v } : d)));
  return (
    <div className="max-w-2xl">
      <select className="campo mb-4" value={usuario} onChange={(e) => { setUsuario(e.target.value); setDias(null); }}>
        <option value="">Elige a una persona…</option>
        {(filtros?.empleados ?? []).map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
      </select>
      {usuario && (q.isLoading ? <Cargando /> : actuales && (
        <>
          <ul className="ficha divide-y divide-linea">
            {[1, 2, 3, 4, 5, 6, 0].map((dia) => {
              const i = actuales.findIndex((d) => d.dia_semana === dia);
              const d = actuales[i];
              return (
                <li key={dia} className="flex items-center gap-3 px-4 py-2.5">
                  <label className="flex items-center gap-2 w-32 font-medium"><input type="checkbox" checked={d.trabaja} onChange={(e) => set(i, 'trabaja', e.target.checked)} /> {DIAS[dia]}</label>
                  {d.trabaja ? (
                    <div className="flex items-center gap-2 text-sm">
                      <input type="time" className="campo h-9 w-32" value={d.hora_entrada?.slice(0, 5) ?? ''} onChange={(e) => set(i, 'hora_entrada', e.target.value)} />
                      <span className="text-tenue">a</span>
                      <input type="time" className="campo h-9 w-32" value={d.hora_salida?.slice(0, 5) ?? ''} onChange={(e) => set(i, 'hora_salida', e.target.value)} />
                    </div>
                  ) : <span className="text-sm text-tenue">Descansa</span>}
                </li>
              );
            })}
          </ul>
          {dias && <button className="btn-aji mt-4" disabled={guardar.isPending} onClick={() => guardar.mutate()}>Guardar horario</button>}
        </>
      ))}
    </div>
  );
}

export default function AsistenciaPage() {
  const { tiene } = usePermisos();
  const [tab, setTab] = useState('registros');
  const filtros = useQuery({ queryKey: ['personal-filtros'], queryFn: getFiltrosPersonal, enabled: tiene('personal', 'administrar') });
  if (!tiene('personal', 'administrar')) return <SinPermiso />;
  return (
    <Pagina>
      <Encabezado titulo="Asistencia" texto="Entradas y salidas del personal, y sus horarios."
        acciones={<Segmentado valor={tab} onCambio={setTab} opciones={[{ valor: 'registros', etiqueta: 'Registros', Icono: ListChecks }, { valor: 'horarios', etiqueta: 'Horarios', Icono: CalendarClock }]} />} />
      {tab === 'registros' ? <Registros filtros={filtros.data} /> : <Horarios filtros={filtros.data} />}
    </Pagina>
  );
}
