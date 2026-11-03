import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Minus, Plus, ShoppingBag, X, Loader2, CheckCircle2, ChefHat, Ticket, UtensilsCrossed, AlertCircle } from 'lucide-react';
import { getMenuAutoservicio, crearPedidoAutoservicio, validarCuponAutoservicio, getEstadoPedidoAutoservicio } from '../../api/autoservicio';
import { logoSrc } from '../../api/configuracion';
import { useConfigPublica } from '../../hooks/useConfig';
import { redondearAMedio } from '../../utils/precio';
import Hoja from '../../components/ui/Hoja';
import HojaOpciones from '../vender/HojaOpciones';
import { urlImagen, srcQr } from '../../components/ui/formulario';
import { cx, dinero, errorDe, iniciales } from '../../lib/util';

function Producto({ p, precio, antes, cantidad, onAgregar, moneda, soloVer }) {
  const Caja = soloVer ? 'div' : 'button';
  return (
    <Caja onClick={soloVer ? undefined : onAgregar} className={cx('w-full text-left flex gap-3 py-4 rounded-xl px-1 -mx-1', !soloVer && 'active:bg-hundido/60')}>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-[16px] leading-snug">{p.nombre}</p>
        {p.descripcion && <p className="text-sm text-tenue line-clamp-2 mt-0.5">{p.descripcion}</p>}
        <p className="mt-2 flex items-baseline gap-2">
          <span className="num font-bold">{dinero(precio, moneda)}</span>
          {antes && <span className="num text-sm text-tenue line-through">{antes.toFixed(2)}</span>}
        </p>
      </div>
      <div className="relative w-24 h-24 shrink-0">
        {p.imagen ? <img src={urlImagen(p.imagen)} alt="" loading="lazy" className="w-full h-full rounded-2xl object-cover" /> : <div className="w-full h-full rounded-2xl bg-hundido grid place-items-center"><UtensilsCrossed className="w-6 h-6 text-linea" /></div>}
        {!soloVer && (
          <span className={cx('absolute -bottom-2 -right-2 min-w-9 h-9 px-2 rounded-full grid place-items-center shadow-papel font-bold num', cantidad ? 'bg-aji text-sobre-aji' : 'bg-papel border border-linea')}>
            {cantidad || <Plus className="w-4 h-4" />}
          </span>
        )}
      </div>
    </Caja>
  );
}

function Seguimiento({ codigo, pedido, pagoQr, moneda, onNuevo }) {
  const estado = useQuery({
    queryKey: ['auto-estado', pedido.id],
    queryFn: () => getEstadoPedidoAutoservicio(codigo, pedido.id),
    refetchInterval: (q) => (!q.state.data?.estado || q.state.data.estado === 'pendiente' ? 3000 : false),
  });
  const e = estado.data?.estado ?? 'pendiente';
  if (e === 'completado') {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center text-center px-6 gap-4">
        <CheckCircle2 className="w-16 h-16 text-hierba" />
        <h1 className="text-3xl font-extrabold">¡Pedido confirmado!</h1>
        <p className="text-tenue max-w-xs flex items-center gap-2"><ChefHat className="w-5 h-5 shrink-0" /> Ya está en la cocina. Te lo llevamos a la mesa.</p>
        <button className="btn-borde mt-4" onClick={onNuevo}>Pedir algo más</button>
      </div>
    );
  }
  if (e !== 'pendiente') {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center text-center px-6 gap-4">
        <AlertCircle className="w-14 h-14 text-locoto" />
        <h1 className="text-2xl font-extrabold">El pago no se completó</h1>
        <p className="text-tenue">Tu pedido no se envió. Puedes intentarlo de nuevo.</p>
        <button className="btn-aji btn-lg" onClick={onNuevo}>Volver al menú</button>
      </div>
    );
  }
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center text-center px-6 gap-5">
      <h1 className="text-2xl font-extrabold">Paga con tu app del banco</h1>
      <div className="w-64 h-64 bg-white rounded-3xl p-3 shadow-papel"><img src={srcQr(pagoQr.qr_code)} alt="QR de pago" className="w-full h-full object-contain" /></div>
      <p className="num text-4xl font-extrabold">{dinero(pagoQr.monto_total ?? pagoQr.monto_neto, moneda)}</p>
      <p className="text-sm text-tenue flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-aji animate-latido" /> Esperando tu pago… no cierres esta pantalla</p>
      <p className="text-xs text-tenue max-w-xs">Si estás en el mismo celular, haz una captura del QR y súbela en tu app del banco.</p>
    </div>
  );
}

