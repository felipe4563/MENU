import { useState } from 'react';
import { Banknote, QrCode, Wallet, Undo2 } from 'lucide-react';
import Hoja from '../../../components/ui/Hoja';
import { Segmentado, Vacio } from '../../../components/ui/piezas';
import { useMoneda } from '../../../hooks/useConfig';
import { cx, dinero } from '../../../lib/util';

function Opcion({ activo, Icono, titulo, texto, disabled, onClick }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick}
      className={cx('w-full text-left rounded-2xl border-2 p-4 flex gap-3 transition disabled:opacity-50',
        activo ? 'border-tinta bg-hundido' : 'border-linea hover:border-tenue')}>
      <Icono className="w-5 h-5 mt-0.5 shrink-0" />
      <span>
        <span className="block font-semibold">{titulo}</span>
        <span className="block text-sm text-tenue">{texto}</span>
      </span>
    </button>
  );
}

// "No vino" o "Cancelar" una reserva con adelanto: quedarse la plata o
// devolverla (sale de tu caja; pide permiso para anular ventas).
// onConfirmar({ destino_adelanto, metodo_devolucion? }).
export default function CerrarReserva({ reserva, estado, puedeDevolver, enviando, error, onConfirmar, onCerrar }) {
  const moneda = useMoneda();
  const [destino, setDestino] = useState(null);
  const [metodo, setMetodo] = useState('efectivo');
  const adelanto = dinero(reserva.adelantado, moneda);
  const titulo = estado === 'no_vino' ? `${reserva.nombre_cliente} no vino` : `Cancelar la reserva de ${reserva.nombre_cliente}`;
  const listo = destino === 'retenido' || (destino === 'devuelto' && metodo);

  return (
    <Hoja onCerrar={onCerrar} bloquear={enviando} titulo={titulo} subtitulo={`Dejó ${adelanto} de adelanto. ¿Qué haces con esa plata?`} ancho="max-w-md"
      pie={(
        <div className="w-full space-y-2">
          {error && <p className="text-sm text-locoto">{error}</p>}
          <button data-principal className={destino === 'devuelto' ? 'btn-peligro w-full' : 'btn-aji w-full'} disabled={!listo || enviando}
            onClick={() => onConfirmar(destino === 'devuelto' ? { destino_adelanto: 'devuelto', metodo_devolucion: metodo } : { destino_adelanto: 'retenido' })}>
            {destino === 'devuelto' ? `Devolver ${adelanto}` : estado === 'no_vino' ? 'Marcar que no vino' : 'Cancelar reserva'}
          </button>
        </div>
      )}>
      <div className="space-y-3">
        {reserva.pedido_id && <p className="text-sm rounded-xl bg-locoto/10 text-locoto px-3 py-2">Sus platos ya están en cocina: el pedido se cancela.</p>}
        <Opcion activo={destino === 'retenido'} Icono={Wallet} titulo="Quedarse el adelanto" texto="La plata queda en caja." onClick={() => setDestino('retenido')} />
        <Opcion activo={destino === 'devuelto'} Icono={Undo2} titulo="Devolver" disabled={!puedeDevolver}
          texto={puedeDevolver ? `Sale ${adelanto} de tu caja.` : 'Pide a quien pueda anular ventas que lo devuelva.'} onClick={() => setDestino('devuelto')} />
        {destino === 'devuelto' && (
          <Segmentado className="w-full" valor={metodo} onCambio={setMetodo}
            opciones={[{ valor: 'efectivo', etiqueta: 'En efectivo', Icono: Banknote }, { valor: 'qr', etiqueta: 'Por QR', Icono: QrCode }]} />
        )}
      </div>
    </Hoja>
  );
}

// "Llegaron" sin mesa: elegir una libre (o seguir sin mesa).
export function HojaMesaLlegada({ reserva, mesas, enviando, onElegir, onCerrar }) {
  const libres = mesas.filter((m) => m.estado === 'disponible');
  return (
    <Hoja onCerrar={onCerrar} bloquear={enviando} titulo="¿En qué mesa se sientan?" subtitulo={`${reserva.nombre_cliente} · ${reserva.personas} ${reserva.personas === 1 ? 'persona' : 'personas'}`}
      pie={<button className="btn-suave w-full" disabled={enviando} onClick={() => onElegir(null)}>Seguir sin mesa</button>}>
      {libres.length === 0 ? <Vacio titulo="No hay mesas libres" texto="Sigue sin mesa: el pedido sale para llevar y luego lo pasas a una mesa." /> : (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {libres.map((m) => (
            <button key={m.id} disabled={enviando} onClick={() => onElegir(m.id)}
              className="aspect-square rounded-xl border-2 border-linea hover:border-tinta flex flex-col items-center justify-center disabled:opacity-50">
              <span className="font-display font-extrabold text-2xl">{m.nombre}</span>
              <span className="text-xs text-tenue">{m.area?.nombre}{(m.asientos ?? 4) < reserva.personas ? ' · chica' : ''}</span>
            </button>
          ))}
        </div>
      )}
    </Hoja>
  );
}
