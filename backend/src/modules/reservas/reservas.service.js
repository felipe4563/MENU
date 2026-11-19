// Reservas de mesa. Las fechas se manejan en hora de Bolivia (-04:00), como
// el resto del sistema: "2026-11-20T20:00" sin zona se toma como 20:00 local.
const { Op } = require('sequelize');
const sequelize = require('../../config/database');
const { Reserva, ReservaItem, ReservaPago, Mesa, Area, Usuario } = require('../../models');
const { emitir } = require('../../socket');
const ventasService = require('../ventas/ventas.service');
const { round2 } = require('../devoluciones/calculo');

const ZONA = '-04:00';
const ACTIVAS = ['pendiente', 'llego'];
const ENVIOS_COCINA = ['al_llegar', 'antes', 'manual'];
const error = (mensaje, status = 400) => Object.assign(new Error(mensaje), { status });

const INCLUDE = [
  { model: Mesa, as: 'mesa', attributes: ['id', 'nombre', 'asientos'] },
  { model: Usuario, as: 'usuario', attributes: ['id', 'nombre'] },
  { model: ReservaItem, as: 'items' },
  { model: ReservaPago, as: 'pagos', include: [{ model: Usuario, as: 'usuario', attributes: ['id', 'nombre'] }] },
];
const ORDEN_HIJOS = [[{ model: ReservaItem, as: 'items' }, 'id', 'ASC'], [{ model: ReservaPago, as: 'pagos' }, 'id', 'ASC']];

// Lo adelantado que sigue a favor del cliente: adelantos menos devoluciones
// (solo los completados).
function _adelantado(pagos = []) {
  return round2(pagos.filter((p) => p.estado === 'completado')
    .reduce((s, p) => s + (p.tipo === 'devolucion' ? -1 : 1) * Number(p.monto), 0));
}

const _totalPlatos = (items = []) => round2(items.reduce((s, i) => s + Number(i.precio) * Number(i.cantidad), 0));

// Reserva con sus platos, pagos y los montos calculados.
function _json(r) {
  const o = r.get({ plain: true });
  const total_platos = _totalPlatos(o.items);
  const adelantado = _adelantado(o.pagos);
  return { ...o, total_platos, adelantado, saldo: Math.max(0, round2(total_platos - adelantado)) };
}

const _cargar = (id) => Reserva.findByPk(id, { include: INCLUDE, order: ORDEN_HIJOS });

// Platos que manda el cajero: cada uno se valida como una línea de venta y el
// precio queda congelado (no cambia si después cambia el del producto).
async function _items(entrada) {
  if (!Array.isArray(entrada)) throw error('Los platos de la reserva no son válidos');
  const filas = [];
  for (const item of entrada) {
    if (!item || (!item.producto_id && !item.combo_id)) throw error('Elige el plato o combo');
    const cantidad = item.cantidad == null || item.cantidad === '' ? 1 : Number(item.cantidad);
    if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 999) throw error('La cantidad de cada plato debe ser entre 1 y 999');
    const nota = item.nota ? String(item.nota).trim() : null;
    if (nota && nota.length > 255) throw error('La nota de un plato no puede pasar de 255 letras');
    const esCombo = Boolean(item.combo_id);
    const opcion_ids = !esCombo && Array.isArray(item.opcion_ids) && item.opcion_ids.length ? item.opcion_ids.map(Number) : null;
    const opciones_por_producto = esCombo && Array.isArray(item.opciones_por_producto) && item.opciones_por_producto.length ? item.opciones_por_producto : null;
    const linea = await ventasService.precioLinea({
      producto_id: item.producto_id, combo_id: item.combo_id, cantidad, peso: item.peso,
      opcion_ids: opcion_ids || [], opciones_por_producto: opciones_por_producto || [],
    });
    filas.push({
      producto_id: esCombo ? null : Number(item.producto_id),
      combo_id: esCombo ? Number(item.combo_id) : null,
      cantidad: linea.cantidad,
      peso: linea.peso,
      nota: nota || null,
      opcion_ids,
      opciones_por_producto,
      precio: round2(linea.precio),
      nombre: linea.nombre,
    });
  }
  return filas;
}

