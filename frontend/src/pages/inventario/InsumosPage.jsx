import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Plus, Wheat, Pencil, ClipboardCheck, ScrollText, Trash2 } from 'lucide-react';
import { getInsumos, crearInsumo, actualizarInsumo, desactivarInsumo, ajustarStockInsumo } from '../../api/insumos';
import { usePermisos } from '../../hooks/usePermisos';
import Hoja from '../../components/ui/Hoja';
import { Buscador, Cargando, Campo, Encabezado, Pagina, SinPermiso, Vacio, useConfirmar } from '../../components/ui/piezas';
import { numero } from '../../components/ui/formulario';
import { avisar } from '../../components/ui/Aviso';
import { errorDe, normalizar } from '../../lib/util';

const UNIDADES = { kilogramo: 'kg', gramo: 'g', litro: 'L', mililitro: 'ml', arroba: '@', libra: 'lb', unidad: 'u' };

// Llegó a su mínimo: en la sucursal propia o, viendo todas, en alguna de ellas.
function bajoMinimo(i) {
  if (i.stock_minimo == null) return false;
  const min = Number(i.stock_minimo);
  if (i.stock_por_sucursal) return i.stock_por_sucursal.some((s) => Number(s.stock) <= min);
  return Number(i.stock ?? 0) <= min;
}

function HojaInsumo({ i, onCerrar }) {
  const qc = useQueryClient();
  const [nombre, setNombre] = useState(i?.nombre ?? '');
  const [unidad, setUnidad] = useState(i?.unidad_medida ?? 'kilogramo');
  const [minimo, setMinimo] = useState(i?.stock_minimo != null ? String(Number(i.stock_minimo)) : '');
  const guardar = useMutation({
    mutationFn: () => {
      const datos = { nombre: nombre.trim(), unidad_medida: unidad, stock_minimo: minimo.trim() === '' ? null : minimo };
      return i ? actualizarInsumo(i.id, datos) : crearInsumo(datos);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['insumos'] }); avisar.ok('Insumo guardado'); onCerrar(); },
    onError: (e) => avisar.error(errorDe(e)),
  });
  return (
    <Hoja onCerrar={onCerrar} titulo={i ? 'Editar insumo' : 'Nuevo insumo'} ancho="max-w-sm"
      pie={<button data-principal className="btn-aji w-full" disabled={!nombre.trim() || guardar.isPending} onClick={() => guardar.mutate()}>Guardar</button>}>
      <div className="space-y-3">
        <Campo etiqueta="Nombre"><input autoFocus className="campo" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej.: Carne de res" /></Campo>
        <Campo etiqueta="Se mide en"><select className="campo" value={unidad} onChange={(e) => setUnidad(e.target.value)}>{Object.keys(UNIDADES).map((u) => <option key={u} value={u}>{u}</option>)}</select></Campo>
        <Campo etiqueta={`Stock mínimo (${UNIDADES[unidad]})`} ayuda="Al llegar a este número, el inicio avisa que hay que comprar. Vacío: sin mínimo.">
          <input inputMode="decimal" className="campo num" value={minimo} onChange={(e) => setMinimo(numero(e.target.value))} placeholder="Sin mínimo" />
        </Campo>
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

export default function InsumosPage() {
  const qc = useQueryClient();
  const { tiene } = usePermisos();
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
      <Encabezado titulo="Insumos" texto={<>Ingredientes que compras y gastas en la cocina. Cuánto lleva cada plato se carga en su receta, en <Link to="/menu/productos" className="underline">Menú › Productos</Link>.</>}
        acciones={tiene('insumos', 'crear') && <button className="btn-aji" onClick={() => setHoja({ tipo: 'nuevo' })}><Plus className="w-4 h-4" /> Nuevo</button>} />
        <>
          <Buscador valor={q} onCambio={setQ} placeholder="Buscar insumo" className="mb-4 max-w-md" />
          {lista.isLoading ? <Cargando /> : filas.length === 0 ? <Vacio Icono={Wheat} titulo="Sin insumos" texto="Agrega carne, papa, aceite… para controlar su gasto." /> : (
            <ul className="ficha divide-y divide-linea">
              {filas.map((i) => (
                <li key={i.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold">{i.nombre}</p>
                    <p className="text-xs text-tenue">
                      {i.unidad_medida}
                      {i.stock_minimo != null && <> · mínimo {Number(i.stock_minimo).toLocaleString('es-BO', { maximumFractionDigits: 3 })} {UNIDADES[i.unidad_medida]}</>}
                    </p>
                  </div>
                  {bajoMinimo(i) && <span className="rounded-full bg-locoto/10 text-locoto text-xs font-semibold px-2 py-0.5 shrink-0">Comprar</span>}
                  <span className="num text-xl font-bold">{Number(i.stock ?? 0).toLocaleString('es-BO', { maximumFractionDigits: 3 })} <span className="text-sm text-tenue font-normal">{UNIDADES[i.unidad_medida]}</span></span>
                  <Link className="btn-icono btn-fantasma" title="Kardex" aria-label={`Kardex de ${i.nombre}`} to={`/inventario/kardex?ver=insumo-${i.id}`}><ScrollText className="w-4 h-4" /></Link>
                  {tiene('insumos', 'editar') && <button className="btn-icono btn-fantasma" title="Contar" onClick={() => setHoja({ tipo: 'conteo', i })}><ClipboardCheck className="w-4 h-4" /></button>}
                  {tiene('insumos', 'editar') && <button className="btn-icono btn-fantasma" onClick={() => setHoja({ tipo: 'editar', i })} aria-label="Editar"><Pencil className="w-4 h-4" /></button>}
                  {tiene('insumos', 'eliminar') && <button className="btn-icono btn-fantasma" aria-label="Quitar" onClick={async () => { if (await confirmar({ titulo: `¿Quitar ${i.nombre}?`, texto: 'Se desactiva y deja de aparecer.', confirmar: 'Quitar', peligro: true })) quitar.mutate(i); }}><Trash2 className="w-4 h-4" /></button>}
                </li>
              ))}
            </ul>
          )}
        </>
      {hoja?.tipo === 'nuevo' && <HojaInsumo onCerrar={() => setHoja(null)} />}
      {hoja?.tipo === 'editar' && <HojaInsumo i={hoja.i} onCerrar={() => setHoja(null)} />}
      {hoja?.tipo === 'conteo' && <HojaConteo i={hoja.i} onCerrar={() => setHoja(null)} />}
      {confirmacion}
    </Pagina>
  );
}
