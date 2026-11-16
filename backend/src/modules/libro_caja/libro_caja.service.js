const { Op } = require('sequelize');
const { LibroCaja, SesionCaja, Usuario, Sucursal } = require('../../models');
const { emitir } = require('../../socket');
const { categoriaPara } = require('../flujo_caja/categorias');

const INCLUDE_LB = [
  { model: SesionCaja, as: 'sesion_caja', attributes: ['id', 'estado', 'abierto_en'] },
  { model: Usuario, as: 'usuario', attributes: ['id', 'nombre'] },
];

const LIMITE_DEFAULT = 20;
const LIMITE_MAX = 100;

// Offset fijo de Bolivia: un datetime sin offset se parsea en la hora local
// del proceso de Node, que puede no coincidir con la del negocio (-04:00).
function _filtroFecha(desde, hasta) {
  if (!desde && !hasta) return {};
  const range = {};
  if (desde) range[Op.gte] = new Date(`${desde}T00:00:00-04:00`);
  if (hasta) range[Op.lte] = new Date(`${hasta}T23:59:59-04:00`);
  return { creado_en: range };
}

function _paginaLimite(filtros = {}) {
  const pagina = Math.max(parseInt(filtros.pagina, 10) || 1, 1);
  const limiteReq = filtros.limite === undefined ? LIMITE_DEFAULT : parseInt(filtros.limite, 10);
  const limite = limiteReq === 0 ? 0 : Math.min(Math.max(limiteReq || LIMITE_DEFAULT, 1), LIMITE_MAX);
  return { pagina, limite };
}

async function _verificarSesionEnAlcance(sesion_caja_id, alcance) {
  const sesion = await SesionCaja.findByPk(sesion_caja_id);
  if (!sesion) throw Object.assign(new Error('Sesión de caja no encontrada'), { status: 404 });
  if (alcance && !alcance.acceso_todas && sesion.sucursal_id !== alcance.sucursal_id) {
    throw Object.assign(new Error('Sesión de caja no encontrada'), { status: 404 });
  }
  return sesion;
}

async function _sesionIdsSucursal(sucursal_id) {
  const sesiones = await SesionCaja.findAll({ where: { sucursal_id }, attributes: ['id'] });
  return sesiones.map((s) => s.id);
}

// Arma el `where` compartido por listar() y resumen(). `sesion_caja_id`
// (cuando viene) reemplaza el filtro por alcance — ver comentario histórico
// más abajo sobre por qué el alcance se aplica con OR y no con un include.
async function _construirWhere(filtros, alcance) {
  const { sesion_caja_id, desde, hasta, tipo, busqueda } = filtros;
  const where = { ..._filtroFecha(desde, hasta) };
  if (tipo) where.tipo = tipo;

  if (sesion_caja_id) {
    where.sesion_caja_id = sesion_caja_id;
  } else {
    const condiciones = [];
    if (alcance && !alcance.acceso_todas) {
      // Filtrar por sucursal vía un `where` en el include de sesion_caja lo
      // convertiría en INNER JOIN, ocultando los movimientos sin sesión
      // (sesion_caja_id null, ej. compras recibidas o gastos "sin sesión").
      // En vez de eso, se arma la lista de sesiones de la sucursal y se
      // filtra a nivel de libro_caja con OR, dejando pasar también los sin
      // sesión.
      const sesionIds = await _sesionIdsSucursal(alcance.sucursal_id);
      condiciones.push({ [Op.or]: [{ sesion_caja_id: null }, { sesion_caja_id: { [Op.in]: sesionIds } }] });
    }
    if (busqueda) {
      const like = { [Op.like]: `%${busqueda}%` };
      condiciones.push({ [Op.or]: [{ concepto: like }, { metodo_pago: like }, { '$usuario.nombre$': like }] });
    }
    if (condiciones.length) where[Op.and] = condiciones;
  }

  return where;
}

async function listar(filtros = {}, alcance) {
  if (filtros.sesion_caja_id) await _verificarSesionEnAlcance(filtros.sesion_caja_id, alcance);
  const where = await _construirWhere(filtros, alcance);
  const { pagina, limite } = _paginaLimite(filtros);

  const { rows, count } = await LibroCaja.findAndCountAll({
    where,
    include: INCLUDE_LB,
    order: [['creado_en', 'DESC']],
    // La condición `$usuario.nombre$` de la búsqueda necesita el JOIN
    // resuelto en la MISMA consulta que aplica el LIMIT — el modo
    // subQuery automático de Sequelize (activo por defecto cuando hay
    // `limit` + includes) rompe esa referencia porque arma primero un
    // SELECT id ... LIMIT sin los joins.
    subQuery: false,
    distinct: true,
    ...(limite ? { limit: limite, offset: (pagina - 1) * limite } : {}),
  });

  return { filas: rows, pagina, limite, total: count, total_paginas: limite ? Math.ceil(count / limite) : 1 };
}

