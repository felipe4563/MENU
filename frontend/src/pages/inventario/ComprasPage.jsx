import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, ShoppingCart, PackageCheck, Trash2 } from 'lucide-react';
import { getCompras, crearCompra, recibirCompra, getProveedores } from '../../api/compras';
import { getProductos } from '../../api/productos';
import { getInsumos } from '../../api/insumos';
import { usePermisos } from '../../hooks/usePermisos';
import { useMoneda } from '../../hooks/useConfig';
import Hoja from '../../components/ui/Hoja';
import { Cargando, Campo, Encabezado, Pagina, Segmentado, SinPermiso, Vacio, Insignia, useConfirmar } from '../../components/ui/piezas';
import { numero } from '../../components/ui/formulario';
import { avisar } from '../../components/ui/Aviso';
import { dinero, errorDe, fechaCorta } from '../../lib/util';

function HojaCompra({ onCerrar }) {
  const qc = useQueryClient();
  const moneda = useMoneda();
  const proveedores = useQuery({ queryKey: ['proveedores'], queryFn: getProveedores });
  const productos = useQuery({ queryKey: ['productos', 'activos'], queryFn: () => getProductos() });
  const insumos = useQuery({ queryKey: ['insumos'], queryFn: getInsumos });
  const [proveedor, setProveedor] = useState('');
  const [notas, setNotas] = useState('');
  const [items, setItems] = useState([{ clave: '', cantidad: '', costo_unitario: '' }]);
  const set = (i, k, v) => setItems(items.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const validos = items.filter((x) => x.clave && Number(x.cantidad) > 0 && Number(x.costo_unitario) >= 0 && x.costo_unitario !== '');
  const total = validos.reduce((s, x) => s + Number(x.cantidad) * Number(x.costo_unitario), 0);
  const guardar = useMutation({
    mutationFn: () => crearCompra({
      proveedor_id: Number(proveedor), notas: notas.trim() || undefined,
      items: validos.map((x) => { const [t, id] = x.clave.split(':'); return { [t === 'p' ? 'producto_id' : 'insumo_id']: Number(id), cantidad: Number(x.cantidad), costo_unitario: Number(x.costo_unitario) }; }),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['compras'] }); avisar.ok('Compra registrada. Márcala como recibida cuando llegue.'); onCerrar(); },
    onError: (e) => avisar.error(errorDe(e)),
  });
  const conStock = (productos.data ?? []).filter((p) => p.stock != null);
  return (
    <Hoja onCerrar={onCerrar} titulo="Nueva compra" ancho="max-w-2xl"
      pie={<><span className="mr-auto num text-xl font-extrabold self-center">{dinero(total, moneda)}</span><button data-principal className="btn-aji" disabled={!proveedor || !validos.length || guardar.isPending} onClick={() => guardar.mutate()}>Registrar compra</button></>}>
      <div className="space-y-4">
        <Campo etiqueta="Proveedor">
          <select className="campo" value={proveedor} onChange={(e) => setProveedor(e.target.value)}>
            <option value="">Elige…</option>{(proveedores.data ?? []).filter((p) => p.activo !== 0).map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </Campo>
        <div>
          <div className="grid grid-cols-[1fr_90px_110px_36px] gap-2 text-[13px] text-tenue mb-1 px-1"><span>Qué</span><span>Cantidad</span><span>Costo c/u</span><span /></div>
          {items.map((x, i) => (
            <div key={i} className="grid grid-cols-[1fr_90px_110px_36px] gap-2 mb-2">
              <select className="campo" value={x.clave} onChange={(e) => set(i, 'clave', e.target.value)}>
                <option value="">Elige…</option>
                {(insumos.data ?? []).length > 0 && <optgroup label="Insumos">{insumos.data.filter((x2) => x2.activo !== 0).map((s) => <option key={`i${s.id}`} value={`i:${s.id}`}>{s.nombre} ({s.unidad_medida})</option>)}</optgroup>}
                {conStock.length > 0 && <optgroup label="Productos con stock">{conStock.map((p) => <option key={`p${p.id}`} value={`p:${p.id}`}>{p.nombre}</option>)}</optgroup>}
              </select>
              <input className="campo num" inputMode="decimal" value={x.cantidad} onChange={(e) => set(i, 'cantidad', numero(e.target.value))} />
              <input className="campo num" inputMode="decimal" value={x.costo_unitario} onChange={(e) => set(i, 'costo_unitario', numero(e.target.value))} />
              <button className="btn-icono btn-fantasma h-11 w-9" onClick={() => setItems(items.filter((_, j) => j !== i))} aria-label="Quitar"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
          <button className="btn-fantasma" onClick={() => setItems([...items, { clave: '', cantidad: '', costo_unitario: '' }])}><Plus className="w-4 h-4" /> Otra línea</button>
        </div>
        <Campo etiqueta="Notas"><input className="campo" value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Nº de factura, condiciones…" /></Campo>
      </div>
    </Hoja>
  );
}

export default function ComprasPage() {
  const qc = useQueryClient();
  const moneda = useMoneda();
  const { tiene } = usePermisos();
  const [vista, setVista] = useState('pendiente');
  const [nueva, setNueva] = useState(false);
  const [confirmacion, confirmar] = useConfirmar();
  const q = useQuery({ queryKey: ['compras'], queryFn: getCompras, enabled: tiene('compras', 'ver') });
  const recibir = useMutation({
    mutationFn: (c) => recibirCompra(c.id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['compras'] }); qc.invalidateQueries({ queryKey: ['insumos'] }); qc.invalidateQueries({ queryKey: ['productos'] }); avisar.ok('Recibida: el stock ya se sumó.'); },
    onError: (e) => avisar.error(errorDe(e)),
  });
  if (!tiene('compras', 'ver')) return <SinPermiso />;
  const todas = q.data ?? [];
  const lista = todas.filter((c) => c.estado === vista);
  return (
    <Pagina>
      <Encabezado titulo="Compras" texto="Pedidos a proveedores. Al recibirlos, el stock sube solo."
        acciones={<>
          <Segmentado valor={vista} onCambio={setVista} opciones={[{ valor: 'pendiente', etiqueta: 'Por recibir', cuenta: todas.filter((c) => c.estado === 'pendiente').length }, { valor: 'recibido', etiqueta: 'Recibidas' }]} />
          {tiene('compras', 'crear') && <button className="btn-aji" onClick={() => setNueva(true)}><Plus className="w-4 h-4" /> Nueva compra</button>}
        </>} />
      {q.isLoading ? <Cargando /> : lista.length === 0 ? <Vacio Icono={ShoppingCart} titulo={vista === 'pendiente' ? 'Nada por recibir' : 'Sin compras recibidas'} /> : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
          {lista.map((c) => (
            <article key={c.id} className="ficha p-4 flex flex-col">
              <div className="flex items-start gap-2">
                <div className="flex-1"><p className="font-display font-bold text-lg leading-tight">{c.proveedor?.nombre}</p><p className="text-xs text-tenue">#{c.id} · {fechaCorta(c.creado_en)}</p></div>
                <Insignia tono={c.estado === 'recibido' ? 'ok' : 'alerta'}>{c.estado === 'recibido' ? 'Recibida' : 'Por recibir'}</Insignia>
              </div>
              <ul className="text-sm mt-3 space-y-1 flex-1">
                {(c.detalles ?? []).map((d) => (
                  <li key={d.id} className="flex gap-2"><span className="num font-semibold">{Number(d.cantidad)}</span><span className="flex-1 truncate">{d.insumo?.nombre ?? d.producto?.nombre}</span><span className="num text-tenue">{dinero(d.subtotal, moneda)}</span></li>
                ))}
              </ul>
              {c.notas && <p className="text-xs text-tenue mt-2">{c.notas}</p>}
              <div className="flex items-center mt-3 pt-3 border-t border-linea">
                <span className="num text-xl font-extrabold flex-1">{dinero(c.total, moneda)}</span>
                {c.estado === 'pendiente' && tiene('compras', 'recibir') && (
                  <button className="btn-aji h-9" disabled={recibir.isPending} onClick={async () => { if (await confirmar({ titulo: '¿Llegó todo?', texto: 'Se suma al stock y se registra el gasto en el libro de caja.', confirmar: 'Sí, recibir' })) recibir.mutate(c); }}><PackageCheck className="w-4 h-4" /> Recibir</button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
      {nueva && <HojaCompra onCerrar={() => setNueva(false)} />}
      {confirmacion}
    </Pagina>
  );
}
