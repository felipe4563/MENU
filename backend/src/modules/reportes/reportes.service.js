const { Op, fn, literal } = require('sequelize');
const {
  Pedido, DetallePedido, Mesa, Cliente, Producto, Combo, Usuario,
  RegistroInventario, Compra, Proveedor, LibroCaja, SesionCaja, Sucursal,
  Opcion, GrupoOpciones, DetallePedidoComboOpcion,
} = require('../../models');

// Offset fijo de Bolivia: un datetime sin offset se parsea en la hora local
// del proceso de Node, que puede no coincidir con la del negocio (-04:00).
function filtroFecha(desde, hasta) {
  if (!desde && !hasta) return {};
  const range = {};
  if (desde) range[Op.gte] = new Date(`${desde}T00:00:00-04:00`);
  if (hasta) range[Op.lte] = new Date(`${hasta}T23:59:59-04:00`);
  return { creado_en: range };
}

const INCLUDE_SUCURSAL = { model: Sucursal, as: 'sucursal', attributes: ['id', 'nombre'] };

const LIMITE_DEFAULT = 20;
const LIMITE_MAX = 100;

function _paginaLimite(filtros = {}) {
  const pagina = Math.max(parseInt(filtros.pagina, 10) || 1, 1);
  const limiteReq = filtros.limite === undefined ? LIMITE_DEFAULT : parseInt(filtros.limite, 10);
  const limite = limiteReq === 0 ? 0 : Math.min(Math.max(limiteReq || LIMITE_DEFAULT, 1), LIMITE_MAX);
  return { pagina, limite };
}

function _whereVentas(filtros, alcance) {
  const { desde, hasta, usuario_id, metodo_pago, tipo, origen } = filtros;
  const where = { estado: 'completado', ...filtroFecha(desde, hasta) };
  if (!alcance.acceso_todas) where.sucursal_id = alcance.sucursal_id;
  else if (filtros.sucursal_id) where.sucursal_id = filtros.sucursal_id;
  if (usuario_id) where.usuario_id = usuario_id;
  if (metodo_pago) where.metodo_pago = metodo_pago;
  if (tipo) where.tipo = tipo;
  if (origen) where.origen = origen;
  return where;
}

async function ventas(filtros = {}, alcance) {
  const where = _whereVentas(filtros, alcance);
  const { pagina, limite } = _paginaLimite(filtros);

  const { rows, count } = await Pedido.findAndCountAll({
    where,
    include: [
      { model: Mesa,    as: 'mesa',    attributes: ['id', 'nombre'] },
      { model: Cliente, as: 'cliente', attributes: ['id', 'nombre'] },
      { model: Usuario, as: 'usuario', attributes: ['id', 'nombre'] },
      INCLUDE_SUCURSAL,
      {
        model: DetallePedido, as: 'detalles',
        include: [
          { model: Producto, as: 'producto', attributes: ['id', 'nombre'] },
          { model: Combo, as: 'combo', attributes: ['id', 'nombre'] },
          {
            model: Opcion, as: 'opciones', attributes: ['id', 'nombre'], through: { attributes: [] },
            include: [{ model: GrupoOpciones, as: 'grupo', attributes: ['id', 'nombre'] }],
          },
        ],
      },
    ],
    order: [['creado_en', 'DESC']],
    distinct: true,
    ...(limite ? { limit: limite, offset: (pagina - 1) * limite } : {}),
  });

  return { filas: rows, pagina, limite, total: count, total_paginas: limite ? Math.ceil(count / limite) : 1 };
}

