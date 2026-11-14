import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, ShoppingCart, PackageCheck, Wallet, Landmark, Check } from 'lucide-react';
import { getCompras, crearCompra, recibirCompra } from '../../api/compras';
import { getEstadoCajas } from '../../api/caja';
import { useAuthStore } from '../../store/authStore';
import { usePermisos } from '../../hooks/usePermisos';
import { useMoneda } from '../../hooks/useConfig';
import Hoja from '../../components/ui/Hoja';
import { Cargando, Campo, Encabezado, Pagina, Segmentado, SinPermiso, Vacio, Insignia } from '../../components/ui/piezas';
import { avisar } from '../../components/ui/Aviso';
import LineasCompra from '../../components/compras/LineasCompra';
import { lineaVacia, lineasValidas, totalLineas, itemsParaApi, useCatalogoCompras } from '../../lib/compras';
import { cx, dinero, errorDe, fechaCorta } from '../../lib/util';

const invalidarStock = (qc) => { for (const k of [['compras'], ['insumos'], ['productos']]) qc.invalidateQueries({ queryKey: k }); };

function HojaCompra({ onCerrar }) {
  const qc = useQueryClient();
  const moneda = useMoneda();
  const catalogo = useCatalogoCompras();
  const [proveedor, setProveedor] = useState('');
  const [notas, setNotas] = useState('');
  const [items, setItems] = useState([lineaVacia()]);
  const total = totalLineas(items);
  const guardar = useMutation({
    mutationFn: () => crearCompra({ proveedor_id: Number(proveedor), notas: notas.trim() || undefined, items: itemsParaApi(items) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['compras'] }); avisar.ok('Compra registrada. Márcala como recibida cuando llegue.'); onCerrar(); },
    onError: (e) => avisar.error(errorDe(e)),
  });
  return (
    <Hoja onCerrar={onCerrar} titulo="Nueva compra" ancho="max-w-2xl"
      pie={<><span className="mr-auto num text-xl font-extrabold self-center">{dinero(total, moneda)}</span><button data-principal className="btn-aji" disabled={!proveedor || !lineasValidas(items).length || guardar.isPending} onClick={() => guardar.mutate()}>Registrar compra</button></>}>
      <div className="space-y-4">
        <Campo etiqueta="Proveedor">
          <select className="campo" value={proveedor} onChange={(e) => setProveedor(e.target.value)}>
            <option value="">Elige…</option>{(catalogo.data?.proveedores ?? []).map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </Campo>
        {catalogo.isLoading ? <Cargando /> : <LineasCompra items={items} onCambio={setItems} catalogo={catalogo.data} />}
        <Campo etiqueta="Notas"><input className="campo" value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Nº de factura, condiciones…" /></Campo>
        <p className="text-sm text-tenue">Si la pagan en el momento con plata de la caja, regístrala desde Caja › Registrar gasto › Compra de insumos.</p>
      </div>
    </Hoja>
  );
}

function OpcionPago({ valor, actual, onElegir, Icono, titulo, texto }) {
  const activa = actual === valor;
  return (
    <button type="button" onClick={() => onElegir(valor)} aria-pressed={activa}
      className={cx('w-full flex items-center gap-3 rounded-xl border px-3 py-3 text-left', activa ? 'border-aji bg-aji/5' : 'border-linea hover:bg-hundido')}>
      <Icono className={cx('w-5 h-5 shrink-0', activa ? 'text-aji' : 'text-tenue')} />
      <span className="flex-1 min-w-0"><span className="block font-semibold">{titulo}</span><span className="block text-xs text-tenue">{texto}</span></span>
      {activa && <Check className="w-4 h-4 text-aji" />}
    </button>
  );
}

