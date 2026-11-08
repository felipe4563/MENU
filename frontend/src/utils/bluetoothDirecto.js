// Bluetooth directo: el navegador (Chrome/Edge, en Android o en la PC) le
// habla a la impresora térmica por Web Bluetooth (BLE), sin RawBT ni agente.
//
// - Se empareja una vez por dispositivo (emparejar): el navegador muestra su
//   selector y recuerda el permiso; acá se guarda el id en localStorage.
// - Cada ticket reconecta en silencio con getDevices() y manda los bytes
//   ESC/POS (los mismos que arma escpos.js para RawBT) en bloques chicos.
// - Las impresoras que solo tienen Bluetooth clásico (SPP) no se ven desde el
//   navegador: para esas queda la conexión con RawBT.

// Servicios GATT que exponen las impresoras térmicas comunes (y sus clones).
const SERVICIOS = [
  '000018f0-0000-1000-8000-00805f9b34fb',
  '0000ff00-0000-1000-8000-00805f9b34fb',
  '0000ffe0-0000-1000-8000-00805f9b34fb',
  '0000ae30-0000-1000-8000-00805f9b34fb',
  '49535343-fe7d-4ae5-8fa9-9fafd205e455',
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
];
const CLAVE = 'rusoft-impresora-bt';
// Las impresoras BLE baratas tienen un búfer chico y, sin control de flujo
// (write sin respuesta), descartan lo que llega más rápido de lo que
// imprimen: el texto entra, pero el logo (~7 KB de imagen) se perdía. Por eso
// se manda en bloques y a un ritmo fijo de bytes por segundo, como hace RawBT.
// 20 bytes entra en cualquier conexión BLE sin negociar un paquete más grande
// (en Windows Chrome no lo negocia y los bloques mayores se cortaban).
const BLOQUE = 20;
const BLOQUE_SEGURO = 20;
const BYTES_POR_SEGUNDO = 2500;

export class ErrorBluetooth extends Error {
  constructor(mensaje, codigo) { super(mensaje); this.codigo = codigo; }
}

export const soportaBluetooth = () => typeof navigator !== 'undefined' && 'bluetooth' in navigator;

export function impresoraGuardada() {
  try { return JSON.parse(localStorage.getItem(CLAVE) || 'null'); } catch { return null; }
}

function guardar(device) {
  const dato = { id: device.id, nombre: device.name || 'Impresora Bluetooth' };
  try { localStorage.setItem(CLAVE, JSON.stringify(dato)); } catch { /* sin almacenamiento */ }
  window.dispatchEvent(new Event('impresora-bt'));
  return dato;
}

// La conexión abierta se reutiliza entre tickets mientras la página siga viva.
let actual = null; // { device, caracteristica, sinRespuesta }
// La impresora elegida queda en memoria aunque se desconecte (muchas cortan
// el Bluetooth tras un rato sin uso): se reconecta sola en el próximo ticket.
// Chrome, por defecto, no deja recuperarla tras recargar (getDevices está
// apagado), así que solo se pierde al recargar la página.
let dispositivo = null;

async function buscarCaracteristica(server) {
  const servicios = await server.getPrimaryServices().catch(async () => {
    const lista = [];
    for (const uuid of SERVICIOS) {
      try { lista.push(await server.getPrimaryService(uuid)); } catch { /* no lo tiene */ }
    }
    return lista;
  });
  for (const servicio of servicios) {
    const caracts = await servicio.getCharacteristics().catch(() => []);
    const c = caracts.find((x) => x.properties.writeWithoutResponse || x.properties.write);
    if (c) return { caracteristica: c, sinRespuesta: c.properties.writeWithoutResponse };
  }
  throw new ErrorBluetooth('Esta impresora no acepta impresión por Bluetooth directo. Usa la conexión con RawBT para ella.', 'SIN_ESCRITURA');
}

async function conectar(device) {
  if (actual?.device === device && device.gatt.connected) return actual;
  const server = await device.gatt.connect();
  const encontrado = await buscarCaracteristica(server);
  actual = { device, ...encontrado };
  dispositivo = device;
  device.addEventListener('gattserverdisconnected', () => { if (actual?.device === device) actual = null; }, { once: true });
  return actual;
}

// Abre el selector del navegador (necesita un toque del usuario).
export async function emparejar() {
  if (!soportaBluetooth()) throw new ErrorBluetooth('Este navegador no puede usar Bluetooth. Usa Chrome o Edge.', 'SIN_SOPORTE');
  let device;
  try {
    device = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: SERVICIOS });
  } catch (e) {
    if (e?.name === 'NotFoundError') throw new ErrorBluetooth('No elegiste ninguna impresora.', 'CANCELADO');
    throw new ErrorBluetooth('No se pudo abrir el Bluetooth. Revisa que esté encendido.', 'SIN_BLUETOOTH');
  }
  await conectar(device);
  return guardar(device);
}

// Tras recargar, si el ticket sale justo después de un toque (Cobrar), se
// aprovecha ese toque para abrir la lista del navegador una vez.
async function volverAElegir(dato) {
  if (!navigator.userActivation?.isActive) {
    throw new ErrorBluetooth(`Toca Conectar y elige ${dato.nombre} otra vez (el navegador la olvida al recargar la página).`, 'OLVIDADA');
  }
  try {
    const device = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: SERVICIOS });
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
async function escribir({ caracteristica, sinRespuesta }, bytes, tam, progreso) {
  const pausa = Math.max(8, Math.ceil((tam / BYTES_POR_SEGUNDO) * 1000));
  for (let i = progreso.enviado; i < bytes.length; i += tam) {
    const trozo = bytes.slice(i, i + tam);
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
export async function imprimirDirecto(bytes) {
  if (!soportaBluetooth()) throw new ErrorBluetooth('Este navegador no puede usar Bluetooth. Usa Chrome o Edge.', 'SIN_SOPORTE');
  const datos = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const device = await dispositivoGuardado();
  let conexion;
  try {
    conexion = await conectar(device);
  } catch (e) {
    if (e instanceof ErrorBluetooth) throw e;
    throw new ErrorBluetooth(`No se pudo conectar con ${device.name || 'la impresora'}. Revisa que esté encendida y cerca.`, 'SIN_CONEXION');
  }
  const progreso = { enviado: 0 };
  try {
    // Con respuesta solo van bloques de 20: más grandes necesitan "escritura
    // larga", que muchas impresoras clon no soportan.
    await escribir(conexion, datos, BLOQUE, progreso);
  } catch {
    // Algunas impresoras no aguantan bloques grandes: se sigue despacio
    // desde donde se cortó.
    actual = null;
    try {
      conexion = await conectar(device);
      await escribir(conexion, datos, BLOQUE_SEGURO, progreso);
    } catch {
      throw new ErrorBluetooth('Se cortó la conexión con la impresora mientras imprimía.', 'CORTE');
    }
  }
}

export async function olvidar() {
  const dato = impresoraGuardada();
  try { localStorage.removeItem(CLAVE); } catch { /* sin almacenamiento */ }
  if (actual) { try { actual.device.gatt.disconnect(); } catch { /* ya estaba */ } actual = null; }
  dispositivo = null;
  if (dato && navigator.bluetooth?.getDevices) {
    const d = (await navigator.bluetooth.getDevices().catch(() => [])).find((x) => x.id === dato.id);
    await d?.forget?.().catch(() => {});
  }
  window.dispatchEvent(new Event('impresora-bt'));
}
