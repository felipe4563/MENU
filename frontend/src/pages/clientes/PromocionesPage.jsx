import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Tag, Pencil, Trash2 } from 'lucide-react';
import { getPromociones, crearPromocion, actualizarPromocion, eliminarPromocion } from '../../api/promociones';
import { usePermisos } from '../../hooks/usePermisos';
import { useMoneda } from '../../hooks/useConfig';
import Hoja from '../../components/ui/Hoja';
import { Cargando, Campo, Encabezado, Interruptor, Pagina, Segmentado, SinPermiso, Vacio, Insignia, useConfirmar } from '../../components/ui/piezas';
import { SelectorDias, numero, useCampos } from '../../components/ui/formulario';
import { avisar } from '../../components/ui/Aviso';
import { describirDisponibilidad } from '../../utils/disponibilidad';
import SelectorProductos from './SelectorProductos';
import { cx, errorDe } from '../../lib/util';

function HojaPromo({ p, onCerrar }) {
  const qc = useQueryClient();
  const moneda = useMoneda();
  const { f, campo, poner } = useCampos({
    nombre: p?.nombre ?? '', tipo: p?.tipo ?? 'porcentaje', valor: p ? String(Number(p.valor)) : '',
    fecha_inicio: p?.fecha_inicio ?? '', fecha_fin: p?.fecha_fin ?? '', dias_semana: p?.dias_semana ?? null, activo: p ? !!p.activo : true,
    producto_ids: (p?.productos ?? []).map((x) => x.id),
  });
  const guardar = useMutation({
    mutationFn: () => {
      const d = { ...f, nombre: f.nombre.trim() || null, valor: Number(f.valor), activo: f.activo ? 1 : 0, fecha_inicio: f.fecha_inicio || null, fecha_fin: f.fecha_fin || null };
      return p ? actualizarPromocion(p.id, d) : crearPromocion(d);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['promociones'] }); qc.invalidateQueries({ queryKey: ['promociones-activas'] }); avisar.ok('Promoción guardada'); onCerrar(); },
    onError: (e) => avisar.error(errorDe(e)),
  });
  return (
    <Hoja onCerrar={onCerrar} titulo={p ? 'Editar promoción' : 'Nueva promoción'} subtitulo="Baja el precio de productos en la caja, automáticamente." ancho="max-w-2xl"
      pie={<button data-principal className="btn-aji w-full" disabled={!(Number(f.valor) > 0) || !f.producto_ids.length || guardar.isPending} onClick={() => guardar.mutate()}>Guardar promoción</button>}>
      <div className="grid sm:grid-cols-2 gap-5">
        <div className="space-y-4">
          <Campo etiqueta="Nombre (opcional)"><input className="campo" {...campo('nombre')} placeholder="Ej.: Happy hour" /></Campo>
          <div>
            <span className="etiqueta">Descuento</span>
            <div className="flex gap-2">
              <Segmentado valor={f.tipo} onCambio={(v) => poner('tipo', v)} opciones={[{ valor: 'porcentaje', etiqueta: '%' }, { valor: 'monto', etiqueta: moneda }]} />
              <input className="campo num" inputMode="decimal" {...campo('valor', numero)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Campo etiqueta="Desde"><input type="date" className="campo" {...campo('fecha_inicio')} /></Campo>
            <Campo etiqueta="Hasta"><input type="date" className="campo" {...campo('fecha_fin')} /></Campo>
          </div>
          <div><span className="etiqueta">Días</span><SelectorDias valor={f.dias_semana} onCambio={(v) => poner('dias_semana', v)} /></div>
          <Interruptor activo={f.activo} onCambio={(v) => poner('activo', v)} etiqueta="Activa" />
        </div>
        <div><span className="etiqueta">Productos con descuento</span><SelectorProductos valor={f.producto_ids} onCambio={(v) => poner('producto_ids', v)} alto="max-h-80" /></div>
      </div>
    </Hoja>
  );
}

export default function PromocionesPage() {
  const qc = useQueryClient();
  const moneda = useMoneda();
  const { tiene } = usePermisos();
  const [editar, setEditar] = useState(null);
  const [confirmacion, confirmar] = useConfirmar();
  const q = useQuery({ queryKey: ['promociones'], queryFn: getPromociones, enabled: tiene('promociones', 'ver') });
  const borrar = useMutation({ mutationFn: (p) => eliminarPromocion(p.id), onSuccess: () => qc.invalidateQueries({ queryKey: ['promociones'] }), onError: (e) => avisar.error(errorDe(e)) });
  if (!tiene('promociones', 'ver')) return <SinPermiso />;
  return (
    <Pagina>
      <Encabezado titulo="Promociones" texto="Descuentos automáticos por producto, por fechas o días de la semana."
        acciones={tiene('promociones', 'crear') && <button className="btn-aji" onClick={() => setEditar('nueva')}><Plus className="w-4 h-4" /> Nueva promoción</button>} />
      {q.isLoading ? <Cargando /> : (q.data ?? []).length === 0 ? <Vacio Icono={Tag} titulo="Sin promociones" texto="Ej.: 20% en jugos los martes." /> : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {q.data.map((p) => (
            <article key={p.id} className={cx('ficha p-4', !p.activo && 'opacity-55')}>
              <div className="flex items-start gap-2">
                <p className="font-display font-extrabold text-3xl text-aji flex-1 leading-none">−{p.tipo === 'porcentaje' ? `${Number(p.valor)}%` : `${moneda} ${Number(p.valor)}`}</p>
                {tiene('promociones', 'editar') && <button className="btn-icono btn-fantasma h-8 w-8" onClick={() => setEditar(p)} aria-label="Editar"><Pencil className="w-4 h-4" /></button>}
                {tiene('promociones', 'eliminar') && <button className="btn-icono btn-fantasma h-8 w-8" aria-label="Eliminar" onClick={async () => { if (await confirmar({ titulo: '¿Eliminar la promoción?', confirmar: 'Eliminar', peligro: true })) borrar.mutate(p); }}><Trash2 className="w-4 h-4" /></button>}
              </div>
              {p.nombre && <p className="font-semibold mt-2">{p.nombre}</p>}
              <p className="text-sm text-tenue mt-1 line-clamp-2">{(p.productos ?? []).map((x) => x.nombre).join(', ')}</p>
              <div className="flex flex-wrap gap-1 mt-3"><Insignia>{describirDisponibilidad(p)}</Insignia>{!p.activo && <Insignia tono="peligro">Pausada</Insignia>}</div>
            </article>
          ))}
        </div>
      )}
      {editar && <HojaPromo p={editar === 'nueva' ? null : editar} onCerrar={() => setEditar(null)} />}
      {confirmacion}
    </Pagina>
  );
}
