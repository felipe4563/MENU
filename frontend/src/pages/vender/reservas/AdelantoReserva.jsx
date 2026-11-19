import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Banknote, QrCode } from 'lucide-react';
import { cobrarAdelantoReserva } from '../../../api/reservas';
import Hoja from '../../../components/ui/Hoja';
import { Campo, Segmentado } from '../../../components/ui/piezas';
import { avisar } from '../../../components/ui/Aviso';
import { useMoneda } from '../../../hooks/useConfig';
import { cx, dinero, errorDe } from '../../../lib/util';

const numero = (v) => v.replace(',', '.').replace(/[^\d.]/g, '');

// Cobrar un adelanto de la reserva: monto, efectivo o QR, recibido y cambio.
// onCobrado(reserva, pago) se llama con la reserva ya actualizada y el pago
// recién registrado (ahí se imprime el ticket de adelanto).
export default function AdelantoReserva({ reserva, onCerrar, onCobrado }) {
  const qc = useQueryClient();
  const moneda = useMoneda();
  const conPlatos = Number(reserva.total_platos) > 0;
  const saldo = Number(reserva.saldo);
  const [monto, setMonto] = useState(conPlatos ? saldo.toFixed(2) : '');
  const [metodo, setMetodo] = useState('efectivo');
  const [recibido, setRecibido] = useState('');
  const [error, setError] = useState('');

  const montoNum = Math.round((parseFloat(monto) || 0) * 100) / 100;
  const recibidoNum = parseFloat(recibido) || 0;
  const cambio = recibidoNum - montoNum;
  const pasa = conPlatos && montoNum > saldo + 0.005;
  const falta = metodo === 'efectivo' && recibido !== '' && recibidoNum < montoNum - 0.005;
  const valido = montoNum > 0 && !pasa && !falta;

  const cobrar = useMutation({
    mutationFn: () => cobrarAdelantoReserva(reserva.id, {
      metodo_pago: metodo, monto: montoNum,
      monto_recibido: metodo === 'efectivo' ? (recibidoNum || montoNum) : undefined,
    }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['reservas'] });
      qc.invalidateQueries({ queryKey: ['caja-estado'] });
      const pago = [...(r.pagos ?? [])].reverse().find((p) => p.tipo === 'adelanto');
      const vuelto = Number(pago?.cambio || 0);
      avisar.ok(vuelto > 0 ? `Adelanto cobrado · entrega ${dinero(vuelto, moneda)} de cambio` : 'Adelanto cobrado');
      onCobrado?.(r, pago);
      onCerrar();
    },
    onError: (e) => setError(errorDe(e)),
  });

  return (
    <Hoja onCerrar={onCerrar} bloquear={cobrar.isPending} titulo="Cobrar adelanto" ancho="max-w-md"
      subtitulo={`${reserva.nombre_cliente}${conPlatos ? ` · platos ${dinero(reserva.total_platos, moneda)}` : ''}${Number(reserva.adelantado) > 0 ? ` · ya dejó ${dinero(reserva.adelantado, moneda)}` : ''}`}
      pie={(
        <div className="w-full space-y-2">
          {error && <p className="text-sm text-locoto">{error}</p>}
          <button data-principal className="btn-aji w-full" disabled={!valido || cobrar.isPending} onClick={() => cobrar.mutate()}>
            Cobrar {montoNum > 0 ? dinero(montoNum, moneda) : ''}
          </button>
        </div>
      )}>
      <div className="space-y-4">
        <Campo etiqueta="Monto" error={pasa ? `Falta pagar ${dinero(saldo, moneda)}: no puede ser más` : null}
          ayuda={conPlatos ? `Falta pagar ${dinero(saldo, moneda)}` : 'Sin platos: queda como garantía de la reserva'}>
          <input autoFocus inputMode="decimal" className="campo h-14 text-2xl num font-bold" placeholder="0.00" value={monto}
            onChange={(e) => { setMonto(numero(e.target.value)); setError(''); }} />
        </Campo>
        <Segmentado className="w-full" valor={metodo} onCambio={(m) => { setMetodo(m); setError(''); }}
          opciones={[{ valor: 'efectivo', etiqueta: 'Efectivo', Icono: Banknote }, { valor: 'qr', etiqueta: 'QR', Icono: QrCode }]} />
        {metodo === 'efectivo' ? (
          <div>
            <Campo etiqueta="Recibido">
              <input inputMode="decimal" className="campo h-12 text-xl num font-bold" placeholder={montoNum ? montoNum.toFixed(2) : '0.00'} value={recibido}
                onChange={(e) => { setRecibido(numero(e.target.value)); setError(''); }} />
            </Campo>
            {recibido !== '' && montoNum > 0 && (
              <p className="mt-2 flex items-baseline justify-between rounded-xl bg-hundido px-3 py-2">
                <span className="text-sm text-tenue">{falta ? 'Faltan' : 'Cambio'}</span>
                <span className={cx('num text-xl font-extrabold', falta && 'text-locoto')}>{dinero(Math.abs(cambio), moneda)}</span>
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-tenue">Cóbralo cuando veas la transferencia en tu celular.</p>
        )}
      </div>
    </Hoja>
  );
}
