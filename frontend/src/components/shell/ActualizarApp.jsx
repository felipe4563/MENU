import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw } from 'lucide-react';

// Cuando hay una versión nueva desplegada, avisa en vez de recargar sola en
// medio de un cobro.
export default function ActualizarApp() {
  const { needRefresh: [hayNueva], updateServiceWorker } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      if (reg) setInterval(() => reg.update(), 30 * 60 * 1000);
    },
  });
  if (!hayNueva) return null;
  return (
    <div className="fixed z-50 left-1/2 -translate-x-1/2 bottom-24 md:bottom-6 flex items-center gap-3 rounded-2xl bg-tinta text-fondo pl-4 pr-2 py-2 shadow-flota animate-entra">
      <p className="text-sm">Hay una versión nueva del sistema.</p>
      <button className="btn-aji h-9" onClick={() => updateServiceWorker(true)}><RefreshCw className="w-4 h-4" /> Actualizar</button>
    </div>
  );
}
