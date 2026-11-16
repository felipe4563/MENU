import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CalendarDays, ChevronLeft, ChevronRight, Plus, Users, Armchair, Phone, Pencil, Check, X, UserX } from 'lucide-react';
import { getReservas, crearReserva, actualizarReserva, cambiarEstadoReserva } from '../../api/reservas';
import { getMesas } from '../../api/mesas';
import { usePermisos } from '../../hooks/usePermisos';
import { useSocket } from '../../hooks/useSocket';
import Hoja from '../../components/ui/Hoja';
import { Cargando, Campo, Pagina, SinPermiso, Vacio } from '../../components/ui/piezas';
import { avisar } from '../../components/ui/Aviso';
import { cx, errorDe, hora, hoyISO } from '../../lib/util';
import { ESTADOS_RESERVA, atrasada, partesFecha, sumarDias } from '../../lib/reservas';

const DURACIONES = [60, 90, 120, 150, 180, 240];
const duracionTexto = (m) => (m % 60 ? `${Math.floor(m / 60) ? `${Math.floor(m / 60)} h ` : ''}${m % 60} min` : `${m / 60} h`);

function tituloDia(ymd) {
  const hoy = hoyISO();
  if (ymd === hoy) return 'Hoy';
  if (ymd === sumarDias(hoy, 1)) return 'Mañana';
  if (ymd === sumarDias(hoy, -1)) return 'Ayer';
  return new Date(`${ymd}T12:00`).toLocaleDateString('es-BO', { weekday: 'long', day: 'numeric', month: 'long' });
}

function HojaReserva({ reserva, fecha, mesas, onCerrar }) {
  const qc = useQueryClient();
  const inicio = reserva ? partesFecha(reserva.fecha_hora) : { fecha, hora: '20:00' };
  const [f, setF] = useState({
    nombre_cliente: reserva?.nombre_cliente ?? '',
    telefono: reserva?.telefono ?? '',
    personas: String(reserva?.personas ?? 2),
    fecha: inicio.fecha,
    hora: inicio.hora,
    duracion_min: reserva?.duracion_min ?? 120,
    mesa_id: reserva?.mesa_id ? String(reserva.mesa_id) : '',
    notas: reserva?.notas ?? '',
  });
  const [error, setError] = useState('');
  const poner = (k) => (e) => { setF({ ...f, [k]: e.target.value }); setError(''); };
  const personas = parseInt(f.personas, 10) || 0;
  const guardar = useMutation({
    mutationFn: () => {
      const datos = {
        nombre_cliente: f.nombre_cliente.trim(), telefono: f.telefono.trim() || null, personas,
        fecha_hora: `${f.fecha}T${f.hora}`, duracion_min: Number(f.duracion_min), mesa_id: f.mesa_id ? Number(f.mesa_id) : null, notas: f.notas.trim() || null,
      };
      return reserva ? actualizarReserva(reserva.id, datos) : crearReserva(datos);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['reservas'] }); avisar.ok(reserva ? 'Reserva actualizada' : 'Reserva anotada'); onCerrar(); },
    onError: (e) => setError(errorDe(e)),
  });
  const valido = f.nombre_cliente.trim() && personas >= 1 && f.fecha && f.hora;

  return (
    <Hoja onCerrar={onCerrar} bloquear={guardar.isPending} titulo={reserva ? 'Editar reserva' : 'Nueva reserva'} ancho="max-w-lg"
      pie={(
        <div className="w-full space-y-2">
          {error && <p className="text-sm text-locoto">{error}</p>}
          <button data-principal className="btn-aji w-full" disabled={!valido || guardar.isPending} onClick={() => guardar.mutate()}>{reserva ? 'Guardar cambios' : 'Anotar reserva'}</button>
        </div>
      )}>
      <div className="space-y-3">
        <Campo etiqueta="A nombre de"><input autoFocus className="campo" value={f.nombre_cliente} onChange={poner('nombre_cliente')} placeholder="Ej.: Familia Rojas" maxLength={100} /></Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo etiqueta="Teléfono"><input inputMode="tel" className="campo" value={f.telefono} onChange={poner('telefono')} placeholder="Opcional" maxLength={30} /></Campo>
          <Campo etiqueta="Personas"><input inputMode="numeric" className="campo num" value={f.personas} onChange={(e) => setF({ ...f, personas: e.target.value.replace(/\D/g, '').slice(0, 3) })} /></Campo>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Campo etiqueta="Día"><input type="date" className="campo" value={f.fecha} min={reserva ? undefined : hoyISO()} onChange={poner('fecha')} /></Campo>
          <Campo etiqueta="Hora"><input type="time" className="campo" value={f.hora} onChange={poner('hora')} /></Campo>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Campo etiqueta="Mesa">
            <select className="campo" value={f.mesa_id} onChange={poner('mesa_id')}>
              <option value="">Elegir al llegar</option>
              {mesas.map((m) => (
                <option key={m.id} value={m.id}>{m.nombre}{m.area?.nombre ? ` · ${m.area.nombre}` : ''} ({m.asientos ?? 4}){(m.asientos ?? 4) < personas ? ' · chica' : ''}</option>
              ))}
            </select>
          </Campo>
          <Campo etiqueta="Ocupa la mesa">
            <select className="campo" value={f.duracion_min} onChange={poner('duracion_min')}>
              {DURACIONES.map((d) => <option key={d} value={d}>{duracionTexto(d)}</option>)}
            </select>
          </Campo>
        </div>
        <Campo etiqueta="Nota"><input className="campo" value={f.notas} onChange={poner('notas')} placeholder="Cumpleaños, silla de bebé…" maxLength={255} /></Campo>
      </div>
    </Hoja>
  );
}

