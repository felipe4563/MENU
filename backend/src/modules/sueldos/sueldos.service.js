// Sueldos del personal: cuánto gana cada uno (calculo.js), cuánto se le debe
// y los pagos. Un pago o adelanto saca plata: si sale de una caja abierta se
// registra como gasto de esa caja (el arqueo lo descuenta) y siempre va al
// libro de caja con categoría Sueldos y el nombre de la persona (así aparece
// en el flujo de caja). Bonos y descuentos solo cambian lo que se le debe.
const { Op } = require('sequelize');
const sequelize = require('../../config/database');
const {
  Usuario, Rol, SueldoPersonal, PagoPersonal, AusenciaPersonal, MarcacionPersonal, HorarioPersonal,
  SesionCaja, Caja, Gasto, LibroCaja,
} = require('../../models');
const { emitir } = require('../../socket');
const { calcular, MODALIDADES } = require('./calculo');

const error = (mensaje, status = 400) => Object.assign(new Error(mensaje), { status });
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const hoyBolivia = () => new Date(Date.now() - 4 * 3600000).toISOString().slice(0, 10);
const r2 = (n) => Math.round(Number(n) * 100) / 100;
const TIPOS = ['pago', 'adelanto', 'bono', 'descuento'];
const SACA_PLATA = ['pago', 'adelanto'];
const NOMBRE_TIPO = { pago: 'Sueldo', adelanto: 'Adelanto de sueldo', bono: 'Bono', descuento: 'Descuento' };

// ── Datos para el cálculo ─────────────────────────────────────────────────

async function _datos(ids, hoy) {
  const [sueldos, horarios, movimientos] = await Promise.all([
    SueldoPersonal.findAll({ where: { usuario_id: ids }, order: [['vigente_desde', 'ASC']], raw: true }),
    HorarioPersonal.findAll({ where: { usuario_id: ids }, raw: true }),
    PagoPersonal.findAll({ where: { usuario_id: ids }, raw: true }),
  ]);
  const desde = sueldos.reduce((m, s) => (!m || s.vigente_desde < m ? s.vigente_desde : m), null) ?? hoy;
  const [marcas, ausencias] = await Promise.all([
    MarcacionPersonal.findAll({ attributes: ['usuario_id', 'fecha'], where: { usuario_id: ids, fecha: { [Op.between]: [desde, hoy] } }, raw: true }),
    AusenciaPersonal.findAll({ where: { usuario_id: ids }, raw: true }),
  ]);
  const de = (arr, id) => arr.filter((x) => x.usuario_id === id);
  return (id) => {
    const filasHorario = de(horarios, id);
    return {
      sueldos: de(sueldos, id),
      marcados: new Set(de(marcas, id).map((m) => m.fecha)),
      justificados: new Set(de(ausencias, id).map((a) => a.fecha)),
      ausencias: de(ausencias, id),
      // Sin horario guardado no se sabe qué días le tocan.
      laborables: filasHorario.length ? new Set(filasHorario.filter((h) => h.trabaja).map((h) => h.dia_semana)) : null,
      movimientos: de(movimientos, id),
    };
  };
}

const _sueldoPublico = (s) => s && ({
  id: s.id, modalidad: s.modalidad, monto: Number(s.monto), descontar_faltas: !!s.descontar_faltas, vigente_desde: s.vigente_desde,
});

function _resumenPersona(u, d, hoy) {
  const c = calcular({ ...d, hoy });
  const a = c.actual;
  return {
    usuario: { id: u.id, nombre: u.nombre, activo: !!u.activo, rol: u.rol?.nombre ?? null },
    sueldo: _sueldoPublico(c.sueldo),
    configurado: d.sueldos.length > 0,
    debe: c.totales.debe,
    proximo: c.proximo,
    hoy_marco: d.marcados.has(hoy),
    periodo: a && {
      modalidad: a.modalidad, desde: a.desde, hasta: a.hasta, ganado: a.ganado, proyectado: a.proyectado,
      dias_trabajados: a.dias_trabajados, dias_del_periodo: a.dias_del_periodo ?? null, dias_pendientes: a.dias_pendientes ?? 0,
      faltas: a.faltas.length, descuento_faltas: a.descuento_faltas ?? 0, extras: a.extras, sin_horario: !!a.sin_horario,
      ...c.periodo_actual,
    },
    pagado_mes: r2(d.movimientos.filter((m) => SACA_PLATA.includes(m.tipo) && m.fecha.slice(0, 7) === hoy.slice(0, 7)).reduce((t, m) => t + Number(m.monto), 0)),
  };
}

