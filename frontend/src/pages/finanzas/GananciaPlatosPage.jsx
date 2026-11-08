import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, AlertTriangle } from 'lucide-react';
import { getGananciaPlatos } from '../../api/reportes';
import { usePermisos } from '../../hooks/usePermisos';
import { useMoneda } from '../../hooks/useConfig';
import { Cargando, Encabezado, Pagina, Segmentado, SinPermiso, Vacio, Insignia } from '../../components/ui/piezas';
import { useRango, SelectorRango, exportarCsv, BotonCsv, BotonExportar } from './comun';
import { armarGananciaPlatos } from './exportes';
import { cx, dinero } from '../../lib/util';

// Lo sano en un restaurante: que los ingredientes no pasen del 30–35% del
// precio. Pasado el 40% se marca, solo en lo que se prepara: en lo que se
// compra hecho (bebidas) un 50–70% es normal y solo se avisa si se pierde.
const COSTO_ALTO = 40;
const costoAlto = (p) => p.fuente !== 'compra' && p.costo_pct > COSTO_ALTO;
const UNIDAD = { kilogramo: 'kg', gramo: 'g', litro: 'L', mililitro: 'ml', arroba: '@', libra: 'lb', unidad: 'u' };
const cant = (n) => (Number.isInteger(n) ? n : Number(n.toFixed(3)));

function Kpi({ etiqueta, valor, tono, nota }) {
  return (
    <div className="ficha p-4">
      <p className="text-[13px] text-tenue">{etiqueta}</p>
      <p className={cx('num text-2xl sm:text-[28px] font-extrabold mt-1 leading-none', tono)}>{valor}</p>
      {nota && <p className="text-xs text-tenue mt-1.5">{nota}</p>}
    </div>
  );
}

function Marca({ p }) {
  if (p.ganancia_unitaria < 0) return <Insignia tono="peligro">Pierdes</Insignia>;
  if (costoAlto(p)) return <Insignia tono="alerta">Costo alto</Insignia>;
  return null;
}

