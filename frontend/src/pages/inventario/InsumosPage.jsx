import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Wheat, Pencil, ClipboardCheck, BookOpenCheck, Trash2 } from 'lucide-react';
import { getInsumos, crearInsumo, actualizarInsumo, desactivarInsumo, ajustarStockInsumo, getRecetaProducto, guardarRecetaProducto } from '../../api/insumos';
import { getProductos } from '../../api/productos';
import { usePermisos } from '../../hooks/usePermisos';
import Hoja from '../../components/ui/Hoja';
import { Buscador, Cargando, Campo, Encabezado, Pagina, Segmentado, SinPermiso, Vacio, useConfirmar } from '../../components/ui/piezas';
import { numero } from '../../components/ui/formulario';
import { avisar } from '../../components/ui/Aviso';
import { errorDe, normalizar } from '../../lib/util';

const UNIDADES = { kilogramo: 'kg', gramo: 'g', litro: 'L', mililitro: 'ml', arroba: '@', libra: 'lb', unidad: 'u' };

function HojaInsumo({ i, onCerrar }) {
  const qc = useQueryClient();
  const [nombre, setNombre] = useState(i?.nombre ?? '');
  const [unidad, setUnidad] = useState(i?.unidad_medida ?? 'kilogramo');
  const guardar = useMutation({
    mutationFn: () => (i ? actualizarInsumo(i.id, { nombre: nombre.trim(), unidad_medida: unidad }) : crearInsumo({ nombre: nombre.trim(), unidad_medida: unidad })),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['insumos'] }); avisar.ok('Insumo guardado'); onCerrar(); },
    onError: (e) => avisar.error(errorDe(e)),
  });
  return (
    <Hoja onCerrar={onCerrar} titulo={i ? 'Editar insumo' : 'Nuevo insumo'} ancho="max-w-sm"
      pie={<button data-principal className="btn-aji w-full" disabled={!nombre.trim() || guardar.isPending} onClick={() => guardar.mutate()}>Guardar</button>}>
      <div className="space-y-3">
        <Campo etiqueta="Nombre"><input autoFocus className="campo" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej.: Carne de res" /></Campo>
        <Campo etiqueta="Se mide en"><select className="campo" value={unidad} onChange={(e) => setUnidad(e.target.value)}>{Object.keys(UNIDADES).map((u) => <option key={u} value={u}>{u}</option>)}</select></Campo>
      </div>
    </Hoja>
  );
}

function HojaConteo({ i, onCerrar }) {
  const qc = useQueryClient();
  const [cantidad, setCantidad] = useState(String(Number(i.stock ?? 0)));
  const [nota, setNota] = useState('');
  const guardar = useMutation({
    mutationFn: () => ajustarStockInsumo(i.id, { cantidad: Number(cantidad), nota: nota.trim() || undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['insumos'] }); avisar.ok('Stock actualizado'); onCerrar(); },
    onError: (e) => avisar.error(errorDe(e)),
  });
  return (
    <Hoja onCerrar={onCerrar} titulo={`Contar ${i.nombre}`} subtitulo={`El sistema dice ${Number(i.stock ?? 0)} ${UNIDADES[i.unidad_medida]}`} ancho="max-w-sm"
      pie={<button data-principal className="btn-aji w-full" disabled={cantidad === '' || guardar.isPending} onClick={() => guardar.mutate()}>Guardar conteo</button>}>
      <Campo etiqueta={`¿Cuánto hay? (${UNIDADES[i.unidad_medida]})`}><input autoFocus inputMode="decimal" className="campo h-14 text-3xl num font-bold text-center" value={cantidad} onChange={(e) => setCantidad(numero(e.target.value))} /></Campo>
      <Campo etiqueta="Nota" className="mt-3"><input className="campo" value={nota} onChange={(e) => setNota(e.target.value)} /></Campo>
    </Hoja>
  );
}