function TarjetaReserva({ r, puedeEditar, onEditar, onEstado, cambiando }) {
  const estado = ESTADOS_RESERVA[r.estado] ?? ESTADOS_RESERVA.pendiente;
  const tarde = atrasada(r);
  const fin = new Date(new Date(r.fecha_hora).getTime() + r.duracion_min * 60000);
  const activa = r.estado === 'pendiente';
  return (
    <li className={cx('ficha p-4 flex gap-4', !['pendiente', 'llego'].includes(r.estado) && 'opacity-60')}>
      <div className="w-16 shrink-0">
        <p className="num font-display font-extrabold text-2xl leading-none">{hora(r.fecha_hora)}</p>
        <p className="num text-xs text-tenue mt-1">hasta {hora(fin)}</p>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold text-lg leading-tight mr-auto">{r.nombre_cliente}</p>
          <span className={cx('rounded-full px-2 py-0.5 text-xs font-semibold', tarde ? 'bg-locoto/10 text-locoto' : estado.tono)}>{tarde ? 'Atrasados' : estado.nombre}</span>
        </div>
        <p className="text-sm text-tenue flex flex-wrap gap-x-4 gap-y-1 mt-1">
          <span className="inline-flex items-center gap-1"><Users className="w-3.5 h-3.5" /> {r.personas} {r.personas === 1 ? 'persona' : 'personas'}</span>
          <span className="inline-flex items-center gap-1"><Armchair className="w-3.5 h-3.5" /> {r.mesa?.nombre ?? 'Mesa al llegar'}</span>
          {r.telefono && <a href={`tel:${r.telefono}`} className="inline-flex items-center gap-1 underline underline-offset-2"><Phone className="w-3.5 h-3.5" /> {r.telefono}</a>}
        </p>
        {r.notas && <p className="text-sm mt-1">{r.notas}</p>}
        {puedeEditar && activa && (
          <div className="flex flex-wrap gap-2 mt-3">
            <button className="btn-aji h-9" disabled={cambiando} onClick={() => onEstado(r, 'llego')}><Check className="w-4 h-4" /> Llegaron</button>
            <button className="btn-borde h-9" onClick={() => onEditar(r)}><Pencil className="w-4 h-4" /> Editar</button>
            <button className="btn-fantasma h-9" disabled={cambiando} onClick={() => onEstado(r, 'no_vino')}><UserX className="w-4 h-4" /> No vino</button>
            <button className="btn-fantasma h-9 text-locoto" disabled={cambiando} onClick={() => onEstado(r, 'cancelada')}><X className="w-4 h-4" /> Cancelar</button>
          </div>
        )}
        {puedeEditar && !activa && (
          <button className="btn-fantasma h-8 mt-2 text-sm" disabled={cambiando} onClick={() => onEstado(r, 'pendiente')}>Volver a “por llegar”</button>
        )}
      </div>
    </li>
  );
}

