// Públicas: el navegador pide el manifest y los íconos antes de iniciar sesión.
// Las rutas de íconos no llevan ".png": el nginx del frontend sirve como
// archivo estático todo lo que termina en .png, antes de pasar a /api.
const { Router } = require('express');
const svc = require('./pwa.service');

const router = Router();

router.get('/manifest.webmanifest', async (_req, res, next) => {
  try {
    res.type('application/manifest+json');
    res.set('Cache-Control', 'no-cache');
    res.send(JSON.stringify(await svc.manifest()));
  } catch (e) { next(e); }
});

router.get('/icono/:tam', async (req, res, next) => {
  try {
    const png = await svc.icono(Number(req.params.tam), req.query.maskable === '1');
    if (!png) return res.status(404).json({ ok: false, mensaje: `Tamaños disponibles: ${svc.TAMANOS.join(', ')}` });
    res.type('image/png');
    // Con ?v= (cambia con el logo) se puede guardar mucho tiempo; sin él, poco.
    res.set('Cache-Control', req.query.v ? 'public, max-age=2592000, immutable' : 'public, max-age=300');
    // Helmet pone same-origin; en desarrollo la app (otro puerto) la muestra como favicon.
    res.set('Cross-Origin-Resource-Policy', 'cross-origin');
    res.send(png);
  } catch (e) { next(e); }
});

module.exports = router;
