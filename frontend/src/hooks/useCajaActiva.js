import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../api/cliente';
import { esErrorDeRed } from '../lib/ventasOffline';
import { useAuthStore } from '../store/authStore';

// Última caja abierta vista por este usuario: si la página se abre sin
// internet se sigue usando para vender en efectivo (ver lib/ventasOffline.js).
const CLAVE_COPIA = 'caja-activa-copia';
function leerCopia(usuarioId, sucursalId) {
  try {
    const c = JSON.parse(localStorage.getItem(CLAVE_COPIA));
    return c?.usuario_id === usuarioId && c?.sucursal_id === sucursalId ? c.sesion : null;
  } catch { return null; }
}

// La sesión de caja abierta por el usuario actual (si tiene una).
export function useCajaActiva() {
  const usuario = useAuthStore((s) => s.usuario);
  const sucursalId = usuario?.sucursal_activa?.id;
  const q = useQuery({
    queryKey: ['caja-estado', sucursalId, 'activa'],
    // A diferencia de getEstadoCajas, un corte de red sí cuenta como error:
    // así se distingue "no hay caja abierta" de "no hay internet".
    queryFn: () => api.get('/caja/estado', { params: { sucursal_id: sucursalId } }).then((r) => r.data.datos)
      .catch((e) => { if (esErrorDeRed(e)) throw e; return []; }),
    retry: 1,
    enabled: !!sucursalId,
    refetchInterval: 60_000,
  });
  const enVivo = (q.data ?? []).map((c) => c.sesion_abierta && { ...c.sesion_abierta, caja_nombre: c.nombre }).find((s) => s?.usuario_id === usuario?.id) ?? null;
  const sinRespuesta = !q.data && q.isError;
  const sesion = sinRespuesta ? leerCopia(usuario?.id, sucursalId) : enVivo;

  useEffect(() => {
    if (!q.data) return;
    try {
      if (enVivo) localStorage.setItem(CLAVE_COPIA, JSON.stringify({ usuario_id: usuario?.id, sucursal_id: sucursalId, sesion: enVivo }));
      else localStorage.removeItem(CLAVE_COPIA);
    } catch { /* sin almacenamiento */ }
  }, [q.data, enVivo?.id, usuario?.id, sucursalId]); // eslint-disable-line react-hooks/exhaustive-deps

  return { sesion, cargando: q.isLoading && !!sucursalId, sinSucursal: !sucursalId };
}
