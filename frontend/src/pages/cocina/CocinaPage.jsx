import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChefHat, Bell, BellOff, Maximize2, Check, HandPlatter, ShoppingBag, Bike, Armchair } from 'lucide-react';
import { getCocinaOrders, marcarListo, marcarEntregado } from '../../api/ventas';
import { usePermisos } from '../../hooks/usePermisos';
import { useSocket } from '../../hooks/useSocket';
import { Cargando, SinPermiso } from '../../components/ui/piezas';
import { avisar } from '../../components/ui/Aviso';
import { cx, errorDe, hora } from '../../lib/util';
import { etiquetaDestino } from '../vender/datosCatalogo';

function pitido() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.18].forEach((t) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.15);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + t);
      o.stop(ctx.currentTime + t + 0.16);
    });
  } catch { /* sin audio */ }
}

function useAhora(ms = 30_000) {
  const [, set] = useState(0);
  useEffect(() => { const t = setInterval(() => set((x) => x + 1), ms); return () => clearInterval(t); }, [ms]);
}

const minutos = (f) => Math.max(0, Math.floor((Date.now() - new Date(f)) / 60000));

function Ticket({ p, onAccion, ocupado }) {
  const m = minutos(p.creado_en);
  const listo = p.estado_cocina === 'listo';
  const tono = listo ? 'bg-hierba' : m >= 20 ? 'bg-locoto' : m >= 10 ? 'bg-aji' : 'bg-tinta';
  const Icono = p.tipo === 'mesa' ? Armchair : p.tipo === 'delivery' ? Bike : ShoppingBag;
  return (
    <article className="w-[270px] shrink-0 flex flex-col animate-imprime">
      {/* gancho del riel */}
      <div className="mx-auto w-3 h-5 bg-white/25 rounded-b" />
      <div className="comanda rounded-t-md text-tinta flex flex-col shadow-flota">
        <header className={cx('px-4 py-3 text-white flex items-center gap-2', tono, tono === 'bg-aji' && 'text-sobre-aji')}>
          <Icono className="w-5 h-5" />
          <span className="font-display font-extrabold text-xl flex-1 truncate">{etiquetaDestino(p)}</span>
          <span className="num font-bold text-lg">{m}′</span>
        </header>
        <div className="px-4 pt-2 text-xs text-tenue flex justify-between">
          <span>#{p.id} · {hora(p.creado_en)}</span>
          <span className="truncate ml-2">{p.nombre_cliente}</span>
        </div>
        <ul className="px-4 py-2 space-y-2.5">
          {p.detalles.map((d) => {
            const op = d.combo_opciones?.length
              ? d.combo_opciones.map((o) => `${o.producto?.nombre}: ${o.opcion?.nombre}`)
              : (d.opciones ?? []).map((o) => o.nombre);
            return (
              <li key={d.id} className="flex gap-2.5">
                <span className="num font-extrabold text-xl leading-6 w-7 shrink-0">{d.peso ? '1' : d.cantidad}</span>
                <div className="min-w-0">
                  <p className="font-semibold text-[17px] leading-6">{d.combo ? d.combo.nombre : d.producto?.nombre}{d.peso ? ` · ${Number(d.peso)} kg` : ''}</p>
                  {d.combo?.productos?.length > 0 && <p className="text-xs text-tenue">{d.combo.productos.map((x) => x.nombre).join(', ')}</p>}
                  {op.length > 0 && <p className="text-[13px] font-medium">{op.join(' · ')}</p>}
                  {d.nota && !op.length && <p className="text-[13px] italic">“{d.nota}”</p>}
                </div>
              </li>
            );
          })}
        </ul>
        {p.notas && <p className="mx-4 mb-2 text-sm rounded-lg bg-aji/20 px-2.5 py-1.5">⚠ {p.notas}</p>}
        <div className="perforado mx-4" />
        <div className="p-3">
          <button disabled={ocupado} onClick={onAccion} className={cx('btn btn-lg w-full', listo ? 'bg-tinta text-fondo' : 'bg-hierba text-white')}>
            {listo ? <><HandPlatter className="w-5 h-5" /> Entregado</> : <><Check className="w-5 h-5" /> Listo</>}
          </button>
        </div>
      </div>
    </article>
  );
}

