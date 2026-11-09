const { io }                    = require('socket.io-client');
const { execFileSync, execSync, execFile } = require('child_process');
const { writeFileSync, unlinkSync, readFileSync, existsSync, appendFileSync, statSync } = require('fs');
const path             = require('path');
const os               = require('os');
const http             = require('http');
const act              = require('./actualizacion');
const VERSION          = require('./package.json').version;

// En producción (pkg) lee config junto al .exe; en dev, junto al script
const CONFIG_DIR = process.pkg
  ? path.dirname(process.execPath)
  : path.join(path.dirname(process.argv[1]));

// ── Log a archivo ─────────────────────────────────────────────────────────────
// El agente corre oculto (sin ventana), así que console.log no lo ve nadie.
// Todo lo que se loguea también queda en agente.log, para poder revisar
// después qué pasó con cada impresión (y por cuál canal — local o socket).
const LOG_FILE      = path.join(CONFIG_DIR, 'agente.log');
const LOG_MAX_BYTES = 5 * 1024 * 1024;

function logAArchivo(linea) {
  try {
    if (existsSync(LOG_FILE) && statSync(LOG_FILE).size > LOG_MAX_BYTES) {
      writeFileSync(LOG_FILE, ''); // evita que crezca sin límite
    }
    appendFileSync(LOG_FILE, linea + '\n');
  } catch {}
}

const _consoleLog   = console.log.bind(console);
const _consoleError = console.error.bind(console);
console.log = (...args) => { _consoleLog(...args); logAArchivo(args.join(' ')); };
console.error = (...args) => { _consoleError(...args); logAArchivo('ERROR: ' + args.join(' ')); };

// Sin esto, una excepción no capturada mata el proceso en silencio: Node la
// imprime por stderr (que nadie ve, porque el agente corre oculto) y agente.log
// se queda sin ninguna pista de qué pasó — solo se ve que el siguiente arranque
// aparece 5 minutos después, cuando la tarea vigía lo relanza.
process.on('uncaughtException', function(err) {
  console.error('EXCEPCIÓN NO CAPTURADA — el agente se va a cerrar:', err && err.stack ? err.stack : err);
  process.exit(1);
});
process.on('unhandledRejection', function(reason) {
  console.error('PROMESA RECHAZADA SIN MANEJAR — el agente se va a cerrar:', reason && reason.stack ? reason.stack : reason);
  process.exit(1);
});

// ── Instancia única: evita que corran dos agentes al mismo tiempo ─────────────
// La tarea de arranque (BootTrigger) y la tarea vigía (cada 2 min) son tareas
// programadas DISTINTAS: Windows solo garantiza "una instancia a la vez" DENTRO
// de cada tarea, no ENTRE tareas. Si las dos se disparan casi al mismo tiempo
// (típico justo después de reiniciar la PC), un chequeo "existe el lock? -> no
// -> lo escribo" deja un hueco entre el chequeo y la escritura donde las dos
// pueden colarse creyendo que están solas — y quedan dos agentes vivos,
// duplicando cada impresión. Por eso el lock se toma con flag 'wx': crear el
// archivo falla si ya existe, en un único paso que el sistema operativo
// garantiza indivisible, así solo uno de los dos puede ganar la carrera.
const LOCK_FILE = path.join(CONFIG_DIR, 'agente.lock');

function tomarLock() {
  try {
    writeFileSync(LOCK_FILE, String(process.pid), { encoding: 'utf8', flag: 'wx' });
    return true;
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
    // El archivo ya existe. Puede ser un lock vigente (hay que retirarse) o uno
    // abandonado por un proceso que murió sin limpiar (crash, corte de luz) —
    // en ese caso el PID ya no corresponde a nadie y es seguro tomar el lock.
    if (act.agenteVivoSegunLock(LOCK_FILE)) return false;
    const pidViejo = act.pidDelLock(LOCK_FILE);
    console.log('.. Lock abandonado (PID ' + (isNaN(pidViejo) ? '?' : pidViejo) + ' ya no es un agente) — se toma de nuevo');
    try { unlinkSync(LOCK_FILE); } catch {}
    try {
      writeFileSync(LOCK_FILE, String(process.pid), { encoding: 'utf8', flag: 'wx' });
      return true;
    } catch { return false; }
  }
}

if (!tomarLock()) {
  // No es un error: la tarea vigía dispara este intento cada 2 min como red de
  // seguridad. Si ya hay uno corriendo, es lo esperado — este simplemente se
  // retira sin duplicar la impresión.
  console.log('.. Vigía: ya hay un agente activo, no hace falta relanzar.');
  process.exit(0);
}

// Solo se borra el lock si sigue siendo de este proceso: tras aplicar una
// actualización, el agente viejo termina cuando el nuevo ya tomó el suyo.
process.on('exit',    function() { act.borrarLockSiEsMio(LOCK_FILE, process.pid); });
process.on('SIGINT',  function() { process.exit(0); });
process.on('SIGTERM', function() { process.exit(0); });

// ─────────────────────────────────────────────────────────────────────────────

let config;
try {
  config = JSON.parse(readFileSync(path.join(CONFIG_DIR, 'config.json'), 'utf8'));
} catch {
  console.error('ERROR: No se encontró config.json en', CONFIG_DIR);
  console.error('Corre el instalador primero (sin --service).');
  process.exit(1);
}

console.log('=== Agente de impresión térmica v' + VERSION + ' ===');
console.log(`Servidor : ${config.servidor}`);
console.log(`Caja     : ${config.impresora_caja}`);
console.log(`Cocina   : ${config.impresora_cocina}`);
console.log('===================================');

// ── Deduplicación ────────────────────────────────────────────────────────────
// El mismo ticket puede llegar por dos canales (socket.io remoto y HTTP local
// desde el navegador de esta misma PC). Se imprime una sola vez por
// tipo+pedido, dentro de una ventana de unos minutos.
const IMPRESOS_TTL_MS = 5 * 60 * 1000;
const impresos = new Map(); // clave "tipo:pedidoId" -> timestamp

function limpiarVencidos() {
  const ahora = Date.now();
  for (const [k, t] of impresos) {
    if (ahora - t > IMPRESOS_TTL_MS) impresos.delete(k);
  }
}

function yaImpreso(tipo, pedidoId) {
  limpiarVencidos();
  return impresos.has(tipo + ':' + pedidoId);
}

// Reserva el slot ANTES de imprimir (síncrono, sin await de por medio) para
// que si el canal socket y el canal local llegan casi al mismo tiempo, el
// segundo vea la reserva del primero y no dispare una impresión física
// duplicada. Si falla, se libera para permitir reintentar.
function reservar(tipo, pedidoId) {
  impresos.set(tipo + ':' + pedidoId, Date.now());
}

function liberar(tipo, pedidoId) {
  impresos.delete(tipo + ':' + pedidoId);
}

// Impresiones físicas en curso: antes de reemplazar el exe (vuelta de
// hibernación con actualización pendiente) se espera a que no quede ninguna.
let impresionesEnCurso = 0;

async function imprimirContando(impresora, buffer) {
  impresionesEnCurso++;
  try { return await printRaw(impresora, buffer); }
  finally { impresionesEnCurso--; }
}

async function imprimirCaja(datos, origen, forzar) {
  var pid = datos.pedido ? datos.pedido.id : '?';
  var motivo = motivoNoPertenece(datos);
  if (motivo) {
    console.log('[' + ts() + '] .. print:caja Pedido #' + pid + ' es de ' + motivo + ' (' + origen + ', omitido)');
    return;
  }
  if (!forzar && yaImpreso('caja', pid)) {
    console.log('[' + ts() + '] .. print:caja Pedido #' + pid + ' ya impreso (' + origen + ', omitido)');
    return;
  }
  reservar('caja', pid);
  console.log('[' + ts() + '] >> print:caja  Pedido #' + pid + ' (' + origen + (forzar ? ', forzado' : '') + ')');
  try {
    await imprimirContando(config.impresora_caja, buildCaja(datos, COLS_CAJA));
    console.log('[' + ts() + '] OK Caja impreso');
  } catch (err) {
    liberar('caja', pid);
    throw err;
  }
}