// ── Lectura ────────────────────────────────────────────────────────────────

/** Todo el personal activo (y los dados de baja a los que se les debe algo). */
async function resumen(alcance) {
  const hoy = hoyBolivia();
  const usuarios = await Usuario.findAll({
    attributes: ['id', 'nombre', 'activo'], include: [{ model: Rol, as: 'rol', attributes: ['nombre'] }], order: [['nombre', 'ASC']],
  });
  const datos = await _datos(usuarios.map((u) => u.id), hoy);
  const personas = usuarios.map((u) => _resumenPersona(u, datos(u.id), hoy))
    .filter((p) => p.usuario.activo || Math.abs(p.debe) >= 0.01);
  const cajas = await cajasAbiertas(alcance);
  return { hoy, personas, cajas };
}

/** Las cajas abiertas de la sucursal, para elegir de cuál sale el pago. */
async function cajasAbiertas(alcance) {
  if (!alcance?.sucursal_id) return [];
  const sesiones = await SesionCaja.findAll({
    where: { estado: 'abierta', sucursal_id: alcance.sucursal_id },
    include: [{ model: Caja, as: 'caja', attributes: ['nombre'] }, { model: Usuario, as: 'usuario', attributes: ['nombre'] }],
    order: [['id', 'ASC']],
  });
  return sesiones.map((s) => ({ id: s.id, caja: s.caja?.nombre ?? 'Caja', cajero: s.usuario?.nombre ?? '' }));
}

async function _usuario(id) {
  const u = await Usuario.findByPk(id, { attributes: ['id', 'nombre', 'activo'], include: [{ model: Rol, as: 'rol', attributes: ['nombre'] }] });
  if (!u) throw error('Persona no encontrada', 404);
  return u;
}

/** Cuenta completa de una persona: períodos, faltas, pagos e historial de sueldos. */
async function detalle(usuario_id) {
  const hoy = hoyBolivia();
  const u = await _usuario(usuario_id);
  const d = (await _datos([u.id], hoy))(u.id);
  const c = calcular({ ...d, hoy });
  const movimientos = await PagoPersonal.findAll({
    where: { usuario_id: u.id },
    include: [{ model: Usuario, as: 'registrador', attributes: ['nombre'] }, { model: SesionCaja, as: 'sesion_caja', attributes: ['id', 'estado'], include: [{ model: Caja, as: 'caja', attributes: ['nombre'] }] }],
    order: [['fecha', 'DESC'], ['id', 'DESC']],
  });
  return {
    ..._resumenPersona(u, d, hoy),
    hoy,
    totales: c.totales,
    // Lo más nuevo primero; del diario, solo los días que vino.
    periodos: c.periodos.filter((p) => p.modalidad !== 'diario' || p.ganado > 0 || p.desde === hoy).reverse().slice(0, 120),
    sueldos: d.sueldos.map(_sueldoPublico).reverse(),
    ausencias: d.ausencias.map((a) => ({ id: a.id, fecha: a.fecha, motivo: a.motivo })).sort((a, b) => (a.fecha < b.fecha ? 1 : -1)),
    movimientos: movimientos.map((m) => ({
      id: m.id, tipo: m.tipo, monto: Number(m.monto), fecha: m.fecha, nota: m.nota, metodo_pago: m.metodo_pago,
      caja: m.sesion_caja ? `${m.sesion_caja.caja?.nombre ?? 'Caja'}` : null,
      se_puede_anular: !m.sesion_caja_id || m.sesion_caja?.estado === 'abierta',
      registrado_por: m.registrador?.nombre ?? null,
    })),
  };
}