function Riel({ titulo, pedidos, vacio, onAccion, ocupado }) {
  return (
    <section className="min-h-0">
      <div className="flex items-baseline gap-2 px-5 mb-2">
        <h2 className="font-display font-bold text-xl text-white">{titulo}</h2>
        <span className="num text-white/50">{pedidos.length}</span>
      </div>
      <div className="relative">
        <div className="absolute left-0 right-0 top-0 h-2 bg-gradient-to-b from-white/30 to-white/10 rounded-full mx-3" />
        <div className="flex gap-4 overflow-x-auto scroll-fino px-5 pb-5 items-start min-h-[120px]">
          {pedidos.length === 0 ? <p className="text-white/40 pt-8 text-sm">{vacio}</p> : pedidos.map((p) => (
            <Ticket key={p.id} p={p} ocupado={ocupado} onAccion={() => onAccion(p)} />
          ))}
        </div>
      </div>
    </section>
  );
}

export default function CocinaPage() {
  const { tiene } = usePermisos();
  const qc = useQueryClient();
  const [sonido, setSonido] = useState(() => localStorage.getItem('cocina-sonido') !== 'no');
  const vistos = useRef(null);
  useAhora();

  const q = useQuery({ queryKey: ['cocina'], queryFn: getCocinaOrders, enabled: tiene('cocina', 'ver'), refetchInterval: 60_000 });
  useSocket('restaurante:actualizar', () => qc.invalidateQueries({ queryKey: ['cocina'] }));

  // Pita cuando aparece un pedido que no estaba.
  useEffect(() => {
    if (!q.data) return;
    const ids = new Set(q.data.map((p) => p.id));
    if (vistos.current && sonido && q.data.some((p) => !vistos.current.has(p.id))) pitido();
    vistos.current = ids;
  }, [q.data, sonido]);

  const accion = useMutation({
    mutationFn: (p) => (p.estado_cocina === 'listo' ? marcarEntregado(p.id) : marcarListo(p.id)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cocina'] }),
    onError: (e) => avisar.error(errorDe(e)),
  });

  if (!tiene('cocina', 'ver')) return <SinPermiso />;
  const pedidos = q.data ?? [];
  const preparando = pedidos.filter((p) => p.estado_cocina === 'pendiente');
  const listos = pedidos.filter((p) => p.estado_cocina === 'listo');

  return (
    <div className="min-h-full bg-pizarra text-sobre-pizarra flex flex-col">
      <header className="flex items-center gap-3 px-5 py-4">
        <ChefHat className="w-7 h-7 text-aji" />
        <h1 className="text-2xl font-extrabold text-white flex-1">Cocina</h1>
        <button className="btn-icono text-white/70 hover:bg-white/10" title={sonido ? 'Silenciar' : 'Activar sonido'} onClick={() => { const v = !sonido; setSonido(v); localStorage.setItem('cocina-sonido', v ? 'si' : 'no'); if (v) pitido(); }}>
          {sonido ? <Bell className="w-5 h-5" /> : <BellOff className="w-5 h-5" />}
        </button>
        <button className="btn-icono text-white/70 hover:bg-white/10" title="Pantalla completa" onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.())}>
          <Maximize2 className="w-5 h-5" />
        </button>
      </header>
      {q.isLoading ? <Cargando className="text-white/60" /> : (
        <div className="flex-1 flex flex-col gap-6 pb-6">
          <Riel titulo="Preparando" pedidos={preparando} vacio="Nada en preparación. Los pedidos nuevos aparecen solos." onAccion={accion.mutate} ocupado={accion.isPending} />
          <Riel titulo="Listos para entregar" pedidos={listos} vacio="Cuando marques un pedido como listo, pasa aquí." onAccion={accion.mutate} ocupado={accion.isPending} />
        </div>
      )}
    </div>
  );
}
