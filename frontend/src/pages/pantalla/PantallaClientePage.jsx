import { useEffect, useRef, useState } from 'react';
import { Maximize, QrCode } from 'lucide-react';
import { useConfigPublica, useMoneda } from '../../hooks/useConfig';
import { logoSrc } from '../../api/configuracion';
import { srcQr } from '../../components/ui/formulario';
import { escucharPantalla } from '../../lib/pantallaCliente';
import { cx, dinero } from '../../lib/util';

const SEGUNDOS_GRACIAS = 8;
const SEGUNDOS_VITRINA = 6;
// Las rutas /uploads/... se completan con la dirección del servidor.
const srcDe = (s) => (s && s.startsWith('/') ? logoSrc(s) : s);

// Foto del plato. Sin foto: un plato dibujado con la inicial, para que la
// pantalla no tenga huecos aunque el menú no tenga fotos.
function Foto({ src, nombre, className, grande = false }) {
  const [rota, setRota] = useState(null); // la foto que no cargó
  if (src && rota !== src) return <img src={srcDe(src)} alt="" onError={() => setRota(src)} className={cx('object-cover', className)} />;
  return (
    <div className={cx('grid place-items-center bg-aji', className)} aria-hidden>
      <div className={cx('aspect-square rounded-full bg-sobre-aji/10 ring-sobre-aji/20 grid place-items-center', grande ? 'w-[min(55%,45vh)] max-w-[22rem] ring-[14px] -translate-y-[10%]' : 'w-[72%] ring-[3px]')}>
        <span className={cx('font-display font-extrabold text-sobre-aji leading-none', grande ? 'text-[clamp(4rem,10vw,9rem)]' : 'text-xl')}>
          {(nombre || '?').trim().charAt(0).toUpperCase()}
        </span>
      </div>
    </div>
  );
}

// La línea que acaba de cambiar (nueva o con más cantidad) pasa a la foto
// grande; si solo se quitó algo, se queda la última de la lista.
function useUltimaAgregada(lineas) {
  const previas = useRef(new Map());
  const [ultimaId, setUltimaId] = useState(null);
  useEffect(() => {
    const cambio = lineas.find((l) => (previas.current.get(l.id) ?? 0) < l.cantidad);
    if (cambio) setUltimaId(cambio.id);
    previas.current = new Map(lineas.map((l) => [l.id, l.cantidad]));
  }, [lineas]);
  return lineas.find((l) => l.id === ultimaId) ?? lineas[lineas.length - 1] ?? null;
}

function Espera({ logo, nombre, vitrina, moneda }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (vitrina.length < 2) return undefined;
    const t = setInterval(() => setI((x) => (x + 1) % vitrina.length), SEGUNDOS_VITRINA * 1000);
    return () => clearInterval(t);
  }, [vitrina.length]);

  if (!vitrina.length) {
    return (
      <main className="flex-1 grid place-items-center p-8 text-center">
        <div>
          {logo && <img src={logo} alt="" className="w-40 h-40 rounded-[2rem] object-cover mx-auto mb-8 shadow-flota" />}
          <p className="font-display font-extrabold text-[clamp(2.5rem,6vw,4.5rem)] leading-none">{nombre}</p>
          <p className="text-2xl text-tenue mt-5">Te atendemos enseguida</p>
        </div>
      </main>
    );
  }
  const p = vitrina[i % vitrina.length];
  return (
    <main className="flex-1 min-h-0 p-6 lg:p-8 flex flex-col">
      <div className="relative flex-1 min-h-0 rounded-[32px] overflow-hidden bg-pizarra">
        {vitrina.map((v, k) => (
          <img key={v.imagen} src={srcDe(v.imagen)} alt="" className={cx('absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 motion-reduce:transition-none', k === i % vitrina.length ? 'opacity-100' : 'opacity-0')} />
        ))}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-8 lg:p-12 text-white flex items-end gap-6">
          <div className="flex-1 min-w-0">
            <p className="text-xl opacity-80">Te atendemos enseguida</p>
            <p className="font-display font-extrabold text-[clamp(2.5rem,6vw,5rem)] leading-[0.95] mt-2">{p.nombre}</p>
          </div>
          <p className="num font-display font-extrabold text-[clamp(1.75rem,3.5vw,3rem)] rounded-2xl bg-aji text-sobre-aji px-5 py-2 shrink-0">{dinero(p.precio, moneda)}</p>
        </div>
      </div>
      {vitrina.length > 1 && (
        <div className="flex justify-center gap-2 pt-4" aria-hidden>
          {vitrina.map((v, k) => <span key={v.imagen} className={cx('h-1.5 rounded-full transition-all', k === i % vitrina.length ? 'w-8 bg-aji' : 'w-1.5 bg-linea')} />)}
        </div>
      )}
    </main>
  );
}

