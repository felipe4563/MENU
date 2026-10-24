// frontend/src/pages/cocina/PantallaCocinaImpresion.jsx
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Printer, AlertCircle } from 'lucide-react';
import { usePermisos } from '../../hooks/usePermisos';
import { useAuth } from '../../hooks/useAuth';
import { getCajasPublico } from '../../api/cajas';
import { imprimirBluetoothCocina } from '../../utils/rawbt';
import socket from '../../socket';

const TTL_DEDUP_MS = 5 * 60_000; // mismo criterio que print-agent/agent.js
const CLAVE_CAJA_LOCALSTORAGE = 'pantalla-cocina-caja-id';

function useWakeLock() {
  useEffect(() => {
    let lock = null;
    async function pedir() {
      if (!('wakeLock' in navigator)) return;
      try { lock = await navigator.wakeLock.request('screen'); } catch { /* no bloqueante */ }
    }
    pedir();
    // Algunos navegadores sueltan el wake lock al perder foco — se vuelve a
    // pedir cuando la pestaña vuelve a estar visible.
    function onVisibilidad() {
      if (document.visibilityState === 'visible') pedir();
    }
    document.addEventListener('visibilitychange', onVisibilidad);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilidad);
      lock?.release?.().catch(() => {});
    };
  }, []);
}

export default function PantallaCocinaImpresion() {
  const { tienePermiso } = usePermisos();
  const puedeVer = tienePermiso('cocina', 'ver');
  const { usuario } = useAuth();
  const sucursalId = usuario?.sucursal_activa?.id ?? null;
  const { data: cajas = [] } = useQuery({
    queryKey: ['cajas-publico', sucursalId],
    queryFn: () => getCajasPublico(sucursalId),
    enabled: !!sucursalId,
  });
  const [cajaVinculada, setCajaVinculada] = useState(() => localStorage.getItem(CLAVE_CAJA_LOCALSTORAGE) || '');
  const [impresos, setImpresos] = useState([]); // [{ pedidoId, etiqueta, hora }], más reciente primero
  const dedupRef = useRef(new Map()); // pedidoId -> timestamp

  useWakeLock();

  useEffect(() => {
    if (!cajaVinculada) return;
    const id = Number(cajaVinculada);
    socket.emit('unirse_caja', id);
    function onConnect() {
      socket.emit('unirse_caja', id);
    }
    socket.on('connect', onConnect);
    return () => socket.off('connect', onConnect);
  }, [cajaVinculada]);

  useEffect(() => {
    function limpiarVencidos() {
      const ahora = Date.now();
      for (const [id, t] of dedupRef.current) {
        if (ahora - t > TTL_DEDUP_MS) dedupRef.current.delete(id);
      }
    }

    function onPrintCocina(datos) {
      if (datos?.modo_impresion !== 'bluetooth') return;
      const pedidoId = datos.pedido?.id;
      if (!pedidoId) return;

      // Un aviso "ANULAR" comparte el id del pedido con su comanda: se
      // deduplica por la devolución para no descartarlo como repetido.
      const claveDedup = datos.anulacion
        ? `cocina-anul:${datos.anulacion.devolucion_id}`
        : pedidoId;
      limpiarVencidos();
      if (dedupRef.current.has(claveDedup)) return;
      dedupRef.current.set(claveDedup, Date.now());

      imprimirBluetoothCocina(datos);

      const etiqueta = datos.pedido.tipo === 'mesa'
        ? (datos.pedido.mesa?.nombre || 'Mesa')
        : datos.pedido.tipo === 'delivery'
          ? `Delivery — ${datos.pedido.nombre_cliente || 'Cliente'}`
          : `Para llevar — ${datos.pedido.nombre_cliente || 'Cliente'}`;
      const hora = new Date().toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' });
      setImpresos((prev) => [{ pedidoId, clave: claveDedup, anulacion: !!datos.anulacion, etiqueta, hora }, ...prev].slice(0, 30));
    }

    socket.on('print:cocina', onPrintCocina);
    return () => socket.off('print:cocina', onPrintCocina);
  }, []);

  if (!puedeVer) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
        <AlertCircle className="w-10 h-10" />
        <p className="font-medium">No tienes permiso para ver esta pantalla</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
          <Printer className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-foreground">Pantalla de cocina — impresión Bluetooth</h1>
          <p className="text-xs text-muted-foreground">Dejá esta pantalla abierta en el dispositivo con la impresora emparejada. Imprime sola cada comanda que llega.</p>
        </div>
      </div>

      <div className="bg-card rounded-2xl border border-border p-4 space-y-2 max-w-md">
        <label htmlFor="caja-vinculada" className="text-xs font-medium text-muted-foreground">
          Vincular a una caja específica (opcional — solo si tu negocio usa "cocina por caja")
        </label>
        <select
          id="caja-vinculada"
          value={cajaVinculada}
          onChange={(e) => {
            const valor = e.target.value;
            setCajaVinculada(valor);
            if (valor) localStorage.setItem(CLAVE_CAJA_LOCALSTORAGE, valor);
            else localStorage.removeItem(CLAVE_CAJA_LOCALSTORAGE);
          }}
          className="w-full bg-background border border-input rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">Sin vincular (cocina centralizada)</option>
          {cajas.map((c) => (
            <option key={c.id} value={c.id}>{c.nombre}</option>
          ))}
        </select>
      </div>

      <div className="bg-card rounded-2xl border border-border p-4">
        <h2 className="text-sm font-semibold text-foreground mb-3">Comandas impresas</h2>
        {impresos.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">Esperando comandas...</p>
        ) : (
          <div className="space-y-2">
            {impresos.map((item) => (
              <div key={item.clave ?? item.pedidoId} className="flex items-center justify-between text-sm border-b border-border pb-2">
                <span className="text-foreground">{item.anulacion ? 'ANULAR' : 'Comanda'} #{item.pedidoId} — {item.etiqueta}</span>
                <span className="text-muted-foreground text-xs">{item.hora}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
