import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Wallet, Lock, Plus, ArrowRightLeft, History, Receipt, Loader2, AlertTriangle, Calculator } from 'lucide-react';
import { getEstadoCajas, getSesion, abrirCaja, cerrarCaja, registrarGasto, getGastos, getReporte } from '../../api/caja';
import { getDevolucionesPendientes, marcarTransferida } from '../../api/ventas';
import { getCompras, crearCompra, recibirCompra } from '../../api/compras';
import LineasCompra from '../../components/compras/LineasCompra';
import { lineaVacia, lineasValidas, totalLineas, itemsParaApi, useCatalogoCompras } from '../../lib/compras';
import { useAuthStore } from '../../store/authStore';
import { usePermisos } from '../../hooks/usePermisos';
import { useConfig, useMoneda } from '../../hooks/useConfig';
import { useSocket } from '../../hooks/useSocket';
import Hoja from '../../components/ui/Hoja';
import { Cargando, Campo, Encabezado, Pagina, SinPermiso, Tarjeta, Vacio, Segmentado, Insignia } from '../../components/ui/piezas';
import { avisar } from '../../components/ui/Aviso';
import { imprimirCierreLocal } from '../../utils/impresionLocal';
import { cx, dinero, errorDe, hora } from '../../lib/util';

export const DENOMINACIONES = [200, 100, 50, 20, 10, 5, 2, 1, 0.5, 0.2, 0.1];
const n = (v) => parseFloat(v || 0);

function HojaAbrir({ caja, onCerrar }) {
  const qc = useQueryClient();
  const moneda = useMoneda();
  const [monto, setMonto] = useState('');
  const abrir = useMutation({
    mutationFn: () => abrirCaja(caja.id, n(monto)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['caja-estado'] }); avisar.ok(`${caja.nombre} abierta. ¡Buen turno!`); onCerrar(); },
    onError: (e) => avisar.error(errorDe(e)),
  });
  return (
    <Hoja onCerrar={onCerrar} titulo={`Abrir ${caja.nombre}`} subtitulo="¿Con cuánto efectivo empiezas?" ancho="max-w-sm"
      pie={<button data-principal className="btn-aji btn-lg w-full" disabled={abrir.isPending} onClick={() => abrir.mutate()}>{abrir.isPending ? 'Abriendo…' : `Abrir con ${dinero(n(monto), moneda)}`}</button>}>
      <input autoFocus inputMode="decimal" className="campo h-16 text-3xl num font-bold text-center" placeholder="0.00" value={monto}
        onChange={(e) => setMonto(e.target.value.replace(',', '.').replace(/[^\d.]/g, ''))}
        onKeyDown={(e) => e.key === 'Enter' && abrir.mutate()} />
      <div className="grid grid-cols-4 gap-2 mt-3">
        {[0, 100, 200, 500].map((v) => <button key={v} className="btn-suave num" onClick={() => setMonto(String(v))}>{v}</button>)}
      </div>
    </Hoja>
  );
}

