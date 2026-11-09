const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const act = require('../actualizacion');

function dirTemp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'act-test-')); }

test('compararVersiones compara numéricamente', () => {
  assert.equal(act.compararVersiones('1.2.0', '1.10.0'), -1);
  assert.equal(act.compararVersiones('1.1.0', '1.1.0'), 0);
  assert.equal(act.compararVersiones('2.0.0', '1.9.9'), 1);
});

test('esArranqueDePC', () => {
  assert.equal(act.esArranqueDePC(899), true);
  assert.equal(act.esArranqueDePC(900), false);
});

test('esVueltaDeHibernacion: salto de reloj >= 2 h Y el uptime avanzó lo mismo (-5 min)', () => {
  const H = 3600 * 1000, M = 60 * 1000;
  assert.equal(act.esVueltaDeHibernacion(2 * H, 2 * H), true);
  assert.equal(act.esVueltaDeHibernacion(2 * H - 1, 2 * H), false);
  assert.equal(act.esVueltaDeHibernacion(5 * H, 5 * H - 5 * M), true);  // tolerancia de 5 min
  // Cambio manual de hora / corrección NTP: el reloj salta pero la PC no durmió.
  assert.equal(act.esVueltaDeHibernacion(3 * H, 30 * 1000), false);
  assert.equal(act.esVueltaDeHibernacion(3 * H, 3 * H - 5 * M - 1), false);
});

test('urlPermitida', () => {
  assert.equal(act.urlPermitida('https://salybrasas.codewave.com.bo'), true);
  assert.equal(act.urlPermitida('http://localhost:3002'), true);
  assert.equal(act.urlPermitida('http://127.0.0.1:3001'), true);
  assert.equal(act.urlPermitida('http://192.168.1.10:3001'), false);
  assert.equal(act.urlPermitida('http://ejemplo.com'), false);
  assert.equal(act.urlPermitida('no-url'), false);
});

test('rutas', () => {
  const d = path.resolve(os.tmpdir(), 'base');
  const r = act.rutas(d);
  assert.equal(r.exe, path.join(d, 'agente-impresion.exe'));
  assert.equal(r.anterior, path.join(d, 'agente-impresion.anterior.exe'));
  assert.equal(r.carpeta, path.join(d, 'actualizacion'));
  assert.equal(r.pendienteExe, path.join(d, 'actualizacion', 'agente-impresion.pendiente.exe'));
  assert.equal(r.pendienteJson, path.join(d, 'actualizacion', 'pendiente.json'));
  assert.equal(r.fallidasJson, path.join(d, 'actualizacion', 'fallidas.json'));
  assert.equal(r.aplicandoLock, path.join(d, 'actualizacion', 'aplicando.lock'));
  assert.equal(r.nuevo, path.join(d, 'agente-impresion.nuevo.exe'));
});

test('verificarArchivo', async () => {
  const f = path.join(dirTemp(), 'a.bin');
  fs.writeFileSync(f, 'hola');
  const h = crypto.createHash('sha256').update('hola').digest('hex');
  assert.equal(await act.sha256Archivo(f), h);
  assert.equal(await act.verificarArchivo(f, h, 4), true);
  assert.equal(await act.verificarArchivo(f, 'x'.repeat(64), 4), false);
  assert.equal(await act.verificarArchivo(f, h, 5), false);
  assert.equal(await act.verificarArchivo(f + '.no', h, 4), false);
});

test('marcarFallida es idempotente y crea la carpeta', () => {
  const d = dirTemp();
  assert.deepEqual(act.leerFallidas(d), []);
  act.marcarFallida(d, '1.2.0');
  act.marcarFallida(d, '1.2.0');
  assert.deepEqual(act.leerFallidas(d), ['1.2.0']);
});

