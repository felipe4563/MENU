import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { QrCode, Check, X, Loader2 } from 'lucide-react';
import { getPagosQrPorConfirmar, confirmarPagoQr, cancelarPagoQr } from '../../api/pagosQr';
import { reimprimirVenta } from '../../api/ventas';
import { imprimirLocal } from '../../utils/impresionLocal';
import { useConfig, useMoneda } from '../../hooks/useConfig';
import { usePermisos } from '../../hooks/usePermisos';
import { useSocket } from '../../hooks/useSocket';
import { avisar } from '../../components/ui/Aviso';
import { dinero, errorDe, hora } from '../../lib/util';

// Cobros con el QR propio del negocio (los inicia el cajero) que esperan
// que alguien vea el pago en el banco y lo confirme.
export default function PagosQrPorConfirmar() {
  const { config } = useConfig();
  const { tiene } = usePermisos();
  const moneda = useMoneda();
  const qc = useQueryClient();
  const activo = config.qr_proveedor === 'propio' && tiene('ventas', 'cobrar');
  const q = useQuery({ queryKey: ['pagos-qr-por-confirmar'], queryFn: getPagosQrPorConfirmar, enabled: activo, refetchInterval: 20_000 });
  useSocket('restaurante:actualizar', () => activo && qc.invalidateQueries({ queryKey: ['pagos-qr-por-confirmar'] }));
  const refrescar = () => { qc.invalidateQueries({ queryKey: ['pagos-qr-por-confirmar'] }); qc.invalidateQueries({ queryKey: ['ventas'] }); };
  const confirmar = useMutation({
    mutationFn: (p) => confirmarPagoQr(p.pedido_id),
    onSuccess: (p) => { reimprimirVenta(p.id).then(imprimirLocal).catch(() => {}); avisar.ok('Pago confirmado'); refrescar(); },
    onError: (e) => avisar.error(errorDe(e)),
  });
  const rechazar = useMutation({
    mutationFn: (p) => cancelarPagoQr(p.pedido_id),
    onSuccess: () => { avisar.info('Cobro QR cancelado'); refrescar(); },
    onError: (e) => avisar.error(errorDe(e)),
  });

  const lista = q.data ?? [];
  if (!activo || !lista.length) return null;
  const ocupado = confirmar.isPending || rechazar.isPending;
  return (
    <div className="mx-4 sm:mx-5 mt-3 rounded-2xl border-2 border-aji/70 bg-aji/10 p-3">
      <p className="text-sm font-semibold flex items-center gap-2 mb-2"><QrCode className="w-4 h-4" /> Pagos QR por confirmar · <span className="num">{lista.length}</span> <span className="font-normal text-tenue">Confirma solo si ya ves el dinero en tu banco.</span></p>
      <ul className="flex gap-2 overflow-x-auto sin-scroll">
        {lista.map((p) => {
          const ped = p.pedido;
          const donde = ped?.mesa?.nombre ?? (ped?.numero_llevar ? `Para llevar #${ped.numero_llevar}` : ped?.nombre_cliente) ?? `Pedido #${p.pedido_id}`;
          return (
            <li key={p.id} className="ficha shrink-0 px-3 py-2 flex items-center gap-3">
              <div>
                <p className="font-semibold text-sm">{donde}{ped?.origen === 'autoservicio' && <span className="text-tenue font-normal"> · menú QR</span>}</p>
                <p className="text-xs text-tenue"><span className="num font-bold text-tinta text-sm">{dinero(p.monto_neto, moneda)}</span> · {hora(p.creado_en)}</p>
              </div>
              <button className="btn-aji h-9 px-3" disabled={ocupado} onClick={() => confirmar.mutate(p)}>
                {confirmar.isPending && confirmar.variables?.id === p.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Recibido
              </button>
              <button className="btn-icono btn-fantasma h-9 w-9" disabled={ocupado} aria-label="Cancelar cobro" title="No llegó el pago: cancelar" onClick={() => rechazar.mutate(p)}><X className="w-4 h-4" /></button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
