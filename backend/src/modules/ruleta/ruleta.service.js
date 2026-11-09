const { Op } = require('sequelize');
const { RuletaPremio, RuletaGiro, Cliente, Cupon, Configuracion, Producto, Combo, sequelize } = require('../../models');

const INCLUDE_PREMIO = [
  { model: Producto, as: 'producto', attributes: ['id', 'nombre', 'precio'], required: false },
  { model: Combo, as: 'combo', attributes: ['id', 'nombre', 'precio'], required: false },
];

const CLAVES_CONFIG = ['ruleta_activa', 'ruleta_costo_puntos', 'ruleta_max_giros_periodo', 'ruleta_periodo', 'ruleta_vigencia_dias_premio'];

async function _config() {
  const rows = await Configuracion.findAll({ where: { clave: CLAVES_CONFIG } });
  const cfg = rows.reduce((o, r) => { o[r.clave] = r.valor; return o; }, {});
  return {
    activa: cfg.ruleta_activa === 'true',
    costoPuntos: parseInt(cfg.ruleta_costo_puntos, 10) || 10,
    maxGirosPeriodo: parseInt(cfg.ruleta_max_giros_periodo, 10) || 1,
    periodo: cfg.ruleta_periodo === 'semana' ? 'semana' : 'dia',
    vigenciaDiasPremio: parseInt(cfg.ruleta_vigencia_dias_premio, 10) || 7,
  };
}

// Inicio del período vigente (día o semana, hora Bolivia -04:00) — mismo
// criterio de zona horaria que _rangoDiaBolivia en ventas.service.js, para
// no depender de la del proceso/VPS. La semana empieza el lunes.
function _inicioPeriodoBolivia(periodo) {
  const bolivia = new Date(Date.now() - 4 * 60 * 60 * 1000);
  const hoy = bolivia.toISOString().slice(0, 10);
  const inicio = new Date(`${hoy}T00:00:00-04:00`);
  if (periodo !== 'semana') return inicio;
  const diaSemana = bolivia.getUTCDay(); // 0=domingo..6=sábado
  const diasDesdeLunes = diaSemana === 0 ? 6 : diaSemana - 1;
  inicio.setUTCDate(inicio.getUTCDate() - diasDesdeLunes);
  return inicio;
}