test('leerPendiente', () => {
  const d = dirTemp();
  assert.equal(act.leerPendiente(d), null);
  fs.mkdirSync(act.rutas(d).carpeta);
  fs.writeFileSync(act.rutas(d).pendienteJson, '{no json');
  assert.equal(act.leerPendiente(d), null);
  fs.writeFileSync(act.rutas(d).pendienteJson, JSON.stringify({ version: '1.2.0', sha256: 'ab', tamano: 3 }));
  assert.deepEqual(act.leerPendiente(d), { version: '1.2.0', sha256: 'ab', tamano: 3 });
});

test('esAgenteVivo', () => {
  assert.equal(act.esAgenteVivo(process.pid), true);
  assert.equal(act.esAgenteVivo(999999), false);
});

// ---- revisarYDescargar ----
const http = require('http');

// Servidor local que imita /api/v1/agente/version y /descargar.
function servidorAgente(opciones) {
  const o = Object.assign({ version: '1.2.0', contenido: Buffer.from('EXE-FALSO-' + 'x'.repeat(5000)), shaMal: false, version404: false }, opciones);
  const sha = crypto.createHash('sha256').update(o.contenido).digest('hex');
  const stats = { descargas: 0, versiones: 0 };
  const srv = http.createServer((req, res) => {
    if (req.url === '/api/v1/agente/version') {
      stats.versiones++;
      if (o.version404) { res.statusCode = 404; return res.end('{}'); }
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({
        version: o.version, sha256: o.shaMal ? 'a'.repeat(64) : sha,
        tamano: o.contenido.length, generado_en: new Date().toISOString(),
      }));
    }
    if (req.url === '/api/v1/agente/descargar') {
      stats.descargas++;
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Length', o.contenido.length);
      return res.end(o.contenido);
    }
    res.statusCode = 404; res.end();
  });
  return new Promise(resolve => srv.listen(0, '127.0.0.1', () => {
    resolve({ srv, stats, url: 'http://127.0.0.1:' + srv.address().port, sha, contenido: o.contenido });
  }));
}
const cerrar = s => new Promise(r => { s.srv.close(r); s.srv.closeAllConnections && s.srv.closeAllConnections(); });
const logNulo = () => {};

test('revisarYDescargar: al día no crea archivos', async () => {
  const s = await servidorAgente({ version: '1.1.0' });
  const dir = dirTemp();
  try {
    const r = await act.revisarYDescargar({ servidor: s.url, dirBase: dir, versionActual: '1.1.0', log: logNulo });
    assert.equal(r.estado, 'al_dia');
    assert.equal(fs.existsSync(act.rutas(dir).carpeta), false);
    assert.equal(s.stats.descargas, 0);
  } finally { await cerrar(s); }
});

test('revisarYDescargar: descarga, verifica y segunda llamada es ya_pendiente', async () => {
  const s = await servidorAgente();
  const dir = dirTemp();
  try {
    const r = await act.revisarYDescargar({ servidor: s.url, dirBase: dir, versionActual: '1.1.0', log: logNulo });
    assert.equal(r.estado, 'descargado');
    assert.equal(r.version, '1.2.0');
    const p = act.leerPendiente(dir);
    assert.equal(p.version, '1.2.0');
    assert.equal(await act.verificarArchivo(act.rutas(dir).pendienteExe, p.sha256, p.tamano), true);
    assert.equal(fs.existsSync(act.rutas(dir).pendienteExe + '.tmp'), false);
    const r2 = await act.revisarYDescargar({ servidor: s.url, dirBase: dir, versionActual: '1.1.0', log: logNulo });
    assert.equal(r2.estado, 'ya_pendiente');
    assert.equal(s.stats.descargas, 1);
  } finally { await cerrar(s); }
});

test('revisarYDescargar: sha incorrecto => error sin pendiente ni .tmp', async () => {
  const s = await servidorAgente({ shaMal: true });
  const dir = dirTemp();
  try {
    const r = await act.revisarYDescargar({ servidor: s.url, dirBase: dir, versionActual: '1.1.0', log: logNulo });
    assert.equal(r.estado, 'error');
    const rt = act.rutas(dir);
    assert.equal(fs.existsSync(rt.pendienteJson), false);
    assert.equal(fs.existsSync(rt.pendienteExe), false);
    assert.equal(fs.existsSync(rt.pendienteExe + '.tmp'), false);
  } finally { await cerrar(s); }
});