async function imprimirCocina(datos, origen, forzar) {
  var pid = datos.pedido ? datos.pedido.id : '?';
  // Un aviso "ANULAR" comparte el id del pedido con su comanda original: se
  // deduplica por la devolución (clave "cocina-anul:<devolucion_id>") para que
  // no se descarte como si fuera la comanda repetida.
  var esAnulacion = !!datos.anulacion;
  var tipoDedup = esAnulacion ? 'cocina-anul' : 'cocina';
  var claveDedup = esAnulacion ? datos.anulacion.devolucion_id : pid;
  var etiqueta = esAnulacion ? 'Anulación #' + claveDedup + ' del pedido #' + pid : 'Pedido #' + pid;
  var motivo = motivoNoPertenece(datos);
  if (motivo) {
    console.log('[' + ts() + '] .. print:cocina ' + etiqueta + ' es de ' + motivo + ' (' + origen + ', omitido)');
    return;
  }
  if (!forzar && yaImpreso(tipoDedup, claveDedup)) {
    console.log('[' + ts() + '] .. print:cocina ' + etiqueta + ' ya impreso (' + origen + ', omitido)');
    return;
  }
  reservar(tipoDedup, claveDedup);
  console.log('[' + ts() + '] >> print:cocina ' + etiqueta + ' (' + origen + (forzar ? ', forzado' : '') + ')');
  try {
    await imprimirContando(config.impresora_cocina, buildCocina(datos, COLS_COCINA));
    console.log('[' + ts() + '] OK Cocina impreso');
  } catch (err) {
    liberar(tipoDedup, claveDedup);
    throw err;
  }
}

// El cierre de caja no tiene canal socket (es una acción manual del cajero en
// esta misma PC, a diferencia de venta/cocina que también pueden llegar como
// respaldo desde otra caja) — no necesita deduplicación por pedido tampoco,
// cada cierre es un evento único.
async function imprimirCierre(datos, origen) {
  console.log('[' + ts() + '] >> print:cierre Sesión #' + (datos.reporte && datos.reporte.sesion ? datos.reporte.sesion.id : '?') + ' (' + origen + ')');
  await imprimirContando(config.impresora_caja, buildCierre(datos, COLS_CAJA));
  console.log('[' + ts() + '] OK Cierre impreso');
}

// ── Canal 1: socket.io remoto (respaldo — funciona aunque esta PC no sea la que vendió) ──

const socket = io(config.servidor, {
  // Clave del agente (AGENTE_IMPRESION_CLAVE del servidor). Sin clave el
  // servidor solo lo acepta si no tiene una configurada.
  auth: config.clave_agente ? { clave_agente: config.clave_agente } : {},
  reconnection: true,
  reconnectionDelay: 1500,
  reconnectionAttempts: Infinity,
});

// Compatibilidad con instalaciones previas a la selección múltiple de cajas,
// que guardaban un único `caja_id` en vez de `caja_ids`.
const cajaIds = config.caja_ids || (config.caja_id ? [config.caja_id] : []);

// Filtro central para imprimirCaja/imprimirCocina — evita que un ticket de
// OTRA caja (o de otra sucursal) se imprima acá. Antes solo el canal
// socket.io filtraba (por las salas de socket.js); el canal local (el
// navegador de esta misma PC pegándole directo a http://127.0.0.1) no
// filtraba nada, así que si dos cajas — o dos sucursales distintas, ej. un
// admin que atiende varias sucursales desde una PC que también tiene el
// agente instalado para UNA de ellas — comparten la misma PC para vender, el
// ticket ajeno igual se imprimía acá. `sucursal_id` sale de `datos.pedido`
// (ya viaja ahí, es un atributo propio del pedido — no hace falta agregarlo
// aparte al payload). `caja_id` null en el payload significa "cocina
// compartida, cualquier agente de la sucursal debe imprimirlo" (ver
// _emitirImpresion en ventas.service.js); `cajaIds` vacío significa una
// instalación vieja sin caja asignada. En ambos casos no se filtra por caja,
// para no romper comportamiento existente — pero la sucursal SIEMPRE se
// valida si el agente tiene una configurada.
// Devuelve null si el ticket es para este agente, o un motivo corto (para
// loguear) si hay que omitirlo.
function motivoNoPertenece(datos) {
  var sucursalPedido = datos.pedido ? datos.pedido.sucursal_id : null;
  if (config.sucursal_id && sucursalPedido && sucursalPedido !== config.sucursal_id) {
    return 'otra sucursal (' + sucursalPedido + ', esta PC es de la ' + config.sucursal_id + ')';
  }
  var caja_id = datos.caja_id;
  if (caja_id && cajaIds.length && cajaIds.indexOf(caja_id) === -1) {
    return 'otra caja (' + caja_id + ', esta PC atiende ' + cajaIds.join(',') + ')';
  }
  return null;
}

// Datos que el dashboard muestra de este agente. version_pendiente solo si lo
// descargado es realmente más nuevo que lo que corre.
function anunciarAgente() {
  var pend = act.leerPendiente(CONFIG_DIR);
  socket.emit('agente:conectado', {
    sucursal_id: config.sucursal_id || null,
    caja_ids: cajaIds,
    version: VERSION,
    version_pendiente: pend && act.compararVersiones(pend.version, VERSION) > 0 ? pend.version : null,
    autoactualizacion: act.urlPermitida(config.servidor),
  });
}

socket.on('connect', () => {
  console.log(`[${ts()}] ✓ Conectado (id: ${socket.id})`);
  anunciarAgente();
  if (config.sucursal_id) {
    socket.emit('unirse_sucursal', config.sucursal_id);
    console.log(`[${ts()}] → Unido a la sala de la sucursal ${config.sucursal_id} (comandas de cocina)`);
  } else {
    console.log(`[${ts()}] ⚠ config.json no tiene sucursal_id — este agente NO recibirá ningún evento de impresión hasta que se configure`);
  }
  // Sala por caja: si hay varias cajas en la misma sucursal, cada una tiene
  // su propia impresora — sin caja_ids, print:caja llegaría por igual a
  // todas las cajas de la sucursal (ver socket.js del backend). Una PC puede
  // unirse a más de una sala si atiende varios puntos de cobro.
  if (cajaIds.length) {
    cajaIds.forEach(function(id) { socket.emit('unirse_caja', id); });
    console.log(`[${ts()}] → Unido a la(s) sala(s) de caja ${cajaIds.join(', ')} (tickets de venta)`);
  } else {
    console.log(`[${ts()}] ⚠ config.json no tiene caja_ids — el ticket de venta por socket (respaldo) solo llegará si esta es la única caja de la sucursal`);
  }
});
socket.on('disconnect',    () => console.log(`[${ts()}] ✗ Desconectado — reintentando...`));
socket.on('connect_error', (e) => console.log(`[${ts()}] ✗ Error: ${e.message}`));

socket.on('print:caja', async function(datos) {
  try { await imprimirCaja(datos, 'socket'); }
  catch (err) { console.error('[' + ts() + '] ERROR caja (socket): ' + err.message); }
});

socket.on('print:cocina', async function(datos) {
  try { await imprimirCocina(datos, 'socket'); }
  catch (err) { console.error('[' + ts() + '] ERROR cocina (socket): ' + err.message); }
});

// Reconexión forzada pedida desde el dashboard (POST /reconectar, abajo):
// corta el socket y lo vuelve a abrir en vez de esperar al próximo reintento
// automático, por si quedó trabado. Resuelve con el resultado del primer
// intento (o con timeout), para que el dashboard pueda mostrarlo.
const TIMEOUT_RECONEXION_MS = 8000;

// Si ya hay una reconexión en curso (p. ej. la vigía justo disparó y alguien
// aprieta el botón del dashboard), se devuelve la misma promesa en vez de
// cortar el socket por segunda vez a mitad del intento.
let reconexionEnCurso = null;

