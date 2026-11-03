import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Package, Scale, ImageOff, GripVertical, Trash2, Archive } from 'lucide-react';
import { getProductos, crearProducto, actualizarProducto, eliminarProducto, actualizarDisponibilidad } from '../../api/productos';
import { getCategorias } from '../../api/categorias';
import { getGruposOpciones } from '../../api/gruposOpciones';
import { usePermisos } from '../../hooks/usePermisos';
import { useMoneda } from '../../hooks/useConfig';
import Hoja from '../../components/ui/Hoja';
import { Buscador, Cargando, Campo, Encabezado, Interruptor, Pagina, SinPermiso, Vacio, Insignia, Segmentado, useConfirmar } from '../../components/ui/piezas';
import { SubirImagen, urlImagen, numero, useCampos } from '../../components/ui/formulario';
import { avisar } from '../../components/ui/Aviso';
import { cx, dinero, errorDe, normalizar } from '../../lib/util';

function HojaProducto({ producto, categorias, grupos, onCerrar }) {
  const qc = useQueryClient();
  const nuevo = !producto;
  const { f, campo, poner } = useCampos({
    nombre: producto?.nombre ?? '',
    categoria_id: producto?.categoria_id ?? categorias[0]?.id ?? '',
    precio: producto ? String(Number(producto.precio)) : '',
    es_pesable: !!producto?.es_pesable,
    es_vendible: producto ? !!producto.es_vendible : true,
    imagen: producto?.imagen?.replace(/^https?:\/\/[^/]+/, '') ?? null,
    controla_stock: producto ? producto.stock != null : false,
    stock: '',
    grupos_opciones: (producto?.grupos_opciones ?? []).map((g) => ({ id: g.id, obligatorio: g.obligatorio })),
  });

  const guardar = useMutation({
    mutationFn: () => {
      const datos = {
        nombre: f.nombre.trim(), categoria_id: Number(f.categoria_id), precio: Number(f.precio),
        es_pesable: f.es_pesable ? 1 : 0, es_vendible: f.es_vendible ? 1 : 0, imagen: f.imagen,
        grupos_opciones: f.grupos_opciones.map((g, i) => ({ ...g, orden: i })),
      };
      if (nuevo) {
        if (f.controla_stock) datos.stock = Number(f.stock || 0);
        return crearProducto(datos);
      }
      return actualizarProducto(producto.id, datos);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['productos'] });
      qc.invalidateQueries({ queryKey: ['productos-pos'] });
      avisar.ok(nuevo ? 'Producto creado' : 'Cambios guardados');
      onCerrar();
    },
    onError: (e) => avisar.error(errorDe(e)),
  });

  const disponibles = grupos.filter((g) => !f.grupos_opciones.some((x) => x.id === g.id));
  const valido = f.nombre.trim() && f.categoria_id && Number(f.precio) >= 0 && f.precio !== '';

  return (
    <Hoja onCerrar={onCerrar} titulo={nuevo ? 'Nuevo producto' : producto.nombre} ancho="max-w-2xl"
      pie={<><button className="btn-suave" onClick={onCerrar}>Cancelar</button><button data-principal className="btn-aji" disabled={!valido || guardar.isPending} onClick={() => guardar.mutate()}>{nuevo ? 'Crear producto' : 'Guardar cambios'}</button></>}>
      <div className="grid sm:grid-cols-[160px_1fr] gap-5">
        <SubirImagen className="w-40 h-40" valor={f.imagen} onCambio={(v) => poner('imagen', v)} />
        <div className="space-y-3">
          <Campo etiqueta="Nombre"><input className="campo" autoFocus={nuevo} {...campo('nombre')} placeholder="Ej.: Silpancho" /></Campo>
          <div className="grid grid-cols-2 gap-3">
            <Campo etiqueta="Categoría">
              <select className="campo" {...campo('categoria_id')}>
                {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </Campo>
            <Campo etiqueta={f.es_pesable ? 'Precio por kilo' : 'Precio'}><input className="campo num" inputMode="decimal" {...campo('precio', numero)} /></Campo>
          </div>
        </div>
      </div>
      <div className="mt-5 grid sm:grid-cols-2 gap-4">
        <Interruptor activo={f.es_vendible} onCambio={(v) => poner('es_vendible', v)} etiqueta="Se vende en caja" descripcion="Apágalo para ingredientes que solo usas en recetas o combos." />
        <Interruptor activo={f.es_pesable} onCambio={(v) => poner('es_pesable', v)} etiqueta="Se vende por peso" descripcion="Al venderlo se pide cuántos kilos." />
        {nuevo && <Interruptor activo={f.controla_stock} onCambio={(v) => poner('controla_stock', v)} etiqueta="Controlar stock" descripcion="Para bebidas y productos contables. La comida preparada no lo necesita." />}
        {nuevo && f.controla_stock && <Campo etiqueta="Stock inicial"><input className="campo num" inputMode="numeric" {...campo('stock', (v) => v.replace(/\D/g, ''))} /></Campo>}
      </div>

      <div className="mt-6">
        <p className="font-display font-semibold">Opciones al venderlo</p>
        <p className="text-[13px] text-tenue mb-3">Ej.: “Punto de la carne”, “Tamaño”. Se preguntan al agregarlo a la comanda.</p>
        <ul className="space-y-2">
          {f.grupos_opciones.map((g, i) => {
            const grupo = grupos.find((x) => x.id === g.id);
            return (
              <li key={g.id} className="flex items-center gap-3 rounded-xl border border-linea px-3 py-2">
                <GripVertical className="w-4 h-4 text-tenue" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium">{grupo?.nombre ?? 'Grupo'}</p>
                  <p className="text-xs text-tenue truncate">{grupo?.opciones?.map((o) => o.nombre).join(', ')}</p>
                </div>
                <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={g.obligatorio} onChange={(e) => poner('grupos_opciones', f.grupos_opciones.map((x, j) => (j === i ? { ...x, obligatorio: e.target.checked } : x)))} /> Obligatorio</label>
                <button className="btn-icono btn-fantasma h-8 w-8" onClick={() => poner('grupos_opciones', f.grupos_opciones.filter((_, j) => j !== i))} aria-label="Quitar grupo"><Trash2 className="w-4 h-4" /></button>
              </li>
            );
          })}
        </ul>
        {disponibles.length > 0 && (
          <select className="campo mt-2" value="" onChange={(e) => e.target.value && poner('grupos_opciones', [...f.grupos_opciones, { id: Number(e.target.value), obligatorio: true }])}>
            <option value="">+ Agregar grupo de opciones…</option>
            {disponibles.map((g) => <option key={g.id} value={g.id}>{g.nombre}</option>)}
          </select>
        )}
      </div>
    </Hoja>
  );
}