async function ventasResumen(filtros = {}, alcance) {
  const where = _whereVentas(filtros, alcance);

  // Si `metodo_pago` está filtrado a un solo valor, el otro lado es 0 sin
  // consultar la BD — sumar con `{ ...where, metodo_pago: 'qr' }` cuando el
  // caller pidió solo efectivo ignoraría ese filtro y devolvería el total sin
  // filtrar (mismo patrón que cajaResumen para `tipo` y libro_caja.service.js
  // resumen() para `tipo`).
  const [totalVentas, ventasEfectivo, ventasQR, ventasAppExterna, cantidad, cajerosRaw] = await Promise.all([
    Pedido.sum('total', { where }),
    (!filtros.metodo_pago || filtros.metodo_pago === 'efectivo')
      ? Pedido.sum('total', { where: { ...where, metodo_pago: 'efectivo' } })
      : Promise.resolve(0),
    (!filtros.metodo_pago || filtros.metodo_pago === 'qr')
      ? Pedido.sum('total', { where: { ...where, metodo_pago: 'qr' } })
      : Promise.resolve(0),
    (!filtros.metodo_pago || filtros.metodo_pago === 'app_externa')
      ? Pedido.sum('total', { where: { ...where, metodo_pago: 'app_externa' } })
      : Promise.resolve(0),
    Pedido.count({ where }),
    Pedido.findAll({
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
  if (alcance.acceso_todas) {
    // El listado de sucursales para el <select> del admin debe reflejar TODAS
    // las sucursales que calzan con los demás filtros, sin restringirse a la
    // que el propio admin ya eligió — si no, al elegir una sucursal el
    // dropdown colapsa a una sola opción y no se puede cambiar directamente
    // de una sucursal a otra sin pasar antes por "Todas".
    const whereSucursales = { ...where };
    delete whereSucursales.sucursal_id;
    const sucursalesRaw = await Pedido.findAll({
      where: whereSucursales, include: [INCLUDE_SUCURSAL], attributes: [],
      group: ['sucursal.id', 'sucursal.nombre'], raw: true,
    });
    filtrosResp.sucursales = sucursalesRaw
      .map((f) => ({ id: f['sucursal.id'], nombre: f['sucursal.nombre'] }))
      .filter((s) => s.id != null);
  }

  return {
    total_ventas: parseFloat(totalVentas || 0),
    ventas_efectivo: parseFloat(ventasEfectivo || 0),
    ventas_qr: parseFloat(ventasQR || 0),
    ventas_app_externa: parseFloat(ventasAppExterna || 0),
    cantidad: cantidad || 0,
    filtros: filtrosResp,
  };
}

async function ventasProductos(filtros = {}, alcance) {
  const where = _whereVentas(filtros, alcance);

  const filas = await DetallePedido.findAll({
    include: [
      { model: Pedido, attributes: [], where, required: true },
      { model: Producto, as: 'producto', attributes: ['nombre'], required: false },
      { model: Combo, as: 'combo', attributes: ['nombre'], required: false },
    ],
    attributes: [
      'producto_id',
      'combo_id',
      // Para productos vendidos por peso, la cantidad real es `peso` (kg), no
      // el conteo `cantidad` de la línea — igual que ventasVariantes() más
      // abajo. Sumar solo `cantidad` (como antes) subestimaba/distorsionaba
      // el ranking de "Más vendidos" para cualquier producto pesable.
      [literal('SUM(COALESCE(`DetallePedido`.`peso`, `DetallePedido`.`cantidad`))'), 'cantidad'],
      [fn('SUM', literal('`DetallePedido`.`cantidad` * `DetallePedido`.`precio`')), 'monto'],
      [literal("MAX(CASE WHEN `DetallePedido`.`peso` IS NOT NULL THEN 'kg' ELSE 'un' END)"), 'unidad'],
    ],
    group: ['DetallePedido.producto_id', 'DetallePedido.combo_id', 'producto.nombre', 'combo.nombre'],
    order: [[literal('cantidad'), 'DESC']],
    raw: true,
  });

  return filas.map((f) => ({
    id: f.producto_id ?? f.combo_id,
    tipo: f.producto_id ? 'producto' : 'combo',
    nombre: f['producto.nombre'] ?? f['combo.nombre'] ?? '(eliminado)',
    cantidad: parseFloat(f.cantidad || 0),
    monto: parseFloat(f.monto || 0),
    unidad: f.unidad || 'un',
  }));
}

// Replica exacta de claveVariante/nombreVariante en
// frontend/src/pages/reportes/tabs/TabVariantes.jsx (líneas 16-31): agrupa por
// producto + combinación exacta de opciones elegidas (ordenadas por id para
// que el orden de selección no genere filas distintas). Los combos también
// pueden tener, por cada producto interno, una opción elegida
// (DetallePedidoComboOpcion) — se agrupan por combo_id + combinación exacta
// de esas elecciones (producto_id + opcion_id, ordenadas), con el mismo
// criterio que ya usa el carrito para distinguir variantes (ver
// _claveOpcionesCombo en VentasPage.jsx/AutoservicioPage.jsx).
function _esLineaCombo(detalle) {
  return detalle.producto?.id == null && detalle.combo?.id != null;
}

function _comboOpcionesOrdenadas(detalle) {
  return [...(detalle.combo_opciones || [])].sort((a, b) => {
    if (a.producto_id !== b.producto_id) return a.producto_id - b.producto_id;
    return a.opcion_id - b.opcion_id;
  });
}

function _claveVariante(detalle) {
  if (_esLineaCombo(detalle)) {
    const combinacion = _comboOpcionesOrdenadas(detalle).map((o) => `${o.producto_id}:${o.opcion_id}`).join(',');
    return `combo-${detalle.combo.id}::${combinacion}`;
  }
  const opcionIds = (detalle.opciones || []).map((o) => o.id).sort((a, b) => a - b);
  return `${detalle.producto?.id}::${opcionIds.join(',')}`;
}

function _nombreVariante(detalle) {
  if (_esLineaCombo(detalle)) {
    const base = `${detalle.combo?.nombre || 'Combo eliminado'} (Combo)`;
    const elecciones = _comboOpcionesOrdenadas(detalle)
      .map((o) => o.opcion?.nombre ? `${o.producto?.nombre || 'Producto'}: ${o.opcion.nombre}` : null)
      .filter(Boolean);
    return elecciones.length ? `${base} — ${elecciones.join(', ')}` : base;
  }
  const opciones = [...(detalle.opciones || [])].sort((a, b) => a.id - b.id);
  const base = detalle.producto?.nombre || 'Producto eliminado';
  return opciones.length ? `${base} — ${opciones.map((o) => o.nombre).join(', ')}` : base;
}

async function ventasVariantes(filtros = {}, alcance) {
  const where = _whereVentas(filtros, alcance);

  const detalles = await DetallePedido.findAll({
    include: [
      { model: Pedido, attributes: [], where, required: true },
      { model: Producto, as: 'producto', attributes: ['id', 'nombre'], required: false },
      { model: Combo, as: 'combo', attributes: ['id', 'nombre'], required: false },
      { model: Opcion, as: 'opciones', attributes: ['id', 'nombre'], through: { attributes: [] } },
      {
        model: DetallePedidoComboOpcion, as: 'combo_opciones', required: false,
        include: [
          { model: Opcion, as: 'opcion', attributes: ['id', 'nombre'] },
          { model: Producto, as: 'producto', attributes: ['id', 'nombre'] },
        ],
      },
    ],
    attributes: ['producto_id', 'combo_id', 'cantidad', 'peso', 'precio'],
  });

  const mapa = new Map();
  detalles.forEach((d) => {
    if (d.producto?.id == null && d.combo?.id == null) return;
    const clave = _claveVariante(d);
    const esPesable = d.peso != null;
    const cantidad = esPesable ? parseFloat(d.peso || 0) : (d.cantidad || 0);
    const monto = (d.cantidad || 0) * parseFloat(d.precio || 0);
    if (!mapa.has(clave)) {
      const conOpciones = _esLineaCombo(d) ? (d.combo_opciones || []).length > 0 : (d.opciones || []).length > 0;
      mapa.set(clave, {
        clave, nombre: _nombreVariante(d), unidad: esPesable ? 'kg' : 'un',
        conOpciones, cantidad: 0, monto: 0, ventas: 0,
      });
    }
    const variante = mapa.get(clave);
    variante.cantidad += cantidad;
    variante.monto += monto;
    variante.ventas += 1;
  });

  return Array.from(mapa.values()).sort((a, b) => b.cantidad - a.cantidad);
}

function _whereInventario(filtros, alcance) {
  const { desde, hasta, tipo } = filtros;
  const where = filtroFecha(desde, hasta);
  if (!alcance.acceso_todas) where.sucursal_id = alcance.sucursal_id;
  else if (filtros.sucursal_id) where.sucursal_id = filtros.sucursal_id;
  if (tipo) where.tipo = tipo;
  return where;
}

async function inventario(filtros = {}, alcance) {
  const where = _whereInventario(filtros, alcance);
  const { pagina, limite } = _paginaLimite(filtros);

  const { rows, count } = await RegistroInventario.findAndCountAll({
    where,
    include: [
      { model: Producto, as: 'producto', attributes: ['id', 'nombre', 'stock'] },
      { model: Usuario,  as: 'usuario',  attributes: ['id', 'nombre'] },
      INCLUDE_SUCURSAL,
    ],
    order: [['creado_en', 'DESC']],
    distinct: true,
    ...(limite ? { limit: limite, offset: (pagina - 1) * limite } : {}),
  });

  return { filas: rows, pagina, limite, total: count, total_paginas: limite ? Math.ceil(count / limite) : 1 };
}

async function inventarioResumen(filtros = {}, alcance) {
  const where = _whereInventario(filtros, alcance);
  const cantidad = await RegistroInventario.count({ where });

  const filtrosResp = {};
  if (alcance.acceso_todas) {
    // Ver comentario equivalente en ventasResumen: el listado de sucursales
    // no debe restringirse a la que el propio admin ya eligió.
    const whereSucursales = { ...where };
    delete whereSucursales.sucursal_id;
    const sucursalesRaw = await RegistroInventario.findAll({
      where: whereSucursales, include: [INCLUDE_SUCURSAL], attributes: [],
      group: ['sucursal.id', 'sucursal.nombre'], raw: true,
    });
    filtrosResp.sucursales = sucursalesRaw
      .map((f) => ({ id: f['sucursal.id'], nombre: f['sucursal.nombre'] }))
      .filter((s) => s.id != null);
  }

  return { cantidad: cantidad || 0, filtros: filtrosResp };
}

function _whereCompras(filtros, alcance) {
  const { desde, hasta, estado } = filtros;
  const where = filtroFecha(desde, hasta);
  if (!alcance.acceso_todas) where.sucursal_id = alcance.sucursal_id;
  else if (filtros.sucursal_id) where.sucursal_id = filtros.sucursal_id;
  if (estado) where.estado = estado;
  return where;
}

async function compras(filtros = {}, alcance) {
  const where = _whereCompras(filtros, alcance);
  const { pagina, limite } = _paginaLimite(filtros);

  const { rows, count } = await Compra.findAndCountAll({
    where,
    include: [
      { model: Proveedor, as: 'proveedor', attributes: ['id', 'nombre'] },
      { model: Usuario,   as: 'usuario',   attributes: ['id', 'nombre'] },
      INCLUDE_SUCURSAL,
    ],
    order: [['creado_en', 'DESC']],
    distinct: true,
    ...(limite ? { limit: limite, offset: (pagina - 1) * limite } : {}),
  });

  return { filas: rows, pagina, limite, total: count, total_paginas: limite ? Math.ceil(count / limite) : 1 };
}

async function comprasResumen(filtros = {}, alcance) {
  const where = _whereCompras(filtros, alcance);

  const [totalComprado, cantidad] = await Promise.all([
    Compra.sum('total', { where }),
    Compra.count({ where }),
  ]);

  const filtrosResp = {};
  if (alcance.acceso_todas) {
    // Ver comentario equivalente en ventasResumen: el listado de sucursales
    // no debe restringirse a la que el propio admin ya eligió.
    const whereSucursales = { ...where };
    delete whereSucursales.sucursal_id;
    const sucursalesRaw = await Compra.findAll({
      where: whereSucursales, include: [INCLUDE_SUCURSAL], attributes: [],
      group: ['sucursal.id', 'sucursal.nombre'], raw: true,
    });
    filtrosResp.sucursales = sucursalesRaw
      .map((f) => ({ id: f['sucursal.id'], nombre: f['sucursal.nombre'] }))
      .filter((s) => s.id != null);
  }

  return { total_comprado: parseFloat(totalComprado || 0), cantidad: cantidad || 0, filtros: filtrosResp };
}

function _includeSesionCaja(filtros, alcance) {
  const includeSesion = {
    model: SesionCaja, as: 'sesion_caja', attributes: ['id'],
    include: [INCLUDE_SUCURSAL],
  };
  if (!alcance.acceso_todas) {
    includeSesion.where = { sucursal_id: alcance.sucursal_id };
  } else if (filtros.sucursal_id) {
    includeSesion.where = { sucursal_id: filtros.sucursal_id };
  }
  return includeSesion;
}

function _aplanarSucursal(registro) {
  const plano = registro.toJSON();
  plano.sucursal = plano.sesion_caja?.sucursal ?? null;
  delete plano.sesion_caja;
  return plano;
}

async function caja(filtros = {}, alcance) {
  const { desde, hasta, tipo } = filtros;
  const where = { ...filtroFecha(desde, hasta) };
  if (tipo) where.tipo = tipo;
  const { pagina, limite } = _paginaLimite(filtros);

  const { rows, count } = await LibroCaja.findAndCountAll({
    where,
    include: [
      { model: Usuario, as: 'usuario', attributes: ['id', 'nombre'] },
      _includeSesionCaja(filtros, alcance),
    ],
    order: [['creado_en', 'DESC']],
    distinct: true,
    ...(limite ? { limit: limite, offset: (pagina - 1) * limite } : {}),
  });

  return {
    filas: rows.map(_aplanarSucursal),
    pagina, limite, total: count,
    total_paginas: limite ? Math.ceil(count / limite) : 1,
  };
}

async function cajaResumen(filtros = {}, alcance) {
  const { desde, hasta, tipo } = filtros;
  const where = { ...filtroFecha(desde, hasta) };
  if (tipo) where.tipo = tipo;
  const includeSesion = _includeSesionCaja(filtros, alcance);

  // Si `tipo` está filtrado a un solo lado, el otro lado es 0 sin consultar
  // la BD — sumar con `{ ...where, tipo: 'egreso' }` cuando el caller pidió
  // solo ingresos ignoraría ese filtro y devolvería el total sin filtrar.
  const [totalIngresos, totalEgresos] = await Promise.all([
    (!filtros.tipo || filtros.tipo === 'ingreso')
      ? LibroCaja.sum('monto', { where: { ...where, tipo: 'ingreso' }, include: [includeSesion] })
      : Promise.resolve(0),
    (!filtros.tipo || filtros.tipo === 'egreso')
      ? LibroCaja.sum('monto', { where: { ...where, tipo: 'egreso' }, include: [includeSesion] })
      : Promise.resolve(0),
  ]);

  const filtrosResp = {};
  if (alcance.acceso_todas) {
    const sucursalesRaw = await LibroCaja.findAll({
      where,
      include: [{
        model: SesionCaja, as: 'sesion_caja', attributes: [], required: true,
        include: [{ model: Sucursal, as: 'sucursal', attributes: ['id', 'nombre'] }],
      }],
      attributes: [], group: ['sesion_caja.sucursal.id', 'sesion_caja.sucursal.nombre'], raw: true,
    });
    filtrosResp.sucursales = sucursalesRaw
      .map((f) => ({ id: f['sesion_caja.sucursal.id'], nombre: f['sesion_caja.sucursal.nombre'] }))
      .filter((s) => s.id != null);
  }

  return { total_ingresos: parseFloat(totalIngresos || 0), total_egresos: parseFloat(totalEgresos || 0), filtros: filtrosResp };
}

// SesionCaja tiene `timestamps: false` y no tiene columna `creado_en` (solo
// `abierto_en`/`cerrado_en`) — filtroFecha() asume `creado_en` y rompería la
// consulta en la BD. Un arqueo "ocurre" cuando la sesión se cierra, no cuando
// se abrió, así que se filtra por `cerrado_en` (el mismo campo por el que ya
// ordena arqueos()), con el mismo offset fijo de Bolivia que usa filtroFecha.
function _filtroFechaCierre(desde, hasta) {
  if (!desde && !hasta) return {};
  const range = {};
  if (desde) range[Op.gte] = new Date(`${desde}T00:00:00-04:00`);
  if (hasta) range[Op.lte] = new Date(`${hasta}T23:59:59-04:00`);
  return { cerrado_en: range };
}

function _whereArqueos(filtros, alcance) {
  const { desde, hasta, usuario_id } = filtros;
  const where = { estado: 'cerrada', ..._filtroFechaCierre(desde, hasta) };
  if (!alcance.acceso_todas) where.sucursal_id = alcance.sucursal_id;
  else if (filtros.sucursal_id) where.sucursal_id = filtros.sucursal_id;
  if (usuario_id) where.usuario_id = usuario_id;
  return where;
}

function _fueraDeTolerancia(sesion) {
  const tolerancia = parseFloat(sesion.sucursal?.tolerancia_cierre_caja ?? 0);
  return Math.abs(parseFloat(sesion.diferencia ?? 0)) > tolerancia;
}

async function arqueos(filtros = {}, alcance) {
  const where = _whereArqueos(filtros, alcance);
  const { pagina, limite } = _paginaLimite(filtros);

  const { rows, count } = await SesionCaja.findAndCountAll({
    where,
    include: [
      { model: Usuario, as: 'usuario', attributes: ['id', 'nombre'] },
      { model: Sucursal, as: 'sucursal', attributes: ['id', 'nombre', 'tolerancia_cierre_caja'] },
    ],
    order: [['cerrado_en', 'DESC']],
    distinct: true,
    ...(limite ? { limit: limite, offset: (pagina - 1) * limite } : {}),
  });

  const filas = rows.map((s) => {
    const plano = s.toJSON();
    plano.fuera_de_tolerancia = _fueraDeTolerancia(plano);
    return plano;
  });

  return { filas, pagina, limite, total: count, total_paginas: limite ? Math.ceil(count / limite) : 1 };
}

async function arqueosResumen(filtros = {}, alcance) {
  const where = _whereArqueos(filtros, alcance);

  const sesiones = await SesionCaja.findAll({
    where,
    include: [
      { model: Usuario, as: 'usuario', attributes: ['id', 'nombre'] },
      { model: Sucursal, as: 'sucursal', attributes: ['id', 'nombre', 'tolerancia_cierre_caja'] },
    ],
  });

  const porCajero = new Map();
  let cantidadFuera = 0;
  sesiones.forEach((s) => {
    const plano = s.toJSON();
    if (!_fueraDeTolerancia(plano)) return;
    cantidadFuera += 1;
    const id = plano.usuario?.id;
    if (id == null) return;
    const entrada = porCajero.get(id) || { id, nombre: plano.usuario.nombre, cantidad: 0 };
    entrada.cantidad += 1;
    porCajero.set(id, entrada);
  });

  let cajeroTop = null;
  for (const entrada of porCajero.values()) {
    if (!cajeroTop || entrada.cantidad > cajeroTop.cantidad) cajeroTop = entrada;
  }

  const cajerosRaw = await SesionCaja.findAll({
    where,
    include: [{ model: Usuario, as: 'usuario', attributes: ['id', 'nombre'] }],
    attributes: [],
    group: ['usuario.id', 'usuario.nombre'],
    raw: true,
  });
  const cajeros = cajerosRaw
    .map((f) => ({ id: f['usuario.id'], nombre: f['usuario.nombre'] }))
    .filter((c) => c.id != null);

  const filtrosResp = { cajeros };
  if (alcance.acceso_todas) {
    const whereSucursales = { ...where };
    delete whereSucursales.sucursal_id;
    const sucursalesRaw = await SesionCaja.findAll({
      where: whereSucursales, include: [INCLUDE_SUCURSAL], attributes: [],
      group: ['sucursal.id', 'sucursal.nombre'], raw: true,
    });
    filtrosResp.sucursales = sucursalesRaw
      .map((f) => ({ id: f['sucursal.id'], nombre: f['sucursal.nombre'] }))
      .filter((s) => s.id != null);
  }

  return { cantidad_fuera_tolerancia: cantidadFuera, cajero_top_diferencias: cajeroTop, filtros: filtrosResp };
}

// Resultado neto del período: ingresos de ventas menos gastos operativos
// (Libro Caja) menos costo de compras recibidas. Las compras recibidas ya
// generan su propio registro de egreso en Libro Caja (compras.service.js),
// así que acá se excluyen esos egresos (sesion_caja_id null) del lado de
// "gastos operativos" para no contar el mismo gasto dos veces — compras se
// suma aparte, con su propio total y su propio filtro de sucursal directo
// (Compra.sucursal_id), que es más confiable que el de Libro Caja para
// egresos sin sesión de caja asociada.
function _wheresFinanzas(filtros, alcance) {
  return {
    whereVentas: _whereVentas(filtros, alcance),
    whereGastos: { tipo: 'egreso', sesion_caja_id: { [Op.ne]: null }, ...filtroFecha(filtros.desde, filtros.hasta) },
    whereCompras: _whereCompras({ ...filtros, estado: 'recibido' }, alcance),
  };
}

async function finanzasResumen(filtros = {}, alcance) {
  const { whereVentas, whereGastos, whereCompras } = _wheresFinanzas(filtros, alcance);

  const [ingresos, gastosOperativos, comprasTotal] = await Promise.all([
    Pedido.sum('total', { where: whereVentas }),
    LibroCaja.sum('monto', { where: whereGastos, include: [_includeSesionCaja(filtros, alcance)] }),
    Compra.sum('total', { where: whereCompras }),
  ]);

  const filtrosResp = {};
  if (alcance.acceso_todas) {
    const whereSucursales = { ...whereVentas };
    delete whereSucursales.sucursal_id;
    const sucursalesRaw = await Pedido.findAll({
      where: whereSucursales, include: [INCLUDE_SUCURSAL], attributes: [],
      group: ['sucursal.id', 'sucursal.nombre'], raw: true,
    });
    filtrosResp.sucursales = sucursalesRaw
      .map((f) => ({ id: f['sucursal.id'], nombre: f['sucursal.nombre'] }))
      .filter((s) => s.id != null);
  }

  const totalIngresos = parseFloat(ingresos || 0);
  const totalGastos = parseFloat(gastosOperativos || 0);
  const totalCompras = parseFloat(comprasTotal || 0);

  return {
    ingresos: totalIngresos,
    gastos_operativos: totalGastos,
    compras: totalCompras,
    resultado_neto: totalIngresos - totalGastos - totalCompras,
    filtros: filtrosResp,
  };
}

// Fecha local (Bolivia, -04:00) en formato YYYY-MM-DD, para agrupar por día
// con el mismo offset fijo que filtroFecha() usa para el rango de consulta.
function _fechaLocalYMD(fecha) {
  return new Date(new Date(fecha).getTime() - 4 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// Desglose día por día del mismo cálculo que finanzasResumen, para el
// gráfico y el detalle del PDF — agrupado en JS (no con funciones de fecha
// SQL) para no depender del dialecto de la base y para reusar exactamente
// los mismos where de finanzasResumen sin duplicar su lógica de alcance.
async function finanzasSerie(filtros = {}, alcance) {
  const { whereVentas, whereGastos, whereCompras } = _wheresFinanzas(filtros, alcance);

  const [pedidos, gastos, compras] = await Promise.all([
    Pedido.findAll({ where: whereVentas, attributes: ['total', 'creado_en'], raw: true }),
    LibroCaja.findAll({ where: whereGastos, include: [_includeSesionCaja(filtros, alcance)], attributes: ['monto', 'creado_en'], raw: true }),
    Compra.findAll({ where: whereCompras, attributes: ['total', 'creado_en'], raw: true }),
  ]);

  const porDia = new Map();
  const sumar = (campo, clave) => (registro) => {
    const dia = _fechaLocalYMD(registro.creado_en);
    if (!porDia.has(dia)) porDia.set(dia, { fecha: dia, ingresos: 0, gastos_operativos: 0, compras: 0 });
    porDia.get(dia)[clave] += parseFloat(registro[campo] || 0);
  };
  pedidos.forEach(sumar('total', 'ingresos'));
  gastos.forEach(sumar('monto', 'gastos_operativos'));
  compras.forEach(sumar('total', 'compras'));

  return Array.from(porDia.values())
    .map((d) => ({ ...d, resultado_neto: d.ingresos - d.gastos_operativos - d.compras }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
}

module.exports = {
  ventas, ventasResumen, ventasProductos, ventasVariantes,
  inventario, inventarioResumen,
  compras, comprasResumen,
  caja, cajaResumen,
  arqueos, arqueosResumen,
  finanzasResumen, finanzasSerie,
};
