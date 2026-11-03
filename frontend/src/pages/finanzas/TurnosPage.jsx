import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { History, ChevronRight } from 'lucide-react';
import { getSesiones } from '../../api/caja';
import { usePermisos } from '../../hooks/usePermisos';
import { useMoneda } from '../../hooks/useConfig';
import { Cargando, Encabezado, Pagina, SinPermiso, Vacio, Insignia } from '../../components/ui/piezas';
import { cx, dinero, fechaHora, hora } from '../../lib/util';

export default function TurnosPage() {
  const { tiene } = usePermisos();
  const moneda = useMoneda();
  const q = useQuery({ queryKey: ['sesiones'], queryFn: getSesiones, enabled: tiene('caja', 'ver') });
  if (!tiene('caja', 'ver')) return <SinPermiso />;
  return (
    <Pagina>
      <Encabezado titulo="Turnos de caja" texto="Los últimos 50 turnos. Toca uno para ver su cierre." />
      {q.isLoading ? <Cargando /> : (q.data ?? []).length === 0 ? <Vacio Icono={History} titulo="Todavía no hay turnos" /> : (
        <ul className="ficha divide-y divide-linea">
          {q.data.map((s) => {
            const dif = Number(s.diferencia || 0);
            const tol = Number(s.sucursal?.tolerancia_cierre_caja || 0);
            return (
              <li key={s.id}>
                <Link to={`/caja/cierre/${s.id}`} className="flex items-center gap-3 px-4 py-3.5 hover:bg-hundido">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold">{s.usuario?.nombre} <span className="text-tenue font-normal">· {s.sucursal?.nombre}</span></p>
                    <p className="text-xs text-tenue">{fechaHora(s.abierto_en)} → {s.cerrado_en ? hora(s.cerrado_en) : 'abierto'}</p>
                  </div>
                  <span className="num text-sm text-tenue hidden sm:block">vendió {dinero(s.total_ventas, moneda)}</span>
                  {s.estado === 'abierta' ? <Insignia tono="alerta">Abierto</Insignia> : (
                    <span className={cx('num font-semibold w-20 text-right', Math.abs(dif) < 0.005 ? 'text-hierba' : Math.abs(dif) > tol ? 'text-locoto' : '')}>{dif > 0 ? '+' : ''}{dif.toFixed(2)}</span>
                  )}
                  <ChevronRight className="w-4 h-4 text-tenue" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Pagina>
  );
}
