import { useMemo } from 'react';
import { Armchair, ShoppingBag, Bike, QrCode, ChefHat, Check } from 'lucide-react';
import { cx, dinero, haceMinutos } from '../../lib/util';
import { useMoneda } from '../../hooks/useConfig';
import { Vacio } from '../../components/ui/piezas';
import { etiquetaDestino } from './datosCatalogo';

function Tiempo({ desde }) {
  const m = haceMinutos(desde);
  return <span className={cx('num', m >= 30 && 'text-locoto font-semibold')}>{m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`}</span>;
}

function EstadoCocina({ pedido }) {
  if (pedido.estado_cocina === 'listo') return <span className="chip bg-hierba text-white"><Check className="w-3 h-3" /> Listo</span>;
  if (pedido.estado_cocina === 'pendiente') return <span className="chip bg-white/15"><ChefHat className="w-3 h-3" /> En cocina</span>;
  return null;
}

// Mesas agrupadas por área + pedidos para llevar y delivery abiertos.
export default function Salon({ mesas, pedidos, onMesaLibre, onPedido, onMesaSinPedido, onAbrirQr }) {
  const moneda = useMoneda();
  const porMesa = useMemo(() => {
    const m = {};
    pedidos.forEach((p) => { if (p.mesa_id) m[p.mesa_id] = p; });
    return m;
  }, [pedidos]);
  const areas = useMemo(() => {
    const g = new Map();
    mesas.forEach((m) => {
      const k = m.area?.nombre ?? 'Salón';
      if (!g.has(k)) g.set(k, []);
      g.get(k).push(m);
    });
    return [...g.entries()];
  }, [mesas]);
  const sinMesa = pedidos.filter((p) => !p.mesa_id);

  if (!mesas.length && !sinMesa.length) {
    return <Vacio Icono={Armchair} titulo="Todavía no hay mesas" texto="Crea las áreas y mesas del local en Ajustes › Salón y mesas. Mientras tanto puedes vender para llevar." />;
  }

  return (
    <div className="space-y-7">
      {sinMesa.length > 0 && (
        <section>
          <h2 className="text-lg font-bold mb-3">Para llevar y delivery</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {sinMesa.map((p) => (
              <button key={p.id} onClick={() => onPedido(p)} className="text-left rounded-ficha bg-pizarra text-sobre-pizarra p-4 hover:ring-2 hover:ring-aji transition">
                <div className="flex items-center gap-2 text-sm opacity-75">
                  {p.tipo === 'delivery' ? <Bike className="w-4 h-4" /> : <ShoppingBag className="w-4 h-4" />}
                  <Tiempo desde={p.creado_en} />
                </div>
                <p className="font-display font-bold text-xl mt-1">{etiquetaDestino(p)}</p>
                <p className="text-sm opacity-75 truncate">{p.nombre_cliente}</p>
                <div className="flex items-center justify-between mt-3">
                  <span className="num font-bold">{dinero(p.total, moneda)}</span>
                  <EstadoCocina pedido={p} />
                </div>
              </button>
            ))}
          </div>
        </section>
      )}
      {areas.map(([area, lista]) => (
        <section key={area}>
          <h2 className="text-lg font-bold mb-3">{area} <span className="text-sm font-normal text-tenue">· {lista.filter((m) => porMesa[m.id]).length} de {lista.length} ocupadas</span></h2>
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3">
            {lista.map((m) => {
              const p = porMesa[m.id];
              if (p) {
                return (
                  <button key={m.id} onClick={() => onPedido(p)} className="aspect-square text-left rounded-ficha bg-pizarra text-sobre-pizarra p-3 flex flex-col hover:ring-2 hover:ring-aji transition">
                    <div className="flex items-center justify-between text-xs opacity-75">
                      <Tiempo desde={p.creado_en} />
                      {p.origen === 'autoservicio' && <QrCode className="w-3.5 h-3.5" />}
                    </div>
                    <p className="font-display font-extrabold text-2xl leading-none mt-1">{m.nombre}</p>
                    <div className="mt-auto space-y-1">
                      <EstadoCocina pedido={p} />
                      <p className="num font-bold">{dinero(p.total, moneda)}</p>
                    </div>
                  </button>
                );
              }
              const conQr = m.sesiones?.length > 0;
              const ocupadaSinPedido = conQr || m.estado === 'ocupada';
              return (
                <div key={m.id} className="relative">
                  <button
                    onClick={() => (ocupadaSinPedido ? onMesaSinPedido(m) : onMesaLibre(m))}
                    className={cx(
                      'w-full aspect-square rounded-ficha border-2 border-dashed p-3 flex flex-col items-start transition',
                      ocupadaSinPedido ? 'border-aji bg-aji/10' : 'border-linea hover:border-tinta/40 hover:bg-papel',
                    )}
                  >
                    <span className="text-xs text-tenue flex items-center gap-1"><Armchair className="w-3.5 h-3.5" /> {m.asientos ?? 4}</span>
                    <span className="font-display font-extrabold text-2xl leading-none mt-1">{m.nombre}</span>
                    <span className="mt-auto text-xs font-semibold text-tenue flex items-center gap-1">
                      {conQr ? <><QrCode className="w-3.5 h-3.5" /> Pidiendo por QR</> : ocupadaSinPedido ? 'Sentados, sin pedido' : 'Libre'}
                    </span>
                  </button>
                  {!ocupadaSinPedido && m.codigo_qr && onAbrirQr && (
                    <button onClick={() => onAbrirQr(m)} title="Habilitar pedido por QR" aria-label={`Habilitar QR en ${m.nombre}`}
                      className="absolute top-2 right-2 w-8 h-8 rounded-lg grid place-items-center text-tenue hover:bg-hundido hover:text-tinta">
                      <QrCode className="w-4 h-4" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
