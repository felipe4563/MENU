import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Truck, MapPin, Phone, RefreshCw, DollarSign } from 'lucide-react';
import { getVentas, cobrarVenta } from '../../api/ventas';
import Modal from '../../components/ui/Modal';
import { usePermisos } from '../../hooks/usePermisos';
import ModalPagoQr from '../ventas/components/ModalPagoQr';

const ESTADO_LABEL = {
  pendiente: 'Pendiente', listo: 'Listo', completado: 'Completado', cancelado: 'Cancelado',
};

export default function PedidosExternosPage() {
  const { tienePermiso } = usePermisos();
  const puedeVer = tienePermiso('pedidos_externos', 'ver');
  const { data: pedidos = [], isLoading } = useQuery({
    queryKey: ['ventas', { origen: 'app_externa' }],
    queryFn: () => getVentas({ origen: 'app_externa' }),
    refetchInterval: 15000,
    enabled: puedeVer,
  });
  const [pedidoACobrar, setPedidoACobrar] = useState(null);

  if (!puedeVer) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
        <Truck className="w-10 h-10" />
        <p className="font-medium">No tenés permiso para ver esta pantalla</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <Truck className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-foreground">Pedidos externos</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Pedidos que llegaron desde apps de delivery/pedidos</p>
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <RefreshCw className="w-4 h-4 animate-spin" /><span className="text-sm">Cargando...</span>
        </div>
      )}

      <div className="space-y-3">
        {pedidos.map((p) => (
          <div key={p.id} className="bg-background border border-border rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="font-semibold text-foreground">
                  {p.origen_app || 'App externa'} · #{p.numero_llevar ?? p.id}
                </p>
                <p className="text-xs text-muted-foreground">{p.nombre_cliente}</p>
              </div>
              <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-muted text-muted-foreground">
                {ESTADO_LABEL[p.estado] ?? p.estado}
              </span>
            </div>

            {p.tipo === 'delivery' && (
              <div className="text-xs text-muted-foreground space-y-1">
                {p.direccion_entrega && (
                  <div className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" />{p.direccion_entrega}</div>
                )}
                {p.telefono_cliente && (
                  <div className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" />{p.telefono_cliente}</div>
                )}
              </div>
            )}

            <div className="flex items-center justify-between pt-1">
              <span className="text-sm font-semibold">Bs. {parseFloat(p.total).toFixed(2)}</span>
              {p.metodo_pago === 'app_externa' ? (
                <span className="text-xs text-green-600 dark:text-green-400 font-medium">Pagado en la app</span>
              ) : ['pendiente', 'listo'].includes(p.estado) ? (
                <button
                  onClick={() => setPedidoACobrar(p)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg text-xs font-medium transition-colors"
                >
                  <DollarSign className="w-3.5 h-3.5" /> Cobrar
                </button>
              ) : null}
            </div>
          </div>
        ))}

        {!isLoading && pedidos.length === 0 && (
          <div className="flex flex-col items-center justify-center h-40 gap-2 text-muted-foreground">
            <Truck className="w-8 h-8" />
            <p className="text-sm">Todavía no llegó ningún pedido externo.</p>
          </div>
        )}
      </div>

      {pedidoACobrar && (
        <ModalCobrar pedido={pedidoACobrar} onClose={() => setPedidoACobrar(null)} />
      )}
    </div>
  );
}

function ModalCobrar({ pedido, onClose }) {
  const qc = useQueryClient();
  const [metodo_pago, setMetodoPago] = useState('efectivo');
  const [monto_recibido, setMontoRecibido] = useState(pedido.total);
  const [pagoQrEstado, setPagoQrEstado] = useState(null); // { pedidoId, pagoQr } | null

  const cobrar = useMutation({
    mutationFn: () => cobrarVenta(pedido.id, { metodo_pago, monto_recibido: parseFloat(monto_recibido) }),
    onSuccess: (resultado) => {
      if (resultado.pago_qr) {
        setPagoQrEstado({ pedidoId: resultado.pedido.id, pagoQr: resultado.pago_qr });
        return;
      }
      qc.invalidateQueries({ queryKey: ['ventas'] });
      onClose();
    },
  });

  const reintentar = useMutation({
    mutationFn: () => cobrarVenta(pagoQrEstado.pedidoId, { metodo_pago: 'qr', monto_recibido: pedido.total }),
    onSuccess: (resultado) => setPagoQrEstado({ pedidoId: resultado.pedido.id, pagoQr: resultado.pago_qr }),
  });

  if (pagoQrEstado) {
    return (
      <ModalPagoQr
        pedidoId={pagoQrEstado.pedidoId}
        pagoQr={pagoQrEstado.pagoQr}
        onClose={onClose}
        onCompletado={() => {
          qc.invalidateQueries({ queryKey: ['ventas'] });
          onClose();
        }}
        onReintentar={() => reintentar.mutate()}
      />
    );
  }

  return (
    <Modal titulo={`Cobrar pedido #${pedido.numero_llevar ?? pedido.id}`} onClose={onClose}>
      <div className="space-y-4">
        <div className="flex gap-2">
          {['efectivo', 'qr'].map((m) => (
            <button
              key={m}
              onClick={() => setMetodoPago(m)}
              className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                metodo_pago === m ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent'
              }`}
            >
              {m === 'efectivo' ? 'Efectivo' : 'QR'}
            </button>
          ))}
        </div>
        {metodo_pago === 'efectivo' && (
          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
              Monto recibido
            </label>
            <input
              type="number"
              value={monto_recibido}
              onChange={(e) => setMontoRecibido(e.target.value)}
              className="w-full bg-background border border-input rounded-xl px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition"
            />
          </div>
        )}
        {cobrar.error && (
          <p className="text-sm text-destructive">{cobrar.error?.response?.data?.mensaje ?? 'Error al cobrar'}</p>
        )}
        <div className="flex justify-end gap-3 pt-2">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors">
            Cancelar
          </button>
          <button
            onClick={() => cobrar.mutate()}
            disabled={cobrar.isPending}
            className="px-4 py-2 rounded-xl text-sm bg-primary hover:bg-primary/90 text-primary-foreground transition-colors disabled:opacity-60"
          >
            {cobrar.isPending ? 'Cobrando...' : 'Confirmar cobro'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
