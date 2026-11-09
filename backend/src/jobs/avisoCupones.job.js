// Avisa por correo a los clientes que tienen un cupón suyo por vencer, para
// que vuelvan a usarlo. Se activa en Ajustes › Puntos y cumpleaños; solo
// llega a quienes tienen correo, y una sola vez por cupón.
const { Op } = require('sequelize');
const { Cupon, Cliente, Configuracion } = require('../models');
const { listarPorCliente } = require('../modules/cupones/cupones.service');
const email = require('../integrations/email/email.client');

const hoyBolivia = () => new Date(Date.now() - 4 * 3600 * 1000).toISOString().slice(0, 10);
function sumarDias(iso, dias) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}
// "hoy", "mañana" o "el 14 de noviembre".
function cuandoVence(fecha, hoy) {
  if (fecha === hoy) return 'hoy';
  if (fecha === sumarDias(hoy, 1)) return 'mañana';
  return `el ${new Date(`${fecha}T12:00:00Z`).toLocaleDateString('es-BO', { day: 'numeric', month: 'long', timeZone: 'UTC' })}`;
}

async function avisarCuponesPorVencer({ enviar = email.enviarAvisoCupon, configurado = email.correoConfigurado } = {}) {
  const filas = await Configuracion.findAll({ where: { clave: ['cupones_aviso_activo', 'cupones_aviso_dias', 'nombre_negocio'] } });
  const cfg = Object.fromEntries(filas.map((f) => [f.clave, f.valor]));
  if (cfg.cupones_aviso_activo !== 'true' || !configurado()) return { enviados: 0 };

  const dias = Math.max(0, parseInt(cfg.cupones_aviso_dias, 10) || 2);
  const hoy = hoyBolivia();
  const cupones = await Cupon.findAll({
    where: {
      cliente_id: { [Op.ne]: null },
      activo: 1,
      aviso_vencimiento_en: null,
      fecha_expiracion: { [Op.between]: [hoy, sumarDias(hoy, dias)] },
    },
    include: [{ model: Cliente, as: 'cliente', attributes: ['id', 'nombre', 'email'], where: { email: { [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: '' }] } } }],
  });

  let enviados = 0;
  for (const cupon of cupones) {
    // Mismo criterio que el cobro: con usos disponibles y sin tope por cliente alcanzado.
    const disponibles = await listarPorCliente(cupon.cliente_id);
    const disponible = disponibles.find((c) => c.id === cupon.id);
    if (!disponible) continue;
    try {
      await enviar({
        to: cupon.cliente.email, cliente: cupon.cliente.nombre, negocio: cfg.nombre_negocio || 'el restaurante',
        premio: disponible.descripcion, codigo: cupon.codigo, vence: cuandoVence(cupon.fecha_expiracion, hoy),
      });
      await cupon.update({ aviso_vencimiento_en: new Date() });
      enviados++;
    } catch (e) {
      console.error(`No se pudo avisar el cupón ${cupon.codigo}:`, e.message);
    }
  }
  return { enviados };
}

module.exports = { avisarCuponesPorVencer };
