import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Coins, Cake, Dices, Banknote, QrCode, Check, ArrowRight, MailWarning } from 'lucide-react';
import { usePermisos } from '../../hooks/usePermisos';
import { useMoneda } from '../../hooks/useConfig';
import { Cargando, Campo, Encabezado, Interruptor, Pagina, Segmentado, SinPermiso } from '../../components/ui/piezas';
import { numero } from '../../components/ui/formulario';
import { useConfiguracion } from './comun';
import { cx, dinero } from '../../lib/util';

const CLAVES = [
  'fidelidad_activa', 'puntos_por_bs', 'valor_punto_bs', 'fidelidad_canje_efectivo', 'fidelidad_canje_qr',
  'cumple_activo', 'cumple_dias_anticipacion', 'cumple_vigencia_dias', 'cumple_tipo', 'cumple_valor',
  'ruleta_activa', 'ruleta_costo_puntos', 'ruleta_max_giros_periodo', 'ruleta_periodo', 'ruleta_vigencia_dias_premio',
  'cupones_aviso_activo', 'cupones_aviso_dias',
];
const inicial = (c) => ({ ...Object.fromEntries(CLAVES.map((k) => [k, c[k] ?? ''])), cupones_aviso_dias: c.cupones_aviso_dias || '2' });

export default function FidelidadPage() {
  const { tiene } = usePermisos();
  const { config, cargando, guardar } = useConfiguracion();
  if (!tiene('configuracion', 'ver')) return <SinPermiso />;
  if (cargando || !config) return <Cargando />;
  return <Formulario key={JSON.stringify(inicial(config))} config={config} guardar={guardar} editar={tiene('configuracion', 'editar')} />;
}

// Campo numérico con la unidad dentro de la caja (pts, días, Bs…).
function Unidad({ unidad, ...props }) {
  return (
    <div className="relative">
      <input {...props} className={cx(props.className, 'pr-14')} />
      <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-sm text-tenue pointer-events-none">{unidad}</span>
    </div>
  );
}

// Tarjeta de un programa: encabezado con su interruptor, ajustes y un resumen en lenguaje del cliente.
function Programa({ Icono, titulo, texto, activo, interruptor, resumen, children }) {
  return (
    <section className={cx('ficha flex flex-col h-full transition-colors', !activo && 'bg-hundido/40')}>
      <header className="flex items-start gap-3.5 p-5 sm:p-6">
        <span className={cx('w-11 h-11 rounded-xl grid place-items-center shrink-0 transition-colors', activo ? 'bg-aji text-sobre-aji' : 'bg-hundido text-tenue')}><Icono className="w-5 h-5" /></span>
        <div className="flex-1 min-w-0">
          <h2 className="font-display font-semibold text-lg leading-tight">{titulo}</h2>
          <p className="text-[13px] text-tenue mt-1">{texto}</p>
        </div>
        <Interruptor {...interruptor} />
      </header>
      {activo ? (
        <>
          <div className="px-5 sm:px-6 space-y-4 flex-1">{children}</div>
          <div className="m-5 sm:m-6 rounded-xl border border-dashed border-linea px-4 py-3 text-sm">
            <p className="text-[12px] text-tenue mb-0.5">Así lo vive tu cliente</p>
            <p>{resumen}</p>
          </div>
        </>
      ) : (
        <p className="px-5 sm:px-6 pb-6 text-sm text-tenue">Apagado. Actívalo para configurarlo.</p>
      )}
    </section>
  );
}

const plural = (v, uno, varios) => `${v} ${v === 1 ? uno : varios}`;

