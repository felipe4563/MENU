import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bike, MapPin, Phone, ChefHat, Check, Smartphone } from 'lucide-react';
import { getVentas, cobrarVenta } from '../../api/ventas';
import { usePermisos } from '../../hooks/usePermisos';
import { useMoneda } from '../../hooks/useConfig';
import { useSocket } from '../../hooks/useSocket';
import { Cargando, Encabezado, Pagina, Segmentado, SinPermiso, Vacio, Insignia } from '../../components/ui/piezas';
import HojaCobro from '../vender/HojaCobro';
import { vigente } from '../../utils/devoluciones';
import { nombreDetalle } from '../vender/datosCatalogo';
import { cx, dinero, hora, haceMinutos } from '../../lib/util';

function Tarjeta({ p, moneda, onCobrar, puedeCobrar }) {
  const prepago = p.metodo_pago === 'app_externa';
  const abierto = ['pendiente', 'listo'].includes(p.estado);
  return (
    <article className="ficha p-4 flex flex-col gap-3">
      <header className="flex items-start gap-2">
        <span className="w-10 h-10 rounded-xl bg-pizarra text-aji grid place-items-center shrink-0"><Smartphone className="w-5 h-5" /></span>
        <div className="flex-1 min-w-0">
          <p className="font-display font-bold text-lg leading-tight">{p.origen_app || 'App'} · #{p.numero_llevar ?? p.id}</p>
          <p className="text-xs text-tenue">{hora(p.creado_en)} · hace {haceMinutos(p.creado_en)} min · {p.nombre_cliente}</p>
        </div>
        {p.estado_cocina === 'pendiente' && <Insignia tono="alerta"><ChefHat className="w-3 h-3" /> Cocina</Insignia>}
        {p.estado_cocina === 'listo' && <Insignia tono="ok"><Check className="w-3 h-3" /> Listo</Insignia>}
        {p.estado === 'completado' && <Insignia tono="tinta">Cerrado</Insignia>}
      </header>
      {(p.direccion_entrega || p.telefono_cliente) && (
        <div className="text-sm rounded-xl bg-hundido px-3 py-2 space-y-1">
          {p.direccion_entrega && <p className="flex gap-2"><MapPin className="w-4 h-4 shrink-0 mt-0.5" /> {p.direccion_entrega}</p>}
          {p.telefono_cliente && <a href={`tel:${p.telefono_cliente}`} className="flex gap-2 font-semibold"><Phone className="w-4 h-4" /> {p.telefono_cliente}</a>}
        </div>
      )}
      <ul className="text-sm space-y-0.5">
        {p.detalles.filter((d) => vigente(d) > 0).map((d) => <li key={d.id}><span className="num font-bold mr-1.5">{vigente(d)}</span>{nombreDetalle(d)}</li>)}
      </ul>
      <footer className="flex items-center gap-2 mt-auto pt-1">
        <span className="num text-xl font-extrabold flex-1">{dinero(p.total, moneda)}</span>
        {prepago ? <Insignia tono="ok">Pagado en la app</Insignia> : abierto && puedeCobrar ? (
          <button className="btn-aji" onClick={() => onCobrar(p)}>Cobrar al entregar</button>
        ) : abierto ? <Insignia tono="alerta">Por cobrar</Insignia> : null}
        <Link className="btn-fantasma h-9 text-[13px]" to={`/vender/pedido/${p.id}`}>Ver</Link>
      </footer>
    </article>
  );
}

export default function ExternosPage() {
  const qc = useQueryClient();
  const moneda = useMoneda();
  const { tiene } = usePermisos();
  const [vista, setVista] = useState('activos');
  const [cobrar, setCobrar] = useState(null);
  const q = useQuery({ queryKey: ['ventas', 'externos'], queryFn: () => getVentas({ origen: 'app_externa' }), enabled: tiene('pedidos_externos', 'ver'), refetchInterval: 60_000 });
  useSocket('restaurante:actualizar', () => qc.invalidateQueries({ queryKey: ['ventas', 'externos'] }));

  const { activos, cerrados } = useMemo(() => {
    const todos = q.data ?? [];
    const hoy = new Date().toDateString();
    return {
      activos: todos.filter((p) => ['pendiente', 'listo'].includes(p.estado)),
      cerrados: todos.filter((p) => p.estado === 'completado' && new Date(p.creado_en).toDateString() === hoy),
    };
  }, [q.data]);

  if (!tiene('pedidos_externos', 'ver')) return <SinPermiso />;
  const lista = vista === 'activos' ? activos : cerrados;

  return (
    <Pagina>
      <Encabezado titulo="Delivery" texto="Pedidos que llegan de apps y de tu página web."
        acciones={<Segmentado valor={vista} onCambio={setVista} opciones={[{ valor: 'activos', etiqueta: 'En curso', cuenta: activos.length }, { valor: 'cerrados', etiqueta: 'Entregados hoy', cuenta: cerrados.length }]} />} />
      {q.isLoading ? <Cargando /> : lista.length === 0 ? (
        <Vacio Icono={Bike} titulo={vista === 'activos' ? 'No hay pedidos en curso' : 'Todavía nada entregado hoy'} texto={vista === 'activos' ? 'Aparecen aquí apenas llegan. Conecta apps en Ajustes › Integraciones.' : undefined} />
      ) : (
        <div className={cx('grid gap-3 sm:grid-cols-2 xl:grid-cols-3')}>
          {lista.map((p) => <Tarjeta key={p.id} p={p} moneda={moneda} puedeCobrar={tiene('ventas', 'cobrar')} onCobrar={setCobrar} />)}
        </div>
      )}
      {cobrar && (
        <HojaCobro
          total={Number(cobrar.total)}
          subtitulo={`${cobrar.origen_app || 'App'} #${cobrar.numero_llevar ?? cobrar.id}`}
          items={cobrar.detalles.map((d) => ({ producto_id: d.producto_id, cantidad: vigente(d), precio: Number(d.precio) }))}
          onConfirmar={(datos) => cobrarVenta(cobrar.id, datos)}
          onTerminado={() => { setCobrar(null); qc.invalidateQueries({ queryKey: ['ventas'] }); }}
          onCerrar={() => setCobrar(null)}
        />
      )}
    </Pagina>
  );
}
