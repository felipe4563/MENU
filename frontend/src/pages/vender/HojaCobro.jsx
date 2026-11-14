import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Banknote, QrCode, CheckCircle2, Printer, UserRound, UserPlus, Ticket, X, Loader2, Star, Clock, Disc3, Split, Info } from 'lucide-react';
import Hoja from '../../components/ui/Hoja';
import { Segmentado } from '../../components/ui/piezas';
import { getClientes, crearCliente } from '../../api/clientes';
import { avisar } from '../../components/ui/Aviso';
import { validarCupon } from '../../api/cupones';
import { consultarEstadoPagoQr, cancelarPagoQr, confirmarPagoQr } from '../../api/pagosQr';
import { srcQr } from '../../components/ui/formulario';
import { reimprimirVenta, cobrarParte } from '../../api/ventas';
import { imprimirLocal, reimprimirConFallback } from '../../utils/impresionLocal';
import { useConfig, useMoneda } from '../../hooks/useConfig';
import { usePermisos } from '../../hooks/usePermisos';
import { cx, dinero, errorDe } from '../../lib/util';
import { CuponesCliente, HojaGiroCobro, useRuletaDisponible } from '../../components/ruleta/GiroEnCobro';
import { ORIGENES_SIN_DIVIDIR, faltaDe } from '../../lib/dividirCuenta';
import DividirCuenta from './DividirCuenta';

const BILLETES = [10, 20, 50, 100, 200];

// En pantallas medianas en adelante el cobro va en dos columnas y el panel de cliente queda siempre abierto.
function useAncho() {
  const consulta = '(min-width: 768px)';
  const [ancho, setAncho] = useState(() => window.matchMedia(consulta).matches);
  useEffect(() => {
    const m = window.matchMedia(consulta);
    const cambio = () => setAncho(m.matches);
    m.addEventListener('change', cambio);
    return () => m.removeEventListener('change', cambio);
  }, []);
  return ancho;
}

function sugerencias(total) {
  const s = new Set([Math.ceil(total)]);
  BILLETES.forEach((b) => { const v = Math.ceil(total / b) * b; if (v >= total) s.add(v); });
  return [...s].filter((v) => v >= total).sort((a, b) => a - b).slice(0, 4);
}

