import { useMemo, useState } from 'react';
import { CheckCircle2, Minus, Plus, QrCode, UserPlus, X } from 'lucide-react';
import { Segmentado } from '../../components/ui/piezas';
import { cx, dinero } from '../../lib/util';
import { nombreMetodo } from '../../lib/metodosPago';
import {
  acomodarAsignaciones, divisionEnCurso, faltaDe, itemsDePersona, nombreDeParte, partesIguales, partesVigentes, subtotalDePersona, unidadesDelPedido,
} from '../../lib/dividirCuenta';

// Nombre libre para una persona nueva: "Persona N" que no esté en uso (ni en
// la lista ni en una parte ya pagada).
function nombreLibre(usados) {
  let n = 1;
  while (usados.includes(`Persona ${n}`)) n++;
  return `Persona ${n}`;
}

function Cabecera({ pedido, moneda }) {
  const datos = [
    ['Total', Number(pedido.total)],
    ['Pagado', Number(pedido.pagado || 0)],
    ['Falta', faltaDe(pedido)],
  ];
  return (
    <div className="rounded-2xl bg-pizarra text-sobre-pizarra p-4 grid grid-cols-3 gap-2 sm:gap-3">
      {datos.map(([etiqueta, valor], i) => (
        <div key={etiqueta} className={cx('min-w-0', i > 0 && 'border-l border-white/15 pl-2 sm:pl-3')}>
          <p className="text-xs opacity-70">{etiqueta}</p>
          <p className={cx('num font-extrabold leading-tight mt-0.5 whitespace-nowrap', i === 2 ? 'text-lg sm:text-2xl' : 'text-[15px] sm:text-lg')}>{dinero(valor, moneda)}</p>
        </div>
      ))}
    </div>
  );
}