test('revisarYDescargar: versión en fallidas => fallida sin descargar', async () => {
  const s = await servidorAgente();
  const dir = dirTemp();
  try {
    act.marcarFallida(dir, '1.2.0');
    const r = await act.revisarYDescargar({ servidor: s.url, dirBase: dir, versionActual: '1.1.0', log: logNulo });
    assert.equal(r.estado, 'fallida');
    assert.equal(s.stats.descargas, 0);
  } finally { await cerrar(s); }
});

test('revisarYDescargar: 404 en /version => error', async () => {
  const s = await servidorAgente({ version404: true });
  const dir = dirTemp();
  try {
    const r = await act.revisarYDescargar({ servidor: s.url, dirBase: dir, versionActual: '1.1.0', log: logNulo });
    assert.equal(r.estado, 'error');
  } finally { await cerrar(s); }
});

test('revisarYDescargar: servidor caído => error', async () => {
  const s = await servidorAgente();
  const url = s.url;
  await cerrar(s);
  const r = await act.revisarYDescargar({ servidor: url, dirBase: dirTemp(), versionActual: '1.1.0', log: logNulo });
  assert.equal(r.estado, 'error');
});

test('revisarYDescargar: http no local => sin_https sin requests', async () => {
  let llamadas = 0;
  const r = await act.revisarYDescargar({
    servidor: 'http://192.168.1.10:3001', dirBase: dirTemp(), versionActual: '1.1.0', log: logNulo,
    fetchImpl: async () => { llamadas++; throw new Error('no debería'); },
  });
  assert.equal(r.estado, 'sin_https');
  assert.equal(llamadas, 0);
});

test('revisarYDescargar: pendiente viejo (<= actual) se borra', async () => {
  const s = await servidorAgente({ version: '1.1.0' });
  const dir = dirTemp();
  try {
    const rt = act.rutas(dir);
    fs.mkdirSync(rt.carpeta, { recursive: true });
    fs.writeFileSync(rt.pendienteExe, 'viejo');
    fs.writeFileSync(rt.pendienteJson, JSON.stringify({ version: '1.0.5', sha256: 'b'.repeat(64), tamano: 5 }));
    const r = await act.revisarYDescargar({ servidor: s.url, dirBase: dir, versionActual: '1.1.0', log: logNulo });
    assert.equal(r.estado, 'al_dia');
    assert.equal(fs.existsSync(rt.pendienteExe), false);
    assert.equal(fs.existsSync(rt.pendienteJson), false);
  } finally { await cerrar(s); }
});

test('revisarYDescargar: falla al escribir el .tmp => error sin lanzar ni colgar', async () => {
  const s = await servidorAgente({ contenido: crypto.randomBytes(8 * 1024 * 1024) });
  const dir = dirTemp();
  try {
    const rt = act.rutas(dir);
    // El .tmp es una carpeta: createWriteStream falla (EISDIR).
    fs.mkdirSync(rt.pendienteExe + '.tmp', { recursive: true });
    const r = await Promise.race([
      act.revisarYDescargar({ servidor: s.url, dirBase: dir, versionActual: '1.1.0', log: logNulo }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('colgado')), 5000)),
    ]);
    assert.equal(r.estado, 'error');
    assert.equal(fs.existsSync(rt.pendienteJson), false);
    assert.equal(fs.existsSync(rt.pendienteExe), false);
  } finally { await cerrar(s); }
});

test('revisarYDescargar: 404 en /descargar => error sin pendiente', async () => {
  const s = await servidorAgente();
  s.srv.removeAllListeners('request');
  s.srv.on('request', (req, res) => {
    if (req.url === '/api/v1/agente/version') {
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ version: '1.2.0', sha256: s.sha, tamano: s.contenido.length, generado_en: 'x' }));
    }
    res.statusCode = 404; res.end();
  });
  const dir = dirTemp();
  try {
    const r = await act.revisarYDescargar({ servidor: s.url, dirBase: dir, versionActual: '1.1.0', log: logNulo });
    assert.equal(r.estado, 'error');
    assert.equal(fs.existsSync(act.rutas(dir).pendienteJson), false);
  } finally { await cerrar(s); }
});

