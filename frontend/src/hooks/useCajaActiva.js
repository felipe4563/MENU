import { useQuery } from '@tanstack/react-query';
import { getEstadoCajas } from '../api/caja';
import { useAuthStore } from '../store/authStore';

// La sesión de caja abierta por el usuario actual (si tiene una).
export function useCajaActiva() {
  const usuario = useAuthStore((s) => s.usuario);
  const sucursalId = usuario?.sucursal_activa?.id;
  const q = useQuery({
    queryKey: ['caja-estado', sucursalId],
    queryFn: () => getEstadoCajas(sucursalId),
    enabled: !!sucursalId,
    refetchInterval: 60_000,
  });
  const sesion = (q.data ?? []).map((c) => c.sesion_abierta && { ...c.sesion_abierta, caja_nombre: c.nombre }).find((s) => s?.usuario_id === usuario?.id) ?? null;
  return { sesion, cargando: q.isLoading && !!sucursalId, sinSucursal: !sucursalId };
}
