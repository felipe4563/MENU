import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X, Gift, Scale, ImageOff } from 'lucide-react';
import { cx, dinero, normalizar } from '../../lib/util';
import { useMoneda } from '../../hooks/useConfig';
import { contenidoCombo } from './datosCatalogo';
import { Cargando, Vacio } from '../../components/ui/piezas';

function Tarjeta({ nombre, precio, precioAntes, imagen, cantidad, agotado, insignia, detalle, onClick }) {
  const moneda = useMoneda();
  return (
    <button
      onClick={onClick}
      disabled={agotado}
      className={cx(
        'relative text-left rounded-ficha bg-papel border border-linea overflow-hidden flex flex-col transition active:scale-[.98]',
        'hover:border-tinta/30 hover:shadow-papel disabled:opacity-45 disabled:pointer-events-none',
        cantidad > 0 && 'ring-2 ring-aji border-aji',
      )}
    >
      {imagen !== undefined && (
        <div className="aspect-[4/3] bg-hundido overflow-hidden">
          {imagen ? <img src={imagen} alt="" loading="lazy" className="w-full h-full object-cover" /> : <div className="w-full h-full grid place-items-center text-linea"><ImageOff className="w-6 h-6" /></div>}
        </div>
      )}
      <div className="p-3 flex-1 flex flex-col gap-1">
        <p className="font-semibold leading-tight line-clamp-2">{nombre}</p>
        {detalle && <p className="text-xs text-tenue line-clamp-2">{detalle}</p>}
        <div className="mt-auto pt-1 flex items-baseline gap-1.5 flex-wrap">
          <span className="num font-bold">{dinero(precio, moneda)}</span>
          {precioAntes != null && <span className="num text-xs text-tenue line-through">{precioAntes.toFixed(2)}</span>}
        </div>
      </div>
      {insignia && <span className="absolute top-2 left-2 chip bg-tinta text-fondo">{insignia}</span>}
      {agotado && <span className="absolute top-2 left-2 chip bg-locoto text-white">Agotado hoy</span>}
      {cantidad > 0 && <span className="absolute top-2 right-2 min-w-7 h-7 px-1.5 rounded-full bg-aji text-sobre-aji num font-bold grid place-items-center shadow">{cantidad}</span>}
    </button>
  );
}

// Grilla de productos con buscador y categorías. `/` enfoca el buscador.
export default function Catalogo({ cat, cantidades = {}, onProducto, onCombo, conImagenes }) {
  const [q, setQ] = useState('');
  const [categoria, setCategoria] = useState('todo');
  const ref = useRef(null);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) { e.preventDefault(); ref.current?.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const t = normalizar(q.trim());
  const productos = useMemo(() => cat.productos.filter((p) =>
    (t ? normalizar(p.nombre).includes(t) : (categoria === 'todo' || p.categoria_id === categoria))), [cat.productos, t, categoria]);
  const combos = useMemo(() => cat.combos.filter((c) =>
    (t ? normalizar(c.nombre).includes(t) : (categoria === 'todo' || categoria === 'combos'))), [cat.combos, t, categoria]);

  const chips = [
    { id: 'todo', nombre: 'Todo' },
    ...(cat.combos.length ? [{ id: 'combos', nombre: 'Combos' }] : []),
    ...cat.categorias,
  ];
  const usarImagenes = conImagenes ?? cat.productos.some((p) => p.imagen);

  return (
    <div className="flex flex-col min-h-0 h-full">
      <div className="px-4 sm:px-5 pt-4 space-y-3">
        <label className="relative block">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-tenue" />
          <input ref={ref} value={q} onChange={(e) => setQ(e.target.value)} className="campo h-12 pl-11 pr-10 text-base" placeholder="Buscar producto  ( / )" type="search" />
          {q && <button onClick={() => setQ('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-tenue" aria-label="Limpiar"><X className="w-5 h-5" /></button>}
        </label>
        {!t && (
          <div className="flex gap-2 overflow-x-auto sin-scroll -mx-4 px-4 sm:-mx-5 sm:px-5 pb-1">
            {chips.map((c) => (
              <button
                key={c.id}
                onClick={() => setCategoria(c.id)}
                className={cx('shrink-0 h-9 px-4 rounded-full text-sm font-semibold border transition',
                  categoria === c.id ? 'bg-tinta text-fondo border-tinta' : 'bg-papel border-linea text-tenue hover:text-tinta')}
              >
                {c.nombre}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="flex-1 overflow-y-auto scroll-fino px-4 sm:px-5 pt-4 pb-24 lg:pb-4">
        {cat.cargando ? <Cargando texto="Cargando menú…" /> : (productos.length + combos.length === 0) ? (
          <Vacio Icono={Search} titulo={t ? `Nada se llama “${q}”` : 'No hay productos aquí'} texto={t ? 'Revisa cómo se escribe o busca por otra palabra.' : 'Agrega productos desde Menú › Productos.'} />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5 gap-2.5 sm:gap-3">
            {combos.map((c) => (
              <Tarjeta
                key={`c${c.id}`}
                nombre={c.nombre}
                detalle={contenidoCombo(c)}
                precio={parseFloat(c.precio)}
                insignia={<><Gift className="w-3 h-3" /> Combo</>}
                cantidad={cantidades[`c${c.id}`] ?? 0}
                imagen={usarImagenes ? (c.imagen ?? null) : undefined}
                onClick={() => onCombo(c)}
              />
            ))}
            {productos.map((p) => {
              const precio = cat.precioDe(p);
              const base = parseFloat(p.precio);
              return (
                <Tarjeta
                  key={p.id}
                  nombre={p.nombre}
                  precio={precio}
                  precioAntes={precio < base ? base : null}
                  imagen={usarImagenes ? p.imagen : undefined}
                  cantidad={cantidades[p.id] ?? 0}
                  agotado={!p.disponible_hoy}
                  insignia={p.es_pesable ? <><Scale className="w-3 h-3" /> Por kilo</> : (precio < base ? 'Promo' : null)}
                  detalle={p.stock != null && p.stock <= 5 ? `Quedan ${p.stock}` : null}
                  onClick={() => onProducto(p)}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
