import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Search, CornerDownLeft } from 'lucide-react';
import { usePermisos } from '../../hooks/usePermisos';
import { SECCIONES, EXTRAS, puedeVer } from './navegacion';
import { cx, normalizar } from '../../lib/util';

// Buscador global (Ctrl+K): salta a cualquier pantalla escribiendo su nombre.
export default function Paleta({ onCerrar }) {
  const { permisos } = usePermisos();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);

  const destinos = useMemo(() => {
    const lista = [];
    SECCIONES.forEach((s) => {
      if (!puedeVer(s, permisos)) return;
      if (s.hijos) s.hijos.filter((h) => puedeVer(h, permisos)).forEach((h) => lista.push({ ...h, grupo: s.etiqueta }));
      else lista.push({ ...s, grupo: 'Ir a' });
    });
    EXTRAS.filter((e) => puedeVer(e, permisos)).forEach((e) => lista.push({ ...e, grupo: 'Atajos' }));
    return lista;
  }, [permisos]);

  const filtrados = useMemo(() => {
    const t = normalizar(q.trim());
    if (!t) return destinos;
    return destinos.filter((d) => normalizar(`${d.etiqueta} ${d.grupo}`).includes(t));
  }, [q, destinos]);

  const ir = (d) => { onCerrar(); navigate(d.to); };

  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, filtrados.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
    if (e.key === 'Enter' && filtrados[sel]) ir(filtrados[sel]);
    if (e.key === 'Escape') onCerrar();
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[12vh]">
      <div className="absolute inset-0 bg-pizarra/55 backdrop-blur-[2px]" onClick={onCerrar} />
      <div className="relative w-full max-w-xl rounded-2xl bg-papel shadow-flota overflow-hidden animate-entra" role="dialog" aria-label="Buscar pantalla">
        <div className="flex items-center gap-3 px-4 border-b border-linea">
          <Search className="w-5 h-5 text-tenue" />
          <input
            autoFocus
            value={q}
            onChange={(e) => { setQ(e.target.value); setSel(0); }}
            onKeyDown={onKey}
            placeholder="¿A dónde quieres ir?"
            className="flex-1 h-14 bg-transparent outline-none text-[17px]"
          />
          <kbd className="hidden sm:block text-[11px] text-tenue border border-linea rounded px-1.5 py-0.5">Esc</kbd>
        </div>
        <ul className="max-h-[50vh] overflow-y-auto scroll-fino p-2">
          {filtrados.length === 0 && <li className="px-3 py-8 text-center text-sm text-tenue">Nada coincide con “{q}”.</li>}
          {filtrados.map((d, i) => (
            <li key={d.to}>
              <button
                onMouseEnter={() => setSel(i)}
                onClick={() => ir(d)}
                className={cx('w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left', i === sel && 'bg-hundido')}
              >
                <span className="w-8 h-8 rounded-lg bg-hundido grid place-items-center"><d.Icono className="w-4 h-4" /></span>
                <span className="flex-1">
                  <span className="block font-medium">{d.etiqueta}</span>
                  <span className="block text-xs text-tenue">{d.grupo}</span>
                </span>
                {i === sel && <CornerDownLeft className="w-4 h-4 text-tenue" />}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>,
    document.body,
  );
}
