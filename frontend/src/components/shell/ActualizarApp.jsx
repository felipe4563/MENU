import { useEffect, useRef, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw, Loader2 } from 'lucide-react';

const CADA = 10 * 60 * 1000;

// Botón flotante cuando hay una versión nueva publicada. No recarga sola
// (podría estar a mitad de un cobro): la persona toca "Actualizar" cuando
// le conviene. Revisa cada 10 min y cada vez que se vuelve a la app.
export default function ActualizarApp() {
  const registro = useRef(null);
  const [actualizando, setActualizando] = useState(false);
  const { needRefresh: [hayNueva], updateServiceWorker } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      registro.current = reg;
      if (reg) setInterval(() => reg.update().catch(() => {}), CADA);
    },
  });

  useEffect(() => {
    const revisar = () => { if (document.visibilityState === 'visible') registro.current?.update().catch(() => {}); };
    document.addEventListener('visibilitychange', revisar);
    window.addEventListener('focus', revisar);
    return () => { document.removeEventListener('visibilitychange', revisar); window.removeEventListener('focus', revisar); };
  }, []);

  // En la carta del cliente (QR de la mesa) no se muestra.
  if (!hayNueva || window.location.pathname.startsWith('/m/')) return null;
  return (
    <button
      type="button"
      onClick={() => { setActualizando(true); updateServiceWorker(true); }}
      disabled={actualizando}
      title="Hay una versión nueva del sistema"
      className="fixed z-[60] right-4 bottom-24 md:bottom-6 md:right-6 flex items-center gap-2.5 rounded-full bg-tinta text-fondo pl-3 pr-5 h-12 shadow-flota animate-entra hover:scale-[1.03] active:scale-95 transition-transform"
    >
      <span className="relative grid place-items-center w-8 h-8 rounded-full bg-aji text-sobre-aji">
        {!actualizando && <span className="absolute inset-0 rounded-full bg-aji animate-ping opacity-60" />}
        {actualizando ? <Loader2 className="relative w-4 h-4 animate-spin" /> : <RefreshCw className="relative w-4 h-4" />}
      </span>
      <span className="text-left leading-tight">
        <span className="block font-semibold text-sm">{actualizando ? 'Actualizando…' : 'Actualizar'}</span>
        {!actualizando && <span className="block text-[11px] opacity-70">Versión nueva lista</span>}
      </span>
    </button>
  );
}