/** Lo que ve cada trabajador de sí mismo (Mi asistencia). */
async function mio(usuario_id) {
  const hoy = hoyBolivia();
  const u = await _usuario(usuario_id);
  const d = (await _datos([u.id], hoy))(u.id);
  if (!d.sueldos.length) return { configurado: false };
  const r = _resumenPersona(u, d, hoy);
  const ultimos = d.movimientos.sort((a, b) => (a.fecha < b.fecha ? 1 : -1)).slice(0, 5)
    .map((m) => ({ tipo: m.tipo, monto: Number(m.monto), fecha: m.fecha }));
  return { configurado: true, sueldo: r.sueldo, debe: r.debe, proximo: r.proximo, periodo: r.periodo, ultimos };
}

// ── Configurar el sueldo ──────────────────────────────────────────────────

/** Crea (o corrige, si es el mismo día) el sueldo que rige desde `vigente_desde`. */
async function configurar(usuario_id, body, admin_id) {
  await _usuario(usuario_id);
  const modalidad = body.modalidad;
  if (![...MODALIDADES, 'ninguno'].includes(modalidad)) throw error('Elige cada cuánto se le paga');
  const monto = modalidad === 'ninguno' ? 0 : r2(body.monto);
  if (modalidad !== 'ninguno' && !(monto > 0 && monto <= 1000000)) throw error('Monto inválido');
  const desde = body.vigente_desde;
  if (!FECHA.test(desde || '')) throw error('Elige desde qué día');
  if (desde < '2000-01-01') throw error('Día inválido');
  // El diario no tiene faltas: si no vino, no gana ese día.
  const descontar = modalidad === 'diario' ? false : body.descontar_faltas !== false;
  const existente = await SueldoPersonal.findOne({ where: { usuario_id, vigente_desde: desde } });
  if (existente) await existente.update({ modalidad, monto, descontar_faltas: descontar, creado_por: admin_id });
  else await SueldoPersonal.create({ usuario_id, modalidad, monto, descontar_faltas: descontar, vigente_desde: desde, creado_por: admin_id });
  emitir('restaurante:actualizar', { tipo: 'sueldos' });
  return detalle(usuario_id);
}

/** Borra un cambio de sueldo cargado por error. */
async function eliminarSueldo(usuario_id, sueldo_id) {
  const s = await SueldoPersonal.findOne({ where: { id: sueldo_id, usuario_id } });
  if (!s) throw error('No encontrado', 404);
  await s.destroy();
  emitir('restaurante:actualizar', { tipo: 'sueldos' });
  return detalle(usuario_id);
}

// ── Pagos, adelantos, bonos y descuentos ──────────────────────────────────

