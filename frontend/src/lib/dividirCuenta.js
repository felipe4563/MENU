// Cálculos de la cuenta dividida (sin React). Un pedido se cobra en partes
// por platos (cada unidad se asigna a una persona) o en partes iguales.

// Pedidos que siempre se cobran completos (igual que el backend).
export const ORIGENES_SIN_DIVIDIR = ['autoservicio', 'app_externa'];

const ESTADOS_VIGENTES = ['pendiente', 'completado'];

export const redondear = (n) => Math.round(Number(n || 0) * 100) / 100;

// Partes cobradas o con un QR esperando, en orden.
export const partesVigentes = (pedido) => (pedido?.pagos ?? []).filter((p) => ESTADOS_VIGENTES.includes(p.estado));

// "Juanita" o "Parte 2" (por su número entre las partes vigentes).
export const nombreDeParte = (pago, indice) => pago.persona || `Parte ${indice + 1}`;

export const faltaDe = (pedido) => redondear(Number(pedido?.total || 0) - Number(pedido?.pagado || 0));

const nombreDeDetalle = (d) => (d.combo ? d.combo.nombre : d.producto?.nombre ?? 'Producto');

// Cada unidad vigente del pedido por separado (un plato con cantidad 3 son 3
// unidades). Las que ya pagó (o reservó un QR) una parte llevan su nombre.
export function unidadesDelPedido(pedido) {
  const pagadas = new Map(); // detalle_id -> [nombre por unidad pagada]
  partesVigentes(pedido).forEach((pago, i) => {
    for (const item of pago.items ?? []) {
      const lista = pagadas.get(item.detalle_pedido_id) ?? [];
      for (let k = 0; k < Number(item.cantidad); k++) lista.push(nombreDeParte(pago, i));
      pagadas.set(item.detalle_pedido_id, lista);
    }
  });

  const unidades = [];
  for (const d of pedido?.detalles ?? []) {
    const vigentes = Number(d.cantidad) - Number(d.cantidad_anulada || 0);
    const quien = pagadas.get(d.id) ?? [];
    for (let i = 0; i < vigentes; i++) {
      unidades.push({ clave: `${d.id}:${i}`, detalle_id: d.id, nombre: nombreDeDetalle(d), precio: Number(d.precio), pagadaPor: quien[i] ?? null });
    }
  }
  return unidades;
}

// `falta` en n partes; la última absorbe los centavos y la suma es exacta.
export function partesIguales(falta, n) {
  const partes = Math.max(1, Math.floor(n));
  const centavos = Math.round(Number(falta || 0) * 100);
  const base = Math.floor(centavos / partes);
  return Array.from({ length: partes }, (_, i) => (i === partes - 1 ? centavos - base * (partes - 1) : base) / 100);
}

const detalleDeClave = (clave) => Number(String(clave).split(':')[0]);

// asignaciones: { [clave]: persona }. Devuelve los platos que paga esa persona.
export function itemsDePersona(asignaciones, persona) {
  const porDetalle = new Map();
  for (const [clave, quien] of Object.entries(asignaciones)) {
    if (quien !== persona) continue;
    const id = detalleDeClave(clave);
    porDetalle.set(id, (porDetalle.get(id) || 0) + 1);
  }
  return [...porDetalle].map(([detalle_pedido_id, cantidad]) => ({ detalle_pedido_id, cantidad }));
}

export function subtotalDePersona(asignaciones, persona, unidades) {
  const precio = new Map(unidades.map((u) => [u.clave, u.precio]));
  return redondear(Object.entries(asignaciones).reduce((s, [clave, quien]) => (quien === persona ? s + (precio.get(clave) ?? 0) : s), 0));
}

// Vuelve a acomodar las asignaciones sobre las unidades sin pagar (después de
// que alguien pagó o el pedido cambió). Las que siguen siendo válidas quedan
// donde estaban; las que cayeron en una unidad ya pagada (o que ya no existe)
// pasan a otra libre del mismo plato, y si no hay, se descartan.
export function acomodarAsignaciones(asignaciones, unidades) {
  const libres = new Map(unidades.filter((u) => !u.pagadaPor).map((u) => [u.clave, u]));
  const nuevas = {};
  const sueltas = [];
  for (const [clave, persona] of Object.entries(asignaciones)) {
    if (libres.has(clave)) nuevas[clave] = persona;
    else sueltas.push({ id: detalleDeClave(clave), persona });
  }
  for (const { id, persona } of sueltas) {
    const destino = [...libres.values()].find((u) => u.detalle_id === id && !(u.clave in nuevas));
    if (destino) nuevas[destino.clave] = persona;
  }
  return nuevas;
}
