import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowLeft, Printer, Undo2, Receipt, ChevronLeft, ChevronRight } from 'lucide-react';
import { getMisVentasHoy, getVenta, reimprimirVenta } from '../../api/ventas';
import { usePermisos } from '../../hooks/usePermisos';
import { useMoneda } from '../../hooks/useConfig';
import { reimprimirConFallback } from '../../utils/impresionLocal';
import { vigente, puedeAnularPedido } from '../../utils/devoluciones';
import { Cargando, Pagina, Vacio, Insignia } from '../../components/ui/piezas';
import { avisar } from '../../components/ui/Aviso';
import Hoja from '../../components/ui/Hoja';
import HojaAnular, { HistorialDevoluciones } from './HojaAnular';
import { etiquetaDestino, nombreDetalle, textoOpcionesDetalle } from './datosCatalogo';
import { cx, dinero, errorDe, hora } from '../../lib/util';

const METODO = { efectivo: 'Efectivo', qr: 'QR', app_externa: 'App' };

function Detalle({ id, onCerrar }) {
  const moneda = useMoneda();
  const { tiene } = usePermisos();
  const [anular, setAnular] = useState(false);
  const q = useQuery({ queryKey: ['venta', String(id)], queryFn: () => getVenta(id) });
  const reimprimir = useMutation({ mutationFn: () => reimprimirVenta(id), onSuccess: reimprimirConFallback, onError: (e) => avisar.error(errorDe(e)) });
  const p = q.data;
  if (anular && p) return <HojaAnular pedido={p} onCerrar={() => setAnular(false)} onListo={() => { setAnular(false); q.refetch(); }} />;
  return (
    <Hoja onCerrar={onCerrar} titulo={p ? etiquetaDestino(p) : 'Venta'} subtitulo={p && `#${p.id} · ${hora(p.creado_en)} · ${METODO[p.metodo_pago] ?? p.metodo_pago}`}
      pie={p && (
        <>
          <button className="btn-borde" onClick={() => reimprimir.mutate()} disabled={reimprimir.isPending}><Printer className="w-4 h-4" /> Reimprimir</button>
          {tiene('ventas', 'anular') && puedeAnularPedido(p) && <button className="btn-peligro" onClick={() => setAnular(true)}><Undo2 className="w-4 h-4" /> Anular / devolver</button>}
        </>
      )}>
      {!p ? <Cargando /> : (
        <div className="space-y-4">
          <ul className="divide-y divide-dashed divide-linea">
            {p.detalles.map((d) => {
              const v = vigente(d);
              return (
                <li key={d.id} className={cx('py-2.5 flex gap-3', v === 0 && 'opacity-50 line-through')}>
                  <span className="num font-bold w-6">{v}</span>
                  <div className="flex-1">
                    <p className="font-medium">{nombreDetalle(d)}</p>
                    {textoOpcionesDetalle(d) && <p className="text-xs text-tenue">{textoOpcionesDetalle(d)}</p>}
                    {Number(d.cantidad_anulada) > 0 && <p className="text-xs text-locoto no-underline">{d.cantidad_anulada} anulado(s)</p>}
                  </div>
                  <span className="num">{dinero(v * Number(d.precio), moneda)}</span>
                </li>
              );
            })}
          </ul>
          <div className="flex justify-between items-end">
            <span className="text-tenue">Total cobrado</span>
            <span className="num text-2xl font-extrabold">{dinero(Number(p.total) - Number(p.total_devuelto || 0), moneda)}</span>
          </div>
          <HistorialDevoluciones pedido={p} />
        </div>
      )}
    </Hoja>
  );
}

export default function MisVentasPage() {
  const moneda = useMoneda();
  const [pagina, setPagina] = useState(1);
  const [abierta, setAbierta] = useState(null);
  const q = useQuery({ queryKey: ['mis-ventas', pagina], queryFn: () => getMisVentasHoy({ pagina, limite: 20 }), placeholderData: (prev) => prev });
  const d = q.data;
  const filas = d?.filas ?? [];

  return (
    <Pagina>
      <Link to="/vender" className="btn-fantasma -ml-3 mb-2"><ArrowLeft className="w-4 h-4" /> Vender</Link>
      <h1 className="text-[30px] font-extrabold leading-none">Mis ventas de hoy</h1>
      <p className="text-tenue mt-1.5 mb-5">{d ? `${d.total} ${d.total === 1 ? 'venta cobrada' : 'ventas cobradas'} por ti` : ' '}</p>
      {q.isLoading ? <Cargando /> : filas.length === 0 ? <Vacio Icono={Receipt} titulo="Todavía no cobraste nada hoy" texto="Tus ventas aparecen aquí apenas las cobras." /> : (
        <ul className="ficha divide-y divide-linea overflow-hidden">
          {filas.map((p) => {
            const devuelto = Number(p.total_devuelto || 0);
            return (
              <li key={p.id}>
                <button className="w-full flex items-center gap-4 px-4 py-3.5 text-left hover:bg-hundido" onClick={() => setAbierta(p.id)}>
                  <span className="num text-tenue w-12">{hora(p.creado_en)}</span>
                  <span className="flex-1 min-w-0">
                    <span className="font-semibold block truncate">{etiquetaDestino(p)}</span>
                    <span className="text-xs text-tenue block truncate">{p.detalles.filter((x) => vigente(x) > 0).map((x) => `${vigente(x)} ${nombreDetalle(x)}`).join(', ')}</span>
                  </span>
                  {devuelto > 0 && <Insignia tono="peligro">−{devuelto.toFixed(2)}</Insignia>}
                  <Insignia>{METODO[p.metodo_pago] ?? p.metodo_pago}</Insignia>
                  <span className="num font-bold w-24 text-right">{dinero(Number(p.total) - devuelto, moneda)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {d && d.total_paginas > 1 && (
        <div className="flex items-center justify-center gap-3 mt-4">
          <button className="btn-icono btn-borde" disabled={pagina <= 1} onClick={() => setPagina(pagina - 1)} aria-label="Anterior"><ChevronLeft className="w-4 h-4" /></button>
          <span className="text-sm num">{pagina} de {d.total_paginas}</span>
          <button className="btn-icono btn-borde" disabled={pagina >= d.total_paginas} onClick={() => setPagina(pagina + 1)} aria-label="Siguiente"><ChevronRight className="w-4 h-4" /></button>
        </div>
      )}
      {abierta && <Detalle id={abierta} onCerrar={() => { setAbierta(null); q.refetch(); }} />}
    </Pagina>
  );
}
