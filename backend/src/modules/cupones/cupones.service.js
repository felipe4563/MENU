const { Sequelize, Op } = require('sequelize');
const { Cupon, Pedido, Cliente, Producto, Combo, RuletaGiro, RuletaPremio } = require('../../models');
const { estaActivoHoy } = require('../../utils/disponibilidad');

const INCLUDE_CUPON = [
  { model: Cliente, as: 'cliente', attributes: ['id', 'nombre'], required: false },
  { model: Producto, as: 'productos', attributes: ['id', 'nombre'], through: { attributes: [] }, required: false },
];

function _normalizarCodigo(codigo) {
  return (codigo || '').trim().toUpperCase();
}

function _validarTipoValor(tipo, valor) {
  if (!['fijo', 'porcentaje'].includes(tipo)) {
    throw Object.assign(new Error("El tipo debe ser 'fijo' o 'porcentaje'"), { status: 400 });
  }
  if (!(parseFloat(valor) > 0)) {
    throw Object.assign(new Error('El valor debe ser mayor a 0'), { status: 400 });
  }
  if (tipo === 'porcentaje' && parseFloat(valor) > 100) {
    throw Object.assign(new Error('El porcentaje no puede superar 100'), { status: 400 });
  }
}

function _validarUsos(usos_maximos, limite_por_cliente) {
  const maxNum = parseInt(usos_maximos, 10);
  if (!(maxNum >= 1)) {
    throw Object.assign(new Error('El límite total de usos debe ser al menos 1'), { status: 400 });
  }
  if (limite_por_cliente !== undefined && limite_por_cliente !== null && limite_por_cliente !== '') {
    const porClienteNum = parseInt(limite_por_cliente, 10);
    if (!(porClienteNum >= 1)) {
      throw Object.assign(new Error('El límite por cliente debe ser al menos 1'), { status: 400 });
    }
    if (porClienteNum > maxNum) {
      throw Object.assign(new Error('El límite por cliente no puede ser mayor al límite total de usos'), { status: 400 });
    }
  }
}

async function listar() {
  return Cupon.findAll({ include: INCLUDE_CUPON, order: [['creado_en', 'DESC']] });
}

async function obtener(id) {
  const cupon = await Cupon.findByPk(id, { include: INCLUDE_CUPON });
  if (!cupon) throw Object.assign(new Error('Cupón no encontrado'), { status: 404 });
  return cupon;
}

async function crear({ codigo, tipo = 'fijo', valor, fecha_expiracion, activo = 1, usos_maximos = 1, limite_por_cliente, cliente_id, producto_ids }, usuario_id) {
  const codigoNorm = _normalizarCodigo(codigo);
  if (!codigoNorm) throw Object.assign(new Error('El código es requerido'), { status: 400 });
  _validarTipoValor(tipo, valor);
  _validarUsos(usos_maximos, limite_por_cliente);

  const existente = await Cupon.findOne({ where: { codigo: codigoNorm } });
  if (existente) throw Object.assign(new Error('Ya existe un cupón con ese código'), { status: 409 });

  const creado = await Cupon.create({
    codigo: codigoNorm, tipo, valor, fecha_expiracion: fecha_expiracion || null, activo,
    usos_maximos: usos_maximos || 1, limite_por_cliente: limite_por_cliente || null,
    cliente_id: cliente_id || null, creado_por: usuario_id || null,
  });
  if (producto_ids && producto_ids.length > 0) await creado.setProductos(producto_ids);
  return obtener(creado.id);
}

