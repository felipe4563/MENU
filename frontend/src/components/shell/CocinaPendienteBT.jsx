import { ChefHat, X } from 'lucide-react';
import { useImpresionStore } from '../../store/impresionStore';
import { imprimirBluetoothCocina } from '../../utils/rawbt';

// Con impresora Bluetooth, la comanda de cocina espera a que alguien la mande
// (para cortar el papel del ticket anterior con calma).
export default function CocinaPendienteBT() {
  const pendiente = useImpresionStore((s) => s.cocinaPendiente);
  const limpiar = useImpresionStore((s) => s.limpiarCocinaPendiente);
  if (!pendiente) return null;
  return (
    <div className="fixed z-50 right-4 bottom-24 md:bottom-6 flex items-center gap-2 rounded-2xl bg-papel border border-linea shadow-flota pl-4 pr-2 py-2 animate-entra">
      <ChefHat className="w-5 h-5 text-tinta" />
      <span className="text-sm font-medium">Falta imprimir la comanda</span>
      <button className="btn-aji h-9" onClick={() => { imprimirBluetoothCocina(pendiente); limpiar(); }}>Imprimir cocina</button>
      <button className="btn-icono btn-fantasma h-9 w-9" onClick={limpiar} aria-label="Descartar"><X className="w-4 h-4" /></button>
    </div>
  );
}
