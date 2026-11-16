import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { EVENTO_ESTADO, estadoConexion, viaGuardada } from '../../utils/bluetoothDirecto';
import { cx } from '../../lib/util';

// "Conectada" / "Reconectando…" de la impresora Bluetooth directo. Sin
// conexión abierta no muestra nada: se conecta sola en el próximo ticket.
export default function EstadoBt({ className }) {
  const [estado, setEstado] = useState(estadoConexion);
  useEffect(() => {
    const al = () => setEstado(estadoConexion());
    window.addEventListener(EVENTO_ESTADO, al);
    return () => window.removeEventListener(EVENTO_ESTADO, al);
  }, []);
  if (viaGuardada() === 'serial' || estado === 'sin') return null;
  const conectada = estado === 'conectada';
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12px] font-semibold', conectada ? 'bg-hierba/15 text-hierba' : 'bg-aji/15 text-tinta', className)}>
      {conectada ? <span className="w-2 h-2 rounded-full bg-hierba" /> : <Loader2 className="w-3 h-3 animate-spin" />}
      {conectada ? 'Conectada' : 'Reconectando…'}
    </span>
  );
}
