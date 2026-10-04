import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Landmark, AlertTriangle, User } from 'lucide-react';
import { getReporteArqueos, getReporteArqueosResumen } from '../../../api/reportes';
import { useAuthStore } from '../../../store/authStore';
import { FiltroFechas, StatCard, Skeleton, bs, fechaHora, hoy, inicioMes } from '../shared';
import Paginacion from '../../../components/ui/Paginacion';

function diferenciaColor(fueraDeTolerancia, diferencia) {
  if (Math.abs(parseFloat(diferencia || 0)) < 0.01) return 'text-emerald-600 dark:text-emerald-400';
  return fueraDeTolerancia ? 'text-rose-600 dark:text-rose-400' : 'text-amber-600 dark:text-amber-400';
}

function ArqueoCard({ s, mostrarSucursal }) {
  const diferencia = parseFloat(s.diferencia ?? 0);
  return (
    <div className="bg-card border border-border rounded-xl p-3.5 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground whitespace-nowrap">{fechaHora(s.cerrado_en)}</p>
          <p className="font-medium text-foreground flex items-center gap-1.5">
            <User className="w-3.5 h-3.5 shrink-0" /> {s.usuario?.nombre ?? '—'}
          </p>
          {mostrarSucursal && s.sucursal?.nombre && (
            <p className="text-xs text-muted-foreground">{s.sucursal.nombre}</p>
          )}
        </div>
        <p className={`font-bold shrink-0 whitespace-nowrap ${diferenciaColor(s.fuera_de_tolerancia, diferencia)}`}>
          {diferencia >= 0 ? '+' : ''}{bs(diferencia)}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs text-center">
        <div className="bg-muted rounded-lg px-2 py-1.5">
          <p className="text-muted-foreground font-medium mb-0.5">Esperado</p>
          <p className="font-bold text-foreground">{bs(parseFloat(s.monto_cierre ?? 0) - diferencia)}</p>
        </div>
        <div className="bg-muted rounded-lg px-2 py-1.5">
          <p className="text-muted-foreground font-medium mb-0.5">Contado</p>
          <p className="font-bold text-foreground">{bs(s.monto_cierre)}</p>
        </div>
      </div>
      {s.nota_diferencia && (
        <p className="text-xs text-muted-foreground pt-1 border-t border-border">
          <span className="font-medium">Motivo:</span> {s.nota_diferencia}
        </p>
      )}
    </div>
  );
}

export default function TabArqueos() {
  const accesoTodas = useAuthStore((s) => s.usuario?.sucursal_activa?.id == null);
  const [filtroSucursal, setFiltroSucursal] = useState('todas');
  const [filtroCajero, setFiltroCajero] = useState('todos');
  const [desde, setDesde] = useState(inicioMes());
  const [hasta, setHasta] = useState(hoy());
  const [pagina, setPagina] = useState(1);

  const filtrosApi = {
    desde, hasta,
    sucursal_id: accesoTodas && filtroSucursal !== 'todas' ? filtroSucursal : undefined,
    usuario_id: filtroCajero !== 'todos' ? filtroCajero : undefined,
  };

  const filtrosKey = `${desde}|${hasta}|${filtroSucursal}|${filtroCajero}`;
  const [prevFiltrosKey, setPrevFiltrosKey] = useState(filtrosKey);
  if (filtrosKey !== prevFiltrosKey) {
    setPrevFiltrosKey(filtrosKey);
    setPagina(1);
  }

  const { data: paginaDatos, isLoading } = useQuery({
    queryKey: ['reporte-arqueos', filtrosApi, pagina],
    queryFn: () => getReporteArqueos({ ...filtrosApi, pagina }),
  });
  const data = useMemo(() => paginaDatos?.filas ?? [], [paginaDatos]);
  const totalPaginas = paginaDatos?.total_paginas ?? 1;

  const { data: resumen } = useQuery({
    queryKey: ['reporte-arqueos-resumen', filtrosApi],
    queryFn: () => getReporteArqueosResumen(filtrosApi),
  });
  const sucursales = resumen?.filtros?.sucursales ?? [];
  const cajeros = resumen?.filtros?.cajeros ?? [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <FiltroFechas desde={desde} hasta={hasta} setDesde={setDesde} setHasta={setHasta} />
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Cajero</label>
          <select value={filtroCajero} onChange={e => setFiltroCajero(e.target.value)}
            className="px-3 py-2 text-sm rounded-xl border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring">
            <option value="todos">Todos</option>
            {cajeros.map(c => <option key={c.id} value={String(c.id)}>{c.nombre}</option>)}
          </select>
        </div>
        {accesoTodas && (
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Sucursal</label>
            <select value={filtroSucursal} onChange={e => setFiltroSucursal(e.target.value)}
              className="px-3 py-2 text-sm rounded-xl border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring">
              <option value="todas">Todas</option>
              {sucursales.map(s => <option key={s.id} value={String(s.id)}>{s.nombre}</option>)}
            </select>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <StatCard label="Cierres registrados" valor={paginaDatos?.total ?? 0} color="primary" Icono={Landmark} idx={0} />
        <StatCard label="Fuera de tolerancia" valor={resumen?.cantidad_fuera_tolerancia ?? 0} color="rose" Icono={AlertTriangle} idx={1} />
      </div>

      {resumen?.cajero_top_diferencias && (
        <div className="flex items-center gap-2 px-4 py-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl text-sm text-amber-700 dark:text-amber-400">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>
            <span className="font-semibold">{resumen.cajero_top_diferencias.nombre}</span> tiene la mayor cantidad de cierres fuera de tolerancia en el período ({resumen.cajero_top_diferencias.cantidad}).
          </span>
        </div>
      )}

      {isLoading ? <Skeleton /> : data.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground text-sm rounded-2xl border border-border">Sin cierres en el período</div>
      ) : (
        <div className="space-y-2">
          {data.map((s) => (
            <ArqueoCard key={s.id} s={s} mostrarSucursal={accesoTodas} />
          ))}
        </div>
      )}

      <Paginacion pagina={pagina} totalPaginas={totalPaginas} onCambiar={setPagina} />
    </div>
  );
}
