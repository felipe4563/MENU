import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { Plus, Armchair, Pencil, Trash2, QrCode, Printer, RefreshCw, Copy, AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getAreas, crearArea, actualizarArea, eliminarArea } from '../../api/areas';
import { getMesas, crearMesa, actualizarMesa, eliminarMesa, regenerarCodigoQrMesa } from '../../api/mesas';
import { usePermisos } from '../../hooks/usePermisos';
import { useConfigPublica } from '../../hooks/useConfig';
import Hoja from '../../components/ui/Hoja';
import { Cargando, Campo, Encabezado, Interruptor, Pagina, SinPermiso, Vacio, useConfirmar, usePedirTexto } from '../../components/ui/piezas';
import { useConfiguracion } from './comun';
import { avisar } from '../../components/ui/Aviso';
import { imprimirHtml } from '../../utils/imprimirHtml';
import { errorDe } from '../../lib/util';

// Interruptor de pedidos desde la mesa. Con "Tu propio QR" no se puede pedir
// igual (nadie confirmaría el pago a tiempo), así que se avisa.
function PedidosDesdeMesa({ editar }) {
  const { config, guardar } = useConfiguracion();
  if (!config) return null;
  const activo = config.autoservicio_pedidos !== 'false';
  const qrPropio = config.qr_proveedor === 'propio';
  return (
    <section className="ficha p-4 sm:p-5 mb-8">
      <Interruptor
        disabled={!editar || guardar.isPending}
        activo={activo}
        onCambio={(v) => guardar.mutate({ autoservicio_pedidos: v ? 'true' : 'false' })}
        etiqueta="Pedidos desde la mesa"
        descripcion={activo
          ? 'El cliente escanea el QR de su mesa, pide y paga desde el celular.'
          : 'El QR de la mesa solo muestra el menú: el cliente pide al mozo.'}
      />
      {activo && qrPropio && (
        <p className="mt-3 text-[13px] rounded-xl bg-aji/15 px-3 py-2.5 flex gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>Ahora no se puede pedir desde la mesa porque cobras con tu propio QR. Para que funcione, elige Banco Económico o CodePay en <Link to="/ajustes/cobro-qr" className="font-semibold underline">Cobro con QR</Link>.</span>
        </p>
      )}
    </section>
  );
}

const urlMesa = (codigo) => `${window.location.origin}/m/${codigo}`;

function useQr(texto) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let vivo = true;
    if (texto) QRCode.toDataURL(texto, { margin: 1, width: 480 }).then((d) => vivo && setSrc(d));
    return () => { vivo = false; };
  }, [texto]);
  return src;
}

function HojaQr({ mesa, onCerrar }) {
  const qc = useQueryClient();
  const { data: cfg = {} } = useConfigPublica();
  const src = useQr(mesa.codigo_qr ? urlMesa(mesa.codigo_qr) : null);
  const regenerar = useMutation({
    mutationFn: () => regenerarCodigoQrMesa(mesa.id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['mesas'] }); avisar.ok('QR nuevo generado. Imprime y reemplaza el anterior.'); onCerrar(); },
    onError: (e) => avisar.error(errorDe(e)),
  });
  const imprimir = () => imprimirHtml(`<!doctype html><html><head><meta charset="utf-8"><style>
    body{font-family:system-ui,sans-serif;text-align:center;padding:24px;margin:0}
    h1{font-size:28px;margin:8px 0 2px}p{margin:0;color:#555}img{width:70mm;height:70mm;margin:14px auto;display:block}
    .mesa{font-size:44px;font-weight:800;margin-top:6px}</style></head><body>
    <h1>${cfg.nombre_negocio ?? ''}</h1><p>Escanea para ver el menú y pedir</p>
    <img src="${src}"/><div class="mesa">${mesa.nombre}</div></body></html>`);
  return (
    <Hoja onCerrar={onCerrar} titulo={`QR de ${mesa.nombre}`} subtitulo="El cliente lo escanea, ve el menú y pide desde su celular." ancho="max-w-sm">
      {!mesa.codigo_qr ? <p className="text-tenue">Esta mesa todavía no tiene código QR.</p> : (
        <div className="text-center">
          <div className="mx-auto w-60 h-60 bg-white rounded-2xl p-3 border border-linea">{src && <img src={src} alt={`QR ${mesa.nombre}`} className="w-full h-full" />}</div>
          <p className="text-xs text-tenue mt-2 break-all">{urlMesa(mesa.codigo_qr)}</p>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2 mt-4">
        <button className="btn-aji col-span-2" disabled={!src} onClick={imprimir}><Printer className="w-4 h-4" /> Imprimir cartel</button>
        <button className="btn-borde" onClick={() => { navigator.clipboard?.writeText(urlMesa(mesa.codigo_qr)); avisar.ok('Enlace copiado'); }} disabled={!mesa.codigo_qr}><Copy className="w-4 h-4" /> Copiar enlace</button>
        <button className="btn-borde" onClick={() => regenerar.mutate()} disabled={regenerar.isPending}><RefreshCw className="w-4 h-4" /> {mesa.codigo_qr ? 'Cambiar QR' : 'Generar QR'}</button>
      </div>
    </Hoja>
  );
}

function HojaMesa({ mesa, areas, areaInicial, onCerrar }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ nombre: mesa?.nombre ?? '', asientos: String(mesa?.asientos ?? 4), area_id: mesa?.area_id ?? areaInicial ?? areas[0]?.id ?? '' });
  const guardar = useMutation({
    mutationFn: () => {
      const d = { nombre: f.nombre.trim(), asientos: Number(f.asientos || 4), area_id: Number(f.area_id) };
      return mesa ? actualizarMesa(mesa.id, d) : crearMesa(d);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['mesas'] }); avisar.ok(mesa ? 'Mesa guardada' : 'Mesa creada'); onCerrar(); },
    onError: (e) => avisar.error(errorDe(e)),
  });
  return (
    <Hoja onCerrar={onCerrar} titulo={mesa ? `Editar ${mesa.nombre}` : 'Nueva mesa'} ancho="max-w-sm"
      pie={<button data-principal className="btn-aji w-full" disabled={!f.nombre.trim() || !f.area_id || guardar.isPending} onClick={() => guardar.mutate()}>Guardar</button>}>
      <div className="space-y-3">
        <Campo etiqueta="Nombre"><input autoFocus className="campo" value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} placeholder="Ej.: M1, Terraza 3" /></Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo etiqueta="Área"><select className="campo" value={f.area_id} onChange={(e) => setF({ ...f, area_id: e.target.value })}>{areas.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}</select></Campo>
          <Campo etiqueta="Sillas"><input className="campo num" inputMode="numeric" value={f.asientos} onChange={(e) => setF({ ...f, asientos: e.target.value.replace(/\D/g, '') })} /></Campo>
        </div>
      </div>
    </Hoja>
  );
}

