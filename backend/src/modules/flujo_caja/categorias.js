// Categorías del flujo de caja (luz, agua, internet, sueldos…). Viven en la
// tabla categorias_flujo (migración 070) y se editan desde Finanzas › Flujo de
// caja › Clasificar gastos. `grupo` decide en qué bloque van y cómo cuentan:
// - ingresos: entra a la operación.
// - costo_variable / costo_fijo / otros_gastos: gastos de la operación.
// - no_operativo: sale plata pero no es gasto del negocio (retiros del dueño,
//   cuotas de la asociación). Cuenta en el saldo, no en el flujo del día.
// - traspaso: pasa plata de QR a efectivo o al revés (no es ingreso ni gasto).
// - ajuste: corrige el saldo (saldo inicial, diferencias de arqueo).
// `clave` es lo que guarda libro_caja.categoria: no cambia al renombrar.
// `sistema`: las necesita el flujo (no se borran ni cambian de grupo).
// `auto`: las llena el sistema (ventas, compras…), no se eligen al anotar.
const { Op } = require('sequelize');
const { CategoriaFlujo, LibroCaja } = require('../../models');

const GRUPOS = [
  { clave: 'ingresos', nombre: 'Ingresos', tipo: 'ingreso' },
  { clave: 'costo_variable', nombre: 'Costo variable', tipo: 'egreso' },
  { clave: 'costo_fijo', nombre: 'Costo fijo', tipo: 'egreso' },
  { clave: 'otros_gastos', nombre: 'Otros gastos', tipo: 'egreso' },
  { clave: 'no_operativo', nombre: 'Retiros y aportes fuera del negocio', tipo: 'egreso' },
  { clave: 'traspaso', nombre: 'Traspasos entre efectivo y QR', tipo: 'traspaso' },
  { clave: 'ajuste', nombre: 'Ajustes de saldo', tipo: 'ajuste' },
];
// Los grupos donde el usuario puede crear categorías.
const GRUPOS_ELEGIBLES = ['ingresos', 'costo_variable', 'costo_fijo', 'otros_gastos', 'no_operativo'];
// Las "Otros…" van siempre al final de su grupo.
const ORDEN_ULTIMO = 900;

const error = (mensaje, status = 400) => Object.assign(new Error(mensaje), { status });
const grupo = (clave) => GRUPOS.find((g) => g.clave === clave);

const _publica = (c) => ({
  id: c.id, clave: c.clave, grupo: c.grupo, nombre: c.nombre, ayuda: c.ayuda || null,
  pideDetalle: c.pide_persona ? 'persona' : null, auto: !!c.auto, sistema: !!c.sistema, activo: !!c.activo, orden: c.orden,
});

// Se leen una vez y se guardan hasta que alguien las cambie.
let cache = null;
function cargar() {
  if (!cache) {
    cache = CategoriaFlujo.findAll({ order: [['orden', 'ASC'], ['id', 'ASC']] })
      .then((filas) => {
        const CATEGORIAS = filas.map(_publica);
        return { CATEGORIAS, POR_CLAVE: Object.fromEntries(CATEGORIAS.map((c) => [c.clave, c])) };
      })
      .catch((e) => { cache = null; throw e; });
  }
  return cache;
}
const invalidar = () => { cache = null; };

// Categoría opcional de un movimiento del libro o de un gasto de caja: tiene
// que existir, estar activa, no ser de las que llena el sistema y corresponder
// a si entra o sale plata. Vacía → null (el flujo la deduce por el origen).
async function categoriaPara(clave, tipo) {
  if (clave == null || clave === '') return null;
  const cat = (await cargar()).POR_CLAVE[clave];
  const g = grupo(cat?.grupo);
  if (!cat || cat.auto || !cat.activo || !['ingreso', 'egreso'].includes(g?.tipo) || g.tipo !== tipo) {
    throw error('Categoría inválida');
  }
  return clave;
}

// ── ABM ────────────────────────────────────────────────────────────────────

async function listar() {
  const { CATEGORIAS } = await cargar();
  const usos = await LibroCaja.findAll({
    attributes: ['categoria', [LibroCaja.sequelize.fn('COUNT', '*'), 'n']],
    where: { categoria: { [Op.ne]: null } }, group: ['categoria'], raw: true,
  });
  const n = Object.fromEntries(usos.map((u) => [u.categoria, Number(u.n)]));
  return { grupos: GRUPOS, elegibles: GRUPOS_ELEGIBLES, categorias: CATEGORIAS.map((c) => ({ ...c, usos: n[c.clave] || 0 })) };
}