function reconectarSocket(motivo) {
  if (reconexionEnCurso) return reconexionEnCurso;
  reconexionEnCurso = new Promise(function(resolve) {
    var terminado = false;
    function fin(resultado) {
      if (terminado) return;
      terminado = true;
      clearTimeout(timer);
      socket.off('connect', alConectar);
      socket.off('connect_error', alFallar);
      reconexionEnCurso = null;
      resolve(resultado);
    }
    function alConectar() { fin({ conectado: true }); }
    function alFallar(e) { fin({ conectado: false, error: e.message }); }
    var timer = setTimeout(function() {
      fin({ conectado: false, error: 'el servidor no respondió en ' + (TIMEOUT_RECONEXION_MS / 1000) + ' s' });
    }, TIMEOUT_RECONEXION_MS);
    socket.on('connect', alConectar);
    socket.on('connect_error', alFallar);
    console.log('[' + ts() + '] ↻ Reconexión forzada (' + motivo + ')');
    socket.disconnect();
    socket.connect();
  });
  return reconexionEnCurso;
}

// ── Vigía de conexión ─────────────────────────────────────────────────────────
// socket.io ya reintenta solo, pero hay casos donde el reintento se traba:
// típicamente una laptop/PC que despierta de suspensión con la conexión
// "muerta" o con el backoff de reintentos colgado. Cada 30 s se revisa:
// - si lleva más de 2 min sin conexión → se fuerza la reconexión (lo mismo
//   que el botón del dashboard), y se vuelve a intentar cada 2 min;
// - si entre una revisión y otra pasó mucho más tiempo del esperado, la PC
//   estuvo suspendida → se fuerza la reconexión de inmediato, sin esperar.
// Además, una vez por hora se deja una línea "♥ activo" en el log: si un
// cliente dice que no imprimió, el log muestra desde qué hora el agente dejó
// de estar vivo (no hay ♥) o de estar conectado (♥ con "conectado: no").
const VIGIA_INTERVALO_MS      = 30 * 1000;
const VIGIA_SIN_CONEXION_MS   = 2 * 60 * 1000;
const VIGIA_SALTO_SUSPENSION  = 90 * 1000;   // un tick de 30 s que tardó >90 s
const LATIDO_INTERVALO_MS     = 60 * 60 * 1000;

const agenteIniciadoEn = Date.now();
let sinConexionDesde = Date.now(); // arranca sin conexión hasta el primer connect
let ultimoTick = Date.now();
let ultimoUptimeSeg = os.uptime(); // incluye el tiempo dormida/hibernada (ver esVueltaDeHibernacion)
let ultimoLatido = Date.now();

socket.on('connect', function() { sinConexionDesde = null; });
socket.on('disconnect', function() { if (sinConexionDesde == null) sinConexionDesde = Date.now(); });

function minutos(ms) { return Math.round(ms / 60000); }

function reconectarTrasSuspension() {
  reconectarSocket('vigía: la PC volvió de suspensión').then(function(r) {
    console.log('[' + ts() + '] ' + (r.conectado ? '✓ Reconectado tras suspensión' : '✗ Sin conexión tras suspensión: ' + r.error));
  });
}

setInterval(function() {
  const ahora = Date.now();
  const desdeUltimoTick = ahora - ultimoTick;
  ultimoTick = ahora;
  const uptimeSeg = os.uptime();
  const avanceUptimeMs = (uptimeSeg - ultimoUptimeSeg) * 1000;
  ultimoUptimeSeg = uptimeSeg;

  // Mientras se reemplaza el exe, el socket y el puerto están cerrados a
  // propósito: la vigía no debe reabrirlos.
  if (aplicandoActualizacion) return;

  if (desdeUltimoTick > VIGIA_SALTO_SUSPENSION) {
    console.log('[' + ts() + '] ↯ La PC estuvo suspendida ~' + minutos(desdeUltimoTick) + ' min');
    // Volver de hibernación >= 2 h cuenta como "prender la PC" (Inicio rápido de
    // Windows: "Apagar" hiberna y la tarea de arranque no se dispara). Solo en el
    // exe (en dev no hay nada que reemplazar) y solo con un pendiente de una
    // versión mayor; el hash se verifica en aplicarTrasHibernacion. Un salto
    // solo del reloj (cambio de hora, NTP) no cuenta: el uptime no avanzó.
    // Tampoco mientras se sigue restaurando el exe anterior de un fallo previo.
    const candidato = (process.pkg && act.esVueltaDeHibernacion(desdeUltimoTick, avanceUptimeMs) && !act.restauracionPendiente())
      ? act.pendienteCandidato(CONFIG_DIR, VERSION) : null;
    if (candidato) aplicarTrasHibernacion();
    else reconectarTrasSuspension();
    sinConexionDesde = socket.connected ? null : ahora;
  } else if (!socket.connected && sinConexionDesde != null && ahora - sinConexionDesde > VIGIA_SIN_CONEXION_MS) {
    reconectarSocket('vigía: sin conexión hace ' + minutos(ahora - sinConexionDesde) + ' min').then(function(r) {
      if (r.conectado) console.log('[' + ts() + '] ✓ Reconectado por la vigía');
      else console.log('[' + ts() + '] ✗ La vigía no logró reconectar: ' + r.error);
    });
    sinConexionDesde = ahora; // próximo intento forzado en otros 2 min
  }

  if (ahora - ultimoLatido >= LATIDO_INTERVALO_MS) {
    ultimoLatido = ahora;
    console.log('[' + ts() + '] ♥ activo — conectado: ' + (socket.connected ? 'sí' : 'no') +
      ' (PID ' + process.pid + ', encendido hace ' + Math.floor((ahora - agenteIniciadoEn) / 3600000) + ' h)');
  }
}, VIGIA_INTERVALO_MS);

// ── Auto-actualización ───────────────────────────────────────────────────────
// Revisa ~60 s después de arrancar y luego cada 6 h si el servidor publica una
// versión más nueva; si la hay, la deja descargada y verificada como pendiente.
// Si la revisión o la descarga fallan (típico justo al prender la PC, con la
// red todavía inestable), reintenta a los 15 min en vez de esperar 6 h.
// Nunca reemplaza el exe aquí: eso solo pasa al prender la PC (index.js) o al
// volver de hibernación (vigía).
const REVISION_PRIMERA_MS     = 60 * 1000;
const REVISION_INTERVALO_MS   = 6 * 3600 * 1000;
const REVISION_REINTENTO_MS   = 15 * 60 * 1000;

let aplicandoActualizacion = false;
let revisionEnCurso = null;
let ultimoEstadoRevision = null;
let ultimoErrorRevision = null;

// Cada revisión agenda la siguiente: 15 min si falló, 6 h si no.
function agendarRevision(ms) {
  setTimeout(revisarActualizacion, ms);
}

function revisarActualizacion() {
  // Ya hay una revisión en curso: ella misma agenda la siguiente (no se
  // duplica el ciclo).
  if (revisionEnCurso) return;
  if (aplicandoActualizacion) {
    agendarRevision(REVISION_REINTENTO_MS);
    return;
  }
  let siguiente = REVISION_INTERVALO_MS;
  revisionEnCurso = act.revisarYDescargar({
    servidor: config.servidor, dirBase: CONFIG_DIR, versionActual: VERSION,
    log: function(m) { console.log('[' + ts() + '] ' + m); },
  }).then(function(r) {
    // Solo se loguean los cambios: un servidor caído no llena el log cada 15 min.
    if (r.estado === 'error') {
      siguiente = REVISION_REINTENTO_MS;
      if (r.error !== ultimoErrorRevision) console.log('[' + ts() + '] ✗ No se pudo revisar si hay actualización: ' + r.error + ' — se reintenta cada 15 min');
      ultimoErrorRevision = r.error;
    } else {
      ultimoErrorRevision = null;
      if (r.estado === 'sin_https' && ultimoEstadoRevision !== 'sin_https') {
        console.log('[' + ts() + '] .. Auto-actualización desactivada: el servidor no usa https (' + config.servidor + ')');
      }
    }
    ultimoEstadoRevision = r.estado;
    if (r.estado === 'descargado' && socket.connected) anunciarAgente();
  }).catch(function(e) {
    siguiente = REVISION_REINTENTO_MS;
    console.error('[' + ts() + '] ✗ Revisión de actualización: ' + (e && e.message ? e.message : e));
  }).finally(function() {
    revisionEnCurso = null;
    agendarRevision(siguiente);
  });
}

agendarRevision(REVISION_PRIMERA_MS);

