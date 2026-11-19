// Datos del servidor (React Query) y su copia en este dispositivo para usar
// el sistema sin internet.
//
// - Cada consulta que llegó bien se guarda en IndexedDB. Si la app se abre o
//   se recorre sin conexión, cada pantalla muestra lo último que vio (el menú,
//   las mesas, la caja abierta, los pedidos…) en vez de quedarse vacía.
// - networkMode 'offlineFirst': siempre se intenta pedir al servidor (aunque
//   el navegador diga que no hay red: muchas veces hay wifi pero no internet,
//   o al revés). Si falla, queda el dato guardado.
// - Lo que se guarda (mutaciones) no se queda "esperando" sin conexión: falla
//   enseguida con un aviso claro. Vender en efectivo sí se guarda y se sube
//   después (lib/ventasOffline.js).
// - Al iniciar o cerrar sesión se borra todo: los datos de un usuario no se
//   le muestran al siguiente.
import { QueryClient } from '@tanstack/react-query';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { del, get, set } from 'idb-keyval';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 20_000,
      refetchOnWindowFocus: true,
      retry: 1,
      networkMode: 'offlineFirst',
      // Lo guardado sirve una semana (gcTime tiene que ser al menos eso para que se persista).
      gcTime: 7 * 24 * 60 * 60 * 1000,
    },
    mutations: { networkMode: 'always' },
  },
});

const CLAVE = 'datos-sin-conexion';

export const persister = createAsyncStoragePersister({
  storage: { getItem: (k) => get(k), setItem: (k, v) => set(k, v), removeItem: (k) => del(k) },
  key: CLAVE,
  throttleTime: 2000,
});

export const opcionesPersistencia = {
  persister,
  maxAge: 7 * 24 * 60 * 60 * 1000,
  // Cambiar si cambia la forma de los datos de forma incompatible: descarta lo guardado.
  buster: 'v1',
  dehydrateOptions: {
    // Solo lo que llegó bien. meta.sinCopia para consultas que no deben quedar guardadas.
    shouldDehydrateQuery: (q) => q.state.status === 'success' && !q.meta?.sinCopia,
  },
};

/** Borra los datos en memoria y la copia del dispositivo (al entrar o salir). */
export async function limpiarDatos() {
  queryClient.clear();
  try { await del(CLAVE); } catch { /* sin IndexedDB */ }
}
