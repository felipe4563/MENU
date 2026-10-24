import { useState, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Minus, Plus, CheckCircle2, Undo2 } from 'lucide-react';
import Modal from '../../../components/ui/Modal';
import { anularProductos } from '../../../api/ventas';
import { getConfiguracion } from '../../../api/configuracion';
import { imprimirLocal } from '../../../utils/impresionLocal';
import { vigente } from '../../../utils/devoluciones';
import { imprimirComprobanteDevolucion, MOTIVOS_DEVOLUCION, FORMAS_DEVOLUCION } from '../../../utils/ticketDevolucion';

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const nombreLinea = (d) => (d.combo ? `Combo: ${d.combo.nombre}` : (d.producto?.nombre ?? 'Producto'));
const tieneStock = (d) => !d.combo_id && d.producto && d.producto.stock !== null && d.producto.stock !== undefined;

// Historial de devoluciones (hora, usuario, motivo, forma, monto).
export function HistorialDevoluciones({ pedido }) {
  const devs = pedido?.devoluciones ?? [];
  if (devs.length === 0) return null;
  return (
    <div className="rounded-xl border border-border overflow-hidden text-xs">
      <p className="px-3 py-1.5 bg-muted font-semibold text-foreground">Devoluciones</p>
      <div className="divide-y divide-border">
        {devs.map((dv) => (
          <div key={dv.id} className="flex items-start justify-between gap-2 px-3 py-1.5">
            <div className="min-w-0">
              <p className="text-foreground">
                {new Date(dv.creado_en).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' })}
                {' · '}{dv.usuario?.nombre ?? '—'}
              </p>
              <p className="text-muted-foreground">
                {MOTIVOS_DEVOLUCION[dv.motivo] ?? dv.motivo} · {FORMAS_DEVOLUCION[dv.forma] ?? dv.forma}
                {dv.forma === 'transferencia' && dv.estado_transferencia === 'pendiente' ? ' (pendiente)' : ''}
              </p>
            </div>
            <p className="shrink-0 font-medium text-foreground">Bs {parseFloat(dv.monto).toFixed(2)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ModalAnularProductos({ pedido, onClose, onAnulado }) {
  const qc = useQueryClient();
  const cobrado = pedido.estado === 'completado';
  const { data: config = {} } = useQuery({ queryKey: ['configuracion'], queryFn: getConfiguracion, staleTime: 60_000 });

  const lineas = useMemo(() => (pedido.detalles ?? []).filter((d) => vigente(d) > 0), [pedido]);
  const [cant, setCant] = useState({});      // detalle_id -> cantidad a anular
  const [vuelve, setVuelve] = useState({});  // detalle_id -> false si se desmarca
  const [motivo, setMotivo] = useState('');
  const [nota, setNota] = useState('');
  const [forma, setForma] = useState(pedido.metodo_pago === 'app_externa' ? 'app' : 'efectivo');
  const [error, setError] = useState(null);
  const [resultado, setResultado] = useState(null);

  // Si el pedido se refresca, la cantidad elegida no puede pasar de lo vigente.
  const cantEf = useMemo(() => {
    const o = {};
    for (const d of lineas) o[d.id] = Math.min(cant[d.id] ?? 0, vigente(d));
    return o;
  }, [lineas, cant]);
  const seleccion = lineas.filter((d) => cantEf[d.id] > 0);
  const unidades = seleccion.reduce((s, d) => s + cantEf[d.id], 0);

  // Vista previa con la misma fórmula del backend (el backend es la fuente de verdad).
  const preview = useMemo(() => {
    if (!cobrado) return 0;
    const total = Number(pedido.total) || 0;
    const cob = Math.max(0, Number(pedido.monto_recibido || 0) - Number(pedido.cambio || 0) - Number(pedido.propina || 0));
    const ratio = total > 0 ? cob / total : 0;
    let restante = Math.max(0, round2(cob - Number(pedido.total_devuelto || 0)));
    let suma = 0;
    for (const d of seleccion) {
      const m = Math.min(round2(Number(d.precio) * cantEf[d.id] * ratio), restante);
      restante = round2(restante - m);
      suma = round2(suma + m);
    }
    return suma;
  }, [cobrado, pedido, seleccion, cantEf]);

  const notaOk = motivo !== 'otro' || nota.trim().length > 0;
  const valido = unidades > 0 && !!motivo && notaOk;

  function cambiar(d, n) {
    setCant((c) => ({ ...c, [d.id]: Math.max(0, Math.min(vigente(d), n)) }));
  }

  const anular = useMutation({
    mutationFn: () => anularProductos(pedido.id, {
      items: seleccion.map((d) => ({
        detalle_pedido_id: d.id,
        cantidad: cantEf[d.id],
        ...(tieneStock(d) ? { vuelve_stock: vuelve[d.id] !== false } : {}),
      })),
      motivo,
      ...(nota.trim() ? { nota: nota.trim() } : {}),
      ...(cobrado ? { forma } : {}),
    }),
    onSuccess: (res) => {
      // Prefijos: el id llega como número (Mis Ventas) o string (ruta de PedidoPage).
      qc.invalidateQueries({ queryKey: ['venta-detalle'] });
      qc.invalidateQueries({ queryKey: ['mis-ventas-hoy'] });
      qc.invalidateQueries({ queryKey: ['venta'] });
      if (res.impresion?.cocina) imprimirLocal({ cocina: res.impresion.cocina });
      const dev = {
        ...res.devolucion,
        items: (res.devolucion?.items ?? []).map((it) => {
          const d = (pedido.detalles ?? []).find((x) => x.id === it.detalle_pedido_id);
          return { ...it, nombre: d ? nombreLinea(d) : undefined };
        }),
      };
      const conDinero = !!dev.forma && dev.forma !== 'sin_dinero';
      setResultado({ dev, conDinero, avisoCocina: !!res.impresion?.cocina });
    },
    onError: (err) => setError(err?.response?.data?.mensaje ?? 'No se pudo anular'),
  });

  if (resultado) {
    return (
      <Modal titulo="Productos anulados" onClose={() => onAnulado?.(resultado.dev)} ancho="max-w-sm">
        <div className="space-y-4 text-center">
          <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto" />
          {resultado.conDinero ? (
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Devolver al cliente</p>
              <p className="text-3xl font-bold text-foreground">Bs {parseFloat(resultado.dev.monto).toFixed(2)}</p>
              <p className="text-sm text-muted-foreground mt-1">{FORMAS_DEVOLUCION[resultado.dev.forma]}</p>
            </div>
          ) : (
            <p className="text-sm text-foreground">
              Los productos fueron anulados del pedido{resultado.avisoCocina ? ' y se avisó a cocina' : ''}.
            </p>
          )}
          <div className="flex flex-col gap-2">
            {resultado.conDinero && (
              <button
                type="button"
                onClick={() => imprimirComprobanteDevolucion(pedido, resultado.dev, config)}
                className="w-full px-5 py-3 rounded-xl text-sm bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-colors"
              >
                🖨 Imprimir comprobante
              </button>
            )}
            <button
              type="button"
              onClick={() => onAnulado?.(resultado.dev)}
              className={resultado.conDinero
                ? 'w-full px-4 py-2 rounded-xl text-sm border border-border text-foreground hover:bg-accent transition-colors'
                : 'w-full px-5 py-3 rounded-xl text-sm bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-colors'}
            >
              Cerrar
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal titulo={`Anular productos · #${pedido.id}`} onClose={onClose} ancho="max-w-md">
      <div className="space-y-4">
        <div className="divide-y divide-border rounded-xl border border-border overflow-hidden">
          {lineas.map((d) => {
            const v = vigente(d);
            const n = cantEf[d.id];
            const porPeso = d.peso !== null && d.peso !== undefined;
            return (
              <div key={d.id} className="px-3 py-2 space-y-1.5">
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-foreground truncate">{nombreLinea(d)}</p>
                    <p className="text-xs text-muted-foreground">
                      {porPeso ? `${parseFloat(d.peso).toFixed(3)} kg` : `Vigente: ${v}`} · Bs {parseFloat(d.precio).toFixed(2)}
                    </p>
                  </div>
                  {porPeso ? (
                    <label className="flex items-center gap-1.5 text-sm text-foreground shrink-0 cursor-pointer">
                      <input type="checkbox" checked={n > 0} onChange={(e) => cambiar(d, e.target.checked ? v : 0)} className="w-4 h-4" />
                      Anular
                    </label>
                  ) : (
                    <div className="flex items-center gap-1 shrink-0">
                      <button type="button" aria-label={`Quitar una unidad de ${nombreLinea(d)}`} onClick={() => cambiar(d, n - 1)} disabled={n <= 0}
                        className="w-8 h-8 rounded-lg bg-muted hover:bg-accent flex items-center justify-center disabled:opacity-40 transition-colors">
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="w-7 text-center text-sm font-semibold text-foreground">{n}</span>
                      <button type="button" aria-label={`Agregar una unidad de ${nombreLinea(d)}`} onClick={() => cambiar(d, n + 1)} disabled={n >= v}
                        className="w-8 h-8 rounded-lg bg-muted hover:bg-accent flex items-center justify-center disabled:opacity-40 transition-colors">
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
                {n > 0 && tieneStock(d) && (
                  <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                    <input type="checkbox" checked={vuelve[d.id] !== false}
                      onChange={(e) => setVuelve((s) => ({ ...s, [d.id]: e.target.checked }))} className="w-4 h-4" />
                    ¿Vuelve al stock?
                  </label>
                )}
              </div>
            );
          })}
        </div>

        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Motivo</p>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(MOTIVOS_DEVOLUCION).map(([id, label]) => (
              <button key={id} type="button" aria-pressed={motivo === id} onClick={() => setMotivo(id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  motivo === id ? 'bg-blue-600 border-blue-600 text-white' : 'border-border text-foreground hover:bg-accent'
                }`}>
                {label}
              </button>
            ))}
          </div>
          <input
            aria-label="Nota del motivo"
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            maxLength={255}
            placeholder={motivo === 'otro' ? 'Describe el motivo (obligatorio)' : 'Nota (opcional)'}
            className="mt-2 w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground"
          />
        </div>

        {cobrado && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Forma de devolución</p>
            <div className="flex flex-wrap gap-1.5">
              {[
                ['efectivo', 'Efectivo'],
                ['transferencia', 'Transferencia'],
                ...(pedido.metodo_pago === 'app_externa' ? [['app', 'La devuelve la app']] : []),
              ].map(([id, label]) => (
                <button key={id} type="button" aria-pressed={forma === id} onClick={() => setForma(id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    forma === id ? 'bg-blue-600 border-blue-600 text-white' : 'border-border text-foreground hover:bg-accent'
                  }`}>
                  {label}
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between rounded-xl bg-muted px-3 py-2">
              <span className="text-sm text-muted-foreground">A devolver</span>
              <span className="text-lg font-bold text-foreground">Bs {preview.toFixed(2)}</span>
            </div>
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-muted-foreground hover:bg-accent transition-colors">
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => { setError(null); anular.mutate(); }}
            disabled={!valido || anular.isPending}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm bg-red-600 hover:bg-red-700 text-white font-semibold transition-colors disabled:opacity-50"
          >
            <Undo2 className="w-4 h-4" />
            {anular.isPending ? 'Anulando...' : 'Anular productos'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
