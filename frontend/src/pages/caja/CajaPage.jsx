import { useState, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import socket from '../../socket';
import {
  Wallet, Plus, X, AlertCircle, RefreshCw, CheckCircle2,
  TrendingUp, TrendingDown, DollarSign, ReceiptText, Clock,
  History, Eye, Loader2, User, Landmark,
} from 'lucide-react';
import {
  getEstadoCajas, getSesiones, getSesion, abrirCaja, cerrarCaja,
  getReporte, registrarGasto, getGastos,
} from '../../api/caja';
import { getSucursales } from '../../api/sucursales';
import { imprimirCierreLocal, reimprimirConFallback } from '../../utils/impresionLocal';
import { reimprimirVenta } from '../../api/ventas';
import { getConfiguracion } from '../../api/configuracion';
import { usePermisos } from '../../hooks/usePermisos';
import { useAuth } from '../../hooks/useAuth';
import Modal from '../../components/ui/Modal';

const DENOMINACIONES = [200, 100, 50, 20, 10, 5, 2, 1, 0.5, 0.2, 0.1];

function fmtFecha(f) {
  if (!f) return '—';
  return new Date(f).toLocaleDateString('es-BO', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function fmtHora(f) {
  if (!f) return '—';
  return new Date(f).toLocaleString('es-BO', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function duracion(desde) {
  if (!desde) return '—';
  const diff = Date.now() - new Date(desde).getTime();
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function diferenciaColor(d, tolerancia = 0) {
  if (Math.abs(d) < 0.01) return 'text-green-600 dark:text-green-400';
  if (Math.abs(d) <= tolerancia) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
}

/* ─────────────────────────────────────────────────────── página principal ── */

export default function CajaPage() {
  const { tienePermiso } = usePermisos();
  const { usuario } = useAuth();
  const qc = useQueryClient();

  const puedeVer    = tienePermiso('caja', 'ver');
  const puedeAbrir  = tienePermiso('caja', 'abrir');
  const puedeCerrar = tienePermiso('caja', 'cerrar');

  const accesoTodas = usuario?.sucursal_activa?.id == null;
  const [sucursalId, setSucursalId] = useState('');
  const [sesionSeleccionadaId, setSesionSeleccionadaId] = useState(null);
  const [modalAbrir, setModalAbrir] = useState(null); // null | caja-object
  const [modalCerrar, setModalCerrar] = useState(false);
  const [modalGasto, setModalGasto] = useState(false);
  const [reporteFinal, setReporteFinal] = useState(null);
  const [cargandoDet, setCargandoDet] = useState(null);

  const { data: sucursales = [] } = useQuery({
    queryKey: ['sucursales'],
    queryFn: getSucursales,
    enabled: accesoTodas,
  });

  const sucursalActivaId = accesoTodas ? sucursalId : usuario?.sucursal_activa?.id;

  const { data: cajas = [], isLoading } = useQuery({
    queryKey: ['caja-estado', sucursalActivaId],
    queryFn: () => getEstadoCajas(sucursalActivaId),
    enabled: puedeVer && !!sucursalActivaId,
  });

  const { data: config = {} } = useQuery({
    queryKey: ['configuracion'],
    queryFn: getConfiguracion,
    enabled: puedeVer,
  });

  const { data: sesion } = useQuery({
    queryKey: ['caja-sesion', sesionSeleccionadaId],
    queryFn: () => getSesion(sesionSeleccionadaId),
    enabled: !!sesionSeleccionadaId,
  });

  const { data: gastos = [] } = useQuery({
    queryKey: ['caja-gastos', sesion?.id],
    queryFn: () => getGastos(sesion.id),
    enabled: !!sesion?.id,
  });

  const { data: sesiones = [] } = useQuery({
    queryKey: ['caja-sesiones'],
    queryFn: getSesiones,
    enabled: puedeVer,
  });

  const historial = sesiones.filter(s => s.estado === 'cerrada');

  const verDetalle = async (id) => {
    setCargandoDet(id);
    try {
      const r = await getReporte(id);
      setReporteFinal(r);
    } finally {
      setCargandoDet(null);
    }
  };

  const invalidar = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['caja-estado'] });
    qc.invalidateQueries({ queryKey: ['caja-sesiones'] });
    if (sesionSeleccionadaId) {
      qc.invalidateQueries({ queryKey: ['caja-sesion', sesionSeleccionadaId] });
      qc.invalidateQueries({ queryKey: ['caja-gastos', sesionSeleccionadaId] });
    }
  }, [qc, sesionSeleccionadaId]);

  useEffect(() => {
    socket.on('restaurante:actualizar', invalidar);
    return () => socket.off('restaurante:actualizar', invalidar);
  }, [invalidar]);

  if (!puedeVer) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
        <AlertCircle className="w-10 h-10" />
        <p className="font-medium">No tienes permiso para ver la caja</p>
      </div>
    );
  }

  const selectorSucursal = accesoTodas && (
    <div className="flex items-center gap-3 bg-card border border-border rounded-xl px-4 py-3">
      <label className="text-sm font-medium text-muted-foreground shrink-0">Sucursal</label>
      <select
        value={sucursalId}
        onChange={e => { setSucursalId(e.target.value); setSesionSeleccionadaId(null); }}
        className="flex-1 bg-background border border-input rounded-lg px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
      >
        <option value="">Elegí una sucursal...</option>
        {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
      </select>
    </div>
  );

  // vista de detalle de una sesión (abierta) seleccionada de la grilla
  if (sesionSeleccionadaId && sesion) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSesionSeleccionadaId(null)}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← Volver a las cajas
          </button>
        </div>

        <div className="bg-card border border-border rounded-2xl p-4 sm:p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div className="space-y-1">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full text-xs font-semibold">
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                Caja Abierta
              </span>
              <p className="text-sm text-muted-foreground">
                Abierta por{' '}
                <span className="font-medium text-foreground">{sesion.usuario?.nombre}</span>
              </p>
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                {fmtHora(sesion.abierto_en)} · {duracion(sesion.abierto_en)} en curso
              </p>
            </div>
            {puedeCerrar && (
              usuario?.id === sesion.usuario?.id ? (
                <button
                  onClick={() => setModalCerrar(true)}
                  className="self-start sm:self-auto flex items-center gap-2 px-4 py-2 border border-destructive/30 text-destructive hover:bg-destructive/10 rounded-xl text-sm font-medium transition-colors"
                >
                  <X className="w-4 h-4" /> Cerrar Caja
                </button>
              ) : (
                <div className="self-start sm:self-auto flex items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl text-xs text-amber-700 dark:text-amber-400">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  Solo <span className="font-semibold mx-1">{sesion.usuario?.nombre}</span> puede cerrar esta caja
                </div>
              )
            )}
          </div>

          {sesion.sucursal?.modo_cierre_caja !== 'ciego' && (
            <>
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                <MetricCard label="Apertura" valor={parseFloat(sesion.monto_apertura)} icono={<DollarSign className="w-4 h-4" />} color="blue" />
                <MetricCard label="Ventas"   valor={parseFloat(sesion.total_ventas)}   icono={<TrendingUp  className="w-4 h-4" />} color="green" />
                <MetricCard label="Gastos"   valor={parseFloat(sesion.total_gastos)}   icono={<TrendingDown className="w-4 h-4" />} color="red" />
              </div>

              <div className="flex items-center justify-between bg-blue-50 dark:bg-blue-900/20 rounded-xl px-4 py-3">
                <span className="text-sm font-medium text-blue-700 dark:text-blue-400">Efectivo esperado en caja</span>
                <span className="text-base sm:text-lg font-bold text-blue-700 dark:text-blue-400">
                  Bs {(parseFloat(sesion.monto_apertura) + parseFloat(sesion.ventas_efectivo ?? 0) - parseFloat(sesion.total_gastos)).toFixed(2)}
                </span>
              </div>
            </>
          )}
        </div>

        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-b border-border">
            <span className="font-semibold text-sm text-foreground flex items-center gap-2">
              <ReceiptText className="w-4 h-4" /> Gastos del turno
            </span>
            {usuario?.id === sesion.usuario?.id ? (
              <button
                onClick={() => setModalGasto(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-muted hover:bg-accent rounded-lg text-xs font-medium text-muted-foreground hover:text-accent-foreground transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Registrar gasto
              </button>
            ) : (
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg text-xs text-amber-700 dark:text-amber-400">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                Solo <span className="font-semibold mx-1">{sesion.usuario?.nombre}</span> puede registrar gastos aquí
              </div>
            )}
          </div>
          {gastos.length === 0 ? (
            <div className="flex items-center justify-center h-20 text-sm text-muted-foreground">
              Sin gastos registrados
            </div>
          ) : (
            <div className="divide-y divide-border">
              {gastos.map(g => (
                <div key={g.id} className="flex items-center justify-between px-4 sm:px-5 py-3">
                  <div className="min-w-0 mr-3">
                    <p className="text-sm font-medium text-foreground truncate">{g.descripcion}</p>
                    <p className="text-xs text-muted-foreground">
                      {fmtHora(g.creado_en)}
                      {g.usuario?.nombre && <> · <span className="text-muted-foreground">{g.usuario.nombre}</span></>}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold text-destructive">
                    -Bs {parseFloat(g.monto).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {modalCerrar && (
          <ModalCerrarCaja
            sesion={sesion}
            onClose={() => setModalCerrar(false)}
            onExito={(reporte) => {
              setModalCerrar(false);
              invalidar();
              setSesionSeleccionadaId(null);
              setReporteFinal(reporte);
            }}
          />
        )}

        {modalGasto && (
          <ModalGasto
            sesionId={sesion.id}
            onClose={() => setModalGasto(false)}
            onExito={() => {
              setModalGasto(false);
              qc.invalidateQueries({ queryKey: ['caja-sesion', sesion.id] });
              qc.invalidateQueries({ queryKey: ['caja-gastos', sesion.id] });
            }}
          />
        )}

        {reporteFinal && (
          <ModalReporte reporte={reporteFinal} config={config} onClose={() => setReporteFinal(null)} />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-foreground">Caja</h1>
      {selectorSucursal}

      {accesoTodas && !sucursalId ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
          <Wallet className="w-10 h-10" />
          <p className="text-sm">Elegí una sucursal para ver sus cajas</p>
        </div>
      ) : isLoading ? (
        <div className="flex items-center justify-center h-64 gap-3 text-muted-foreground">
          <RefreshCw className="w-5 h-5 animate-spin" /><span>Cargando...</span>
        </div>
      ) : cajas.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
          <Landmark className="w-10 h-10" />
          <p className="text-sm">Esta sucursal todavía no tiene cajas creadas</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {cajas.map(c => (
            <TarjetaCaja
              key={c.id}
              caja={c}
              puedeAbrir={puedeAbrir}
              onAbrir={() => setModalAbrir(c)}
              onVerDetalle={() => setSesionSeleccionadaId(c.sesion_abierta.id)}
            />
          ))}
        </div>
      )}

      {historial.length > 0 && (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="px-4 sm:px-5 py-3 border-b border-border">
            <h2 className="font-semibold text-sm text-foreground flex items-center gap-2">
              <History className="w-4 h-4" /> Historial de cierres
              <span className="ml-1 px-1.5 py-0.5 rounded-full bg-muted text-xs font-bold text-muted-foreground">
                {historial.length}
              </span>
            </h2>
          </div>

          <div className="divide-y divide-border sm:hidden">
            {historial.map(s => {
              const dif = parseFloat(s.diferencia ?? 0);
              return (
                <div key={s.id} className="px-4 py-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{fmtFecha(s.abierto_en)}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <User className="w-3 h-3" /> {s.usuario?.nombre ?? '—'}
                      </p>
                    </div>
                    <span className={`text-sm font-bold ${diferenciaColor(dif, parseFloat(s.sucursal?.tolerancia_cierre_caja ?? 0))}`}>
                      {dif >= 0 ? '+' : ''}Bs {dif.toFixed(2)}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs text-center">
                    <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg px-2 py-1.5">
                      <p className="text-blue-500 font-medium mb-0.5">Apertura</p>
                      <p className="font-bold text-blue-700 dark:text-blue-300">Bs {parseFloat(s.monto_apertura).toFixed(2)}</p>
                    </div>
                    <div className="bg-green-50 dark:bg-green-900/20 rounded-lg px-2 py-1.5">
                      <p className="text-green-500 font-medium mb-0.5">Ventas</p>
                      <p className="font-bold text-green-700 dark:text-green-300">Bs {parseFloat(s.total_ventas).toFixed(2)}</p>
                    </div>
                    <div className="bg-muted rounded-lg px-2 py-1.5">
                      <p className="text-muted-foreground font-medium mb-0.5">Cierre</p>
                      <p className="font-bold text-foreground">Bs {parseFloat(s.monto_cierre ?? 0).toFixed(2)}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => verDetalle(s.id)}
                    disabled={cargandoDet === s.id}
                    className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors disabled:opacity-60"
                  >
                    {cargandoDet === s.id
                      ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Cargando...</>
                      : <><Eye className="w-3.5 h-3.5" /> Ver detalle</>
                    }
                  </button>
                </div>
              );
            })}
          </div>

          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted">
                  {['Fecha', 'Cajero', 'Apertura', 'Ventas', 'Gastos', 'Diferencia', ''].map(h => (
                    <th
                      key={h}
                      className={`px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide ${
                        h && h !== 'Fecha' && h !== 'Cajero' ? 'text-right' : 'text-left'
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {historial.map(s => {
                  const dif = parseFloat(s.diferencia ?? 0);
                  return (
                    <tr key={s.id} className="hover:bg-muted/50 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-medium text-foreground">{fmtFecha(s.abierto_en)}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{fmtHora(s.cerrado_en)}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-foreground">{s.usuario?.nombre ?? '—'}</span>
                      </td>
                      <td className="px-4 py-3 text-right text-foreground">
                        Bs {parseFloat(s.monto_apertura).toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-green-600 dark:text-green-400">
                        Bs {parseFloat(s.total_ventas).toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right text-red-500 dark:text-red-400">
                        Bs {parseFloat(s.total_gastos).toFixed(2)}
                      </td>
                      <td className={`px-4 py-3 text-right font-bold ${diferenciaColor(dif, parseFloat(s.sucursal?.tolerancia_cierre_caja ?? 0))}`}>
                        {dif >= 0 ? '+' : ''}Bs {dif.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => verDetalle(s.id)}
                          disabled={cargandoDet === s.id}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors disabled:opacity-60"
                        >
                          {cargandoDet === s.id
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <Eye className="w-3.5 h-3.5" />
                          }
                          {cargandoDet === s.id ? 'Cargando' : 'Detalle'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {modalAbrir && (
        <ModalAbrirCaja
          caja={modalAbrir}
          onClose={() => setModalAbrir(null)}
          onExito={(sesionCreada) => {
            setModalAbrir(null);
            invalidar();
            setSesionSeleccionadaId(sesionCreada.id);
          }}
        />
      )}

      {reporteFinal && (
        <ModalReporte reporte={reporteFinal} config={config} onClose={() => setReporteFinal(null)} />
      )}
    </div>
  );
}

/* ─── Tarjeta de caja (grilla) ──────────────────────────────────────────── */

function TarjetaCaja({ caja, puedeAbrir, onAbrir, onVerDetalle }) {
  const abierta = !!caja.sesion_abierta;
  return (
    <div className="bg-card border border-border rounded-2xl p-4 sm:p-5 flex flex-col gap-3">
      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <Wallet className="w-4.5 h-4.5 text-primary" />
        </div>
        <span className="font-semibold text-foreground">{caja.nombre}</span>
      </div>

      {abierta ? (
        <>
          <div className="space-y-1">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full text-xs font-semibold">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
              Abierta
            </span>
            <p className="text-xs text-muted-foreground">
              Por <span className="font-medium text-foreground">{caja.sesion_abierta.usuario?.nombre}</span>
            </p>
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              {duracion(caja.sesion_abierta.abierto_en)} en curso
            </p>
          </div>
          <button
            onClick={onVerDetalle}
            className="flex items-center justify-center gap-2 py-2 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            <Eye className="w-4 h-4" /> Ver detalle
          </button>
        </>
      ) : (
        <>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-muted text-muted-foreground rounded-full text-xs font-semibold w-fit">
            Disponible
          </span>
          {puedeAbrir && (
            <button
              onClick={onAbrir}
              className="flex items-center justify-center gap-2 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-semibold transition-colors"
            >
              <Plus className="w-4 h-4" /> Abrir
            </button>
          )}
        </>
      )}
    </div>
  );
}

/* ─── Métrica card ──────────────────────────────────────────────────────── */

function MetricCard({ label, valor, icono, color }) {
  const colores = {
    blue:  'bg-blue-50  dark:bg-blue-900/20  text-blue-600  dark:text-blue-400',
    green: 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400',
    red:   'bg-red-50   dark:bg-red-900/20   text-red-600   dark:text-red-400',
  };
  return (
    <div className={`rounded-xl p-2.5 sm:p-3 ${colores[color]}`}>
      <div className="flex items-center gap-1 mb-1 opacity-70">
        {icono}
        <span className="text-xs font-medium truncate">{label}</span>
      </div>
      <p className="text-sm sm:text-lg font-bold">Bs {valor.toFixed(2)}</p>
    </div>
  );
}

/* ─── Modal Abrir Caja ──────────────────────────────────────────────────── */

function ModalAbrirCaja({ caja, onClose, onExito }) {
  const [monto, setMonto] = useState('');
  const [error, setError] = useState(null);

  const abrir = useMutation({
    mutationFn: () => abrirCaja(caja.id, parseFloat(monto) || 0),
    onSuccess: onExito,
    onError: (err) => setError(err?.response?.data?.mensaje ?? 'Error al abrir la caja'),
  });

  return (
    <Modal titulo={`Abrir ${caja.nombre}`} onClose={onClose} ancho="max-w-sm">
      <div className="space-y-5">
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 text-sm text-blue-700 dark:text-blue-300">
          Ingresa el monto en efectivo con el que abres la caja (fondo inicial).
        </div>
        <div>
          <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
            Monto de apertura (Bs)
          </label>
          <input
            type="number" min="0" step="0.50" autoFocus
            value={monto}
            onChange={e => { setMonto(e.target.value); setError(null); }}
            placeholder="0.00"
            className="w-full bg-background border border-input rounded-xl px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition"
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
            Cancelar
          </button>
          <button
            onClick={() => abrir.mutate()}
            disabled={abrir.isPending}
            className="px-5 py-2 rounded-xl text-sm bg-primary hover:bg-primary/90 text-primary-foreground font-semibold transition-colors disabled:opacity-60"
          >
            {abrir.isPending ? 'Abriendo...' : 'Abrir Caja'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ─── Modal Cerrar Caja ─────────────────────────────────────────────────── */

function ModalCerrarCaja({ sesion, onClose, onExito }) {
  const [modo, setModo] = useState('detallado'); // 'detallado' | 'monto'
  const [cantidades, setCantidades] = useState(
    Object.fromEntries(DENOMINACIONES.map(d => [d, '']))
  );
  const [montoTotal, setMontoTotal] = useState('');
  const [error, setError] = useState(null);
  const [estado, setEstado] = useState('contando'); // 'contando' | 'esperando_confirmacion' | 'justificando'
  const [intentoFallido, setIntentoFallido] = useState(false);
  const [notaDiferencia, setNotaDiferencia] = useState('');

  const esCiego = sesion.sucursal?.modo_cierre_caja === 'ciego';

  const setCant = (den, val) => setCantidades(c => ({ ...c, [den]: val }));

  const limpiarConteo = () => {
    setCantidades(Object.fromEntries(DENOMINACIONES.map(d => [d, ''])));
    setMontoTotal('');
  };

  const totalDetallado = DENOMINACIONES.reduce((sum, d) => {
    return sum + (parseInt(cantidades[d]) || 0) * d;
  }, 0);

  const totalFisico = modo === 'detallado' ? totalDetallado : (parseFloat(montoTotal) || 0);

  const cerrar = useMutation({
    mutationFn: () => {
      const payload = { confirmar_pese_a_diferencia: intentoFallido };
      if (estado === 'justificando') payload.nota_diferencia = notaDiferencia;
      if (modo === 'detallado') {
        payload.denominaciones = DENOMINACIONES
          .filter(d => parseInt(cantidades[d]) > 0)
          .map(d => ({ denominacion: d, cantidad: parseInt(cantidades[d]) }));
      } else {
        payload.monto_cierre = parseFloat(montoTotal);
      }
      return cerrarCaja(sesion.id, payload);
    },
    onSuccess: async () => {
      const reporte = await getReporte(sesion.id);
      onExito(reporte);
    },
    onError: (err) => {
      const data = err?.response?.data;
      if (data?.codigo === 'DIFERENCIA_FUERA_TOLERANCIA') {
        setEstado('esperando_confirmacion');
        return;
      }
      if (data?.codigo === 'MOTIVO_REQUERIDO') {
        // Directo fuera de tolerancia (o segundo intento ciego): pide motivo.
        setEstado('justificando');
        return;
      }
      setError(data?.mensaje ?? 'Error al cerrar la caja');
    },
  });

  const apertura       = parseFloat(sesion.monto_apertura);
  const ventasTotal    = parseFloat(sesion.total_ventas);
  const ventasEfectivo = parseFloat(sesion.ventas_efectivo ?? ventasTotal);
  const ventasQR       = parseFloat(sesion.ventas_qr ?? 0);
  const gastos         = parseFloat(sesion.total_gastos);
  const esperado       = apertura + ventasEfectivo - gastos;
  const diferencia     = totalFisico - esperado;

  if (estado === 'esperando_confirmacion') {
    return (
      <Modal titulo="Cerrar Caja — Arqueo" onClose={onClose} ancho="max-w-md">
        <div className="space-y-5">
          <div className="flex flex-col items-center gap-3 text-center py-2">
            <AlertCircle className="w-10 h-10 text-amber-500" />
            <p className="font-semibold text-foreground">Hay una diferencia con lo esperado</p>
            <p className="text-sm text-muted-foreground">
              ¿Querés volver a contar el efectivo antes de cerrar?
            </p>
          </div>
          <div className="flex justify-end gap-3">
            <button
              onClick={() => { setIntentoFallido(true); setEstado('justificando'); }}
              className="px-4 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              Cerrar igual
            </button>
            <button
              onClick={() => { setIntentoFallido(true); limpiarConteo(); setEstado('contando'); }}
              className="px-5 py-2 rounded-xl text-sm bg-primary hover:bg-primary/90 text-primary-foreground font-semibold transition-colors"
            >
              Recontar
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  if (estado === 'justificando') {
    return (
      <Modal titulo="Cerrar Caja — Arqueo" onClose={onClose} ancho="max-w-md">
        <div className="space-y-4">
          <div className="flex items-center gap-2 px-3 py-2.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl text-sm text-amber-700 dark:text-amber-400">
            <AlertCircle className="w-4 h-4 shrink-0" />
            Hay una diferencia fuera del margen permitido. Indicá el motivo para poder cerrar.
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
              ¿Por qué hay diferencia?
            </label>
            <textarea
              autoFocus
              value={notaDiferencia}
              onChange={e => setNotaDiferencia(e.target.value)}
              rows={3}
              maxLength={255}
              placeholder="Ej: Di vuelto de más a mesa 4"
              className="w-full bg-background border border-input rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition resize-none"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-3">
            <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
              Cancelar
            </button>
            <button
              onClick={() => cerrar.mutate()}
              disabled={cerrar.isPending || !notaDiferencia.trim()}
              className="px-5 py-2 rounded-xl text-sm bg-destructive hover:bg-destructive/90 text-destructive-foreground font-semibold transition-colors disabled:opacity-60"
            >
              {cerrar.isPending ? 'Cerrando...' : 'Confirmar cierre'}
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal titulo="Cerrar Caja — Arqueo" onClose={onClose} ancho="max-w-2xl">
      <div className="space-y-4">

        {!esCiego && (
          <div className="grid grid-cols-1 xs:grid-cols-3 sm:grid-cols-3 gap-2">
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3 text-center">
              <p className="text-xs text-blue-600 dark:text-blue-400 font-medium mb-1">Apertura</p>
              <p className="text-base font-bold text-blue-700 dark:text-blue-300">Bs {apertura.toFixed(2)}</p>
            </div>
            <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-3 text-center">
              <p className="text-xs text-green-600 dark:text-green-400 font-medium mb-1">Ventas total</p>
              <p className="text-base font-bold text-green-700 dark:text-green-300">Bs {ventasTotal.toFixed(2)}</p>
              {ventasQR > 0 && (
                <p className="text-xs text-purple-500 dark:text-purple-400 mt-0.5">QR: Bs {ventasQR.toFixed(2)}</p>
              )}
            </div>
            <div className="bg-red-50 dark:bg-red-900/20 rounded-xl p-3 text-center">
              <p className="text-xs text-red-600 dark:text-red-400 font-medium mb-1">Gastos</p>
              <p className="text-base font-bold text-red-700 dark:text-red-300">Bs {gastos.toFixed(2)}</p>
            </div>
          </div>
        )}

        {esCiego && (
          <div className="flex items-center gap-2 px-3 py-2.5 bg-muted rounded-xl text-sm text-muted-foreground">
            <AlertCircle className="w-4 h-4 shrink-0" />
            Cierre ciego: contá el efectivo sin ver el monto esperado por el sistema.
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Conteo de efectivo en caja
            </p>
            <div className="flex bg-muted rounded-lg p-0.5">
              <button
                type="button"
                onClick={() => setModo('detallado')}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  modo === 'detallado'
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground'
                }`}
              >
                Conteo detallado
              </button>
              <button
                type="button"
                onClick={() => setModo('monto')}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  modo === 'monto'
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground'
                }`}
              >
                Monto total
              </button>
            </div>
          </div>

          {modo === 'detallado' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
              {DENOMINACIONES.map(d => {
                const subtotal = (parseInt(cantidades[d]) || 0) * d;
                return (
                  <div key={d} className="flex items-center gap-2">
                    <span className="w-14 text-sm font-medium text-foreground text-right shrink-0">
                      Bs {d}
                    </span>
                    <span className="text-muted-foreground text-sm">×</span>
                    <input
                      type="number" min="0"
                      value={cantidades[d]}
                      onChange={e => setCant(d, e.target.value)}
                      className="w-16 bg-background border border-input rounded-lg px-2 py-1.5 text-sm text-center text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition"
                    />
                    {subtotal > 0 && (
                      <span className="text-xs text-muted-foreground">
                        = Bs {subtotal.toFixed(2)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                Monto total contado en efectivo (Bs)
              </label>
              <input
                type="number" min="0" step="0.01" autoFocus
                value={montoTotal}
                onChange={e => setMontoTotal(e.target.value)}
                placeholder="0.00"
                className="w-full bg-background border border-input rounded-xl px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition"
              />
            </div>
          )}
        </div>

        <div className="border-t border-border pt-4 space-y-2">
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>Efectivo contado</span>
            <span className="font-semibold">Bs {totalFisico.toFixed(2)}</span>
          </div>
          {!esCiego && (
            <>
              {ventasQR > 0 && (
                <div className="flex justify-between text-sm text-purple-600 dark:text-purple-400">
                  <span>Ventas cobradas por QR (no en caja)</span>
                  <span className="font-semibold">Bs {ventasQR.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Efectivo esperado en caja</span>
                <span className="font-semibold">Bs {esperado.toFixed(2)}</span>
              </div>
              <div className={`flex justify-between font-bold text-base rounded-xl px-3 py-2 ${
                Math.abs(diferencia) < 0.01
                  ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                  : diferencia > 0
                  ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400'
                  : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
              }`}>
                <span>Diferencia</span>
                <span>{diferencia >= 0 ? '+' : ''}Bs {diferencia.toFixed(2)}</span>
              </div>
            </>
          )}
        </div>

        {totalFisico === 0 && (
          <div className="flex items-center gap-2 px-3 py-2.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl text-sm text-amber-700 dark:text-amber-400">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {modo === 'detallado'
              ? 'Ingresa el conteo de billetes y monedas antes de cerrar.'
              : 'Ingresa el monto total contado antes de cerrar.'}
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
            Cancelar
          </button>
          <button
            onClick={() => cerrar.mutate()}
            disabled={cerrar.isPending || totalFisico === 0}
            className="px-5 py-2 rounded-xl text-sm bg-destructive hover:bg-destructive/90 text-destructive-foreground font-semibold transition-colors disabled:opacity-60"
          >
            {cerrar.isPending ? 'Cerrando...' : 'Confirmar cierre'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ─── Modal Gasto ───────────────────────────────────────────────────────── */

function ModalGasto({ sesionId, onClose, onExito }) {
  const [form, setForm] = useState({ descripcion: '', monto: '' });
  const [error, setError] = useState(null);

  const guardar = useMutation({
    mutationFn: () => registrarGasto(sesionId, { descripcion: form.descripcion, monto: parseFloat(form.monto) }),
    onSuccess: onExito,
    onError: (err) => setError(err?.response?.data?.mensaje ?? 'Error al registrar gasto'),
  });

  return (
    <Modal titulo="Registrar Gasto" onClose={onClose} ancho="max-w-sm">
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Descripción</label>
          <input
            autoFocus
            value={form.descripcion}
            onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
            placeholder="Ej: Compra de insumos, Gas, etc."
            className="w-full bg-background border border-input rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Monto (Bs)</label>
          <input
            type="number" min="0.01" step="0.01"
            value={form.monto}
            onChange={e => setForm(f => ({ ...f, monto: e.target.value }))}
            placeholder="0.00"
            className="w-full bg-background border border-input rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition"
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-3 pt-1">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
            Cancelar
          </button>
          <button
            onClick={() => guardar.mutate()}
            disabled={guardar.isPending || !form.descripcion.trim() || !form.monto}
            className="px-5 py-2 rounded-xl text-sm bg-primary hover:bg-primary/90 text-primary-foreground font-semibold transition-colors disabled:opacity-60"
          >
            {guardar.isPending ? 'Guardando...' : 'Registrar'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ─── Modal Reporte Final ───────────────────────────────────────────────── */

function ModalReporte({ reporte, config = {}, onClose }) {
  const { sesion, ventas_por_metodo = [], pedidos = [], efectivo_esperado } = reporte;
  const tolerancia = parseFloat(sesion.sucursal?.tolerancia_cierre_caja ?? 0);

  const [reimprimiendoId, setReimprimiendoId] = useState(null);
  const [errorReimprimirId, setErrorReimprimirId] = useState(null);

  async function reimprimir(pedidoId) {
    setReimprimiendoId(pedidoId);
    setErrorReimprimirId(null);
    try {
      const datos = await reimprimirVenta(pedidoId);
      reimprimirConFallback(datos);
    } catch {
      setErrorReimprimirId(pedidoId);
    } finally {
      setReimprimiendoId(null);
    }
  }

  const totalEfectivo = ventas_por_metodo.find(v => v.metodo_pago === 'efectivo');
  const totalQR       = ventas_por_metodo.find(v => v.metodo_pago === 'qr');
  const totalApp      = ventas_por_metodo.find(v => v.metodo_pago === 'app_externa');
  const totalVentas   = parseFloat(sesion.total_ventas);
  const totalGastos   = parseFloat(sesion.total_gastos);
  const apertura      = parseFloat(sesion.monto_apertura);
  const cierre        = parseFloat(sesion.monto_cierre ?? 0);
  const diferencia    = parseFloat(sesion.diferencia ?? 0);

  return (
    <Modal titulo="Reporte de Cierre de Caja" onClose={onClose} ancho="max-w-lg">
      <div className="space-y-4">
        <div className="flex flex-col items-center gap-2 py-2">
          <CheckCircle2 className="w-12 h-12 text-green-500" />
          <p className="font-bold text-foreground">Caja cerrada</p>
          <p className="text-xs text-muted-foreground text-center">
            {new Date(sesion.abierto_en).toLocaleString('es-BO')}
            {' → '}
            {new Date(sesion.cerrado_en).toLocaleString('es-BO')}
          </p>
        </div>

        <div className="bg-muted rounded-xl p-4 space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Resumen de ventas</p>
          <div className="flex justify-between text-sm text-foreground">
            <span>Total pedidos completados</span>
            <span className="font-medium">{pedidos.length}</span>
          </div>
          <div className="flex justify-between text-sm text-foreground">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-green-500" /> Efectivo
            </span>
            <span className="font-medium">
              Bs {parseFloat(totalEfectivo?.total ?? 0).toFixed(2)}
              <span className="text-xs text-muted-foreground ml-1">({totalEfectivo?.cantidad ?? 0} órdenes)</span>
            </span>
          </div>
          <div className="flex justify-between text-sm text-foreground">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-500" /> QR / Transferencia
            </span>
            <span className="font-medium">
              Bs {parseFloat(totalQR?.total ?? 0).toFixed(2)}
              <span className="text-xs text-muted-foreground ml-1">({totalQR?.cantidad ?? 0} órdenes)</span>
            </span>
          </div>
          {totalApp && (
          <div className="flex justify-between text-sm text-foreground">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-purple-500" /> Pagado en app
            </span>
            <span className="font-medium">
              Bs {parseFloat(totalApp?.total ?? 0).toFixed(2)}
              <span className="text-xs text-muted-foreground ml-1">({totalApp?.cantidad ?? 0} órdenes)</span>
            </span>
          </div>
          )}
          <div className="border-t border-border pt-2 flex justify-between font-bold text-foreground">
            <span>Total ventas</span>
            <span>Bs {totalVentas.toFixed(2)}</span>
          </div>
        </div>

        <div className="bg-muted rounded-xl p-4 space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Arqueo de caja</p>
          {[
            { label: 'Monto apertura',    val: `Bs ${apertura.toFixed(2)}`,                      color: '' },
            { label: 'Ventas efectivo',   val: `+Bs ${parseFloat(totalEfectivo?.total ?? 0).toFixed(2)}`, color: 'text-green-600' },
            { label: 'Gastos',            val: `-Bs ${totalGastos.toFixed(2)}`,                   color: 'text-red-600' },
            { label: 'Esperado en caja',  val: `Bs ${efectivo_esperado.toFixed(2)}`,              color: '' },
            { label: 'Contado físicamente', val: `Bs ${cierre.toFixed(2)}`,                       color: '' },
          ].map(({ label, val, color }) => (
            <div key={label} className="flex justify-between text-sm text-foreground">
              <span>{label}</span>
              <span className={`font-medium ${color}`}>{val}</span>
            </div>
          ))}
          <div className={`flex justify-between font-bold text-base border-t border-border pt-2 ${diferenciaColor(diferencia, tolerancia)}`}>
            <span>Diferencia</span>
            <span>{diferencia >= 0 ? '+' : ''}Bs {diferencia.toFixed(2)}</span>
          </div>
          {sesion.nota_diferencia && (
            <div className="flex justify-between text-sm text-foreground pt-1">
              <span className="text-muted-foreground">Motivo</span>
              <span className="font-medium text-right max-w-[60%]">{sesion.nota_diferencia}</span>
            </div>
          )}
        </div>

        {pedidos.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Pedidos del turno ({pedidos.length})
            </p>
            <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
              {pedidos.map(p => (
                <div key={p.id} className="bg-muted rounded-lg px-3 py-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-foreground">
                      #{p.id} · {p.mesa?.nombre ?? 'Mesa'}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                        p.metodo_pago === 'efectivo'
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                      }`}>{p.metodo_pago}</span>
                      <span className="font-semibold text-foreground">Bs {parseFloat(p.total).toFixed(2)}</span>
                      <button
                        onClick={() => reimprimir(p.id)}
                        disabled={reimprimiendoId === p.id}
                        title="Reimprimir ticket"
                        className="p-1 rounded-lg border border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors disabled:opacity-60"
                      >
                        {reimprimiendoId === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : '🖨'}
                      </button>
                    </div>
                  </div>
                  {errorReimprimirId === p.id && (
                    <p className="text-right text-[11px] text-destructive mt-1">No se pudo reimprimir</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={() => imprimirCierreLocal(reporte, config)}
            className="flex-1 py-2.5 border border-border text-foreground hover:bg-accent hover:text-accent-foreground rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2"
          >
            🖨 Imprimir resumen
          </button>
          <button
            onClick={onClose}
            className="flex-1 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-sm font-semibold transition-colors"
          >
            Cerrar reporte
          </button>
        </div>
      </div>
    </Modal>
  );
}
