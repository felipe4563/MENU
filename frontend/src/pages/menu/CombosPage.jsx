import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Gift, Trash2, Pencil, Minus } from 'lucide-react';
import { getCombos, crearCombo, actualizarCombo, eliminarCombo } from '../../api/combos';
import { getProductos } from '../../api/productos';
import { usePermisos } from '../../hooks/usePermisos';
import { useMoneda } from '../../hooks/useConfig';
import Hoja from '../../components/ui/Hoja';
import { Cargando, Campo, Encabezado, Interruptor, Pagina, SinPermiso, Vacio, Insignia, useConfirmar } from '../../components/ui/piezas';
import { SubirImagen, SelectorDias, urlImagen, numero, useCampos } from '../../components/ui/formulario';
import { avisar } from '../../components/ui/Aviso';
import { describirDisponibilidad } from '../../utils/disponibilidad';
import { cx, dinero, errorDe } from '../../lib/util';

function HojaCombo({ combo, productos, onCerrar }) {
  const qc = useQueryClient();
  const moneda = useMoneda();
  const { f, campo, poner } = useCampos({
    nombre: combo?.nombre ?? '', descripcion: combo?.descripcion ?? '', precio: combo ? String(Number(combo.precio)) : '',
    imagen: combo?.imagen ?? null, activo: combo ? !!combo.activo : true,
    fecha_inicio: combo?.fecha_inicio ?? '', fecha_fin: combo?.fecha_fin ?? '', dias_semana: combo?.dias_semana ?? null,
    productos: (combo?.productos ?? []).map((p) => ({ producto_id: p.id, cantidad: p.ComboProducto?.cantidad ?? 1 })),
  });
  const suelto = f.productos.reduce((s, x) => s + Number(productos.find((p) => p.id === x.producto_id)?.precio || 0) * x.cantidad, 0);
  const ahorro = suelto - Number(f.precio || 0);
  const setCant = (id, d) => poner('productos', f.productos.map((x) => (x.producto_id === id ? { ...x, cantidad: x.cantidad + d } : x)).filter((x) => x.cantidad > 0));
  const guardar = useMutation({
    mutationFn: () => {
      const datos = { ...f, nombre: f.nombre.trim(), precio: Number(f.precio), activo: f.activo ? 1 : 0, fecha_inicio: f.fecha_inicio || null, fecha_fin: f.fecha_fin || null };
      return combo ? actualizarCombo(combo.id, datos) : crearCombo(datos);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['combos'] }); qc.invalidateQueries({ queryKey: ['combos-activos'] }); avisar.ok('Combo guardado'); onCerrar(); },
    onError: (e) => avisar.error(errorDe(e)),
  });
  const valido = f.nombre.trim() && Number(f.precio) > 0 && f.productos.length;
  return (
    <Hoja onCerrar={onCerrar} titulo={combo ? combo.nombre : 'Nuevo combo'} ancho="max-w-2xl"
      pie={<><button className="btn-suave" onClick={onCerrar}>Cancelar</button><button data-principal className="btn-aji" disabled={!valido || guardar.isPending} onClick={() => guardar.mutate()}>Guardar combo</button></>}>
      <div className="grid sm:grid-cols-[140px_1fr] gap-5">
        <SubirImagen className="w-36 h-36" valor={f.imagen} onCambio={(v) => poner('imagen', v)} />
        <div className="space-y-3">
          <Campo etiqueta="Nombre"><input className="campo" autoFocus={!combo} {...campo('nombre')} placeholder="Ej.: Almuerzo ejecutivo" /></Campo>
          <Campo etiqueta="Descripción (opcional)"><input className="campo" {...campo('descripcion')} /></Campo>
        </div>
      </div>
      <div className="mt-5">
        <span className="etiqueta">Qué incluye</span>
        <ul className="space-y-2">
          {f.productos.map((x) => {
            const p = productos.find((pp) => pp.id === x.producto_id);
            return (
              <li key={x.producto_id} className="flex items-center gap-3 rounded-xl border border-linea px-3 py-2">
                <span className="flex-1 font-medium">{p?.nombre ?? 'Producto'}</span>
                <span className="text-xs text-tenue num">{dinero(p?.precio, moneda)}</span>
                <div className="flex items-center gap-1 rounded-full bg-hundido p-0.5">
                  <button className="w-7 h-7 grid place-items-center" onClick={() => setCant(x.producto_id, -1)} aria-label="Menos"><Minus className="w-3.5 h-3.5" /></button>
                  <span className="num w-5 text-center font-bold">{x.cantidad}</span>
                  <button className="w-7 h-7 grid place-items-center" onClick={() => setCant(x.producto_id, 1)} aria-label="Más"><Plus className="w-3.5 h-3.5" /></button>
                </div>
              </li>
            );
          })}
        </ul>
        <select className="campo mt-2" value="" onChange={(e) => e.target.value && poner('productos', [...f.productos, { producto_id: Number(e.target.value), cantidad: 1 }])}>
          <option value="">+ Agregar producto…</option>
          {productos.filter((p) => !f.productos.some((x) => x.producto_id === p.id)).map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>
      </div>
      <div className="mt-5 grid sm:grid-cols-2 gap-4 items-start">
        <Campo etiqueta="Precio del combo" ayuda={suelto > 0 ? (ahorro > 0 ? `Por separado cuesta ${dinero(suelto, moneda)}: el cliente ahorra ${dinero(ahorro, moneda)}.` : `Por separado cuesta ${dinero(suelto, moneda)}.`) : undefined}>
          <input className="campo num text-lg" inputMode="decimal" {...campo('precio', numero)} />
        </Campo>
        <Interruptor activo={f.activo} onCambio={(v) => poner('activo', v)} etiqueta="Activo" descripcion="Se muestra en la caja dentro de las fechas y días elegidos." />
      </div>
      <div className="mt-5 grid sm:grid-cols-2 gap-4">
        <Campo etiqueta="Desde (opcional)"><input type="date" className="campo" {...campo('fecha_inicio')} /></Campo>
        <Campo etiqueta="Hasta (opcional)"><input type="date" className="campo" {...campo('fecha_fin')} /></Campo>
      </div>
      <div className="mt-4"><span className="etiqueta">Días</span><SelectorDias valor={f.dias_semana} onCambio={(v) => poner('dias_semana', v)} /></div>
    </Hoja>
  );
}