// ---- reemplazarYLanzar / alArrancar ----

// Carpeta con agente-impresion.exe='viejo' y un pendiente 'nuevo' válido (1.2.0).
function escenarioPendiente(opciones) {
  const o = Object.assign({ version: '1.2.0', shaMal: false }, opciones);
  const dir = dirTemp();
  const r = act.rutas(dir);
  fs.writeFileSync(r.exe, 'viejo');
  fs.mkdirSync(r.carpeta, { recursive: true });
  fs.writeFileSync(r.pendienteExe, 'nuevo');
  const sha = o.shaMal ? 'b'.repeat(64) : crypto.createHash('sha256').update('nuevo').digest('hex');
  fs.writeFileSync(r.pendienteJson, JSON.stringify({ version: o.version, sha256: sha, tamano: 5 }));
  return { dir, r };
}

function falsos(respuestaSalud) {
  const f = { lanzados: [], matados: 0 };
  f.lanzar = (exe) => { f.lanzados.push(exe); };
  f.consultarSalud = async () => (typeof respuestaSalud === 'function' ? respuestaSalud() : respuestaSalud);
  f.matarNuevo = () => { f.matados++; };
  return f;
}

const rapido = { timeoutMs: 300, intervaloMs: 20, log: () => {} };

test('reemplazarYLanzar: salud responde la versión nueva => ok', async () => {
  const { dir, r } = escenarioPendiente();
  const f = falsos('1.2.0');
  const res = await act.reemplazarYLanzar(Object.assign({ dirBase: dir, versionNueva: '1.2.0' }, f, rapido));
  assert.equal(res.ok, true);
  assert.deepEqual(f.lanzados, [r.exe]);
  assert.equal(fs.readFileSync(r.exe, 'utf8'), 'nuevo');
  assert.equal(fs.readFileSync(r.anterior, 'utf8'), 'viejo');
  assert.equal(fs.existsSync(r.pendienteExe), false);
  assert.equal(fs.existsSync(r.pendienteJson), false);
  assert.equal(f.matados, 0);
});

test('reemplazarYLanzar: salud nunca responde => vuelta atrás', async () => {
  const { dir, r } = escenarioPendiente();
  const f = falsos(null);
  const res = await act.reemplazarYLanzar(Object.assign({ dirBase: dir, versionNueva: '1.2.0' }, f, rapido));
  assert.equal(res.ok, false);
  assert.equal(fs.readFileSync(r.exe, 'utf8'), 'viejo');
  assert.equal(f.matados, 1);
  assert.ok(act.leerFallidas(dir).includes('1.2.0'));
  assert.equal(fs.existsSync(r.pendienteExe), false);
  assert.equal(fs.existsSync(r.pendienteJson), false);
});

test('reemplazarYLanzar: responde la versión vieja => se trata como fallo', async () => {
  const { dir, r } = escenarioPendiente();
  const f = falsos('1.1.0');
  const res = await act.reemplazarYLanzar(Object.assign({ dirBase: dir, versionNueva: '1.2.0' }, f, rapido));
  assert.equal(res.ok, false);
  assert.equal(fs.readFileSync(r.exe, 'utf8'), 'viejo');
  assert.equal(f.matados, 1);
  assert.ok(act.leerFallidas(dir).includes('1.2.0'));
});

test('reemplazarYLanzar: consultarSalud que lanza error cuenta como sin respuesta', async () => {
  const { dir, r } = escenarioPendiente();
  const f = falsos(() => { throw new Error('ECONNREFUSED'); });
  const res = await act.reemplazarYLanzar(Object.assign({ dirBase: dir, versionNueva: '1.2.0' }, f, rapido));
  assert.equal(res.ok, false);
  assert.equal(fs.readFileSync(r.exe, 'utf8'), 'viejo');
});

