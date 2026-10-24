import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Download, ShoppingCart, TrendingUp, DollarSign, BarChart2, Smartphone, Undo2, Wallet } from 'lucide-react';
import { getReporteVentas, getReporteVentasResumen } from '../../../api/reportes';
import { useAuth } from '../../../hooks/useAuth';
import { useAuthStore } from '../../../store/authStore';
import { exportarPDF } from '../utils/exportarPDF';
import { FiltroFechas, StatCard, BadgeTipo, Skeleton, bs, fecha, fechaHora, hoy, inicioMes } from '../shared';
import Paginacion from '../../../components/ui/Paginacion';
import Modal from '../../../components/ui/Modal';
import { usePermisos } from '../../../hooks/usePermisos';
import { getDevolucionesPendientes, marcarTransferida } from '../../../api/ventas';
import { MOTIVOS_DEVOLUCION, FORMAS_DEVOLUCION } from '../../../utils/ticketDevolucion';

const tipoLabel = (tipo) => tipo === 'llevar' ? 'Para llevar' : 'En mesa';

function VentaCard({ venta, mostrarSucursal }) {
  return (
    <div className="bg-card border border-border rounded-xl p-3.5 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground whitespace-nowrap">{fechaHora(venta.creado_en)}</p>
          <p className="font-medium text-foreground truncate">
            {venta.nombre_cliente || venta.cliente?.nombre || 'Público General'}
          </p>
        </div>
        <p className="font-bold text-emerald-600 dark:text-emerald-400 shrink-0 whitespace-nowrap">{bs(venta.total)}</p>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <BadgeTipo tipo={venta.tipo || 'mesa'} />
        <BadgeTipo tipo={venta.metodo_pago || 'efectivo'} />
        {mostrarSucursal && venta.sucursal?.nombre && (
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
            {venta.sucursal.nombre}
          </span>
        )}
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t border-border">
        <span>{venta.tipo === 'llevar' ? `Para llevar${venta.numero_llevar ? ` #${venta.numero_llevar}` : ''}` : (venta.mesa?.nombre || 'Sin mesa')}</span>
        <span>{venta.usuario?.nombre || '-'}</span>
      </div>
    </div>
  );
}

function TransferenciasPendientes() {
  const qc = useQueryClient();
  const [confirmar, setConfirmar] = useState(null);
  const [error, setError] = useState('');
  const { data: pendientes = [], isLoading } = useQuery({
    queryKey: ['devoluciones-pendientes'],
    queryFn: getDevolucionesPendientes,
  });
  const marcar = useMutation({
    mutationFn: (id) => marcarTransferida(id),
    onSuccess: () => {
      setConfirmar(null);
      setError('');
      qc.invalidateQueries({ queryKey: ['devoluciones-pendientes'] });
    },
    onError: (err) => setError(err?.response?.data?.mensaje ?? 'No se pudo marcar como transferida'),
  });
  const cerrar = () => { setConfirmar(null); setError(''); };

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-foreground">Transferencias pendientes</h3>
      {isLoading ? <Skeleton /> : pendientes.length === 0 ? (
        <div className="text-center py-6 text-muted-foreground text-sm rounded-2xl border border-border">
          No hay transferencias de devolución pendientes
        </div>
      ) : (
        <div className="space-y-2">
          {pendientes.map((d) => (
            <div key={d.id} className="bg-card border border-border rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-foreground">Pedido #{d.pedido_id}</p>
                <p className="text-xs text-muted-foreground">{fechaHora(d.creado_en)} · {d.usuario?.nombre || '-'}</p>
              </div>
              <p className="font-bold text-amber-600 dark:text-amber-400 whitespace-nowrap">{bs(d.monto)}</p>
              <button onClick={() => setConfirmar(d)}
                className="px-3 py-2 rounded-xl text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors w-full sm:w-auto">
                Marcar como transferida
              </button>
            </div>
          ))}
        </div>
      )}
      {confirmar && (
        <Modal titulo="Marcar como transferida" onClose={cerrar} ancho="max-w-sm">
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              ¿Confirmas que ya transferiste <span className="font-semibold text-foreground">{bs(confirmar.monto)}</span> del
              pedido <span className="font-semibold text-foreground">#{confirmar.pedido_id}</span>? Esta acción no se puede deshacer.
            </p>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex justify-end gap-3">
              <button onClick={cerrar} className="px-4 py-2 rounded-xl text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors">
                Cancelar
              </button>
              <button onClick={() => marcar.mutate(confirmar.id)} disabled={marcar.isPending}
                className="px-5 py-2 rounded-xl text-sm bg-primary hover:bg-primary/90 text-primary-foreground font-semibold transition-colors disabled:opacity-60">
                {marcar.isPending ? 'Guardando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function TablaDesglose({ titulo, columnas, filas }) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-foreground">{titulo}</h3>
      <div className="overflow-x-auto rounded-2xl border border-border">
        <table className="w-full text-xs sm:text-sm">
          <thead>
            <tr className="bg-muted border-b border-border">
              {columnas.map(h => (
                <th key={h} className="text-left px-3 py-2.5 sm:px-4 sm:py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filas.map((f, i) => (
              <tr key={i} className="bg-card">
                {f.map((c, j) => (
                  <td key={j} className={`px-3 py-2.5 sm:px-4 sm:py-3 ${j === 0 ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>{c}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function TabVentas({ empresa, logo, direccion, telefono }) {
  const { usuario } = useAuth();
  const { tienePermiso } = usePermisos();
  const accesoTodas = useAuthStore((s) => s.usuario?.sucursal_activa?.id == null);
  const [filtroSucursal, setFiltroSucursal] = useState('todas');
  const [desde, setDesde] = useState(inicioMes());
  const [hasta, setHasta] = useState(hoy());
  const [filtroCajero, setFiltroCajero] = useState('todos');
  const [filtroMetodoPago, setFiltroMetodoPago] = useState('todos');
  const [filtroTipo, setFiltroTipo] = useState('todos');
  const [filtroOrigen, setFiltroOrigen] = useState('todos');
  const [pagina, setPagina] = useState(1);
  const [exportando, setExportando] = useState(false);

  const filtrosApi = {
    desde, hasta,
    sucursal_id: accesoTodas && filtroSucursal !== 'todas' ? filtroSucursal : undefined,
    usuario_id: filtroCajero !== 'todos' ? filtroCajero : undefined,
    metodo_pago: filtroMetodoPago !== 'todos' ? filtroMetodoPago : undefined,
    tipo: filtroTipo !== 'todos' ? filtroTipo : undefined,
    origen: filtroOrigen !== 'todos' ? filtroOrigen : undefined,
  };

  // Vuelve a página 1 cuando cambia cualquier filtro (evita quedar en una
  // página que ya no existe). Se ajusta el estado durante el render en vez
  // de un useEffect para no disparar el lint react-hooks/set-state-in-effect
  // (mismo patrón usado en LibroCajaPage.jsx, Task 3 de este plan).
  const filtrosKey = `${desde}|${hasta}|${filtroSucursal}|${filtroCajero}|${filtroMetodoPago}|${filtroTipo}|${filtroOrigen}`;
  const [prevFiltrosKey, setPrevFiltrosKey] = useState(filtrosKey);
  if (filtrosKey !== prevFiltrosKey) {
    setPrevFiltrosKey(filtrosKey);
    setPagina(1);
  }

  const { data: paginaDatos, isLoading } = useQuery({
    queryKey: ['reporte-ventas', filtrosApi, pagina],
    queryFn: () => getReporteVentas({ ...filtrosApi, pagina }),
  });
  const data = useMemo(() => paginaDatos?.filas ?? [], [paginaDatos]);
  const totalPaginas = paginaDatos?.total_paginas ?? 1;

  const { data: resumen } = useQuery({
    queryKey: ['reporte-ventas-resumen', filtrosApi],
    queryFn: () => getReporteVentasResumen(filtrosApi),
  });

  const cajeros = resumen?.filtros?.cajeros ?? [];
  const sucursales = resumen?.filtros?.sucursales ?? [];

  // Totales del rango filtrado completo (no solo la página visible) —
  // vienen del endpoint de resumen, no se derivan de `data`.
  const stats = {
    count: resumen?.cantidad ?? 0,
    total: resumen?.total_ventas ?? 0,
    efectivo: resumen?.ventas_efectivo ?? 0,
    qr: resumen?.ventas_qr ?? 0,
    appExterna: resumen?.ventas_app_externa ?? 0,
    devoluciones: resumen?.total_devoluciones ?? 0,
    netas: resumen?.ventas_netas ?? 0,
  };

  const resumenSucursales = useMemo(() => {
    if (!accesoTodas) return [];
    const mapa = new Map();
    data.forEach(v => {
      const id = v.sucursal?.id;
      if (id == null) return;
      if (!mapa.has(id)) mapa.set(id, { id, nombre: v.sucursal.nombre, count: 0, total: 0, efectivo: 0, qr: 0, otros: 0 });
      const s = mapa.get(id);
      s.count += 1;
      s.total += parseFloat(v.total || 0);
      if (v.metodo_pago === 'efectivo') s.efectivo += parseFloat(v.total || 0);
      else if (v.metodo_pago === 'qr') s.qr += parseFloat(v.total || 0);
      else s.otros = (s.otros || 0) + parseFloat(v.total || 0);
    });
    return Array.from(mapa.values()).sort((a, b) => b.total - a.total);
  }, [data, accesoTodas]);

  const cajeroLabel = filtroCajero === 'todos'
    ? 'Todos los cajeros'
    : cajeros.find(c => String(c.id) === filtroCajero)?.nombre || 'Cajero';

  const metodoPagoLabel = filtroMetodoPago === 'todos'
    ? 'Todos los métodos'
    : filtroMetodoPago === 'efectivo' ? 'Efectivo' : 'QR / Transferencia';

  const tipoVentaLabel = filtroTipo === 'todos' ? 'Mesa y para llevar' : tipoLabel(filtroTipo);

  const origenLabel = filtroOrigen === 'todos' ? 'Staff y autoservicio' : (filtroOrigen === 'autoservicio' ? 'Autoservicio' : 'Tomado por staff');

  const exportar = async () => {
    setExportando(true);
    try {
      const { filas: todas } = await getReporteVentas({ ...filtrosApi, limite: 0 });
      exportarPDF({
        titulo:        'Reporte de Ventas',
        subtitulo:     `${fecha(desde)} — ${fecha(hasta)} · ${cajeroLabel} · ${metodoPagoLabel} · ${tipoVentaLabel} · ${origenLabel}`,
        empresa, logo, direccion, telefono,
        generadoPor:   usuario?.nombre,
        columnas:      ['Fecha', 'Tipo', 'Mesa', 'Cliente', 'Cajero', 'Método de pago', 'Origen', 'Total'],
        filas:         todas.map(v => [
          fechaHora(v.creado_en),
          tipoLabel(v.tipo || 'mesa'),
          v.tipo === 'llevar' ? (v.numero_llevar ? `#${v.numero_llevar}` : '-') : (v.mesa?.nombre || '-'),
          v.nombre_cliente || v.cliente?.nombre || 'Público General',
          v.usuario?.nombre || '-',
          v.metodo_pago || '-',
          v.origen === 'autoservicio' ? 'Autoservicio' : 'Staff',
          bs(v.total),
        ]),
        totales: [
          { label: 'N° Ventas',          valor: stats.count },
          { label: 'Total Ingresos',     valor: bs(stats.total) },
          { label: 'Efectivo',           valor: bs(stats.efectivo) },
          { label: 'QR / Transferencia', valor: bs(stats.qr) },
          { label: 'Pagado en app',      valor: bs(stats.appExterna) },
          { label: 'Devoluciones',       valor: bs(stats.devoluciones) },
          { label: 'Ventas netas',       valor: bs(stats.netas) },
        ],
        nombreArchivo: `reporte-ventas-${desde}-${hasta}${filtroCajero !== 'todos' ? `-${cajeroLabel}` : ''}${filtroMetodoPago !== 'todos' ? `-${filtroMetodoPago}` : ''}${filtroTipo !== 'todos' ? `-${filtroTipo}` : ''}.pdf`,
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
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Cajero</label>
            <select value={filtroCajero} onChange={e => setFiltroCajero(e.target.value)}
              className="px-3 py-2 text-sm rounded-xl border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring">
              <option value="todos">Todos</option>
              {cajeros.map(c => (
                <option key={c.id} value={String(c.id)}>{c.nombre}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Método de pago</label>
            <select value={filtroMetodoPago} onChange={e => setFiltroMetodoPago(e.target.value)}
              className="px-3 py-2 text-sm rounded-xl border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring">
              <option value="todos">Todos</option>
              <option value="efectivo">Efectivo</option>
              <option value="qr">QR / Transferencia</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Tipo de venta</label>
            <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}
              className="px-3 py-2 text-sm rounded-xl border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring">
              <option value="todos">Todos</option>
              <option value="mesa">En mesa</option>
              <option value="llevar">Para llevar</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Origen</label>
            <select value={filtroOrigen} onChange={e => setFiltroOrigen(e.target.value)}
              className="px-3 py-2 text-sm rounded-xl border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring">
              <option value="todos">Todos</option>
              <option value="staff">Tomado por staff</option>
              <option value="autoservicio">Autoservicio</option>
            </select>
          </div>
          {accesoTodas && (
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">Sucursal</label>
              <select value={filtroSucursal} onChange={e => setFiltroSucursal(e.target.value)}
                className="px-3 py-2 text-sm rounded-xl border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring">
                <option value="todas">Todas</option>
                {sucursales.map(s => (
                  <option key={s.id} value={String(s.id)}>{s.nombre}</option>
                ))}
              </select>
            </div>
          )}
        </div>
        <button onClick={exportar} disabled={!data.length || exportando}
          className="flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-40 w-full sm:w-auto">
          <Download className="w-4 h-4" /> {exportando ? 'Exportando…' : 'Exportar PDF'}
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
        <StatCard label="N° Ventas"          valor={stats.count}            color="primary" Icono={ShoppingCart} idx={0} />
        <StatCard label="Total Ingresos"     valor={bs(stats.total)}        color="emerald" Icono={TrendingUp}   idx={1} />
        <StatCard label="Efectivo"           valor={bs(stats.efectivo)}     color="blue"    Icono={DollarSign}   idx={2} />
        <StatCard label="QR / Transferencia" valor={bs(stats.qr)}           color="amber"   Icono={BarChart2}    idx={3} />
        <StatCard label="Pagado en app"      valor={bs(stats.appExterna)}   color="purple"  Icono={Smartphone}   idx={4} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <StatCard label="Devoluciones" valor={bs(stats.devoluciones)} color="rose"    Icono={Undo2}  idx={5} />
        <StatCard label="Ventas netas" valor={bs(stats.netas)}        color="emerald" Icono={Wallet} idx={6} />
      </div>

      {(resumen?.devoluciones_por_motivo?.length > 0 || resumen?.devoluciones_por_forma?.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {resumen?.devoluciones_por_motivo?.length > 0 && (
            <TablaDesglose titulo="Devoluciones por motivo" columnas={['Motivo', 'Cantidad', 'Monto']}
              filas={resumen.devoluciones_por_motivo.map(m => [MOTIVOS_DEVOLUCION[m.motivo] ?? m.motivo, m.cantidad, bs(m.monto)])} />
          )}
          {resumen?.devoluciones_por_forma?.length > 0 && (
            <TablaDesglose titulo="Devoluciones por forma" columnas={['Forma', 'Monto']}
              filas={resumen.devoluciones_por_forma.map(f => [FORMAS_DEVOLUCION[f.forma] ?? f.forma, bs(f.monto)])} />
          )}
        </div>
      )}

      {tienePermiso('ventas', 'anular') && <TransferenciasPendientes />}

      {accesoTodas && resumenSucursales.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-border">
          <table className="w-full text-xs sm:text-sm">
            <thead>
              <tr className="bg-primary/10 border-b border-border">
                {['Sucursal', 'N° Ventas', 'Total', 'Efectivo', 'QR'].map(h => (
                  <th key={h} className="text-left px-3 py-2.5 sm:px-4 sm:py-3 text-xs font-semibold text-primary uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {resumenSucursales.map(s => (
                <tr key={s.id} className="bg-card">
                  <td className="px-3 py-2.5 sm:px-4 sm:py-3 font-medium text-foreground">{s.nombre}</td>
                  <td className="px-3 py-2.5 sm:px-4 sm:py-3 text-foreground">{s.count}</td>
                  <td className="px-3 py-2.5 sm:px-4 sm:py-3 font-semibold text-emerald-600 dark:text-emerald-400">{bs(s.total)}</td>
                  <td className="px-3 py-2.5 sm:px-4 sm:py-3 text-muted-foreground">{bs(s.efectivo)}</td>
                  <td className="px-3 py-2.5 sm:px-4 sm:py-3 text-muted-foreground">{bs(s.qr)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {isLoading ? <Skeleton /> : data.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground text-sm rounded-2xl border border-border">
          Sin resultados para el período
        </div>
      ) : (
        <>
          {/* Móvil y tablet: tarjetas */}
          <div className="lg:hidden space-y-2">
            {data.map((v) => (
              <VentaCard key={v.id} venta={v} mostrarSucursal={accesoTodas} />
            ))}
            <div className="flex items-center justify-between px-1 pt-1 text-xs font-semibold text-muted-foreground">
              <span>TOTAL ({stats.count})</span>
              <span className="text-emerald-600 dark:text-emerald-400">{bs(stats.total)}</span>
            </div>
          </div>

          {/* Escritorio: tabla */}
          <div className="hidden lg:block overflow-x-auto rounded-2xl border border-border">
            <table className="w-full text-xs sm:text-sm">
              <thead>
                <tr className="bg-muted border-b border-border">
                  {[...(accesoTodas ? ['Sucursal'] : []), 'Fecha', 'Tipo', 'Mesa', 'Cliente', 'Cajero', 'Método', 'Total'].map(h => (
                    <th key={h} className="text-left px-3 py-2.5 sm:px-4 sm:py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.map((v, i) => (
                  <tr key={v.id}
                    className="bg-card hover:bg-primary/5 transition-colors animate-[rpFadeUp_0.3s_ease_forwards] opacity-0"
                    style={{ animationDelay: `${i * 20}ms` }}>
                    {accesoTodas && (
                      <td className="px-3 py-2.5 sm:px-4 sm:py-3 text-muted-foreground">{v.sucursal?.nombre || '-'}</td>
                    )}
                    <td className="px-3 py-2.5 sm:px-4 sm:py-3 text-muted-foreground whitespace-nowrap">{fechaHora(v.creado_en)}</td>
                    <td className="px-3 py-2.5 sm:px-4 sm:py-3"><BadgeTipo tipo={v.tipo || 'mesa'} /></td>
                    <td className="px-3 py-2.5 sm:px-4 sm:py-3 font-medium text-foreground">
                      {v.tipo === 'llevar' ? (v.numero_llevar ? `#${v.numero_llevar}` : '-') : (v.mesa?.nombre || '-')}
                    </td>
                    <td className="px-3 py-2.5 sm:px-4 sm:py-3 text-muted-foreground">{v.nombre_cliente || v.cliente?.nombre || 'Público General'}</td>
                    <td className="px-3 py-2.5 sm:px-4 sm:py-3 text-muted-foreground">{v.usuario?.nombre || '-'}</td>
                    <td className="px-3 py-2.5 sm:px-4 sm:py-3"><BadgeTipo tipo={v.metodo_pago || 'efectivo'} /></td>
                    <td className="px-3 py-2.5 sm:px-4 sm:py-3 font-semibold text-emerald-600 dark:text-emerald-400">{bs(v.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-muted border-t-2 border-primary/30">
                  <td colSpan={accesoTodas ? 7 : 6} className="px-3 py-2.5 sm:px-4 sm:py-3 text-right font-semibold text-muted-foreground text-sm">TOTAL</td>
                  <td className="px-3 py-2.5 sm:px-4 sm:py-3 font-bold text-emerald-600 dark:text-emerald-400">{bs(stats.total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}

      <Paginacion pagina={pagina} totalPaginas={totalPaginas} onCambiar={setPagina} />
    </div>
  );
}