function PartesPagadas({ pedido, moneda }) {
  const partes = partesVigentes(pedido);
  if (!partes.length) return null;
  return (
    <div>
      <p className="etiqueta">{partes.some((p) => p.estado === 'pendiente') ? 'Partes pagadas y por pagar' : 'Partes pagadas'}</p>
      <ul className="divide-y divide-dashed divide-linea rounded-xl border border-linea px-3">
        {partes.map((p, i) => (
          <li key={p.id} className="py-2 flex items-center gap-2 text-sm">
            <span className="font-semibold min-w-0 truncate">{nombreDeParte(p, i)}</span>
            <span className="text-tenue shrink-0">· {nombreMetodo(p.metodo_pago)}</span>
            {p.estado === 'pendiente' && <span className="chip bg-aji/25 text-tinta shrink-0">Esperando QR</span>}
            <span className="num ml-auto font-semibold shrink-0">{dinero(p.monto, moneda)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PorPlatos({ unidades, personas, usados, elegida, asignaciones, moneda, bloqueado, onElegir, onAgregar, onQuitar, onTocar, onCobrar }) {
  const [nueva, setNueva] = useState(null); // texto del nombre mientras se agrega
  const sinAsignar = unidades.filter((u) => !u.pagadaPor && !asignaciones[u.clave]);
  const agregar = () => { onAgregar(nueva.trim() || nombreLibre(usados)); setNueva(null); };

  return (
    <div className="grid md:grid-cols-2 gap-x-6 gap-y-4 items-start">
      <section className="space-y-2 md:order-2">
        <p className="etiqueta mb-0">Personas <span className="font-normal">· toca una y luego sus platos</span></p>
        <ul className="space-y-2">
          {personas.map((persona) => {
            const subtotal = subtotalDePersona(asignaciones, persona, unidades);
            const cuantos = Object.values(asignaciones).filter((q) => q === persona).length;
            const activa = persona === elegida;
            return (
              <li key={persona} className={cx('rounded-xl border-2 p-2 flex items-center gap-2 transition', activa ? 'border-aji bg-aji/10' : 'border-linea')}>
                <button type="button" className="flex-1 min-w-0 text-left px-1" onClick={() => onElegir(persona)} aria-pressed={activa}>
                  <span className="block font-semibold truncate">{persona}</span>
                  <span className="block text-xs text-tenue">{cuantos} {cuantos === 1 ? 'plato' : 'platos'}</span>
                </button>
                {cuantos === 0 && personas.length > 1 && (
                  <button type="button" className="btn-icono btn-fantasma h-8 w-8" onClick={() => onQuitar(persona)} aria-label={`Quitar a ${persona}`}><X className="w-4 h-4" /></button>
                )}
                <button type="button" className="btn-aji h-10 px-3 shrink-0 num" disabled={bloqueado || subtotal <= 0} onClick={() => onCobrar(persona, subtotal)}>
                  Cobrar {dinero(subtotal, moneda)}
                </button>
              </li>
            );
          })}
        </ul>
        {nueva === null ? (
          <button type="button" className="btn-borde w-full" onClick={() => setNueva('')}><UserPlus className="w-4 h-4" /> Persona</button>
        ) : (
          <div className="flex gap-2">
            <input
              autoFocus
              className="campo min-w-0"
              placeholder={nombreLibre(usados)}
              value={nueva}
              maxLength={40}
              onChange={(e) => setNueva(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') agregar(); if (e.key === 'Escape') setNueva(null); }}
            />
            <button type="button" className="btn-aji shrink-0" onClick={agregar}>Agregar</button>
          </div>
        )}
      </section>

      <section className="space-y-2 md:order-1">
        <p className="etiqueta mb-0">
          Platos{sinAsignar.length > 0 && <span className="font-normal"> · {sinAsignar.length} sin asignar ({dinero(sinAsignar.reduce((s, u) => s + u.precio, 0), moneda)})</span>}
        </p>
        <ul className="space-y-1.5">
          {unidades.map((u) => {
            const quien = asignaciones[u.clave];
            return (
              <li key={u.clave}>
                <button
                  type="button"
                  disabled={!!u.pagadaPor || bloqueado}
                  onClick={() => onTocar(u.clave)}
                  className={cx(
                    'w-full min-h-11 rounded-xl border px-3 py-2 flex items-center gap-2 text-left transition',
                    u.pagadaPor ? 'border-linea bg-hundido text-tenue' : quien === elegida ? 'border-aji bg-aji/10' : quien ? 'border-linea bg-papel' : 'border-dashed border-linea hover:border-tenue',
                  )}
                >
                  <span className={cx('flex-1 min-w-0 truncate', !u.pagadaPor && 'font-medium')}>{u.nombre}</span>
                  {u.esperandoQr ? (
                    <span className="chip bg-aji/25 text-tinta shrink-0 max-w-[45%] truncate" title={`${u.pagadaPor}: esperando el QR`}><QrCode className="w-3 h-3 shrink-0" /> Esperando QR</span>
                  ) : u.pagadaPor ? (
                    <span className="chip bg-hierba/15 text-hierba shrink-0 max-w-[45%] truncate"><CheckCircle2 className="w-3 h-3 shrink-0" /> {u.pagadaPor}</span>
                  ) : quien ? (
                    <span className={cx('chip shrink-0 max-w-[45%] truncate', quien === elegida ? 'bg-aji text-sobre-aji' : 'bg-hundido text-tinta')}>{quien}</span>
                  ) : null}
                  <span className="num text-sm shrink-0">{dinero(u.precio, moneda)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

function PartesIgualesVista({ falta, entre, cobradas, moneda, bloqueado, onEntre, onCobrar }) {
  const partes = partesIguales(falta, entre);
  const de = cobradas + entre;
  const ultimaDistinta = partes.length > 1 && partes[partes.length - 1] !== partes[0];
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="font-semibold">{cobradas > 0 ? 'Faltan' : 'Entre'}</span>
        <div className="flex items-center gap-1 rounded-full bg-hundido p-1">
          <button type="button" className="w-10 h-10 rounded-full grid place-items-center hover:bg-papel disabled:opacity-40" disabled={entre <= 1} onClick={() => onEntre(entre - 1)} aria-label="Una parte menos"><Minus className="w-4 h-4" /></button>
          <span className="num w-8 text-center text-xl font-bold">{entre}</span>
          <button type="button" className="w-10 h-10 rounded-full grid place-items-center hover:bg-papel disabled:opacity-40" disabled={entre >= 20} onClick={() => onEntre(entre + 1)} aria-label="Una parte más"><Plus className="w-4 h-4" /></button>
        </div>
        <p className="text-sm text-tenue">
          {cobradas > 0 && <>Ya pagaron {cobradas} de {de} · </>}
          {entre === 1 ? 'Se cobra todo lo que falta' : <><span className="num font-semibold text-tinta">{dinero(partes[0], moneda)}</span> cada una</>}
          {ultimaDistinta && <> · la última <span className="num">{dinero(partes[partes.length - 1], moneda)}</span></>}
        </p>
      </div>
      <button type="button" data-principal className="btn-aji btn-lg w-full num" disabled={bloqueado || falta <= 0} onClick={() => onCobrar(partes[0])}>
        {de > 1 ? `Cobrar parte ${cobradas + 1} de ${de}` : 'Cobrar lo que falta'} · {dinero(partes[0], moneda)}
      </button>
    </div>
  );
}

/**
 * Modo dividido de la hoja de cobro. Arma la parte (por platos o en partes
 * iguales) y la cobra con `renderCobro(parte, { onListo, onVolver })`, que
 * muestra efectivo/QR y llama onListo(resultado) cuando la parte se cobró.
 * parte: { modo, monto, persona, items, etiqueta }
 */
export default function DividirCuenta({ pedido, moneda, renderCobro, onCancelarQr, cancelandoQr }) {
  const pagadores = partesVigentes(pedido).map((p) => p.persona).filter(Boolean);
  const [modo, setModo] = useState('platos');
  const [personas, setPersonas] = useState(() => [nombreLibre(pagadores)]);
  const [elegida, setElegida] = useState(personas[0]);
  const [asignacionesGuardadas, setAsignaciones] = useState({});
  // Partes iguales: "entre" son las que faltan y "cobradas" las ya pagadas
  // de esta misma división (se retoma si se cerró la hoja a medias).
  const [division] = useState(() => divisionEnCurso(pedido));
  const [entre, setEntre] = useState(division ? division.partes_de - division.parte_numero : 2);
  const [cobradas, setCobradas] = useState(division ? division.parte_numero : 0);
  const [parte, setParte] = useState(null);
  const [aviso, setAviso] = useState(null);

  const unidades = useMemo(() => unidadesDelPedido(pedido), [pedido]);
  // Si el pedido cambió (alguien pagó o se agregaron platos) se acomodan solas.
  const asignaciones = useMemo(() => acomodarAsignaciones(asignacionesGuardadas, unidades), [asignacionesGuardadas, unidades]);
  const falta = faltaDe(pedido);
  const qrPendiente = partesVigentes(pedido).some((p) => p.estado === 'pendiente');

  const tocar = (clave) => {
    if (!elegida) return;
    const sig = { ...asignaciones };
    if (sig[clave] === elegida) delete sig[clave];
    else sig[clave] = elegida;
    setAsignaciones(sig);
  };

  const agregarPersona = (nombre) => {
    let final = nombre;
    for (let n = 2; personas.includes(final) || pagadores.includes(final); n++) final = `${nombre} ${n}`;
    setPersonas([...personas, final]);
    setElegida(final);
  };

  const quitarPersona = (persona) => {
    const resto = personas.filter((p) => p !== persona);
    setPersonas(resto);
    if (elegida === persona) setElegida(resto[0] ?? null);
  };

  // La parte se cobró: quien pagó por platos sale de la lista; en partes
  // iguales queda una parte menos para lo que falta.
  const listo = (r) => {
    if (parte.modo === 'platos') {
      const sinElla = Object.fromEntries(Object.entries(asignaciones).filter(([, q]) => q !== parte.persona));
      setAsignaciones(acomodarAsignaciones(sinElla, unidadesDelPedido(r.pedido)));
      const resto = personas.filter((p) => p !== parte.persona);
      const siguientes = resto.length ? resto : [nombreLibre([...pagadores, parte.persona])];
      setPersonas(siguientes);
      setElegida(siguientes[0]);
    } else {
      if (parte.partes_de) setCobradas((c) => c + 1);
      setEntre((n) => Math.max(1, n - 1));
    }
    setAviso({ etiqueta: parte.etiqueta, monto: r.monto, cambio: r.cambio, metodo: r.metodo });
    setParte(null);
  };

  if (parte) {
    return renderCobro(parte, { onListo: listo, onVolver: () => setParte(null) });
  }

  const cobrarPersona = (persona, monto) => setParte({
    modo: 'platos', persona, monto, items: itemsDePersona(asignaciones, persona), etiqueta: persona,
  });
  const cobrarIgual = (monto) => {
    const de = cobradas + entre;
    setParte(de > 1
      ? { modo: 'iguales', persona: null, monto, parte_numero: cobradas + 1, partes_de: de, etiqueta: `Parte ${cobradas + 1} de ${de}` }
      : { modo: 'iguales', persona: null, monto, etiqueta: 'Lo que falta' });
  };

  return (
    <div className="space-y-4 min-w-0">
      <Cabecera pedido={pedido} moneda={moneda} />

      {aviso && (
        <div className="flex items-start gap-3 rounded-xl bg-hierba/10 px-3 py-2.5" role="status">
          <CheckCircle2 className="w-5 h-5 text-hierba shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0 text-sm">
            <p className="font-semibold">{aviso.etiqueta}: cobrado <span className="num">{dinero(aviso.monto, moneda)}</span></p>
            {aviso.metodo === 'efectivo' && aviso.cambio > 0 && (
              <p>Entrega de cambio <span className="num text-xl font-extrabold">{dinero(aviso.cambio, moneda)}</span></p>
            )}
          </div>
          <button type="button" className="btn-icono btn-fantasma h-8 w-8" onClick={() => setAviso(null)} aria-label="Cerrar aviso"><X className="w-4 h-4" /></button>
        </div>
      )}

      {qrPendiente && (
        <div className="flex items-center gap-3 rounded-xl bg-aji/15 px-3 py-2.5 text-sm">
          <QrCode className="w-5 h-5 shrink-0" />
          <p className="flex-1 min-w-0">Hay un QR esperando confirmación. Cuando se pague o se cancele, sigues cobrando.</p>
          <button type="button" className="btn-fantasma h-9 text-locoto shrink-0" disabled={cancelandoQr} onClick={onCancelarQr}>Cancelar QR</button>
        </div>
      )}

      <Segmentado
        className="w-full"
        valor={modo}
        onCambio={setModo}
        opciones={[{ valor: 'platos', etiqueta: 'Por platos' }, { valor: 'iguales', etiqueta: 'Partes iguales' }]}
      />

      {modo === 'platos' ? (
        <PorPlatos
          unidades={unidades}
          personas={personas}
          usados={[...personas, ...pagadores]}
          elegida={elegida}
          asignaciones={asignaciones}
          moneda={moneda}
          bloqueado={qrPendiente}
          onElegir={setElegida}
          onAgregar={agregarPersona}
          onQuitar={quitarPersona}
          onTocar={tocar}
          onCobrar={cobrarPersona}
        />
      ) : (
        <PartesIgualesVista falta={falta} entre={entre} cobradas={cobradas} moneda={moneda} bloqueado={qrPendiente} onEntre={setEntre} onCobrar={cobrarIgual} />
      )}

      <PartesPagadas pedido={pedido} moneda={moneda} />
    </div>
  );
}