test('reemplazarYLanzar: lanzar que lanza error => vuelta atrás', async () => {
  const { dir, r } = escenarioPendiente();
  const f = falsos('1.2.0');
  f.lanzar = () => { throw new Error('spawn EACCES'); };
  const res = await act.reemplazarYLanzar(Object.assign({ dirBase: dir, versionNueva: '1.2.0' }, f, rapido));
  assert.equal(res.ok, false);
  assert.equal(fs.readFileSync(r.exe, 'utf8'), 'viejo');
  assert.ok(act.leerFallidas(dir).includes('1.2.0'));
});

function opcionesArranque(dir, f, extra) {
  return Object.assign({ dirBase: dir, versionActual: '1.1.0', uptimeSeg: 60, agenteVivo: () => false }, f, rapido, extra);
}

test('alArrancar: aplica en arranque de PC con pendiente válido', async () => {
  const { dir, r } = escenarioPendiente();
  const f = falsos('1.2.0');
  assert.equal(await act.alArrancar(opcionesArranque(dir, f)), 'aplicado');
  assert.equal(fs.readFileSync(r.exe, 'utf8'), 'nuevo');
  assert.equal(fs.existsSync(r.aplicandoLock), false);
});

test('alArrancar: fallo al aplicar => sin_cambios, exe viejo y lock liberado', async () => {
  const { dir, r } = escenarioPendiente();
  const f = falsos(null);
  assert.equal(await act.alArrancar(opcionesArranque(dir, f)), 'sin_cambios');
  assert.equal(fs.readFileSync(r.exe, 'utf8'), 'viejo');
  assert.equal(fs.existsSync(r.aplicandoLock), false);
});

test('alArrancar: PC encendida hace rato => sin_cambios sin lanzar', async () => {
  const { dir, r } = escenarioPendiente();
  const f = falsos('1.2.0');
  assert.equal(await act.alArrancar(opcionesArranque(dir, f, { uptimeSeg: 3600 })), 'sin_cambios');
  assert.equal(f.lanzados.length, 0);
  assert.equal(fs.readFileSync(r.exe, 'utf8'), 'viejo');
});

test('alArrancar: el agente nuevo (versión = pendiente) no vuelve a aplicar', async () => {
  const { dir, r } = escenarioPendiente();
  const f = falsos('1.2.0');
  assert.equal(await act.alArrancar(opcionesArranque(dir, f, { versionActual: '1.2.0' })), 'sin_cambios');
  assert.equal(f.lanzados.length, 0);
  assert.equal(fs.readFileSync(r.exe, 'utf8'), 'viejo');
});

test('alArrancar: ya hay un agente vivo => sin_cambios', async () => {
  const { dir } = escenarioPendiente();
  const f = falsos('1.2.0');
  assert.equal(await act.alArrancar(opcionesArranque(dir, f, { agenteVivo: () => true })), 'sin_cambios');
  assert.equal(f.lanzados.length, 0);
});

test('alArrancar: aplicando.lock de un proceso vivo => otro_aplicando', async () => {
  const { dir, r } = escenarioPendiente();
  fs.writeFileSync(r.aplicandoLock, String(process.pid));
  const f = falsos('1.2.0');
  assert.equal(await act.alArrancar(opcionesArranque(dir, f)), 'otro_aplicando');
  assert.equal(f.lanzados.length, 0);
  assert.equal(fs.readFileSync(r.aplicandoLock, 'utf8'), String(process.pid)); // no se toca el lock ajeno
  assert.equal(fs.readFileSync(r.exe, 'utf8'), 'viejo');
});

test('alArrancar: aplicando.lock abandonado (PID muerto) se toma y se aplica', async () => {
  const { dir, r } = escenarioPendiente();
  fs.writeFileSync(r.aplicandoLock, '999999');
  const f = falsos('1.2.0');
  assert.equal(await act.alArrancar(opcionesArranque(dir, f)), 'aplicado');
  assert.equal(fs.existsSync(r.aplicandoLock), false);
});