function Detalle({ p, moneda }) {
  if (p.fuente === 'compra') return <p className="text-sm text-tenue">Se compra hecho: su costo es el de la última compra, {dinero(p.costo, moneda)} por unidad.</p>;
  if (p.fuente === 'combo') return <p className="text-sm text-tenue">Suma del costo de los productos del combo.</p>;
  return (
    <div className="text-sm">
      <p className="text-tenue mb-2">Receta (sin opciones extra), con el precio de la última compra de cada ingrediente:</p>
      <ul className="divide-y divide-dashed divide-linea">
        {p.detalle.map((d) => (
          <li key={d.insumo} className="flex items-baseline gap-3 py-1.5">
            <span className="flex-1 min-w-0 truncate">{d.insumo}</span>
            <span className="num text-tenue shrink-0">{cant(d.cantidad)} {UNIDAD[d.unidad] ?? ''} × {d.costo_unitario == null ? '—' : dinero(d.costo_unitario, moneda)}</span>
            <span className="num font-semibold w-20 text-right shrink-0">{d.subtotal == null ? '—' : dinero(d.subtotal, moneda)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Fila({ p, moneda, abierto, onTocar }) {
  return (
    <li className="border-t border-linea first:border-t-0">
      <button onClick={onTocar} aria-expanded={abierto}
        className="w-full text-left px-5 py-3 grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1.6fr)_repeat(5,minmax(0,0.7fr))_minmax(0,0.9fr)] gap-x-4 gap-y-1 items-center hover:bg-hundido/50">
        <span className="min-w-0 flex items-center gap-2">
          <ChevronDown className={cx('w-4 h-4 text-tenue shrink-0 transition-transform', abierto && 'rotate-180')} />
          <span className="font-medium truncate">{p.nombre}</span>
          {p.tipo === 'combo' && <Insignia>Combo</Insignia>}
          <Marca p={p} />
        </span>
        <span className="hidden sm:block num text-right">{dinero(p.precio, moneda)}</span>
        <span className="hidden sm:block num text-right">{dinero(p.costo, moneda)}</span>
        <span className={cx('hidden sm:block num text-right', p.ganancia_unitaria < 0 && 'text-locoto font-semibold')}>{dinero(p.ganancia_unitaria, moneda)}</span>
        <span className={cx('hidden sm:block num text-right', costoAlto(p) ? 'text-locoto font-semibold' : 'text-tenue')}>{p.costo_pct}%</span>
        <span className="hidden sm:block num text-right text-tenue">{cant(p.vendidos)}</span>
        <span className={cx('num text-right font-bold', p.ganancia_total < 0 && 'text-locoto')}>{dinero(p.ganancia_total, moneda)}</span>
        {/* En celular, las cifras van debajo del nombre. */}
        <span className="sm:hidden col-span-2 pl-6 text-[13px] text-tenue num">
          {dinero(p.precio, moneda)} · cuesta {dinero(p.costo, moneda)} ({p.costo_pct}%) · {cant(p.vendidos)} vendidos
        </span>
      </button>
      {abierto && <div className="px-5 pb-4 sm:pl-11"><Detalle p={p} moneda={moneda} /></div>}
    </li>
  );
}

export default function GananciaPlatosPage() {
  const { tiene } = usePermisos();
  const moneda = useMoneda();
  const r = useRango('mes');
  const [orden, setOrden] = useState('ganancia');
  const [abierto, setAbierto] = useState(null);
  const [todosSinCosto, setTodosSinCosto] = useState(false);
  const datos = useQuery({ queryKey: ['ganancia-platos', r.rango], queryFn: () => getGananciaPlatos(r.rango), enabled: tiene('reportes', 'ver') });

  const { conCosto, sinCosto } = useMemo(() => {
    const platos = datos.data?.platos ?? [];
    const con = platos.filter((p) => p.costo != null);
    if (orden === 'costo') con.sort((a, b) => b.costo_pct - a.costo_pct);
    else con.sort((a, b) => b.ganancia_total - a.ganancia_total || b.ganancia_unitaria - a.ganancia_unitaria);
    return { conCosto: con, sinCosto: platos.filter((p) => p.costo == null).sort((a, b) => b.ventas - a.ventas) };
  }, [datos.data, orden]);

  if (!tiene('reportes', 'ver')) return <Pagina><SinPermiso /></Pagina>;

  const res = datos.data?.resumen;
  const sinCostoVisibles = todosSinCosto ? sinCosto : sinCosto.filter((p) => p.ventas > 0);
  const alertas = conCosto.filter((p) => p.ganancia_unitaria < 0 || costoAlto(p)).length;

  return (
    <Pagina>
      <Encabezado titulo="Ganancia por plato" texto={`Cuánto cuesta preparar cada plato contra lo que cobras. Del ${r.rango.desde} al ${r.rango.hasta}.`}>
        <div className="w-full sm:w-auto sm:ml-auto flex flex-wrap items-center gap-2">
          <SelectorRango r={r} />
          <BotonExportar disabled={!datos.data} armar={() => armarGananciaPlatos(r.rango, moneda)} />
        </div>
      </Encabezado>

      {datos.isLoading ? <Cargando /> : !datos.data ? null : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi etiqueta="Vendido" valor={dinero(res.ventas, moneda)} nota="de los platos con costo" />
            <Kpi etiqueta="Costo de ingredientes" valor={dinero(res.costo, moneda)} />
            <Kpi etiqueta="Ganancia sobre ingredientes" valor={dinero(res.ganancia, moneda)} tono={res.ganancia >= 0 ? 'text-hierba' : 'text-locoto'} nota="sin sueldos, luz ni alquiler" />
            <Kpi etiqueta="Se va en ingredientes" valor={res.costo_pct == null ? '—' : `${res.costo_pct}%`} tono={res.costo_pct > COSTO_ALTO ? 'text-locoto' : undefined} nota="lo sano: hasta 30–35%" />
          </div>

          {res.ventas_sin_costo > 0 && (
            <p className="text-sm rounded-xl bg-aji/15 px-3 py-2.5 flex gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{dinero(res.ventas_sin_costo, moneda)} vendidos en platos sin receta o sin compras cargadas no entran en estas cuentas. Están abajo.</span>
            </p>
          )}

          {conCosto.length === 0 ? (
            <Vacio titulo="Todavía no hay platos con costo" texto="Carga la receta de tus platos y registra las compras de sus ingredientes para ver cuánto ganas en cada uno." />
          ) : (
            <section className="ficha">
              <header className="flex flex-wrap items-center gap-3 px-5 pt-4 pb-3">
                <h2 className="font-display font-semibold text-lg mr-auto">
                  Platos <span className="text-sm text-tenue font-normal">· {conCosto.length}{alertas > 0 && <> · <span className="text-locoto">{alertas} para revisar</span></>}</span>
                </h2>
                <Segmentado tamano="sm" valor={orden} onCambio={setOrden} opciones={[{ valor: 'ganancia', etiqueta: 'Más ganancia' }, { valor: 'costo', etiqueta: 'Más costo %' }]} />
                <BotonCsv onClick={() => exportarCsv(`ganancia_platos_${r.rango.desde}_${r.rango.hasta}`, [
                  { titulo: 'Plato', valor: (p) => p.nombre },
                  { titulo: 'Precio', valor: (p) => p.precio },
                  { titulo: 'Costo', valor: (p) => p.costo },
                  { titulo: 'Ganancia por plato', valor: (p) => p.ganancia_unitaria },
                  { titulo: '% costo', valor: (p) => p.costo_pct },
                  { titulo: 'Vendidos', valor: (p) => p.vendidos },
                  { titulo: 'Vendido', valor: (p) => p.ventas },
                  { titulo: 'Ganancia', valor: (p) => p.ganancia_total },
                ], conCosto)} />
              </header>
              <div className="hidden sm:grid grid-cols-[minmax(0,1.6fr)_repeat(5,minmax(0,0.7fr))_minmax(0,0.9fr)] gap-x-4 px-5 pb-2 text-[12px] text-tenue">
                <span className="pl-6">Plato</span><span className="text-right">Precio</span><span className="text-right">Costo</span>
                <span className="text-right">Ganas c/u</span><span className="text-right">% costo</span><span className="text-right">Vendidos</span><span className="text-right">Ganancia</span>
              </div>
              <ul>
                {conCosto.map((p) => {
                  const clave = `${p.tipo}${p.id}`;
                  return <Fila key={clave} p={p} moneda={moneda} abierto={abierto === clave} onTocar={() => setAbierto(abierto === clave ? null : clave)} />;
                })}
              </ul>
            </section>
          )}

          {sinCosto.length > 0 && (
            <section className="ficha p-5">
              <div className="flex flex-wrap items-baseline gap-3 mb-1">
                <h2 className="font-display font-semibold text-lg mr-auto">Sin costo todavía</h2>
                {tiene('insumos', 'ver') && <Link to="/inventario/insumos" className="text-sm font-semibold underline underline-offset-2">Cargar recetas</Link>}
              </div>
              <p className="text-sm text-tenue mb-3">Para calcularlos, carga su receta en Inventario › Insumos y registra las compras de sus ingredientes. Si se compran hechos, registra su compra.</p>
              {sinCostoVisibles.length > 0 && (
                <ul className="divide-y divide-dashed divide-linea">
                  {sinCostoVisibles.map((p) => (
                    <li key={`${p.tipo}${p.id}`} className="py-2 flex flex-wrap items-baseline gap-x-3 text-sm">
                      <span className="font-medium">{p.nombre}</span>
                      <span className="text-tenue text-[13px] flex-1 min-w-[12rem]">{p.motivo}</span>
                      <span className="num text-tenue">{p.ventas > 0 ? `${dinero(p.ventas, moneda)} vendidos` : 'sin ventas'}</span>
                    </li>
                  ))}
                </ul>
              )}
              {sinCosto.length > sinCostoVisibles.length && !todosSinCosto && (
                <button className="text-sm font-semibold underline underline-offset-2 mt-2" onClick={() => setTodosSinCosto(true)}>
                  Ver también {sinCosto.length - sinCostoVisibles.length} sin ventas en este período
                </button>
              )}
            </section>
          )}
        </div>
      )}
    </Pagina>
  );
}
