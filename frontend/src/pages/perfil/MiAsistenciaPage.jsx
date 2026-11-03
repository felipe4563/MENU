import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MapPin, LogIn, LogOut, Loader2, AlertTriangle } from 'lucide-react';
import { marcarAsistencia, getMiEstadoAsistencia, proponerHoraSalida } from '../../api/personal';
import { useAuthStore } from '../../store/authStore';
import Hoja from '../../components/ui/Hoja';
import { Cargando, Campo, Pagina, Insignia } from '../../components/ui/piezas';
import { avisar } from '../../components/ui/Aviso';
import { cx, errorDe, hora } from '../../lib/util';

const duracion = (a, b) => {
  const m = Math.max(0, Math.round((new Date(b ?? Date.now()) - new Date(a)) / 60000));
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
};

function ubicacion() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve({});
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve({}),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  });
}

export default function MiAsistenciaPage() {
  const qc = useQueryClient();
  const sucursal = useAuthStore((s) => s.usuario?.sucursal_activa);
  const [corregir, setCorregir] = useState(null);
  const [horaProp, setHoraProp] = useState('');
  const [nota, setNota] = useState('');
  const q = useQuery({ queryKey: ['mi-asistencia'], queryFn: getMiEstadoAsistencia, refetchInterval: 60_000 });
  const marcar = useMutation({
    mutationFn: async () => marcarAsistencia(await ubicacion()),
    onSuccess: (m) => { qc.invalidateQueries({ queryKey: ['mi-asistencia'] }); avisar.ok(m?.estado === 'abierto' ? '¡Entrada registrada! Buen turno.' : 'Salida registrada. ¡Hasta luego!'); },
    onError: (e) => avisar.error(errorDe(e)),
  });
  const proponer = useMutation({
    mutationFn: () => proponerHoraSalida(corregir.id, { hora_salida_propuesta: `${corregir.fecha}T${horaProp}:00-04:00`, nota_propuesta: nota.trim() || undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['mi-asistencia'] }); setCorregir(null); avisar.ok('Enviado. Tu administrador lo revisará.'); },
    onError: (e) => avisar.error(errorDe(e)),
  });

  if (q.isLoading) return <Cargando />;
  const { marcacion_abierta: abierta, historial = [], correccion_pendiente: pendiente } = q.data ?? {};

  return (
    <Pagina>
      <h1 className="text-[30px] font-extrabold leading-none">Mi asistencia</h1>
      <p className="text-tenue mt-1.5 mb-6 flex items-center gap-1"><MapPin className="w-4 h-4" /> {sucursal?.nombre ?? 'Elige una sucursal al entrar'}</p>

      <div className="grid lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] 2xl:grid-cols-[minmax(0,480px)_minmax(0,1fr)] gap-6 lg:gap-8 items-start">
      <div className="lg:sticky lg:top-6">
      {pendiente && (
        <button onClick={() => { setCorregir(pendiente); setHoraProp(''); setNota(''); }} className="w-full text-left mb-4 rounded-2xl bg-aji/20 p-4 flex gap-3">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <span className="text-sm"><b>Olvidaste marcar tu salida el {pendiente.fecha}.</b> Toca aquí para decir a qué hora saliste.</span>
        </button>
      )}

      <section className={cx('rounded-3xl p-6 text-center', abierta ? 'bg-pizarra text-sobre-pizarra' : 'ficha')}>
        {abierta ? (
          <>
            <p className="text-sm opacity-70">Entraste a las {hora(abierta.hora_entrada)}</p>
            <p className="num text-5xl font-extrabold my-2">{duracion(abierta.hora_entrada)}</p>
            <p className="text-sm opacity-70 mb-5">trabajando</p>
          </>
        ) : (
          <>
            <p className="font-display text-2xl font-bold">¿Empiezas tu turno?</p>
            <p className="text-sm text-tenue mt-1 mb-5">Se usa tu ubicación para confirmar que estás en el local.</p>
          </>
        )}
        <button className={cx('btn btn-lg w-full', abierta ? 'bg-locoto text-white' : 'bg-hierba text-white')} disabled={marcar.isPending || !sucursal?.id} onClick={() => marcar.mutate()}>
          {marcar.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : abierta ? <><LogOut className="w-5 h-5" /> Marcar salida</> : <><LogIn className="w-5 h-5" /> Marcar entrada</>}
        </button>
      </section>
      </div>

      <div>
      <h2 className="text-lg font-bold mb-3">Últimos días</h2>
      {historial.length === 0 ? <p className="text-sm text-tenue">Todavía no hay registros.</p> : (
        <ul className="ficha divide-y divide-linea">
          {historial.map((m) => (
            <li key={m.id} className="px-4 py-3 flex items-center gap-3 text-sm">
              <span className="w-24 font-medium">{new Date(`${m.fecha}T12:00`).toLocaleDateString('es-BO', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
              <span className="flex-1 num text-tenue">{hora(m.hora_entrada)} → {m.hora_salida ? hora(m.hora_salida) : '…'}</span>
              {m.hora_salida && <span className="num">{duracion(m.hora_entrada, m.hora_salida)}</span>}
              {m.estado === 'cierre_automatico' && <Insignia tono="alerta">Sin salida</Insignia>}
            </li>
          ))}
        </ul>
      )}
      </div>
      </div>

      {corregir && (
        <Hoja onCerrar={() => setCorregir(null)} titulo="¿A qué hora saliste?" subtitulo={`Día ${corregir.fecha}, entraste a las ${hora(corregir.hora_entrada)}`} ancho="max-w-sm"
          pie={<button data-principal className="btn-aji w-full" disabled={!horaProp || proponer.isPending} onClick={() => proponer.mutate()}>Enviar</button>}>
          <div className="space-y-3">
            <Campo etiqueta="Hora de salida"><input type="time" autoFocus className="campo" value={horaProp} onChange={(e) => setHoraProp(e.target.value)} /></Campo>
            <Campo etiqueta="Comentario (opcional)"><input className="campo" value={nota} onChange={(e) => setNota(e.target.value)} /></Campo>
          </div>
        </Hoja>
      )}
    </Pagina>
  );
}
