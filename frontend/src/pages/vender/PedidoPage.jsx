import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus, Printer, Undo2, XCircle, ChefHat, Check, X } from 'lucide-react';
import { getVenta, agregarItem, actualizarItem, eliminarItem, cobrarVenta, cancelarVenta, reimprimirVenta } from '../../api/ventas';
import { usePermisos } from '../../hooks/usePermisos';
import { useMoneda } from '../../hooks/useConfig';
import { useSocket } from '../../hooks/useSocket';
import { reimprimirConFallback } from '../../utils/impresionLocal';
import { vigente, puedeAnularPedido } from '../../utils/devoluciones';
import { useCatalogo, etiquetaDestino, nombreDetalle, textoOpcionesDetalle } from './datosCatalogo';
import { useAgregar } from './useAgregar';
import Catalogo from './Catalogo';
import HojaCobro from './HojaCobro';
import HojaAnular, { HistorialDevoluciones } from './HojaAnular';
import { LineaComanda, TotalComanda } from './Comanda';
import Hoja from '../../components/ui/Hoja';
import { Cargando, Insignia, Vacio, useConfirmar } from '../../components/ui/piezas';
import { avisar } from '../../components/ui/Aviso';
import { dinero, errorDe, hora, haceMinutos } from '../../lib/util';

