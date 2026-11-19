import { useMemo } from 'react';
import { ChevronDown, Minus, Plus, Trash2, UtensilsCrossed, ChefHat } from 'lucide-react';
import { useCatalogo } from '../datosCatalogo';
import { useAgregar } from '../useAgregar';
import Catalogo from '../Catalogo';
import Hoja from '../../../components/ui/Hoja';
import { Segmentado } from '../../../components/ui/piezas';
import { avisar } from '../../../components/ui/Aviso';
import { useMoneda } from '../../../hooks/useConfig';
import { cx, dinero } from '../../../lib/util';
import { ENVIOS_COCINA, EN_COCINA_TEXTO, totalLineas } from '../../../lib/reservas';

// Sección que se abre y se cierra dentro de la hoja de la reserva.
export function Plegable({ titulo, resumen, Icono, abierto, onAlternar, children }) {
  return (
    <section className="rounded-2xl border border-linea">
      <button type="button" className="w-full flex items-center gap-2 px-4 h-12 text-left" onClick={onAlternar} aria-expanded={abierto}>
        {Icono && <Icono className="w-4 h-4 text-tenue shrink-0" />}
        <span className="font-semibold">{titulo}</span>
        {resumen && <span className="ml-auto text-sm text-tenue num truncate">{resumen}</span>}
        <ChevronDown className={cx('w-4 h-4 text-tenue shrink-0 transition', !resumen && 'ml-auto', abierto && 'rotate-180')} />
      </button>
      {abierto && <div className="px-4 pb-4">{children}</div>}
    </section>
  );
}

function LineaPlato({ linea, bloqueado, onCambiar, onQuitar }) {
  const moneda = useMoneda();
  return (
    <li className="py-2.5 flex items-start gap-3">
      <div className="flex items-center gap-1 rounded-full bg-hundido p-0.5 shrink-0">
        <button type="button" className="w-7 h-7 rounded-full grid place-items-center hover:bg-papel disabled:opacity-40" disabled={bloqueado}
          onClick={() => (linea.cantidad > 1 ? onCambiar({ cantidad: linea.cantidad - 1 }) : onQuitar())} aria-label={linea.cantidad > 1 ? 'Uno menos' : 'Quitar'}>
          {linea.cantidad > 1 ? <Minus className="w-3.5 h-3.5" /> : <Trash2 className="w-3.5 h-3.5 text-locoto" />}
        </button>
        <span className="num w-5 text-center font-bold text-sm">{linea.cantidad}</span>
        <button type="button" className="w-7 h-7 rounded-full grid place-items-center hover:bg-papel disabled:opacity-40" disabled={bloqueado || !!linea.peso}
          onClick={() => onCambiar({ cantidad: linea.cantidad + 1 })} aria-label="Uno más">
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold leading-tight">{linea.nombre}{linea.peso ? <span className="num text-xs text-tenue font-normal"> · {linea.peso} kg</span> : null}</p>
        {linea.detalle && <p className="text-xs text-tenue leading-snug">{linea.detalle}</p>}
        {bloqueado ? (linea.nota && <p className="text-xs italic text-tenue">“{linea.nota}”</p>) : (
          <input className="mt-1 w-full bg-transparent text-xs border-b border-dashed border-linea focus:border-tinta outline-none py-0.5" placeholder="Nota para cocina"
            value={linea.nota ?? ''} maxLength={255} onChange={(e) => onCambiar({ nota: e.target.value })} aria-label={`Nota de ${linea.nombre}`} />
        )}
      </div>
      <div className="text-right shrink-0">
        <p className="num font-semibold">{dinero(linea.precio * linea.cantidad, moneda)}</p>
        {!bloqueado && <button type="button" className="text-xs text-tenue hover:text-locoto" onClick={onQuitar}>Quitar</button>}
      </div>
    </li>
  );
}

