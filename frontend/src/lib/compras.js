// Ayudas para armar una compra (líneas de qué, cantidad, costo c/u).
import { useQuery } from '@tanstack/react-query';
import { getCatalogoCompras } from '../api/compras';

export const lineaVacia = () => ({ clave: '', cantidad: '', costo_unitario: '' });

export const lineasValidas = (items) =>
  items.filter((x) => x.clave && Number(x.cantidad) > 0 && x.costo_unitario !== '' && Number(x.costo_unitario) >= 0);

export const totalLineas = (items) =>
  lineasValidas(items).reduce((s, x) => s + Number(x.cantidad) * Number(x.costo_unitario), 0);

// "i:12" → { insumo_id: 12 }, "p:5" → { producto_id: 5 }.
export const itemsParaApi = (items) => lineasValidas(items).map((x) => {
  const [t, id] = x.clave.split(':');
  return { [t === 'p' ? 'producto_id' : 'insumo_id']: Number(id), cantidad: Number(x.cantidad), costo_unitario: Number(x.costo_unitario) };
});

// Proveedores, insumos y productos con stock: lo justo para armar la compra.
export function useCatalogoCompras(enabled = true) {
  return useQuery({ queryKey: ['compras-catalogo'], queryFn: getCatalogoCompras, staleTime: 60_000, enabled });
}
