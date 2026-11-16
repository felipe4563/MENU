import { useState } from 'react';
import { HandCoins } from 'lucide-react';
import { Segmentado } from '../../components/ui/piezas';
import { cx, dinero } from '../../lib/util';
import { horasTexto, repartir } from '../../lib/repartir';

// Reparto de las propinas del turno entre quienes marcaron entrada. Se
// calcula en pantalla: según los minutos que cada uno trabajó dentro del
// turno o en partes iguales, y se puede quitar a alguien.
export default function RepartoPropinas({ propinas, personal, moneda }) {
  const [modo, setModo] = useState('horas');
  const [fuera, setFuera] = useState(() => new Set());
  const incluidos = personal.filter((p) => !fuera.has(p.usuario_id));
  const montos = repartir(propinas.total, incluidos.map((p) => (modo === 'horas' ? p.minutos : 1)));
  const montoDe = new Map(incluidos.map((p, i) => [p.usuario_id, montos[i]]));
  const alternar = (id) => setFuera((f) => {
    const nuevo = new Set(f);
    if (nuevo.has(id)) nuevo.delete(id); else nuevo.add(id);
    return nuevo;
  });

  return (
    <section className="ficha">
      <header className="px-5 pt-4 flex flex-wrap items-center gap-3">
        <h2 className="font-display font-semibold text-lg flex items-center gap-2 mr-auto"><HandCoins className="w-5 h-5 text-aji" /> Repartir propinas</h2>
        <span className="num font-bold">{dinero(propinas.total, moneda)}</span>
      </header>
      {personal.length === 0 ? (
        <p className="px-5 py-4 text-sm text-tenue">Nadie marcó entrada durante este turno. Para repartir, el personal tiene que marcar su entrada y salida.</p>
      ) : (
        <div className="px-5 py-3 space-y-3">
          <Segmentado
            tamano="sm"
            valor={modo}
            onCambio={setModo}
            opciones={[{ valor: 'horas', etiqueta: 'Según horas trabajadas' }, { valor: 'iguales', etiqueta: 'En partes iguales' }]}
          />
          <ul className="divide-y divide-linea">
            {personal.map((p) => {
              const dentro = !fuera.has(p.usuario_id);
              return (
                <li key={p.usuario_id} className="py-2.5 flex items-center gap-3 text-sm">
                  <input type="checkbox" className="w-4 h-4" checked={dentro} onChange={() => alternar(p.usuario_id)} aria-label={`Incluir a ${p.nombre}`} />
                  <span className={cx('flex-1 min-w-0 truncate', !dentro && 'text-tenue line-through')}>{p.nombre}</span>
                  <span className="text-tenue num shrink-0">{horasTexto(p.minutos)}</span>
                  <span className="num font-semibold w-24 text-right shrink-0">{dentro ? dinero(montoDe.get(p.usuario_id), moneda) : '—'}</span>
                </li>
              );
            })}
          </ul>
          {incluidos.length === 0 && <p className="text-sm text-locoto">Marca al menos a una persona.</p>}
          <p className="text-xs text-tenue">Según las marcaciones de entrada y salida que caen dentro del turno. Quita a quien no deba recibir.</p>
        </div>
      )}
    </section>
  );
}
