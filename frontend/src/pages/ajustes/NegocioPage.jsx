import { useState } from 'react';
import { usePermisos } from '../../hooks/usePermisos';
import { Cargando, Campo, Pagina, Encabezado, SinPermiso } from '../../components/ui/piezas';
import { SubirImagen, urlImagen } from '../../components/ui/formulario';
import { useConfiguracion, Seccion } from './comun';
import { cx, iniciales } from '../../lib/util';

const COLORES = ['#F2B705', '#E4572E', '#8A0000', '#2F9E6B', '#2F6FD2', '#7B4AE2', '#D73382', '#17262B'];
const CLAVES = ['nombre_negocio', 'telefono', 'direccion', 'moneda', 'simbolo_moneda', 'color_primario', 'logo', 'portada', 'pie_ticket'];

const inicial = (config) => Object.fromEntries(CLAVES.map((k) => [k, config[k] === 'NULL' ? '' : (config[k] ?? '')]));

export default function NegocioPage() {
  const { tiene } = usePermisos();
  const { config, cargando, guardar } = useConfiguracion();
  if (!tiene('configuracion', 'ver')) return <SinPermiso />;
  if (cargando || !config) return <Cargando />;
  return <Formulario key={JSON.stringify(inicial(config))} config={config} guardar={guardar} editar={tiene('configuracion', 'editar')} />;
}

function Formulario({ config, guardar, editar }) {
  const [f, setF] = useState(() => inicial(config));
  const campo = (k) => ({ value: f[k] ?? '', onChange: (e) => setF({ ...f, [k]: e.target.value }), disabled: !editar });
  const cambiado = CLAVES.some((k) => (f[k] ?? '') !== ((config[k] === 'NULL' ? '' : config[k]) ?? ''));

  return (
    <Pagina className="pb-28">
      <Encabezado titulo="Negocio y marca" texto="Así aparece tu restaurante en la app, en los tickets y en el menú QR." />
      <div className="grid xl:grid-cols-[minmax(0,1fr)_340px] 2xl:grid-cols-[minmax(0,1fr)_400px] gap-8 2xl:gap-12 items-start">
        <div>
          <Seccion titulo="Identidad" texto="El logo se ve en el menú, en el login y en los tickets.">
            <div className="flex gap-5 items-start max-w-3xl">
              <SubirImagen className="w-28 h-28 shrink-0" valor={f.logo || null} onCambio={(v) => setF({ ...f, logo: v ?? '' })} />
              <div className="flex-1 space-y-3">
                <Campo etiqueta="Nombre del negocio"><input className="campo" {...campo('nombre_negocio')} /></Campo>
                <div className="grid sm:grid-cols-2 gap-3">
                  <Campo etiqueta="Teléfono"><input className="campo" {...campo('telefono')} /></Campo>
                  <Campo etiqueta="Dirección"><input className="campo" {...campo('direccion')} /></Campo>
                </div>
              </div>
            </div>
          </Seccion>
          <Seccion titulo="Color de marca" texto="Pinta botones y acentos de todo el sistema y del menú QR.">
            <div className="flex flex-wrap gap-2 items-center">
              {COLORES.map((c) => (
                <button key={c} disabled={!editar} onClick={() => setF({ ...f, color_primario: c })} aria-label={`Color ${c}`}
                  className={cx('w-10 h-10 rounded-full ring-offset-2 ring-offset-fondo', f.color_primario?.toLowerCase() === c.toLowerCase() && 'ring-2 ring-tinta')} style={{ background: c }} />
              ))}
              <label className="flex items-center gap-2 ml-2 text-sm text-tenue">
                Otro <input type="color" disabled={!editar} value={f.color_primario || '#F2B705'} onChange={(e) => setF({ ...f, color_primario: e.target.value })} className="w-10 h-10 rounded-lg border border-linea bg-transparent" />
              </label>
            </div>
          </Seccion>
          <Seccion titulo="Portada del menú QR" texto="Foto grande arriba del menú que ven tus clientes al escanear.">
            <SubirImagen className="w-full max-w-2xl aspect-[16/7]" valor={f.portada || null} onCambio={(v) => setF({ ...f, portada: v ?? '' })} />
          </Seccion>
          <Seccion titulo="Moneda">
            <div className="grid grid-cols-2 gap-3 max-w-md">
              <Campo etiqueta="Código"><input className="campo" {...campo('moneda')} placeholder="Bs" /></Campo>
              <Campo etiqueta="Símbolo en pantalla"><input className="campo" {...campo('simbolo_moneda')} placeholder="Bs." /></Campo>
            </div>
          </Seccion>
          <Seccion titulo="Ticket" texto="Mensaje al final de cada ticket de venta.">
            <textarea rows={2} className="campo max-w-3xl" {...campo('pie_ticket')} placeholder="¡Gracias por su preferencia!" />
          </Seccion>
        </div>

        {/* Vista previa del ticket */}
        <aside className="xl:sticky xl:top-20">
          <p className="etiqueta">Vista previa</p>
          <div className="comanda rounded-t-xl shadow-papel px-5 pt-5 text-[13px]">
            <div className="flex flex-col items-center text-center gap-2">
              <div className="w-14 h-14 rounded-xl overflow-hidden grid place-items-center text-white font-display font-extrabold text-xl" style={{ background: f.color_primario || '#F2B705' }}>
                {f.logo ? <img src={urlImagen(f.logo)} alt="" className="w-full h-full object-cover" /> : iniciales(f.nombre_negocio || 'M')}
              </div>
              <p className="font-display font-extrabold text-lg leading-tight">{f.nombre_negocio || 'Tu restaurante'}</p>
              {(f.direccion || f.telefono) && <p className="text-tenue">{[f.direccion, f.telefono].filter(Boolean).join(' · ')}</p>}
            </div>
            <div className="perforado my-3" />
            {[['2', 'Silpancho', '70.00'], ['1', 'Mocochinchi', '7.00']].map(([c, n, p]) => (
              <div key={n} className="flex gap-2"><span className="num w-4">{c}</span><span className="flex-1">{n}</span><span className="num">{p}</span></div>
            ))}
            <div className="perforado my-3" />
            <div className="flex justify-between font-bold text-base"><span>Total</span><span className="num">{f.simbolo_moneda || 'Bs'} 77.00</span></div>
            <p className="text-center text-tenue mt-3 pb-1">{f.pie_ticket || ' '}</p>
          </div>
        </aside>
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