test('alArrancar: pendiente con sha distinto => sin_cambios y pendiente borrado', async () => {
  const { dir, r } = escenarioPendiente({ shaMal: true });
  const f = falsos('1.2.0');
  assert.equal(await act.alArrancar(opcionesArranque(dir, f)), 'sin_cambios');
  assert.equal(f.lanzados.length, 0);
  assert.equal(fs.existsSync(r.pendienteExe), false);
  assert.equal(fs.existsSync(r.pendienteJson), false);
  assert.equal(fs.readFileSync(r.exe, 'utf8'), 'viejo');
});

test('alArrancar: pendiente con versión <= actual => sin_cambios y pendiente borrado', async () => {
  const { dir, r } = escenarioPendiente({ version: '1.0.0' });
  const f = falsos('1.0.0');
  assert.equal(await act.alArrancar(opcionesArranque(dir, f)), 'sin_cambios');
  assert.equal(f.lanzados.length, 0);
  assert.equal(fs.existsSync(r.pendienteExe), false);
  assert.equal(fs.existsSync(r.pendienteJson), false);
});

test('alArrancar: pendiente de una versión ya fallida => sin_cambios sin lanzar', async () => {
  const { dir, r } = escenarioPendiente();
  act.marcarFallida(dir, '1.2.0');
  const f = falsos('1.2.0');
  assert.equal(await act.alArrancar(opcionesArranque(dir, f)), 'sin_cambios');
  assert.equal(f.lanzados.length, 0);
  assert.equal(fs.existsSync(r.pendienteExe), false);
});

test('alArrancar: sin pendiente => sin_cambios', async () => {
  const dir = dirTemp();
  fs.writeFileSync(act.rutas(dir).exe, 'viejo');
  const f = falsos('1.2.0');
  assert.equal(await act.alArrancar(opcionesArranque(dir, f)), 'sin_cambios');
  assert.equal(f.lanzados.length, 0);
});

test('agenteVivoSegunLock', () => {
  const dir = dirTemp();
  const lock = path.join(dir, 'agente.lock');
  assert.equal(act.agenteVivoSegunLock(lock), false); // no existe
  fs.writeFileSync(lock, 'basura');
  assert.equal(act.agenteVivoSegunLock(lock), false);
  fs.writeFileSync(lock, '999999');
  assert.equal(act.agenteVivoSegunLock(lock), false);
  fs.writeFileSync(lock, String(process.pid));
  assert.equal(act.agenteVivoSegunLock(lock), true);
});

// Review Focus 2: el agente viejo que termina tras un reemplazo exitoso no
// debe borrar el agente.lock que ya tomó el nuevo.
test('borrarLockSiEsMio: solo borra el lock si tiene el PID propio', () => {
  const dir = dirTemp();
  const lock = path.join(dir, 'agente.lock');
  fs.writeFileSync(lock, '12345');
  act.borrarLockSiEsMio(lock, 999);
  assert.equal(fs.existsSync(lock), true); // es del agente nuevo: no se toca
  fs.writeFileSync(lock, '999');
  act.borrarLockSiEsMio(lock, 999);
  assert.equal(fs.existsSync(lock), false);
  act.borrarLockSiEsMio(lock, 999); // no existe: no lanza
});

// El agente nuevo arranca mientras el viejo aún tiene aplicando.lock (esperando
// su /salud): no debe retirarse como "otro_aplicando", sino seguir y atender.
test('alArrancar: agente nuevo con aplicando.lock ajeno vivo => sin_cambios', async () => {
  const { dir, r } = escenarioPendiente();
  fs.writeFileSync(r.aplicandoLock, String(process.pid));
  const f = falsos('1.2.0');
  assert.equal(await act.alArrancar(opcionesArranque(dir, f, { versionActual: '1.2.0' })), 'sin_cambios');
  assert.equal(f.lanzados.length, 0);
});

