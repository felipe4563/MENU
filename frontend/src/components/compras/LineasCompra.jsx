// Líneas de una compra (qué, cantidad, costo c/u). La usan Compras y la caja.
import { Plus, Trash2 } from 'lucide-react';
import { numero } from '../ui/formulario';
import { lineaVacia } from '../../lib/compras';

export default function LineasCompra({ items, onCambio, catalogo }) {
  const set = (i, k, v) => onCambio(items.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const insumos = catalogo?.insumos ?? [];
  const productos = catalogo?.productos ?? [];
  const columnas = 'grid grid-cols-[minmax(0,1fr)_76px_92px_36px] sm:grid-cols-[minmax(0,1fr)_90px_110px_36px] gap-2';
  return (
    <div>
      <div className={`${columnas} text-[13px] text-tenue mb-1 px-1`}><span>Qué</span><span>Cantidad</span><span>Costo c/u</span><span /></div>
      {items.map((x, i) => (
        <div key={i} className={`${columnas} mb-2`}>
          <select className="campo min-w-0" value={x.clave} onChange={(e) => set(i, 'clave', e.target.value)} aria-label="Qué">
            <option value="">Elige…</option>
            {insumos.length > 0 && <optgroup label="Insumos">{insumos.map((s) => <option key={`i${s.id}`} value={`i:${s.id}`}>{s.nombre} ({s.unidad_medida})</option>)}</optgroup>}
            {productos.length > 0 && <optgroup label="Productos con stock">{productos.map((p) => <option key={`p${p.id}`} value={`p:${p.id}`}>{p.nombre}</option>)}</optgroup>}
          </select>
          <input className="campo num" inputMode="decimal" aria-label="Cantidad" value={x.cantidad} onChange={(e) => set(i, 'cantidad', numero(e.target.value))} />
          <input className="campo num" inputMode="decimal" aria-label="Costo por unidad" value={x.costo_unitario} onChange={(e) => set(i, 'costo_unitario', numero(e.target.value))} />
          <button type="button" className="btn-icono btn-fantasma h-11 w-9" disabled={items.length === 1} onClick={() => onCambio(items.filter((_, j) => j !== i))} aria-label="Quitar línea"><Trash2 className="w-4 h-4" /></button>
        </div>
      ))}
      <button type="button" className="btn-fantasma" onClick={() => onCambio([...items, lineaVacia()])}><Plus className="w-4 h-4" /> Otra línea</button>
    </div>
  );
}
