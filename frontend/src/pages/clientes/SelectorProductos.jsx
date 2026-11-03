import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { getProductos } from '../../api/productos';
import { Buscador } from '../../components/ui/piezas';
import { cx, normalizar } from '../../lib/util';

// Lista con buscador para elegir varios productos.
export default function SelectorProductos({ valor = [], onCambio, alto = 'max-h-64' }) {
  const [q, setQ] = useState('');
  const { data = [] } = useQuery({ queryKey: ['productos', 'activos'], queryFn: () => getProductos() });
  const sel = new Set(valor);
  const lista = useMemo(() => {
    const t = normalizar(q);
    return data.filter((p) => !t || normalizar(p.nombre).includes(t));
  }, [data, q]);
  const tocar = (id) => onCambio(sel.has(id) ? valor.filter((x) => x !== id) : [...valor, id]);
  return (
    <div className="rounded-xl border border-linea">
      <div className="p-2 border-b border-linea"><Buscador valor={q} onCambio={setQ} placeholder={`Buscar · ${valor.length} elegidos`} /></div>
      <ul className={cx('overflow-y-auto scroll-fino p-1', alto)}>
        {lista.map((p) => (
          <li key={p.id}>
            <button type="button" onClick={() => tocar(p.id)} className={cx('w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-left', sel.has(p.id) ? 'bg-tinta text-fondo' : 'hover:bg-hundido')}>
              <span className={cx('w-4 h-4 rounded border grid place-items-center', sel.has(p.id) ? 'border-aji bg-aji text-sobre-aji' : 'border-linea')}>{sel.has(p.id) && <Check className="w-3 h-3" />}</span>
              <span className="flex-1">{p.nombre}</span>
              <span className="text-xs opacity-60">{p.categoria?.nombre}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
