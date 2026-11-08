// Impresión Bluetooth. Los bytes ESC/POS se arman acá (ver escpos.js) y salen
// por uno de dos caminos, según la caja:
// - 'directo': Web Bluetooth desde el navegador (ver bluetoothDirecto.js).
// - 'rawbt': una URL `rawbt:` que Android le pasa a la app RawBT si está
//   instalada — mismo mecanismo que "compartir" a otra app.
import { Esc, buildCaja, buildCocina, buildCierre, LOGO_MAX_PX } from './escpos';
import { emparejar, imprimirDirecto } from './bluetoothDirecto';
import { avisar } from '../components/ui/Aviso';
import { logoAEscPos } from './logoEscPos';
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
function dispararRawBT(bytes) {
  const a = document.createElement('a');
  a.href = 'rawbt:base64,' + bytesABase64(bytes);
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
    const falta = e.codigo === 'SIN_IMPRESORA' || e.codigo === 'OLVIDADA';
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
  const { logo, error } = conLogo ? await cargarLogo(config) : { logo: null };
  const t = new Esc(ancho).init().charset();
  if (logo) t.center().imagen(logo.anchoBytes, logo.alto, logo.datos).lf();
  t.center().bold(true).dbl().line(config?.nombre_negocio || 'Prueba').normal().bold(false);
  t.lf().line('Prueba de impresión').line(nombreImpresora || '').line(new Date().toLocaleString('es-BO'));
  t.lf().line('Si lees esto bien, la impresora').line('está lista para los tickets.').lf(3).cut();
  await imprimirDirecto(t.build());
  return { conLogo: Boolean(logo), errorLogo: conLogo ? error : null, bytesLogo: logo ? logo.datos.length : 0 };
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
