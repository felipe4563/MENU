import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Printer, ArrowLeft, Bluetooth } from 'lucide-react';
import { usePermisos } from '../../hooks/usePermisos';
import { useAuthStore } from '../../store/authStore';
import { getCajasPublico } from '../../api/cajas';
import { imprimirBluetoothCocina } from '../../utils/rawbt';
import socket from '../../socket';
import { SinPermiso } from '../../components/ui/piezas';
import Hoja from '../../components/ui/Hoja';
import ImpresoraDispositivo from '../../components/shell/ImpresoraDispositivo';
import { cx } from '../../lib/util';

const TTL_DEDUP_MS = 5 * 60_000; // mismo criterio que print-agent/agent.js
const CLAVE_CAJA = 'pantalla-cocina-caja-id';

function useWakeLock() {
  useEffect(() => {
    let lock = null;
    const pedir = async () => { try { lock = await navigator.wakeLock?.request('screen'); } catch { /* opcional */ } };
    pedir();
    const onVis = () => document.visibilityState === 'visible' && pedir();
    document.addEventListener('visibilitychange', onVis);
    return () => { document.removeEventListener('visibilitychange', onVis); lock?.release?.().catch(() => {}); };
  }, []);
}

// Celular o tablet en cocina con impresora Bluetooth (directo o RawBT): recibe las
// comandas por socket y las imprime sola. La pantalla no se apaga.
export default function CocinaBluetoothPage() {
  const { tiene } = usePermisos();
  const [verImpresora, setVerImpresora] = useState(false);
  const navigate = useNavigate();
  const sucursalId = useAuthStore((s) => s.usuario?.sucursal_activa?.id ?? null);
  const { data: cajas = [] } = useQuery({ queryKey: ['cajas-publico', sucursalId], queryFn: () => getCajasPublico(sucursalId), enabled: !!sucursalId });
  const [caja, setCaja] = useState(() => localStorage.getItem(CLAVE_CAJA) || '');
  const [impresos, setImpresos] = useState([]);
  const dedup = useRef(new Map());
  useWakeLock();

  useEffect(() => {
    if (!caja) return;
    const id = Number(caja);
    const unir = () => socket.emit('unirse_caja', id);
    unir();
    socket.on('connect', unir);
    return () => socket.off('connect', unir);
  }, [caja]);

  useEffect(() => {
    const onPrint = (datos) => {
      if (datos?.modo_impresion !== 'bluetooth' || !datos.pedido?.id) return;
      const clave = datos.anulacion ? `cocina-anul:${datos.anulacion.devolucion_id}` : datos.pedido.id;
      const ahora = Date.now();
      for (const [k, t] of dedup.current) if (ahora - t > TTL_DEDUP_MS) dedup.current.delete(k);
      if (dedup.current.has(clave)) return;
      dedup.current.set(clave, ahora);
      imprimirBluetoothCocina(datos);
      const pe = datos.pedido;
      const etiqueta = pe.tipo === 'mesa' ? (pe.mesa?.nombre || 'Mesa') : `${pe.tipo === 'delivery' ? 'Delivery' : 'Llevar'} · ${pe.nombre_cliente || 'Cliente'}`;
      setImpresos((prev) => [{ clave, anulacion: !!datos.anulacion, etiqueta, datos, hora: new Date().toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' }) }, ...prev].slice(0, 30));
    };
    socket.on('print:cocina', onPrint);
    return () => socket.off('print:cocina', onPrint);
  }, []);

  if (!tiene('cocina', 'ver')) return <SinPermiso />;

  return (
    <div className="min-h-dvh bg-pizarra text-sobre-pizarra p-5 flex flex-col gap-5" style={{ paddingTop: 'max(1.25rem, env(safe-area-inset-top))' }}>
      <header className="flex items-center gap-3">
        <button className="btn-icono text-white/70 hover:bg-white/10" onClick={() => navigate('/cocina')} aria-label="Volver"><ArrowLeft className="w-5 h-5" /></button>
        <h1 className="text-2xl font-extrabold text-white flex-1">Impresora de cocina</h1>
        <button className="btn h-10 bg-white/10 text-white" onClick={() => setVerImpresora(true)}>
          <Bluetooth className={cx('w-5 h-5', caja ? 'text-hierba' : 'text-white/60')} /> Impresora
        </button>
      </header>
      {verImpresora && (
        <Hoja onCerrar={() => setVerImpresora(false)} titulo="Impresora de este dispositivo" subtitulo="Para cajas que imprimen por Bluetooth directo." ancho="max-w-sm">
          <ImpresoraDispositivo compacto />
        </Hoja>
      )}
      <label className="block">
        <span className="text-sm text-white/60">¿De qué caja imprime las comandas?</span>
        <select className="campo mt-1 bg-white/10 border-white/15 text-white" value={caja} onChange={(e) => { setCaja(e.target.value); localStorage.setItem(CLAVE_CAJA, e.target.value); }}>
          <option value="">Elige una caja</option>
          {cajas.map((c) => <option key={c.id} value={c.id} className="text-tinta">{c.nombre}</option>)}
        </select>
      </label>
      <p className="text-sm text-white/60">Deja esta pantalla abierta: las comandas se imprimen solas por Bluetooth (directo o con RawBT, según la caja). La pantalla no se apagará mientras esté abierta.</p>
      <section className="flex-1">
        <h2 className="font-display font-bold text-lg text-white mb-2">Impresas en esta sesión</h2>
        {impresos.length === 0 ? <p className="text-white/40 text-sm">Todavía nada.</p> : (
          <ul className="space-y-2">
            {impresos.map((i) => (
              <li key={i.clave} className="flex items-center gap-3 rounded-xl bg-white/8 px-4 py-3">
                <span className="num text-white/50">{i.hora}</span>
                <span className="flex-1 font-semibold">{i.anulacion ? 'ANULAR · ' : ''}{i.etiqueta}</span>
                <button className="btn h-9 bg-white/10 text-white" onClick={() => imprimirBluetoothCocina(i.datos)}><Printer className="w-4 h-4" /> Otra vez</button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
