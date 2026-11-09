// Lógica base de la auto-actualización del agente de impresión.
// Módulo sin efectos al cargarse: NO requiere agent.js (que arranca el agente
// al importarlo). Solo usa módulos nativos de Node.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

// Compara versiones "x.y.z" numéricamente (1.10.0 > 1.2.0). Devuelve -1, 0 o 1.
function compararVersiones(a, b) {
  const pa = String(a).split('.').map(function(n) { return parseInt(n, 10) || 0; });
  const pb = String(b).split('.').map(function(n) { return parseInt(n, 10) || 0; });
  const largo = Math.max(pa.length, pb.length);
  for (let i = 0; i < largo; i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x < y) return -1;
    if (x > y) return 1;
  }
  return 0;
}

// ¿La PC recién prendió? (menos de 15 min encendida)
function esArranqueDePC(uptimeSegundos) {
  return uptimeSegundos < 900;
}

// ¿El salto de reloj entre dos latidos indica que la PC estuvo dormida/hibernada? (>= 2 h)
// Además el uptime de Windows (os.uptime(), que SÍ cuenta el tiempo dormida o
// hibernada) tiene que haber avanzado casi lo mismo (5 min de tolerancia): si
// solo saltó el reloj (cambio manual de hora, corrección NTP) la PC no durmió
// y no se reemplaza nada en pleno servicio.
function esVueltaDeHibernacion(saltoMs, avanceUptimeMs) {
  return saltoMs >= 2 * 3600 * 1000 && avanceUptimeMs >= saltoMs - 5 * 60 * 1000;
}

// Solo se descarga de HTTPS, o de HTTP únicamente si es la propia máquina (desarrollo).
function urlPermitida(servidor) {
  let u;
  try { u = new URL(servidor); } catch { return false; }
  if (u.protocol === 'https:') return true;
  return u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1');
}

// Rutas absolutas de todos los archivos que intervienen en la actualización.
function rutas(dirBase) {
  const base = path.resolve(dirBase);
  const carpeta = path.join(base, 'actualizacion');
  return {
    exe:           path.join(base, 'agente-impresion.exe'),
    anterior:      path.join(base, 'agente-impresion.anterior.exe'),
    nuevo:         path.join(base, 'agente-impresion.nuevo.exe'),
    carpeta:       carpeta,
    pendienteExe:  path.join(carpeta, 'agente-impresion.pendiente.exe'),
    pendienteJson: path.join(carpeta, 'pendiente.json'),
    fallidasJson:  path.join(carpeta, 'fallidas.json'),
    aplicandoLock: path.join(carpeta, 'aplicando.lock'),
  };
}

// SHA-256 (hex) de un archivo, leído en streaming.
function sha256Archivo(ruta) {
  return new Promise(function(resolve, reject) {
    const hash = crypto.createHash('sha256');
    const s = fs.createReadStream(ruta);
    s.on('error', reject);
    s.on('data', function(d) { hash.update(d); });
    s.on('end', function() { resolve(hash.digest('hex')); });
  });
}

// ¿El archivo existe, pesa lo esperado y su hash coincide? Cualquier error => false.
async function verificarArchivo(ruta, sha256, tamano) {
  try {
    if (fs.statSync(ruta).size !== tamano) return false;
    const real = await sha256Archivo(ruta);
    return real.toLowerCase() === String(sha256).toLowerCase();
  } catch { return false; }
}

// Versiones que fallaron al aplicarse y no deben reintentarse.
function leerFallidas(dirBase) {
  try {
    const lista = JSON.parse(fs.readFileSync(rutas(dirBase).fallidasJson, 'utf8'));
    return Array.isArray(lista) ? lista : [];
  } catch { return []; }
}

function marcarFallida(dirBase, version) {
  const r = rutas(dirBase);
  const lista = leerFallidas(dirBase);
  if (lista.indexOf(version) !== -1) return;
  lista.push(version);
  fs.mkdirSync(r.carpeta, { recursive: true });
  fs.writeFileSync(r.fallidasJson, JSON.stringify(lista), 'utf8');
}