// Pantalla que mira el cliente (segundo monitor de la caja). Solo muestra:
// no tiene botones de venta. Se abre desde Vender › Pantalla del cliente.
export default function PantallaClientePage() {
  const { data: config = {} } = useConfigPublica();
  const moneda = useMoneda();
  const [comanda, setComanda] = useState({ lineas: [], total: 0 });
  const [vitrina, setVitrina] = useState([]);
  const [overlay, setOverlay] = useState(null);
  const timer = useRef(null);
  const lista = useRef(null);

  useEffect(() => {
    document.title = 'Pantalla del cliente';
    return escucharPantalla((m) => {
      if (!m?.tipo) return;
      if (m.tipo === 'comanda') setComanda({ lineas: m.lineas ?? [], total: m.total ?? 0 });
      else if (m.tipo === 'vitrina') setVitrina(m.productos ?? []);
      else if (m.tipo === 'cobro' || m.tipo === 'qr') { clearTimeout(timer.current); setOverlay(m); }
      else if (m.tipo === 'gracias') {
        setOverlay(m);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setOverlay((o) => (o?.tipo === 'gracias' ? null : o)), SEGUNDOS_GRACIAS * 1000);
      } else if (m.tipo === 'fin_cobro') setOverlay((o) => (o?.tipo === 'cobro' ? null : o));
      else if (m.tipo === 'fin_qr') setOverlay((o) => (o?.tipo === 'qr' ? null : o));
    });
  }, []);

  const ultima = useUltimaAgregada(comanda.lineas);
  // El último producto agregado siempre a la vista.
  useEffect(() => {
    const el = lista.current?.querySelector(`[data-linea="${ultima?.id}"]`);
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [ultima?.id, ultima?.cantidad]);

  const pantallaCompleta = () => document.documentElement.requestFullscreen?.().catch(() => {});
  const logo = logoSrc(config.logo);
  const nombre = config.nombre_negocio || 'Bienvenido';
  const vacia = comanda.lineas.length === 0;
  const unidades = comanda.lineas.reduce((s, l) => s + (l.peso ? 1 : Number(l.cantidad) || 0), 0);
  const cobrando = overlay?.tipo === 'cobro';
  const montoGrande = cobrando ? overlay.aPagar : comanda.total;

  return (
    <div className="h-dvh bg-fondo text-tinta flex flex-col overflow-hidden select-none">
      <header className="flex items-center gap-4 px-6 lg:px-8 py-4 shrink-0">
        {logo && <img src={logo} alt="" className="w-12 h-12 rounded-2xl object-cover" />}
        <p className="font-display font-extrabold text-2xl lg:text-3xl flex-1 truncate">{nombre}</p>
        <button onClick={pantallaCompleta} className="btn-icono btn-fantasma opacity-30 hover:opacity-100" aria-label="Pantalla completa"><Maximize className="w-5 h-5" /></button>
      </header>

      {overlay?.tipo === 'qr' ? (
        <main className="flex-1 min-h-0 p-6 lg:p-8 grid lg:grid-cols-2 gap-8 items-center">
          <div className="text-center lg:text-left lg:pl-8">
            <p className="text-2xl text-tenue flex items-center justify-center lg:justify-start gap-2"><QrCode className="w-7 h-7" /> Escanea con la app de tu banco</p>
            <p className="num font-display font-extrabold text-[clamp(3rem,7vw,6rem)] leading-none mt-4">{dinero(overlay.monto, moneda)}</p>
            {unidades > 0 && <p className="text-xl text-tenue mt-4">{unidades} {unidades === 1 ? 'producto' : 'productos'}</p>}
          </div>
          <div className="justify-self-center bg-white rounded-[32px] p-6 shadow-flota">
            <img src={srcQr(overlay.qr_code)} alt="QR para pagar" className="w-[min(55vh,420px)] h-[min(55vh,420px)] object-contain" />
          </div>
        </main>
      ) : overlay?.tipo === 'gracias' ? (
        <main className="flex-1 grid place-items-center p-8 text-center">
          <div className="motion-safe:animate-entra">
            <p className="font-display font-extrabold text-[clamp(4rem,10vw,8rem)] leading-none">¡Gracias!</p>
            {overlay.cambio > 0 ? (
              <div className="mt-8 inline-block rounded-3xl bg-aji text-sobre-aji px-10 py-6">
                <p className="text-2xl opacity-80">Tu cambio</p>
                <p className="num font-display font-extrabold text-[clamp(3rem,7vw,5.5rem)] leading-none mt-1">{dinero(overlay.cambio, moneda)}</p>
              </div>
            ) : <p className="text-3xl text-tenue mt-6">Pagaste <span className="num font-bold text-tinta">{dinero(overlay.cobrado, moneda)}</span></p>}
            <p className="text-2xl text-tenue mt-8">¡Buen provecho!</p>
          </div>
        </main>
      ) : vacia && !overlay ? (
        <Espera logo={logo} nombre={nombre} vitrina={vitrina} moneda={moneda} />
      ) : (
        <main className="flex-1 min-h-0 px-6 lg:px-8 pb-6 lg:pb-8 flex flex-col lg:flex-row gap-6">
          {/* Lo último que se agregó, en grande */}
          {ultima && (
            <section key={`${ultima.id}-${ultima.cantidad}`} className="relative shrink-0 h-[34vh] lg:h-auto lg:flex-[1.15] rounded-[32px] overflow-hidden bg-pizarra motion-safe:animate-entra">
              <Foto src={ultima.imagen} nombre={ultima.nombre} grande className="absolute inset-0 w-full h-full" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/5 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-6 lg:p-10 text-white flex items-end gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-lg opacity-80">{ultima.cantidad > 1 && !ultima.peso ? `Llevas ${ultima.cantidad}` : 'Acabas de agregar'}</p>
                  <p className="font-display font-extrabold text-[clamp(2rem,4.5vw,4rem)] leading-[0.95] mt-1 line-clamp-2">{ultima.nombre}</p>
                  {ultima.detalle && <p className="text-lg opacity-80 mt-2 line-clamp-1">{ultima.detalle}</p>}
                </div>
                <p className="num font-display font-extrabold text-[clamp(1.5rem,3vw,2.5rem)] shrink-0">{dinero(ultima.subtotal, moneda)}</p>
              </div>
            </section>
          )}

          {/* El pedido completo, como una cuenta */}
          <section className="flex-1 min-h-0 lg:max-w-[560px] flex flex-col rounded-[32px] bg-papel shadow-papel overflow-hidden">
            <div className="px-6 pt-5 pb-3 flex items-baseline justify-between gap-4">
              <p className="font-display font-bold text-2xl">Tu pedido</p>
              <p className="text-lg text-tenue num">{unidades} {unidades === 1 ? 'producto' : 'productos'}</p>
            </div>
            <ul ref={lista} className="flex-1 min-h-0 overflow-y-auto sin-scroll px-4 pb-3 space-y-1">
              {comanda.lineas.map((l) => (
                <li key={l.id ?? l.nombre} data-linea={l.id}
                  className={cx('flex items-center gap-4 rounded-2xl p-2 pr-3 transition-colors duration-700', l.id === ultima?.id && 'bg-aji/10')}>
                  <div className="relative shrink-0">
                    <Foto src={l.imagen} nombre={l.nombre} className="w-16 h-16 rounded-xl overflow-hidden" />
                    <span className="absolute -top-1.5 -left-1.5 min-w-7 h-7 px-1.5 rounded-full bg-tinta text-fondo num text-sm font-bold grid place-items-center">
                      {l.peso ? `${l.peso}kg` : l.cantidad}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-xl leading-tight truncate">{l.nombre}</p>
                    {l.detalle && <p className="text-base text-tenue truncate">{l.detalle}</p>}
                  </div>
                  <p className="num font-semibold text-xl shrink-0">{dinero(l.subtotal, moneda)}</p>
                </li>
              ))}
            </ul>
            <div className="bg-aji text-sobre-aji px-6 py-5 flex items-end justify-between gap-4">
              <div>
                <p className="text-xl opacity-80">{cobrando ? (overlay.etiqueta || 'A pagar') : 'Total'}</p>
                {cobrando && Math.abs(overlay.aPagar - comanda.total) > 0.005 && comanda.total > 0 && (
                  <p className="text-base opacity-75 num">Cuenta {dinero(comanda.total, moneda)}</p>
                )}
              </div>
              <p className="num font-display font-extrabold leading-none whitespace-nowrap text-[clamp(2.5rem,5vw,4.5rem)]">{dinero(montoGrande, moneda)}</p>
            </div>
          </section>
        </main>
      )}
    </div>
  );
}