export default function AutoservicioPage() {
  const { codigo } = useParams();
  const { data: cfg = {} } = useConfigPublica();
  const moneda = cfg.simbolo_moneda || 'Bs';
  const menu = useQuery({ queryKey: ['auto-menu', codigo], queryFn: () => getMenuAutoservicio(codigo), retry: false, refetchInterval: 5 * 60_000 });
  const [carrito, setCarrito] = useState([]);
  const [opciones, setOpciones] = useState(null);
  const [verCarrito, setVerCarrito] = useState(false);
  const [ci, setCi] = useState('');
  const [cuponTxt, setCuponTxt] = useState('');
  const [cupon, setCupon] = useState(null);
  const [enviado, setEnviado] = useState(null);
  const [cat, setCat] = useState(null);

  const promo = useMemo(() => {
    const m = {};
    (menu.data?.promociones ?? []).forEach((p) => { m[p.producto_id] = p; });
    return m;
  }, [menu.data]);
  const precioDe = (p) => {
    const base = Number(p.precio);
    const pr = promo[p.id];
    if (!pr) return base;
    return redondearAMedio(Math.max(0, base - (pr.tipo === 'porcentaje' ? base * Number(pr.valor) / 100 : Number(pr.valor))));
  };

  const grupos = useMemo(() => {
    const g = new Map();
    (menu.data?.productos ?? []).forEach((p) => {
      const k = p.categoria?.nombre ?? 'Menú';
      if (!g.has(k)) g.set(k, []);
      g.get(k).push(p);
    });
    return [...g.entries()];
  }, [menu.data]);

  useEffect(() => { if (cfg.nombre_negocio) document.title = `Menú · ${cfg.nombre_negocio}`; }, [cfg.nombre_negocio]);

  const agregar = (l) => setCarrito((c) => {
    const i = c.findIndex((x) => x.clave === l.clave);
    if (i >= 0) return c.map((x, j) => (j === i ? { ...x, cantidad: x.cantidad + 1 } : x));
    return [...c, { ...l, cantidad: 1 }];
  });
  const cambiar = (clave, d) => setCarrito((c) => c.map((x) => (x.clave === clave ? { ...x, cantidad: x.cantidad + d } : x)).filter((x) => x.cantidad > 0));
  const tocar = (p) => {
    if (p.grupos_opciones?.length) return setOpciones(p);
    agregar({ clave: `p${p.id}`, producto_id: p.id, nombre: p.nombre, precio: precioDe(p), opcion_ids: [] });
  };

  const total = carrito.reduce((s, x) => s + x.precio * x.cantidad, 0);
  const items = carrito.reduce((s, x) => s + x.cantidad, 0);
  const itemsApi = carrito.map((x) => ({ producto_id: x.producto_id, combo_id: x.combo_id, cantidad: x.cantidad, nota: x.nota, opcion_ids: x.opcion_ids }));
  const aPagar = Math.max(0, total - (cupon?.descuento ?? 0));
  const porProducto = carrito.reduce((m, x) => ({ ...m, [x.producto_id ?? `c${x.combo_id}`]: (m[x.producto_id ?? `c${x.combo_id}`] ?? 0) + x.cantidad }), {});

  const aplicarCupon = useMutation({ mutationFn: () => validarCuponAutoservicio(codigo, cuponTxt.trim(), itemsApi), onSuccess: setCupon });
  const pedir = useMutation({
    mutationFn: () => crearPedidoAutoservicio(codigo, itemsApi, cupon?.codigo, ci.trim() || undefined),
    onSuccess: (r) => { setVerCarrito(false); setEnviado(r); },
  });

  if (enviado) {
    return <Seguimiento codigo={codigo} pedido={enviado.pedido} pagoQr={enviado.pago_qr} moneda={moneda} onNuevo={() => { setEnviado(null); setCarrito([]); setCupon(null); }} />;
  }

  if (menu.isLoading) return <div className="min-h-dvh grid place-items-center"><Loader2 className="w-6 h-6 animate-spin text-tenue" /></div>;
  if (menu.error) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center text-center px-8 gap-3">
        <div className="w-16 h-16 rounded-2xl bg-aji text-sobre-aji grid place-items-center font-display font-extrabold text-xl overflow-hidden">{cfg.logo ? <img src={logoSrc(cfg.logo)} alt="" className="w-full h-full object-cover" /> : iniciales(cfg.nombre_negocio || 'M')}</div>
        <h1 className="text-2xl font-extrabold">{cfg.nombre_negocio}</h1>
        <p className="text-tenue max-w-xs">{errorDe(menu.error, 'No pudimos abrir el menú de esta mesa.')}</p>
      </div>
    );
  }

  const m = menu.data;
  const soloVer = m.puede_pedir === false;
  return (
    <div className="min-h-dvh bg-fondo pb-28">
      <header className="relative">
        <div className="h-44 sm:h-56 bg-pizarra overflow-hidden">
          {cfg.portada && cfg.portada !== 'NULL' && <img src={logoSrc(cfg.portada)} alt="" className="w-full h-full object-cover opacity-90" />}
        </div>
        <div className="max-w-2xl mx-auto px-5 -mt-10 relative">
          <div className="w-20 h-20 rounded-2xl bg-aji text-sobre-aji grid place-items-center font-display font-extrabold text-2xl overflow-hidden ring-4 ring-fondo shadow-papel">
            {cfg.logo ? <img src={logoSrc(cfg.logo)} alt="" className="w-full h-full object-cover" /> : iniciales(cfg.nombre_negocio || 'M')}
          </div>
          <h1 className="text-[30px] font-extrabold leading-tight mt-3">{cfg.nombre_negocio}</h1>
          <p className="text-tenue">Estás en la <b className="text-tinta">{m.mesa.nombre}</b>. {soloVer ? 'Mira el menú y pide al mozo.' : 'Pide y paga desde tu celular.'}</p>
        </div>
      </header>

      <nav className="sticky top-0 z-20 bg-fondo/95 backdrop-blur border-b border-linea mt-5">
        <div className="max-w-2xl mx-auto px-5 flex gap-2 overflow-x-auto sin-scroll py-3">
          {[...(m.combos?.length ? ['Combos'] : []), ...grupos.map(([k]) => k)].map((k) => (
            <a key={k} href={`#cat-${k}`} onClick={() => setCat(k)} className={cx('shrink-0 h-9 px-4 rounded-full text-sm font-semibold grid place-items-center border', cat === k ? 'bg-tinta text-fondo border-tinta' : 'border-linea bg-papel')}>{k}</a>
          ))}
        </div>
      </nav>

      <main className="max-w-2xl mx-auto px-5">
        {m.combos?.length > 0 && (
          <section id="cat-Combos" className="scroll-mt-16 pt-6">
            <h2 className="text-xl font-bold">Combos</h2>
            <div className="divide-y divide-linea">
              {m.combos.map((c) => (
                <Producto key={`c${c.id}`} moneda={moneda} soloVer={soloVer} p={{ ...c, descripcion: c.descripcion || (c.productos ?? []).map((x) => x.nombre).join(', ') }} precio={Number(c.precio)} cantidad={porProducto[`c${c.id}`]}
                  onAgregar={() => agregar({ clave: `c${c.id}`, combo_id: c.id, nombre: c.nombre, precio: Number(c.precio) })} />
              ))}
            </div>
          </section>
        )}
        {grupos.map(([k, lista]) => (
          <section key={k} id={`cat-${k}`} className="scroll-mt-16 pt-6">
            <h2 className="text-xl font-bold">{k}</h2>
            <div className="divide-y divide-linea">
              {lista.map((p) => {
                const precio = precioDe(p);
                return <Producto key={p.id} p={p} moneda={moneda} soloVer={soloVer} precio={precio} antes={precio < Number(p.precio) ? Number(p.precio) : null} cantidad={porProducto[p.id]} onAgregar={() => tocar(p)} />;
              })}
            </div>
          </section>
        ))}
      </main>

      {!soloVer && items > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 p-4 pb-seguro">
          <button onClick={() => setVerCarrito(true)} className="max-w-2xl mx-auto w-full h-16 rounded-2xl bg-aji text-sobre-aji px-5 flex items-center gap-3 shadow-flota">
            <ShoppingBag className="w-6 h-6" />
            <span className="font-bold text-lg flex-1 text-left">Ver mi pedido · {items}</span>
            <span className="num font-extrabold text-lg">{dinero(total, moneda)}</span>
          </button>
        </div>
      )}

      {opciones && (
        <HojaOpciones producto={opciones} precioBase={precioDe(opciones)} onCerrar={() => setOpciones(null)}
          onElegir={(s) => { agregar({ clave: `p${opciones.id}|${[...s.opcionIds].sort().join(',')}|${s.nota ?? ''}`, producto_id: opciones.id, nombre: opciones.nombre, precio: precioDe(opciones) + s.extra, nota: s.nota, opcion_ids: s.opcionIds }); setOpciones(null); }} />
      )}

      {verCarrito && (
        <Hoja onCerrar={() => setVerCarrito(false)} titulo="Tu pedido" subtitulo={m.mesa.nombre}
          pie={(
            <div className="w-full space-y-2">
              {pedir.error && <p className="text-sm text-locoto">{errorDe(pedir.error, 'No se pudo enviar el pedido.')}</p>}
              <button className="btn-aji btn-lg w-full" disabled={!items || pedir.isPending} onClick={() => pedir.mutate()}>
                {pedir.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : `Pagar ${dinero(aPagar, moneda)} con QR`}
              </button>
            </div>
          )}>
          <ul className="divide-y divide-dashed divide-linea">
            {carrito.map((x) => (
              <li key={x.clave} className="py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0"><p className="font-semibold">{x.nombre}</p>{x.nota && <p className="text-xs text-tenue">{x.nota}</p>}</div>
                <div className="flex items-center gap-1 rounded-full bg-hundido p-1">
                  <button className="w-8 h-8 rounded-full grid place-items-center" onClick={() => cambiar(x.clave, -1)} aria-label="Menos">{x.cantidad > 1 ? <Minus className="w-4 h-4" /> : <X className="w-4 h-4" />}</button>
                  <span className="num w-5 text-center font-bold">{x.cantidad}</span>
                  <button className="w-8 h-8 rounded-full grid place-items-center" onClick={() => cambiar(x.clave, 1)} aria-label="Más"><Plus className="w-4 h-4" /></button>
                </div>
                <span className="num font-semibold w-20 text-right">{dinero(x.precio * x.cantidad, moneda)}</span>
              </li>
            ))}
          </ul>
          <div className="space-y-3 mt-4">
            {cupon ? (
              <p className="flex items-center gap-2 rounded-xl bg-hierba/10 text-hierba px-3 py-2 text-sm font-semibold"><Ticket className="w-4 h-4" /> {cupon.codigo} · −{dinero(cupon.descuento, moneda)}<button className="ml-auto" onClick={() => setCupon(null)} aria-label="Quitar"><X className="w-4 h-4" /></button></p>
            ) : (
              <div className="flex gap-2">
                <input className="campo uppercase" placeholder="¿Tienes un cupón?" value={cuponTxt} onChange={(e) => setCuponTxt(e.target.value.toUpperCase())} />
                <button className="btn-suave" disabled={!cuponTxt.trim() || aplicarCupon.isPending} onClick={() => aplicarCupon.mutate()}>Usar</button>
              </div>
            )}
            {aplicarCupon.error && !cupon && <p className="text-sm text-locoto">{errorDe(aplicarCupon.error, 'Ese cupón no es válido.')}</p>}
            {cfg.fidelidad_activa === 'true' && (
              <div>
                <input className="campo num" inputMode="numeric" placeholder="Tu CI para sumar puntos (opcional)" value={ci} onChange={(e) => setCi(e.target.value.replace(/[^\d-]/g, ''))} />
              </div>
            )}
            <div className="flex justify-between items-end pt-2">
              <span className="text-tenue">Total</span>
              <span className="num text-3xl font-extrabold">{dinero(aPagar, moneda)}</span>
            </div>
          </div>
        </Hoja>
      )}
    </div>
  );
}
