import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Layers, Pencil, Trash2 } from 'lucide-react';
import { getCategorias, crearCategoria, actualizarCategoria, eliminarCategoria } from '../../api/categorias';
import { getProductos } from '../../api/productos';
import { usePermisos } from '../../hooks/usePermisos';
import Hoja from '../../components/ui/Hoja';
import { Cargando, Campo, Encabezado, Interruptor, Pagina, SinPermiso, Vacio, useConfirmar } from '../../components/ui/piezas';
import { SubirImagen, urlImagen } from '../../components/ui/formulario';
import { avisar } from '../../components/ui/Aviso';
import { cx, errorDe } from '../../lib/util';

function HojaCategoria({ cat, onCerrar }) {
  const qc = useQueryClient();
  const [nombre, setNombre] = useState(cat?.nombre ?? '');
  const [imagen, setImagen] = useState(cat?.imagen ?? null);
  const [activo, setActivo] = useState(cat ? !!cat.activo : true);
  const guardar = useMutation({
    mutationFn: () => (cat ? actualizarCategoria(cat.id, { nombre: nombre.trim(), imagen, activo: activo ? 1 : 0 }) : crearCategoria({ nombre: nombre.trim(), imagen })),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['categorias'] }); avisar.ok(cat ? 'Categoría guardada' : 'Categoría creada'); onCerrar(); },
    onError: (e) => avisar.error(errorDe(e)),
  });
  return (
    <Hoja onCerrar={onCerrar} titulo={cat ? 'Editar categoría' : 'Nueva categoría'} ancho="max-w-md"
      pie={<button data-principal className="btn-aji w-full" disabled={!nombre.trim() || guardar.isPending} onClick={() => guardar.mutate()}>Guardar</button>}>
      <div className="flex gap-4 items-start">
        <SubirImagen className="w-24 h-24 shrink-0" valor={imagen} onCambio={setImagen} />
        <div className="flex-1 space-y-4">
          <Campo etiqueta="Nombre"><input autoFocus className="campo" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej.: Bebidas" /></Campo>
          {cat && <Interruptor activo={activo} onCambio={setActivo} etiqueta="Visible en la caja" />}
        </div>
      </div>
    </Hoja>
  );
}

export default function CategoriasPage() {
  const qc = useQueryClient();
  const { tiene } = usePermisos();
  const [editar, setEditar] = useState(null);
  const [confirmacion, confirmar] = useConfirmar();
  const cats = useQuery({ queryKey: ['categorias'], queryFn: getCategorias });
  const prods = useQuery({ queryKey: ['productos', 'activos'], queryFn: () => getProductos() });
  const borrar = useMutation({ mutationFn: (c) => eliminarCategoria(c.id), onSuccess: () => { qc.invalidateQueries({ queryKey: ['categorias'] }); avisar.ok('Categoría eliminada'); }, onError: (e) => avisar.error(errorDe(e)) });

  if (!tiene('productos', 'ver')) return <SinPermiso />;
  const cuenta = (id) => (prods.data ?? []).filter((p) => p.categoria_id === id).length;

  return (
    <Pagina>
      <Encabezado titulo="Categorías" texto="Agrupan los productos en la pantalla de venta."
        acciones={tiene('productos', 'crear') && <button className="btn-aji" onClick={() => setEditar('nueva')}><Plus className="w-4 h-4" /> Nueva categoría</button>} />
      {cats.isLoading ? <Cargando /> : (cats.data ?? []).length === 0 ? <Vacio Icono={Layers} titulo="Sin categorías" texto="Crea la primera, por ejemplo “Platos” o “Bebidas”." /> : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {cats.data.map((c) => (
            <div key={c.id} className={cx('ficha overflow-hidden group', !c.activo && 'opacity-55')}>
              <div className="aspect-[16/9] bg-hundido">
                {c.imagen ? <img src={urlImagen(c.imagen)} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full grid place-items-center font-display font-extrabold text-4xl text-linea">{c.nombre[0]}</div>}
              </div>
              <div className="p-3 flex items-center gap-1">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{c.nombre}</p>
                  <p className="text-xs text-tenue">{cuenta(c.id)} productos{!c.activo ? ' · oculta' : ''}</p>
                </div>
                {tiene('productos', 'editar') && <button className="btn-icono btn-fantasma h-8 w-8" onClick={() => setEditar(c)} aria-label="Editar"><Pencil className="w-4 h-4" /></button>}
                {tiene('productos', 'eliminar') && <button className="btn-icono btn-fantasma h-8 w-8" aria-label="Eliminar" onClick={async () => { if (await confirmar({ titulo: `¿Eliminar ${c.nombre}?`, texto: 'Solo se puede si no tiene productos.', confirmar: 'Eliminar', peligro: true })) borrar.mutate(c); }}><Trash2 className="w-4 h-4" /></button>}
              </div>
            </div>
          ))}
        </div>
      )}
      {editar && <HojaCategoria cat={editar === 'nueva' ? null : editar} onCerrar={() => setEditar(null)} />}
      {confirmacion}
    </Pagina>
  );
}
