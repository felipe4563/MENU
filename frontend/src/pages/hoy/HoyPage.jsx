import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ShoppingBag, ChefHat, Wallet, Printer, ArrowUpRight, ArrowDownRight, PackageX } from 'lucide-react';
import { getReporteVentasResumen, getReporteVentasProductos, getReporteFinanzasSerie, getReporteFinanzasResumen, getReporteVentas, getReporteMapaCalor, getPorAcabarse, getTiemposCocina } from '../../api/reportes';
import { PorHora, FormasPago, Tendencia, Canales, ResultadoMes, MapaCalor, TiempoCocina } from './graficos';
import { getVentas } from '../../api/ventas';
import { getEstadoCajas } from '../../api/caja';
import { getEstadoAgentes } from '../../api/impresion';
import { useAuthStore } from '../../store/authStore';
import { usePermisos } from '../../hooks/usePermisos';
import { useMoneda } from '../../hooks/useConfig';
import { useSocket } from '../../hooks/useSocket';
import { Pagina, Vacio } from '../../components/ui/piezas';
import { cx, dinero, hoyISO } from '../../lib/util';

function haceDias(n) {
  const d = new Date(Date.now() - n * 86400000);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

const UNIDAD = { kilogramo: 'kg', gramo: 'g', litro: 'L', mililitro: 'ml', arroba: '@', libra: 'lb', unidad: '' };

function cantidadCorta(n, unidad) {
  const u = UNIDAD[unidad] ?? '';
  const v = Number.isInteger(n) ? n : Number(n.toFixed(n < 10 ? 1 : 0));
  return u ? `${v} ${u}` : `${v}`;
}

function saludo() {
  const h = new Date().getHours();
  return h < 12 ? 'Buen día' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
}

export default function HoyPage() {
  const usuario = useAuthStore((s) => s.usuario);
  const { tiene } = usePermisos();
  const moneda = useMoneda();
  const qc = useQueryClient();
  const hoy = hoyISO();
  const ayer = haceDias(1);
  const verReportes = tiene('reportes', 'ver');
  const sucursalId = usuario?.sucursal_activa?.id;

  const resumen = useQuery({ queryKey: ['hoy', 'resumen', hoy], queryFn: () => getReporteVentasResumen({ desde: hoy, hasta: hoy }), enabled: verReportes, refetchInterval: 60_000 });
  const top = useQuery({ queryKey: ['hoy', 'top', hoy], queryFn: () => getReporteVentasProductos({ desde: hoy, hasta: hoy }), enabled: verReportes });
  const serie = useQuery({ queryKey: ['hoy', 'serie', hoy], queryFn: () => getReporteFinanzasSerie({ desde: haceDias(29), hasta: hoy }), enabled: verReportes });
  const pedidosHoy = useQuery({ queryKey: ['hoy', 'pedidos', hoy], queryFn: () => getReporteVentas({ desde: hoy, hasta: hoy, limite: 0 }), enabled: verReportes, refetchInterval: 60_000 });
  const pedidosAyer = useQuery({ queryKey: ['hoy', 'pedidos', ayer], queryFn: () => getReporteVentas({ desde: ayer, hasta: ayer, limite: 0 }), enabled: verReportes, staleTime: 10 * 60_000 });
  const calor = useQuery({ queryKey: ['hoy', 'calor', hoy], queryFn: () => getReporteMapaCalor({ desde: haceDias(27), hasta: hoy }), enabled: verReportes, staleTime: 10 * 60_000 });
  const acabarse = useQuery({ queryKey: ['hoy', 'acabarse'], queryFn: () => getPorAcabarse(), enabled: verReportes, refetchInterval: 5 * 60_000 });
  const cocina = useQuery({ queryKey: ['hoy', 'cocina'], queryFn: () => getTiemposCocina(), enabled: verReportes, refetchInterval: 60_000 });
  const mes = useQuery({ queryKey: ['hoy', 'mes', hoy], queryFn: () => getReporteFinanzasResumen({ desde: `${hoy.slice(0, 8)}01`, hasta: hoy }), enabled: verReportes });
  const abiertos = useQuery({ queryKey: ['ventas', 'activos'], queryFn: () => getVentas({ estado: 'pendiente,listo' }), enabled: tiene('ventas', 'ver') });
  const cajas = useQuery({ queryKey: ['caja-estado', sucursalId], queryFn: () => getEstadoCajas(sucursalId), enabled: !!sucursalId && tiene('caja', 'ver') });
  const agentes = useQuery({ queryKey: ['agentes'], queryFn: getEstadoAgentes, enabled: tiene('caja', 'ver'), refetchInterval: 60_000 });
  useSocket('restaurante:actualizar', () => { qc.invalidateQueries({ queryKey: ['hoy'] }); qc.invalidateQueries({ queryKey: ['ventas', 'activos'] }); });
  useSocket('agente:estado', () => qc.invalidateQueries({ queryKey: ['agentes'] }));

  const r = resumen.data;
  const neto = r?.ventas_netas ?? r?.total_ventas ?? 0;
  // Hoy contra ayer hasta la misma hora: comparar lo que va del día con todo
  // ayer daba casi siempre "en baja" hasta la noche.
  const { vendidoHoy, ayerHastaAhora } = useMemo(() => {
    const ahora = new Date();
    const minutos = (d) => d.getHours() * 60 + d.getMinutes();
    const suma = (filas) => filas.reduce((s, p) => s + Number(p.total ?? 0), 0);
    return {
      vendidoHoy: suma(pedidosHoy.data?.filas ?? []),
      ayerHastaAhora: suma((pedidosAyer.data?.filas ?? []).filter((p) => minutos(new Date(p.creado_en)) <= minutos(ahora))),
    };
  }, [pedidosHoy.data, pedidosAyer.data]);
  const variacion = pedidosAyer.data && ayerHastaAhora > 0 ? ((vendidoHoy - ayerHastaAhora) / ayerHastaAhora) * 100 : null;
  const ticket = r?.cantidad ? neto / r.cantidad : 0;
  const enCocina = (abiertos.data ?? []).filter((p) => p.estado_cocina === 'pendiente').length;
  const cajasAbiertas = (cajas.data ?? []).filter((c) => c.sesion_abierta);
  const agentesCaidos = (agentes.data ?? []).filter((a) => !a.conectado);
  const maxTop = useMemo(() => Math.max(1, ...(top.data ?? []).slice(0, 6).map((p) => p.cantidad)), [top.data]);

  return (
    <Pagina>
      <div className="mb-6">
        <p className="text-tenue">{new Date().toLocaleDateString('es-BO', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        <h1 className="text-[32px] sm:text-[40px] font-extrabold leading-tight">{saludo()}, {usuario?.nombre?.split(' ')[0]}</h1>
      </div>

      {/* Accesos rápidos */}
      <div className="flex gap-2 overflow-x-auto sin-scroll -mx-4 px-4 mb-6">
        {tiene('ventas', 'ver') && <Link to="/vender" className="btn-aji btn-lg shrink-0"><ShoppingBag className="w-5 h-5" /> Nueva venta</Link>}
        {tiene('cocina', 'ver') && <Link to="/cocina" className="btn-borde btn-lg shrink-0"><ChefHat className="w-5 h-5" /> Cocina {enCocina > 0 && <span className="chip bg-aji text-sobre-aji num">{enCocina}</span>}</Link>}
        {tiene('caja', 'ver') && <Link to="/caja" className="btn-borde btn-lg shrink-0"><Wallet className="w-5 h-5" /> Caja</Link>}
      </div>

      {agentesCaidos.length > 0 && (
        <div className="mb-5 rounded-2xl bg-locoto/10 border border-locoto/25 p-4 flex items-start gap-3">
          <Printer className="w-5 h-5 text-locoto mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold">La impresora no está conectada en: {agentesCaidos.map((a) => a.caja_nombre).join(', ')}</p>
            <p className="text-tenue">Revisa que el agente de impresión esté abierto en esa computadora. Mientras tanto, los tickets salen por el navegador.</p>
          </div>
        </div>
      )}

      {(acabarse.data ?? []).length > 0 && (
        <div className="mb-5 rounded-2xl bg-papel border border-linea p-4 flex items-start gap-3">
          <PackageX className="w-5 h-5 text-aji mt-0.5 shrink-0" />
          <div className="text-sm flex-1 min-w-0">
            <p className="font-semibold">{acabarse.data.length === 1 ? 'Se está acabando 1 cosa' : `Se están acabando ${acabarse.data.length} cosas`}</p>
            <ul className="mt-1.5 grid sm:grid-cols-2 gap-x-6 gap-y-1">
              {acabarse.data.slice(0, 6).map((f) => (
                <li key={`${f.tipo}${f.id}`} className="flex items-baseline gap-2 min-w-0">
                  <span className="truncate">{f.nombre}</span>
                  <span className={cx('num shrink-0 ml-auto', f.stock <= 0 ? 'text-locoto font-semibold' : 'text-tenue')}>
                    {f.stock <= 0 ? 'agotado' : `quedan ${cantidadCorta(f.stock, f.unidad)} · ${f.dias < 1 ? 'no llega a 1 día' : `para ${Math.round(f.dias)} ${Math.round(f.dias) === 1 ? 'día' : 'días'}`}`}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-tenue mt-2">
              Según lo que se gastó en las últimas 2 semanas.{acabarse.data.length > 6 && ` Y ${acabarse.data.length - 6} más.`}{' '}
              {tiene('insumos', 'ver') && <Link to="/inventario/insumos" className="font-semibold text-tinta underline underline-offset-2">Ver inventario</Link>}
            </p>
          </div>
        </div>
      )}

      {!verReportes ? (
        <Vacio titulo="Todo listo para tu turno" texto="Usa los accesos de arriba para empezar." />
      ) : (
        <div className="grid lg:grid-cols-12 gap-4">
          <section className="lg:col-span-8 ficha p-5 sm:p-6">
            <div className="flex flex-wrap items-end gap-x-10 gap-y-4">
              <div>
                <p className="text-sm text-tenue">Vendido hoy</p>
                <p className="num text-[44px] sm:text-[56px] font-extrabold leading-none mt-1">{dinero(neto, moneda)}</p>
                {variacion != null && (
                  <p className={cx('text-sm mt-2 flex items-center gap-1 font-semibold', variacion >= 0 ? 'text-hierba' : 'text-locoto')}>
                    {variacion >= 0 ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                    {Math.abs(variacion).toFixed(0)}% frente a ayer a esta hora
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-x-6 sm:gap-x-8 gap-y-3 [&_p:first-child]:whitespace-nowrap">
                <div><p className="num text-2xl font-bold">{r?.cantidad ?? 0}</p><p className="text-[13px] text-tenue">pedidos</p></div>
                <div><p className="num text-2xl font-bold">{dinero(ticket, moneda)}</p><p className="text-[13px] text-tenue">por pedido</p></div>
                <div><p className="num text-2xl font-bold">{dinero(r?.ventas_qr ?? 0, moneda)}</p><p className="text-[13px] text-tenue">por QR</p></div>
              </div>
            </div>
            <div className="mt-7">
              <PorHora hoy={pedidosHoy.data?.filas} ayer={pedidosAyer.data?.filas} moneda={moneda} />
            </div>
          </section>

          <section className="lg:col-span-4 ficha p-5 sm:p-6">
            <h2 className="font-display font-semibold text-lg mb-5">Cómo te pagan hoy</h2>
            <FormasPago resumen={r} moneda={moneda} />
          </section>

          <section className="lg:col-span-8 ficha p-5 sm:p-6">
            <h2 className="font-display font-semibold text-lg mb-4">Últimos 30 días</h2>
            <Tendencia serie={serie.data} dias={30} moneda={moneda} haceDias={haceDias} />
          </section>

          <section className="lg:col-span-4 ficha p-5 sm:p-6">
            <h2 className="font-display font-semibold text-lg mb-3">Lo que más sale hoy</h2>
            {(top.data ?? []).length === 0 ? <p className="text-sm text-tenue py-6">Aún no hay ventas hoy.</p> : (
              <ul className="space-y-3">
                {top.data.slice(0, 6).map((p, i) => (
                  <li key={`${p.tipo}${p.id}`}>
                    <div className="flex items-baseline gap-2 text-sm">
                      <span className="num text-tenue w-4">{i + 1}</span>
                      <span className="flex-1 font-medium truncate">{p.nombre}</span>
                      <span className="num font-semibold">{p.cantidad}{p.unidad === 'kg' ? ' kg' : ''}</span>
                    </div>
                    <div className="ml-6 mt-1 h-1.5 rounded-full bg-hundido"><div className="h-full rounded-full bg-tinta" style={{ width: `${(p.cantidad / maxTop) * 100}%` }} /></div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="lg:col-span-12 min-w-0 ficha p-5 sm:p-6">
            <h2 className="font-display font-semibold text-lg">Cuándo vendes más</h2>
            <p className="text-[13px] text-tenue mb-4">Ventas por día y hora en las últimas 4 semanas. Sirve para armar turnos y saber cuándo preparar más.</p>
            <MapaCalor celdas={calor.data} moneda={moneda} semanas={4} />
          </section>

          <section className="lg:col-span-8 ficha p-5 sm:p-6">
            <h2 className="font-display font-semibold text-lg">Este mes</h2>
            <p className="text-[13px] text-tenue mb-4">Del 1 al {Number(hoy.slice(8))} de {new Date().toLocaleDateString('es-BO', { month: 'long' })}. De lo que vendes, cuánto se va en compras y gastos.</p>
            <ResultadoMes datos={mes.data} moneda={moneda} />
          </section>

          <section className="lg:col-span-4 ficha p-5 sm:p-6">
            <h2 className="font-display font-semibold text-lg mb-4">Cómo llegan los pedidos</h2>
            <Canales pedidos={pedidosHoy.data?.filas} />
          </section>


          {/* Sin rondas ni esperas: el local no usa la pantalla de Cocina. */}
          {cocina.data && (cocina.data.cantidad > 0 || cocina.data.semana?.cantidad > 0 || cocina.data.esperando?.length > 0) && (
            <section className="lg:col-span-12 min-w-0 ficha p-5 sm:p-6">
              <div className="flex items-baseline gap-3 mb-4">
                <h2 className="font-display font-semibold text-lg">Tiempo de cocina</h2>
                {tiene('cocina', 'ver') && <Link to="/cocina" className="text-sm font-semibold underline underline-offset-2 ml-auto">Abrir Cocina</Link>}
              </div>
              <TiempoCocina datos={cocina.data} />
            </section>
          )}

          <section className="ficha p-5 sm:p-6 lg:col-span-12 grid sm:grid-cols-3 gap-5">
            <div>
              <p className="text-sm text-tenue">Pedidos abiertos</p>
              <p className="num text-3xl font-bold mt-1">{(abiertos.data ?? []).length}</p>
              <p className="text-[13px] text-tenue">{enCocina} en cocina</p>
            </div>
            <div>
              <p className="text-sm text-tenue">Cajas abiertas</p>
              <p className="num text-3xl font-bold mt-1">{cajasAbiertas.length}<span className="text-tenue text-lg"> / {(cajas.data ?? []).length}</span></p>
              <p className="text-[13px] text-tenue truncate">{cajasAbiertas.map((c) => `${c.nombre} (${c.sesion_abierta.usuario?.nombre?.split(' ')[0]})`).join(', ') || 'Ninguna'}</p>
            </div>
            <div>
              <p className="text-sm text-tenue">Devoluciones hoy</p>
              <p className="num text-3xl font-bold mt-1">{dinero(r?.total_devoluciones ?? 0, moneda)}</p>
              <p className="text-[13px] text-tenue">{(r?.devoluciones_por_motivo ?? []).length ? 'Ver detalle en Finanzas' : 'Ninguna'}</p>
            </div>
          </section>
        </div>
      )}
    </Pagina>
  );
}