// ---- Final review: copia preparada + fsync, restauración en segundo plano ----

// Envuelve fs.renameSync para registrar (y opcionalmente hacer fallar) cada rename.
function renombradorEspia(debeFallar) {
  const e = { llamadas: [] };
  e.renombrar = (de, a) => {
    e.llamadas.push([path.basename(de), path.basename(a)]);
    if (debeFallar && debeFallar(de, a)) { const err = new Error('EBUSY: simulado'); err.code = 'EBUSY'; throw err; }
    fs.renameSync(de, a);
  };
  return e;
}

test('reemplazarYLanzar: copia a .nuevo.exe y el exe solo cambia por dos renames (nuevo ya completo)', async () => {
  const { dir, r } = escenarioPendiente();
  fs.writeFileSync(r.nuevo, 'sobrante de un intento anterior');
  const f = falsos('1.2.0');
  let nuevoAlRenombrar = null;
  const e = renombradorEspia((de) => { if (de === r.nuevo) nuevoAlRenombrar = fs.readFileSync(r.nuevo, 'utf8'); return false; });
  const res = await act.reemplazarYLanzar(Object.assign({ dirBase: dir, versionNueva: '1.2.0', renombrar: e.renombrar }, f, rapido));
  assert.equal(res.ok, true);
  assert.deepEqual(e.llamadas, [
    ['agente-impresion.exe', 'agente-impresion.anterior.exe'],
    ['agente-impresion.nuevo.exe', 'agente-impresion.exe'],
  ]);
  assert.equal(nuevoAlRenombrar, 'nuevo'); // la copia ya estaba completa antes de tocar el exe
  assert.equal(fs.readFileSync(r.exe, 'utf8'), 'nuevo');
  assert.equal(fs.readFileSync(r.anterior, 'utf8'), 'viejo');
  assert.equal(fs.existsSync(r.nuevo), false);
});

test('reemplazarYLanzar: el pendiente desapareció antes de copiar => exe intacto, sin marcar fallida', async () => {
  const { dir, r } = escenarioPendiente();
  fs.writeFileSync(r.anterior, 'anterior-previo');
  fs.unlinkSync(r.pendienteExe);
  const f = falsos('1.2.0');
  const res = await act.reemplazarYLanzar(Object.assign({ dirBase: dir, versionNueva: '1.2.0' }, f, rapido));
  assert.equal(res.ok, false);
  assert.equal(fs.readFileSync(r.exe, 'utf8'), 'viejo');
  assert.equal(fs.readFileSync(r.anterior, 'utf8'), 'anterior-previo'); // ni se tocó
  assert.equal(fs.existsSync(r.nuevo), false);
  assert.equal(f.lanzados.length, 0);
  assert.deepEqual(act.leerFallidas(dir), []);
});

test('reemplazarYLanzar: la copia preparada no coincide con el sha => se aborta sin tocar el exe', async () => {
  const { dir, r } = escenarioPendiente();
  fs.writeFileSync(r.anterior, 'anterior-previo');
  fs.writeFileSync(r.pendienteExe, 'nueva'); // mismo tamaño, otro contenido
  const f = falsos('1.2.0');
  const res = await act.reemplazarYLanzar(Object.assign({ dirBase: dir, versionNueva: '1.2.0' }, f, rapido));
  assert.equal(res.ok, false);
  assert.equal(fs.readFileSync(r.exe, 'utf8'), 'viejo');
  assert.equal(fs.readFileSync(r.anterior, 'utf8'), 'anterior-previo');
  assert.equal(fs.existsSync(r.nuevo), false);
  assert.equal(f.lanzados.length, 0);
  assert.deepEqual(act.leerFallidas(dir), []);
});