async function actualizar(id, { tipo, valor, fecha_expiracion, activo, usos_maximos, limite_por_cliente, cliente_id, producto_ids }) {
  const cupon = await obtener(id);
  const tipoFinal = tipo ?? cupon.tipo;
  const valorFinal = valor ?? cupon.valor;
  if (tipo !== undefined || valor !== undefined) _validarTipoValor(tipoFinal, valorFinal);

  if (usos_maximos !== undefined || limite_por_cliente !== undefined) {
    const maxFinal = usos_maximos !== undefined ? usos_maximos : cupon.usos_maximos;
    const porClienteFinal = limite_por_cliente !== undefined ? limite_por_cliente : cupon.limite_por_cliente;
    _validarUsos(maxFinal, porClienteFinal);
  }
  if (usos_maximos !== undefined && parseInt(usos_maximos, 10) < cupon.usos_actuales) {
    throw Object.assign(new Error(`El cupón ya se usó ${cupon.usos_actuales} veces; el límite no puede ser menor`), { status: 400 });
  }

  const datos = {};
  if (tipo !== undefined) datos.tipo = tipo;
  if (valor !== undefined) datos.valor = valor;
  if (fecha_expiracion !== undefined) datos.fecha_expiracion = fecha_expiracion || null;
  if (activo !== undefined) datos.activo = activo;
  if (usos_maximos !== undefined) datos.usos_maximos = usos_maximos;
  if (limite_por_cliente !== undefined) datos.limite_por_cliente = limite_por_cliente || null;
  if (cliente_id !== undefined) datos.cliente_id = cliente_id || null;
  await cupon.update(datos);
  if (producto_ids !== undefined) await cupon.setProductos(producto_ids || []);
  return obtener(id);
}

async function eliminar(id) {
  const cupon = await obtener(id);
  if (cupon.usos_actuales > 0) {
    // Ya está referenciado por una venta histórica: no se puede borrar sin
    // romper esa venta, así que solo se desactiva (mismo patrón que combos).
    await cupon.update({ activo: 0 });
    return { eliminado: false };
  }
  await cupon.destroy();
  return { eliminado: true };
}

// Valida un código de cupón contra `subtotal` y calcula su descuento en Bs,
// sin marcarlo como usado. `transaction`: si se pasa, bloquea la fila del
// cupón (la validación real, dentro de la transacción que finaliza la
// venta); sin transacción es solo una previsualización rápida en el
// checkout — nunca la fuente de verdad del descuento final, para que dos
// cobros concurrentes con el mismo código no superen su límite de usos.
// `cliente_id` es el cliente de la venta (si se eligió uno) — hace falta
// para los cupones exclusivos de un cliente o con límite por cliente.
// `items`: líneas del carrito ({ producto_id, combo_id, cantidad, precio }) — solo se
// usan si el cupón está restringido a ciertos productos o a un combo; si
// el cupón no tiene productos asociados, el descuento sigue calculándose
// sobre `subtotal` (todo el carrito), como siempre.
async function resolver(codigo, subtotal, cliente_id, transaction, items) {
  if (!codigo) return { cupon: null, descuento: 0 };
  const codigoNorm = _normalizarCodigo(codigo);
  const cupon = await Cupon.findOne({
    where: { codigo: codigoNorm },
    include: [{ model: Producto, as: 'productos', attributes: ['id', 'nombre'], through: { attributes: [] }, required: false }],
    ...(transaction ? { transaction, lock: transaction.LOCK.UPDATE } : {}),
  });
  if (!cupon || !cupon.activo) {
    throw Object.assign(new Error('El cupón no es válido'), { status: 400 });
  }
  if (cupon.usos_actuales >= cupon.usos_maximos) {
    throw Object.assign(new Error('El cupón ya alcanzó su límite de usos'), { status: 400 });
  }
  if (!estaActivoHoy({ fecha_fin: cupon.fecha_expiracion })) {
    throw Object.assign(new Error('El cupón está vencido'), { status: 400 });
  }
  if (cupon.cliente_id && cupon.cliente_id !== Number(cliente_id)) {
    throw Object.assign(new Error('Este cupón es exclusivo de otro cliente'), { status: 400 });
  }
  if (cupon.limite_por_cliente) {
    if (!cliente_id) {
      throw Object.assign(new Error('Este cupón requiere seleccionar un cliente'), { status: 400 });
    }
    const usosCliente = await Pedido.count({
      where: { cupon_id: cupon.id, cliente_id, estado: 'completado' },
      ...(transaction ? { transaction } : {}),
    });
    if (usosCliente >= cupon.limite_por_cliente) {
      throw Object.assign(new Error('Este cliente ya alcanzó el límite de usos de este cupón'), { status: 400 });
    }
  }

  let base = subtotal;
  if (cupon.combo_id) {
    base = (items || []).reduce((sum, it) => (
      it.combo_id && Number(it.combo_id) === cupon.combo_id ? sum + it.cantidad * parseFloat(it.precio) : sum
    ), 0);
    if (base === 0) {
      const combo = await Combo.findByPk(cupon.combo_id, { attributes: ['nombre'], ...(transaction ? { transaction } : {}) });
      throw Object.assign(new Error(`Este cupón es para el combo ${combo ? combo.nombre : ''}: agrégalo al pedido para usarlo`.replace(' combo :', ' combo:')), { status: 400 });
    }
  } else if (cupon.productos && cupon.productos.length > 0) {
    const idsAplicables = new Set(cupon.productos.map((p) => p.id));
    base = (items || []).reduce((sum, it) => (
      it.producto_id && idsAplicables.has(Number(it.producto_id)) ? sum + it.cantidad * parseFloat(it.precio) : sum
    ), 0);
    if (base === 0) {
      const nombres = cupon.productos.map((p) => p.nombre).slice(0, 3).join(', ');
      throw Object.assign(new Error(`Este cupón solo aplica a productos que no están en el pedido (${nombres}): agrégalos para usarlo`), { status: 400 });
    }
  }

  const bruto = cupon.tipo === 'porcentaje' ? base * (parseFloat(cupon.valor) / 100) : parseFloat(cupon.valor);
  return { cupon, descuento: Math.min(base, Math.max(0, bruto)) };
}

