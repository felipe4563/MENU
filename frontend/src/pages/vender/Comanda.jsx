import { Minus, Plus, Trash2, Armchair, ShoppingBag, Bike, ChevronDown } from 'lucide-react';
import { cx, dinero } from '../../lib/util';
import { useMoneda } from '../../hooks/useConfig';

// El ticket que se va armando. Visualmente es una comanda de papel térmico.
export function DestinoChips({ destino, onMesa, onLlevar, onDelivery }) {
  const base = 'flex-1 h-11 rounded-xl border-2 text-sm font-semibold flex items-center justify-center gap-1.5 transition';
  return (
    <div className="flex gap-2">
      <button onClick={onMesa} className={cx(base, destino?.tipo === 'mesa' ? 'border-tinta bg-tinta text-fondo' : 'border-linea hover:border-tenue')}>
        <Armchair className="w-4 h-4" /> {destino?.tipo === 'mesa' ? destino.mesa.nombre : 'Mesa'} <ChevronDown className="w-3.5 h-3.5 opacity-60" />
      </button>
      <button onClick={onLlevar} className={cx(base, destino?.tipo === 'llevar' ? 'border-tinta bg-tinta text-fondo' : 'border-linea hover:border-tenue')}>
        <ShoppingBag className="w-4 h-4" /> Llevar
      </button>
      <button onClick={onDelivery} className={cx(base, destino?.tipo === 'delivery' ? 'border-tinta bg-tinta text-fondo' : 'border-linea hover:border-tenue')}>
        <Bike className="w-4 h-4" /> Delivery
      </button>
    </div>
  );
}

export function LineaComanda({ linea, onMas, onMenos, onQuitar, deshabilitado }) {
  const moneda = useMoneda();
  return (
    <li className="group py-2.5 flex items-start gap-3">
      <div className="flex items-center gap-1 rounded-full bg-hundido p-0.5 shrink-0">
        <button className="w-7 h-7 rounded-full grid place-items-center hover:bg-papel disabled:opacity-40" onClick={onMenos} disabled={deshabilitado} aria-label="Uno menos">
          {linea.cantidad > 1 ? <Minus className="w-3.5 h-3.5" /> : <Trash2 className="w-3.5 h-3.5 text-locoto" />}
        </button>
        <span className="num w-5 text-center font-bold text-sm">{linea.peso ? '1' : linea.cantidad}</span>
        <button className="w-7 h-7 rounded-full grid place-items-center hover:bg-papel disabled:opacity-40" onClick={onMas} disabled={deshabilitado || !!linea.peso} aria-label="Uno más">
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold leading-tight">{linea.nombre}</p>
        {linea.peso && <p className="text-xs text-tenue num">{linea.peso} kg</p>}
        {linea.detalle && <p className="text-xs text-tenue leading-snug">{linea.detalle}</p>}
        {linea.nota && <p className="text-xs text-tinta/80 italic leading-snug">“{linea.nota}”</p>}
      </div>
      <div className="text-right">
        <p className="num font-semibold">{dinero(linea.precio * linea.cantidad, moneda)}</p>
        {onQuitar && (
          <button onClick={onQuitar} className="text-xs text-tenue hover:text-locoto opacity-0 group-hover:opacity-100 focus:opacity-100">Quitar</button>
        )}
      </div>
    </li>
  );
}

export function TotalComanda({ total, items }) {
  const moneda = useMoneda();
  return (
    <div className="flex items-end justify-between">
      <span className="text-sm text-tenue">{items} {items === 1 ? 'producto' : 'productos'}</span>
      <span className="num text-[30px] leading-none font-extrabold">{dinero(total, moneda)}</span>
    </div>
  );
}
