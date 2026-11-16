// Cuánto ganó cada trabajador, período por período, según su forma de pago y
// los días que marcó entrada. Funciones puras (sin base de datos): el
// servicio junta los datos y esto hace la cuenta.
//
// - Diario: gana el monto cada día que marcó entrada.
// - Semanal (lunes a domingo), quincenal (1–15, 16–fin) y mensual: gana el
//   monto del período. Si "descuenta faltas", cada día que le tocaba trabajar
//   (según su horario) y no marcó ni tiene la falta justificada se descuenta
//   a razón de monto ÷ días que le tocaban en el período. Sin horario cargado
//   no se puede saber qué días le tocaban: no se descuenta nada.
// - Un período que empieza a mitad (entró el 10, cambió de sueldo) se paga
//   en proporción: el valor del día sale del período completo.
// - "Se le debe" = lo ganado hasta hoy + bonos − descuentos − pagos y
//   adelantos. Los adelantos se descuentan solos al final.

const r2 = (n) => Math.round(n * 100) / 100;
const MODALIDADES = ['diario', 'semanal', 'quincenal', 'mensual'];

function sumarDias(fecha, n) {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const diaSemana = (fecha) => new Date(`${fecha}T12:00:00Z`).getUTCDay(); // 0 = domingo
const finDeMes = (fecha) => {
  const [a, m] = fecha.split('-').map(Number);
  return `${fecha.slice(0, 7)}-${String(new Date(Date.UTC(a, m, 0)).getUTCDate()).padStart(2, '0')}`;
};

// El período completo (natural) que contiene la fecha.
function periodoDe(modalidad, fecha) {
  switch (modalidad) {
    case 'diario': return [fecha, fecha];
    case 'semanal': {
      const lunes = sumarDias(fecha, -((diaSemana(fecha) + 6) % 7));
      return [lunes, sumarDias(lunes, 6)];
    }
    case 'quincenal':
      return Number(fecha.slice(8)) <= 15
        ? [`${fecha.slice(0, 7)}-01`, `${fecha.slice(0, 7)}-15`]
        : [`${fecha.slice(0, 7)}-16`, finDeMes(fecha)];
    default: return [`${fecha.slice(0, 7)}-01`, finDeMes(fecha)];
  }
}

function* dias(desde, hasta) {
  for (let f = desde; f <= hasta; f = sumarDias(f, 1)) yield f;
}

/**
 * @param {object} p
 * @param {Array<{modalidad, monto, descontar_faltas, vigente_desde}>} p.sueldos ordenados por vigente_desde
 * @param {Set<string>} p.marcados    días (yyyy-mm-dd) en que marcó entrada
 * @param {Set<string>} p.justificados faltas justificadas
 * @param {Set<number>|null} p.laborables días de la semana que le toca trabajar (null = sin horario)
 * @param {Array<{tipo, monto, fecha}>} p.movimientos pagos, adelantos, bonos, descuentos
 * @param {string} p.hoy
 */
function calcular({ sueldos, marcados, justificados, laborables, movimientos = [], hoy }) {
  const lista = [...sueldos].sort((a, b) => (a.vigente_desde < b.vigente_desde ? -1 : 1));
  const periodos = [];
  const vigente = (f) => lista.filter((s) => s.vigente_desde <= f).pop();
  const siguiente = (f) => lista.find((s) => s.vigente_desde > f)?.vigente_desde ?? null;
  const toca = (f) => !laborables || laborables.has(diaSemana(f));

  let d = lista[0]?.vigente_desde;
  while (d && d <= hoy) {
    const s = vigente(d);
    const cambio = siguiente(d);
    if (s.modalidad === 'ninguno') { // no cobra: salta al próximo cambio
      if (!cambio || cambio > hoy) break;
      d = cambio;
      continue;
    }
    const [ini, fin] = periodoDe(s.modalidad, d);
    const hasta = cambio && cambio <= fin ? sumarDias(cambio, -1) : fin;
    const monto = Number(s.monto);
    const p = { modalidad: s.modalidad, monto, desde: d, hasta, inicio: ini, fin, cerrado: hasta < hoy };

    if (s.modalidad === 'diario') {
      const vino = marcados.has(d);
      Object.assign(p, { dias_trabajados: vino ? 1 : 0, ganado: vino ? monto : 0, proyectado: vino || d === hoy ? monto : 0, faltas: [], justificadas: [], extras: 0 });
    } else {
      const descuenta = !!s.descontar_faltas && !!laborables;
      const total = [...dias(ini, fin)].filter(toca).length || 1;
      const valorDia = monto / total;
      let trabajados = 0;
      let pendientes = 0;
      let extras = 0;
      const faltas = [];
      const justificadas = [];
      for (const f of dias(d, hasta)) {
        if (!toca(f)) { if (f <= hoy && marcados.has(f)) extras += 1; continue; }
        if (f > hoy) pendientes += 1;
        else if (marcados.has(f)) trabajados += 1;
        else if (justificados.has(f)) { trabajados += 1; justificadas.push(f); }
        else if (!descuenta) trabajados += 1; // cobra el día igual
        else if (f === hoy) pendientes += 1; // todavía puede marcar
        else faltas.push(f);
      }
      Object.assign(p, {
        dias_del_periodo: total, valor_dia: r2(valorDia), dias_trabajados: trabajados, dias_pendientes: pendientes,
        faltas, justificadas, extras, descuento_faltas: r2(valorDia * faltas.length),
        ganado: r2(valorDia * trabajados), proyectado: r2(valorDia * (trabajados + pendientes)),
        sin_horario: !laborables,
      });
    }
    periodos.push(p);
    d = sumarDias(hasta, 1);
  }

  const suma = (tipos) => r2(movimientos.filter((m) => tipos.includes(m.tipo) && m.fecha <= hoy).reduce((t, m) => t + Number(m.monto), 0));
  const ganado = r2(periodos.reduce((t, p) => t + p.ganado, 0));
  const bonos = suma(['bono']);
  const descuentos = suma(['descuento']);
  const pagado = suma(['pago', 'adelanto']);
  const debe = r2(ganado + bonos - descuentos - pagado);

  const actual = periodos[periodos.length - 1] ?? null;
  const sueldoHoy = vigente(hoy) ?? null;
  let proximo = null;
  if (actual && sueldoHoy?.modalidad !== 'ninguno') {
    const fecha = actual.modalidad === 'diario' ? hoy : actual.hasta;
    proximo = { fecha, monto: r2(debe - actual.ganado + actual.proyectado) };
  }
  // Lo que pasó en el período en curso (para mostrar "adelantos de este mes").
  const enCurso = actual && actual.modalidad !== 'diario'
    ? movimientos.filter((m) => m.fecha >= actual.desde && m.fecha <= actual.hasta)
    : [];
  const delPeriodo = (tipos) => r2(enCurso.filter((m) => tipos.includes(m.tipo)).reduce((t, m) => t + Number(m.monto), 0));

  return {
    sueldo: sueldoHoy, periodos, actual,
    totales: { ganado, bonos, descuentos, pagado, debe },
    periodo_actual: actual && actual.modalidad !== 'diario'
      ? { adelantos: delPeriodo(['pago', 'adelanto']), bonos: delPeriodo(['bono']), descuentos: delPeriodo(['descuento']) }
      : null,
    proximo,
  };
}

module.exports = { calcular, periodoDe, sumarDias, diaSemana, MODALIDADES };