// Previsualización pública (sin transacción) para el checkout: valida y
// devuelve el descuento calculado, sin persistir nada.
async function validar(codigo, subtotal, cliente_id, items) {
  const { cupon, descuento } = await resolver(codigo, subtotal, cliente_id, undefined, items);
  return { codigo: cupon.codigo, tipo: cupon.tipo, valor: parseFloat(cupon.valor), descuento };
}

// Cupones exclusivos de un cliente (cliente_id del cupón = este cliente),
// activos, con usos disponibles y vigentes — para que en el checkout se
// elijan de una lista en vez de tener que dictar/tipear el código. Los
// cupones públicos (sin cliente_id) siguen siendo por código manual.
async function listarPorCliente(cliente_id) {
  if (!cliente_id) return [];
  const cupones = await Cupon.findAll({
    where: {
      cliente_id,
      activo: 1,
      [Op.and]: Sequelize.literal('usos_actuales < usos_maximos'),
    },
    order: [['fecha_expiracion', 'ASC'], ['creado_en', 'DESC']],
  });

  const disponibles = [];
  for (const cupon of cupones) {
    if (!estaActivoHoy({ fecha_fin: cupon.fecha_expiracion })) continue;
    if (cupon.limite_por_cliente) {
      const usosCliente = await Pedido.count({ where: { cupon_id: cupon.id, cliente_id, estado: 'completado' } });
      if (usosCliente >= cupon.limite_por_cliente) continue;
    }
    disponibles.push(cupon);
  }
  return _conDescripcion(disponibles);
}

// Nombre entendible para elegir el cupón en el cobro: el premio de la ruleta
// que lo generó, o "Regalo de cumpleaños". Los demás quedan solo con su código.
async function _conDescripcion(cupones) {
  if (!cupones.length) return [];
  const giros = await RuletaGiro.findAll({
    where: { cupon_id: cupones.map((c) => c.id) },
    attributes: ['cupon_id'],
    include: [{ model: RuletaPremio, as: 'premio', attributes: ['nombre'] }],
  });
  const premioDe = new Map(giros.map((g) => [g.cupon_id, g.premio?.nombre]));
  return cupones.map((c) => {
    const premio = premioDe.get(c.id);
    const origen = premio ? 'ruleta' : c.codigo.startsWith('CUMPLE') ? 'cumpleanos' : 'cupon';
    return {
      ...c.toJSON(),
      origen,
      descripcion: premio || (origen === 'cumpleanos' ? 'Regalo de cumpleaños' : null),
    };
  });
}

module.exports = { listar, obtener, crear, actualizar, eliminar, resolver, validar, listarPorCliente };