function _sumarDias(fecha, dias) {
  const d = new Date(fecha);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

// Sorteo ponderado: cada premio tiene más chance de salir cuanto mayor sea
// su `probabilidad` relativa a la suma total. El tamaño visual del segmento
// en la ruleta es siempre parejo (no refleja la probabilidad) — es a
// propósito, para que la rueda se vea estéticamente equilibrada aunque las
// probabilidades reales no lo estén.
function _sortear(premios) {
  const total = premios.reduce((s, p) => s + p.probabilidad, 0);
  let r = Math.random() * total;
  for (const premio of premios) {
    r -= premio.probabilidad;
    if (r <= 0) return premio;
  }
  return premios[premios.length - 1];
}

function _generarCodigo(cliente_id) {
  const azar = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `RULETA${cliente_id}-${azar}`;
}

const TIPOS_PREMIO = ['porcentaje', 'fijo', 'producto_gratis', 'combo_gratis', 'nada'];

async function listarPremios() {
  return RuletaPremio.findAll({ include: INCLUDE_PREMIO, order: [['orden', 'ASC'], ['id', 'ASC']] });
}

async function listarPremiosActivos() {
  return RuletaPremio.findAll({ where: { activo: 1 }, include: INCLUDE_PREMIO, order: [['orden', 'ASC'], ['id', 'ASC']] });
}

async function _validarPremio({ nombre, tipo, valor, probabilidad, producto_id, combo_id }) {
  if (!nombre || !nombre.trim()) throw Object.assign(new Error('El nombre es requerido'), { status: 400 });
  if (!TIPOS_PREMIO.includes(tipo)) {
    throw Object.assign(new Error("El tipo debe ser 'porcentaje', 'fijo', 'producto_gratis', 'combo_gratis' o 'nada'"), { status: 400 });
  }
  if (tipo === 'porcentaje' || tipo === 'fijo') {
    if (!(parseFloat(valor) > 0)) throw Object.assign(new Error('El valor debe ser mayor a 0'), { status: 400 });
    if (tipo === 'porcentaje' && parseFloat(valor) > 100) {
      throw Object.assign(new Error('El porcentaje no puede superar 100'), { status: 400 });
    }
  }
  if (tipo === 'producto_gratis') {
    if (!producto_id) throw Object.assign(new Error('Debe seleccionar un producto'), { status: 400 });
    const producto = await Producto.findByPk(producto_id);
    if (!producto) throw Object.assign(new Error('El producto seleccionado no existe'), { status: 400 });
  }
  if (tipo === 'combo_gratis') {
    if (!combo_id) throw Object.assign(new Error('Debe seleccionar un combo'), { status: 400 });
    const combo = await Combo.findByPk(combo_id);
    if (!combo) throw Object.assign(new Error('El combo seleccionado no existe'), { status: 400 });
  }
  if (!(parseInt(probabilidad, 10) >= 1)) throw Object.assign(new Error('La probabilidad debe ser al menos 1'), { status: 400 });
}

async function crearPremio({ nombre, tipo = 'nada', valor, probabilidad = 1, color, activo = 1, orden = 0, producto_id, combo_id }) {
  await _validarPremio({ nombre, tipo, valor, probabilidad, producto_id, combo_id });
  return RuletaPremio.create({
    nombre: nombre.trim(),
    tipo,
    valor: (tipo === 'porcentaje' || tipo === 'fijo') ? valor : null,
    producto_id: tipo === 'producto_gratis' ? producto_id : null,
    combo_id: tipo === 'combo_gratis' ? combo_id : null,
    probabilidad, color: color || null, activo, orden,
  });
}

async function actualizarPremio(id, { nombre, tipo, valor, probabilidad, color, activo, orden, producto_id, combo_id }) {
  const premio = await RuletaPremio.findByPk(id);
  if (!premio) throw Object.assign(new Error('Premio no encontrado'), { status: 404 });

  const tipoFinal = tipo ?? premio.tipo;
  const valorFinal = valor ?? premio.valor;
  const probabilidadFinal = probabilidad ?? premio.probabilidad;
  const productoFinal = producto_id !== undefined ? producto_id : premio.producto_id;
  const comboFinal = combo_id !== undefined ? combo_id : premio.combo_id;
  if (nombre !== undefined || tipo !== undefined || valor !== undefined || probabilidad !== undefined || producto_id !== undefined || combo_id !== undefined) {
    await _validarPremio({ nombre: nombre ?? premio.nombre, tipo: tipoFinal, valor: valorFinal, probabilidad: probabilidadFinal, producto_id: productoFinal, combo_id: comboFinal });
  }

  const datos = {};
  if (nombre !== undefined) datos.nombre = nombre.trim();
  if (tipo !== undefined) datos.tipo = tipo;
  if (valor !== undefined || tipo !== undefined) datos.valor = (tipoFinal === 'porcentaje' || tipoFinal === 'fijo') ? valorFinal : null;
  if (producto_id !== undefined || tipo !== undefined) datos.producto_id = tipoFinal === 'producto_gratis' ? productoFinal : null;
  if (combo_id !== undefined || tipo !== undefined) datos.combo_id = tipoFinal === 'combo_gratis' ? comboFinal : null;
  if (probabilidad !== undefined) datos.probabilidad = probabilidad;
  if (color !== undefined) datos.color = color || null;
  if (activo !== undefined) datos.activo = activo;
  if (orden !== undefined) datos.orden = orden;

  await premio.update(datos);
  return premio;
}

async function eliminarPremio(id) {
  const premio = await RuletaPremio.findByPk(id);
  if (!premio) throw Object.assign(new Error('Premio no encontrado'), { status: 404 });
  const tieneGiros = await RuletaGiro.count({ where: { premio_id: id } });
  if (tieneGiros > 0) {
    // Ya salió en algún giro histórico: no se borra (rompería ese
    // historial), solo se desactiva — mismo patrón que productos/combos/cupones.
    await premio.update({ activo: 0 });
    return { eliminado: false };
  }
  await premio.destroy();
  return { eliminado: true };
}

// Estado de la ruleta para un cliente puntual: si puede girar ahora mismo y
// por qué no, si no puede — para que el POS pueda mostrarlo antes de
// intentar el giro, sin adivinar.
async function estadoParaCliente(cliente_id) {
  const cfg = await _config();
  const cliente = await Cliente.findByPk(cliente_id, { attributes: ['id', 'nombre', 'puntos'] });
  if (!cliente) throw Object.assign(new Error('Cliente no encontrado'), { status: 404 });

  const inicioPeriodo = _inicioPeriodoBolivia(cfg.periodo);
  const girosUsados = await RuletaGiro.count({ where: { cliente_id, creado_en: { [Op.gte]: inicioPeriodo } } });

  let motivoBloqueo = null;
  if (!cfg.activa) motivoBloqueo = 'La ruleta no está disponible.';
  else if (cliente.puntos < cfg.costoPuntos) motivoBloqueo = 'El cliente no tiene puntos suficientes.';
  else if (girosUsados >= cfg.maxGirosPeriodo) motivoBloqueo = `Ya alcanzó el límite de giros de ${cfg.periodo === 'semana' ? 'esta semana' : 'hoy'}.`;

  return {
    ruleta_activa: cfg.activa,
    costo_puntos: cfg.costoPuntos,
    max_giros_periodo: cfg.maxGirosPeriodo,
    periodo: cfg.periodo,
    giros_usados: girosUsados,
    puede_girar: !motivoBloqueo,
    motivo_bloqueo: motivoBloqueo,
    cliente: { id: cliente.id, nombre: cliente.nombre, puntos: cliente.puntos },
  };
}

async function girar(cliente_id, usuario_id) {
  if (!cliente_id) throw Object.assign(new Error('cliente_id es requerido'), { status: 400 });
  const estado = await estadoParaCliente(cliente_id);
  if (!estado.puede_girar) throw Object.assign(new Error(estado.motivo_bloqueo), { status: 400 });

  const cfg = await _config();
  const premiosActivos = await listarPremiosActivos();
  if (premiosActivos.length === 0) {
    throw Object.assign(new Error('No hay premios configurados en la ruleta'), { status: 409 });
  }

  // El sorteo se hace ANTES de la transacción (no depende de datos que haya
  // que bloquear) — nunca del lado del frontend, para que no se pueda alterar.
  const premioGanado = _sortear(premiosActivos);

  return sequelize.transaction(async (t) => {
    const cliente = await Cliente.findByPk(cliente_id, { transaction: t, lock: t.LOCK.UPDATE });
    await cliente.update({ puntos: cliente.puntos - cfg.costoPuntos }, { transaction: t });

    let cupon = null;
    if (premioGanado.tipo !== 'nada') {
      // producto_gratis/combo_gratis se traducen a un cupón 'fijo' por el
      // precio VIGENTE del ítem (no uno guardado en el premio), para que no
      // quede desactualizado si el precio del menú cambia después de
      // configurar el premio. El cupón queda amarrado a ese producto/combo:
      // solo descuenta si está en la venta, y nunca más que lo que cuesta ahí.
      let tipoCupon = premioGanado.tipo;
      let valorCupon = premioGanado.valor;
      if (premioGanado.tipo === 'producto_gratis') {
        const producto = await Producto.findByPk(premioGanado.producto_id, { transaction: t });
        if (!producto) throw Object.assign(new Error('El producto del premio ya no existe'), { status: 409 });
        tipoCupon = 'fijo';
        valorCupon = producto.precio;
      } else if (premioGanado.tipo === 'combo_gratis') {
        const combo = await Combo.findByPk(premioGanado.combo_id, { transaction: t });
        if (!combo) throw Object.assign(new Error('El combo del premio ya no existe'), { status: 409 });
        tipoCupon = 'fijo';
        valorCupon = combo.precio;
      }

      cupon = await Cupon.create({
        codigo: _generarCodigo(cliente.id),
        tipo: tipoCupon,
        valor: valorCupon,
        fecha_expiracion: _sumarDias(new Date(), cfg.vigenciaDiasPremio),
        usos_maximos: 1,
        cliente_id: cliente.id,
        activo: 1,
        creado_por: usuario_id,
        combo_id: premioGanado.tipo === 'combo_gratis' ? premioGanado.combo_id : null,
      }, { transaction: t });
      if (premioGanado.tipo === 'producto_gratis') await cupon.setProductos([premioGanado.producto_id], { transaction: t });
    }

    await RuletaGiro.create({
      cliente_id: cliente.id, premio_id: premioGanado.id, cupon_id: cupon ? cupon.id : null,
      usuario_id, puntos_gastados: cfg.costoPuntos,
    }, { transaction: t });

    return {
      premio: {
        id: premioGanado.id, nombre: premioGanado.nombre, tipo: premioGanado.tipo, valor: premioGanado.valor,
        producto_id: premioGanado.producto_id, combo_id: premioGanado.combo_id,
      },
      cupon: cupon ? { codigo: cupon.codigo, tipo: cupon.tipo, valor: parseFloat(cupon.valor), fecha_expiracion: cupon.fecha_expiracion } : null,
      puntos_restantes: cliente.puntos,
    };
  });
}

module.exports = {
  listarPremios, listarPremiosActivos, crearPremio, actualizarPremio, eliminarPremio,
  estadoParaCliente, girar,
};