// Crea varias mesas de una vez: "M" del 1 al 10.
function HojaVarias({ area, onCerrar }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ prefijo: 'M', desde: '1', hasta: '10', asientos: '4' });
  const total = Math.max(0, Number(f.hasta) - Number(f.desde) + 1);
  const crear = useMutation({
    mutationFn: async () => {
      for (let i = Number(f.desde); i <= Number(f.hasta); i++) await crearMesa({ area_id: area.id, nombre: `${f.prefijo}${i}`, asientos: Number(f.asientos || 4) });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['mesas'] }); avisar.ok(`${total} mesas creadas en ${area.nombre}`); onCerrar(); },
    onError: (e) => { qc.invalidateQueries({ queryKey: ['mesas'] }); avisar.error(errorDe(e)); },
  });
  return (
    <Hoja onCerrar={onCerrar} titulo={`Varias mesas en ${area.nombre}`} ancho="max-w-sm"
      pie={<button data-principal className="btn-aji w-full" disabled={total < 1 || total > 60 || crear.isPending} onClick={() => crear.mutate()}>{crear.isPending ? 'Creando…' : `Crear ${total} mesas`}</button>}>
      <div className="grid grid-cols-2 gap-3">
        <Campo etiqueta="Empiezan con"><input className="campo" value={f.prefijo} onChange={(e) => setF({ ...f, prefijo: e.target.value })} /></Campo>
        <Campo etiqueta="Sillas c/u"><input className="campo num" value={f.asientos} onChange={(e) => setF({ ...f, asientos: e.target.value.replace(/\D/g, '') })} /></Campo>
        <Campo etiqueta="Desde el número"><input className="campo num" value={f.desde} onChange={(e) => setF({ ...f, desde: e.target.value.replace(/\D/g, '') })} /></Campo>
        <Campo etiqueta="Hasta el número"><input className="campo num" value={f.hasta} onChange={(e) => setF({ ...f, hasta: e.target.value.replace(/\D/g, '') })} /></Campo>
      </div>
      <p className="text-sm text-tenue mt-3">Se crearán: {f.prefijo}{f.desde} … {f.prefijo}{f.hasta}</p>
    </Hoja>
  );
}

