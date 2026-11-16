// Arma la grilla del flujo de caja a partir de lo que devuelve
// GET /flujo-caja (movimientos del mes agrupados por día, medio, categoría y
// detalle). Todo valor es { efectivo, qr }; el total es la suma.
//
// Cuentas (las mismas de la planilla de Excel del negocio, ordenadas):
//   flujo de la operación = ingresos − costos (variable + fijo + otros gastos)
//   saldo final del día   = saldo inicial + flujo de la operación
//                           − retiros/fuera del negocio ± traspasos ± ajustes
// El saldo inicial de cada día es el final del anterior; el del día 1 viene
// del servidor (todo lo anterior al mes).

export const MEDIOS = ['efectivo', 'qr'];
export const cero = () => ({ efectivo: 0, qr: 0 });
export const totalDe = (v) => (v ? v.efectivo + v.qr : 0);
const r2 = (n) => Math.round(n * 100) / 100;
const sumar = (a, b, signo = 1) => { a.efectivo = r2(a.efectivo + signo * b.efectivo); a.qr = r2(a.qr + signo * b.qr); return a; };

const OPERATIVOS = ['costo_variable', 'costo_fijo', 'otros_gastos'];
const DIAS_SEMANA = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];

export function armarFlujo(datos) {
  const { dias: n, desde, hoy, saldo_inicial: saldoIni, filas, grupos, categorias } = datos;
  const mes = desde.slice(0, 7);
  const dias = Array.from({ length: n }, (_, i) => {
    const fecha = `${mes}-${String(i + 1).padStart(2, '0')}`;
    const semana = new Date(`${fecha}T12:00:00`).getDay();
    return { n: i + 1, fecha, letra: DIAS_SEMANA[semana], finde: semana === 0 || semana === 6, hoy: fecha === hoy, futuro: fecha > hoy };
  });
  const indice = Object.fromEntries(dias.map((d, i) => [d.fecha, i]));
  const vacioDias = () => dias.map(cero);

  // Categoría → { porDia, total, detalles: Map(nombre → { porDia, total }) }
  const porCat = {};
  categorias.forEach((c) => { porCat[c.clave] = { ...c, porDia: vacioDias(), total: cero(), detalles: new Map() }; });
  const traspasos = vacioDias();
  const ajustes = vacioDias();

  for (const f of filas) {
    const i = indice[f.dia];
    const cat = porCat[f.categoria];
    if (i == null || !cat) continue;
    const medio = f.metodo === 'efectivo' ? 'efectivo' : 'qr';
    const v = cero();
    v[medio] = f.total;
    // Los traspasos y ajustes llevan signo; el resto es positivo y su grupo
    // dice si suma o resta.
    if (cat.grupo === 'traspaso' || cat.grupo === 'ajuste') {
      sumar((cat.grupo === 'traspaso' ? traspasos : ajustes)[i], v, f.tipo === 'ingreso' ? 1 : -1);
    }
    const signoFila = (cat.grupo === 'traspaso' || cat.grupo === 'ajuste') && f.tipo === 'egreso' ? -1 : 1;
    sumar(cat.porDia[i], v, signoFila);
    sumar(cat.total, v, signoFila);
    const nombre = f.detalle || '';
    if (nombre) {
      if (!cat.detalles.has(nombre)) cat.detalles.set(nombre, { nombre, porDia: vacioDias(), total: cero() });
      const d = cat.detalles.get(nombre);
      sumar(d.porDia[i], v, signoFila);
      sumar(d.total, v, signoFila);
    }
  }

  const bloques = grupos.map((g) => {
    const cats = categorias.filter((c) => c.grupo === g.clave && (c.activo !== false || totalDe(porCat[c.clave].total) !== 0 || porCat[c.clave].porDia.some((v) => v.efectivo || v.qr))).map((c) => {
      const x = porCat[c.clave];
      return { ...x, detalles: [...x.detalles.values()].sort((a, b) => totalDe(b.total) - totalDe(a.total)) };
    });
    const porDia = vacioDias();
    const total = cero();
    cats.forEach((c) => { c.porDia.forEach((v, i) => sumar(porDia[i], v)); sumar(total, c.total); });
    const conMovimiento = cats.filter((c) => totalDe(c.total) !== 0 || c.porDia.some((v) => v.efectivo || v.qr));
    return { ...g, categorias: cats, conMovimiento, porDia, total };
  });
  const bloque = (clave) => bloques.find((b) => b.clave === clave);

  // Totales por día.
  const ingresos = bloque('ingresos').porDia;
  const gastos = vacioDias();
  OPERATIVOS.forEach((k) => bloque(k).porDia.forEach((v, i) => sumar(gastos[i], v)));
  const flujo = dias.map((_, i) => sumar(sumar(cero(), ingresos[i]), gastos[i], -1));
  const fuera = bloque('no_operativo').porDia;
  const saldoInicial = [];
  const saldoFinal = [];
  let saldo = { efectivo: saldoIni.efectivo || 0, qr: saldoIni.qr || 0 };
  dias.forEach((_, i) => {
    saldoInicial.push({ ...saldo });
    saldo = sumar(sumar(sumar(sumar({ ...saldo }, flujo[i]), fuera[i], -1), traspasos[i]), ajustes[i]);
    saldoFinal.push({ ...saldo });
  });

  const sumaMes = (arr) => arr.reduce((s, v) => sumar(s, v), cero());
  const ultimoReal = dias.reduce((k, d, i) => (d.futuro ? k : i), -1);
  const resumen = {
    saldoInicial: { ...saldoInicial[0] },
    ingresos: sumaMes(ingresos),
    gastos: sumaMes(gastos),
    flujo: sumaMes(flujo),
    fuera: sumaMes(fuera),
    traspasos: sumaMes(traspasos),
    ajustes: sumaMes(ajustes),
    // Al final del mes o, si el mes está en curso, al final de hoy.
    saldoFinal: { ...saldoFinal[ultimoReal >= 0 ? ultimoReal : 0] },
    mesEnCurso: dias.some((d) => d.hoy),
    // El gasto más grande del mes (categoría operativa).
    mayorGasto: bloques.filter((b) => OPERATIVOS.includes(b.clave)).flatMap((b) => b.categorias)
      .sort((a, b) => totalDe(b.total) - totalDe(a.total))[0] ?? null,
    diasEnRojo: dias.filter((d, i) => !d.futuro && totalDe(flujo[i]) < 0).length,
  };

  return { dias, bloques, filas: { ingresos, gastos, flujo, fuera, traspasos, ajustes, saldoInicial, saldoFinal }, resumen };
}

// Categorías que se pueden elegir al registrar un gasto (o un ingreso),
// agrupadas como en el flujo. Vienen de GET /flujo-caja/categorias y se
// editan en Flujo de caja › Clasificar gastos. `actual` se ofrece aunque esté
// oculta (al editar algo ya anotado).
export function categoriasElegibles(datos, tipo = 'egreso', actual = null) {
  if (!datos) return [];
  return datos.grupos
    .filter((g) => g.tipo === tipo)
    .map((g) => ({ ...g, categorias: datos.categorias.filter((c) => c.grupo === g.clave && !c.auto && (c.activo || c.clave === actual)) }))
    .filter((g) => g.categorias.length);
}
