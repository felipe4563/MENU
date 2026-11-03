import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { QrCode, ImageUp, Landmark, Copy, PlugZap, Loader2, CheckCircle2, AlertTriangle, Lock, ShieldCheck, Server } from 'lucide-react';
import { usePermisos } from '../../hooks/usePermisos';
import { Cargando, Campo, Encabezado, Pagina, SinPermiso } from '../../components/ui/piezas';
import { SubirImagen, urlImagen } from '../../components/ui/formulario';
import Hoja from '../../components/ui/Hoja';
import { avisar } from '../../components/ui/Aviso';
import { getCobroQr, guardarCobroQr, probarBaneco, BASE_URL } from '../../api/configuracion';
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
  const q = useQuery({ queryKey: ['cobro-qr'], queryFn: getCobroQr, enabled: tiene('configuracion', 'ver') });
  if (!tiene('configuracion', 'ver')) return <SinPermiso />;
  if (q.isLoading || !q.data) return <Cargando />;
  return q.data.puede_configurar
    ? <Formulario key={JSON.stringify(q.data)} datos={q.data} />
    : <SoloLectura datos={q.data} />;
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
        <p className="text-sm rounded-xl bg-hundido px-3 py-2.5 flex gap-2"><Lock className="w-4 h-4 shrink-0 mt-0.5" /> Solo el dueño (o quien tenga el permiso “Cobro con QR”) puede ver los datos y cambiar esta opción.</p>
        <UltimoCambio cambio={datos.ultimo_cambio} />
      </section>
    </Pagina>
  );
}

function Formulario({ datos }) {
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
  const [contrasena, setContrasena] = useState('');
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
    mutationFn: () => guardarCobroQr({ ...f, contrasena }),
    onSuccess: (d) => {
      qc.setQueryData(['cobro-qr'], d);
      qc.invalidateQueries({ queryKey: ['configuracion'] });
      qc.invalidateQueries({ queryKey: ['configuracion-publica'] });
      setConfirmando(false); setContrasena('');
      avisar.ok('Cobro con QR guardado');
    },
    onError: (e) => avisar.error(errorDe(e)),
  });
  const probar = useMutation({
    mutationFn: probarBaneco,
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
        <p className="text-[13px] text-tenue flex items-center gap-1.5"><Lock className="w-4 h-4" /> Solo lo ve y lo cambia quien tiene el permiso “Cobro con QR”. Cada cambio pide tu contraseña.</p>
        <UltimoCambio cambio={datos.ultimo_cambio} />
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
        <Hoja onCerrar={() => { setConfirmando(false); setContrasena(''); }} titulo="Confirma que eres tú" subtitulo="Esto cambia a dónde llega el dinero de los cobros con QR." ancho="max-w-sm" bloquear={guardar.isPending}
          pie={<button data-principal className="btn-aji w-full" disabled={!contrasena || guardar.isPending} onClick={() => guardar.mutate()}>{guardar.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Guardar cambios'}</button>}>
          <form onSubmit={(e) => { e.preventDefault(); if (contrasena) guardar.mutate(); }}>
            {prov === 'propio' && f.qr_propio_imagen && <img src={urlImagen(f.qr_propio_imagen)} alt="" className="w-28 h-28 object-contain rounded-xl border border-linea mx-auto mb-4 bg-white" />}
            <Campo etiqueta="Tu contraseña"><input autoFocus type="password" className="campo" autoComplete="current-password" value={contrasena} onChange={(e) => setContrasena(e.target.value)} /></Campo>
          </form>
        </Hoja>
      )}
    </Pagina>
  );
}
