// Bluetooth directo: el navegador (Chrome/Edge, en Android o en la PC) le
// habla a la impresora térmica por Web Bluetooth (BLE), sin RawBT ni agente.
//
// - Se empareja una vez por dispositivo (emparejar): el navegador muestra su
//   selector y recuerda el permiso; acá se guarda el id en localStorage.
// - Cada ticket reconecta en silencio con getDevices() y manda los bytes
//   ESC/POS (los mismos que arma escpos.js para RawBT) en bloques chicos.
// - Las impresoras que solo tienen Bluetooth clásico (SPP) no se ven por BLE:
//   para esas está RawBT (Android) o el puerto COM (computadora, ver
//   serialImpresora.js). Este dispositivo puede elegir el puerto COM en
//   Probar impresora; entonces imprimirDirecto manda todo por ahí.
//
// Si una impresora conecta pero no imprime, en Probar impresora se exploran
// todos sus canales (características) y modos de envío; el que funciona se
// guarda como "perfil" de este dispositivo y se usa en cada ticket.
import { imprimirSerial } from './serialImpresora';
import { bytesParaImpresora } from './tspl';

const base = (corto) => `0000${corto}-0000-1000-8000-00805f9b34fb`;

// Servicios GATT de impresoras térmicas comunes (y sus clones). El navegador
// solo deja ver los servicios que se piden acá al elegir la impresora.
export const SERVICIOS = [
  base('18f0'), base('ff00'), base('ffe0'), base('ae30'), base('ae00'), base('fff0'),
  base('fee7'), base('ffb0'), base('ff12'), base('ae3a'), base('fe79'),
  '49535343-fe7d-4ae5-8fa9-9fafd205e455',
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
  '0000ffe5-0000-1000-8000-00805f9b34fb',
];
// Características de impresión conocidas, en orden de preferencia: si la
// impresora tiene varias que aceptan escritura, se usa primero una de estas.
const CARACTERISTICAS_IMPRESION = [
  base('2af1'), base('ff02'), base('ffe1'), base('ae01'), base('fff2'), base('ffe9'),
  '49535343-8841-43f4-a8d4-ecbe34729bb3',
  'bef8d6c9-9c21-4c9e-b632-bd58c1009f9f',
];
const NOMBRES = {
  [base('18f0')]: 'Impresora (18F0)', [base('ff00')]: 'Impresora (FF00)', [base('ffe0')]: 'Serie (FFE0)',
  [base('ae30')]: 'Impresora (AE30)', [base('ae00')]: 'Impresora (AE00)', [base('fff0')]: 'Serie (FFF0)',
  [base('fee7')]: 'Fabricante (FEE7)', '49535343-fe7d-4ae5-8fa9-9fafd205e455': 'Serie ISSC',
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2': 'Impresora (E781)',
};
export const nombreServicio = (uuid) => NOMBRES[uuid] ?? (uuid.endsWith('-0000-1000-8000-00805f9b34fb') ? `Servicio ${uuid.slice(4, 8).toUpperCase()}` : `Servicio ${uuid.slice(0, 8)}`);
export const uuidCorto = (uuid) => (uuid.endsWith('-0000-1000-8000-00805f9b34fb') ? uuid.slice(4, 8).toUpperCase() : uuid.slice(0, 8));

// "ff00", "0xFF00" o el UUID completo → UUID completo; null si no sirve.
export function normalizarUuid(txt) {
  const t = String(txt || '').trim().toLowerCase().replace(/^0x/, '');
  if (/^[0-9a-f]{4}$/.test(t)) return base(t);
  if (/^[0-9a-f]{8}$/.test(t)) return `${t}-0000-1000-8000-00805f9b34fb`;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(t)) return t;
  return null;
}

const CLAVE = 'rusoft-impresora-bt';
const CLAVE_PERFIL = 'rusoft-impresora-bt-perfil';
const CLAVE_VIA = 'rusoft-impresora-via'; // 'ble' | 'serial'
const CLAVE_EXTRAS = 'rusoft-impresora-bt-extras';

// Envío por defecto. Las impresoras BLE baratas tienen un búfer chico y, sin
// control de flujo (write sin respuesta), descartan lo que llega más rápido de
// lo que imprimen. 20 bytes entra en cualquier conexión BLE sin negociar un
// paquete más grande (en Windows Chrome no lo negocia y los bloques mayores
// se cortaban).
export const ENVIO_DEFECTO = { modo: 'auto', bloque: 20, bps: 2500 };