function cerrarServidorLocal() {
  return new Promise(function(resolve) {
    if (!servidorLocal.listening) return resolve();
    // close() suelta el puerto en el acto; su callback espera a que terminen las
    // conexiones abiertas (keep-alive del navegador), por eso el tope de 5 s.
    servidorLocal.close(function() { resolve(); });
    if (servidorLocal.closeIdleConnections) servidorLocal.closeIdleConnections();
    setTimeout(resolve, 5000);
  });
}

async function esperarSinImpresiones() {
  const limite = Date.now() + 2 * 60 * 1000;
  while (impresionesEnCurso > 0 && Date.now() < limite) {
    await new Promise(function(r) { setTimeout(r, 200); });
  }
}

// Vuelve a ser el agente normal (tras una vuelta atrás o un error a mitad).
function reanudarComoAgente() {
  if (!tomarLock()) {
    if (act.restauracionPendiente()) {
      // Sin puerto ni socket (no atiende), solo termina de devolver el exe
      // anterior a su lugar para que la PC no arranque con la versión fallida.
      console.log('[' + ts() + '] .. Otro agente tomó el lock mientras se actualizaba — este solo termina de restaurar el exe anterior y se retira.');
      act.restaurarEnSegundoPlano(CONFIG_DIR).then(function() { process.exit(0); });
      return;
    }
    console.log('[' + ts() + '] .. Otro agente tomó el lock mientras se actualizaba — este se retira.');
    process.exit(0);
  }
  escucharTrasReanudar(1);
  if (!socket.connected) socket.connect();
}

// Reabre el puerto local tras una vuelta atrás. Si sigue ocupado (p. ej. el
// agente nuevo, recién matado, todavía no lo soltó) se reintenta 5 veces cada
// 2 s; si no hay caso, el agente se cierra (soltando agente.lock) para que la
// vigía lo relance limpio, en vez de quedar vivo con el lock y sin puerto.
const REANUDAR_INTENTOS_ESCUCHA = 5;
const REANUDAR_ESPERA_ESCUCHA_MS = 2000;

function escucharTrasReanudar(intento) {
  if (servidorLocal.listening) return;
  function alFallar(err) {
    servidorLocal.removeListener('listening', alEscuchar);
    if (err.code !== 'EADDRINUSE') return;
    if (intento >= REANUDAR_INTENTOS_ESCUCHA) {
      if (act.restauracionPendiente()) {
        // Cerrarse ahora haría que la vigía relance el exe que falló (y, en uso,
        // ya no se podría restaurar). Se queda con el lock y el socket, y vuelve
        // a probar el puerto cuando el exe anterior esté de nuevo en su lugar.
        console.error('[' + ts() + '] ✗ El puerto ' + PUERTO_LOCAL + ' sigue ocupado tras ' + intento + ' intentos — se reintenta cuando se restaure el exe anterior');
        act.restaurarEnSegundoPlano(CONFIG_DIR).then(function() { escucharTrasReanudar(1); });
        return;
      }
      console.error('[' + ts() + '] ✗ El puerto ' + PUERTO_LOCAL + ' sigue ocupado tras ' + intento + ' intentos — el agente se cierra para que la vigía lo relance');
      process.exit(1);
    }
    setTimeout(function() { escucharTrasReanudar(intento + 1); }, REANUDAR_ESPERA_ESCUCHA_MS);
  }
  function alEscuchar() {
    servidorLocal.removeListener('error', alFallar);
    console.log('[' + ts() + '] ✓ Servidor local escuchando de nuevo en http://127.0.0.1:' + PUERTO_LOCAL);
  }
  servidorLocal.once('error', alFallar);
  servidorLocal.once('listening', alEscuchar);
  servidorLocal.listen(PUERTO_LOCAL, '127.0.0.1');
}

async function aplicarTrasHibernacion() {
  aplicandoActualizacion = true;
  let detenido = false;
  try {
    if (revisionEnCurso) await revisionEnCurso; // no copiar un pendiente a medio descargar
    const pend = await act.pendienteAplicable(CONFIG_DIR, VERSION);
    if (!pend) {
      console.log('[' + ts() + '] .. La actualización pendiente no pasó la verificación — se descartó');
      return reconectarTrasSuspension();
    }
    if (!act.tomarLockAplicando(CONFIG_DIR)) {
      console.log('[' + ts() + '] .. Otro proceso está aplicando la actualización');
      return reconectarTrasSuspension();
    }
    let res;
    try {
      console.log('[' + ts() + '] ⇪ Volvió de hibernación: aplicando actualización ' + VERSION + ' → ' + pend.version + '...');
      detenido = true;
      socket.disconnect();
      await cerrarServidorLocal();
      await esperarSinImpresiones();
      if (servidorLocal.closeAllConnections) servidorLocal.closeAllConnections();
      act.borrarLockSiEsMio(LOCK_FILE, process.pid);
      res = await act.reemplazarYLanzar(Object.assign({
        dirBase: CONFIG_DIR, versionNueva: pend.version,
        log: function(m) { console.log('[' + ts() + '] ' + m); },
      }, act.lanzadorReal({ puerto: PUERTO_LOCAL })));
    } finally {
      act.soltarLockAplicando(CONFIG_DIR);
    }
    if (res.ok) process.exit(0); // ya atiende la versión nueva (el exit no toca su agente.lock)
    reanudarComoAgente();
  } catch (e) {
    console.error('[' + ts() + '] ✗ Error al aplicar la actualización: ' + (e && e.message ? e.message : e));
    if (detenido) reanudarComoAgente();
  } finally {
    aplicandoActualizacion = false;
  }
}

// ── Canal 2: HTTP local (principal — el navegador de ESTA PC llama directo, sin Internet) ──
// Solo escucha en 127.0.0.1: nadie fuera de esta máquina puede llegar a este puerto.

const PUERTO_LOCAL = 4321;
let origenConfigurado = '*';
try { origenConfigurado = new URL(config.servidor).origin; } catch {}

// Además del origen configurado (config.servidor — normalmente el dominio de
// producción), se acepta cualquier localhost/127.0.0.1 sin importar el
// puerto: así funciona tanto en producción como en desarrollo (el frontend
// de Vite corre en un puerto distinto al backend, ej. 5173 vs 3001/3000).
// Sigue sin exponer nada a Internet: este servidor solo escucha en
// 127.0.0.1, así que ningún sitio fuera de esta PC puede llegar a preguntar.
function origenPermitido(req) {
  const origen = req.headers.origin;
  if (!origen) return origenConfigurado;
  if (origen === origenConfigurado) return origen;
  try {
    const { hostname } = new URL(origen);
    if (hostname === 'localhost' || hostname === '127.0.0.1') return origen;
  } catch {}
  return origenConfigurado;
}

function enviarCors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', origenPermitido(req));
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  // Chrome exige esta cabecera para permitir que una página https:// (red pública)
  // le hable a 127.0.0.1 (red privada) — "Private Network Access".
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
}

function leerCuerpo(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 2_000_000) { req.destroy(); reject(new Error('Cuerpo demasiado grande')); }
    });
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch { reject(new Error('JSON inválido')); }
    });
    req.on('error', reject);
  });
}

const servidorLocal = http.createServer(async (req, res) => {
  enviarCors(req, res);

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const { pathname, searchParams } = new URL(req.url, 'http://localhost');

  if (req.method === 'POST' && (pathname === '/imprimir/caja' || pathname === '/imprimir/cocina')) {
    const tipo = pathname === '/imprimir/caja' ? 'caja' : 'cocina';
    const forzar = searchParams.get('forzar') === '1';
    try {
      const datos = await leerCuerpo(req);
      if (tipo === 'caja') await imprimirCaja(datos, 'local', forzar);
      else await imprimirCocina(datos, 'local', forzar);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch (err) {
      console.error('[' + ts() + '] ERROR ' + tipo + ' (local): ' + err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, mensaje: err.message }));
    }
    return;
  }

  if (req.method === 'POST' && pathname === '/imprimir/cierre') {
    try {
      const datos = await leerCuerpo(req);
      await imprimirCierre(datos, 'local');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch (err) {
      console.error('[' + ts() + '] ERROR cierre (local): ' + err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, mensaje: err.message }));
    }
    return;
  }

  if (req.method === 'POST' && pathname === '/reconectar') {
    const resultado = await reconectarSocket('pedida desde el dashboard');
    if (resultado.conectado) console.log('[' + ts() + '] ✓ Reconexión forzada OK');
    else console.log('[' + ts() + '] ✗ Reconexión forzada falló: ' + resultado.error);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, conectado: resultado.conectado, error: resultado.error || null, servidor: config.servidor }));
    return;
  }

  if (req.method === 'GET' && req.url === '/salud') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, version: VERSION, sucursal_id: config.sucursal_id || null, caja_ids: cajaIds, conectado: socket.connected }));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: false, mensaje: 'No encontrado' }));
});

