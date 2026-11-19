import { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { marcarDesbloqueado, useBloqueado } from '../lib/bloqueo';
import { useEnLinea } from '../hooks/useEnLinea';
import PantallaBloqueo from '../components/shell/PantallaBloqueo';

export default function Protegida({ children }) {
  const token = useAuthStore((s) => s.token);
  const usuario = useAuthStore((s) => s.usuario);
  const dispositivoToken = useAuthStore((s) => s.dispositivoToken);
  const bloqueado = useBloqueado();
  const enLinea = useEnLinea();
  const loc = useLocation();
  // Sin internet, quien no tiene PIN no podría desbloquear: sigue usando la app
  // (con internet, la regla normal vuelve en la próxima pestaña nueva).
  const pasaSinPin = Boolean(token && bloqueado && !enLinea && usuario && !usuario.tiene_pin);
  useEffect(() => { if (pasaSinPin) marcarDesbloqueado(); }, [pasaSinPin]);

  // Aparato habilitado: si la sesión se perdió, se pide el PIN (no se va a /login).
  if (usuario && dispositivoToken && (!token || bloqueado) && !pasaSinPin) return <PantallaBloqueo />;
  if (!token) return <Navigate to="/login" replace state={{ desde: loc.pathname }} />;
  // Pestaña nueva (o botón Bloquear, o inactividad): pide el PIN antes de mostrar nada.
  if (bloqueado && !pasaSinPin) return <PantallaBloqueo />;
  return children;
}
