// Públicas (sin login): las consulta el propio agente de impresión de cada
// caja para saber si hay una versión nueva y descargarla. No exponen nada
// sensible: el mismo .exe se entrega a quien instala una caja.
const { Router } = require('express');
const limitador = require('../../middlewares/limitador');
const svc = require('./agente.service');

const router = Router();

router.get('/version', (_req, res) => {
  const info = svc.versionPublicada();
  if (!info) return res.status(404).json({ ok: false, mensaje: 'Este servidor no tiene el agente de impresión publicado.' });
  res.set('Cache-Control', 'no-store');
  res.json(info);
});

// ~39 MB por descarga: tope por IP para que nadie lo use para gastar ancho de banda.
router.get('/descargar', limitador({ ventanaMs: 60 * 60 * 1000, maximo: 20, mensaje: 'Demasiadas descargas del agente. Intenta más tarde.' }), (_req, res, next) => {
  const info = svc.versionPublicada();
  if (!info) return res.status(404).json({ ok: false, mensaje: 'Este servidor no tiene el agente de impresión publicado.' });
  res.set('Cache-Control', 'no-store');
  res.set('X-Agente-Version', info.version);
  res.download(svc.archivoExe(), 'agente-impresion.exe', (err) => { if (err && !res.headersSent) next(err); });
});

module.exports = router;