export default function ReservasPage() {
  const qc = useQueryClient();
  const { tiene } = usePermisos();
  const [fecha, setFecha] = useState(hoyISO());
  const [hoja, setHoja] = useState(null); // null | { reserva? }
  const q = useQuery({ queryKey: ['reservas', fecha], queryFn: () => getReservas(fecha), enabled: tiene('ventas', 'ver') });
  const mesasQ = useQuery({ queryKey: ['mesas'], queryFn: () => getMesas(), enabled: tiene('ventas', 'ver') });
  useSocket('restaurante:actualizar', (d) => { if (d?.tipo === 'reserva') qc.invalidateQueries({ queryKey: ['reservas'] }); });

  const estado = useMutation({
    mutationFn: ({ r, nuevo }) => cambiarEstadoReserva(r.id, nuevo),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reservas'] }),
    onError: (e) => avisar.error(errorDe(e)),
  });

  if (!tiene('ventas', 'ver')) return <SinPermiso />;
  const puedeEditar = tiene('ventas', 'crear');
  const lista = q.data ?? [];
  const activas = lista.filter((r) => ['pendiente', 'llego'].includes(r.estado));
  const personas = activas.reduce((s, r) => s + r.personas, 0);

  return (
    <Pagina>
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <Link to="/vender" className="btn-icono btn-fantasma" aria-label="Volver a vender"><ArrowLeft className="w-5 h-5" /></Link>
        <div className="mr-auto">
          <h1 className="text-2xl sm:text-3xl font-bold leading-tight">Reservas</h1>
          <p className="text-sm text-tenue first-letter:uppercase">{tituloDia(fecha)} · {activas.length} {activas.length === 1 ? 'reserva' : 'reservas'}{personas ? ` · ${personas} personas` : ''}</p>
        </div>
        <div className="flex items-center gap-1">
          <button className="btn-icono btn-fantasma" onClick={() => setFecha(sumarDias(fecha, -1))} aria-label="Día anterior"><ChevronLeft className="w-5 h-5" /></button>
          <input type="date" className="campo h-10 w-40" value={fecha} onChange={(e) => e.target.value && setFecha(e.target.value)} aria-label="Elegir día" />
          <button className="btn-icono btn-fantasma" onClick={() => setFecha(sumarDias(fecha, 1))} aria-label="Día siguiente"><ChevronRight className="w-5 h-5" /></button>
          {fecha !== hoyISO() && <button className="btn-suave h-10" onClick={() => setFecha(hoyISO())}>Hoy</button>}
        </div>
        {puedeEditar && <button className="btn-aji" onClick={() => setHoja({})}><Plus className="w-4 h-4" /> Nueva reserva</button>}
      </div>

      {q.isLoading ? <Cargando /> : lista.length === 0 ? (
        <Vacio Icono={CalendarDays} titulo="Sin reservas este día" texto={puedeEditar ? 'Anota una con “Nueva reserva”. La mesa se marca como reservada en el salón una hora antes.' : undefined} />
      ) : (
        <ul className="grid lg:grid-cols-2 gap-3">
          {lista.map((r) => (
            <TarjetaReserva key={r.id} r={r} puedeEditar={puedeEditar} cambiando={estado.isPending}
              onEditar={(x) => setHoja({ reserva: x })} onEstado={(x, nuevo) => estado.mutate({ r: x, nuevo })} />
          ))}
        </ul>
      )}

      {hoja && <HojaReserva reserva={hoja.reserva} fecha={fecha < hoyISO() ? hoyISO() : fecha} mesas={mesasQ.data ?? []} onCerrar={() => setHoja(null)} />}
    </Pagina>
  );
}
