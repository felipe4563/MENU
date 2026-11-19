// Activar las notificaciones push en este dispositivo (Mi perfil).
import { useEffect, useState } from 'react';
import { Bell, BellOff, CheckCircle2, Send } from 'lucide-react';
import { activarPush, desactivarPush, probarPush, soportePush, suscripcionActual } from '../../lib/push';
import { avisar } from '../ui/Aviso';
import { errorDe } from '../../lib/util';

const AVISOS = [
  'Pedidos que hacen los clientes desde la mesa con el QR.',
  'Pedidos nuevos de delivery.',
  'Cuando cocina marca listo un pedido que tú tomaste.',
];

export default function Notificaciones() {
  const soporte = soportePush();
  const [activo, setActivo] = useState(null); // null = revisando
  const [ocupado, setOcupado] = useState(false);
  const bloqueado = soporte === 'ok' && Notification.permission === 'denied';

  useEffect(() => {
    let vivo = true;
    suscripcionActual().then((s) => vivo && setActivo(!!s && Notification.permission === 'granted')).catch(() => vivo && setActivo(false));
    return () => { vivo = false; };
  }, []);

  const hacer = (fn) => async () => {
    setOcupado(true);
    try { await fn(); } catch (e) { avisar.error(errorDe(e, e.message)); } finally { setOcupado(false); }
  };

  const activar = hacer(async () => {
    const r = await activarPush();
    if (r === 'denegado') return avisar.error('No diste permiso. Actívalo en los ajustes del navegador para este sitio.');
    setActivo(true);
    avisar.ok('Notificaciones activadas');
  });
  const desactivar = hacer(async () => { await desactivarPush(); setActivo(false); avisar.ok('Notificaciones desactivadas en este dispositivo'); });
  const probar = hacer(async () => { await probarPush(); avisar.ok('Aviso de prueba enviado'); });

  return (
    <div className="space-y-4 text-sm">
      <ul className="text-tenue space-y-1 list-disc pl-5">
        {AVISOS.map((a) => <li key={a}>{a}</li>)}
      </ul>

      {soporte === 'instalar' ? (
        <p className="rounded-xl bg-hundido p-3">En iPhone y iPad las notificaciones funcionan solo con la app instalada. Instálala (más abajo, en <b>Instalar la app</b>), ábrela desde su ícono y actívalas acá.</p>
      ) : soporte === 'sin-soporte' ? (
        <p className="rounded-xl bg-hundido p-3">Este navegador no recibe notificaciones. Usa Chrome, Edge o Firefox.</p>
      ) : bloqueado ? (
        <p className="rounded-xl bg-hundido p-3 flex gap-2"><BellOff className="w-4 h-4 shrink-0 mt-0.5" /> Las bloqueaste para este sitio. Toca el candado junto a la dirección (o los ajustes del navegador), permite las notificaciones y vuelve acá.</p>
      ) : activo ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-2"><CheckCircle2 className="w-5 h-5 text-hierba" /> Activadas en este dispositivo.</span>
          <button type="button" className="btn-borde" disabled={ocupado} onClick={probar}><Send className="w-4 h-4" /> Probar</button>
          <button type="button" className="btn-fantasma" disabled={ocupado} onClick={desactivar}>Desactivar</button>
        </div>
      ) : (
        <button type="button" className="btn-aji" disabled={ocupado || activo === null} onClick={activar}><Bell className="w-4 h-4" /> Activar notificaciones</button>
      )}
    </div>
  );
}
