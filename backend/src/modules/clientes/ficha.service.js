// Ficha del cliente: todo lo suyo en un solo lugar (cupones, ruleta,
// movimientos de puntos y lo que más pide). No hay un libro de puntos
// guardado: el historial se arma con las ventas (ganó/canjeó) y los giros.
const { Op, QueryTypes } = require('sequelize');
const { sequelize, Cliente, Pedido, RuletaGiro, RuletaPremio, Cupon } = require('../../models');
const { listarPorCliente } = require('../cupones/cupones.service');

async function ficha(id) {
  const cliente = await Cliente.findByPk(id, { attributes: ['id', 'nombre', 'puntos'] });
  if (!cliente) throw Object.assign(new Error('Cliente no encontrado'), { status: 404 });

  const [resumen] = await sequelize.query(`
    SELECT COUNT(*) AS visitas, COALESCE(SUM(total - total_devuelto), 0) AS gastado, MAX(creado_en) AS ultima_visita
    FROM pedidos WHERE cliente_id = :id AND estado = 'completado'`, { replacements: { id }, type: QueryTypes.SELECT });

  // Lo que más pide: unidades vigentes (sin lo anulado) de ventas completadas.
  const favoritos = await sequelize.query(`
    SELECT COALESCE(p.nombre, c.nombre) AS nombre, d.producto_id, d.combo_id,
           SUM(d.cantidad - d.cantidad_anulada) AS cantidad, COUNT(DISTINCT d.pedido_id) AS veces
    FROM detalle_pedidos d
    JOIN pedidos pe ON pe.id = d.pedido_id AND pe.cliente_id = :id AND pe.estado = 'completado'
    LEFT JOIN productos p ON p.id = d.producto_id
    LEFT JOIN combos c ON c.id = d.combo_id
    GROUP BY d.producto_id, d.combo_id, p.nombre, c.nombre
    HAVING cantidad > 0
    ORDER BY cantidad DESC, veces DESC
    LIMIT 6`, { replacements: { id }, type: QueryTypes.SELECT });

  const giros = await RuletaGiro.findAll({
    where: { cliente_id: id },
    include: [
      { model: RuletaPremio, as: 'premio', attributes: ['nombre', 'tipo'] },
      { model: Cupon, as: 'cupon', attributes: ['codigo', 'usos_actuales', 'usos_maximos', 'fecha_expiracion'] },
    ],
    order: [['creado_en', 'DESC']],
    limit: 20,
  });

  const ventas = await Pedido.findAll({
    where: { cliente_id: id, estado: 'completado', [Op.or]: [{ puntos_ganados: { [Op.gt]: 0 } }, { puntos_canjeados: { [Op.gt]: 0 } }] },
    attributes: ['id', 'creado_en', 'puntos_ganados', 'puntos_canjeados', 'total'],
    order: [['creado_en', 'DESC']],
    limit: 30,
  });

  const movimientos = [
    ...ventas.flatMap((v) => [
      ...(v.puntos_ganados > 0 ? [{ tipo: 'ganado', puntos: v.puntos_ganados, fecha: v.creado_en, pedido_id: v.id, detalle: 'Compra' }] : []),
      ...(v.puntos_canjeados > 0 ? [{ tipo: 'canjeado', puntos: -v.puntos_canjeados, fecha: v.creado_en, pedido_id: v.id, detalle: 'Descuento en compra' }] : []),
    ]),
    ...giros.filter((g) => g.puntos_gastados > 0).map((g) => ({ tipo: 'ruleta', puntos: -g.puntos_gastados, fecha: g.creado_en, detalle: `Ruleta: ${g.premio?.nombre ?? 'giro'}` })),
  ].sort((a, b) => new Date(b.fecha) - new Date(a.fecha)).slice(0, 30);

  const hoy = new Date(Date.now() - 4 * 3600 * 1000).toISOString().slice(0, 10);
  return {
    cliente: { id: cliente.id, nombre: cliente.nombre, puntos: cliente.puntos },
    resumen: {
      visitas: Number(resumen.visitas),
      gastado: parseFloat(resumen.gastado),
      ultima_visita: resumen.ultima_visita,
    },
    favoritos: favoritos.map((f) => ({ ...f, cantidad: Number(f.cantidad), veces: Number(f.veces) })),
    cupones: await listarPorCliente(id),
    giros: giros.map((g) => ({
      id: g.id, fecha: g.creado_en, premio: g.premio?.nombre ?? '—', sin_premio: g.premio?.tipo === 'nada', puntos: g.puntos_gastados,
      cupon: g.cupon ? {
        codigo: g.cupon.codigo,
        estado: g.cupon.usos_actuales >= g.cupon.usos_maximos ? 'usado' : (g.cupon.fecha_expiracion && g.cupon.fecha_expiracion < hoy ? 'vencido' : 'vigente'),
      } : null,
    })),
    movimientos,
  };
}

module.exports = { ficha };
