import { useAuthStore } from '../store/authStore';

export function usePermisos() {
  const permisos = useAuthStore((s) => s.usuario?.permisos ?? []);
  const tiene = (modulo, accion) => permisos.includes(`${modulo}.${accion}`);
  return { permisos, tiene, tienePermiso: tiene };
}
