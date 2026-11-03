import { useState } from 'react';
import { Check } from 'lucide-react';
import Hoja from '../../components/ui/Hoja';
import { cx, dinero } from '../../lib/util';
import { useMoneda } from '../../hooks/useConfig';

// Todos los grupos de opciones en una sola hoja (no un paso por grupo): el
// cajero ve todo junto y confirma una vez. Los obligatorios bloquean el botón.
export default function HojaOpciones({ producto, subtitulo, precioBase, onElegir, onCerrar }) {
  const moneda = useMoneda();
  const grupos = producto.grupos_opciones ?? [];
  const [sel, setSel] = useState({}); // { grupoId: [opcion] }
  const [nota, setNota] = useState('');

  const tocar = (g, o) => {
    setSel((s) => {
      const actuales = s[g.id] ?? [];
      if (g.tipo_seleccion === 'unica') return { ...s, [g.id]: actuales[0]?.id === o.id ? [] : [o] };
      const ya = actuales.some((x) => x.id === o.id);
      return { ...s, [g.id]: ya ? actuales.filter((x) => x.id !== o.id) : [...actuales, o] };
    });
  };

  const faltan = grupos.filter((g) => g.obligatorio && !(sel[g.id]?.length));
  const elegidas = Object.values(sel).flat();
  const extra = elegidas.reduce((s, o) => s + (o.precio_adicional || 0), 0);

  const confirmar = () => {
    const partes = grupos
      .map((g) => (sel[g.id]?.length ? `${g.nombre}: ${sel[g.id].map((o) => o.nombre).join(', ')}` : null))
      .filter(Boolean);
    if (nota.trim()) partes.push(nota.trim());
    let texto = partes.join(' · ') || null;
    if (texto && texto.length > 255) texto = `${texto.slice(0, 252)}...`;
    onElegir({ nota: texto, opcionIds: elegidas.map((o) => o.id), extra });
  };

  return (
    <Hoja
      onCerrar={onCerrar}
      titulo={producto.nombre}
      subtitulo={subtitulo}
      pie={(
        <button data-principal className="btn-aji btn-lg w-full" disabled={faltan.length > 0} onClick={confirmar}>
          {faltan.length ? `Elige ${faltan[0].nombre.toLowerCase()}` : (precioBase == null ? (extra > 0 ? `Continuar · +${dinero(extra, moneda)}` : 'Continuar') : `Agregar · ${dinero(precioBase + extra, moneda)}`)}
        </button>
      )}
    >
      <div className="space-y-5">
        {grupos.map((g) => (
          <fieldset key={g.id}>
            <legend className="flex items-baseline gap-2 mb-2">
              <span className="font-display font-semibold text-[17px]">{g.nombre}</span>
              <span className="text-xs text-tenue">{g.obligatorio ? 'Obligatorio' : 'Opcional'}{g.tipo_seleccion === 'multiple' ? ' · varias' : ''}</span>
            </legend>
            <div className="grid grid-cols-2 gap-2">
              {g.opciones.map((o) => {
                const activo = sel[g.id]?.some((x) => x.id === o.id);
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => tocar(g, o)}
                    className={cx(
                      'min-h-[52px] rounded-xl border-2 px-3 py-2 text-left flex items-center gap-2 transition',
                      activo ? 'border-tinta bg-tinta text-fondo' : 'border-linea hover:border-tenue',
                    )}
                  >
                    <span className="flex-1 font-medium leading-tight">{o.nombre}</span>
                    {o.precio_adicional > 0 && <span className={cx('text-xs num', activo ? 'text-aji' : 'text-tenue')}>+{o.precio_adicional.toFixed(2)}</span>}
                    {activo && <Check className="w-4 h-4 text-aji" />}
                  </button>
                );
              })}
            </div>
          </fieldset>
        ))}
        <div>
          <label className="etiqueta" htmlFor="nota-op">Nota para cocina</label>
          <input id="nota-op" className="campo" placeholder="Sin cebolla, bien cocido…" value={nota} onChange={(e) => setNota(e.target.value)} maxLength={120} />
        </div>
      </div>
    </Hoja>
  );
}