// Datos de la actualización ya descargada y esperando ser aplicada, o null.
function leerPendiente(dirBase) {
  try {
    const p = JSON.parse(fs.readFileSync(rutas(dirBase).pendienteJson, 'utf8'));
    if (p && typeof p.version === 'string' && typeof p.sha256 === 'string' && typeof p.tamano === 'number') {
      return { version: p.version, sha256: p.sha256, tamano: p.tamano };
    }
    return null;
  } catch { return null; }
}

// ¿El PID es un agente vivo? No alcanza con que el PID exista:
// si la PC se apagó de golpe (corte de luz, apagado forzado) el lock queda
// con el PID de ayer, y al prender Windows REUTILIZA esos números — el PID
// viejo suele pertenecer ahora a otro programa (un servicio, el antivirus).
// Antes eso bastaba para que el agente creyera que ya había otro corriendo y
// se cerrara, y la vigía repetía lo mismo cada 2 min todo el día ("ayer
// funcionaba, hoy no"). Por eso se compara también el nombre del ejecutable
// con el propio (agente-impresion.exe en producción, node.exe en dev).
function esAgenteVivo(pid) {
  try {
    const out = execSync('tasklist /FI "PID eq ' + pid + '" /FO CSV /NH', { encoding: 'utf8' });
    return out.split(/\r?\n/).some(function(linea) {
      const campos = linea.split('","').map(function(c) { return c.replace(/^"|"$/g, '').trim(); });
      return campos.length > 1 && campos[1] === String(pid) && esImagenDeAgente(campos[0]);
    });
  } catch { return false; }
}

// ¿Ese nombre de ejecutable es un agente? El propio, agente-impresion.exe, o
// agente-impresion.anterior.exe: start-agent.vbs lanza el anterior si el exe
// falta (corte de luz justo entre los dos renames del reemplazo), y ese agente
// tiene que seguir contando como vivo para el lock (si no, habría dos).
function esImagenDeAgente(nombre) {
  const n = String(nombre).toLowerCase();
  return n === path.basename(process.execPath).toLowerCase() ||
    n === 'agente-impresion.exe' || n === 'agente-impresion.anterior.exe';
}

function borrarSilencioso(ruta) { try { fs.unlinkSync(ruta); } catch {} }

// PID escrito en un archivo de lock, o NaN si no existe o no es un número.
function pidDelLock(lockPath) {
  try { return parseInt(fs.readFileSync(lockPath, 'utf8').trim(), 10); } catch { return NaN; }
}

// ¿Hay un agente vivo dueño de este lock? (PID existe Y es un agente, ver esAgenteVivo)
function agenteVivoSegunLock(lockPath) {
  const pid = pidDelLock(lockPath);
  return !isNaN(pid) && esAgenteVivo(pid);
}

// Borra el lock solo si es de este proceso. Tras un reemplazo exitoso el agente
// viejo termina DESPUÉS de que el nuevo tomó agente.lock: si lo borrara sin
// mirar, la vigía lanzaría un segundo agente (impresiones duplicadas).
function borrarLockSiEsMio(lockPath, pid) {
  try {
    if (fs.readFileSync(lockPath, 'utf8').trim() === String(pid)) fs.unlinkSync(lockPath);
  } catch {}
}

// Lock "estoy aplicando una actualización", para que dos arranques simultáneos
// (tarea de arranque + vigía) no reemplacen el exe a la vez. Mismo esquema que
// agente.lock: flag 'wx' (indivisible) y un lock abandonado solo se retoma si
// su PID ya no es un agente (Windows reutiliza PIDs tras reiniciar).
function tomarLockAplicando(dirBase) {
  const r = rutas(dirBase);
  const escribir = function() { fs.writeFileSync(r.aplicandoLock, String(process.pid), { encoding: 'utf8', flag: 'wx' }); };
  try { fs.mkdirSync(r.carpeta, { recursive: true }); } catch {}
  try { escribir(); return true; } catch (e) { if (e.code !== 'EEXIST') return false; }
  if (agenteVivoSegunLock(r.aplicandoLock)) return false;
  borrarSilencioso(r.aplicandoLock);
  try { escribir(); return true; } catch { return false; }
}

function soltarLockAplicando(dirBase) {
  borrarLockSiEsMio(rutas(dirBase).aplicandoLock, process.pid);
}

function borrarPendiente(r) {
  borrarSilencioso(r.pendienteExe);
  borrarSilencioso(r.pendienteJson);
}

