import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Minus, Plus, CheckCircle2, Printer } from 'lucide-react';
import Hoja from '../../components/ui/Hoja';
import { Interruptor, Segmentado } from '../../components/ui/piezas';
import { anularProductos } from '../../api/ventas';
import { imprimirLocal } from '../../utils/impresionLocal';
import { vigente } from '../../utils/devoluciones';
import { imprimirComprobanteDevolucion, MOTIVOS_DEVOLUCION, FORMAS_DEVOLUCION } from '../../utils/ticketDevolucion';
import { useConfig, useMoneda } from '../../hooks/useConfig';
import { cx, dinero, errorDe, hora } from '../../lib/util';
import { nombreDetalle } from './datosCatalogo';

const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const tieneStock = (d) => !d.combo_id && d.producto && d.producto.stock != null;

export function HistorialDevoluciones({ pedido }) {
  const moneda = useMoneda();
  const devs = pedido?.devoluciones ?? [];
  if (!devs.length) return null;
  return (
    <div className="rounded-xl bg-locoto/8 border border-locoto/20 p-3 text-sm space-y-2">
      <p className="font-semibold text-locoto">Devoluciones</p>
      {devs.map((d) => (
        <div key={d.id} className="flex gap-2">
          <span className="text-tenue num">{hora(d.creado_en)}</span>
          <span className="flex-1">{MOTIVOS_DEVOLUCION[d.motivo] ?? d.motivo} · {FORMAS_DEVOLUCION[d.forma] ?? d.forma}{d.forma === 'transferencia' && d.estado_transferencia === 'pendiente' ? ' (falta transferir)' : ''}</span>
          <span className="num font-semibold">{dinero(d.monto, moneda)}</span>
        </div>
      ))}
    </div>
  );
}

