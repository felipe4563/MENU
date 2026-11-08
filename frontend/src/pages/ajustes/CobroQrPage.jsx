import { forwardRef, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { QrCode, ImageUp, Landmark, Copy, PlugZap, Loader2, CheckCircle2, AlertTriangle, Lock, LockKeyhole, ShieldCheck, Server, Timer } from 'lucide-react';
import { usePermisos } from '../../hooks/usePermisos';
import { Cargando, Campo, Encabezado, Pagina, SinPermiso } from '../../components/ui/piezas';
import { SubirImagen, urlImagen } from '../../components/ui/formulario';
import Hoja from '../../components/ui/Hoja';
import { avisar } from '../../components/ui/Aviso';
import { getCobroQr, guardarCobroQr, probarBaneco, crearPinPagos, desbloquearCobroQr, BASE_URL } from '../../api/configuracion';
import { OpcionTarjeta } from './comun';
import { cx, errorDe, fechaHora } from '../../lib/util';

const URL_CERTIFICACION = 'https://apimktdesa.baneco.com.bo/ApiGateway';

const PROVEEDORES = [
  { valor: 'propio', Icono: ImageUp, titulo: 'Tu propio QR', texto: 'Subes el QR de tu banco. El cajero confirma el pago al ver la transferencia.' },
  { valor: 'baneco', Icono: Landmark, titulo: 'Banco Económico', texto: 'QR con el monto exacto de cada pedido. El pago se confirma solo.' },
  { valor: 'codepay', Icono: QrCode, titulo: 'CodePay', texto: 'Pasarela de pagos. El pago se confirma solo (cobra comisión).' },
];

export default function CobroQrPage() {
  const { tiene } = usePermisos();
  // El pase del PIN vive solo mientras la pantalla está abierta.
  const [pase, setPase] = useState(null);
  const q = useQuery({ queryKey: ['cobro-qr', pase?.pase ?? null], queryFn: () => getCobroQr(pase?.pase), enabled: tiene('configuracion', 'ver') });
  const desbloqueado = Boolean(pase && q.data?.desbloqueado);

  // Se vuelve a bloquear sola cuando vence el pase.
  useEffect(() => {
    if (!pase) return undefined;
    const t = setTimeout(() => setPase(null), Math.max(0, new Date(pase.vence) - Date.now()));
    return () => clearTimeout(t);
  }, [pase]);

  if (!tiene('configuracion', 'ver')) return <SinPermiso />;
  if (q.isLoading || !q.data) return <Cargando />;
  if (!q.data.puede_configurar) return <SoloLectura datos={q.data} />;
  if (!desbloqueado) return <Candado datos={q.data} onPase={setPase} />;
  return <Formulario key={JSON.stringify(q.data)} datos={q.data} pase={pase} onBloquear={() => setPase(null)} />;
}

// ---------- Candado: PIN de pagos ----------

// Seis casillas que en realidad son un solo campo: se puede pegar, borrar y
// el celular abre el teclado de números.
const EntradaPin = forwardRef(function EntradaPin({ valor, onCambio, etiqueta, ocultarEtiqueta, autoFocus, error, disabled }, ref) {
  return (
    <label className="block">
      <span className={ocultarEtiqueta ? 'sr-only' : 'etiqueta'}>{etiqueta}</span>
      <span className="relative block">
        <input
          ref={ref} autoFocus={autoFocus} readOnly={disabled}
          className="peer absolute inset-0 z-10 w-full h-full opacity-0 cursor-text"
          type="password" inputMode="numeric" autoComplete="off" maxLength={6}
          value={valor} onChange={(e) => onCambio(e.target.value.replace(/\D/g, '').slice(0, 6))}
          aria-invalid={error || undefined}
        />
        <span aria-hidden className="grid grid-cols-6 gap-2">
          {Array.from({ length: 6 }, (_, i) => {
            const lleno = i < valor.length;
            return (
              <span key={i} className={cx(
                'h-14 rounded-xl border-2 grid place-items-center bg-white transition-colors',
                error ? 'border-locoto' : lleno ? 'border-tinta' : 'border-linea',
              )}>
                {lleno && <span className="w-3 h-3 rounded-full bg-tinta" />}
              </span>
            );
          })}
        </span>
        <span aria-hidden className="pointer-events-none absolute -inset-1 rounded-2xl ring-2 ring-aji/0 peer-focus:ring-aji/50 transition" />
      </span>
    </label>
  );
});

function Candado({ datos, onPase }) {
  const creando = !datos.pin_creado;
  const [pin, setPin] = useState('');
  const [repetido, setRepetido] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [error, setError] = useState('');
  const campoPin = useRef(null);

  const abrir = useMutation({
    mutationFn: (v) => (creando ? crearPinPagos({ pin, contrasena }) : desbloquearCobroQr(v)),
    onSuccess: (d) => { if (creando) avisar.ok('PIN de pagos creado'); onPase(d); },
    onError: (e) => {
      setError(errorDe(e)); setPin(''); setRepetido('');
      setTimeout(() => campoPin.current?.focus(), 0);
    },
  });

  const noCoinciden = creando && repetido.length === 6 && repetido !== pin;
  const listo = pin.length === 6 && (!creando || (repetido === pin && contrasena));

  // Para desbloquear no hace falta botón: al completar las 6 cifras se abre.
  const cambiarPin = (v) => {
    setPin(v); setError('');
    if (!creando && v.length === 6 && !abrir.isPending) abrir.mutate(v);
  };
  const enviar = (e) => { e.preventDefault(); if (listo && !abrir.isPending) abrir.mutate(); };

  return (
    <Pagina className="min-h-[calc(100dvh-15rem)] md:min-h-[calc(100dvh-5rem)] grid place-items-center">
      <section className="ficha w-full max-w-md p-6 sm:p-8 text-center shadow-flota animate-entra">
        <span className="mx-auto w-14 h-14 rounded-2xl bg-tinta text-fondo grid place-items-center"><LockKeyhole className="w-7 h-7" /></span>
        <p className="text-[13px] text-tenue mt-4">Cobro con QR</p>
        <h2 className="font-display font-bold text-2xl mt-0.5 leading-tight">{creando ? 'Crea el PIN de pagos' : 'Escribe el PIN de pagos'}</h2>
        <p className="text-sm text-tenue mt-1.5">
          {creando
            ? 'Son 6 números, distintos de tu contraseña. Quien crea el PIN queda como la única persona que puede ver y cambiar el cobro con QR. Guárdalo bien: si lo olvidas, solo se puede borrar desde el servidor.'
            : 'Esta pantalla está protegida. Se vuelve a bloquear a los 5 minutos o cuando sales.'}
        </p>
        <form onSubmit={enviar} className="mt-6 space-y-4 text-left">
          <EntradaPin ref={campoPin} etiqueta={creando ? 'PIN nuevo' : 'PIN de pagos'} ocultarEtiqueta={!creando} valor={pin} onCambio={cambiarPin} autoFocus error={!!error && !creando} disabled={abrir.isPending} />
          {creando && (
            <>
              <EntradaPin etiqueta="Repite el PIN" valor={repetido} onCambio={setRepetido} error={noCoinciden} />
              {noCoinciden && <p className="text-sm text-locoto -mt-2">Los dos PIN no coinciden.</p>}
              <Campo etiqueta="Tu contraseña, para confirmar que eres tú">
                <input type="password" className="campo h-12" autoComplete="current-password" value={contrasena} onChange={(e) => setContrasena(e.target.value)} />
              </Campo>
            </>
          )}
          {error && <p role="alert" className="text-sm text-locoto bg-locoto/10 rounded-xl px-3 py-2.5">{error}</p>}
          {creando && (
            <button className="btn-aji btn-lg w-full" disabled={!listo || abrir.isPending}>
              {abrir.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Crear PIN y entrar'}
            </button>
          )}
          {!creando && abrir.isPending && <p className="text-sm text-tenue flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Revisando…</p>}
        </form>
      </section>
    </Pagina>
  );
}

function Restante({ vence }) {
  const calcular = () => Math.max(0, Math.round((new Date(vence) - Date.now()) / 1000));
  const [seg, setSeg] = useState(calcular);
  useEffect(() => { const t = setInterval(() => setSeg(calcular()), 1000); return () => clearInterval(t); });
  return <span className="num font-semibold">{Math.floor(seg / 60)}:{String(seg % 60).padStart(2, '0')}</span>;
}

function UltimoCambio({ cambio }) {
  if (!cambio) return null;
  return <p className="text-[13px] text-tenue flex items-center gap-1.5"><ShieldCheck className="w-4 h-4" /> Último cambio: {cambio.usuario}, {fechaHora(cambio.fecha)}</p>;
}

// Quien ve Ajustes pero no puede configurar el cobro: sabe qué se usa, no ve datos.
function SoloLectura({ datos }) {
  const p = PROVEEDORES.find((x) => x.valor === datos.qr_proveedor) ?? PROVEEDORES[2];
  return (
    <Pagina>
      <Encabezado titulo="Cobro con QR" texto="Con qué se cobra cuando se elige pagar con QR." />
      <section className="ficha p-5 sm:p-6 max-w-2xl space-y-4">
        <div className="flex items-center gap-3">
          <span className="w-11 h-11 rounded-xl bg-aji text-sobre-aji grid place-items-center"><p.Icono className="w-5 h-5" /></span>
          <div><p className="text-[13px] text-tenue">Se cobra con</p><p className="font-display font-semibold text-lg">{p.titulo}</p></div>
        </div>
        <p className="text-sm rounded-xl bg-hundido px-3 py-2.5 flex gap-2"><Lock className="w-4 h-4 shrink-0 mt-0.5" /> {datos.titular ? `Solo ${datos.titular.nombre} puede ver los datos y cambiar esta opción.` : 'Solo el dueño puede ver los datos y cambiar esta opción.'}</p>
        <UltimoCambio cambio={datos.ultimo_cambio} />
      </section>
    </Pagina>
  );
}

function Formulario({ datos, pase, onBloquear }) {
  const qc = useQueryClient();
  const b = datos.baneco;
  const enServidor = b.origen === 'servidor';
  const inicial = {
    qr_proveedor: datos.qr_proveedor, qr_propio_imagen: datos.qr_propio_imagen || '',
    baneco_url: b.url || '', baneco_usuario: b.usuario || '', baneco_sucursal: b.sucursal || '',
    baneco_password: '', baneco_aes_key: '', baneco_cuenta: '',
  };
  const [f, setF] = useState(inicial);
  const [confirmando, setConfirmando] = useState(false);
  const [pinGuardar, setPinGuardar] = useState('');
  const set = (k) => ({ value: f[k], onChange: (e) => setF({ ...f, [k]: e.target.value }), className: 'campo' });
  const cambiado = Object.keys(inicial).some((k) => f[k] !== inicial[k]);
  const prov = f.qr_proveedor;

  const llave = f.baneco_aes_key.length;
  const banecoIncompleto = prov === 'baneco' && !enServidor && (
    !f.baneco_usuario.trim() || !(f.baneco_password || b.password_cargada) || !(f.baneco_aes_key || b.aes_cargada) || !(f.baneco_cuenta || b.cuenta_final)
  );
  const motivoBloqueo = prov === 'propio' && !f.qr_propio_imagen ? 'Sube tu QR para guardar'
    : banecoIncompleto ? 'Completa los datos del banco para guardar'
    : llave > 0 && llave !== 32 ? 'La llave debe tener 32 caracteres'
    : prov === 'codepay' && !datos.codepay_configurado ? 'CodePay no está configurado en el servidor'
    : null;

  const guardar = useMutation({
    mutationFn: () => guardarCobroQr({ ...f, pin: pinGuardar }, pase.pase),
    onSuccess: (d) => {
      qc.setQueryData(['cobro-qr', pase.pase], d);
      qc.invalidateQueries({ queryKey: ['configuracion'] });
      qc.invalidateQueries({ queryKey: ['configuracion-publica'] });
      setConfirmando(false); setPinGuardar('');
      avisar.ok('Cobro con QR guardado');
    },
    onError: (e) => {
      const codigo = e?.response?.data?.codigo;
      if (codigo === 'PIN_REQUERIDO' || codigo === 'PIN_BLOQUEADO') onBloquear();
      setPinGuardar('');
      avisar.error(errorDe(e));
    },
  });
  const probar = useMutation({
    mutationFn: () => probarBaneco(pase.pase),
    onSuccess: () => avisar.ok('Conexión correcta con Banco Económico'),
    onError: (e) => avisar.error(errorDe(e, 'No se pudo conectar con el banco')),
  });

  const base = /^https?:/.test(BASE_URL) ? BASE_URL : window.location.origin;
  const urlAviso = `${base}/api/qrsimple/notifyPaymentQR`;
  const guardada = (si) => (si ? '•••••••• (guardada)' : '');
  const botonProbar = (
    <button className="btn-borde w-full" disabled={cambiado || probar.isPending || (!enServidor && !b.password_cargada)} onClick={() => probar.mutate()}>
      {probar.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : probar.isSuccess ? <CheckCircle2 className="w-4 h-4 text-hierba" /> : <PlugZap className="w-4 h-4" />} Probar conexión
    </button>
  );

  return (
    <Pagina className="pb-28">
      <Encabezado titulo="Cobro con QR" texto="Elige con qué se cobra cuando el cajero o el cliente del menú QR eligen pagar con QR." />

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mb-4 -mt-2">
        <p className="text-[13px] text-tenue flex items-center gap-1.5"><Lock className="w-4 h-4" /> Solo tú ves y cambias esta pantalla. Cada cambio pide el PIN de pagos.</p>
        <UltimoCambio cambio={datos.ultimo_cambio} />
        <p className="text-[13px] flex items-center gap-1.5 sm:ml-auto">
          <Timer className="w-4 h-4 text-tenue" /> <span className="text-tenue">Se bloquea en</span> <Restante vence={pase.vence} />
          <button className="btn-fantasma h-8 px-2.5 text-[13px] ml-1" onClick={onBloquear}><LockKeyhole className="w-4 h-4" /> Bloquear ahora</button>
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-3 mb-6">
        {PROVEEDORES.map((p) => (
          <OpcionTarjeta key={p.valor} activa={prov === p.valor} onClick={() => setF({ ...f, qr_proveedor: p.valor })} Icono={p.Icono} titulo={p.titulo} texto={p.texto} />
        ))}
      </div>

      {prov === 'propio' && (
        <section className="ficha p-5 sm:p-6 grid lg:grid-cols-[auto_minmax(0,1fr)] gap-6 lg:gap-10 items-start">
          <div>
            <span className="etiqueta">Imagen de tu QR</span>
            <SubirImagen className="w-60 h-60" valor={f.qr_propio_imagen || null} onCambio={(v) => setF({ ...f, qr_propio_imagen: v ?? '' })} />
          </div>
          <div className="space-y-4 max-w-xl">
            <div>
              <h2 className="font-display font-semibold text-lg">Así se cobra</h2>
              <ol className="mt-3 space-y-2.5 text-sm">
                {['El cajero elige QR y la pantalla muestra tu QR con el monto a pagar.', 'El cliente escanea con la app de su banco y paga ese monto.', 'Cuando ves el dinero en tu banco, tocas “Ya recibí el pago”.'].map((t, i) => (
                  <li key={t} className="flex gap-3"><span className="w-6 h-6 rounded-full bg-hundido grid place-items-center text-xs font-bold shrink-0 num">{i + 1}</span><span>{t}</span></li>
                ))}
              </ol>
            </div>
            <p className="text-[13px] rounded-xl bg-aji/15 px-3 py-2.5 flex gap-2"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> El sistema no puede ver tu cuenta: confirma solo cuando el pago aparezca en tu banco, no con una captura del cliente.</p>
            <p className="text-[13px] text-tenue">Con tu propio QR, los clientes pueden ver el menú desde el QR de la mesa, pero no pedir ni pagar desde ahí: deben pedir al mozo. Para que pidan desde la mesa, usa Banco Económico o CodePay.</p>
          </div>
        </section>
      )}

      {prov === 'baneco' && enServidor && (
        <section className="ficha p-5 sm:p-6 max-w-2xl space-y-3">
          <p className="inline-flex items-center gap-2 text-sm font-semibold rounded-full px-3 py-1 bg-hierba/15 text-hierba"><Server className="w-4 h-4" /> Datos del banco configurados en el servidor</p>
          <p className="text-sm text-tenue">Los cargó quien instaló el sistema y no se pueden ver ni cambiar desde aquí. Para cambiarlos, pídeselo a tu proveedor del sistema.</p>
          <div className="max-w-xs">{botonProbar}</div>
        </section>
      )}

      {prov === 'baneco' && !enServidor && (
        <section className="ficha p-5 sm:p-6 grid xl:grid-cols-[minmax(0,1fr)_380px] gap-6 xl:gap-10 items-start">
          <div className="space-y-4">
            <div>
              <h2 className="font-display font-semibold text-lg">Datos que te dio el banco</h2>
              <p className="text-[13px] text-tenue mt-1">La contraseña, la llave y la cuenta se guardan cifradas y no se vuelven a mostrar. Deja un campo vacío para mantener lo guardado.</p>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <Campo etiqueta="Usuario"><input {...set('baneco_usuario')} autoComplete="off" /></Campo>
              <Campo etiqueta="Contraseña"><input {...set('baneco_password')} type="password" autoComplete="new-password" placeholder={guardada(b.password_cargada)} /></Campo>
              <Campo etiqueta={`Llave de cifrado (AES)${llave ? ` · ${llave}/32` : ''}`}>
                <input {...set('baneco_aes_key')} type="password" autoComplete="off" placeholder={guardada(b.aes_cargada) || '32 caracteres'} className={cx('campo', llave > 0 && llave !== 32 && 'border-locoto')} />
              </Campo>
              <Campo etiqueta="Cuenta donde se abona">
                <input {...set('baneco_cuenta')} type="password" inputMode="numeric" autoComplete="off" placeholder={b.cuenta_final ? `Termina en ${b.cuenta_final}` : ''} className="campo num" />
              </Campo>
              <Campo etiqueta="Código de sucursal (opcional)"><input {...set('baneco_sucursal')} maxLength={5} placeholder="Ej.: E0001" /></Campo>
              <Campo etiqueta="Dirección del API"><input {...set('baneco_url')} placeholder={URL_CERTIFICACION} className="campo text-sm" /></Campo>
            </div>
            <p className="text-[13px] text-tenue">
              {(!f.baneco_url || f.baneco_url.includes('apimktdesa')) ? 'Estás en el ambiente de pruebas del banco. Para cobrar de verdad, pon la dirección de producción que te entregue el banco.' : 'Ambiente de producción: los cobros son reales.'}
            </p>
          </div>
          <div className="space-y-3">
            <div className="rounded-xl border border-linea p-4">
              <p className="font-semibold text-sm">Aviso de pagos</p>
              <p className="text-[13px] text-tenue mt-1">Pídele al banco que avise los pagos a esta dirección. Así se confirman al instante; si no, el sistema consulta al banco cada pocos segundos.</p>
              <div className="mt-3 flex gap-2">
                <code className="flex-1 min-w-0 truncate rounded-lg bg-hundido px-3 py-2 text-[12px]">{urlAviso}</code>
                <button className="btn-icono btn-suave shrink-0" aria-label="Copiar" onClick={() => navigator.clipboard?.writeText(urlAviso).then(() => avisar.ok('Copiado'))}><Copy className="w-4 h-4" /></button>
              </div>
            </div>
            {botonProbar}
            {cambiado && <p className="text-[12px] text-tenue text-center">Guarda los cambios para probar la conexión.</p>}
          </div>
        </section>
      )}

      {prov === 'codepay' && (
        <section className="ficha p-5 sm:p-6 max-w-2xl">
          <p className={cx('inline-flex items-center gap-2 text-sm font-semibold rounded-full px-3 py-1', datos.codepay_configurado ? 'bg-hierba/15 text-hierba' : 'bg-locoto/10 text-locoto')}>
            {datos.codepay_configurado ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
            {datos.codepay_configurado ? 'CodePay está configurado' : 'CodePay no está configurado en este servidor'}
          </p>
          <p className="text-sm text-tenue mt-3">Las credenciales de CodePay las configura quien instaló el sistema, en el servidor.</p>
        </section>
      )}

      {cambiado && (
        <div className="fixed z-30 bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 md:ml-[42px] flex items-center gap-3 rounded-2xl bg-tinta text-fondo pl-5 pr-2 py-2 shadow-flota animate-entra">
          <span className="text-sm">{motivoBloqueo ?? 'Tienes cambios sin guardar'}</span>
          <button className="btn h-9 text-fondo/80 hover:bg-white/10" onClick={() => setF(inicial)}>Descartar</button>
          <button className="btn-aji h-9" disabled={!!motivoBloqueo} onClick={() => setConfirmando(true)}>Guardar</button>
        </div>
      )}

      {confirmando && (
        <Hoja onCerrar={() => { setConfirmando(false); setPinGuardar(''); }} titulo="Confirma con el PIN de pagos" subtitulo="Esto cambia a dónde llega el dinero de los cobros con QR." ancho="max-w-sm" bloquear={guardar.isPending}
          pie={<button data-principal className="btn-aji w-full" disabled={pinGuardar.length !== 6 || guardar.isPending} onClick={() => guardar.mutate()}>{guardar.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Guardar cambios'}</button>}>
          <form onSubmit={(e) => { e.preventDefault(); if (pinGuardar.length === 6) guardar.mutate(); }}>
            {prov === 'propio' && f.qr_propio_imagen && <img src={urlImagen(f.qr_propio_imagen)} alt="" className="w-28 h-28 object-contain rounded-xl border border-linea mx-auto mb-4 bg-white" />}
            <EntradaPin etiqueta="PIN de pagos" valor={pinGuardar} onCambio={setPinGuardar} autoFocus disabled={guardar.isPending} />
          </form>
        </Hoja>
      )}
    </Pagina>
  );
}