// Sacar plata de la caja. Si es para comprar insumos, se anota como compra:
// sube el stock y queda un solo egreso en el libro de caja (no hay que
// registrarlo otra vez en Compras).
function HojaGasto({ sesionId, onCerrar }) {
  const qc = useQueryClient();
  const moneda = useMoneda();
  const { tiene } = usePermisos();
  const puedeComprar = tiene('compras', 'crear') && tiene('compras', 'recibir');
  const [modo, setModo] = useState('gasto'); // gasto | compra
  const [f, setF] = useState({ descripcion: '', monto: '' });
  // Compra: una que ya estaba anotada en Compras, o una nueva (al paso).
  const [elegida, setElegida] = useState(null);
  const [proveedor, setProveedor] = useState('');
  const [detalle, setDetalle] = useState('');
  const [items, setItems] = useState([lineaVacia()]);
  const catalogo = useCatalogoCompras(modo === 'compra');
  const pendientesQ = useQuery({ queryKey: ['compras'], queryFn: getCompras, enabled: modo === 'compra' && tiene('compras', 'ver') });
  const pendientes = (pendientesQ.data ?? []).filter((c) => c.estado === 'pendiente');

  const listo = (texto) => {
    for (const k of [['sesion', sesionId], ['gastos', sesionId], ['compras'], ['insumos'], ['productos']]) qc.invalidateQueries({ queryKey: k });
    avisar.ok(texto);
    onCerrar();
  };
  const guardar = useMutation({
    mutationFn: () => registrarGasto(sesionId, { descripcion: f.descripcion.trim(), monto: n(f.monto) }),
    onSuccess: () => listo('Gasto registrado'),
    onError: (e) => avisar.error(errorDe(e)),
  });
  const comprar = useMutation({
    mutationFn: () => (elegida
      ? recibirCompra(elegida.id, { sesion_caja_id: sesionId })
      : crearCompra({ proveedor_id: proveedor ? Number(proveedor) : undefined, notas: detalle.trim() || undefined, items: itemsParaApi(items), sesion_caja_id: sesionId })),
    onSuccess: () => listo('Compra pagada: el stock ya se sumó'),
    onError: (e) => avisar.error(errorDe(e)),
  });

  const totalCompra = elegida ? n(elegida.total) : totalLineas(items);
  const validoGasto = f.descripcion.trim() && n(f.monto) > 0;
  const validoCompra = totalCompra > 0 && (elegida || lineasValidas(items).length > 0);
  const pie = modo === 'gasto'
    ? <button data-principal className="btn-aji w-full" disabled={!validoGasto || guardar.isPending} onClick={() => guardar.mutate()}>Registrar gasto</button>
    : <button data-principal className="btn-aji w-full" disabled={!validoCompra || comprar.isPending} onClick={() => comprar.mutate()}>{comprar.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : `Pagar ${dinero(totalCompra, moneda)} con la caja`}</button>;

  return (
    <Hoja onCerrar={onCerrar} bloquear={comprar.isPending} titulo="Sacar dinero de la caja" subtitulo={modo === 'gasto' ? 'Pagos, adelantos, taxi' : 'Lo comprado se suma al inventario'} ancho={modo === 'compra' ? 'max-w-lg' : 'max-w-sm'} pie={pie}>
      {puedeComprar && (
        <Segmentado className="w-full mb-4" valor={modo} onCambio={setModo} opciones={[
          { valor: 'gasto', etiqueta: 'Gasto' },
          { valor: 'compra', etiqueta: 'Compra de insumos' },
        ]} />
      )}
      {modo === 'gasto' ? (
        <div className="space-y-3">
          <div><label className="etiqueta">¿En qué se gastó?</label><input autoFocus className="campo" value={f.descripcion} onChange={(e) => setF({ ...f, descripcion: e.target.value })} placeholder={puedeComprar ? 'Gas, taxi, adelanto…' : 'Gas, verduras, taxi…'} /></div>
          <div><label className="etiqueta">Monto</label><input inputMode="decimal" className="campo num text-lg" value={f.monto} onChange={(e) => setF({ ...f, monto: e.target.value.replace(',', '.').replace(/[^\d.]/g, '') })} /></div>
        </div>
      ) : elegida ? (
        <div>
          <div className="rounded-xl bg-hundido p-3">
            <div className="flex items-baseline gap-2">
              <p className="font-semibold flex-1 min-w-0 truncate">{elegida.proveedor?.nombre ?? 'Compra al paso'}</p>
              <span className="text-xs text-tenue">#{elegida.id}</span>
            </div>
            <ul className="text-sm mt-2 space-y-1">
              {(elegida.detalles ?? []).map((d) => <li key={d.id} className="flex gap-2"><span className="num font-semibold">{Number(d.cantidad)}</span><span className="flex-1 truncate">{d.insumo?.nombre ?? d.producto?.nombre}</span><span className="num text-tenue">{dinero(d.subtotal, moneda)}</span></li>)}
            </ul>
          </div>
          <button type="button" className="btn-fantasma mt-2" onClick={() => setElegida(null)}>Elegir otra</button>
        </div>
      ) : (
        <div className="space-y-4">
          {pendientes.length > 0 && (
            <div>
              <p className="etiqueta">Anotadas en Compras, por pagar</p>
              <ul className="grid gap-1.5">
                {pendientes.map((c) => (
                  <li key={c.id}>
                    <button type="button" onClick={() => setElegida(c)} className="w-full flex items-center gap-3 rounded-xl border border-linea px-3 py-2.5 text-left hover:bg-hundido">
                      <span className="flex-1 min-w-0">
                        <span className="block font-semibold truncate">{c.proveedor?.nombre ?? 'Compra al paso'}</span>
                        <span className="block text-xs text-tenue truncate">#{c.id} · {(c.detalles ?? []).map((d) => d.insumo?.nombre ?? d.producto?.nombre).join(', ')}</span>
                      </span>
                      <span className="num font-bold">{dinero(c.total, moneda)}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <p className="text-sm text-tenue mt-4">O anota lo que compraron:</p>
            </div>
          )}
          <Campo etiqueta="¿A quién?">
            <select className="campo" value={proveedor} onChange={(e) => setProveedor(e.target.value)}>
              <option value="">Sin proveedor (mercado, tienda)</option>
              {(catalogo.data?.proveedores ?? []).map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </Campo>
          {catalogo.isLoading ? <Cargando /> : <LineasCompra items={items} onCambio={setItems} catalogo={catalogo.data} />}
          <Campo etiqueta="Detalle (opcional)"><input className="campo" value={detalle} onChange={(e) => setDetalle(e.target.value)} placeholder="Mercado Rodríguez, nota de venta 123…" /></Campo>
        </div>
      )}
    </Hoja>
  );
}

function HojaCierre({ sesion, onCerrar, onCerrada }) {
  const moneda = useMoneda();
  const esCiego = sesion.sucursal?.modo_cierre_caja === 'ciego';
  const [modo, setModo] = useState('billetes');
  const [cant, setCant] = useState({});
  const [total, setTotal] = useState('');
  const [paso, setPaso] = useState('contar'); // contar | confirmar | motivo
  const [reintento, setReintento] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState('');

  const contado = modo === 'billetes' ? DENOMINACIONES.reduce((s, d) => s + (parseInt(cant[d], 10) || 0) * d, 0) : n(total);
  const esperado = n(sesion.efectivo_esperado);
  const diferencia = contado - esperado;

  const cerrar = useMutation({
    mutationFn: () => {
      const p = { confirmar_pese_a_diferencia: reintento };
      if (paso === 'motivo') p.nota_diferencia = motivo;
      if (modo === 'billetes') p.denominaciones = DENOMINACIONES.filter((d) => parseInt(cant[d], 10) > 0).map((d) => ({ denominacion: d, cantidad: parseInt(cant[d], 10) }));
      else p.monto_cierre = n(total);
      return cerrarCaja(sesion.id, p);
    },
    onSuccess: () => onCerrada(),
    onError: (e) => {
      const d = e?.response?.data;
      if (d?.codigo === 'DIFERENCIA_FUERA_TOLERANCIA') return setPaso('confirmar');
      if (d?.codigo === 'MOTIVO_REQUERIDO') return setPaso('motivo');
      setError(errorDe(e));
    },
  });

  if (paso === 'confirmar') {
    return (
      <Hoja onCerrar={onCerrar} titulo="El conteo no cuadra" ancho="max-w-sm">
        <AlertTriangle className="w-10 h-10 text-aji mb-3" />
        <p className="text-tenue mb-5">Lo que contaste no coincide con lo que debería haber. ¿Quieres contar de nuevo antes de cerrar?</p>
        <div className="flex gap-2">
          <button className="btn-borde flex-1" onClick={() => { setReintento(true); setPaso('motivo'); }}>Cerrar igual</button>
          <button className="btn-aji flex-1" onClick={() => { setReintento(true); setCant({}); setTotal(''); setPaso('contar'); }}>Contar de nuevo</button>
        </div>
      </Hoja>
    );
  }

  return (
    <Hoja
      onCerrar={onCerrar}
      bloquear={cerrar.isPending}
      titulo="Cerrar caja"
      subtitulo={esCiego ? 'Cierre ciego: cuenta sin ver el monto esperado.' : 'Cuenta el efectivo que hay en el cajón.'}
      ancho="max-w-lg"
      pie={(
        <div className="w-full space-y-2">
          {error && <p className="text-sm text-locoto">{error}</p>}
          <button data-principal className="btn-peligro btn-lg w-full" disabled={contado <= 0 || (paso === 'motivo' && !motivo.trim()) || cerrar.isPending} onClick={() => cerrar.mutate()}>
            {cerrar.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Lock className="w-5 h-5" /> Cerrar con {dinero(contado, moneda)}</>}
          </button>
        </div>
      )}
    >
      {paso === 'motivo' && (
        <div className="rounded-xl bg-aji/15 p-3 mb-4">
          <p className="text-sm font-semibold mb-2">La diferencia supera lo permitido. Explica qué pasó.</p>
          <textarea autoFocus rows={2} maxLength={255} className="campo" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej.: di mal un cambio de 10 Bs" />
        </div>
      )}
      <Segmentado className="w-full mb-4" valor={modo} onCambio={setModo} opciones={[{ valor: 'billetes', etiqueta: 'Contar billetes y monedas', Icono: Calculator }, { valor: 'total', etiqueta: 'Solo el total' }]} />
      {modo === 'billetes' ? (
        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          {DENOMINACIONES.map((d) => (
            <label key={d} className="flex items-center gap-2">
              <span className={cx('w-16 h-10 rounded-lg grid place-items-center num font-bold text-sm shrink-0', d >= 10 ? 'bg-hierba/15 text-hierba' : 'bg-hundido')}>{d < 1 ? d.toFixed(2) : d}</span>
              <span className="text-tenue">×</span>
              <input inputMode="numeric" className="campo h-10 num" value={cant[d] ?? ''} onChange={(e) => setCant({ ...cant, [d]: e.target.value.replace(/\D/g, '') })} />
            </label>
          ))}
        </div>
      ) : (
        <input autoFocus inputMode="decimal" className="campo h-16 text-3xl num font-bold text-center" placeholder="0.00" value={total} onChange={(e) => setTotal(e.target.value.replace(',', '.').replace(/[^\d.]/g, ''))} />
      )}
      <div className="mt-5 rounded-2xl bg-hundido p-4 grid grid-cols-2 gap-3">
        <div><p className="text-xs text-tenue">Contado</p><p className="num text-2xl font-bold">{dinero(contado, moneda)}</p></div>
        {!esCiego && (
          <div className="text-right">
            <p className="text-xs text-tenue">Diferencia (esperado {dinero(esperado, moneda)})</p>
            <p className={cx('num text-2xl font-bold', Math.abs(diferencia) < 0.005 ? 'text-hierba' : diferencia > 0 ? 'text-cielo' : 'text-locoto')}>
              {diferencia > 0 ? '+' : ''}{diferencia.toFixed(2)}
            </p>
          </div>
        )}
      </div>
    </Hoja>
  );
}

function Turno({ sesionBase }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const moneda = useMoneda();
  const { config } = useConfig();
  const { tiene } = usePermisos();
  const [hoja, setHoja] = useState(null);
  const sesionQ = useQuery({ queryKey: ['sesion', sesionBase.id], queryFn: () => getSesion(sesionBase.id), refetchInterval: 30_000 });
  const gastosQ = useQuery({ queryKey: ['gastos', sesionBase.id], queryFn: () => getGastos(sesionBase.id) });
  const devQ = useQuery({ queryKey: ['devoluciones-pendientes'], queryFn: getDevolucionesPendientes, enabled: tiene('ventas', 'anular') });
  useSocket('restaurante:actualizar', () => qc.invalidateQueries({ queryKey: ['sesion', sesionBase.id] }));

  const transferida = useMutation({
    mutationFn: marcarTransferida,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['devoluciones-pendientes'] }); avisar.ok('Marcada como transferida'); },
    onError: (e) => avisar.error(errorDe(e)),
  });

  const s = sesionQ.data;
  if (!s) return <Cargando />;
  const esCiego = s.sucursal?.modo_cierre_caja === 'ciego';
  const filas = [
    ['Con lo que abriste', n(s.monto_apertura)],
    ['Ventas en efectivo', n(s.ventas_efectivo)],
    ['Gastos', -n(s.total_gastos)],
    ['Devoluciones en efectivo', -n(s.total_devoluciones)],
  ];

  return (
    <>
      <Encabezado
        titulo={sesionBase.caja_nombre}
        texto={`Abierta a las ${hora(s.abierto_en)} por ${s.usuario?.nombre ?? 'ti'}`}
        acciones={(
          <>
            <button className="btn-borde" onClick={() => setHoja('gasto')}><Plus className="w-4 h-4" /> Registrar gasto</button>
            {tiene('caja', 'cerrar') && <button className="btn-peligro" onClick={() => setHoja('cerrar')}><Lock className="w-4 h-4" /> Cerrar caja</button>}
          </>
        )}
      />

      <div className="grid lg:grid-cols-[1.3fr_1fr] gap-4">
        <section className="comanda rounded-t-2xl shadow-papel px-5 sm:px-7 pt-6">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-bold">Efectivo del turno</h2>
            <span className="text-xs text-tenue">se actualiza solo</span>
          </div>
          <ul className="mt-4 space-y-2.5">
            {filas.map(([t, v]) => (
              <li key={t} className="flex items-baseline gap-2">
                <span>{t}</span>
                <span className="flex-1 border-b border-dotted border-linea -translate-y-1" />
                <span className={cx('num font-semibold', v < 0 && 'text-locoto')}>{v < 0 ? '−' : ''}{dinero(Math.abs(v), moneda)}</span>
              </li>
            ))}
          </ul>
          <div className="perforado my-5" />
          <div className="flex items-end justify-between pb-2">
            <span className="font-semibold">{esCiego ? 'El esperado se ve al cerrar' : 'Debería haber en el cajón'}</span>
            <span className="num text-[34px] leading-none font-extrabold">{esCiego ? '••••' : dinero(s.efectivo_esperado, moneda)}</span>
          </div>
        </section>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="ficha p-4"><p className="text-[13px] text-tenue">Ventas con QR</p><p className="num text-2xl font-bold mt-1">{dinero(s.ventas_qr, moneda)}</p></div>
            <div className="ficha p-4"><p className="text-[13px] text-tenue">Total vendido</p><p className="num text-2xl font-bold mt-1">{dinero(n(s.ventas_efectivo) + n(s.ventas_qr), moneda)}</p></div>
          </div>
          <Tarjeta titulo="Gastos del turno" cuerpo="px-4 sm:px-5 pb-4 pt-2">
            {(gastosQ.data ?? []).length === 0 ? <p className="text-sm text-tenue py-3">Sin gastos todavía.</p> : (
              <ul className="divide-y divide-linea">
                {gastosQ.data.map((g) => (
                  <li key={g.id} className="py-2.5 flex items-center gap-3 text-sm">
                    <span className="text-tenue num w-12">{hora(g.creado_en)}</span>
                    <span className="flex-1">{g.descripcion}</span>
                    <span className="num font-semibold text-locoto">−{n(g.monto).toFixed(2)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Tarjeta>
          {(devQ.data ?? []).length > 0 && (
            <Tarjeta titulo="Devoluciones por transferir" cuerpo="px-4 sm:px-5 pb-4 pt-2">
              <p className="text-[13px] text-tenue mb-2">Se devolvieron por QR o transferencia: haz la transferencia y márcala.</p>
              <ul className="divide-y divide-linea">
                {devQ.data.map((d) => (
                  <li key={d.id} className="py-2.5 flex items-center gap-3 text-sm">
                    <span className="flex-1">Pedido #{d.pedido_id} <span className="text-tenue">· {d.usuario?.nombre}</span></span>
                    <span className="num font-semibold">{dinero(d.monto, moneda)}</span>
                    <button className="btn-suave h-8 text-xs" disabled={transferida.isPending} onClick={() => transferida.mutate(d.id)}><ArrowRightLeft className="w-3.5 h-3.5" /> Hecha</button>
                  </li>
                ))}
              </ul>
            </Tarjeta>
          )}
        </div>
      </div>

      {hoja === 'gasto' && <HojaGasto sesionId={s.id} onCerrar={() => setHoja(null)} />}
      {hoja === 'cerrar' && (
        <HojaCierre
          sesion={s}
          onCerrar={() => setHoja(null)}
          onCerrada={async () => {
            qc.invalidateQueries({ queryKey: ['caja-estado'] });
            try { imprimirCierreLocal(await getReporte(s.id), config); } catch { /* el reporte igual se ve en pantalla */ }
            navigate(`/caja/cierre/${s.id}`);
          }}
        />
      )}
    </>
  );
}

export default function CajaPage() {
  const usuario = useAuthStore((s) => s.usuario);
  const { tiene } = usePermisos();
  const sucursalId = usuario?.sucursal_activa?.id;
  const [abrir, setAbrir] = useState(null);
  const estadoQ = useQuery({ queryKey: ['caja-estado', sucursalId], queryFn: () => getEstadoCajas(sucursalId), enabled: !!sucursalId && tiene('caja', 'ver') });

  if (!tiene('caja', 'ver')) return <SinPermiso />;
  if (!sucursalId) return <Pagina><Vacio Icono={Wallet} titulo="Entra a una sucursal para usar la caja" texto="Con “Todas las sucursales” solo puedes ver los turnos en Finanzas › Turnos de caja." accion={<Link className="btn-aji" to="/finanzas/turnos">Ver turnos</Link>} /></Pagina>;
  if (estadoQ.isLoading) return <Cargando />;

  const cajas = estadoQ.data ?? [];
  const mia = cajas.find((c) => c.sesion_abierta?.usuario_id === usuario.id);

  return (
    <Pagina>
      {mia ? <Turno sesionBase={{ ...mia.sesion_abierta, caja_nombre: mia.nombre }} /> : (
        <>
          <Encabezado titulo="Caja" texto="Abre una caja para empezar tu turno." acciones={<Link className="btn-fantasma" to="/finanzas/turnos"><History className="w-4 h-4" /> Turnos anteriores</Link>} />
          {cajas.length === 0 ? <Vacio Icono={Wallet} titulo="Esta sucursal no tiene cajas" texto="Créalas en Ajustes › Cajas e impresión." /> : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {cajas.map((c) => {
                const s = c.sesion_abierta;
                return (
                  <div key={c.id} className="ficha p-5 flex flex-col gap-4">
                    <div className="flex items-center gap-3">
                      <span className={cx('w-12 h-12 rounded-2xl grid place-items-center', s ? 'bg-hundido' : 'bg-aji text-sobre-aji')}><Receipt className="w-6 h-6" /></span>
                      <div className="flex-1">
                        <p className="font-display font-bold text-xl">{c.nombre}</p>
                        {s ? <p className="text-sm text-tenue">En uso por {s.usuario?.nombre} desde {hora(s.abierto_en)}</p> : <p className="text-sm text-tenue">Libre</p>}
                      </div>
                      {s ? <Insignia tono="alerta">Abierta</Insignia> : <Insignia>Cerrada</Insignia>}
                    </div>
                    {!s && tiene('caja', 'abrir') && <button className="btn-aji btn-lg" onClick={() => setAbrir(c)}>Abrir esta caja</button>}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
      {abrir && <HojaAbrir caja={abrir} onCerrar={() => setAbrir(null)} />}
    </Pagina>
  );
}
