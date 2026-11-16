// Reparte un monto entre personas según un peso (minutos trabajados, o 1
// para partes iguales). Se calcula en centavos: lo que sobra del redondeo va
// a quienes tienen más peso, así la suma da exacto el total.
export function repartir(total, pesos) {
  const centavos = Math.round(Number(total || 0) * 100);
  const suma = pesos.reduce((a, w) => a + w, 0);
  if (!suma || !centavos) return pesos.map(() => 0);
  const base = pesos.map((w) => Math.floor((centavos * w) / suma));
  let sobra = centavos - base.reduce((a, c) => a + c, 0);
  const orden = pesos.map((_, i) => i).sort((a, b) => pesos[b] - pesos[a] || a - b);
  for (let k = 0; sobra > 0; k = (k + 1) % orden.length, sobra -= 1) base[orden[k]] += 1;
  return base.map((c) => c / 100);
}

// 135 -> "2 h 15 min"; 40 -> "40 min".
export function horasTexto(min) {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const resto = min % 60;
  return resto ? `${h} h ${resto} min` : `${h} h`;
}
