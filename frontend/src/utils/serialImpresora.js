// Bluetooth clásico por puerto COM (Web Serial, Chrome/Edge de computadora).
//
// Al emparejar una impresora Bluetooth clásica en Windows, el sistema crea un
// puerto COM ("Vínculo serie estándar a través de Bluetooth"). El navegador
// puede escribir en ese puerto con Web Serial: sirve para impresoras que no
// imprimen por Bluetooth directo (BLE). A diferencia de BLE, el permiso del
// puerto sobrevive a recargar la página.
import { ErrorBluetooth } from './bluetoothDirecto';

const SPP = '00001101-0000-1000-8000-00805f9b34fb'; // servicio "puerto serie"
const CLAVE = 'rusoft-impresora-com';

export const soportaSerial = () => typeof navigator !== 'undefined' && 'serial' in navigator;

let puerto = null;

const descripcion = (p) => {
  const i = p?.getInfo?.() ?? {};
  if (i.bluetoothServiceClassId) return 'Bluetooth (puerto serie)';
  if (i.usbVendorId) return `USB ${i.usbVendorId.toString(16)}:${(i.usbProductId ?? 0).toString(16)}`;
  return 'Puerto COM';
};

export function puertoGuardado() {
  try { return JSON.parse(localStorage.getItem(CLAVE) || 'null'); } catch { return null; }
}

function recordar(p, baudios) {
  const dato = { nombre: descripcion(p), info: p.getInfo?.() ?? {}, baudios };
  try { localStorage.setItem(CLAVE, JSON.stringify(dato)); } catch { /* sin almacenamiento */ }
  return dato;
}

// Abre la lista de puertos del navegador (necesita un toque).
export async function elegirPuerto() {
  if (!soportaSerial()) throw new ErrorBluetooth('Este navegador no tiene puertos COM. Usa Chrome o Edge en la computadora.', 'SIN_SOPORTE');
  try {
    try {
      puerto = await navigator.serial.requestPort({ allowedBluetoothServiceClassIds: [SPP] });
    } catch (e) {
      if (e?.name !== 'TypeError') throw e;
      puerto = await navigator.serial.requestPort();
    }
  } catch (e) {
    if (e?.name === 'NotFoundError') throw new ErrorBluetooth('No elegiste ningún puerto.', 'CANCELADO');
    throw new ErrorBluetooth(`No se pudo abrir la lista de puertos: ${e?.message || e}`, 'SIN_PUERTO');
  }
  return { puerto, nombre: descripcion(puerto) };
}

async function puertoActual() {
  if (puerto) return puerto;
  const dato = puertoGuardado();
  const lista = soportaSerial() ? await navigator.serial.getPorts().catch(() => []) : [];
  const igual = (p) => JSON.stringify(p.getInfo?.() ?? {}) === JSON.stringify(dato?.info ?? {});
  puerto = lista.find(igual) ?? (lista.length === 1 ? lista[0] : null);
  if (!puerto) throw new ErrorBluetooth('Esta computadora no tiene el puerto de la impresora. Elígelo en Probar impresora › Puerto COM.', 'SIN_IMPRESORA');
  return puerto;
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

async function abrir(p, baudios) {
  if (p.writable) return;
  try {
    await p.open({ baudRate: baudios });
  } catch (e) {
    throw new ErrorBluetooth(`No se pudo abrir el puerto (${e?.message || e}). Revisa que la impresora esté encendida y que otro programa no lo esté usando.`, 'SIN_CONEXION');
  }
}

/**
 * Manda bytes ESC/POS al puerto. `bloque` y `pausa` (ms entre bloques) se
 * ajustan desde Probar impresora si la impresora pierde datos.
 */
export async function imprimirSerial(bytes, { p = null, baudios, bloque = 512, pausa = 20, log = () => {} } = {}) {
  const destino = p ?? await puertoActual();
  const vel = baudios ?? puertoGuardado()?.baudios ?? 9600;
  const datos = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  log(`Abriendo ${descripcion(destino)} a ${vel} baudios…`);
  await abrir(destino, vel);
  const writer = destino.writable.getWriter();
  try {
    for (let i = 0; i < datos.length; i += bloque) {
      await writer.write(datos.slice(i, i + bloque));
      if (pausa) await esperar(pausa);
    }
    log(`Enviados ${datos.length} bytes.`);
  } catch (e) {
    throw new ErrorBluetooth(`Se cortó el envío por el puerto: ${e?.message || e}`, 'CORTE');
  } finally {
    writer.releaseLock();
  }
}

export function usarPuerto(p, baudios) {
  puerto = p;
  return recordar(p, baudios);
}

export async function olvidarPuerto() {
  try { localStorage.removeItem(CLAVE); } catch { /* sin almacenamiento */ }
  if (puerto) { try { await puerto.close(); } catch { /* ya estaba cerrado */ } }
  puerto = null;
}
