import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getProductos } from '../../api/productos';
import { getCategorias } from '../../api/categorias';
import { getCombosActivos } from '../../api/combos';
import { getPromocionesActivas } from '../../api/promociones';
import { redondearAMedio } from '../../utils/precio';

// Todo lo que se puede vender, con el precio de promoción ya aplicado.
export function useCatalogo() {
  const productos = useQuery({
    queryKey: ['productos-pos'],
    queryFn: () => getProductos({ solo_vendibles: true, solo_disponibles: true, order_by: 'mas_vendido' }),
    staleTime: 60_000,
  });
  const categorias = useQuery({ queryKey: ['categorias'], queryFn: getCategorias, staleTime: 5 * 60_000 });
  const combos = useQuery({ queryKey: ['combos-activos'], queryFn: getCombosActivos, staleTime: 60_000 });
  const promos = useQuery({ queryKey: ['promociones-activas'], queryFn: getPromocionesActivas, staleTime: 60_000 });

  const promoPorProducto = useMemo(() => {
    const m = {};
    (promos.data ?? []).forEach((p) => { m[p.producto_id] = p; });
    return m;
  }, [promos.data]);

  const precioDe = (prod) => {
    const base = parseFloat(prod.precio);
    const promo = promoPorProducto[prod.id];
    if (!promo) return base;
    const desc = promo.tipo === 'porcentaje' ? base * (parseFloat(promo.valor) / 100) : parseFloat(promo.valor);
    return redondearAMedio(Math.max(0, base - desc));
  };

  const cats = useMemo(() => {
    const usadas = new Set((productos.data ?? []).map((p) => p.categoria_id));
    return (categorias.data ?? []).filter((c) => c.activo !== false && c.activo !== 0 && usadas.has(c.id));
  }, [categorias.data, productos.data]);

  return {
    productos: productos.data ?? [],
    categorias: cats,
    combos: combos.data ?? [],
    promoPorProducto,
    precioDe,
    cargando: productos.isLoading,
    error: productos.error,
  };
}

export function contenidoCombo(combo) {
  return (combo.productos || []).map((p) => `${p.ComboProducto?.cantidad ?? 1}× ${p.nombre}`).join(', ');
}

export function extraOpcionesCombo(combo, opcionesPorProducto) {
  const porId = new Map();
  (combo.productos || []).forEach((p) => (p.grupos_opciones || []).forEach((g) => (g.opciones || []).forEach((o) => porId.set(o.id, o))));
  return (opcionesPorProducto || []).reduce(
    (s, e) => s + (e.opcion_ids || []).reduce((t, id) => t + parseFloat(porId.get(id)?.precio_adicional || 0), 0),
    0,
  );
}

export function claveCombo(opcionesPorProducto) {
  return JSON.stringify(
    [...(opcionesPorProducto || [])]
      .map((o) => ({ producto_id: o.producto_id, opcion_ids: [...(o.opcion_ids || [])].sort((a, b) => a - b) }))
      .sort((a, b) => a.producto_id - b.producto_id),
  );
}

// Una línea de pedido guardada en el backend → texto de sus opciones.
export function textoOpcionesDetalle(d) {
  if (d.combo_opciones?.length) {
    return d.combo_opciones.map((o) => `${o.producto?.nombre}: ${o.opcion?.nombre}`).join(' · ');
  }
  if (d.opciones?.length) return d.opciones.map((o) => o.nombre).join(' · ');
  return null;
}

export function nombreDetalle(d) {
  if (d.combo) return d.combo.nombre;
  return d.producto?.nombre ?? 'Producto';
}

export function etiquetaDestino(p) {
  if (!p) return '';
  if (p.tipo === 'mesa') return p.mesa?.nombre ?? 'Mesa';
  if (p.tipo === 'delivery') return `Delivery #${p.numero_llevar ?? p.id}`;
  return `Llevar #${p.numero_llevar ?? p.id}`;
}