test('reemplazarYLanzar: falla el rename nuevo→exe => exe anterior restaurado, sin marcar fallida', async () => {
  const { dir, r } = escenarioPendiente();
  const f = falsos('1.2.0');
  const e = renombradorEspia((de) => de === r.nuevo);
  const res = await act.reemplazarYLanzar(Object.assign({ dirBase: dir, versionNueva: '1.2.0', renombrar: e.renombrar }, f, rapido));
  assert.equal(res.ok, false);
  assert.equal(fs.readFileSync(r.exe, 'utf8'), 'viejo');
  assert.equal(fs.existsSync(r.nuevo), false);
  assert.equal(f.lanzados.length, 0);
  assert.deepEqual(act.leerFallidas(dir), []);
});

test('reemplazarYLanzar: restauración que falla sigue en segundo plano hasta lograrlo', async () => {
  const { dir, r } = escenarioPendiente();
  const f = falsos(null);
  let fallosRestaurar = 0;
  const e = renombradorEspia((de, a) => {
    if (de === r.anterior && a === r.exe && fallosRestaurar < 45) { fallosRestaurar++; return true; }
    return false;
  });
  const logs = [];
  const res = await act.reemplazarYLanzar(Object.assign({ dirBase: dir, versionNueva: '1.2.0' }, f, rapido, {
    renombrar: e.renombrar, esperaRestaurarMs: 1, intervaloRestauracionMs: 5, log: (m) => logs.push(m),
  }));
  assert.equal(res.ok, false);
  assert.ok(act.leerFallidas(dir).includes('1.2.0'));
  assert.equal(act.restauracionPendiente(), true);
  assert.ok(res.restauracion && typeof res.restauracion.then === 'function');
  await res.restauracion;
  assert.equal(fallosRestaurar, 45);
  assert.equal(fs.readFileSync(r.exe, 'utf8'), 'viejo');
  assert.equal(fs.existsSync(r.anterior), false);
  assert.equal(act.restauracionPendiente(), false);
  assert.equal(logs.filter((m) => m.includes('No se pudo restaurar')).length, 1); // cada fallo distinto, una vez
  assert.equal(logs.filter((m) => m.includes('restaurado')).length, 1);
});

test('reemplazarYLanzar: no se aplica nada mientras hay una restauración pendiente', async () => {
  const a = escenarioPendiente();
  fs.writeFileSync(a.r.anterior, 'viejo');
  let destrabar = false;
  const prom = act.restaurarEnSegundoPlano(a.dir, {
    intervaloMs: 5, renombrar: (de, hacia) => { if (!destrabar) throw new Error('EBUSY'); fs.renameSync(de, hacia); },
  });
  const b = escenarioPendiente();
  const f = falsos('1.2.0');
  const res = await act.reemplazarYLanzar(Object.assign({ dirBase: b.dir, versionNueva: '1.2.0' }, f, rapido));
  assert.equal(res.ok, false);
  assert.equal(f.lanzados.length, 0);
  assert.equal(fs.readFileSync(b.r.exe, 'utf8'), 'viejo');
  destrabar = true;
  await prom;
  assert.equal(act.restauracionPendiente(), false);
});

test('restaurarEnSegundoPlano: sin anterior no hay nada que restaurar', async () => {
  const dir = dirTemp();
  fs.writeFileSync(act.rutas(dir).exe, 'x');
  let llamadas = 0;
  await act.restaurarEnSegundoPlano(dir, { intervaloMs: 5, renombrar: () => { llamadas++; } });
  assert.equal(llamadas, 0);
  assert.equal(act.restauracionPendiente(), false);
});

// start-agent.vbs lanza agente-impresion.anterior.exe si falta el exe (corte de
// luz entre los dos renames): ese proceso también es un agente para el lock.
test('esImagenDeAgente: el exe, el anterior y el propio cuentan; otro programa no', () => {
  assert.equal(act.esImagenDeAgente('agente-impresion.exe'), true);
  assert.equal(act.esImagenDeAgente('AGENTE-IMPRESION.ANTERIOR.EXE'), true);
  assert.equal(act.esImagenDeAgente(path.basename(process.execPath)), true);
  assert.equal(act.esImagenDeAgente('svchost.exe'), false);
  assert.equal(act.esImagenDeAgente('agente-impresion.nuevo.exe'), false);
});
