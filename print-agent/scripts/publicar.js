// Construye el .exe del agente y lo publica en backend/agente-dist/ junto con
// agente.json (version, sha256, tamano), que el backend sirve sin autenticación.
// Uso: npm run publicar [-- --salida <carpeta>]
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const raiz = path.join(__dirname, '..');
const i = process.argv.indexOf('--salida');
const salida = path.resolve(i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : path.join(raiz, '..', 'backend', 'agente-dist'));

const build = spawnSync('npm run build', { cwd: raiz, stdio: 'inherit', shell: true });
if (build.status !== 0) {
  console.error('El build del agente falló; no se publicó nada.');
  process.exit(build.status || 1);
}

const exe = path.join(raiz, 'dist', 'agente-impresion.exe');
const datos = fs.readFileSync(exe);
const info = {
  version: require(path.join(raiz, 'package.json')).version,
  sha256: crypto.createHash('sha256').update(datos).digest('hex'),
  tamano: datos.length,
  generado_en: new Date().toISOString(),
};

// Escritura atómica: primero el exe, después el json, cada uno vía archivo
// temporal + rename, para que nunca se sirva un json que no corresponda al exe.
fs.mkdirSync(salida, { recursive: true });
const sufijo = '.' + process.pid + '.tmp';
const destExe = path.join(salida, 'agente-impresion.exe');
const destJson = path.join(salida, 'agente.json');
fs.copyFileSync(exe, destExe + sufijo);
fs.renameSync(destExe + sufijo, destExe);
fs.writeFileSync(destJson + sufijo, JSON.stringify(info, null, 2), 'utf8');
fs.renameSync(destJson + sufijo, destJson);

console.log('Agente ' + info.version + ' publicado en ' + salida + ' (' + info.tamano + ' bytes, sha256 ' + info.sha256 + ')');
