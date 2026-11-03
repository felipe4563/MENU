import { create } from 'zustand';
import { createPortal } from 'react-dom';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';
import { cx } from '../../lib/util';

const useAvisos = create((set) => ({
  lista: [],
  agregar: (a) => {
    const id = Math.random().toString(36).slice(2);
    set((s) => ({ lista: [...s.lista, { id, ...a }] }));
    setTimeout(() => set((s) => ({ lista: s.lista.filter((x) => x.id !== id) })), a.duracion ?? 3800);
  },
  quitar: (id) => set((s) => ({ lista: s.lista.filter((x) => x.id !== id) })),
}));

export const avisar = {
  ok: (texto, extra) => useAvisos.getState().agregar({ tipo: 'ok', texto, ...extra }),
  error: (texto, extra) => useAvisos.getState().agregar({ tipo: 'error', texto, duracion: 6000, ...extra }),
  info: (texto, extra) => useAvisos.getState().agregar({ tipo: 'info', texto, ...extra }),
};

const ICONOS = { ok: CheckCircle2, error: AlertTriangle, info: Info };
const COLOR = { ok: 'text-hierba', error: 'text-locoto', info: 'text-cielo' };

export function Avisos() {
  const { lista, quitar } = useAvisos();
  return createPortal(
    <div className="fixed z-[60] top-3 left-1/2 -translate-x-1/2 w-[min(92vw,420px)] flex flex-col gap-2 pointer-events-none" aria-live="polite">
      {lista.map((a) => {
        const Icono = ICONOS[a.tipo];
        return (
          <div key={a.id} className="pointer-events-auto flex items-start gap-3 rounded-2xl bg-tinta text-fondo px-4 py-3 shadow-flota animate-entra">
            <Icono className={cx('w-5 h-5 mt-0.5 shrink-0', COLOR[a.tipo])} />
            <p className="flex-1 text-sm leading-snug">{a.texto}</p>
            {a.accion && (
              <button className="text-sm font-semibold text-aji" onClick={() => { a.accion.onClick(); quitar(a.id); }}>{a.accion.texto}</button>
            )}
            <button onClick={() => quitar(a.id)} aria-label="Cerrar aviso" className="opacity-60 hover:opacity-100"><X className="w-4 h-4" /></button>
          </div>
        );
      })}
    </div>,
    document.body,
  );
}
