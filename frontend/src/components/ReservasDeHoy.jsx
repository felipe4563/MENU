import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Armchair, CalendarClock, ChevronDown, Users } from 'lucide-react';
import { getPlatosDeReservas } from '../api/reservas';
import { usePermisos } from '../hooks/usePermisos';
import { useSocket } from '../hooks/useSocket';
import { cx, hoyISO } from '../lib/util';

// Platos de las reservas por llegar de hoy: totales por plato y, plegado, cada
// reserva. Va en Cocina (oscuro) y arriba de la lista en Reservas. No se
// muestra si hoy no hay reservas con platos.
export default function ReservasDeHoy({ oscuro = false, className }) {
  const { tiene } = usePermisos();
  const qc = useQueryClient();
  const [abierta, setAbierta] = useState(false);
  const fecha = hoyISO();
  const q = useQuery({
    queryKey: ['reservas', 'platos-del-dia', fecha],
    queryFn: () => getPlatosDeReservas(fecha),
    enabled: tiene('ventas', 'ver') || tiene('cocina', 'ver'),
    refetchInterval: 5 * 60_000,
  });
  useSocket('restaurante:actualizar', (d) => { if (d?.tipo === 'reserva') qc.invalidateQueries({ queryKey: ['reservas', 'platos-del-dia'] }); });

  const reservas = q.data?.reservas ?? [];
  if (!reservas.length) return null;
  const totales = q.data.totales ?? [];
  const platos = totales.reduce((s, t) => s + t.cantidad, 0);
  const tenue = oscuro ? 'text-white/55' : 'text-tenue';

  return (
    <section className={cx('rounded-2xl border p-4', oscuro ? 'border-white/15 bg-white/5 text-white' : 'ficha', className)}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <CalendarClock className={cx('w-5 h-5', oscuro ? 'text-aji' : 'text-tenue')} />
        <h2 className="font-display font-bold text-lg">Reservas de hoy</h2>
        <span className={cx('text-sm num', tenue)}>
          {reservas.length} {reservas.length === 1 ? 'reserva' : 'reservas'} · {platos} {platos === 1 ? 'plato' : 'platos'}
        </span>
        <button type="button" onClick={() => setAbierta((v) => !v)} aria-expanded={abierta}
          className={cx('ml-auto inline-flex items-center gap-1 rounded-lg px-2 h-8 text-sm font-semibold', oscuro ? 'text-white/80 hover:bg-white/10' : 'hover:bg-hundido')}>
          {abierta ? 'Ocultar' : 'Ver reservas'} <ChevronDown className={cx('w-4 h-4 transition', abierta && 'rotate-180')} />
        </button>
      </div>

      <ul className="flex flex-wrap gap-2 mt-3">
        {totales.map((t) => (
          <li key={t.nombre} className={cx('rounded-xl px-3 py-1.5 text-sm', oscuro ? 'bg-white/10' : 'bg-hundido')}>
            <span className="num font-extrabold mr-1.5">{t.cantidad}×</span>{t.nombre}
          </li>
        ))}
      </ul>

      {abierta && (
        <ul className={cx('mt-4 divide-y', oscuro ? 'divide-white/10' : 'divide-linea')}>
          {reservas.map((r) => (
            <li key={r.id} className="py-3 flex gap-4">
              <span className="num font-display font-extrabold text-xl w-14 shrink-0 leading-6">{r.hora}</span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold leading-6">{r.nombre_cliente}</p>
                <p className={cx('text-sm flex flex-wrap gap-x-4', tenue)}>
                  <span className="inline-flex items-center gap-1"><Users className="w-3.5 h-3.5" /> {r.personas} {r.personas === 1 ? 'persona' : 'personas'}</span>
                  {r.mesa && <span className="inline-flex items-center gap-1"><Armchair className="w-3.5 h-3.5" /> {r.mesa}</span>}
                </p>
                <ul className="mt-1.5 space-y-0.5 text-sm">
                  {r.items.map((i, n) => (
                    <li key={n}>
                      <span className="num font-bold">{i.cantidad}×</span> {i.nombre}
                      {i.nota && <span className={cx('italic', tenue)}> · “{i.nota}”</span>}
                    </li>
                  ))}
                </ul>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