servidorLocal.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[${ts()}] ✗ Puerto ${PUERTO_LOCAL} ya está en uso — ¿hay otro agente corriendo?`);
  } else {
    console.error(`[${ts()}] ✗ Error del servidor local: ${err.message}`);
  }
});

servidorLocal.listen(PUERTO_LOCAL, '127.0.0.1', () => {
  console.log(`[${ts()}] ✓ Servidor local escuchando en http://127.0.0.1:${PUERTO_LOCAL} (origen configurado: ${origenConfigurado}, + cualquier localhost/127.0.0.1)`);
});

// ── ESC/POS ──────────────────────────────────────────────────────────────────

// Ancho del papel, por impresora ("ancho_caja" / "ancho_cocina" en
// config.json): 80mm = 48 columnas, 58mm (rollos de 55/57/58mm) = 32
// columnas, con la fuente estándar (Font A). Sin configurar → 80mm, como
// era siempre antes de existir esta opción.
const COLUMNAS_POR_ANCHO = { '80mm': 48, '58mm': 32, '55mm': 32 };

function columnasPara(ancho) {
  return COLUMNAS_POR_ANCHO[String(ancho || '80mm').toLowerCase()] || 48;
}

const COLS_CAJA   = columnasPara(config.ancho_caja);
const COLS_COCINA = columnasPara(config.ancho_cocina);
console.log('Papel    : caja ' + (COLS_CAJA === 48 ? '80mm' : '58mm') + ' (' + COLS_CAJA + ' col), cocina ' + (COLS_COCINA === 48 ? '80mm' : '58mm') + ' (' + COLS_COCINA + ' col)');

// Tres formas de mandar tildes/ñ, elegibles con "codepage" en config.json.
// Muchas impresoras térmicas clon no respetan la tabla PC850 tal como la
// documenta Epson (ESC t 2): un byte como el de la "ñ" cae en un hueco no
// soportado, sale como un cuadro/triángulo, y en algunos firmwares eso corta
// o corrompe el resto de la línea. Si eso pasa, probar "cp1252" y si sigue
// mal, "ascii" (sin tildes, pero nunca sale roto).
const MAPA_CP850 = {
  'á':0xA0,'é':0x82,'í':0xA1,'ó':0xA2,'ú':0xA3,
  'Á':0xB5,'É':0x90,'Í':0xD6,'Ó':0xE0,'Ú':0xE9,
  'ñ':0xA4,'Ñ':0xA5,'ü':0x81,'Ü':0x9A,
  '¡':0xAD,'¿':0xA8,'°':0xF8,'·':0xFA,
  '★':0x2A,'—':0x2D,
};
const MAPA_CP1252 = {
  'á':0xE1,'é':0xE9,'í':0xED,'ó':0xF3,'ú':0xFA,
  'Á':0xC1,'É':0xC9,'Í':0xCD,'Ó':0xD3,'Ú':0xDA,
  'ñ':0xF1,'Ñ':0xD1,'ü':0xFC,'Ü':0xDC,
  '¡':0xA1,'¿':0xBF,'°':0xB0,'·':0xB7,
  '★':0x2A,'—':0x2D,
};
// Sin acentos: transcribe a ASCII plano antes de imprimir, para que nunca
// dependa de que la impresora soporte ninguna tabla de códigos.
const REEMPLAZO_ASCII = {
  'á':'a','é':'e','í':'i','ó':'o','ú':'u',
  'Á':'A','É':'E','Í':'I','Ó':'O','Ú':'U',
  'ñ':'n','Ñ':'N','ü':'u','Ü':'U',
  '¡':'!','¿':'?','°':'o','·':'.',
  '★':'*','—':'-',
};
// n para "ESC t n" (tabla de código de caracteres, estándar Epson).
const TABLA_ESC_T = { cp850: 2, cp1252: 16, ascii: 0 };

var CODEPAGE = String(config.codepage || 'cp850').toLowerCase();
if (!TABLA_ESC_T.hasOwnProperty(CODEPAGE)) CODEPAGE = 'cp850';
var MAPA_ACTIVO = CODEPAGE === 'cp1252' ? MAPA_CP1252 : MAPA_CP850;
console.log('Codepage : ' + CODEPAGE + (CODEPAGE === 'cp850' ? ' (por defecto — si salen caracteres rotos, probar "cp1252" o "ascii" en config.json)' : ''));

function quitarAcentos(str) {
  return str.replace(/[áéíóúÁÉÍÓÚñÑüÜ¡¿°·★—]/g, function(ch) { return REEMPLAZO_ASCII[ch] || ch; });
}

// Agrupa las opciones elegidas de un combo por producto_id — ver la misma
// función en escpos.js (comparten el mismo shape de payload).
function _opcionesPorProducto(comboOpciones) {
  var mapa = {};
  (comboOpciones || []).forEach(function (co) {
    if (!co.opcion || !co.opcion.nombre) return;
    if (!mapa[co.producto_id]) mapa[co.producto_id] = [];
    mapa[co.producto_id].push(co.opcion.nombre);
  });
  return mapa;
}

class Esc {
  constructor(cols) { this.b = []; this.COLS = cols || 48; }
  raw(bytes)  { this.b.push(...bytes); return this; }
  init()      { return this.raw([0x1B, 0x40]); }
  charset()   { return this.raw([0x1B, 0x74, TABLA_ESC_T[CODEPAGE]]); }
  cut()       { return this.raw([0x1D, 0x56, 0x41, 0x05]); }
  lf(n = 1)  { for (let i = 0; i < n; i++) this.b.push(0x0A); return this; }
  left()      { return this.raw([0x1B, 0x61, 0x00]); }
  center()    { return this.raw([0x1B, 0x61, 0x01]); }
  right()     { return this.raw([0x1B, 0x61, 0x02]); }
  bold(on)    { return this.raw([0x1B, 0x45, on ? 1 : 0]); }
  normal()    { return this.raw([0x1D, 0x21, 0x00]); }
  dbl()       { return this.raw([0x1D, 0x21, 0x11]); }
  dblH()      { return this.raw([0x1D, 0x21, 0x01]); }
  dblW()      { return this.raw([0x1D, 0x21, 0x10]); }
  // Texto destacado de un ítem: doble alto y ancho en 80mm; en 58mm solo doble
  // alto, porque a doble ancho entran 16 letras y los nombres se cortan.
  destacado() { return this.COLS >= 48 ? this.dbl() : this.dblH(); }
  text(s) {
    var str = String(s != null ? s : '');
    if (CODEPAGE === 'ascii') str = quitarAcentos(str);
    for (var ci = 0; ci < str.length; ci++) {
      var ch   = str[ci];
      var code = ch.charCodeAt(0);
      var byte = MAPA_ACTIVO[ch];
      this.b.push(byte != null ? byte : (code < 128 ? code : 0x3F));
    }
    return this;
  }
  line(s)  { return this.text(s != null ? s : '').lf(); }
  rule(c)  { var ch = c || '-'; return this.line(ch.repeat(this.COLS)); }
  cols(left, right) {
    var r  = String(right != null ? right : '');
    var l  = String(left  != null ? left  : '');
    const lw = this.COLS - r.length;
    const lp = l.length > lw ? l.substring(0, lw - 1) + '.' : l.padEnd(lw);
    return this.line(lp + r);
  }
  build() { return Buffer.from(this.b); }
}

