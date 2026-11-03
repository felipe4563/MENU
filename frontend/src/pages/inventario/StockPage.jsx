import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Boxes, ArrowDownToLine, ArrowUpFromLine, ClipboardCheck, History } from 'lucide-react';
import { getProductos } from '../../api/productos';
import { getInventario, registrarEntrada, registrarSalida, registrarAjuste } from '../../api/inventario';
import { usePermisos } from '../../hooks/usePermisos';
import Hoja from '../../components/ui/Hoja';
import { Buscador, Cargando, Campo, Encabezado, Pagina, Segmentado, SinPermiso, Vacio, Insignia } from '../../components/ui/piezas';
import { avisar } from '../../components/ui/Aviso';
import { cx, errorDe, fechaHora, normalizar } from '../../lib/util';

const TIPO = { entrada: 'Entrada', salida: 'Salida', venta: 'Venta', compra: 'Compra', ajuste: 'Conteo' };

function HojaMover({ producto, onCerrar }) {
  const qc = useQueryClient();
  const { tiene } = usePermisos();
  const opciones = [
    tiene('inventario', 'entrada') && { valor: 'entrada', etiqueta: 'Entra', Icono: ArrowDownToLine },
    tiene('inventario', 'salida') && { valor: 'salida', etiqueta: 'Sale', Icono: ArrowUpFromLine },
    tiene('inventario', 'ajustar') && { valor: 'ajuste', etiqueta: 'Conté', Icono: ClipboardCheck },
  ].filter(Boolean);
  const [tipo, setTipo] = useState(opciones[0]?.valor);
  const [cantidad, setCantidad] = useState('');
  const [nota, setNota] = useState('');
  const n = parseInt(cantidad, 10) || 0;
  const resultado = tipo === 'entrada' ? producto.stock + n : tipo === 'salida' ? producto.stock - n : n;
  const guardar = useMutation({
    mutationFn: () => ({ entrada: registrarEntrada, salida: registrarSalida, ajuste: registrarAjuste })[tipo]({ producto_id: producto.id, cantidad: n, nota: nota.trim() || undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['productos'] }); qc.invalidateQueries({ queryKey: ['inventario'] }); qc.invalidateQueries({ queryKey: ['productos-pos'] }); avisar.ok('Stock actualizado'); onCerrar(); },
    onError: (e) => avisar.error(errorDe(e)),
  });
  return (
    <Hoja onCerrar={onCerrar} titulo={producto.nombre} subtitulo={`Hay ${producto.stock} ahora`} ancho="max-w-sm"
      pie={<button data-principal className="btn-aji w-full" disabled={cantidad === '' || (tipo !== 'ajuste' && n <= 0) || resultado < 0 || guardar.isPending} onClick={() => guardar.mutate()}>Guardar · quedan {resultado}</button>}>
      <Segmentado className="w-full mb-4" valor={tipo} onCambio={setTipo} opciones={opciones} />
      <Campo etiqueta={tipo === 'ajuste' ? '¿Cuántos contaste?' : '¿Cuántos?'}><input autoFocus inputMode="numeric" className="campo h-14 text-3xl num font-bold text-center" value={cantidad} onChange={(e) => setCantidad(e.target.value.replace(/\D/g, ''))} /></Campo>
      <Campo etiqueta="Nota" className="mt-3"><input className="campo" value={nota} onChange={(e) => setNota(e.target.value)} placeholder={tipo === 'salida' ? 'Ej.: se rompió una botella' : ''} /></Campo>
    </Hoja>
  );
}

export default function StockPage() {
  const { tiene } = usePermisos();
  const [q, setQ] = useState('');
  const [vista, setVista] = useState('stock');
  const [mover, setMover] = useState(null);
  const productos = useQuery({ queryKey: ['productos', 'activos'], queryFn: () => getProductos(), enabled: tiene('inventario', 'ver') || tiene('productos', 'ver') });
  const movs = useQuery({ queryKey: ['inventario'], queryFn: () => getInventario(), enabled: vista === 'movimientos' && tiene('inventario', 'ver') });
  const lista = useMemo(() => {
    const t = normalizar(q);
    return (productos.data ?? []).filter((p) => p.stock != null && (!t || normalizar(p.nombre).includes(t))).sort((a, b) => a.stock - b.stock);
  }, [productos.data, q]);
  if (!tiene('inventario', 'ver') && !tiene('inventario', 'ajustar')) return <SinPermiso />;
  const puedeMover = tiene('inventario', 'entrada') || tiene('inventario', 'salida') || tiene('inventario', 'ajustar');

  return (
    <Pagina>
      <Encabezado titulo="Stock" texto="Productos que se cuentan por unidad (bebidas, empaquetados). La comida preparada no lleva stock."
        acciones={<Segmentado valor={vista} onCambio={setVista} opciones={[{ valor: 'stock', etiqueta: 'Existencias', Icono: Boxes }, { valor: 'movimientos', etiqueta: 'Movimientos', Icono: History }]} />} />
      {vista === 'stock' ? (
        <>
          <Buscador valor={q} onCambio={setQ} placeholder="Buscar producto" className="mb-4 max-w-md" />
          {productos.isLoading ? <Cargando /> : lista.length === 0 ? <Vacio Icono={Boxes} titulo="Ningún producto controla stock" texto="Actívalo al crear un producto en Menú › Productos." /> : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {lista.map((p) => (
                <button key={p.id} disabled={!puedeMover} onClick={() => setMover(p)} className={cx('ficha p-4 text-left hover:border-tinta/40 transition', p.stock <= 0 ? 'border-locoto/50' : p.stock <= 5 && 'border-aji')}>
                  <p className="font-semibold truncate">{p.nombre}</p>
                  <p className="text-xs text-tenue">{p.categoria?.nombre}</p>
                  <div className="flex items-end justify-between mt-3">
                    <span className={cx('num text-3xl font-extrabold', p.stock <= 0 && 'text-locoto')}>{p.stock}</span>
                    {p.stock <= 0 ? <Insignia tono="peligro">Sin stock</Insignia> : p.stock <= 5 ? <Insignia tono="alerta">Poco</Insignia> : null}
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      ) : movs.isLoading ? <Cargando /> : (movs.data ?? []).length === 0 ? <Vacio titulo="Sin movimientos" /> : (
        <ul className="ficha divide-y divide-linea">
          {movs.data.map((m) => (
            <li key={m.id} className="flex items-center gap-3 px-4 py-3 text-sm">
              <Insignia tono={['entrada', 'compra'].includes(m.tipo) ? 'ok' : m.tipo === 'ajuste' ? 'info' : 'neutro'}>{TIPO[m.tipo] ?? m.tipo}</Insignia>
              <div className="flex-1 min-w-0"><p className="font-medium truncate">{m.producto?.nombre}</p><p className="text-xs text-tenue">{fechaHora(m.creado_en)} · {m.usuario?.nombre}{m.nota ? ` · ${m.nota}` : ''}</p></div>
              <span className="num text-tenue">{m.stock_anterior} → <b className="text-tinta">{m.stock_nuevo}</b></span>
            </li>
          ))}
        </ul>
      )}
      {mover && <HojaMover producto={mover} onCerrar={() => setMover(null)} />}
    </Pagina>
  );
}