// Elegir platos del menú (mismo catálogo y opciones que en Vender).
function HojaElegirPlatos({ lineas, onAgregar, onCerrar }) {
  const cat = useCatalogo();
  const ag = useAgregar({ precioDe: cat.precioDe, onAgregar: (l) => { onAgregar(l); avisar.ok(`${l.nombre} agregado`); } });
  const cantidades = useMemo(() => {
    const m = {};
    lineas.forEach((l) => { const k = l.combo_id ? `c${l.combo_id}` : l.producto_id; m[k] = (m[k] ?? 0) + l.cantidad; });
    return m;
  }, [lineas]);
  const platos = lineas.reduce((s, l) => s + l.cantidad, 0);
  return (
    <>
      <Hoja onCerrar={onCerrar} sinRelleno ancho="max-w-3xl" titulo="Agregar platos"
        pie={<button data-principal type="button" className="btn-aji w-full" onClick={onCerrar}>Listo{platos ? ` · ${platos} ${platos === 1 ? 'plato' : 'platos'}` : ''}</button>}>
        <div className="h-[65dvh] flex flex-col">
          <div className="flex-1 min-h-0"><Catalogo cat={cat} cantidades={cantidades} onProducto={ag.producto} onCombo={ag.combo} /></div>
        </div>
      </Hoja>
      {ag.hojas}
    </>
  );
}

// Platos de la reserva: cantidad ±, nota, quitar y agregar del menú.
// `eligiendo`/`onEligiendo` los maneja la hoja de la reserva (para no cerrarse
// con Escape mientras el catálogo está encima).
export function SeccionPlatos({ lineas, onLineas, bloqueado, abierto, onAlternar, eligiendo, onEligiendo }) {
  const moneda = useMoneda();
  const total = totalLineas(lineas);
  const platos = lineas.reduce((s, l) => s + l.cantidad, 0);
  const agregar = (l) => onLineas((prev) => {
    const i = prev.findIndex((x) => x.clave === l.clave);
    if (i >= 0 && !l.peso) return prev.map((x, j) => (j === i ? { ...x, cantidad: x.cantidad + 1 } : x));
    return [...prev, { ...l, id: Math.random().toString(36).slice(2) }];
  });
  const cambiar = (id, cambios) => onLineas((prev) => prev.map((l) => (l.id === id ? { ...l, ...cambios } : l)));
  const quitar = (id) => onLineas((prev) => prev.filter((l) => l.id !== id));

  return (
    <Plegable titulo="Platos" Icono={UtensilsCrossed} abierto={abierto} onAlternar={onAlternar}
      resumen={platos ? `${platos} · ${dinero(total, moneda)}` : 'Sin platos'}>
      {bloqueado && <p className="text-sm text-tenue mb-2">{EN_COCINA_TEXTO}</p>}
      {lineas.length === 0 ? (
        <p className="text-sm text-tenue py-2">Si ya saben qué van a comer, anótalo y podrás cobrar un adelanto.</p>
      ) : (
        <ul className="divide-y divide-dashed divide-linea">
          {lineas.map((l) => (
            <LineaPlato key={l.id} linea={l} bloqueado={bloqueado} onCambiar={(c) => cambiar(l.id, c)} onQuitar={() => quitar(l.id)} />
          ))}
        </ul>
      )}
      {(!bloqueado || lineas.length > 0) && (
        <div className="flex items-center gap-3 mt-3">
          {!bloqueado && <button type="button" className="btn-borde h-10" onClick={() => onEligiendo(true)}><Plus className="w-4 h-4" /> Agregar platos</button>}
          {lineas.length > 0 && <p className="ml-auto text-sm">Total <span className="num font-bold text-base">{dinero(total, moneda)}</span></p>}
        </div>
      )}
      {eligiendo && <HojaElegirPlatos lineas={lineas} onAgregar={agregar} onCerrar={() => onEligiendo(false)} />}
    </Plegable>
  );
}

// Cuándo pasan a cocina los platos de esta reserva.
export function SeccionCocina({ valor, onCambio, bloqueado, abierto, onAlternar }) {
  const elegido = ENVIOS_COCINA.find((o) => o.valor === valor) ?? ENVIOS_COCINA[0];
  return (
    <Plegable titulo="Cuándo va a cocina" Icono={ChefHat} abierto={abierto} onAlternar={onAlternar} resumen={elegido.etiqueta}>
      {bloqueado ? <p className="text-sm text-tenue">{EN_COCINA_TEXTO}</p> : (
        <Segmentado className="w-full" tamano="sm" valor={valor} onCambio={onCambio} opciones={ENVIOS_COCINA} />
      )}
    </Plegable>
  );
}