function Formulario({ config, guardar, editar }) {
  const moneda = useMoneda();
  const [f, setF] = useState(() => inicial(config));
  const si = (k) => f[k] === 'true';
  const n = (k) => Number(f[k] || 0);
  const sw = (k) => ({ activo: si(k), onCambio: (v) => setF({ ...f, [k]: v ? 'true' : 'false' }), disabled: !editar });
  const num = (k) => ({ value: f[k], onChange: (e) => setF({ ...f, [k]: numero(e.target.value) }), disabled: !editar, inputMode: 'decimal', className: 'campo num' });
  const cambiado = CLAVES.some((k) => String(f[k]) !== String(inicial(config)[k]));

  const ejemplo = 100;
  const puntosEjemplo = Math.floor(ejemplo * n('puntos_por_bs'));
  const canjes = [si('fidelidad_canje_efectivo') && 'efectivo', si('fidelidad_canje_qr') && 'QR'].filter(Boolean);
  const cumpleDescuento = f.cumple_tipo === 'fijo' ? dinero(n('cumple_valor'), moneda) : `${n('cumple_valor')}%`;

  return (
    <Pagina className="pb-28">
      <Encabezado titulo="Puntos y cumpleaños" texto="Premia a tus clientes frecuentes para que vuelvan." />

      <div className="grid lg:grid-cols-2 2xl:grid-cols-3 gap-4 items-stretch">
        <Programa Icono={Coins} titulo="Puntos por compra" texto="Junta puntos al comprar y los usa como descuento."
          activo={si('fidelidad_activa')} interruptor={sw('fidelidad_activa')}
          resumen={<>Gasta {dinero(ejemplo, moneda)} y gana <b>{puntosEjemplo} puntos</b>, que valen <b>{dinero(puntosEjemplo * n('valor_punto_bs'), moneda)}</b>. {canjes.length ? `Los canjea pagando en ${canjes.join(' o ')}.` : 'Por ahora no los puede canjear.'}</>}>
          <div className="grid grid-cols-2 gap-3">
            <Campo etiqueta={`Por cada ${moneda} 1 gana`}><Unidad unidad="pts" {...num('puntos_por_bs')} /></Campo>
            <Campo etiqueta="Cada punto vale"><Unidad unidad={moneda} {...num('valor_punto_bs')} /></Campo>
          </div>
          <div>
            <span className="etiqueta">Puede canjearlos al pagar con</span>
            <div className="flex flex-wrap gap-2">
              {[['fidelidad_canje_efectivo', 'Efectivo', Banknote], ['fidelidad_canje_qr', 'QR', QrCode]].map(([k, et, I]) => (
                <button key={k} type="button" disabled={!editar} aria-pressed={si(k)} onClick={() => setF({ ...f, [k]: si(k) ? 'false' : 'true' })}
                  className={cx('h-11 px-4 rounded-xl border-2 flex items-center gap-2 text-sm font-semibold transition-colors', si(k) ? 'border-aji bg-aji/10' : 'border-linea text-tenue hover:border-tenue/50')}>
                  {si(k) ? <Check className="w-4 h-4" /> : <I className="w-4 h-4" />} {et}
                </button>
              ))}
            </div>
          </div>
        </Programa>

        <Programa Icono={Cake} titulo="Regalo de cumpleaños" texto="Un cupón automático antes de su cumpleaños."
          activo={si('cumple_activo')} interruptor={sw('cumple_activo')}
          resumen={<>Recibe un cupón de <b>{cumpleDescuento}</b> {plural(n('cumple_dias_anticipacion'), 'día', 'días')} antes de su cumpleaños y lo puede usar durante {plural(n('cumple_vigencia_dias'), 'día', 'días')}. Necesita tener su fecha de nacimiento registrada.</>}>
          <div>
            <span className="etiqueta">Descuento</span>
            <div className="flex gap-2">
              <Segmentado valor={f.cumple_tipo} onCambio={(v) => editar && setF({ ...f, cumple_tipo: v })} opciones={[{ valor: 'porcentaje', etiqueta: '%' }, { valor: 'fijo', etiqueta: moneda }]} />
              <div className="flex-1"><Unidad unidad={f.cumple_tipo === 'fijo' ? moneda : '%'} {...num('cumple_valor')} /></div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Campo etiqueta="Se envía antes"><Unidad unidad="días" {...num('cumple_dias_anticipacion')} /></Campo>
            <Campo etiqueta="El cupón dura"><Unidad unidad="días" {...num('cumple_vigencia_dias')} /></Campo>
          </div>
        </Programa>

        <Programa Icono={Dices} titulo="Ruleta de premios" texto="Gasta puntos para girar y ganar un premio."
          activo={si('ruleta_activa')} interruptor={sw('ruleta_activa')}
          resumen={<>Cada giro le cuesta <b>{n('ruleta_costo_puntos')} puntos</b>{si('fidelidad_activa') && <> (unos {dinero(n('ruleta_costo_puntos') * n('valor_punto_bs'), moneda)})</>}. Puede girar {plural(n('ruleta_max_giros_periodo'), 'vez', 'veces')} {f.ruleta_periodo === 'semana' ? 'por semana' : 'al día'} y el premio le dura {plural(n('ruleta_vigencia_dias_premio'), 'día', 'días')}.</>}>
          {!si('fidelidad_activa') && <p className="text-[13px] rounded-xl bg-locoto/10 text-locoto px-3 py-2">La ruleta se paga con puntos: activa también “Puntos por compra”.</p>}
          <div className="grid grid-cols-2 gap-3">
            <Campo etiqueta="Cada giro cuesta"><Unidad unidad="pts" {...num('ruleta_costo_puntos')} /></Campo>
            <Campo etiqueta="El premio dura"><Unidad unidad="días" {...num('ruleta_vigencia_dias_premio')} /></Campo>
          </div>
          <div>
            <span className="etiqueta">Giros por cliente</span>
            <div className="flex gap-2">
              <div className="w-28 shrink-0"><Unidad unidad="giros" {...num('ruleta_max_giros_periodo')} /></div>
              <Segmentado valor={f.ruleta_periodo} onCambio={(v) => editar && setF({ ...f, ruleta_periodo: v })} opciones={[{ valor: 'dia', etiqueta: 'al día' }, { valor: 'semana', etiqueta: 'por semana' }]} />
            </div>
          </div>
          <Link to="/clientes/ruleta" className="btn-borde w-full">Configurar premios <ArrowRight className="w-4 h-4" /></Link>
        </Programa>

        <Programa Icono={MailWarning} titulo="Aviso de cupones por vencer" texto="Un correo para que vuelva a usar su cupón antes de que se pierda."
          activo={si('cupones_aviso_activo')} interruptor={sw('cupones_aviso_activo')}
          resumen={<>Si tiene un cupón suyo sin usar (de la ruleta, de cumpleaños o uno que le diste), le llega un correo {n('cupones_aviso_dias') === 0 ? 'el mismo día que vence' : <><b>{plural(n('cupones_aviso_dias'), 'día', 'días')}</b> antes de que venza</>}, a las 10 de la mañana. Una sola vez por cupón.</>}>
          {config.correo_configurado !== 'true' && <p className="text-[13px] rounded-xl bg-locoto/10 text-locoto px-3 py-2">Este servidor no tiene correo configurado: los avisos no saldrán hasta que se configure (SMTP).</p>}
          <Campo etiqueta="Avisar antes" ayuda="Solo llega a clientes con correo registrado."><Unidad unidad="días" {...num('cupones_aviso_dias')} /></Campo>
        </Programa>
      </div>

      {editar && cambiado && (
        <div className="fixed z-30 bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 md:ml-[42px] flex items-center gap-3 rounded-2xl bg-tinta text-fondo pl-5 pr-2 py-2 shadow-flota animate-entra">
          <span className="text-sm">Tienes cambios sin guardar</span>
          <button className="btn h-9 text-fondo/80 hover:bg-white/10" onClick={() => setF(inicial(config))}>Descartar</button>
          <button className="btn-aji h-9" disabled={guardar.isPending} onClick={() => guardar.mutate(f)}>Guardar</button>
        </div>
      )}
    </Pagina>
  );
}