// Chequeo barato (sin hash): el pendiente.json describe una versión mayor a la
// actual y que no falló antes. Si sobra (versión <= actual o ya fallida) se borra.
function pendienteCandidato(dirBase, versionActual) {
  const pend = leerPendiente(dirBase);
  if (!pend) return null;
  if (compararVersiones(pend.version, versionActual) <= 0 || leerFallidas(dirBase).indexOf(pend.version) !== -1) {
    borrarPendiente(rutas(dirBase));
    return null;
  }
  return pend;
}

// Pendiente listo para aplicar: candidato + archivo con el hash/tamaño esperado.
// Uno corrupto o truncado se borra (se volverá a descargar en la próxima revisión).
async function pendienteAplicable(dirBase, versionActual) {
  const pend = pendienteCandidato(dirBase, versionActual);
  if (!pend) return null;
  const r = rutas(dirBase);
  if (!(await verificarArchivo(r.pendienteExe, pend.sha256, pend.tamano))) {
    borrarPendiente(r);
    return null;
  }
  return pend;
}

function esperar(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }

// Copia `origen` a `destino` y fuerza los datos al disco (fsync) antes de
// devolver: un corte de luz justo después no deja una copia a medio escribir.
function copiarConFsync(origen, destino) {
  fs.copyFileSync(origen, destino);
  const fd = fs.openSync(destino, 'r+');
  try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}

// Restauración de agente-impresion.anterior.exe → agente-impresion.exe que
// falló (p. ej. el antivirus tiene tomado el archivo) y sigue reintentándose.
let restauracionActiva = null;

function restauracionPendiente() { return restauracionActiva !== null; }

// Reintenta cada `intervaloMs` (30 s) devolver el exe anterior a su lugar hasta
// lograrlo, para que la PC no vuelva a arrancar con la versión que falló. Cada
// error distinto se loguea una vez, y el éxito también. Devuelve una promesa que
// se cumple al restaurar (o enseguida si no hay anterior que restaurar).
function restaurarEnSegundoPlano(dirBase, opciones) {
  if (restauracionActiva) return restauracionActiva;
  const o = opciones || {};
  const r = rutas(dirBase);
  const log = o.log || function() {};
  const renombrar = o.renombrar || fs.renameSync;
  const intervaloMs = o.intervaloMs != null ? o.intervaloMs : 30000;
  let ultimoError = null;
  let terminar;
  restauracionActiva = new Promise(function(resolve) { terminar = resolve; });
  const promesa = restauracionActiva;
  function fin() { restauracionActiva = null; terminar(); }
  function intento() {
    if (!fs.existsSync(r.anterior)) return fin();
    try {
      renombrar(r.anterior, r.exe);
      log('✓ agente-impresion.exe restaurado a la versión anterior');
      return fin();
    } catch (e) {
      const msg = (e && e.message) || String(e);
      if (msg !== ultimoError) log('✗ No se pudo restaurar agente-impresion.anterior.exe (' + msg + '); se reintenta cada ' + Math.round(intervaloMs / 1000) + ' s');
      ultimoError = msg;
    }
    setTimeout(intento, intervaloMs);
  }
  intento();
  return promesa;
}