// "¿Llegó todo?" + de dónde salió la plata. Si quien recibe tiene una caja
// abierta, puede pagarla con esa caja: queda como gasto del turno.
function HojaRecibir({ compra, miCaja, onCerrar }) {
  const qc = useQueryClient();
  const moneda = useMoneda();
  const [pago, setPago] = useState(miCaja ? null : 'fuera');
  const recibir = useMutation({
    mutationFn: () => recibirCompra(compra.id, pago === 'caja' ? { sesion_caja_id: miCaja.sesion_abierta.id } : {}),
    onSuccess: () => {
      invalidarStock(qc);
      if (pago === 'caja') { qc.invalidateQueries({ queryKey: ['sesion', miCaja.sesion_abierta.id] }); qc.invalidateQueries({ queryKey: ['gastos', miCaja.sesion_abierta.id] }); }
      avisar.ok('Recibida: el stock ya se sumó.');
      onCerrar();
    },
    onError: (e) => avisar.error(errorDe(e)),
  });
  const opcion = { actual: pago, onElegir: setPago };
  return (
    <Hoja onCerrar={onCerrar} bloquear={recibir.isPending} titulo="¿Llegó todo?" subtitulo={`${compra.proveedor?.nombre ?? 'Compra al paso'} · ${dinero(compra.total, moneda)}`} ancho="max-w-md"
      pie={<button data-principal className="btn-aji w-full" disabled={!pago || recibir.isPending} onClick={() => recibir.mutate()}><PackageCheck className="w-4 h-4" /> Sí, recibir</button>}>
      <p className="text-sm text-tenue mb-4">Se suma al stock y el pago queda anotado una sola vez en el libro de caja.</p>
      {miCaja ? (
        <div className="space-y-2">
          <p className="etiqueta">¿Cómo se pagó?</p>
          <OpcionPago {...opcion} valor="caja" Icono={Wallet} titulo={`Con plata de ${miCaja.nombre}`} texto="Sale del cajón: cuenta como gasto de tu turno." />
          <OpcionPago {...opcion} valor="fuera" Icono={Landmark} titulo="Por fuera de la caja" texto="Transferencia, plata del dueño, a crédito…" />
        </div>
      ) : (
        <p className="text-sm">Se anota como pagada <b>por fuera de la caja</b>. Si la pagaron con plata del cajón, recíbela desde tu caja abierta.</p>
      )}
    </Hoja>
  );
}

export default function ComprasPage() {
  const moneda = useMoneda();
  const { tiene } = usePermisos();
  const usuario = useAuthStore((s) => s.usuario);
  const sucursalId = usuario?.sucursal_activa?.id;
  const [vista, setVista] = useState('pendiente');
  const [nueva, setNueva] = useState(false);
  const [recibiendo, setRecibiendo] = useState(null);
  const q = useQuery({ queryKey: ['compras'], queryFn: getCompras, enabled: tiene('compras', 'ver') });
  const cajasQ = useQuery({ queryKey: ['caja-estado', sucursalId], queryFn: () => getEstadoCajas(sucursalId), enabled: !!sucursalId && tiene('caja', 'ver') && tiene('compras', 'recibir') });
  const miCaja = (cajasQ.data ?? []).find((c) => c.sesion_abierta?.usuario_id === usuario?.id) ?? null;
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
                <div className="flex-1 min-w-0"><p className="font-display font-bold text-lg leading-tight truncate">{c.proveedor?.nombre ?? 'Compra al paso'}</p><p className="text-xs text-tenue">#{c.id} · {fechaCorta(c.creado_en)}</p></div>
                <Insignia tono={c.estado === 'recibido' ? 'ok' : 'alerta'}>{c.estado === 'recibido' ? (c.sesion_caja_id ? 'Pagada con caja' : 'Recibida') : 'Por recibir'}</Insignia>
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
                  <button className="btn-aji h-9" onClick={() => setRecibiendo(c)}><PackageCheck className="w-4 h-4" /> Recibir</button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
      {nueva && <HojaCompra onCerrar={() => setNueva(false)} />}
      {recibiendo && <HojaRecibir compra={recibiendo} miCaja={miCaja} onCerrar={() => setRecibiendo(null)} />}
    </Pagina>
  );
}