function BuscarCliente({ cliente, onElegir }) {
  const { tiene } = usePermisos();
  const [q, setQ] = useState('');
  const [nuevo, setNuevo] = useState(false);
  const { data = [], isFetching } = useQuery({
    queryKey: ['clientes-buscar', q],
    queryFn: () => getClientes({ buscar: q.trim() }),
    enabled: q.trim().length >= 2 && tiene('clientes', 'ver'),
    staleTime: 30_000,
  });
  if (!tiene('clientes', 'ver')) return null;

  if (cliente) {
    return (
      <div className="flex items-center gap-3 rounded-xl bg-hundido px-3 py-2.5">
        <UserRound className="w-5 h-5 text-tenue" />
        <div className="flex-1 min-w-0">
          <p className="font-semibold truncate">{cliente.nombre}</p>
          <p className="text-xs text-tenue flex items-center gap-1"><Star className="w-3 h-3" /> {cliente.puntos ?? 0} puntos{cliente.numero_documento ? ` · CI ${cliente.numero_documento}` : ''}</p>
        </div>
        <button className="btn-icono btn-fantasma h-8 w-8" onClick={() => onElegir(null)} aria-label="Quitar cliente"><X className="w-4 h-4" /></button>
      </div>
    );
  }
  if (nuevo) return <NuevoCliente inicial={q.trim()} onCreado={(c) => { onElegir(c); setQ(''); setNuevo(false); }} onCancelar={() => setNuevo(false)} />;

  const buscado = q.trim().length >= 2 && !isFetching;
  const puedeCrear = tiene('clientes', 'crear');
  return (
    <div className="relative">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <UserRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-tenue" />
          <input className="campo pl-9" placeholder="Buscar por nombre o CI" value={q} onChange={(e) => setQ(e.target.value)} />
          {isFetching && <Loader2 className="absolute right-3 top-3.5 w-4 h-4 animate-spin text-tenue" />}
        </div>
        {puedeCrear && <button type="button" className="btn-borde shrink-0" onClick={() => setNuevo(true)} title="Registrar cliente nuevo"><UserPlus className="w-4 h-4" /> Nuevo</button>}
      </div>
      {q.trim().length >= 2 && (data.length > 0 || (buscado && puedeCrear)) && (
        <ul className="absolute z-10 mt-1 w-full ficha shadow-flota max-h-56 overflow-y-auto p-1">
          {data.slice(0, 8).map((c) => (
            <li key={c.id}>
              <button className="w-full text-left rounded-lg px-3 py-2 hover:bg-hundido" onClick={() => { onElegir(c); setQ(''); }}>
                <span className="font-medium">{c.nombre}</span>
                <span className="text-xs text-tenue ml-2">{c.numero_documento} · {c.puntos ?? 0} pts</span>
              </button>
            </li>
          ))}
          {buscado && puedeCrear && (
            <li>
              <button className="w-full text-left rounded-lg px-3 py-2 hover:bg-hundido flex items-center gap-2 font-semibold" onClick={() => setNuevo(true)}>
                <UserPlus className="w-4 h-4" /> {data.length ? 'Registrar otro cliente' : `No está registrado: crear “${q.trim()}”`}
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

// Alta rápida sin salir del cobro: lo buscado se usa como CI si son números, si no como nombre.
function NuevoCliente({ inicial, onCreado, onCancelar }) {
  const qc = useQueryClient();
  const esCi = /^\d+$/.test(inicial);
  const [f, setF] = useState({ nombre: esCi ? '' : inicial, numero_documento: esCi ? inicial : '', telefono: '' });
  const crear = useMutation({
    mutationFn: () => crearCliente({ nombre: f.nombre.trim(), tipo_documento: 'CI', numero_documento: f.numero_documento.trim() || null, telefono: f.telefono.trim() || null }),
    onSuccess: (c) => { qc.invalidateQueries({ queryKey: ['clientes'] }); avisar.ok(`${c.nombre} registrado`); onCreado(c); },
    onError: (e) => avisar.error(errorDe(e)),
  });
  const set = (k) => ({ value: f[k], onChange: (e) => setF({ ...f, [k]: e.target.value }) });
  return (
    <div className="rounded-xl border-2 border-aji/60 p-3 space-y-2">
      <p className="text-sm font-semibold flex items-center gap-2"><UserPlus className="w-4 h-4" /> Cliente nuevo</p>
      <input autoFocus className="campo" placeholder="Nombre completo" {...set('nombre')} />
      <div className="grid grid-cols-2 gap-2">
        <input className="campo num" inputMode="numeric" placeholder="CI (opcional)" {...set('numero_documento')} />
        <input className="campo num" inputMode="tel" placeholder="Teléfono (opcional)" {...set('telefono')} />
      </div>
      <div className="flex gap-2 justify-end">
        <button type="button" className="btn-fantasma" onClick={onCancelar}>Cancelar</button>
        <button type="button" className="btn-aji" disabled={!f.nombre.trim() || crear.isPending} onClick={() => crear.mutate()}>
          {crear.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Registrar y usar'}
        </button>
      </div>
    </div>
  );
}

// Imprime lo que corresponde a un QR confirmado: el comprobante que trae la
// respuesta (una parte de la cuenta, o el ticket final con sus partes) o, si
// no trae, el ticket de la venta ya cobrada. Una parte que no cierra el
// pedido no se puede reimprimir como venta.
function imprimirPago(datosImpresion, pedido) {
  if (datosImpresion) imprimirLocal(datosImpresion);
  else if (pedido?.estado === 'completado') reimprimirVenta(pedido.id).then(imprimirLocal).catch(() => {});
}

function PanelQr({ pedidoId, pagoQr, moneda, onPagado, onCancelado }) {
  const [restante, setRestante] = useState(() => Math.max(0, new Date(pagoQr.expires_at) - Date.now()));
  const estadoQ = useQuery({
    queryKey: ['pago-qr', pedidoId, pagoQr.tx_id],
    queryFn: () => consultarEstadoPagoQr(pedidoId),
    refetchInterval: (q) => (!q.state.data?.estado || q.state.data.estado === 'pendiente' ? 3000 : false),
  });
  const cancelar = useMutation({ mutationFn: () => cancelarPagoQr(pedidoId), onSuccess: onCancelado });
  const propio = pagoQr.proveedor === 'propio';
  const confirmar = useMutation({
    mutationFn: () => confirmarPagoQr(pedidoId),
    onSuccess: (p) => { imprimirPago(p.datos_impresion, p); onPagado(p); },
    onError: (e) => avisar.error(errorDe(e, 'No se pudo confirmar el pago.')),
  });
  const estado = estadoQ.data?.estado ?? 'pendiente';

  useEffect(() => {
    const t = setInterval(() => setRestante(Math.max(0, new Date(pagoQr.expires_at) - Date.now())), 1000);
    return () => clearInterval(t);
  }, [pagoQr.expires_at]);

  useEffect(() => {
    if (estado === 'completado' && estadoQ.data?.pedido) {
      imprimirPago(estadoQ.data.datos_impresion, estadoQ.data.pedido);
      onPagado(estadoQ.data.pedido);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado]);

  const mm = Math.floor(restante / 60000);
  const ss = String(Math.floor((restante % 60000) / 1000)).padStart(2, '0');

  if (estado !== 'pendiente' && estado !== 'completado') {
    return (
      <div className="text-center py-6 space-y-3">
        <p className="font-display text-xl font-bold">El QR {estado === 'expirado' ? 'venció' : 'no se completó'}</p>
        <p className="text-tenue text-sm">El pedido sigue abierto. Puedes cobrarlo de nuevo.</p>
        <button className="btn-suave" onClick={onCancelado}>Volver</button>
      </div>
    );
  }
  return (
    <div className="text-center space-y-4">
      <div className="mx-auto w-64 h-64 rounded-2xl bg-white p-3 border border-linea">
        <img src={srcQr(pagoQr.qr_code)} alt="QR de pago" className="w-full h-full object-contain" />
      </div>
      <div>
        <p className="num text-4xl font-bold">{dinero(pagoQr.monto_total ?? pagoQr.monto_neto, moneda)}</p>
        <p className="text-sm text-tenue mt-1 flex items-center justify-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-aji animate-latido" /> {propio ? 'El cliente paga este monto' : 'Esperando el pago'} · vence en <span className="num">{mm}:{ss}</span>
        </p>
      </div>
      {propio && (
        <div className="space-y-2">
          <p className="text-[13px] text-tenue">Confirma solo cuando veas el dinero en tu banco.</p>
          <button data-principal className="btn-aji btn-lg w-full" disabled={confirmar.isPending} onClick={() => confirmar.mutate()}>
            {confirmar.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <><CheckCircle2 className="w-5 h-5" /> Ya recibí el pago</>}
          </button>
        </div>
      )}
      <button className="btn-fantasma text-locoto" disabled={cancelar.isPending || confirmar.isPending} onClick={() => cancelar.mutate()}>Cancelar cobro QR</button>
    </div>
  );
}

// "A pagar" con el cambio, efectivo/QR, recibido y botones rápidos. Lo usan
// el cobro de la cuenta completa y el de cada parte de una cuenta dividida.
function BloquePago({ aPagar, etiqueta = 'A pagar', metodo, onMetodo, recibido, onRecibido, moneda, puedeCobrar = true, descuentos }) {
  const recibidoNum = parseFloat(recibido) || 0;
  const cambio = recibidoNum - aPagar;
  const sugeridos = useMemo(() => sugerencias(aPagar), [aPagar]);
  return (
    <>
      <div className="rounded-2xl bg-pizarra text-sobre-pizarra p-4">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm opacity-70 truncate">{etiqueta}</p>
          <p className="num text-[40px] leading-none font-extrabold mt-1">{dinero(aPagar, moneda)}</p>
        </div>
        {descuentos}
      </div>
      {puedeCobrar && metodo === 'efectivo' && recibido !== '' && (
        <div className="mt-3 pt-3 border-t border-white/15 flex items-baseline justify-between">
          <span className="text-sm opacity-70">{cambio < -0.005 ? 'Faltan' : 'Cambio'}</span>
          <span className={cx('num text-2xl font-extrabold', cambio < -0.005 ? 'text-red-300' : 'text-sobre-pizarra')}>{dinero(Math.abs(cambio), moneda)}</span>
        </div>
      )}
    </div>

    {puedeCobrar && <Segmentado
      className="w-full"
      valor={metodo}
      onCambio={onMetodo}
      opciones={[{ valor: 'efectivo', etiqueta: 'Efectivo', Icono: Banknote }, { valor: 'qr', etiqueta: 'QR', Icono: QrCode }]}
    />}

    {puedeCobrar && metodo === 'efectivo' && (
      <div>
        <label className="etiqueta" htmlFor="recibido">Recibido</label>
        <input
          id="recibido"
          inputMode="decimal"
          className="campo h-14 text-2xl num font-bold"
          placeholder={aPagar.toFixed(2)}
          value={recibido}
          onChange={(e) => onRecibido(e.target.value.replace(',', '.').replace(/[^\d.]/g, ''))}
        />
        <div className="flex gap-2 mt-2 flex-wrap">
          {sugeridos.map((v) => (
            <button key={v} onClick={() => onRecibido(String(v))} className={cx('btn-suave h-9 num', recibidoNum === v && 'bg-tinta text-fondo hover:bg-tinta')}>
              {v === Math.ceil(aPagar) && v === aPagar ? 'Exacto' : v}
            </button>
          ))}
        </div>
      </div>
    )}
    </>
  );
}

// Cobro de una parte de la cuenta dividida: efectivo o QR, recibido y cambio.
// onListo({ pedido, completado, metodo, monto, cambio }) cuando quedó cobrada.
function CobroDeParte({ pedidoId, parte, moneda, onListo, onVolver, onEsperandoQr }) {
  const { config } = useConfig();
  const [metodo, setMetodo] = useState('efectivo');
  const [recibido, setRecibido] = useState('');
  const [error, setError] = useState('');
  const [pagoQr, setPagoQr] = useState(null);
  const recibidoNum = parseFloat(recibido) || 0;
  const insuficiente = metodo === 'efectivo' && recibido !== '' && recibidoNum < parte.monto - 0.005;

  const cobrar = useMutation({
    mutationFn: () => cobrarParte(pedidoId, {
      modo: parte.modo,
      persona: parte.persona || undefined,
      monto: parte.modo === 'iguales' ? parte.monto : undefined,
      items: parte.modo === 'platos' ? parte.items : undefined,
      metodo_pago: metodo,
      monto_recibido: metodo === 'efectivo' ? (recibidoNum || parte.monto) : undefined,
    }),
    onSuccess: (r) => {
      if (r.pago_qr) { setPagoQr(r.pago_qr); onEsperandoQr(true); return; }
      imprimirLocal(r.datos_impresion);
      onListo({ pedido: r.pedido, completado: r.completado, metodo, monto: parte.monto, cambio: Number(r.pago?.cambio || 0) });
    },
    onError: (e) => setError(errorDe(e, 'No se pudo cobrar.')),
  });

  if (pagoQr) {
    return (
      <PanelQr
        pedidoId={pedidoId}
        pagoQr={pagoQr}
        moneda={moneda}
        onPagado={(p) => { onEsperandoQr(false); onListo({ pedido: p, completado: p.estado === 'completado', metodo: 'qr', monto: parte.monto, cambio: 0 }); }}
        onCancelado={() => { onEsperandoQr(false); onVolver(); }}
      />
    );
  }

  return (
    <div className="max-w-md mx-auto space-y-4">
      <BloquePago
        aPagar={parte.monto}
        etiqueta={`Paga ${parte.etiqueta}`}
        metodo={metodo}
        onMetodo={(v) => { setMetodo(v); setError(''); }}
        recibido={recibido}
        onRecibido={setRecibido}
        moneda={moneda}
      />
      {error && <p className="text-sm text-locoto">{error}</p>}
      <div className="flex gap-2">
        <button type="button" className="btn-borde btn-lg flex-1 px-3" disabled={cobrar.isPending} onClick={onVolver}>Volver</button>
        <button type="button" data-principal className="btn-aji btn-lg flex-[1.6] px-3" disabled={cobrar.isPending || insuficiente} onClick={() => cobrar.mutate()}>
          {cobrar.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : metodo === 'qr' ? (config.qr_proveedor === 'propio' ? 'Mostrar QR' : 'Generar QR') : `Cobrar ${dinero(parte.monto, moneda)}`}
        </button>
      </div>
    </div>
  );
}

/**
 * Cobro de un pedido (nuevo o existente).
 * - onConfirmar(params) -> Promise<resultado del backend>
 * - permitirDespues: muestra "Cobrar después" (enviar a cocina sin cobrar).
 * - pedido: el pedido existente (con `pagado` y `pagos`). Permite dividir la
 *   cuenta y, si ya tiene partes pagadas, abre directo en modo dividido.
 */
export default function HojaCobro({ total, subtitulo, items = [], clienteInicial = null, pedido = null, permitirDespues, puedeCobrar = true, onConfirmar, onDespues, onCreado, onTerminado, onCerrar }) {
  const moneda = useMoneda();
  const { config } = useConfig();
  const qc = useQueryClient();
  const pagado = Number(pedido?.pagado || 0);
  const puedeDividir = !!pedido && puedeCobrar && !ORIGENES_SIN_DIVIDIR.includes(pedido.origen);
  const [dividir, setDividir] = useState(() => puedeDividir && pagado > 0);
  const [esperandoQr, setEsperandoQr] = useState(false);
  const [metodo, setMetodo] = useState('efectivo');
  const [recibido, setRecibido] = useState('');
  const [cliente, setCliente] = useState(clienteInicial);
  const [puntos, setPuntos] = useState(0);
  const [cuponTxt, setCuponTxt] = useState('');
  const [cupon, setCupon] = useState(null);
  const [notas, setNotas] = useState('');
  const [error, setError] = useState('');
  const [qr, setQr] = useState(null);
  const [exito, setExito] = useState(null);
  const [ruleta, setRuleta] = useState(false);
  const ruletaDisponible = useRuletaDisponible();

  const fidelidad = config.fidelidad_activa === 'true';
  const valorPunto = parseFloat(config.valor_punto_bs || 0);
  const puedeCanjear = fidelidad && valorPunto > 0 && !!cliente && (metodo === 'qr' ? config.fidelidad_canje_qr === 'true' : config.fidelidad_canje_efectivo !== 'false');
  // Con partes ya pagadas se cobra solo lo que falta.
  const base = pedido ? Math.max(0, faltaDe({ total, pagado })) : total;
  const maxPuntos = cliente ? Math.min(cliente.puntos ?? 0, Math.floor(base / (valorPunto || 1))) : 0;
  const descPuntos = puedeCanjear ? puntos * valorPunto : 0;
  const descCupon = cupon?.descuento ?? 0;
  const aPagar = Math.max(0, base - descPuntos - descCupon);
  const recibidoNum = parseFloat(recibido) || 0;

  const aplicarCupon = useMutation({
    mutationFn: ({ codigo }) => validarCupon(codigo, base, cliente?.id, items),
    onSuccess: (r, { nombre }) => { setCupon({ ...r, nombre }); setCuponTxt(''); setError(''); },
    onError: (e) => setError(errorDe(e, 'Ese cupón no es válido.')),
  });

  const cobrar = useMutation({
    mutationFn: () => onConfirmar({
      metodo_pago: metodo,
      monto_recibido: metodo === 'efectivo' ? (recibidoNum || aPagar) : aPagar,
      cliente_id: cliente?.id,
      puntos_canjear: puedeCanjear ? puntos : 0,
      cupon_codigo: cupon?.codigo,
      notas: notas.trim() || undefined,
    }),
    onSuccess: (r) => {
      // El pedido ya existe en el sistema: lo que se armó no debe poder cobrarse dos veces.
      onCreado?.(r);
      if (r?.pago_qr) {
        setQr({ pedidoId: r.pedido.id, pagoQr: r.pago_qr });
      } else {
        imprimirLocal(r?.datos_impresion);
        setExito({ pedidoId: r.id, metodo, cobrado: aPagar, cambio: metodo === 'efectivo' ? Math.max(0, (recibidoNum || aPagar) - aPagar) : 0, pedido: r });
      }
    },
    onError: (e) => setError(errorDe(e, 'No se pudo cobrar.')),
  });

  const despues = useMutation({
    mutationFn: () => onDespues({ cliente_id: cliente?.id, notas: notas.trim() || undefined }),
    onSuccess: (r) => { onCreado?.(r); imprimirLocal(r?.datos_impresion); onTerminado?.(r, { diferido: true }); },
    onError: (e) => setError(errorDe(e, 'No se pudo enviar a cocina.')),
  });

  const reimprimir = useMutation({
    mutationFn: () => reimprimirVenta(exito.pedidoId),
    onSuccess: reimprimirConFallback,
  });

  // Tras cada parte: el pedido de la pantalla se pone al día con la respuesta.
  const refrescarPedido = (p) => {
    if (p) qc.setQueryData(['venta', String(p.id)], p);
    qc.invalidateQueries({ queryKey: ['venta'] });
    qc.invalidateQueries({ queryKey: ['ventas'] });
    qc.invalidateQueries({ queryKey: ['mesas'] });
  };
  const cancelarQrPendiente = useMutation({
    mutationFn: () => cancelarPagoQr(pedido.id),
    onSuccess: (p) => refrescarPedido(p),
    onError: (e) => avisar.error(errorDe(e, 'No se pudo cancelar el QR.')),
  });

  const ancho = useAncho();
  const efectivoInsuficiente =metodo === 'efectivo' && recibido !== '' && recibidoNum < aPagar - 0.005;
  const ocupado = cobrar.isPending || despues.isPending;

  if (exito) {
    return (
      <Hoja onCerrar={() => onTerminado?.(exito.pedido)} ancho="max-w-sm">
        <div className="text-center pt-8 pb-2 space-y-5">
          <CheckCircle2 className="w-14 h-14 text-hierba mx-auto" />
          {exito.metodo === 'efectivo' && exito.cambio > 0 ? (
            <div>
              <p className="text-tenue">Entrega de cambio</p>
              <p className="num text-6xl font-extrabold mt-1">{dinero(exito.cambio, moneda)}</p>
            </div>
          ) : (
            <div>
              <p className="text-tenue">Cobrado</p>
              <p className="num text-5xl font-extrabold mt-1">{dinero(exito.cobrado, moneda)}</p>
            </div>
          )}
          <div className="flex gap-2">
            <button className="btn-borde flex-1" onClick={() => reimprimir.mutate()} disabled={reimprimir.isPending}>
              <Printer className="w-4 h-4" /> {reimprimir.isPending ? 'Imprimiendo…' : 'Reimprimir'}
            </button>
            <button data-principal className="btn-aji flex-1" onClick={() => onTerminado?.(exito.pedido)}>Siguiente venta</button>
          </div>
        </div>
      </Hoja>
    );
  }

  if (qr) {
    return (
      <Hoja bloquear titulo="Cobro con QR" subtitulo="Muestra el código al cliente" ancho="max-w-sm">
        <PanelQr
          {...qr}
          moneda={moneda}
          onPagado={(p) => { setQr(null); setExito({ pedidoId: p.id, metodo: 'qr', cobrado: qr.pagoQr.monto_total ?? qr.pagoQr.monto_neto, cambio: 0, pedido: p }); }}
          onCancelado={() => { setQr(null); onCerrar(); }}
        />
      </Hoja>
    );
  }

  if (dividir) {
    return (
      <Hoja onCerrar={onCerrar} bloquear={esperandoQr} titulo="Dividir cuenta" subtitulo={subtitulo} ancho="max-w-md md:max-w-3xl">
        <div className="space-y-4">
          <p className="flex items-start gap-2 text-[13px] text-tenue"><Info className="w-4 h-4 shrink-0 mt-px" /> Puntos, cupones y descuentos se usan cobrando la cuenta completa.</p>
          <DividirCuenta
            pedido={pedido}
            moneda={moneda}
            cancelandoQr={cancelarQrPendiente.isPending}
            onCancelarQr={() => cancelarQrPendiente.mutate()}
            renderCobro={(parte, { onListo, onVolver }) => (
              <CobroDeParte
                pedidoId={pedido.id}
                parte={parte}
                moneda={moneda}
                onEsperandoQr={setEsperandoQr}
                onVolver={() => { refrescarPedido(); onVolver(); }}
                onListo={(r) => {
                  refrescarPedido(r.pedido);
                  if (r.completado) setExito({ pedidoId: r.pedido.id, metodo: r.metodo, cobrado: r.monto, cambio: r.cambio, pedido: r.pedido });
                  else onListo(r);
                }}
              />
            )}
          />
          {pagado === 0 && (
            <button type="button" className="btn-fantasma w-full" onClick={() => setDividir(false)}>Cobrar la cuenta completa</button>
          )}
        </div>
      </Hoja>
    );
  }

  return (
    <Hoja
      onCerrar={onCerrar}
      bloquear={ocupado || ruleta}
      titulo={puedeCobrar ? 'Cobrar' : 'Enviar pedido'}
      subtitulo={subtitulo}
      ancho="max-w-md md:max-w-3xl"
      pie={(
        <div className="w-full space-y-2">
          {error && <p className="text-sm text-locoto">{error}</p>}
          <div className="flex gap-2">
            {permitirDespues && (
              <button className="btn-borde btn-lg flex-1 px-3" disabled={ocupado} onClick={() => despues.mutate()}>
                <Clock className="w-5 h-5" /> Cobrar después
              </button>
            )}
            {puedeCobrar && (
              <button data-principal className="btn-aji btn-lg flex-[1.4]" disabled={ocupado || efectivoInsuficiente} onClick={() => cobrar.mutate()}>
                {cobrar.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : metodo === 'qr' ? (config.qr_proveedor === 'propio' ? 'Mostrar QR' : 'Generar QR') : `Cobrar ${dinero(aPagar, moneda)}`}
              </button>
            )}
          </div>
        </div>
      )}
    >
      <div className="grid md:grid-cols-2 gap-x-6 gap-y-4 items-start">
      <div className="space-y-4">
        <BloquePago
          aPagar={aPagar}
          metodo={metodo}
          onMetodo={(v) => { setMetodo(v); setError(''); }}
          recibido={recibido}
          onRecibido={setRecibido}
          moneda={moneda}
          puedeCobrar={puedeCobrar}
          descuentos={(descPuntos > 0 || descCupon > 0) && (
            <div className="text-right text-xs opacity-80 num">
              <p className="line-through">{dinero(base, moneda)}</p>
              {descCupon > 0 && <p>Cupón −{descCupon.toFixed(2)}</p>}
              {descPuntos > 0 && <p>Puntos −{descPuntos.toFixed(2)}</p>}
            </div>
          )}
        />
        {puedeDividir && (
          <button type="button" className="btn-borde w-full" onClick={() => { setDividir(true); setError(''); }}>
            <Split className="w-4 h-4" /> Dividir cuenta
          </button>
        )}
      </div>

        <details className="group rounded-xl border border-linea md:border-0 md:rounded-none md:pl-6 md:border-l md:border-linea md:self-stretch" open={ancho || !!cliente || !!cupon}>
          <summary className={cx('cursor-pointer list-none px-3 py-3 flex items-center gap-2 text-sm font-semibold', ancho && 'pointer-events-none px-0 pt-0')} onClick={(e) => ancho && e.preventDefault()}>
            <Ticket className="w-4 h-4" /> Cliente, puntos y cupón
            {!ancho && <span className="ml-auto text-tenue group-open:rotate-180 transition">▾</span>}
          </summary>
          <div className={cx('space-y-3', ancho ? 'pb-1' : 'px-3 pb-3')}>
            <BuscarCliente cliente={cliente} onElegir={(c) => { setCliente(c); setPuntos(0); setCupon(null); }} />
            {puedeCanjear && maxPuntos > 0 && (
              <div className="flex items-center gap-3">
                <label className="text-sm flex-1" htmlFor="puntos">Canjear puntos <span className="text-tenue">(máx. {maxPuntos})</span></label>
                <input id="puntos" type="number" min={0} max={maxPuntos} className="campo w-24 h-10 num" value={puntos || ''} onChange={(e) => setPuntos(Math.max(0, Math.min(maxPuntos, parseInt(e.target.value, 10) || 0)))} />
              </div>
            )}
            {cliente && ruletaDisponible && (
              <button type="button" className="w-full flex items-center gap-3 rounded-xl bg-pizarra text-sobre-pizarra px-3 py-2.5 text-left hover:opacity-95" onClick={() => setRuleta(true)}>
                <span className="w-9 h-9 rounded-full bg-aji text-sobre-aji grid place-items-center shrink-0"><Disc3 className="w-5 h-5" /></span>
                <span className="flex-1 min-w-0"><span className="block font-semibold">Girar la ruleta</span><span className="block text-xs opacity-70">Canjea puntos por un premio</span></span>
              </button>
            )}
            {cliente && !cupon && <CuponesCliente cliente={cliente} aplicando={aplicarCupon.isPending} onElegir={(codigo, nombre) => aplicarCupon.mutate({ codigo, nombre })} />}
            {cupon ? (
              <div className="flex items-center gap-2 rounded-xl bg-hierba/10 text-hierba px-3 py-2 text-sm font-semibold">
                <Ticket className="w-4 h-4 shrink-0" /> <span className="min-w-0 truncate">{cupon.nombre ? `${cupon.nombre} · ` : ""}{cupon.codigo}</span> <span className="num shrink-0">−{dinero(cupon.descuento, moneda)}</span>
                <button className="ml-auto" onClick={() => setCupon(null)} aria-label="Quitar cupón"><X className="w-4 h-4" /></button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input className="campo uppercase" placeholder="Código de cupón" value={cuponTxt} onChange={(e) => setCuponTxt(e.target.value.toUpperCase())} />
                <button className="btn-suave" disabled={!cuponTxt.trim() || aplicarCupon.isPending} onClick={() => aplicarCupon.mutate({ codigo: cuponTxt.trim() })}>Aplicar</button>
              </div>
            )}
            <textarea rows={ancho ? 3 : 1} className="campo resize-none py-3" placeholder="Nota del pedido (opcional)" value={notas} onChange={(e) => setNotas(e.target.value)} maxLength={200} />
          </div>
        </details>
      </div>
      {ruleta && cliente && (
        <HojaGiroCobro
          cliente={cliente}
          onCerrar={() => setRuleta(false)}
          onPuntos={(p) => { setCliente((c) => (c ? { ...c, puntos: p } : c)); setPuntos(0); }}
          onUsarCupon={(codigo, nombre) => { setRuleta(false); aplicarCupon.mutate({ codigo, nombre }); }}
        />
      )}
    </Hoja>
  );
}