// Reemplaza agente-impresion.exe por el pendiente, lanza el nuevo y espera a que
// /salud responda con la versión nueva. Si no lo hace a tiempo: vuelta atrás
// (mata el nuevo, restaura el exe anterior y anota la versión como fallida).
// Quien llama debe haber liberado agente.lock y el puerto 4321 antes.
//
// El exe nunca queda a medio escribir: el pendiente se copia primero a
// agente-impresion.nuevo.exe (misma carpeta), se fuerza al disco y se vuelve a
// verificar su hash; recién entonces se hacen dos renames (exe → anterior,
// nuevo → exe). Un corte de luz en ese instante deja, a lo sumo, el exe
// ausente con el anterior al lado (start-agent.vbs lanza entonces el anterior).
async function reemplazarYLanzar(opts) {
  const dirBase = opts.dirBase, versionNueva = opts.versionNueva;
  const timeoutMs = opts.timeoutMs != null ? opts.timeoutMs : 60000;
  const intervaloMs = opts.intervaloMs != null ? opts.intervaloMs : 2000;
  const esperaRestaurarMs = opts.esperaRestaurarMs != null ? opts.esperaRestaurarMs : 250;
  const renombrar = opts.renombrar || fs.renameSync;
  const log = opts.log || function() {};
  const r = rutas(dirBase);

  // Mientras no se haya podido devolver el exe anterior a su lugar, no se toca nada más.
  if (restauracionPendiente()) return { ok: false, error: 'hay una restauración del exe anterior en curso' };

  // 1. Copia preparada junto al exe, ya en disco y verificada. Hasta acá el exe
  //    actual no se tocó: cualquier fallo deja todo como estaba y no marca la
  //    versión como fallida (se reintenta al próximo arranque).
  borrarSilencioso(r.nuevo);
  try {
    copiarConFsync(r.pendienteExe, r.nuevo);
  } catch (e) {
    borrarSilencioso(r.nuevo);
    return { ok: false, error: 'no se pudo copiar el pendiente: ' + e.message };
  }
  const pend = leerPendiente(dirBase);
  if (!pend || pend.version !== versionNueva || !(await verificarArchivo(r.nuevo, pend.sha256, pend.tamano))) {
    borrarSilencioso(r.nuevo);
    return { ok: false, error: 'la copia preparada no coincide con el hash/tamaño esperado' };
  }

  // 2. Windows deja renombrar un exe en uso, pero no sobrescribirlo.
  try {
    borrarSilencioso(r.anterior);
    renombrar(r.exe, r.anterior);
  } catch (e) {
    borrarSilencioso(r.nuevo);
    return { ok: false, error: 'no se pudo apartar el exe actual: ' + e.message };
  }

  // Devuelve el exe anterior a su lugar. El nuevo recién matado puede tardar un
  // instante en soltar el archivo: se reintenta unos segundos; si aun así no se
  // puede, se sigue intentando en segundo plano cada 30 s.
  let restauracion = null;
  async function restaurar() {
    for (let i = 0; i < 40; i++) {
      try { renombrar(r.anterior, r.exe); return true; } catch {}
      await esperar(esperaRestaurarMs);
    }
    restauracion = restaurarEnSegundoPlano(dirBase, { log: log, renombrar: renombrar, intervaloMs: opts.intervaloRestauracionMs });
    return false;
  }

  try { renombrar(r.nuevo, r.exe); } catch (e) {
    const restaurado = await restaurar();
    borrarSilencioso(r.nuevo);
    return { ok: false, restauracion: restauracion,
      error: 'no se pudo poner la versión nueva en su lugar: ' + e.message + (restaurado ? '' : ' (¡no se pudo restaurar el exe anterior!)') };
  }

  let error = null;
  try {
    opts.lanzar(r.exe);
  } catch (e) { error = 'no se pudo lanzar la versión nueva: ' + e.message; }

  if (!error) {
    const limite = Date.now() + timeoutMs;
    let ultima = null;
    for (;;) {
      try { ultima = await opts.consultarSalud(); } catch { ultima = null; }
      if (ultima === versionNueva) {
        borrarPendiente(r);
        log('✓ Actualización ' + versionNueva + ' aplicada');
        return { ok: true };
      }
      if (Date.now() >= limite) break;
      await esperar(intervaloMs);
    }
    error = 'la versión ' + versionNueva + ' no respondió en ' + Math.round(timeoutMs / 1000) + ' s' +
      (ultima ? ' (respondió ' + ultima + ')' : '');
  }

  // Vuelta atrás.
  try { await opts.matarNuevo(); } catch {}
  const restaurado = await restaurar();
  marcarFallida(dirBase, versionNueva);
  borrarPendiente(r);
  if (!restaurado) error += ' — ¡no se pudo restaurar agente-impresion.anterior.exe! (se reintenta en segundo plano)';
  log('✗ Actualización ' + versionNueva + ' falló (' + error + '); se vuelve a la versión anterior y no se reintentará');
  return { ok: false, error: error, restauracion: restauracion };
}

