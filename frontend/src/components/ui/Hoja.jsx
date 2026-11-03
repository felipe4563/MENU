import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cx } from '../../lib/util';

// Diálogo que en el celular sube desde abajo como hoja y en escritorio queda
// centrado. Cierra con Escape y tocando fuera (salvo bloquear).
export default function Hoja({ abierto = true, onCerrar, titulo, subtitulo, children, pie, ancho = 'max-w-lg', bloquear = false, sinRelleno = false }) {
  const ref = useRef(null);
  const cerrarRef = useRef(onCerrar);
  useEffect(() => { cerrarRef.current = onCerrar; });

  useEffect(() => {
    if (!abierto) return;
    const previo = document.activeElement;
    const onKey = (e) => { if (e.key === 'Escape' && !bloquear) cerrarRef.current?.(); };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Solo se enfoca un campo si lo pide con autoFocus (React ya lo hace);
    // si no, el foco va al diálogo para no abrir el teclado del celular.
    requestAnimationFrame(() => {
      if (ref.current && !ref.current.contains(document.activeElement)) ref.current.focus();
    });
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      previo?.focus?.();
    };
  }, [abierto, bloquear]);

  if (!abierto) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-6">
      <div className="absolute inset-0 bg-pizarra/55 backdrop-blur-[2px] animate-entra" onClick={() => !bloquear && onCerrar?.()} />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={typeof titulo === 'string' ? titulo : undefined}
        tabIndex={-1}
        className={cx(
          'relative w-full bg-papel shadow-flota outline-none flex flex-col',
          'rounded-t-[22px] sm:rounded-[22px] max-h-[92dvh] animate-sube sm:animate-entra',
          ancho,
        )}
      >
        <div className="sm:hidden mx-auto mt-2 h-1.5 w-10 rounded-full bg-linea" />
        {titulo && (
          <header className="flex items-start gap-3 px-5 pt-4 sm:pt-5 pb-3">
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-bold leading-tight">{titulo}</h2>
              {subtitulo && <p className="text-sm text-tenue mt-0.5">{subtitulo}</p>}
            </div>
            {!bloquear && (
              <button className="btn-icono btn-fantasma -mr-2 -mt-1" onClick={onCerrar} aria-label="Cerrar">
                <X className="w-5 h-5" />
              </button>
            )}
          </header>
        )}
        <div className={cx('flex-1 overflow-y-auto scroll-fino', !sinRelleno && 'px-5 pb-5')}>{children}</div>
        {pie && <footer className="px-5 py-4 border-t border-linea flex gap-2 justify-end pb-seguro">{pie}</footer>}
      </div>
    </div>,
    document.body,
  );
}