export class ErrorBluetooth extends Error {
  constructor(mensaje, codigo) { super(mensaje); this.codigo = codigo; }
}

export const soportaBluetooth = () => typeof navigator !== 'undefined' && 'bluetooth' in navigator;

const leerJson = (clave) => { try { return JSON.parse(localStorage.getItem(clave) || 'null'); } catch { return null; } };
const escribirJson = (clave, v) => { try { if (v == null) localStorage.removeItem(clave); else localStorage.setItem(clave, JSON.stringify(v)); } catch { /* sin almacenamiento */ } };
const avisarCambio = () => window.dispatchEvent(new Event('impresora-bt'));

export const impresoraGuardada = () => leerJson(CLAVE);
// Canal y modo de envío que funcionaron con la impresora guardada.
export const perfilGuardado = () => leerJson(CLAVE_PERFIL);
// Por dónde imprime este dispositivo: Bluetooth directo o puerto COM.
export const viaGuardada = () => { try { return localStorage.getItem(CLAVE_VIA) || 'ble'; } catch { return 'ble'; } };
export function guardarVia(via) { try { localStorage.setItem(CLAVE_VIA, via); } catch { /* nada */ } avisarCambio(); }
// Servicios extra que se agregaron a mano en Probar impresora.
export const serviciosExtra = () => leerJson(CLAVE_EXTRAS) ?? [];
const todosLosServicios = (extras = serviciosExtra()) => [...new Set([...SERVICIOS, ...extras])];

function guardar(device) {
  const dato = { id: device.id, nombre: device.name || 'Impresora Bluetooth' };
  escribirJson(CLAVE, dato);
  avisarCambio();
  return dato;
}

// La conexión abierta se reutiliza entre tickets mientras la página siga viva.
let actual = null; // { device, caracteristica, sinRespuesta }
// La impresora elegida queda en memoria aunque se desconecte (muchas cortan
// el Bluetooth tras un rato sin uso): se reconecta sola en el próximo ticket.
// Chrome, por defecto, no deja recuperarla tras recargar (getDevices está
// apagado), así que solo se pierde al recargar la página.
let dispositivo = null;

const props = (c) => ({
  escribe: !!c.properties.write,
  sinRespuesta: !!c.properties.writeWithoutResponse,
  notifica: !!(c.properties.notify || c.properties.indicate),
  lee: !!c.properties.read,
});

async function listarServicios(server) {
  return server.getPrimaryServices().catch(async () => {
    const lista = [];
    for (const uuid of todosLosServicios()) {
      try { lista.push(await server.getPrimaryService(uuid)); } catch { /* no lo tiene */ }
    }
    return lista;
  });
}

const modoSinRespuesta = (c, modo) => (modo === 'sin' ? true : modo === 'con' ? false : !!c.properties.writeWithoutResponse);

async function buscarCaracteristica(server, perfil) {
  if (perfil?.caracteristica) {
    try {
      const s = await server.getPrimaryService(perfil.servicio);
      const c = await s.getCharacteristic(perfil.caracteristica);
      return { caracteristica: c, sinRespuesta: modoSinRespuesta(c, perfil.modo) };
    } catch {
      throw new ErrorBluetooth('La impresora ya no tiene el canal que se eligió en Probar impresora. Vuelve a probarla ahí.', 'SIN_ESCRITURA');
    }
  }
  const escribibles = [];
  for (const servicio of await listarServicios(server)) {
    const caracts = await servicio.getCharacteristics().catch(() => []);
    caracts.filter((x) => x.properties.writeWithoutResponse || x.properties.write).forEach((c) => escribibles.push(c));
  }
  // Primero un canal de impresión conocido; si no hay, el primero que escriba.
  const rango = (c) => { const i = CARACTERISTICAS_IMPRESION.indexOf(c.uuid); return i < 0 ? 99 : i; };
  const c = escribibles.sort((a, b) => rango(a) - rango(b))[0];
  if (c) return { caracteristica: c, sinRespuesta: modoSinRespuesta(c, perfil?.modo) };
  throw new ErrorBluetooth('Esta impresora no acepta impresión por Bluetooth directo. Pruébala en Probar impresora › Formas de conexión.', 'SIN_ESCRITURA');
}