export default function CombosPage() {
  const qc = useQueryClient();
  const moneda = useMoneda();
  const { tiene } = usePermisos();
  const [editar, setEditar] = useState(null);
  const [confirmacion, confirmar] = useConfirmar();
  const combos = useQuery({ queryKey: ['combos'], queryFn: getCombos, enabled: tiene('combos', 'ver') });
  const productos = useQuery({ queryKey: ['productos', 'activos'], queryFn: () => getProductos(), enabled: tiene('combos', 'ver') });
  const borrar = useMutation({ mutationFn: (c) => eliminarCombo(c.id), onSuccess: () => { qc.invalidateQueries({ queryKey: ['combos'] }); avisar.ok('Combo eliminado'); }, onError: (e) => avisar.error(errorDe(e)) });
  if (!tiene('combos', 'ver')) return <SinPermiso />;
  return (
    <Pagina>
      <Encabezado titulo="Combos" texto="Varios productos a un precio especial."
        acciones={tiene('combos', 'crear') && <button className="btn-aji" onClick={() => setEditar('nuevo')}><Plus className="w-4 h-4" /> Nuevo combo</button>} />
      {combos.isLoading ? <Cargando /> : (combos.data ?? []).length === 0 ? <Vacio Icono={Gift} titulo="Sin combos" texto="Arma uno, por ejemplo plato + bebida." /> : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {combos.data.map((c) => (
            <article key={c.id} className={cx('ficha overflow-hidden flex', !c.activo && 'opacity-60')}>
              <div className="w-28 shrink-0 bg-hundido">{c.imagen ? <img src={urlImagen(c.imagen)} alt="" className="w-full h-full object-cover" /> : <div className="h-full grid place-items-center"><Gift className="w-7 h-7 text-linea" /></div>}</div>
              <div className="flex-1 p-3 min-w-0">
                <div className="flex items-start gap-1">
                  <p className="font-semibold flex-1 leading-tight">{c.nombre}</p>
                  {tiene('combos', 'editar') && <button className="btn-icono btn-fantasma h-8 w-8" onClick={() => setEditar(c)} aria-label="Editar"><Pencil className="w-4 h-4" /></button>}
                  {tiene('combos', 'eliminar') && <button className="btn-icono btn-fantasma h-8 w-8" aria-label="Eliminar" onClick={async () => { if (await confirmar({ titulo: `¿Eliminar ${c.nombre}?`, confirmar: 'Eliminar', peligro: true })) borrar.mutate(c); }}><Trash2 className="w-4 h-4" /></button>}
                </div>
                <p className="text-xs text-tenue line-clamp-2">{(c.productos ?? []).map((p) => `${p.ComboProducto?.cantidad ?? 1}× ${p.nombre}`).join(', ')}</p>
                <div className="flex items-center gap-2 mt-2">
                  <span className="num font-bold">{dinero(c.precio, moneda)}</span>
                  {!c.activo && <Insignia>Inactivo</Insignia>}
                </div>
                <p className="text-[11px] text-tenue mt-1">{describirDisponibilidad(c)}</p>
              </div>
            </article>
          ))}
        </div>
      )}
      {editar && <HojaCombo combo={editar === 'nuevo' ? null : editar} productos={productos.data ?? []} onCerrar={() => setEditar(null)} />}
      {confirmacion}
    </Pagina>
  );
}