async function resumen(filtros = {}, alcance) {
  if (filtros.sesion_caja_id) await _verificarSesionEnAlcance(filtros.sesion_caja_id, alcance);
  const where = await _construirWhere(filtros, alcance);
  const includeUsuario = [{ model: Usuario, as: 'usuario', attributes: [] }];

  // Si `tipo` está filtrado a un solo lado, el otro lado es 0 sin consultar
  // la BD — sumar con `{ ...where, tipo: 'egreso' }` cuando el caller pidió
  // solo ingresos ignoraría ese filtro y devolvería el total sin filtrar.
  const [totalIngresos, totalEgresos, cantidad, cajerosRaw] = await Promise.all([
    (!filtros.tipo || filtros.tipo === 'ingreso')
      ? LibroCaja.sum('monto', { where: { ...where, tipo: 'ingreso' }, include: includeUsuario })
      : Promise.resolve(0),
    (!filtros.tipo || filtros.tipo === 'egreso')
      ? LibroCaja.sum('monto', { where: { ...where, tipo: 'egreso' }, include: includeUsuario })
      : Promise.resolve(0),
    LibroCaja.count({ where, include: includeUsuario, distinct: true, col: 'id' }),
    LibroCaja.findAll({
      where,
      include: [{ model: Usuario, as: 'usuario', attributes: ['id', 'nombre'] }],
      attributes: [],
      group: ['usuario.id', 'usuario.nombre'],
      raw: true,
    }),
  ]);

  const cajeros = cajerosRaw
    .map((f) => ({ id: f['usuario.id'], nombre: f['usuario.nombre'] }))
    .filter((c) => c.id != null);

  const filtrosResp = { cajeros };
  if (alcance && alcance.acceso_todas) {
    const sucursalesRaw = await LibroCaja.findAll({
      where,
      include: [{
        model: SesionCaja, as: 'sesion_caja', attributes: [], required: true,
        include: [{ model: Sucursal, as: 'sucursal', attributes: ['id', 'nombre'] }],
      }],
      attributes: [],
      group: ['sesion_caja.sucursal.id', 'sesion_caja.sucursal.nombre'],
      raw: true,
    });
    filtrosResp.sucursales = sucursalesRaw
      .map((f) => ({ id: f['sesion_caja.sucursal.id'], nombre: f['sesion_caja.sucursal.nombre'] }))
      .filter((s) => s.id != null);
  }

  return {
    total_ingresos: parseFloat(totalIngresos || 0),
    total_egresos: parseFloat(totalEgresos || 0),
    cantidad: cantidad || 0,
    filtros: filtrosResp,
  };
}

// `sesion_caja_id` es opcional: el libro de caja también sirve para anotar
// gastos/ingresos fuera de una sesión de caja abierta (ej. fuera de horario
// de atención) — no todo movimiento de plata pasa necesariamente por una
// caja registradora activa.
async function crear(usuario_id, { sesion_caja_id, tipo, concepto, monto, metodo_pago = 'efectivo', categoria }, alcance) {
  if (!['ingreso', 'egreso'].includes(tipo)) throw Object.assign(new Error('tipo debe ser ingreso o egreso'), { status: 400 });
  if (sesion_caja_id) await _verificarSesionEnAlcance(sesion_caja_id, alcance);
  const cat = await categoriaPara(categoria, tipo);
  // La categoría ubica el movimiento en el flujo de caja; sin caja se guarda
  // la sucursal para el filtro por sucursal.
  const entrada = await LibroCaja.create({
    sesion_caja_id: sesion_caja_id || null, sucursal_id: sesion_caja_id ? null : (alcance?.sucursal_id ?? null),
    usuario_id, tipo, concepto, monto, metodo_pago, categoria: cat,
  });

  // El cierre de caja calcula "esperado en caja" restando sesion.total_gastos
  // (no sumando egresos del libro en vivo), así que un egreso en efectivo
  // cargado acá tiene que reflejarse ahí también — si no, el arqueo del
  // cierre no cuadra con el efectivo real que salió de la caja. Sin sesión
  // no hay nada que reconciliar (no afecta ningún arqueo).
  if (sesion_caja_id && tipo === 'egreso' && metodo_pago === 'efectivo') {
    await SesionCaja.increment('total_gastos', { by: parseFloat(monto), where: { id: sesion_caja_id } });
  }

  // Avisa a pantallas abiertas (ej. Dashboard) para que refresquen sin
  // esperar al polling — mismo patrón que ventas.service.js usa para ventas.
  emitir('restaurante:actualizar', { tipo: 'gasto_nuevo' }, alcance?.sucursal_id);

  return entrada;
}

module.exports = { listar, resumen, crear };
