const { Caja, Sucursal } = require('../../models');
const { estadoAgentes, desconectadoEn } = require('../../socket');
const { versionPublicada } = require('../agente/agente.service');

async function obtenerEstadoAgentes(alcance) {
  const where = { modo_impresion: 'fisica', activo: 1 };
  if (!alcance.acceso_todas) where.sucursal_id = alcance.sucursal_id;

  const cajas = await Caja.findAll({
    where,
    attributes: ['id', 'nombre', 'sucursal_id'],
    include: [{ model: Sucursal, as: 'sucursal', attributes: ['id', 'nombre'] }],
    order: [['sucursal_id', 'ASC'], ['nombre', 'ASC']],
  });

  const porCaja = new Map();
  for (const a of estadoAgentes()) if (a.caja_id != null) porCaja.set(a.caja_id, a);
  const publicada = versionPublicada()?.version ?? null;

  return cajas.map((c) => {
    const a = porCaja.get(c.id);
    return {
      caja_id: c.id,
      caja_nombre: c.nombre,
      sucursal_id: c.sucursal_id,
      sucursal_nombre: c.sucursal ? c.sucursal.nombre : null,
      conectado: Boolean(a),
      // null en version = agente anterior a 1.1.0 (sin auto-actualización).
      version: a ? a.version : null,
      version_pendiente: a ? a.version_pendiente : null,
      autoactualizacion: a ? a.autoactualizacion : null,
      desconectado_en: a ? null : desconectadoEn(c.id),
      version_publicada: publicada,
    };
  });
}

module.exports = { obtenerEstadoAgentes };