// Al arrancar el agente (antes de tomar agente.lock y abrir el puerto): si la PC
// recién prendió y hay un pendiente verificado de una versión mayor, lo aplica.
async function alArrancar(opts) {
  const dirBase = opts.dirBase, versionActual = opts.versionActual;
  if (opts.agenteVivo()) return 'sin_cambios';
  if (!esArranqueDePC(opts.uptimeSeg)) return 'sin_cambios';
  // Antes del lock: el agente nuevo, lanzado por quien aplica (que tiene el
  // lock tomado mientras espera su /salud), debe seguir de largo y atender.
  if (!pendienteCandidato(dirBase, versionActual)) return 'sin_cambios';
  if (!tomarLockAplicando(dirBase)) return 'otro_aplicando';
  try {
    // Re-chequeo con el lock en mano: otro arranque pudo terminar de aplicar
    // justo antes (agente nuevo ya vivo, pendiente ya consumido).
    if (opts.agenteVivo()) return 'sin_cambios';
    const pend = await pendienteAplicable(dirBase, versionActual);
    if (!pend) return 'sin_cambios';
    (opts.log || function() {})('Aplicando actualización ' + versionActual + ' → ' + pend.version + '...');
    const res = await reemplazarYLanzar(Object.assign({}, opts, { versionNueva: pend.version }));
    return res.ok ? 'aplicado' : 'sin_cambios';
  } finally {
    soltarLockAplicando(dirBase);
  }
}

// Dependencias reales de reemplazarYLanzar (lanzar el exe nuevo, consultar su
// /salud, matarlo). Compartidas por index.js (arranque) y agent.js (hibernación).
function lanzadorReal(opciones) {
  const o = opciones || {};
  const { spawn } = require('child_process');
  const http = require('http');
  const puerto = o.puerto || 4321;
  let hijo = null;
  return {
    lanzar: function(rutaExe) {
      // pkg parchea spawn y SIEMPRE agrega PKG_EXECPATH=<exe propio> al entorno
      // del hijo. Como el exe nuevo vive en la MISMA ruta que el viejo, el hijo
      // creería que lo invocaron "como node" y tomaría '--service' como el
      // script a ejecutar. Este Proxy ignora esa asignación y el hijo arranca
      // como un agente normal.
      const base = Object.assign({}, process.env);
      delete base.PKG_EXECPATH;
      const env = new Proxy(base, {
        set: function(t, k, v) { if (k !== 'PKG_EXECPATH') t[k] = v; return true; },
      });
      hijo = spawn(rutaExe, ['--service'], {
        cwd: path.dirname(rutaExe), env: env, detached: true, stdio: 'ignore', windowsHide: true,
      });
      hijo.on('error', function() {}); // un fallo al lanzar se ve como "/salud no responde"
      hijo.unref();
    },
    consultarSalud: function() {
      return new Promise(function(resolve) {
        const req = http.get({ host: '127.0.0.1', port: puerto, path: '/salud', timeout: 2000 }, function(res) {
          let cuerpo = '';
          res.setEncoding('utf8');
          res.on('data', function(d) { cuerpo += d; });
          res.on('end', function() {
            try { const j = JSON.parse(cuerpo); resolve(typeof j.version === 'string' ? j.version : null); }
            catch { resolve(null); }
          });
          res.on('error', function() { resolve(null); });
        });
        req.on('timeout', function() { req.destroy(); resolve(null); });
        req.on('error', function() { resolve(null); });
      });
    },
    matarNuevo: function() {
      if (hijo && hijo.pid) { try { process.kill(hijo.pid); } catch {} }
    },
  };
}