function buildCaja(data, cols) {
  var pedido      = data.pedido;
  var metodo_pago = data.metodo_pago;
  var cfg         = data.config || {};
  var esLlevar    = pedido.tipo === 'llevar';
  var esDelivery  = pedido.tipo === 'delivery';
  var nLevar      = pedido.numero_llevar != null ? pedido.numero_llevar : pedido.id;
  var nOrden      = String(data.numero_orden_diario != null ? data.numero_orden_diario : (esLlevar ? nLevar : pedido.id)).padStart(3, '0');
  var ahora       = new Date();
  var fecha       = ahora.toLocaleDateString('es-BO', { day: '2-digit', month: '2-digit', year: 'numeric' });
  var hora        = ahora.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' });
  var sym         = cfg.simbolo_moneda || 'Bs.';
  var nombre      = cfg.nombre_negocio || 'RESTAURANTE';

  var detallesTotal   = pedido.detalles || [];
  var subtotalLineas  = detallesTotal.reduce(function(s, d) { return s + parseFloat(d.precio) * d.cantidad; }, 0);
  var montoRecibido   = pedido.monto_recibido != null ? parseFloat(pedido.monto_recibido) : null;
  var cambioTotal     = parseFloat(pedido.cambio || 0);
  // Total realmente cobrado: se deriva de monto_recibido - cambio (coherente
  // en efectivo y QR — ver _finalizarVenta en el backend), no de pedido.total,
  // que no refleja descuentos, cupón ni puntos canjeados.
  var total           = montoRecibido != null ? montoRecibido - cambioTotal : subtotalLineas;
  var descuento       = parseFloat(pedido.descuento || 0);
  var propina         = parseFloat(pedido.propina || 0);
  var descuentoCupon  = parseFloat(pedido.descuento_cupon || 0);
  var puntosGanados   = pedido.puntos_ganados || 0;
  var puntosCanjeados = pedido.puntos_canjeados || 0;
  // El descuento en Bs por canje de puntos no se guarda como columna propia:
  // se despeja de la misma fórmula que usa _finalizarVenta para el total neto.
  var descuentoPuntos = Math.max(0, subtotalLineas - descuento - descuentoCupon + propina - total);
  var hayAjustes      = descuento > 0 || descuentoCupon > 0 || descuentoPuntos > 0 || propina > 0;

  var t = new Esc(cols);
  t.init().charset();

  // ── Encabezado ────────────────────────────────────────────────────────────
  t.rule('=');
  t.center().bold(true).line(nombre.toUpperCase()).bold(false);
  var direccionTel = [cfg.direccion, cfg.telefono ? 'Tel: ' + cfg.telefono : null].filter(Boolean).join(' - ');
  if (direccionTel) t.center().line(direccionTel);
  t.rule('=');

  // ── Tipo de comprobante + N° de orden ────────────────────────────────────
  t.left().bold(true).cols('NOTA DE VENTA', 'Nro. ' + nOrden).bold(false);
  t.rule('-');

  // ── Fecha / Hora / Mesa /Llevar ──────────────────────────────────────────
  t.left().cols('Fecha: ' + fecha, hora);
  if (esDelivery) {
    t.left().line('DELIVERY' + (pedido.origen_app ? ' · ' + pedido.origen_app : '') + ' — ' + (pedido.nombre_cliente || 'Cliente'));
    if (pedido.direccion_entrega) t.left().line(pedido.direccion_entrega);
    if (pedido.telefono_cliente) t.left().line('Tel: ' + pedido.telefono_cliente);
  } else if (esLlevar) {
    t.left().line('PARA LLEVAR — ' + ((pedido.cliente && pedido.cliente.numero_documento) || pedido.nombre_cliente || 'Cliente'));
  } else {
    var mesaNombre = (pedido.mesa && pedido.mesa.nombre) ? pedido.mesa.nombre : '---';
    t.left().line(mesaNombre.toUpperCase());
  }
  t.rule('-');

  // ── Items ─────────────────────────────────────────────────────────────────
  t.left().cols('Cant  Descripcion', 'Importe');
  t.rule('-');
  var detalles = pedido.detalles || [];
  for (var i = 0; i < detalles.length; i++) {
    var d       = detalles[i];
    var esCombo = !!d.combo;
    var prod    = String(esCombo ? ('COMBO: ' + d.combo.nombre) : ((d.producto && d.producto.nombre) ? d.producto.nombre : '')).toUpperCase();
    var sub     = (parseFloat(d.precio) * d.cantidad).toFixed(2);
    if (d.peso != null) {
      var pesoKg   = parseFloat(d.peso).toFixed(3);
      var precioKg = parseFloat((d.producto && d.producto.precio) || 0).toFixed(2);
      t.left().cols('  ' + pesoKg + 'kg ' + prod, sub);
      t.left().line('        (' + sym + ' ' + precioKg + '/kg)');
    } else {
      var qty = d.cantidad;
      var pu  = parseFloat(d.precio).toFixed(2);
      t.left().cols('  ' + qty + '   ' + prod, sub);
      if (qty > 1) t.left().line('        (' + sym + ' ' + pu + ' c/u)');
    }
    if (esCombo && d.combo.productos && d.combo.productos.length) {
      var opcionesPorProducto = _opcionesPorProducto(d.combo_opciones);
      var contenidoCombo = d.combo.productos.map(function(p) {
        var cant = (p.ComboProducto && p.ComboProducto.cantidad) || 1;
        var opciones = opcionesPorProducto[p.id];
        return cant + 'x ' + p.nombre + (opciones && opciones.length ? ' (' + opciones.join(', ') + ')' : '');
      }).join(', ');
      t.left().line('        (' + contenidoCombo + ')');
    } else if (d.opciones && d.opciones.length) {
      var nombresOpciones = d.opciones.map(function(o) { return o.nombre; }).join(', ');
      t.left().line('        (' + nombresOpciones + ')');
    }
    if (d.nota) t.left().bold(true).line('      >> ' + d.nota).bold(false);
  }
  t.rule('-');

  // ── Total ─────────────────────────────────────────────────────────────────
  if (hayAjustes) {
    t.left().cols('Subtotal', sym + ' ' + subtotalLineas.toFixed(2));
    if (descuento > 0) t.left().cols('Descuento', '-' + sym + ' ' + descuento.toFixed(2));
    if (descuentoCupon > 0) {
      var etiquetaCupon = 'Cupon' + (pedido.cupon ? ' (' + pedido.cupon.codigo + ')' : '');
      t.left().cols(etiquetaCupon, '-' + sym + ' ' + descuentoCupon.toFixed(2));
      // Cupón generado por la promo de cumpleaños (ver cumpleanos.job.js en
      // el backend — código con prefijo "CUMPLE"): además de la línea normal
      // de descuento, un banner festivo con el nombre del cliente.
      var esCuponCumple = pedido.cupon && /^CUMPLE/.test(pedido.cupon.codigo);
      if (esCuponCumple) {
        var nombreCumple = (pedido.cliente && pedido.cliente.nombre) ? pedido.cliente.nombre.toUpperCase() : '';
        t.center().bold(true).line('*** FELIZ CUMPLEAÑOS' + (nombreCumple ? ' ' + nombreCumple : '') + ' ***').bold(false);
      }
    }
    if (descuentoPuntos > 0) t.left().cols('Puntos canjeados (' + puntosCanjeados + ')', '-' + sym + ' ' + descuentoPuntos.toFixed(2));
    if (propina > 0) t.left().cols('Propina', sym + ' ' + propina.toFixed(2));
  }
  t.left().bold(true).cols('TOTAL ' + sym, total.toFixed(2)).bold(false);
  t.rule('=');

  // ── Método de pago ────────────────────────────────────────────────────────
  var METODO_PAGO_LABEL = { qr: 'QR / Transferencia', app_externa: 'Pagado en la app', diferido: 'Pendiente de cobro' };
  t.left().line('Forma de pago: ' + (METODO_PAGO_LABEL[metodo_pago] || 'Efectivo'));
  t.rule('-');

  // ── Cliente / puntos de fidelidad ────────────────────────────────────────
  if (pedido.cliente && (puntosGanados > 0 || pedido.cliente.puntos != null)) {
    if (pedido.cliente.numero_documento || pedido.cliente.nombre) t.left().line('Cliente: ' + (pedido.cliente.numero_documento || pedido.cliente.nombre));
    if (puntosGanados > 0) t.left().line('+ ' + puntosGanados + ' puntos ganados');
    if (pedido.cliente.puntos != null) t.left().bold(true).line('Saldo de puntos: ' + pedido.cliente.puntos).bold(false);
    t.rule('-');
  }

  // ── Pie ───────────────────────────────────────────────────────────────────
  t.lf(1).center().line('Gracias por su preferencia').center().line(nombre).lf(3).cut();
  return t.build();
}