async function conectar(device, perfil = perfilParaDispositivo(device)) {
  if (actual?.device === device && device.gatt.connected) return actual;
  const server = await device.gatt.connect();
  const encontrado = await buscarCaracteristica(server, perfil);
  actual = { device, ...encontrado };
  dispositivo = device;
  vigilar(device);
  ponerEstado('conectada');
  return actual;
}

// ── Reconexión ────────────────────────────────────────────────────────────
// Muchas impresoras cortan el Bluetooth al terminar de imprimir o tras un
// rato sin uso. Mientras la página siga abierta, se vuelve a conectar sola
// (1 s, 2 s, 4 s… hasta 30 s entre intentos) para que el próximo ticket no
// espere ni falle. Solo se vigila la impresora guardada o la que se está
// probando en Probar impresora.
export const EVENTO_ESTADO = 'impresora-bt-estado';
let estado = 'sin'; // 'sin' | 'conectada' | 'reconectando'
let enPrueba = null;
let olvidando = false;
let timerReconexion = null;
const vigilados = new WeakSet();

function ponerEstado(e) {
  if (estado === e) return;
  estado = e;
  window.dispatchEvent(new Event(EVENTO_ESTADO));
}
export const estadoConexion = () => estado;

const debeVigilar = (device) => !olvidando && (device === enPrueba || device.id === impresoraGuardada()?.id);

function vigilar(device) {
  if (vigilados.has(device)) return;
  vigilados.add(device);
  device.addEventListener('gattserverdisconnected', () => {
    if (actual?.device === device) actual = null;
    if (debeVigilar(device)) reconectar(device, 0);
    else ponerEstado('sin');
  });
}

function reconectar(device, intento) {
  clearTimeout(timerReconexion);
  ponerEstado('reconectando');
  const espera = Math.min(30000, 1000 * 2 ** intento);
  timerReconexion = setTimeout(async () => {
    if (!debeVigilar(device)) return ponerEstado('sin');
    if (device.gatt.connected) return ponerEstado('conectada');
    // Con la ventana oculta no se insiste: se reintenta al volver a ella.
    if (document.hidden) return undefined;
    try {
      await device.gatt.connect();
      ponerEstado('conectada');
    } catch {
      reconectar(device, intento + 1);
    }
    return undefined;
  }, espera);
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    const d = enPrueba ?? dispositivo;
    if (!document.hidden && d && !d.gatt.connected && debeVigilar(d)) reconectar(d, 0);
  });
}

function perfilParaDispositivo(device) {
  const p = perfilGuardado();
  return p && p.deviceId === device.id ? p : null;
}

async function pedirDispositivo(extras) {
  return navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: todosLosServicios(extras) });
}

// Abre el selector del navegador (necesita un toque del usuario).
export async function emparejar() {
  if (!soportaBluetooth()) throw new ErrorBluetooth('Este navegador no puede usar Bluetooth. Usa Chrome o Edge.', 'SIN_SOPORTE');
  let device;
  try {
    device = await pedirDispositivo();
  } catch (e) {
    if (e?.name === 'NotFoundError') throw new ErrorBluetooth('No elegiste ninguna impresora.', 'CANCELADO');
    throw new ErrorBluetooth('No se pudo abrir el Bluetooth. Revisa que esté encendido.', 'SIN_BLUETOOTH');
  }
  if (impresoraGuardada()?.id !== device.id) escribirJson(CLAVE_PERFIL, null);
  await conectar(device);
  guardarVia('ble');
  return guardar(device);
}

// Tras recargar, si el ticket sale justo después de un toque (Cobrar), se
// aprovecha ese toque para abrir la lista del navegador una vez.
async function volverAElegir(dato) {
  if (!navigator.userActivation?.isActive) {
    throw new ErrorBluetooth(`Toca Conectar y elige ${dato.nombre} otra vez (el navegador la olvida al recargar la página).`, 'OLVIDADA');
  }
  try {
    const device = await pedirDispositivo();
    guardar(device);
    return device;
  } catch {
    throw new ErrorBluetooth(`No elegiste la impresora. Toca Conectar y elige ${dato.nombre}.`, 'OLVIDADA');
  }
}

