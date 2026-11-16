// Receta de un producto: conversión entre lo que guarda el servidor y las
// líneas que se editan en Menú › Productos (ver pages/menu/RecetaProducto.jsx).

export const UNIDADES = { kilogramo: 'kg', gramo: 'g', litro: 'L', mililitro: 'ml', arroba: '@', libra: 'lb', unidad: 'u' };

// Lo que llega del servidor → líneas editables.
export const lineasDeReceta = (receta) => (receta ?? []).map((l) => ({
  insumo_id: l.insumo_id, cantidad: String(Number(l.cantidad)), opcion_id: l.opcion_id ?? null,
}));
// Líneas editables → lo que se guarda (las incompletas no van).
export const recetaParaGuardar = (lineas) => lineas
  .filter((l) => l.insumo_id && Number(l.cantidad) > 0)
  .map((l) => ({ insumo_id: Number(l.insumo_id), cantidad: Number(l.cantidad), opcion_id: l.opcion_id || null }));
export const lineasIncompletas = (lineas) => lineas.filter((l) => (l.insumo_id && !(Number(l.cantidad) > 0)) || (!l.insumo_id && l.cantidad !== '')).length;