// Precio unitario + subtotal de un ítem de cocina. En 80mm queda igual que
// siempre; en 58mm no entra en una línea, así que se alinea a dos columnas.
function lineaPrecioCocina(t, precio, subtotal) {
  if (t.COLS >= 48) t.left().line('     ' + precio + '       Sub: ' + subtotal);
  else t.left().cols('  ' + precio, 'Sub: ' + subtotal);
}

function buildCocina(data, cols) {
  var pedido   = data.pedido;
  var cfg      = data.config || {};
  var t        = new Esc(cols);
  var esLlevar = pedido.tipo === 'llevar';
  var esDelivery = pedido.tipo === 'delivery';
  var nLevar   = pedido.numero_llevar != null ? pedido.numero_llevar : pedido.id;
  var nOrden   = String(data.numero_orden_diario != null ? data.numero_orden_diario : (esLlevar ? nLevar : pedido.id)).padStart(3, '0');
  var ahora    = new Date();
  var hora     = ahora.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' });
  var sym      = cfg.simbolo_moneda || 'Bs.';
  // Aviso de productos anulados: encabezado "ANULAR", cada línea con prefijo
  // "ANULAR" y sin precios ni total, para que no parezca una comanda nueva.
  var esAnulacion = !!data.anulacion;

  t.init().charset();

  // ── Encabezado cocina (visualmente diferente a caja: usa # y dblW) ────────
  t.rule('#');
  if (esAnulacion) t.center().bold(true).dbl().line('ANULAR').normal().bold(false);
  else t.center().bold(true).dblW().line('COCINA').normal().bold(false);
  t.rule('#');

  // ── Tipo de orden + identificación ────────────────────────────────────────
  if (esDelivery) {
    t.center().dbl().bold(true).line('DELIVERY').normal().bold(false);
    t.center().dbl().bold(true).line('# ' + nOrden).normal().bold(false);
  } else if (esLlevar) {
    t.center().dbl().bold(true).line('PARA LLEVAR').normal().bold(false);
    t.center().dbl().bold(true).line('# ' + nOrden).normal().bold(false);
  } else {
    var mesaNombre2 = (pedido.mesa && pedido.mesa.nombre) ? pedido.mesa.nombre : '---';
    t.center().dbl().bold(true).line(mesaNombre2.toUpperCase()).normal().bold(false);
    t.center().dbl().bold(true).line('# ' + nOrden).normal().bold(false);
  }
  t.rule('#');

  // ── Info ──────────────────────────────────────────────────────────────────
  if (esDelivery) {
    t.left().bold(true).dblH().line('Cliente: ' + (pedido.nombre_cliente || '-')).normal().bold(false);
    if (pedido.direccion_entrega) t.left().line(pedido.direccion_entrega);
    if (pedido.telefono_cliente) t.left().line('Tel: ' + pedido.telefono_cliente);
  } else if (esLlevar) {
    t.left().bold(true).dblH().line('Cliente: ' + (pedido.nombre_cliente || '-')).normal().bold(false);
  }
  t.left().line('Hora: ' + hora);
  t.rule('#');

  // ── Items ─────────────────────────────────────────────────────────────────
  var detalles2 = pedido.detalles || [];
  for (var j = 0; j < detalles2.length; j++) {
    var d2       = detalles2[j];
    var esCombo2 = !!d2.combo;
    var prod2    = String(esCombo2 ? ('COMBO: ' + d2.combo.nombre) : ((d2.producto && d2.producto.nombre) ? d2.producto.nombre : '')).toUpperCase();
    var sub2     = (parseFloat(d2.precio) * d2.cantidad).toFixed(2);
    if (esAnulacion) {
      var cantAnul = d2.peso != null ? parseFloat(d2.peso).toFixed(3) + 'kg' : d2.cantidad;
      t.left().destacado().bold(true).line('ANULAR ' + cantAnul + '  ' + prod2).normal().bold(false);
    } else if (d2.peso != null) {
      var pesoKg2   = parseFloat(d2.peso).toFixed(3);
      var precioKg2 = parseFloat((d2.producto && d2.producto.precio) || 0).toFixed(2);
      t.left().destacado().bold(true).line(pesoKg2 + 'kg  ' + prod2).normal().bold(false);
      lineaPrecioCocina(t, sym + ' ' + precioKg2 + '/kg', sym + ' ' + sub2);
    } else {
      var qty2 = d2.cantidad;
      var pu2  = parseFloat(d2.precio).toFixed(2);
      t.left().destacado().bold(true).line(qty2 + '  ' + prod2).normal().bold(false);
      lineaPrecioCocina(t, sym + ' ' + pu2 + ' c/u', sym + ' ' + sub2);
    }
    if (esCombo2 && d2.combo.productos && d2.combo.productos.length) {
      var opcionesPorProducto2 = _opcionesPorProducto(d2.combo_opciones);
      var contenidoCombo2 = d2.combo.productos.map(function(p) {
        var cant = (p.ComboProducto && p.ComboProducto.cantidad) || 1;
        var opciones = opcionesPorProducto2[p.id];
        return cant + 'x ' + p.nombre + (opciones && opciones.length ? ' (' + opciones.join(', ') + ')' : '');
      }).join(', ');
      t.left().bold(true).line('     >> Incluye: ' + contenidoCombo2).bold(false);
    } else if (d2.opciones && d2.opciones.length) {
      var nombresOpciones2 = d2.opciones.map(function(o) { return o.nombre; }).join(', ');
      t.left().bold(true).line('     >> ' + nombresOpciones2).bold(false);
    }
    if (d2.nota) t.left().bold(true).dblH().line(' >> ' + d2.nota).normal().bold(false);
    t.rule('-');
  }
  t.rule('#');

  // ── Total (pedido del dueño: que cocina también vea cuánto se consumió) ──
  if (!esAnulacion) {
    var totalCocina = detalles2.reduce(function(s, d) { return s + parseFloat(d.precio) * d.cantidad; }, 0);
    t.left().bold(true).dblH().cols('TOTAL', sym + ' ' + totalCocina.toFixed(2)).normal().bold(false);
    t.rule('#');
  }

  // ── Notas del pedido (grande y visible) ───────────────────────────────────
  if (pedido.notas) {
    t.center().bold(true).line('!! NOTA ESPECIAL !!').bold(false);
    t.left().bold(true).dblH().line(pedido.notas).normal().bold(false);
    t.rule('#');
  }

  t.center().line('-- ticket de cocina --').lf(3).cut();
  return t.build();
}