async function dispositivoGuardado() {
  const dato = impresoraGuardada();
  if (!dato) throw new ErrorBluetooth('Este dispositivo no tiene impresora Bluetooth. Conéctala desde tu perfil › Impresora de este dispositivo.', 'SIN_IMPRESORA');
  if (dispositivo?.id === dato.id) return dispositivo;
  if (navigator.bluetooth.getDevices) {
    const device = (await navigator.bluetooth.getDevices().catch(() => [])).find((d) => d.id === dato.id);
    if (device) return device;
  }
  return volverAElegir(dato);
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// Escribe desde `desde` y devuelve hasta dónde llegó (para seguir desde ahí
// si se corta, sin reimprimir lo que ya salió). Con respuesta, la propia
// confirmación de la impresora marca el ritmo; sin respuesta, se espera lo que
// tarda en procesar cada bloque.
async function escribir({ caracteristica, sinRespuesta }, bytes, { bloque, bps }, progreso) {
  const pausa = Math.max(8, Math.ceil((bloque / bps) * 1000));
  for (let i = progreso.enviado; i < bytes.length; i += bloque) {
    const trozo = bytes.slice(i, i + bloque);
    if (sinRespuesta) {
      await caracteristica.writeValueWithoutResponse(trozo);
      await esperar(pausa);
    } else {
      await caracteristica.writeValueWithResponse(trozo);
    }
    progreso.enviado = i + trozo.length;
  }
}

// Manda los bytes ESC/POS a la impresora guardada de este dispositivo.
// Si este dispositivo marcó su impresora como de etiquetas (TSPL), el ticket
// se traduce antes de mandarlo (ver tspl.js).
export async function imprimirDirecto(bytes) {
  const datos = bytesParaImpresora(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
  if (viaGuardada() === 'serial') return imprimirSerial(datos);
  if (!soportaBluetooth()) throw new ErrorBluetooth('Este navegador no puede usar Bluetooth. Usa Chrome o Edge.', 'SIN_SOPORTE');
  const device = await dispositivoGuardado();
  // Mientras se imprime no compite un intento de reconexión en segundo plano.
  clearTimeout(timerReconexion);
  const perfil = perfilParaDispositivo(device);
  const envio = { ...ENVIO_DEFECTO, ...(perfil ?? {}) };
  let conexion;
  try {
    conexion = await conectar(device, perfil);
  } catch (e) {
    if (e instanceof ErrorBluetooth) throw e;
    throw new ErrorBluetooth(`No se pudo conectar con ${device.name || 'la impresora'}. Revisa que esté encendida y cerca.`, 'SIN_CONEXION');
  }
  const progreso = { enviado: 0 };
  try {
    await escribir(conexion, datos, envio, progreso);
  } catch (e1) {
    // Se cortó: se reconecta y se sigue despacio desde donde quedó.
    console.warn('[impresora] corte al imprimir:', e1);
    actual = null;
    try {
      conexion = await conectar(device, perfil);
      await escribir(conexion, datos, { bloque: 20, bps: Math.min(envio.bps, 2500) }, progreso);
    } catch (e2) {
      const kb = (n) => `${Math.round(n / 102.4) / 10} KB`;
      throw new ErrorBluetooth(`Se cortó la conexión con la impresora mientras imprimía (llegaron ${kb(progreso.enviado)} de ${kb(datos.length)}: ${e2?.message || e1?.message || 'sin detalle'}).`, 'CORTE');
    }
  }
  return undefined;
}

export async function olvidar() {
  const dato = impresoraGuardada();
  escribirJson(CLAVE, null);
  escribirJson(CLAVE_PERFIL, null);
  // Al olvidarla no se reconecta: se corta a propósito.
  olvidando = true;
  clearTimeout(timerReconexion);
  if (actual) { try { actual.device.gatt.disconnect(); } catch { /* ya estaba */ } actual = null; }
  enPrueba = null;
  olvidando = false;
  ponerEstado('sin');
  dispositivo = null;
  if (dato && navigator.bluetooth?.getDevices) {
    const d = (await navigator.bluetooth.getDevices().catch(() => [])).find((x) => x.id === dato.id);
    await d?.forget?.().catch(() => {});
  }
  avisarCambio();
}

// ── Diagnóstico (Probar impresora › Formas de conexión) ────────────────────

/**
 * Abre el selector, conecta y lista TODOS los servicios y canales que la
 * impresora deja ver, con lo que acepta cada uno. `extras`: UUIDs de
 * servicios agregados a mano (se recuerdan para los tickets).
 */
export async function explorarImpresora({ extras = [], log = () => {} } = {}) {
  if (!soportaBluetooth()) throw new ErrorBluetooth('Este navegador no puede usar Bluetooth. Usa Chrome o Edge.', 'SIN_SOPORTE');
  escribirJson(CLAVE_EXTRAS, extras.length ? extras : null);
  let device;
  try {
    device = await pedirDispositivo(extras);
  } catch (e) {
    if (e?.name === 'NotFoundError') throw new ErrorBluetooth('No elegiste ninguna impresora.', 'CANCELADO');
    throw new ErrorBluetooth(`No se pudo abrir el Bluetooth: ${e?.message || e}`, 'SIN_BLUETOOTH');
  }
  log(`Elegida: ${device.name || '(sin nombre)'}`);
  if (actual?.device === device) actual = null;
  let server;
  try {
    log('Conectando…');
    server = device.gatt.connected ? device.gatt : await device.gatt.connect();
    enPrueba = device;
    vigilar(device);
    ponerEstado('conectada');
  } catch (e) {
    throw new ErrorBluetooth(`No conectó: ${e?.message || e}. Si es la que no termina en "_LE", es Bluetooth clásico: prueba el puerto COM o RawBT.`, 'SIN_CONEXION');
  }
  log('Conectada. Buscando servicios…');
  const servicios = [];
  for (const s of await listarServicios(server)) {
    const caracts = await s.getCharacteristics().catch((e) => { log(`  ${uuidCorto(s.uuid)}: no deja ver sus canales (${e?.message || e})`); return []; });
    servicios.push({
      uuid: s.uuid, nombre: nombreServicio(s.uuid),
      caracteristicas: caracts.map((c) => ({ uuid: c.uuid, ...props(c), conocida: CARACTERISTICAS_IMPRESION.includes(c.uuid) })),
    });
  }
  const escribibles = servicios.flatMap((s) => s.caracteristicas.filter((c) => c.escribe || c.sinRespuesta));
  log(`${servicios.length} servicio(s), ${escribibles.length} canal(es) para escribir.`);
  if (!servicios.length) log('No se vio ningún servicio. Agrega a mano el UUID del servicio de la impresora y vuelve a buscar.');
  return { device, nombre: device.name || 'Impresora Bluetooth', servicios };
}

/**
 * Prueba un canal con un modo de envío: conecta, escribe `bytes` y devuelve
 * cuánto tardó. `envio`: { servicio, caracteristica, modo: 'auto'|'con'|'sin', bloque, bps }.
 */
export async function probarCanal(device, envio, bytes, log = () => {}) {
  const inicio = performance.now();
  actual = null;
  log(`Conectando para probar ${uuidCorto(envio.caracteristica)} (${envio.modo === 'con' ? 'con confirmación' : envio.modo === 'sin' ? 'sin confirmación' : 'automático'}, bloques de ${envio.bloque}, ${envio.bps} B/s)…`);
  let conexion;
  try {
    clearTimeout(timerReconexion);
    const server = device.gatt.connected ? device.gatt : await device.gatt.connect();
    enPrueba = device;
    vigilar(device);
    ponerEstado('conectada');
    conexion = { device, ...(await buscarCaracteristica(server, envio)) };
  } catch (e) {
    throw new ErrorBluetooth(`No conectó: ${e?.message || e}`, 'SIN_CONEXION');
  }
  const progreso = { enviado: 0 };
  try {
    await escribir(conexion, bytes, envio, progreso);
  } catch (e) {
    throw new ErrorBluetooth(`Se cortó a los ${progreso.enviado} de ${bytes.length} bytes: ${e?.message || e}`, 'CORTE');
  }
  const ms = Math.round(performance.now() - inicio);
  log(`Enviados ${bytes.length} bytes en ${(ms / 1000).toFixed(1)} s. ¿Salió el ticket?`);
  return { ms };
}

// Deja la impresora y el canal que funcionaron como los de este dispositivo.
export function usarCanal(device, envio) {
  escribirJson(CLAVE_PERFIL, { deviceId: device.id, servicio: envio.servicio, caracteristica: envio.caracteristica, modo: envio.modo, bloque: envio.bloque, bps: envio.bps });
  actual = null;
  dispositivo = device;
  guardarVia('ble');
  return guardar(device);
}
