// Impresión Bluetooth. Los bytes ESC/POS se arman acá (ver escpos.js) y salen
// por uno de dos caminos, según la caja:
// - 'directo': Web Bluetooth desde el navegador (ver bluetoothDirecto.js).
// - 'rawbt': una URL `rawbt:` que Android le pasa a la app RawBT si está
//   instalada — mismo mecanismo que "compartir" a otra app.
import { Esc, buildCaja, buildCocina, buildCierre, LOGO_MAX_PX, CODIFICACIONES } from './escpos';
import { emparejar, imprimirDirecto, viaGuardada } from './bluetoothDirecto';
import { avisar } from '../components/ui/Aviso';
import { logoAEscPos } from './logoEscPos';
import { bytesParaImpresora } from './tspl';
import { logoSrc } from '../api/configuracion';

// El logo no cambia entre tickets — se cachea por URL para no re-rasterizarlo
// (leer imagen + canvas + recorrer píxeles) en cada venta. El tamaño del
// logo (~30x30mm, ver LOGO_MAX_PX) es el mismo sin importar el ancho de
// papel de la caja, así que no hace falta separar la caché por ancho.
// Solo se guarda cuando sale bien: si falla una vez (red, CORS), el próximo
// ticket lo vuelve a intentar en vez de quedar sin logo hasta recargar.
let _logoCache = null; // { url, logo }

async function cargarLogo(cfg) {
  const url = logoSrc(cfg?.logo);
  if (!url) return { logo: null, error: 'El negocio no tiene logo cargado.' };
  if (_logoCache?.url === url) return { logo: _logoCache.logo };
  try {
    const logo = await logoAEscPos(url, LOGO_MAX_PX, LOGO_MAX_PX);
    _logoCache = { url, logo };
    return { logo };
  } catch (e) {
    console.warn('Ticket sin logo:', e);
    return { logo: null, error: e?.message || 'No se pudo preparar el logo.' };
  }
}

// El ticket igual sale aunque el logo falle; la caja puede apagar el logo.
async function obtenerLogoRasterizado(cfg, imprimirLogo = true) {
  if (!imprimirLogo) return null;
  return (await cargarLogo(cfg)).logo;
}

function bytesABase64(bytes) {
  let binario = '';
  for (let i = 0; i < bytes.length; i++) binario += String.fromCharCode(bytes[i]);
  return btoa(binario);
}

// Un <a> invisible en vez de `window.location.href`: si RawBT no está
// instalado, Android/Chrome se limitan a no hacer nada — no navega la SPA
// a una página de error ni pierde el estado de la pantalla actual.
// `crudo`: los bytes ya vienen en el idioma de la impresora (pruebas).
function dispararRawBT(bytes, { crudo = false } = {}) {
  const a = document.createElement('a');
  a.href = 'rawbt:base64,' + bytesABase64(crudo ? bytes : bytesParaImpresora(bytes));
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => a.remove(), 1000);
}

// La caja elige cómo se conecta su impresora Bluetooth (Ajustes › Cajas):
// 'directo' (Web Bluetooth, sin apps) o 'rawbt' (la app de Android). Los
// bytes del ticket son los mismos; solo cambia por dónde salen.
async function enviar(bytes, conexion, que) {
  if (conexion !== 'directo') { dispararRawBT(bytes); return true; }
  try {
    await imprimirDirecto(bytes);
    return true;
  } catch (e) {
    // Sin impresora en este aparato: el botón abre la lista del navegador
    // (necesita el toque) y después imprime lo que quedó pendiente.
    // Por puerto COM el puerto se elige en Probar impresora (no hay lista
    // Bluetooth que abrir desde acá).
    const falta = (e.codigo === 'SIN_IMPRESORA' || e.codigo === 'OLVIDADA') && viaGuardada() !== 'serial';
    const reintentar = falta
      ? () => emparejar().then(() => enviar(bytes, conexion, que)).catch((err) => err.codigo !== 'CANCELADO' && avisar.error(err.message))
      : () => enviar(bytes, conexion, que);
    avisar.error(`No se pudo imprimir ${que}. ${e.codigo === 'SIN_IMPRESORA' ? 'Este dispositivo no tiene la impresora Bluetooth conectada.' : e.message}`, {
      duracion: 12000,
      accion: e.codigo === 'SIN_SOPORTE' ? undefined : { texto: falta ? 'Conectar' : 'Reintentar', onClick: reintentar },
    });
    return false;
  }
}

export async function imprimirBluetoothCaja(datosCaja) {
  const logo = await obtenerLogoRasterizado(datosCaja.config, datosCaja.imprimir_logo !== false);
  return enviar(buildCaja(datosCaja, logo), datosCaja.conexion_bluetooth, 'el ticket');
}

// Resumen del cierre de turno, por la impresora Bluetooth de esa caja.
export async function imprimirBluetoothCierre(reporte, config) {
  const caja = reporte.sesion?.caja || {};
  const logo = await obtenerLogoRasterizado(config, caja.imprimir_logo !== 0);
  return enviar(buildCierre(reporte, config, caja.ancho_papel_bluetooth || '80mm', logo), caja.conexion_bluetooth, 'el resumen');
}