function buildCierre(data, cols) {
  var reporte = data.reporte;
  var cfg     = data.config || {};
  var sesion  = reporte.sesion;
  var sym     = cfg.simbolo_moneda || 'Bs.';
  var nombre  = cfg.nombre_negocio || 'RESTAURANTE';

  var ventasPorMetodo = reporte.ventas_por_metodo || [];
  var productosVendidos = reporte.productos_vendidos || [];
  var gastos = sesion.gastos || [];

  var totalEfectivo = ventasPorMetodo.find(function(v) { return v.metodo_pago === 'efectivo'; });
  var totalQR       = ventasPorMetodo.find(function(v) { return v.metodo_pago === 'qr'; });

  var apertura    = parseFloat(sesion.monto_apertura);
  var totalVentas = parseFloat(sesion.total_ventas);
  var totalGastos = parseFloat(sesion.total_gastos);
  var totalDevoluciones = parseFloat(sesion.total_devoluciones || 0);
  var cierre      = parseFloat(sesion.monto_cierre || 0);
  var diferencia  = parseFloat(sesion.diferencia || 0);
  var cuadrado    = Math.abs(diferencia) < 0.01;

  function fmtHora(f) {
    if (!f) return '-';
    return new Date(f).toLocaleString('es-BO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  var t = new Esc(cols);
  t.init().charset();

  // ── Encabezado ────────────────────────────────────────────────────────────
  t.rule('=');
  t.center().bold(true).line(nombre.toUpperCase()).bold(false);
  t.rule('=');
  t.center().bold(true).line('CIERRE DE CAJA').bold(false);
  t.rule('-');

  // ── Datos de la sesión ────────────────────────────────────────────────────
  t.left().cols('Cajero', (sesion.usuario && sesion.usuario.nombre) || '-');
  t.left().cols('Apertura', fmtHora(sesion.abierto_en));
  t.left().cols('Cierre', fmtHora(sesion.cerrado_en));
  t.rule('-');

  // ── Productos vendidos ────────────────────────────────────────────────────
  t.left().bold(true).line('PRODUCTOS VENDIDOS').bold(false);
  if (productosVendidos.length) {
    t.left().cols('Cant  Producto', 'Total');
    t.rule('-');
    for (var i = 0; i < productosVendidos.length; i++) {
      var p = productosVendidos[i];
      var cantEtq = String(p.total_cantidad).padEnd(5);
      t.left().cols(cantEtq + String(p.nombre).toUpperCase(), parseFloat(p.total).toFixed(2));
    }
  } else {
    t.left().line('Sin ventas');
  }
  t.rule('-');

  // ── Gastos del turno ──────────────────────────────────────────────────────
  if (gastos.length) {
    t.left().bold(true).line('GASTOS DEL TURNO').bold(false);
    for (var j = 0; j < gastos.length; j++) {
      t.left().cols(gastos[j].descripcion, parseFloat(gastos[j].monto).toFixed(2));
    }
    t.left().bold(true).cols('Total gastos', sym + ' ' + totalGastos.toFixed(2)).bold(false);
    t.rule('-');
  }

  // ── Resumen de ventas ─────────────────────────────────────────────────────
  if (totalEfectivo) t.left().cols('Efectivo (' + totalEfectivo.cantidad + ' ord.)', sym + ' ' + parseFloat(totalEfectivo.total).toFixed(2));
  if (totalQR) t.left().cols('QR / Transf. (' + totalQR.cantidad + ' ord.)', sym + ' ' + parseFloat(totalQR.total).toFixed(2));
  t.left().bold(true).dblH().cols('TOTAL VENTAS', sym + ' ' + totalVentas.toFixed(2)).normal().bold(false);
  t.rule('-');

  // ── Arqueo ────────────────────────────────────────────────────────────────
  t.left().cols('Apertura', sym + ' ' + apertura.toFixed(2));
  t.left().cols('+ Efectivo ventas', sym + ' ' + parseFloat((totalEfectivo && totalEfectivo.total) || 0).toFixed(2));
  t.left().cols('- Gastos', sym + ' ' + totalGastos.toFixed(2));
  if (totalDevoluciones > 0) t.left().cols('- Devoluciones', sym + ' ' + totalDevoluciones.toFixed(2));
  t.left().bold(true).cols('Esperado en caja', sym + ' ' + parseFloat(reporte.efectivo_esperado || 0).toFixed(2)).bold(false);
  t.left().cols('Contado fisico', sym + ' ' + cierre.toFixed(2));
  t.rule('=');

  // ── Diferencia ────────────────────────────────────────────────────────────
  if (cuadrado) {
    t.center().bold(true).dblH().line('*** CUADRADO ***').normal().bold(false);
  } else {
    var signo = diferencia >= 0 ? '+' : '';
    t.center().bold(true).dblH().line('DIFERENCIA: ' + signo + sym + ' ' + diferencia.toFixed(2)).normal().bold(false);
  }
  t.rule('=');

  t.center().line('-- resumen de turno --').lf(3).cut();
  return t.build();
}

// ── Impresión raw via PowerShell Win32 ───────────────────────────────────────

const PS_RAWPRINT = `Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class RawPrint {
    [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Ansi)]
    public class DOCINFOA {
        [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
    }
    [DllImport("winspool.Drv",EntryPoint="OpenPrinterA",SetLastError=true,CharSet=CharSet.Ansi,ExactSpelling=true,CallingConvention=CallingConvention.StdCall)]
    public static extern bool OpenPrinter(string szPrinter,out IntPtr hPrinter,IntPtr pd);
    [DllImport("winspool.Drv",EntryPoint="ClosePrinter",SetLastError=true,ExactSpelling=true,CallingConvention=CallingConvention.StdCall)]
    public static extern bool ClosePrinter(IntPtr hPrinter);
    [DllImport("winspool.Drv",EntryPoint="StartDocPrinterA",SetLastError=true,CharSet=CharSet.Ansi,ExactSpelling=true,CallingConvention=CallingConvention.StdCall)]
    public static extern bool StartDocPrinter(IntPtr hPrinter,Int32 level,[In,MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);
    [DllImport("winspool.Drv",EntryPoint="EndDocPrinter",SetLastError=true,ExactSpelling=true,CallingConvention=CallingConvention.StdCall)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);
    [DllImport("winspool.Drv",EntryPoint="StartPagePrinter",SetLastError=true,ExactSpelling=true,CallingConvention=CallingConvention.StdCall)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);
    [DllImport("winspool.Drv",EntryPoint="EndPagePrinter",SetLastError=true,ExactSpelling=true,CallingConvention=CallingConvention.StdCall)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);
    [DllImport("winspool.Drv",EntryPoint="WritePrinter",SetLastError=true,ExactSpelling=true,CallingConvention=CallingConvention.StdCall)]
    public static extern bool WritePrinter(IntPtr hPrinter,IntPtr pBytes,Int32 dwCount,out Int32 dwWritten);
    public static bool Send(string name, byte[] bytes) {
        IntPtr hPrinter; int written;
        IntPtr pBytes = Marshal.AllocCoTaskMem(bytes.Length);
        Marshal.Copy(bytes, 0, pBytes, bytes.Length);
        bool ok = false;
        if (OpenPrinter(name, out hPrinter, IntPtr.Zero)) {
            DOCINFOA di = new DOCINFOA();
            di.pDocName  = "ESCPOS";
            di.pDataType = "RAW";
            if (StartDocPrinter(hPrinter, 1, di)) {
                if (StartPagePrinter(hPrinter)) {
                    ok = WritePrinter(hPrinter, pBytes, bytes.Length, out written);
                    EndPagePrinter(hPrinter);
                }
                EndDocPrinter(hPrinter);
            }
            ClosePrinter(hPrinter);
        }
        Marshal.FreeCoTaskMem(pBytes);
        return ok;
    }
}
'@
`;

// Asíncrona a propósito: si fuera bloqueante (execFileSync), todo el proceso
// —incluido el servidor HTTP local— se congela mientras PowerShell imprime
// (500ms-2s típico). Eso hacía que la petición local del navegador quedara
// en cola detrás de una impresión disparada por socket, y para cuando se
// atendía, el pedido ya estaba marcado como impreso (se veía como "omitido").
function printRaw(printerName, buffer) {
  return new Promise((resolve, reject) => {
    const id     = Date.now();
    const tmpBin = path.join(os.tmpdir(), `ticket_${id}.bin`);
    const tmpPs  = path.join(os.tmpdir(), `print_${id}.ps1`);

    writeFileSync(tmpBin, buffer);

    const ps1 = PS_RAWPRINT +
      `$bytes = [System.IO.File]::ReadAllBytes("${tmpBin.replace(/\\/g, '\\\\')}")\n` +
      `$ok    = [RawPrint]::Send("${printerName}", $bytes)\n` +
      `if (-not $ok) { Write-Error "Impresora no respondio: ${printerName}"; exit 1 }\n`;

    writeFileSync(tmpPs, ps1, { encoding: 'utf8' });

    execFile('powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', tmpPs],
      { timeout: 15000 },
      (err) => {
        try { unlinkSync(tmpBin); } catch {}
        try { unlinkSync(tmpPs);  } catch {}
        if (err) reject(err); else resolve();
      });
  });
}

function ts() {
  return new Date().toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
