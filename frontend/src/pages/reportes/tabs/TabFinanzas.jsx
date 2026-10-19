import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { TrendingUp, TrendingDown, ShoppingBag, Wallet, Download } from 'lucide-react';
import { getReporteFinanzasResumen, getReporteFinanzasSerie } from '../../../api/reportes';
import { useAuth } from '../../../hooks/useAuth';
import { useAuthStore } from '../../../store/authStore';
import { useThemeStore } from '../../../store/themeStore';
import { exportarPDF } from '../utils/exportarPDF';
import { FiltroFechas, StatCard, bs, fecha, hoy, inicioMes } from '../shared';

// "YYYY-MM-DD" -> "DD/MM" o "DD/MM/YYYY", sin pasar por Date (evita el
// corrimiento de día por timezone que da reparsear una fecha-sin-hora con
// new Date() — el mismo helper fecha() de shared.jsx lo sufre, así que acá
// se arma el string a mano para que la tabla del PDF muestre el mismo día
// que el gráfico para el mismo dato).
function etiquetaDia(ymd) {
  const [, m, d] = ymd.split('-');
  return `${d}/${m}`;
}
function fechaCorta(ymd) {
  const [y, m, d] = ymd.split('-');
  return `${d}/${m}/${y}`;
}

function TooltipFinanzas({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg shadow-lg px-3 py-2 text-xs">
      <p className="font-semibold text-foreground mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} style={{ color: p.color }}>{p.name}: {bs(p.value)}</p>
      ))}
    </div>
  );
}

export default function TabFinanzas({ empresa, logo, direccion, telefono }) {
  const { usuario } = useAuth();
  const accesoTodas = useAuthStore((s) => s.usuario?.sucursal_activa?.id == null);
  const { modo } = useThemeStore();
  const isDark = modo === 'dark';
  const [filtroSucursal, setFiltroSucursal] = useState('todas');
  const [desde, setDesde] = useState(inicioMes());
  const [hasta, setHasta] = useState(hoy());
  const [exportando, setExportando] = useState(false);

  const filtrosApi = {
    desde, hasta,
    sucursal_id: accesoTodas && filtroSucursal !== 'todas' ? filtroSucursal : undefined,
  };

  const { data: resumen, isLoading } = useQuery({
    queryKey: ['reporte-finanzas-resumen', filtrosApi],
    queryFn: () => getReporteFinanzasResumen(filtrosApi),
  });
  const sucursales = resumen?.filtros?.sucursales ?? [];

  const { data: serie = [], isLoading: cargandoSerie } = useQuery({
    queryKey: ['reporte-finanzas-serie', filtrosApi],
    queryFn: () => getReporteFinanzasSerie(filtrosApi),
  });
  const datosGrafico = serie.map((d) => ({ ...d, label: etiquetaDia(d.fecha) }));

  const ingresos = resumen?.ingresos ?? 0;
  const gastos = resumen?.gastos_operativos ?? 0;
  const compras = resumen?.compras ?? 0;
  const resultado = resumen?.resultado_neto ?? 0;

  const gridColor = isDark ? '#1f2937' : '#f3f4f6';
  const tickColor = isDark ? '#9ca3af' : '#6b7280';

  const exportar = () => {
    setExportando(true);
    try {
      exportarPDF({
        titulo: 'Reporte Financiero',
        subtitulo: `${fecha(desde)} — ${fecha(hasta)}`,
        empresa, logo, direccion, telefono,
        generadoPor: usuario?.nombre,
        columnas: ['Fecha', 'Ingresos', 'Gastos operativos', 'Compras', 'Resultado neto'],
        filas: serie.map((d) => [
          fechaCorta(d.fecha),
          bs(d.ingresos),
          bs(d.gastos_operativos),
          bs(d.compras),
          bs(d.resultado_neto),
        ]),
        totales: [
          { label: 'Ingresos',          valor: bs(ingresos) },
          { label: 'Gastos operativos', valor: bs(gastos) },
          { label: 'Compras',           valor: bs(compras) },
          { label: 'Resultado neto',    valor: bs(resultado) },
        ],
        nombreArchivo: `reporte-financiero-${desde}-${hasta}.pdf`,
      });
    } finally {
      setExportando(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-end sm:justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <FiltroFechas desde={desde} hasta={hasta} setDesde={setDesde} setHasta={setHasta} />
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
        <button onClick={exportar} disabled={!serie.length || exportando}
          className="flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-40 w-full sm:w-auto">
          <Download className="w-4 h-4" /> {exportando ? 'Exportando…' : 'Exportar PDF'}
        </button>
      </div>

      {isLoading ? (
        <div className="text-center py-10 text-muted-foreground text-sm">Cargando...</div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <StatCard label="Ingresos"          valor={bs(ingresos)} color="emerald"                         Icono={TrendingUp}  idx={0} />
            <StatCard label="Gastos operativos" valor={bs(gastos)}   color="rose"                             Icono={TrendingDown} idx={1} />
            <StatCard label="Compras"           valor={bs(compras)}  color="amber"                            Icono={ShoppingBag} idx={2} />
            <StatCard label="Resultado neto"    valor={bs(resultado)} color={resultado >= 0 ? 'blue' : 'rose'} Icono={Wallet}      idx={3} />
          </div>

          <div className="rounded-2xl border border-border p-4 sm:p-5 bg-card">
            <h3 className="text-sm font-semibold text-foreground mb-4">Ingresos, gastos y compras por día</h3>
            {cargandoSerie ? (
              <div className="h-56 rounded-xl bg-muted animate-pulse" />
            ) : datosGrafico.length === 0 ? (
              <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">Sin movimientos en el período</div>
            ) : (
              <div className="h-56 sm:h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={datosGrafico} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barGap={3} barCategoryGap="25%">
                    <CartesianGrid stroke={gridColor} strokeDasharray="4 4" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: tickColor }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: tickColor }} tickLine={false} axisLine={false} width={46} />
                    <Tooltip content={<TooltipFinanzas />} />
                    <Legend
                      iconType="circle" iconSize={8}
                      formatter={v => <span style={{ fontSize: 12, color: tickColor }}>{v}</span>}
                    />
                    <Bar dataKey="ingresos"          name="Ingresos"          fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={22} />
                    <Bar dataKey="gastos_operativos" name="Gastos operativos" fill="#f43f5e" radius={[4, 4, 0, 0]} maxBarSize={22} />
                    <Bar dataKey="compras"           name="Compras"           fill="#d97706" radius={[4, 4, 0, 0]} maxBarSize={22} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-border p-4 sm:p-5 bg-muted/30">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              {fecha(desde)} — {fecha(hasta)}
            </p>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Ingresos por ventas</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">+{bs(ingresos)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Gastos operativos (Libro Caja)</span>
                <span className="font-semibold text-rose-600 dark:text-rose-400">-{bs(gastos)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Compras a proveedores</span>
                <span className="font-semibold text-rose-600 dark:text-rose-400">-{bs(compras)}</span>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-border">
                <span className="font-semibold text-foreground">Resultado neto</span>
                <span className={`font-bold ${resultado >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                  {bs(resultado)}
                </span>
              </div>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            No incluye el costo de cada producto vendido (margen por venta) — es un resultado de flujo de caja: lo que entró por ventas menos lo que salió en gastos y compras del período.
          </p>
        </>
      )}
    </div>
  );
}
