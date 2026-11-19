import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useBloqueado } from '../lib/bloqueo';
import PantallaBloqueo from '../components/shell/PantallaBloqueo';

export default function Protegida({ children }) {
  const token = useAuthStore((s) => s.token);
  const bloqueado = useBloqueado();
  const loc = useLocation();
  if (!token) return <Navigate to="/login" replace state={{ desde: loc.pathname }} />;
  // Pestaña nueva (o botón Bloquear, o inactividad): pide el PIN antes de mostrar nada.
  if (bloqueado) return <PantallaBloqueo />;
  return children;
}
