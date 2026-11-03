import { useParams, useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowLeft, Printer } from 'lucide-react';
import { getReporte } from '../../api/caja';
import { reimprimirVenta } from '../../api/ventas';
import { useConfig, useMoneda } from '../../hooks/useConfig';
import { usePermisos } from '../../hooks/usePermisos';
import { imprimirCierreLocal, reimprimirConFallback } from '../../utils/impresionLocal';
import { Cargando, Pagina, SinPermiso, Vacio } from '../../components/ui/piezas';
import { avisar } from '../../components/ui/Aviso';
import { cx, dinero, errorDe, fechaHora, hora } from '../../lib/util';
import { etiquetaDestino } from '../vender/datosCatalogo';

const n = (v) => parseFloat(v || 0);
const METODO = { efectivo: 'Efectivo', qr: 'QR', app_externa: 'App externa' };

function Linea({ t, v, fuerte, tono }) {
  return (
    <li className={cx('flex items-baseline gap-2', fuerte && 'font-semibold')}>
      <span>{t}</span>
      <span className="flex-1 border-b border-dotted border-linea -translate-y-1" />
      <span className={cx('num', tono)}>{v}</span>
    </li>
  );
}

export default function ReporteCierrePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const moneda = useMoneda();
  const { config } = useConfig();
  const { tiene } = usePermisos();
  const q = useQuery({ queryKey: ['caja-reporte', id], queryFn: () => getReporte(id), enabled: tiene('caja', 'ver') });
  const reimprimir = useMutation({ mutationFn: reimprimirVenta, onSuccess: reimprimirConFallback, onError: (e) => avisar.error(errorDe(e)) });

  if (!tiene('caja', 'ver')) return <SinPermiso />;
  if (q.isLoading) return <Cargando />;
  if (!q.data) return <Vacio titulo="No encontramos ese turno" />;

  const { sesion: s, ventas_por_metodo: metodos = [], pedidos = [], productos_vendidos: productos = [], efectivo_esperado: esperado } = q.data;
  const totalVentas = metodos.reduce((a, m) => a + n(m.total), 0);
  const dif = n(s.diferencia);
  const tol = n(s.sucursal?.tolerancia_cierre_caja);
  const tonoDif = Math.abs(dif) < 0.005 ? 'text-hierba' : Math.abs(dif) <= tol ? 'text-tinta' : 'text-locoto';

  return (
    <Pagina className="max-w-[1100px] pb-28 md:pb-8">
      <div className="flex items-center gap-2 mb-5">
        <button className="btn-icono btn-fantasma" onClick={() => navigate(-1)} aria-label="Volver"><ArrowLeft className="w-5 h-5" /></button>
        <div className="flex-1">
          <h1 className="text-2xl sm:text-3xl font-bold leading-tight">Cierre de turno</h1>
          <p className="text-sm text-tenue">{s.usuario?.nombre} · {fechaHora(s.abierto_en)} → {s.cerrado_en ? hora(s.cerrado_en) : 'abierto'}</p>
        </div>
        <button className="btn-aji hidden md:inline-flex" onClick={() => imprimirCierreLocal(q.data, config)}><Printer className="w-4 h-4" /> Imprimir resumen</button>
      </div>

      <div className="grid lg:grid-cols-[380px_1fr] gap-5 items-start">
        <section className="comanda rounded-t-2xl shadow-papel px-6 pt-6 lg:sticky lg:top-4">
          <p className="text-center font-display font-extrabold text-xl">{config.nombre_negocio || 'Resumen'}</p>
          <p className="text-center text-xs text-tenue">Turno #{s.id}{s.sucursal?.nombre ? ` · ${s.sucursal.nombre}` : ''}</p>
          <div className="perforado my-4" />
          <ul className="space-y-2 text-[15px]">
            {metodos.map((m) => <Linea key={m.metodo_pago} t={`${METODO[m.metodo_pago] ?? m.metodo_pago} (${m.cantidad})`} v={dinero(m.total, moneda)} />)}
            <Linea t="Total vendido" v={dinero(totalVentas, moneda)} fuerte />
          </ul>
          <div className="perforado my-4" />
          <ul className="space-y-2 text-[15px]">
            <Linea t="Apertura" v={dinero(s.monto_apertura, moneda)} />
            <Linea t="+ Efectivo vendido" v={dinero(n(metodos.find((m) => m.metodo_pago === 'efectivo')?.total), moneda)} />
            <Linea t="− Gastos" v={dinero(s.total_gastos, moneda)} />
            <Linea t="− Devoluciones" v={dinero(s.total_devoluciones, moneda)} />
            <Linea t="Esperado" v={dinero(esperado, moneda)} fuerte />
            <Linea t="Contado" v={s.monto_cierre != null ? dinero(s.monto_cierre, moneda) : '—'} fuerte />
          </ul>
          <div className="perforado my-4" />
          <div className="flex items-end justify-between pb-1">
            <span className="font-semibold">Diferencia</span>
            <span className={cx('num text-3xl font-extrabold', tonoDif)}>{dif > 0 ? '+' : ''}{dif.toFixed(2)}</span>
          </div>
          {s.nota_diferencia && <p className="text-sm text-tenue mt-2">Motivo: {s.nota_diferencia}</p>}
          {s.detalle_arqueo?.length > 0 && (
            <>
              <div className="perforado my-4" />
              <p className="text-xs text-tenue mb-2">Conteo</p>
              <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm num">
                {[...s.detalle_arqueo].sort((a, b) => n(b.denominacion) - n(a.denominacion)).map((d) => (
                  <li key={d.id} className="flex justify-between"><span>{n(d.denominacion)} × {d.cantidad}</span><span>{n(d.subtotal).toFixed(2)}</span></li>
                ))}
              </ul>
            </>
          )}
        </section>

        <div className="space-y-5">
          <section className="ficha">
            <h2 className="px-5 pt-4 font-display font-semibold text-lg">Lo más vendido</h2>
            {productos.length === 0 ? <p className="px-5 py-6 text-sm text-tenue">No hubo ventas.</p> : (
              <ul className="px-5 py-3 divide-y divide-linea">
                {productos.map((p) => {
                  const max = n(productos[0].total_cantidad) || 1;
                  return (
                    <li key={p.nombre} className="py-2.5">
                      <div className="flex items-baseline gap-3 text-sm">
                        <span className="num font-bold w-8">{n(p.total_cantidad)}</span>
                        <span className="flex-1">{p.nombre}</span>
                        <span className="num">{dinero(p.total, moneda)}</span>
                      </div>
                      <div className="ml-11 mt-1.5 h-1.5 rounded-full bg-hundido overflow-hidden"><div className="h-full bg-aji rounded-full" style={{ width: `${(n(p.total_cantidad) / max) * 100}%` }} /></div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="ficha">
            <h2 className="px-5 pt-4 font-display font-semibold text-lg">Pedidos del turno <span className="text-tenue font-normal text-sm">· {pedidos.length}</span></h2>
            <ul className="px-5 py-3 divide-y divide-linea">
              {pedidos.map((p) => (
                <li key={p.id} className="py-2.5 flex items-center gap-3 text-sm">
                  <span className="num text-tenue w-12">{hora(p.creado_en)}</span>
                  <span className="flex-1 truncate">{etiquetaDestino(p)} <span className="text-tenue">· {METODO[p.metodo_pago] ?? p.metodo_pago}</span></span>
                  <span className="num font-semibold">{dinero(n(p.total) - n(p.total_devuelto), moneda)}</span>
                  <button className="btn-icono btn-fantasma h-8 w-8" title="Reimprimir ticket" onClick={() => reimprimir.mutate(p.id)}><Printer className="w-4 h-4" /></button>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>

      <div className="md:hidden fixed inset-x-0 bottom-16 p-3 flex gap-2 bg-fondo/90 backdrop-blur border-t border-linea">
        <button className="btn-borde flex-1" onClick={() => navigate('/caja')}>Volver a caja</button>
        <button className="btn-aji flex-1" onClick={() => imprimirCierreLocal(q.data, config)}><Printer className="w-4 h-4" /> Imprimir</button>
      </div>
    </Pagina>
  );
}