// Anular productos de un pedido. Si ya estaba cobrado, calcula cuánto
// devolver y cómo (efectivo, transferencia o la app).
export default function HojaAnular({ pedido, onCerrar, onListo }) {
  const qc = useQueryClient();
  const moneda = useMoneda();
  const { config } = useConfig();
  const cobrado = pedido.estado === 'completado';
  const lineas = useMemo(() => (pedido.detalles ?? []).filter((d) => vigente(d) > 0), [pedido]);
  const [cant, setCant] = useState({});
  const [vuelve, setVuelve] = useState({});
  const [motivo, setMotivo] = useState('');
  const [nota, setNota] = useState('');
  const [forma, setForma] = useState(pedido.metodo_pago === 'app_externa' ? 'app' : 'efectivo');
  const [error, setError] = useState('');
  const [hecho, setHecho] = useState(null);

  const sel = lineas.filter((d) => (cant[d.id] ?? 0) > 0);
  const unidades = sel.reduce((s, d) => s + cant[d.id], 0);

  // Misma fórmula que el backend, solo como vista previa.
  const aDevolver = useMemo(() => {
    if (!cobrado) return 0;
    const total = Number(pedido.total) || 0;
    const cob = Math.max(0, Number(pedido.monto_recibido || 0) - Number(pedido.cambio || 0) - Number(pedido.propina || 0));
    const ratio = total > 0 ? cob / total : 0;
    let resto = Math.max(0, r2(cob - Number(pedido.total_devuelto || 0)));
    let suma = 0;
    sel.forEach((d) => { const m = Math.min(r2(Number(d.precio) * cant[d.id] * ratio), resto); resto = r2(resto - m); suma = r2(suma + m); });
    return suma;
  }, [cobrado, pedido, sel, cant]);

  const anular = useMutation({
    mutationFn: () => anularProductos(pedido.id, {
      items: sel.map((d) => ({ detalle_pedido_id: d.id, cantidad: cant[d.id], ...(tieneStock(d) ? { vuelve_stock: vuelve[d.id] !== false } : {}) })),
      motivo,
      ...(nota.trim() ? { nota: nota.trim() } : {}),
      ...(cobrado ? { forma } : {}),
    }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['venta'] });
      qc.invalidateQueries({ queryKey: ['mis-ventas'] });
      qc.invalidateQueries({ queryKey: ['ventas'] });
      if (res.impresion?.cocina) imprimirLocal({ cocina: res.impresion.cocina });
      const dev = {
        ...res.devolucion,
        items: (res.devolucion?.items ?? []).map((it) => {
          const d = (pedido.detalles ?? []).find((x) => x.id === it.detalle_pedido_id);
          return { ...it, nombre: d ? nombreDetalle(d) : undefined };
        }),
      };
      setHecho({ dev, conDinero: !!dev.forma && dev.forma !== 'sin_dinero', cocina: !!res.impresion?.cocina });
    },
    onError: (e) => setError(errorDe(e, 'No se pudo anular.')),
  });

  if (hecho) {
    return (
      <Hoja onCerrar={() => onListo?.()} ancho="max-w-sm">
        <div className="text-center pt-8 space-y-4">
          <CheckCircle2 className="w-12 h-12 text-hierba mx-auto" />
          {hecho.conDinero ? (
            <div>
              <p className="text-tenue">Devuelve al cliente</p>
              <p className="num text-5xl font-extrabold">{dinero(hecho.dev.monto, moneda)}</p>
              <p className="text-sm text-tenue mt-1">{FORMAS_DEVOLUCION[hecho.dev.forma]}</p>
            </div>
          ) : <p className="font-display text-xl font-bold">Productos anulados{hecho.cocina ? ' y cocina avisada' : ''}</p>}
          <div className="flex gap-2">
            {hecho.conDinero && <button className="btn-borde flex-1" onClick={() => imprimirComprobanteDevolucion(pedido, hecho.dev, config)}><Printer className="w-4 h-4" /> Comprobante</button>}
            <button className="btn-aji flex-1" onClick={() => onListo?.()}>Listo</button>
          </div>
        </div>
      </Hoja>
    );
  }

  return (
    <Hoja
      onCerrar={onCerrar}
      bloquear={anular.isPending}
      titulo="Anular productos"
      subtitulo={cobrado ? 'El pedido ya se cobró: se devuelve la parte proporcional.' : 'Se quitan del pedido y se avisa a cocina.'}
      pie={(
        <div className="w-full space-y-2">
          {error && <p className="text-sm text-locoto">{error}</p>}
          <button className="btn-peligro btn-lg w-full" disabled={!unidades || !motivo || (motivo === 'otro' && !nota.trim()) || anular.isPending} onClick={() => anular.mutate()}>
            {anular.isPending ? 'Anulando…' : unidades ? `Anular ${unidades} ${unidades === 1 ? 'producto' : 'productos'}${cobrado ? ` · devolver ${dinero(aDevolver, moneda)}` : ''}` : 'Elige qué anular'}
          </button>
        </div>
      )}
    >
      <ul className="divide-y divide-linea -mt-1">
        {lineas.map((d) => {
          const c = cant[d.id] ?? 0;
          const max = vigente(d);
          return (
            <li key={d.id} className="py-3">
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold">{nombreDetalle(d)}</p>
                  <p className="text-xs text-tenue">{max} en el pedido · {dinero(d.precio, moneda)} c/u</p>
                </div>
                <div className="flex items-center gap-1 rounded-full bg-hundido p-1">
                  <button className="w-8 h-8 rounded-full grid place-items-center hover:bg-papel disabled:opacity-30" disabled={!c} onClick={() => setCant({ ...cant, [d.id]: c - 1 })} aria-label="Menos"><Minus className="w-4 h-4" /></button>
                  <span className={cx('num w-6 text-center font-bold', c && 'text-locoto')}>{c}</span>
                  <button className="w-8 h-8 rounded-full grid place-items-center hover:bg-papel disabled:opacity-30" disabled={c >= max} onClick={() => setCant({ ...cant, [d.id]: c + 1 })} aria-label="Más"><Plus className="w-4 h-4" /></button>
                </div>
              </div>
              {c > 0 && tieneStock(d) && (
                <div className="mt-2"><Interruptor activo={vuelve[d.id] !== false} onCambio={(v) => setVuelve({ ...vuelve, [d.id]: v })} etiqueta="Vuelve al stock" descripcion="Apágalo si el producto se perdió (merma)." /></div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="etiqueta mt-4">¿Por qué?</p>
      <div className="flex flex-wrap gap-2">
        {Object.entries(MOTIVOS_DEVOLUCION).map(([k, t]) => (
          <button key={k} onClick={() => setMotivo(k)} className={cx('h-9 px-3 rounded-full border text-sm font-medium', motivo === k ? 'bg-tinta text-fondo border-tinta' : 'border-linea')}>{t}</button>
        ))}
      </div>
      <input className="campo mt-3" placeholder={motivo === 'otro' ? 'Cuéntanos qué pasó (obligatorio)' : 'Nota (opcional)'} value={nota} onChange={(e) => setNota(e.target.value)} maxLength={255} />
      {cobrado && (
        <>
          <p className="etiqueta mt-4">¿Cómo devuelves el dinero?</p>
          <Segmentado className="w-full" valor={forma} onCambio={setForma} opciones={[
            { valor: 'efectivo', etiqueta: 'Efectivo' },
            { valor: 'transferencia', etiqueta: 'Transferencia' },
            ...(pedido.metodo_pago === 'app_externa' ? [{ valor: 'app', etiqueta: 'La app' }] : []),
          ]} />
          {forma === 'transferencia' && <p className="text-[13px] text-tenue mt-2">Queda pendiente en Caja hasta que marques que hiciste la transferencia.</p>}
        </>
      )}
    </Hoja>
  );
}