// Ticket corto para probar la impresora desde "Impresora de este dispositivo".
// Devuelve si llevó logo, o por qué no, para mostrarlo en pantalla.
export async function imprimirPrueba({ config, ancho = '80mm', nombreImpresora, conLogo = true }) {
  const r = await bytesPrueba({ config, ancho, lineas: [nombreImpresora || ''], conLogo });
  await imprimirDirecto(r.bytes);
  return r;
}

// Bytes del ticket de prueba. `titulo` grande arriba (p. ej. el número de
// canal que se está probando) y `lineas` con el detalle.
export async function bytesPrueba({ config, ancho = '80mm', titulo, lineas = [], conLogo = false }) {
  const { logo, error } = conLogo ? await cargarLogo(config) : { logo: null };
  const t = new Esc(ancho).init().charset();
  if (logo) t.center().imagen(logo.anchoBytes, logo.alto, logo.datos).lf();
  t.center().bold(true).dbl().line(titulo || config?.nombre_negocio || 'Prueba').normal().bold(false);
  t.lf().line('Prueba de impresión');
  lineas.filter(Boolean).forEach((l) => t.line(l));
  t.line(new Date().toLocaleString('es-BO'));
  t.lf().line('Si lees esto bien, la impresora').line('está lista para los tickets.').lf(3).cut();
  return { bytes: t.build(), conLogo: Boolean(logo), errorLogo: conLogo ? error : null, bytesLogo: logo ? logo.datos.length : 0 };
}

export { dispararRawBT };

export const FRASE_LETRAS = 'Ñandú, piña, año ¿Sí? ¡Olé! áéíóú ÁÉÍÓÚ ü 25°';

// Mandar a la impresora de este dispositivo: Bluetooth directo, o la app RawBT.
async function mandarPrueba(bytes, via) {
  if (via === 'rawbt') { dispararRawBT(bytes); return; }
  await imprimirDirecto(bytes);
}

// La misma frase con cada tabla de letras, con su letra al lado: la que salga
// bien es la que hay que elegir para esta impresora.
export async function imprimirMuestraLetras({ ancho = '80mm', via = 'directo' }) {
  const t = new Esc(ancho, 'ascii').init().charset();
  t.center().bold(true).line('PRUEBA DE LETRAS').bold(false).line('Elige la letra donde la frase sale bien').left().rule();
  for (const c of CODIFICACIONES) {
    t.charset(c.id).bold(true).text(`${c.letra}) `).bold(false).line(FRASE_LETRAS);
  }
  t.charset('ascii').rule().lf(3).cut();
  await mandarPrueba(t.build(), via);
}

// Diagnóstico: los 128 caracteres "especiales" (bytes 0x80–0xFF) de una tabla,
// 16 por fila con su número. Muestra qué letras tiene de verdad la impresora.
export async function imprimirMapaCaracteres({ ancho = '80mm', via = 'directo', codificacion }) {
  const t = new Esc(ancho, 'ascii').init().charset();
  const c = CODIFICACIONES.find((x) => x.id === codificacion) ?? CODIFICACIONES[0];
  t.center().bold(true).line(`MAPA ${c.letra}) ${c.nombre}`).bold(false).line(`ESC t ${c.escT}`).left().rule();
  t.charset(c.id);
  const sep = ancho === '58mm' ? [] : [0x20];
  for (let fila = 0x8; fila <= 0xF; fila++) {
    t.text(`${fila.toString(16).toUpperCase()}x `);
    for (let col = 0; col < 16; col++) t.raw([(fila << 4) | col, ...sep]);
    t.lf();
  }
  t.charset('ascii').rule().line('La n con tilde deberia estar en').line('F1 (opciones A/E) o A4 (B/C/D).').lf(3).cut();
  await mandarPrueba(t.build(), via);
}

// Texto libre, con la tabla de letras elegida, para probar lo que sea.
export async function imprimirTextoLibre({ texto, ancho = '80mm', via = 'directo', tamano = 'normal', codificacion }) {
  const t = new Esc(ancho, codificacion).init().charset().left();
  if (tamano === 'grande') t.dbl(); else if (tamano === 'alto') t.dblH();
  for (const linea of String(texto).split('\n')) t.line(linea);
  t.normal().lf(3).cut();
  await mandarPrueba(t.build(), via);
}

// Cuando hay que imprimir también el de cocina, este NO se dispara solo
// (ver por qué en store/impresionStore.js: un segundo `rawbt:` automático
// —por tiempo fijo o esperando que la pestaña recupere el foco— no salía
// confiable). En su lugar, quien maneje la impresora aprieta el botón
// "Imprimir cocina" (BotonCocinaPendiente.jsx) cuando ya cortó el ticket de
// caja y está lista/o — este export es lo que ese botón termina llamando.
export async function imprimirBluetoothCocina(datosCocina) {
  return enviar(buildCocina(datosCocina), datosCocina.conexion_bluetooth, 'la comanda');
}