export default function ProductosPage() {
  const qc = useQueryClient();
  const moneda = useMoneda();
  const { tiene } = usePermisos();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('todas');
  const [vista, setVista] = useState('activos');
  const [editar, setEditar] = useState(null); // producto | 'nuevo'
  const [confirmacion, confirmar] = useConfirmar();

  const productos = useQuery({ queryKey: ['productos', vista], queryFn: () => getProductos(vista === 'inactivos' ? { solo_inactivos: true } : {}), enabled: tiene('productos', 'ver') || tiene('inventario', 'ver') });
  const categorias = useQuery({ queryKey: ['categorias'], queryFn: getCategorias });
  const grupos = useQuery({ queryKey: ['grupos-opciones'], queryFn: getGruposOpciones });

  const disp = useMutation({
    mutationFn: (p) => actualizarDisponibilidad(p.id, p.disponible_hoy ? 0 : 1),
    onSuccess: (_r, p) => { qc.invalidateQueries({ queryKey: ['productos'] }); qc.invalidateQueries({ queryKey: ['productos-pos'] }); avisar.ok(p.disponible_hoy ? `${p.nombre}: agotado por hoy` : `${p.nombre}: disponible otra vez`); },
    onError: (e) => avisar.error(errorDe(e)),
  });
  const reactivar = useMutation({ mutationFn: (p) => actualizarProducto(p.id, { activo: 1 }), onSuccess: () => qc.invalidateQueries({ queryKey: ['productos'] }), onError: (e) => avisar.error(errorDe(e)) });
  const borrar = useMutation({
    mutationFn: (p) => eliminarProducto(p.id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['productos'] }); avisar.ok('Listo'); },
    onError: (e) => avisar.error(errorDe(e)),
  });

  const lista = useMemo(() => {
    const t = normalizar(q.trim());
    return (productos.data ?? []).filter((p) => (cat === 'todas' || p.categoria_id === cat) && (!t || normalizar(p.nombre).includes(t)));
  }, [productos.data, q, cat]);

  if (!tiene('productos', 'ver') && !tiene('inventario', 'ver')) return <SinPermiso />;

  return (
    <Pagina>
      <Encabezado titulo="Productos" texto={`${(productos.data ?? []).length} ${vista === 'inactivos' ? 'desactivados' : 'en el menú'}`}
        acciones={tiene('productos', 'crear') && <button className="btn-aji" onClick={() => setEditar('nuevo')}><Plus className="w-4 h-4" /> Nuevo producto</button>} />
      <div className="flex flex-wrap gap-3 mb-4">
        <Buscador valor={q} onCambio={setQ} placeholder="Buscar producto" className="flex-1 min-w-[220px]" />
        <select className="campo w-auto" value={cat} onChange={(e) => setCat(e.target.value === 'todas' ? 'todas' : Number(e.target.value))}>
          <option value="todas">Todas las categorías</option>
          {(categorias.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        <Segmentado valor={vista} onCambio={setVista} opciones={[{ valor: 'activos', etiqueta: 'Activos' }, { valor: 'inactivos', etiqueta: 'Desactivados' }]} />
      </div>
      {productos.isLoading ? <Cargando /> : lista.length === 0 ? (
        <Vacio Icono={Package} titulo={q ? 'Ningún producto coincide' : 'No hay productos aquí'} texto={!q && vista === 'activos' ? 'Crea tu primer producto para empezar a vender.' : undefined} />
      ) : (
        <ul className="ficha divide-y divide-linea overflow-hidden">
          {lista.map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-3 sm:px-4 py-2.5">
              <div className="w-12 h-12 rounded-xl bg-hundido overflow-hidden shrink-0 grid place-items-center">
                {p.imagen ? <img src={urlImagen(p.imagen)} alt="" className="w-full h-full object-cover" loading="lazy" /> : <ImageOff className="w-5 h-5 text-linea" />}
              </div>
              <button className="flex-1 min-w-0 text-left" onClick={() => tiene('productos', 'editar') && setEditar(p)}>
                <p className="font-semibold truncate">{p.nombre}</p>
                <p className="text-xs text-tenue flex flex-wrap gap-x-2">
                  <span>{p.categoria?.nombre}</span>
                  {p.stock != null && <span className={cx(p.stock <= 5 && 'text-locoto font-semibold')}>Stock {p.stock}</span>}
                  {p.grupos_opciones?.length > 0 && <span>{p.grupos_opciones.length} grupo(s) de opciones</span>}
                  {!p.es_vendible && <span>Solo insumo</span>}
                </p>
              </button>
              {p.es_pesable ? <Insignia><Scale className="w-3 h-3" /> kg</Insignia> : null}
              <span className="num font-bold w-24 text-right">{dinero(p.precio, moneda)}</span>
              {vista === 'activos' ? (
                tiene('productos', 'disponibilidad') && (
                  <button onClick={() => disp.mutate(p)} className={cx('chip h-8 px-3 shrink-0', p.disponible_hoy ? 'bg-hierba/15 text-hierba' : 'bg-locoto text-white')} title="Cambiar disponibilidad de hoy">
                    {p.disponible_hoy ? 'Hay' : 'Agotado'}
                  </button>
                )
              ) : (
                tiene('productos', 'editar') && <button className="btn-suave h-8 text-xs" onClick={() => reactivar.mutate(p)}>Reactivar</button>
              )}
              {vista === 'activos' && tiene('productos', 'eliminar') && (
                <button className="btn-icono btn-fantasma h-9 w-9 hidden sm:inline-flex" aria-label="Eliminar" onClick={async () => {
                  const ok = await confirmar({
                    titulo: p.tiene_ventas ? `¿Desactivar ${p.nombre}?` : `¿Eliminar ${p.nombre}?`,
                    texto: p.tiene_ventas ? 'Tiene ventas registradas, así que se desactiva en vez de borrarse. Puedes reactivarlo después.' : 'Se borra definitivamente.',
                    confirmar: p.tiene_ventas ? 'Desactivar' : 'Eliminar', peligro: true,
                  });
                  if (ok) borrar.mutate(p);
                }}>{p.tiene_ventas ? <Archive className="w-4 h-4" /> : <Trash2 className="w-4 h-4" />}</button>
              )}
            </li>
          ))}
        </ul>
      )}
      {editar && <HojaProducto producto={editar === 'nuevo' ? null : editar} categorias={categorias.data ?? []} grupos={grupos.data ?? []} onCerrar={() => setEditar(null)} />}
      {confirmacion}
    </Pagina>
  );
}