function _envioCocina(valor) {
  if (valor == null || valor === '') return null;
  if (!ENVIOS_COCINA.includes(valor)) throw error('La forma de mandar a cocina no es válida');
  return valor;
}

function _fecha(valor) {
  if (!valor) throw error('Indica el día y la hora de la reserva');
  const texto = String(valor);
  const conZona = /([zZ]|[+-]\d{2}:\d{2})$/.test(texto) ? texto : `${texto.length === 16 ? `${texto}:00` : texto}${ZONA}`;
  const f = new Date(conZona);
  if (Number.isNaN(f.getTime())) throw error('La fecha de la reserva no es válida');
  return f;
}

const _horaLocal = (f) => new Date(f.getTime() - 4 * 3600000).toISOString().slice(11, 16);
// Día pedido (yyyy-mm-dd) o, si no viene bien, hoy en Bolivia; y su rango.
const _dia = (fecha) => (/^\d{4}-\d{2}-\d{2}$/.test(fecha || '') ? fecha : new Date(Date.now() - 4 * 3600000).toISOString().slice(0, 10));
const _rangoDia = (dia) => ({ [Op.between]: [new Date(`${dia}T00:00:00${ZONA}`), new Date(`${dia}T23:59:59${ZONA}`)] });

function _datos(entrada, previo = {}) {
  const v = { ...previo, ...entrada };
  const nombre = String(v.nombre_cliente ?? '').trim();
  if (!nombre) throw error('Escribe a nombre de quién es la reserva');
  if (nombre.length > 100) throw error('El nombre es muy largo');
  const personas = Number(v.personas);
  if (!Number.isInteger(personas) || personas < 1 || personas > 100) throw error('Las personas deben ser entre 1 y 100');
  const duracion = v.duracion_min == null || v.duracion_min === '' ? 120 : Number(v.duracion_min);
  if (!Number.isInteger(duracion) || duracion < 15 || duracion > 600) throw error('La duración debe ser entre 15 minutos y 10 horas');
  const telefono = v.telefono ? String(v.telefono).trim().slice(0, 30) : null;
  const notas = v.notas ? String(v.notas).trim() : null;
  if (notas && notas.length > 255) throw error('La nota no puede pasar de 255 letras');
  return {
    nombre_cliente: nombre,
    telefono: telefono || null,
    personas,
    duracion_min: duracion,
    notas: notas || null,
    fecha_hora: _fecha(v.fecha_hora),
    mesa_id: v.mesa_id ? Number(v.mesa_id) : null,
  };
}

async function _validarMesa(mesa_id, sucursal_id) {
  if (!mesa_id) return;
  const mesa = await Mesa.findByPk(mesa_id, { include: [{ model: Area, as: 'area', attributes: ['sucursal_id'] }] });
  if (!mesa || mesa.area?.sucursal_id !== sucursal_id) throw error('Esa mesa no es de esta sucursal', 404);
}

// Otra reserva activa de la misma mesa cuyo horario se cruza.
async function _verificarCruce({ mesa_id, fecha_hora, duracion_min }, sucursal_id, excluir_id = null) {
  if (!mesa_id) return;
  const inicio = fecha_hora.getTime();
  const fin = inicio + duracion_min * 60000;
  const cercanas = await Reserva.findAll({
    where: {
      sucursal_id, mesa_id, estado: ACTIVAS,
      ...(excluir_id ? { id: { [Op.ne]: excluir_id } } : {}),
      fecha_hora: { [Op.between]: [new Date(inicio - 600 * 60000), new Date(fin)] },
    },
  });
  const cruce = cercanas.find((r) => {
    const a = new Date(r.fecha_hora).getTime();
    return a < fin && inicio < a + r.duracion_min * 60000;
  });
  if (cruce) {
    const desde = new Date(cruce.fecha_hora);
    const hasta = new Date(desde.getTime() + cruce.duracion_min * 60000);
    throw error(`Esa mesa ya está reservada de ${_horaLocal(desde)} a ${_horaLocal(hasta)} (${cruce.nombre_cliente})`, 409);
  }
}

