// Receta de un producto, dentro de su ficha en Menú › Productos: qué insumos
// se descuentan del stock cada vez que se vende. Una línea puede valer
// siempre o solo cuando se elige una opción (ej.: "Con huevo" → 1 huevo).
// Es controlado: la ficha guarda la receta junto con el producto.
import { Link } from 'react-router-dom';
import { Plus, Trash2 } from 'lucide-react';
import { numero } from '../../components/ui/formulario';
import { Cargando } from '../../components/ui/piezas';
import { UNIDADES } from '../../lib/receta';


/**
 * @param lineas    [{ insumo_id, cantidad (texto), opcion_id }]
 * @param opciones  [{ id, nombre, grupo }] de los grupos de opciones del producto
 */
export default function RecetaProducto({ lineas, onCambio, insumos, opciones, cargando, editable }) {
  const activos = insumos.filter((i) => i.activo !== 0);
  const poner = (i, k, v) => onCambio(lineas.map((l, j) => (j === i ? { ...l, [k]: v } : l)));

  return (
    <div className="mt-6">
      <p className="font-display font-semibold">Receta</p>
      <p className="text-[13px] text-tenue mb-3">Cada vez que se vende, estos insumos se descuentan del stock. También sirve para saber cuánto cuesta el plato.</p>
      {cargando ? <Cargando /> : (
        <>
          {lineas.length === 0 && (
            <p className="text-sm text-tenue rounded-xl border border-dashed border-linea px-3 py-3 mb-2">
              Sin receta: al venderlo no se descuenta ningún insumo.
            </p>
          )}
          <ul className="space-y-2">
            {lineas.map((l, i) => {
              const ins = insumos.find((x) => x.id === Number(l.insumo_id));
              const opcionPerdida = l.opcion_id && !opciones.some((o) => o.id === l.opcion_id);
              return (
                <li key={i} className="flex flex-wrap sm:flex-nowrap gap-2 items-center rounded-xl border border-linea px-2 py-2">
                  <select className="campo flex-1 min-w-[150px]" value={l.insumo_id ?? ''} disabled={!editable} onChange={(e) => poner(i, 'insumo_id', e.target.value ? Number(e.target.value) : '')} aria-label="Insumo">
                    <option value="">Insumo…</option>
                    {/* Un insumo desactivado que ya estaba en la receta se sigue mostrando. */}
                    {(ins && ins.activo === 0 ? [...activos, ins] : activos).map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
                  </select>
                  <div className="flex items-center gap-1">
                    <input className="campo w-24 num" inputMode="decimal" placeholder="0" value={l.cantidad} disabled={!editable} onChange={(e) => poner(i, 'cantidad', numero(e.target.value))} aria-label="Cantidad" />
                    <span className="w-6 text-sm text-tenue">{ins ? UNIDADES[ins.unidad_medida] : ''}</span>
                  </div>
                  {(opciones.length > 0 || l.opcion_id) && (
                    <select className="campo sm:w-44" value={l.opcion_id ?? ''} disabled={!editable} onChange={(e) => poner(i, 'opcion_id', e.target.value ? Number(e.target.value) : null)} aria-label="Cuándo se usa">
                      <option value="">Siempre</option>
                      {opciones.map((o) => <option key={o.id} value={o.id}>Solo con {o.nombre}</option>)}
                      {opcionPerdida && <option value={l.opcion_id}>Opción que ya no tiene</option>}
                    </select>
                  )}
                  {editable && (
                    <button type="button" className="btn-icono btn-fantasma h-9 w-9" onClick={() => onCambio(lineas.filter((_, j) => j !== i))} aria-label="Quitar insumo">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          {editable && (
            <div className="flex flex-wrap items-center gap-3 mt-2">
              <button type="button" className="btn-fantasma" disabled={!activos.length} onClick={() => onCambio([...lineas, { insumo_id: '', cantidad: '', opcion_id: null }])}>
                <Plus className="w-4 h-4" /> Agregar insumo
              </button>
              {!activos.length && <span className="text-[13px] text-tenue">Primero crea los insumos en <Link to="/inventario/insumos" className="underline">Inventario › Insumos</Link>.</span>}
            </div>
          )}
        </>
      )}
    </div>
  );
}