function Recetas({ insumos }) {
  const qc = useQueryClient();
  const productos = useQuery({ queryKey: ['productos', 'activos'], queryFn: () => getProductos() });
  const [pid, setPid] = useState('');
  const receta = useQuery({ queryKey: ['receta', pid], queryFn: () => getRecetaProducto(pid), enabled: !!pid });
  const [lineas, setLineas] = useState(null);
  const actuales = lineas ?? (receta.data ?? []).map((l) => ({ insumo_id: l.insumo_id, cantidad: String(Number(l.cantidad)), opcion_id: l.opcion_id ?? null }));
  const guardar = useMutation({
    mutationFn: () => guardarRecetaProducto(pid, actuales.filter((l) => l.insumo_id && Number(l.cantidad) > 0).map((l) => ({ ...l, cantidad: Number(l.cantidad) }))),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['receta', pid] }); setLineas(null); avisar.ok('Receta guardada'); },
    onError: (e) => avisar.error(errorDe(e)),
  });
  const set = (i, k, v) => setLineas(actuales.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  return (
    <div className="max-w-2xl">
      <p className="text-sm text-tenue mb-3">Cada vez que vendes el producto se descuentan estos insumos del stock.</p>
      <select className="campo mb-4" value={pid} onChange={(e) => { setPid(e.target.value); setLineas(null); }}>
        <option value="">Elige un producto…</option>
        {(productos.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
      </select>
      {pid && (receta.isLoading ? <Cargando /> : (
        <div className="ficha p-4 space-y-2">
          {actuales.map((l, i) => {
            const ins = insumos.find((x) => x.id === Number(l.insumo_id));
            return (
              <div key={i} className="flex gap-2 items-center">
                <select className="campo flex-1" value={l.insumo_id ?? ''} onChange={(e) => set(i, 'insumo_id', Number(e.target.value))}>
                  <option value="">Insumo…</option>{insumos.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
                </select>
                <input className="campo w-24 num" inputMode="decimal" value={l.cantidad} onChange={(e) => set(i, 'cantidad', numero(e.target.value))} />
                <span className="w-8 text-sm text-tenue">{ins ? UNIDADES[ins.unidad_medida] : ''}</span>
                <button className="btn-icono btn-fantasma h-9 w-9" onClick={() => setLineas(actuales.filter((_, j) => j !== i))} aria-label="Quitar"><Trash2 className="w-4 h-4" /></button>
              </div>
            );
          })}
          <div className="flex gap-2 pt-2">
            <button className="btn-fantasma" onClick={() => setLineas([...actuales, { insumo_id: '', cantidad: '', opcion_id: null }])}><Plus className="w-4 h-4" /> Insumo</button>
            {lineas && <button className="btn-aji ml-auto" disabled={guardar.isPending} onClick={() => guardar.mutate()}>Guardar receta</button>}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function InsumosPage() {
  const qc = useQueryClient();
  const { tiene } = usePermisos();
  const [tab, setTab] = useState('insumos');
  const [q, setQ] = useState('');
  const [hoja, setHoja] = useState(null);
  const [confirmacion, confirmar] = useConfirmar();
  const lista = useQuery({ queryKey: ['insumos'], queryFn: getInsumos, enabled: tiene('insumos', 'ver') });
  const quitar = useMutation({ mutationFn: (i) => desactivarInsumo(i.id), onSuccess: () => qc.invalidateQueries({ queryKey: ['insumos'] }), onError: (e) => avisar.error(errorDe(e)) });
  if (!tiene('insumos', 'ver')) return <SinPermiso />;
  const t = normalizar(q);
  const filas = (lista.data ?? []).filter((i) => i.activo !== 0 && (!t || normalizar(i.nombre).includes(t)));
  return (
    <Pagina>
      <Encabezado titulo="Insumos" texto="Ingredientes que compras y gastas en la cocina."
        acciones={<>
          <Segmentado valor={tab} onCambio={setTab} opciones={[{ valor: 'insumos', etiqueta: 'Insumos', Icono: Wheat }, { valor: 'recetas', etiqueta: 'Recetas', Icono: BookOpenCheck }]} />
          {tab === 'insumos' && tiene('insumos', 'crear') && <button className="btn-aji" onClick={() => setHoja({ tipo: 'nuevo' })}><Plus className="w-4 h-4" /> Nuevo</button>}
        </>} />
      {tab === 'recetas' ? <Recetas insumos={filas} /> : (
        <>
          <Buscador valor={q} onCambio={setQ} placeholder="Buscar insumo" className="mb-4 max-w-md" />
          {lista.isLoading ? <Cargando /> : filas.length === 0 ? <Vacio Icono={Wheat} titulo="Sin insumos" texto="Agrega carne, papa, aceite… para controlar su gasto." /> : (
            <ul className="ficha divide-y divide-linea">
              {filas.map((i) => (
                <li key={i.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0"><p className="font-semibold">{i.nombre}</p><p className="text-xs text-tenue">{i.unidad_medida}</p></div>
                  <span className="num text-xl font-bold">{Number(i.stock ?? 0).toLocaleString('es-BO', { maximumFractionDigits: 3 })} <span className="text-sm text-tenue font-normal">{UNIDADES[i.unidad_medida]}</span></span>
                  {tiene('insumos', 'editar') && <button className="btn-icono btn-fantasma" title="Contar" onClick={() => setHoja({ tipo: 'conteo', i })}><ClipboardCheck className="w-4 h-4" /></button>}
                  {tiene('insumos', 'editar') && <button className="btn-icono btn-fantasma" onClick={() => setHoja({ tipo: 'editar', i })} aria-label="Editar"><Pencil className="w-4 h-4" /></button>}
                  {tiene('insumos', 'eliminar') && <button className="btn-icono btn-fantasma" aria-label="Quitar" onClick={async () => { if (await confirmar({ titulo: `¿Quitar ${i.nombre}?`, texto: 'Se desactiva y deja de aparecer.', confirmar: 'Quitar', peligro: true })) quitar.mutate(i); }}><Trash2 className="w-4 h-4" /></button>}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {hoja?.tipo === 'nuevo' && <HojaInsumo onCerrar={() => setHoja(null)} />}
      {hoja?.tipo === 'editar' && <HojaInsumo i={hoja.i} onCerrar={() => setHoja(null)} />}
      {hoja?.tipo === 'conteo' && <HojaConteo i={hoja.i} onCerrar={() => setHoja(null)} />}
      {confirmacion}
    </Pagina>
  );
}