function _verificarAlcance(reserva, alcance) {
  if (!alcance.acceso_todas && reserva.sucursal_id !== alcance.sucursal_id) throw error('Reserva no encontrada', 404);
}

// Reservas de un día (por defecto hoy), más temprano primero.
async function listar({ fecha } = {}, alcance) {
  const where = { fecha_hora: _rangoDia(_dia(fecha)) };
  if (!alcance.acceso_todas) where.sucursal_id = alcance.sucursal_id;
  const reservas = await Reserva.findAll({ where, include: INCLUDE, order: [['fecha_hora', 'ASC'], ['id', 'ASC'], ...ORDEN_HIJOS] });
  return reservas.map(_json);
}

async function obtener(id, alcance) {
  const r = await _cargar(id);
  if (!r) throw error('Reserva no encontrada', 404);
  _verificarAlcance(r, alcance);
  return _json(r);
}

// Platos de las reservas pendientes del día, para que cocina se prepare:
// totales por plato (el más pedido primero) y el detalle de cada reserva.
async function platosDelDia({ fecha } = {}, alcance) {
  const dia = _dia(fecha);
  const where = { estado: 'pendiente', fecha_hora: _rangoDia(dia) };
  if (!alcance.acceso_todas) where.sucursal_id = alcance.sucursal_id;
  const reservas = await Reserva.findAll({
    where,
    include: [
      { model: Mesa, as: 'mesa', attributes: ['id', 'nombre'] },
      { model: ReservaItem, as: 'items', required: true },
    ],
    order: [['fecha_hora', 'ASC'], ['id', 'ASC'], [{ model: ReservaItem, as: 'items' }, 'id', 'ASC']],
  });
  const suma = new Map();
  for (const r of reservas) {
    for (const i of r.items) suma.set(i.nombre, (suma.get(i.nombre) || 0) + i.cantidad);
  }
  const totales = [...suma].map(([nombre, cantidad]) => ({ nombre, cantidad }))
    .sort((a, b) => b.cantidad - a.cantidad || a.nombre.localeCompare(b.nombre));
  return {
    fecha: dia,
    totales,
    reservas: reservas.map((r) => ({
      id: r.id,
      hora: _horaLocal(new Date(r.fecha_hora)),
      nombre_cliente: r.nombre_cliente,
      personas: r.personas,
      mesa: r.mesa?.nombre ?? null,
      items: r.items.map((i) => ({ nombre: i.nombre, cantidad: i.cantidad, nota: i.nota })),
    })),
  };
}

async function crear(entrada, usuario_id, sucursal_id) {
  const datos = _datos(entrada);
  if (datos.fecha_hora.getTime() < Date.now() - 30 * 60000) throw error('Esa hora ya pasó');
  await _validarMesa(datos.mesa_id, sucursal_id);
  await _verificarCruce(datos, sucursal_id);
  const envio_cocina = _envioCocina(entrada.envio_cocina);
  const items = entrada.items !== undefined ? await _items(entrada.items) : [];
  const id = await sequelize.transaction(async (t) => {
    const r = await Reserva.create({ ...datos, envio_cocina, sucursal_id, usuario_id }, { transaction: t });
    if (items.length) await ReservaItem.bulkCreate(items.map((i) => ({ ...i, reserva_id: r.id })), { transaction: t });
    return r.id;
  });
  emitir('restaurante:actualizar', { tipo: 'reserva' }, sucursal_id);
  return _json(await _cargar(id));
}