export default function SalonPage() {
  const qc = useQueryClient();
  const { tiene } = usePermisos();
  const [hoja, setHoja] = useState(null);
  const [confirmacion, confirmar] = useConfirmar();
  const [pedidoTexto, pedirTexto] = usePedirTexto();
  const areas = useQuery({ queryKey: ['areas'], queryFn: getAreas });
  const mesas = useQuery({ queryKey: ['mesas'], queryFn: () => getMesas() });
  const editar = tiene('configuracion', 'editar');
  const fallo = (e) => avisar.error(errorDe(e));
  const nuevaArea = useMutation({ mutationFn: (nombre) => crearArea({ nombre }), onSuccess: () => qc.invalidateQueries({ queryKey: ['areas'] }), onError: fallo });
  const renombrar = useMutation({ mutationFn: ({ a, nombre }) => actualizarArea(a.id, { nombre }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['areas'] }); qc.invalidateQueries({ queryKey: ['mesas'] }); }, onError: fallo });
  const borrarArea = useMutation({ mutationFn: (a) => eliminarArea(a.id), onSuccess: () => qc.invalidateQueries({ queryKey: ['areas'] }), onError: fallo });
  const borrarMesa = useMutation({ mutationFn: (m) => eliminarMesa(m.id), onSuccess: () => qc.invalidateQueries({ queryKey: ['mesas'] }), onError: fallo });

  if (!tiene('configuracion', 'ver')) return <SinPermiso />;
  if (areas.isLoading || mesas.isLoading) return <Cargando />;
  const listaAreas = areas.data ?? [];


  return (
    <Pagina>
      <Encabezado titulo="Salón y mesas" texto="Organiza las mesas por área. Cada mesa tiene su QR con el menú."
        acciones={editar && <button className="btn-aji" onClick={async () => { const n = await pedirTexto({ titulo: 'Nueva área', placeholder: 'Ej.: Salón, Terraza', confirmar: 'Crear área' }); if (n) nuevaArea.mutate(n); }}><Plus className="w-4 h-4" /> Nueva área</button>} />
      <PedidosDesdeMesa editar={editar} />
      {listaAreas.length === 0 ? (
        <Vacio Icono={Armchair} titulo="Empieza creando un área" texto="Por ejemplo “Salón principal” o “Terraza”. Después agregas sus mesas." />
      ) : listaAreas.map((a) => {
        const suyas = (mesas.data ?? []).filter((m) => m.area_id === a.id);
        return (
          <section key={a.id} className="mb-8">
            <div className="flex items-center gap-2 mb-3">
              <h2 className="text-xl font-bold flex-1">{a.nombre} <span className="text-sm font-normal text-tenue">· {suyas.length} mesas</span></h2>
              {editar && (
                <>
                  <button className="btn-fantasma h-9" onClick={() => setHoja({ tipo: 'varias', area: a })}><Plus className="w-4 h-4" /> Varias</button>
                  <button className="btn-icono btn-fantasma" aria-label="Renombrar área" onClick={async () => { const n = await pedirTexto({ titulo: 'Renombrar área', inicial: a.nombre }); if (n) renombrar.mutate({ a, nombre: n }); }}><Pencil className="w-4 h-4" /></button>
                  <button className="btn-icono btn-fantasma" aria-label="Eliminar área" onClick={async () => { if (await confirmar({ titulo: `¿Eliminar ${a.nombre}?`, texto: suyas.length ? 'Primero elimina o mueve sus mesas.' : 'El área está vacía.', confirmar: 'Eliminar', peligro: true })) borrarArea.mutate(a); }}><Trash2 className="w-4 h-4" /></button>
                </>
              )}
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-7 xl:grid-cols-9 gap-3">
              {suyas.map((m) => (
                <div key={m.id} className="aspect-square rounded-ficha border border-linea bg-papel p-2.5 flex flex-col group">
                  <span className="text-xs text-tenue flex items-center gap-1"><Armchair className="w-3.5 h-3.5" /> {m.asientos}</span>
                  <span className="font-display font-extrabold text-xl leading-none mt-1 truncate">{m.nombre}</span>
                  <div className="mt-auto flex justify-end gap-0.5">
                    <button className="btn-icono h-8 w-8 btn-fantasma" onClick={() => setHoja({ tipo: 'qr', mesa: m })} aria-label="Ver QR"><QrCode className="w-4 h-4" /></button>
                    {editar && <button className="btn-icono h-8 w-8 btn-fantasma" onClick={() => setHoja({ tipo: 'mesa', mesa: m })} aria-label="Editar"><Pencil className="w-4 h-4" /></button>}
                    {editar && <button className="btn-icono h-8 w-8 btn-fantasma hidden group-hover:inline-flex" onClick={async () => { if (await confirmar({ titulo: `¿Eliminar ${m.nombre}?`, confirmar: 'Eliminar', peligro: true })) borrarMesa.mutate(m); }} aria-label="Eliminar"><Trash2 className="w-4 h-4" /></button>}
                  </div>
                </div>
              ))}
              {editar && (
                <button onClick={() => setHoja({ tipo: 'mesa', area: a })} className="aspect-square rounded-ficha border-2 border-dashed border-linea text-tenue hover:border-tenue hover:text-tinta flex flex-col items-center justify-center gap-1 text-sm font-semibold">
                  <Plus className="w-5 h-5" /> Mesa
                </button>
              )}
            </div>
          </section>
        );
      })}
      {hoja?.tipo === 'mesa' && <HojaMesa mesa={hoja.mesa} areas={listaAreas} areaInicial={hoja.area?.id} onCerrar={() => setHoja(null)} />}
      {hoja?.tipo === 'varias' && <HojaVarias area={hoja.area} onCerrar={() => setHoja(null)} />}
      {hoja?.tipo === 'qr' && <HojaQr mesa={(mesas.data ?? []).find((m) => m.id === hoja.mesa.id) ?? hoja.mesa} onCerrar={() => setHoja(null)} />}
      {confirmacion}
      {pedidoTexto}
    </Pagina>
  );
}