// Un pedido abierto (mesa, llevar, QR o delivery): agregar, quitar, cobrar.
export default function PedidoPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const moneda = useMoneda();
  const { tiene } = usePermisos();
  const [hoja, setHoja] = useState(null); // agregar | cobrar | anular
  const [confirmacion, confirmar] = useConfirmar();
  const cat = useCatalogo();

  const q = useQuery({ queryKey: ['venta', id], queryFn: () => getVenta(id) });
  useSocket('restaurante:actualizar', () => qc.invalidateQueries({ queryKey: ['venta', id] }));
  const refrescar = () => { qc.invalidateQueries({ queryKey: ['venta', id] }); qc.invalidateQueries({ queryKey: ['ventas'] }); };
  const fallo = (e) => avisar.error(errorDe(e));

  const agregar = useMutation({
    mutationFn: (l) => agregarItem(id, { producto_id: l.producto_id, combo_id: l.combo_id, cantidad: 1, nota: l.nota, peso: l.peso, opcion_ids: l.opcion_ids, opciones_por_producto: l.opciones_por_producto }),
    onSuccess: (_r, l) => { refrescar(); avisar.ok(`${l.nombre} agregado`); },
    onError: fallo,
  });
  const cambiar = useMutation({ mutationFn: ({ d, cantidad }) => actualizarItem(id, d.id, { cantidad }), onSuccess: refrescar, onError: fallo });
  const quitar = useMutation({ mutationFn: (d) => eliminarItem(id, d.id), onSuccess: refrescar, onError: fallo });
  const cancelar = useMutation({ mutationFn: () => cancelarVenta(id), onSuccess: () => { qc.invalidateQueries({ queryKey: ['ventas'] }); avisar.ok('Pedido cancelado'); navigate('/vender'); }, onError: fallo });
  const reimprimir = useMutation({ mutationFn: () => reimprimirVenta(id), onSuccess: reimprimirConFallback, onError: fallo });

  const ag = useAgregar({ precioDe: cat.precioDe, onAgregar: (l) => { agregar.mutate(l); setHoja(null); } });

  if (q.isLoading) return <Cargando />;
  const p = q.data;
  if (!p) return <Vacio titulo="No encontramos ese pedido" accion={<button className="btn-aji" onClick={() => navigate('/vender')}>Volver a vender</button>} />;

  const abierto = ['pendiente', 'listo'].includes(p.estado);
  const editable = abierto && tiene('ventas', 'crear');
  const detalles = (p.detalles ?? []).filter((d) => vigente(d) > 0);
  const total = Number(p.total);
  const items = detalles.reduce((s, d) => s + vigente(d), 0);

  const menos = async (d) => {
    if (vigente(d) > 1) return cambiar.mutate({ d, cantidad: Number(d.cantidad) - 1 });
    if (Number(d.cantidad_anulada) > 0) return setHoja('anular');
    if (await confirmar({ titulo: `¿Quitar ${nombreDetalle(d)}?`, confirmar: 'Quitar', peligro: true })) quitar.mutate(d);
  };

  return (
    <div className="h-dvh flex flex-col lg:flex-row">
      {/* Columna del ticket */}
      <section className="lg:w-[420px] shrink-0 flex flex-col min-h-0 flex-1 lg:flex-none lg:p-4 lg:pr-0">
        <div className="comanda lg:rounded-t-2xl lg:shadow-papel flex-1 flex flex-col min-h-0">
          <header className="p-4 flex items-start gap-2" style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}>
            <button className="btn-icono btn-fantasma -ml-2" onClick={() => navigate('/vender')} aria-label="Volver"><ArrowLeft className="w-5 h-5" /></button>
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-extrabold leading-tight">{etiquetaDestino(p)}</h1>
              <p className="text-sm text-tenue truncate">
                #{p.id} · {hora(p.creado_en)} ({haceMinutos(p.creado_en)} min) · {p.nombre_cliente}
              </p>
            </div>
            {p.estado_cocina === 'listo' && <Insignia tono="ok"><Check className="w-3 h-3" /> Listo</Insignia>}
            {p.estado_cocina === 'pendiente' && <Insignia tono="alerta"><ChefHat className="w-3 h-3" /> Cocina</Insignia>}
            {p.estado === 'completado' && <Insignia tono="tinta">Cobrado</Insignia>}
            {p.estado === 'cancelado' && <Insignia tono="peligro">Cancelado</Insignia>}
          </header>
          {p.direccion_entrega && <p className="mx-4 mb-2 text-sm rounded-xl bg-hundido px-3 py-2">📍 {p.direccion_entrega}{p.telefono_cliente ? ` · ${p.telefono_cliente}` : ''}</p>}
          {p.notas && <p className="mx-4 mb-2 text-sm italic text-tenue">“{p.notas}”</p>}
          <div className="flex-1 overflow-y-auto scroll-fino px-4">
            <div className="perforado mb-1" />
            <ul className="divide-y divide-dashed divide-linea">
              {detalles.map((d) => (
                <LineaComanda
                  key={d.id}
                  deshabilitado={!editable}
                  linea={{ nombre: nombreDetalle(d), cantidad: vigente(d), precio: Number(d.precio), peso: d.peso ? Number(d.peso) : null, detalle: textoOpcionesDetalle(d), nota: d.nota && d.nota !== textoOpcionesDetalle(d) ? d.nota : null }}
                  onMas={() => cambiar.mutate({ d, cantidad: Number(d.cantidad) + 1 })}
                  onMenos={() => menos(d)}
                />
              ))}
            </ul>
            {detalles.length === 0 && <p className="py-10 text-center text-sm text-tenue">Este pedido no tiene productos.</p>}
            <div className="py-3"><HistorialDevoluciones pedido={p} /></div>
          </div>
          <div className="p-4 space-y-3 border-t border-dashed border-linea">
            <TotalComanda total={total - Number(p.total_devuelto || 0)} items={items} />
            <div className="flex gap-2">
              {editable && <button className="btn-borde flex-1 lg:hidden" onClick={() => setHoja('agregar')}><Plus className="w-4 h-4" /> Agregar</button>}
              {abierto && tiene('ventas', 'cobrar') && (
                <button className="btn-aji btn-lg flex-[2]" disabled={!detalles.length} onClick={() => setHoja('cobrar')}>Cobrar <span className="num">· {dinero(total, moneda)}</span></button>
              )}
            </div>
            <div className="flex gap-1 flex-wrap">
              <button className="btn-fantasma h-9 text-[13px]" onClick={() => reimprimir.mutate()} disabled={reimprimir.isPending}><Printer className="w-4 h-4" /> Reimprimir</button>
              {tiene('ventas', 'anular') && puedeAnularPedido(p) && <button className="btn-fantasma h-9 text-[13px]" onClick={() => setHoja('anular')}><Undo2 className="w-4 h-4" /> Anular productos</button>}
              {p.estado === 'pendiente' && tiene('ventas', 'cancelar') && (
                <button className="btn-fantasma h-9 text-[13px] text-locoto ml-auto" onClick={async () => {
                  if (await confirmar({ titulo: '¿Cancelar todo el pedido?', texto: 'Se libera la mesa y el pedido queda anulado. No se puede deshacer.', confirmar: 'Cancelar pedido', peligro: true })) cancelar.mutate();
                }}><XCircle className="w-4 h-4" /> Cancelar pedido</button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Catálogo para agregar (escritorio) */}
      {editable && (
        <section className="hidden lg:flex flex-1 min-w-0 flex-col">
          <Catalogo cat={cat} onProducto={ag.producto} onCombo={ag.combo} />
        </section>
      )}
      {!editable && <section className="hidden lg:flex flex-1 items-center justify-center text-tenue">Este pedido ya no se puede modificar.</section>}

      {hoja === 'agregar' && (
        <Hoja onCerrar={() => setHoja(null)} sinRelleno ancho="max-w-3xl">
          <div className="h-[80dvh] flex flex-col">
            <div className="flex justify-end px-3 pt-2"><button className="btn-icono btn-fantasma" onClick={() => setHoja(null)} aria-label="Cerrar"><X className="w-5 h-5" /></button></div>
            <div className="flex-1 min-h-0"><Catalogo cat={cat} onProducto={ag.producto} onCombo={ag.combo} /></div>
          </div>
        </Hoja>
      )}
      {hoja === 'cobrar' && (
        <HojaCobro
          total={total}
          subtitulo={etiquetaDestino(p)}
          clienteInicial={p.cliente}
          items={detalles.map((d) => ({ producto_id: d.producto_id, cantidad: vigente(d), precio: Number(d.precio) }))}
          onConfirmar={(datos) => cobrarVenta(id, datos)}
          onTerminado={() => { qc.invalidateQueries({ queryKey: ['ventas'] }); qc.invalidateQueries({ queryKey: ['mesas'] }); navigate('/vender'); }}
          onCerrar={() => { setHoja(null); refrescar(); }}
        />
      )}
      {hoja === 'anular' && <HojaAnular pedido={p} onCerrar={() => setHoja(null)} onListo={() => { setHoja(null); refrescar(); }} />}
      {ag.hojas}
      {confirmacion}
    </div>
  );
}
