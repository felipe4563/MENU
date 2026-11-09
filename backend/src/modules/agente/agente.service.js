// El .exe del agente de impresión que este servidor ofrece a sus cajas para
// que se auto-actualicen (ver print-agent/actualizacion.js). Lo deja en
// backend/agente-dist/ el script print-agent/scripts/publicar.js, en el deploy
// (deploy/deploy.sh) o al construir la imagen Docker (GitHub Actions).
const fs = require('fs');
const path = require('path');

const DIR = process.env.AGENTE_DIST_DIR || path.join(__dirname, '..', '..', '..', 'agente-dist');
const archivoExe = () => path.join(DIR, 'agente-impresion.exe');

// Se relee solo si agente.json cambió (un deploy PM2 lo reemplaza sin
// reiniciar el proceso antes de tiempo).
let cache = null; // { mtimeMs, info }

function versionPublicada() {
  let st;
  try { st = fs.statSync(path.join(DIR, 'agente.json')); } catch { return null; }
  if (cache && cache.mtimeMs === st.mtimeMs) return cache.info;
  try {
    const info = JSON.parse(fs.readFileSync(path.join(DIR, 'agente.json'), 'utf8'));
    if (!info.version || !/^[0-9a-f]{64}$/.test(info.sha256 || '') || !(info.tamano > 0)) return null;
    if (fs.statSync(archivoExe()).size !== info.tamano) return null; // exe a medio copiar
    const limpio = { version: info.version, sha256: info.sha256, tamano: info.tamano, generado_en: info.generado_en || null };
    cache = { mtimeMs: st.mtimeMs, info: limpio };
    return limpio;
  } catch {
    return null;
  }
}

module.exports = { versionPublicada, archivoExe };
