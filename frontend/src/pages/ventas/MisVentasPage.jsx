import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { ArrowLeft, Package, Receipt } from 'lucide-react';
import { getMisVentasHoy, getVenta, reimprimirVenta } from '../../api/ventas';
import { reimprimirConFallback } from '../../utils/impresionLocal';
import { logoSrc } from '../../api/configuracion';
import Paginacion from '../../components/ui/Paginacion';
import Modal from '../../components/ui/Modal';
import { usePermisos } from '../../hooks/usePermisos';
import ModalAnularProductos, { HistorialDevoluciones } from './components/ModalAnularProductos';
import { puedeAnularPedido } from '../../utils/devoluciones';

function _hora(iso) {
  return new Date(iso).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' });
}

function _etiquetaPedido(venta) {
  if (venta.tipo === 'llevar') return `Para llevar${venta.numero_llevar ? ` #${venta.numero_llevar}` : ''}`;
  return venta.mesa?.nombre || 'Mesa';
}

function _nombreItem(detalle) {
  if (detalle.combo) return `Combo: ${detalle.combo.nombre}`;
  return detalle.producto?.nombre ?? 'Producto';
}

function ModalDetalleVenta({ ventaId, onClose }) {
  const { data: venta, isLoading } = useQuery({ queryKey: ['venta-detalle', ventaId], queryFn: () => getVenta(ventaId) });

  const { tienePermiso } = usePermisos();
  const [anulando, setAnulando] = useState(false);

  const reimprimir = useMutation({
    mutationFn: () => reimprimirVenta(ventaId),
    onSuccess: (datos) => reimprimirConFallback(datos),
  });

  return (
    <Modal titulo="Detalle de venta" onClose={onClose} ancho="max-w-md">
      {isLoading || !venta ? (
        <p className="text-sm text-muted-foreground text-center py-6">Cargando...</p>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-foreground">{_etiquetaPedido(venta)} · #{venta.id}</p>
              <p className="text-xs text-muted-foreground">{_hora(venta.creado_en)} · {venta.metodo_pago === 'qr' ? 'QR / Transferencia' : 'Efectivo'}</p>
            </div>
            <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">Bs {parseFloat(venta.total).toFixed(2)}</p>
          </div>

          <div className="divide-y divide-border rounded-xl border border-border overflow-hidden">
            {(venta.detalles ?? []).map((d) => (
              <div key={d.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <div className="w-10 h-10 rounded-lg bg-muted shrink-0 overflow-hidden flex items-center justify-center">
                  {d.producto?.imagen ? (
                    <img src={logoSrc(d.producto.imagen)} alt={_nombreItem(d)} className="w-full h-full object-cover" />
                  ) : (
                    <Package className="w-4 h-4 text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-foreground truncate">
                    {d.cantidad - (d.cantidad_anulada || 0)}x {_nombreItem(d)}
                    {d.cantidad_anulada > 0 && <span className="text-muted-foreground"> ({d.cantidad_anulada} anulados)</span>}
                  </p>
                  {d.opciones?.length > 0 && (
                    <p className="text-xs text-muted-foreground truncate">{d.opciones.map((o) => o.nombre).join(', ')}</p>
                  )}
                </div>
                <p className="shrink-0 font-medium text-foreground">Bs {(parseFloat(d.precio) * (d.cantidad - (d.cantidad_anulada || 0))).toFixed(2)}</p>
              </div>
            ))}
          </div>

          {parseFloat(venta.total_devuelto) > 0 && (
            <p className="text-sm text-right text-red-600 dark:text-red-400">
              Total devuelto: Bs {parseFloat(venta.total_devuelto).toFixed(2)}
            </p>
          )}
          <HistorialDevoluciones pedido={venta} />

          {reimprimir.isError && <p className="text-sm text-destructive">No se pudo reimprimir.</p>}

          {tienePermiso('ventas', 'anular') && puedeAnularPedido(venta) && (
            <button
              onClick={() => setAnulando(true)}
              className="w-full px-4 py-2 rounded-xl text-sm border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            >
              Anular productos
            </button>
          )}

          <button
            onClick={() => reimprimir.mutate()}
            disabled={reimprimir.isPending}
            className="w-full px-4 py-2 rounded-xl text-sm border border-border text-foreground hover:bg-accent hover:text-accent-foreground transition-colors disabled:opacity-60"
          >
            {reimprimir.isPending ? 'Imprimiendo...' : '🖨 Reimprimir ticket'}
          </button>
        </div>
      )}
      {anulando && venta && (
        <ModalAnularProductos pedido={venta} onClose={() => setAnulando(false)} onAnulado={() => setAnulando(false)} />
      )}
    </Modal>
  );
}

export default function MisVentasPage() {
  const navigate = useNavigate();
  const [ventaId, setVentaId] = useState(null);
  const [pagina, setPagina] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['mis-ventas-hoy', pagina],
    queryFn: () => getMisVentasHoy({ pagina }),
  });
  const ventas = data?.filas ?? [];
  const totalPaginas = data?.total_paginas ?? 1;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-bold text-foreground">Mis Ventas de Hoy</h1>
        <button
          onClick={() => navigate('/ventas')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Volver al POS
        </button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground text-center py-6">Cargando...</p>
      ) : ventas.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground">
          <Receipt className="w-8 h-8 opacity-40" />
          <p className="text-sm">Todavía no hiciste ninguna venta hoy</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
            {ventas.map((v) => (
              <button
                key={v.id}
                onClick={() => setVentaId(v.id)}
                className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border border-border bg-card hover:bg-accent transition-colors text-left"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{_etiquetaPedido(v)}</p>
                  <p className="text-xs text-muted-foreground">{_hora(v.creado_en)} · {v.metodo_pago === 'qr' ? 'QR' : 'Efectivo'}</p>
                </div>
                <p className="shrink-0 font-semibold text-emerald-600 dark:text-emerald-400">Bs {parseFloat(v.total).toFixed(2)}</p>
              </button>
            ))}
          </div>
          <Paginacion pagina={pagina} totalPaginas={totalPaginas} onCambiar={setPagina} />
        </>
      )}

      {ventaId && <ModalDetalleVenta ventaId={ventaId} onClose={() => setVentaId(null)} />}
    </div>
  );
}
