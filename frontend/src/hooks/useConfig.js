import { useQuery } from '@tanstack/react-query';
import { getConfiguracion, getConfiguracionPublica } from '../api/configuracion';
import { usePermisos } from './usePermisos';

// Config pública (nombre, logo, color, moneda). Disponible sin permisos.
export function useConfigPublica() {
  return useQuery({ queryKey: ['configuracion-publica'], queryFn: getConfiguracionPublica, staleTime: 5 * 60_000, retry: false });
}

// Config completa: solo para quien puede verla; si no, cae a la pública.
export function useConfig() {
  const { tiene } = usePermisos();
  const completa = useQuery({ queryKey: ['configuracion'], queryFn: getConfiguracion, staleTime: 60_000, enabled: tiene('configuracion', 'ver') });
  const publica = useConfigPublica();
  return { config: completa.data ?? publica.data ?? {}, cargando: completa.isLoading && publica.isLoading };
}

export function useMoneda() {
  const { data } = useConfigPublica();
  return data?.simbolo_moneda || 'Bs';
}