function _datos(body, previa) {
  const nombre = String(body.nombre ?? previa?.nombre ?? '').trim().replace(/\s+/g, ' ');
  if (!nombre) throw error('Escribe el nombre');
  if (nombre.length > 60) throw error('El nombre es muy largo (máximo 60 letras)');
  const g = body.grupo ?? previa?.grupo;
  if (!previa?.sistema && !GRUPOS_ELEGIBLES.includes(g)) throw error('Elige dónde va en el flujo');
  const ayuda = body.ayuda === undefined ? (previa?.ayuda ?? null) : (String(body.ayuda ?? '').trim().slice(0, 120) || null);
  const pide_persona = body.pide_persona === undefined ? !!previa?.pide_persona : !!body.pide_persona;
  return { nombre, grupo: g, ayuda, pide_persona };
}

async function _nombreLibre(nombre, id) {
  const otra = await CategoriaFlujo.findOne({ where: { nombre, ...(id ? { id: { [Op.ne]: id } } : {}) } });
  if (otra) throw error(`Ya existe "${otra.nombre}"`, 409);
}

// "Internet y teléfono" → "internet_y_telefono" (+ _2, _3 si ya existe).
async function _claveNueva(nombre) {
  const base = nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 34) || 'categoria';
  const usadas = new Set((await CategoriaFlujo.findAll({ attributes: ['clave'], where: { clave: { [Op.like]: `${base}%` } } })).map((c) => c.clave));
  let clave = base;
  for (let i = 2; usadas.has(clave); i++) clave = `${base}_${i}`;
  return clave;
}

async function crear(body) {
  const d = _datos(body);
  await _nombreLibre(d.nombre);
  const ultima = await CategoriaFlujo.max('orden', { where: { grupo: d.grupo, orden: { [Op.lt]: ORDEN_ULTIMO } } });
  const creada = await CategoriaFlujo.create({ ...d, clave: await _claveNueva(d.nombre), orden: (ultima || 0) + 10 });
  invalidar();
  return _publica(creada);
}

async function _buscar(id) {
  const cat = await CategoriaFlujo.findByPk(id);
  if (!cat) throw error('Categoría no encontrada', 404);
  return cat;
}

async function editar(id, body) {
  const cat = await _buscar(id);
  const d = _datos(body, cat);
  if (cat.sistema && d.grupo !== cat.grupo) throw error('Esta categoría la usa el sistema: no se puede mover de grupo');
  // Pasarla de ingreso a gasto (o al revés) daría vuelta lo ya anotado.
  if (d.grupo !== cat.grupo && grupo(d.grupo).tipo !== grupo(cat.grupo).tipo
      && await LibroCaja.count({ where: { categoria: cat.clave } })) {
    throw error('Ya tiene movimientos: no se puede pasar de ingreso a gasto. Crea una categoría nueva.', 409);
  }
  await _nombreLibre(d.nombre, cat.id);
  const cambios = { ...d };
  if (body.activo !== undefined) {
    if (cat.sistema && !body.activo) throw error('Esta categoría la usa el sistema: no se puede ocultar');
    cambios.activo = !!body.activo;
  }
  if (d.grupo !== cat.grupo) {
    const ultima = await CategoriaFlujo.max('orden', { where: { grupo: d.grupo, orden: { [Op.lt]: ORDEN_ULTIMO } } });
    cambios.orden = (ultima || 0) + 10;
  }
  await cat.update(cambios);
  invalidar();
  return _publica(cat);
}

// Sin movimientos se borra; con movimientos se oculta (deja de ofrecerse al
// anotar, pero lo ya anotado sigue en el flujo con su nombre).
async function eliminar(id) {
  const cat = await _buscar(id);
  if (cat.sistema) throw error('Esta categoría la usa el sistema: no se puede borrar', 409);
  const usos = await LibroCaja.count({ where: { categoria: cat.clave } });
  if (usos) await cat.update({ activo: false });
  else await cat.destroy();
  invalidar();
  return { borrada: !usos, ocultada: !!usos, usos };
}

module.exports = { GRUPOS, GRUPOS_ELEGIBLES, cargar, invalidar, categoriaPara, listar, crear, editar, eliminar };