async function registrar(usuario_id, body, registrador_id, alcance) {
  const u = await _usuario(usuario_id);
  const tipo = body.tipo;
  if (!TIPOS.includes(tipo)) throw error('Elige qué se registra');
  const monto = r2(body.monto);
  if (!(monto > 0) || monto > 1000000) throw error('Monto inválido');
  const nota = String(body.nota ?? '').trim().slice(0, 160) || null;
  const hoy = hoyBolivia();
  const sacaPlata = SACA_PLATA.includes(tipo);
  const sesion_caja_id = sacaPlata && body.sesion_caja_id ? Number(body.sesion_caja_id) : null;

  // De una caja: hoy, en efectivo, de una caja abierta de la sucursal.
  // Por fuera (QR, plata del dueño): el día que se elija.
  const fecha = sesion_caja_id ? hoy : (body.fecha || hoy);
  if (!FECHA.test(fecha) || fecha > hoy || fecha < '2000-01-01') throw error('Día inválido');
  const metodo = sacaPlata ? (sesion_caja_id ? 'efectivo' : (body.metodo_pago === 'qr' ? 'qr' : 'efectivo')) : null;

  const creado = await sequelize.transaction(async (t) => {
    let gasto = null;
    let libro = null;
    if (sacaPlata) {
      const concepto = `${NOMBRE_TIPO[tipo]} · ${u.nombre}${nota ? ` · ${nota}` : ''}`.slice(0, 255);
      if (sesion_caja_id) {
        const sesion = await SesionCaja.findByPk(sesion_caja_id, { transaction: t, lock: t.LOCK.UPDATE });
        if (!sesion || sesion.estado !== 'abierta') throw error('Esa caja ya no está abierta', 409);
        if (alcance && !alcance.acceso_todas && sesion.sucursal_id !== alcance.sucursal_id) throw error('Esa caja es de otra sucursal', 403);
        gasto = await Gasto.create({ sesion_caja_id, usuario_id: registrador_id, descripcion: concepto, monto }, { transaction: t });
        await SesionCaja.increment('total_gastos', { by: monto, where: { id: sesion_caja_id }, transaction: t });
      }
      libro = await LibroCaja.create({
        sesion_caja_id, sucursal_id: sesion_caja_id ? null : (alcance?.sucursal_id ?? null),
        usuario_id: registrador_id, tipo: 'egreso', concepto, monto, metodo_pago: metodo,
        categoria: 'sueldos', detalle: u.nombre.slice(0, 120), fecha, referencia_id: gasto?.id ?? null,
      }, { transaction: t });
    }
    return PagoPersonal.create({
      usuario_id, tipo, monto, fecha, nota, metodo_pago: metodo, sucursal_id: alcance?.sucursal_id ?? null,
      sesion_caja_id, gasto_id: gasto?.id ?? null, libro_caja_id: libro?.id ?? null, registrado_por: registrador_id,
    }, { transaction: t });
  });
  emitir('restaurante:actualizar', { tipo: 'sueldos' }, alcance?.sucursal_id);
  if (sacaPlata) emitir('restaurante:actualizar', { tipo: 'flujo_caja' }, alcance?.sucursal_id);
  return creado;
}

/** Anula un movimiento. Si salió de una caja, esa caja tiene que seguir abierta. */
async function anular(usuario_id, pago_id, alcance) {
  await sequelize.transaction(async (t) => {
    const p = await PagoPersonal.findOne({ where: { id: pago_id, usuario_id }, transaction: t });
    if (!p) throw error('No encontrado', 404);
    if (p.sesion_caja_id) {
      const sesion = await SesionCaja.findByPk(p.sesion_caja_id, { transaction: t, lock: t.LOCK.UPDATE });
      if (sesion?.estado !== 'abierta') throw error('La caja de ese pago ya se cerró: no se puede anular. Corrígelo con un bono o un descuento.', 409);
      await SesionCaja.decrement('total_gastos', { by: Number(p.monto), where: { id: p.sesion_caja_id }, transaction: t });
      if (p.gasto_id) await Gasto.destroy({ where: { id: p.gasto_id }, transaction: t });
    }
    if (p.libro_caja_id) await LibroCaja.destroy({ where: { id: p.libro_caja_id }, transaction: t });
    await p.destroy({ transaction: t });
  });
  emitir('restaurante:actualizar', { tipo: 'sueldos' }, alcance?.sucursal_id);
  emitir('restaurante:actualizar', { tipo: 'flujo_caja' }, alcance?.sucursal_id);
}

// ── Faltas justificadas ───────────────────────────────────────────────────

async function justificar(usuario_id, { fecha, motivo }, admin_id) {
  await _usuario(usuario_id);
  if (!FECHA.test(fecha || '') || fecha > hoyBolivia()) throw error('Día inválido');
  const m = String(motivo ?? '').trim().slice(0, 120) || null;
  const [fila] = await AusenciaPersonal.findOrCreate({ where: { usuario_id, fecha }, defaults: { motivo: m, registrado_por: admin_id } });
  if (fila.motivo !== m) await fila.update({ motivo: m });
  emitir('restaurante:actualizar', { tipo: 'sueldos' });
  return detalle(usuario_id);
}

async function quitarJustificacion(usuario_id, fecha) {
  await AusenciaPersonal.destroy({ where: { usuario_id, fecha } });
  emitir('restaurante:actualizar', { tipo: 'sueldos' });
  return detalle(usuario_id);
}

module.exports = {
  resumen, detalle, mio, cajasAbiertas, configurar, eliminarSueldo, registrar, anular, justificar, quitarJustificacion,
};