// Si vienen `items` se reemplazan todos los platos (con el precio de ahora);
// si no vienen, los platos no se tocan.
async function actualizar(id, entrada, alcance) {
  const previa = await Reserva.findByPk(id);
  if (!previa) throw error('Reserva no encontrada', 404);
  _verificarAlcance(previa, alcance);
  if (!ACTIVAS.includes(previa.estado)) throw error('Esta reserva ya está cerrada', 409);
  if (previa.pedido_id && entrada.items !== undefined) throw error('Esta reserva ya está en cocina: cambia el pedido', 409);
  const envio_cocina = entrada.envio_cocina !== undefined ? _envioCocina(entrada.envio_cocina) : undefined;
  const items = entrada.items !== undefined ? await _items(entrada.items) : null;
  await sequelize.transaction(async (t) => {
    // Bloqueo de la fila: que un adelanto o el paso a cocina no se crucen con
    // esta edición.
    const r = await Reserva.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
    if (!ACTIVAS.includes(r.estado)) throw error('Esta reserva ya está cerrada', 409);
    const datos = _datos(entrada, r.get({ plain: true }));
    if (r.pedido_id) {
      const cambiaHora = datos.fecha_hora.getTime() !== new Date(r.fecha_hora).getTime();
      const cambiaMesa = (datos.mesa_id || null) !== (r.mesa_id || null);
      if (items || cambiaHora || cambiaMesa) throw error('Esta reserva ya está en cocina: cambia el pedido', 409);
    }
    if (items) {
      const pagos = await ReservaPago.findAll({ where: { reserva_id: r.id }, transaction: t });
      const adelantado = _adelantado(pagos);
      if (_totalPlatos(items) < adelantado) {
        throw error(`Lo adelantado (Bs ${adelantado.toFixed(2)}) pasa el total de los platos: devuelve la diferencia primero`, 409);
      }
    }
    await _validarMesa(datos.mesa_id, r.sucursal_id);
    await _verificarCruce(datos, r.sucursal_id, r.id);
    await r.update({ ...datos, ...(envio_cocina !== undefined ? { envio_cocina } : {}) }, { transaction: t });
    if (items) {
      await ReservaItem.destroy({ where: { reserva_id: r.id }, transaction: t });
      if (items.length) await ReservaItem.bulkCreate(items.map((i) => ({ ...i, reserva_id: r.id })), { transaction: t });
    }
  });
  emitir('restaurante:actualizar', { tipo: 'reserva' }, previa.sucursal_id);
  return _json(await _cargar(id));
}

// "Llegó" manda los platos a cocina si todavía no salieron (en `mesa_id` si
// está libre) y, si ya salieron para llevar, pasa el pedido a esa mesa.
async function cambiarEstado(id, estado, alcance, { mesa_id, usuario_id } = {}) {
  if (!Reserva.ESTADOS.includes(estado)) throw error('Estado no válido');
  const r = await Reserva.findByPk(id);
  if (!r) throw error('Reserva no encontrada', 404);
  _verificarAlcance(r, alcance);
  if (estado === 'llego') {
    // Recién convertido ya usó la mesa si estaba libre (si no, salió para llevar).
    if (!r.pedido_id) {
      await require('./convertir.service').convertirEnPedido(r.id, usuario_id, { mesa_id, alcance });
    } else if (mesa_id) {
      const pedido = await ventasService.obtener(r.pedido_id);
      if (pedido.tipo === 'llevar' && !pedido.mesa_id && ['pendiente', 'listo'].includes(pedido.estado)) {
        await ventasService.asignarMesaReserva(r.pedido_id, Number(mesa_id));
      }
    }
  }
  // Volver a "pendiente" una cancelada vuelve a ocupar su horario.
  if (estado === 'pendiente' && !ACTIVAS.includes(r.estado)) {
    await _verificarCruce({ mesa_id: r.mesa_id, fecha_hora: new Date(r.fecha_hora), duracion_min: r.duracion_min }, r.sucursal_id, r.id);
  }
  await r.update({ estado });
  emitir('restaurante:actualizar', { tipo: 'reserva' }, r.sucursal_id);
  return _json(await _cargar(r.id));
}

module.exports = { listar, obtener, platosDelDia, crear, actualizar, cambiarEstado };