// Descarga `url` a `destino` en streaming. Sin tope total: solo corta si pasan
// `inactividadMs` sin recibir datos.
async function descargarAArchivo(fetchImpl, url, destino, inactividadMs) {
  const ctrl = new AbortController();
  let timer = setTimeout(function() { ctrl.abort(); }, inactividadMs);
  const reiniciar = function() { clearTimeout(timer); timer = setTimeout(function() { ctrl.abort(); }, inactividadMs); };
  try {
    const res = await fetchImpl(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    if (!res.body) throw new Error('respuesta sin cuerpo');
    const salida = fs.createWriteStream(destino);
    // El 'error' se escucha desde el inicio: un fallo de escritura (disco lleno,
    // archivo bloqueado) no debe quedar sin manejar ni dejar la espera colgada.
    let falloEscritura = null;
    let avisarFallo;
    const fallo = new Promise(function(_, reject) { avisarFallo = reject; });
    fallo.catch(function() {});
    salida.on('error', function(e) { falloEscritura = e; avisarFallo(e); });
    const lector = res.body.getReader();
    try {
      for (;;) {
        if (falloEscritura) throw falloEscritura;
        const { done, value } = await Promise.race([lector.read(), fallo]);
        if (done) break;
        reiniciar();
        if (!salida.write(value)) {
          await Promise.race([new Promise(function(r) { salida.once('drain', r); }), fallo]);
        }
      }
      if (falloEscritura) throw falloEscritura;
      await Promise.race([new Promise(function(resolve) { salida.end(resolve); }), fallo]);
    } catch (e) {
      salida.destroy();
      lector.cancel().catch(function() {});
      throw e;
    }
  } finally { clearTimeout(timer); }
}

// Consulta al servidor si hay una versión más nueva y, de haberla, la deja
// descargada y verificada como pendiente. NUNCA reemplaza el exe en uso.
async function revisarYDescargar(opts) {
  const servidor = opts.servidor, dirBase = opts.dirBase, versionActual = opts.versionActual;
  const log = opts.log || function() {};
  const fetchImpl = opts.fetchImpl || fetch;
  if (!urlPermitida(servidor)) return { estado: 'sin_https' };
  const r = rutas(dirBase);
  const base = String(servidor).replace(/\/+$/, '');
  try {
    // Un pendiente que ya no sirve (versión <= la actual) se descarta.
    let pend = leerPendiente(dirBase);
    if (pend && compararVersiones(pend.version, versionActual) <= 0) {
      borrarSilencioso(r.pendienteExe);
      borrarSilencioso(r.pendienteJson);
      pend = null;
    }

    const ctrl = new AbortController();
    const t = setTimeout(function() { ctrl.abort(); }, 10000);
    let info;
    try {
      const res = await fetchImpl(base + '/api/v1/agente/version', { signal: ctrl.signal });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      info = await res.json();
    } finally { clearTimeout(t); }
    if (!info || typeof info.version !== 'string' || typeof info.sha256 !== 'string' || typeof info.tamano !== 'number') {
      throw new Error('respuesta de versión inválida');
    }

    if (compararVersiones(info.version, versionActual) <= 0) return { estado: 'al_dia', version: info.version };
    if (leerFallidas(dirBase).indexOf(info.version) !== -1) return { estado: 'fallida', version: info.version };

    if (pend && pend.version === info.version && await verificarArchivo(r.pendienteExe, pend.sha256, pend.tamano)) {
      return { estado: 'ya_pendiente', version: info.version };
    }

    log('Descargando actualización ' + info.version + '...');
    fs.mkdirSync(r.carpeta, { recursive: true });
    const tmp = r.pendienteExe + '.tmp';
    borrarSilencioso(tmp);
    try {
      await descargarAArchivo(fetchImpl, base + '/api/v1/agente/descargar', tmp, 30000);
      if (!(await verificarArchivo(tmp, info.sha256, info.tamano))) throw new Error('la descarga no coincide con el hash/tamaño esperado');
      borrarSilencioso(r.pendienteJson);
      fs.renameSync(tmp, r.pendienteExe);
      fs.writeFileSync(r.pendienteJson, JSON.stringify({ version: info.version, sha256: info.sha256, tamano: info.tamano }), 'utf8');
    } catch (e) {
      borrarSilencioso(tmp);
      throw e;
    }
    log('Actualización ' + info.version + ' descargada; se aplicará al prender la PC');
    return { estado: 'descargado', version: info.version };
  } catch (e) {
    const causa = (e && e.cause && e.cause.code) ? ' (' + e.cause.code + ')' : '';
    return { estado: 'error', error: ((e && e.message) || String(e)) + causa };
  }
}

module.exports = {
  compararVersiones, esArranqueDePC, esVueltaDeHibernacion, urlPermitida,
  rutas, sha256Archivo, verificarArchivo, leerFallidas, marcarFallida,
  leerPendiente, esAgenteVivo, esImagenDeAgente, revisarYDescargar,
  pidDelLock, agenteVivoSegunLock, borrarLockSiEsMio, tomarLockAplicando, soltarLockAplicando,
  pendienteCandidato, pendienteAplicable, reemplazarYLanzar, alArrancar, lanzadorReal,
  restaurarEnSegundoPlano, restauracionPendiente,
};
