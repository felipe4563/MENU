// Manifest de la PWA e íconos con el logo de cada restaurante: al instalar la
// app (o en la pestaña del navegador) se ve su logo y su nombre, no el genérico.
// Los íconos se generan del logo subido en Ajustes › Negocio y marca.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const { obtenerPublica } = require('../configuracion/configuracion.service');

const UPLOADS = path.resolve(__dirname, '..', '..', '..', 'uploads');
const TAMANOS = [32, 64, 180, 192, 512];
const FONDO = '#17262B';

// El logo solo puede venir de la carpeta de uploads (nada de rutas raras).
function archivoLogo(logo) {
  if (typeof logo !== 'string' || !logo.startsWith('/uploads/')) return null;
  const ruta = path.resolve(UPLOADS, logo.slice('/uploads/'.length));
  if (!ruta.startsWith(UPLOADS + path.sep) || !fs.existsSync(ruta)) return null;
  return ruta;
}

const iniciales = (nombre) => String(nombre || 'M').trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || 'M';
const escapar = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Sin logo: las iniciales del negocio sobre el fondo pizarra.
function svgIniciales(nombre, tam) {
  const txt = escapar(iniciales(nombre));
  const fuente = Math.round(tam * (txt.length > 1 ? 0.38 : 0.5));
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${tam}" height="${tam}">
    <rect width="100%" height="100%" fill="${FONDO}"/>
    <text x="50%" y="50%" dy=".35em" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="${fuente}" fill="#F7F1E5">${txt}</text>
  </svg>`);
}

// Versión de los íconos: cambia cuando cambia el logo o el nombre, para que
// el navegador no se quede con el ícono viejo.
function versionDe(cfg) {
  return crypto.createHash('sha1').update(`${cfg.logo || ''}|${cfg.nombre_negocio || ''}`).digest('hex').slice(0, 10);
}

const cache = new Map(); // `${version}:${tam}:${maskable}` -> Buffer

async function icono(tam, maskable) {
  if (!TAMANOS.includes(tam)) return null;
  const cfg = await obtenerPublica();
  const clave = `${versionDe(cfg)}:${tam}:${maskable ? 1 : 0}`;
  if (cache.has(clave)) return cache.get(clave);

  const ruta = archivoLogo(cfg.logo);
  let png;
  if (!ruta) {
    png = await sharp(svgIniciales(cfg.nombre_negocio, tam)).png().toBuffer();
  } else if (maskable) {
    // Android recorta el ícono en círculo o gota: el logo va al 76 % sobre
    // fondo blanco para que no se le corten los bordes.
    const interior = Math.round(tam * 0.76);
    const logo = await sharp(ruta).resize(interior, interior, { fit: 'contain', background: '#FFFFFF' }).flatten({ background: '#FFFFFF' }).png().toBuffer();
    png = await sharp({ create: { width: tam, height: tam, channels: 4, background: '#FFFFFF' } }).composite([{ input: logo, gravity: 'center' }]).png().toBuffer();
  } else {
    png = await sharp(ruta).resize(tam, tam, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  }
  if (cache.size > 60) cache.clear();
  cache.set(clave, png);
  return png;
}

async function manifest() {
  const cfg = await obtenerPublica();
  const nombre = (cfg.nombre_negocio || 'Menú').trim();
  const v = versionDe(cfg);
  const ic = (tam, maskable) => ({
    src: `/api/v1/pwa/icono/${tam}?v=${v}${maskable ? '&maskable=1' : ''}`,
    sizes: `${tam}x${tam}`, type: 'image/png', purpose: maskable ? 'maskable' : 'any',
  });
  return {
    id: '/',
    name: nombre,
    short_name: nombre.length > 14 ? nombre.split(/\s+/)[0].slice(0, 14) : nombre,
    description: `Punto de venta, cocina y caja de ${nombre}`,
    theme_color: FONDO,
    background_color: FONDO,
    display: 'standalone',
    display_override: ['window-controls-overlay', 'standalone'],
    start_url: '/',
    scope: '/',
    orientation: 'any',
    lang: 'es',
    categories: ['business', 'food'],
    icons: [ic(192), ic(512), ic(192, true), ic(512, true)],
    shortcuts: [
      { name: 'Vender', url: '/vender', icons: [ic(192)] },
      { name: 'Cocina', url: '/cocina', icons: [ic(192)] },
      { name: 'Caja', url: '/caja', icons: [ic(192)] },
    ],
  };
}

module.exports = { manifest, icono, TAMANOS };
