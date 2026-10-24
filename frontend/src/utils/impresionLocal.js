import { imprimirTicketVenta } from './ticketVenta';
import { imprimirTicketCocina } from './ticketCocina';
import { imprimirTicketCierreCaja } from './ticketCierreCaja';
import { imprimirBluetoothCaja, imprimirBluetoothCocina } from './rawbt';
import { useImpresionStore } from '../store/impresionStore';

// Manda el ticket directo al agente de impresión instalado en ESTA PC
// (http://127.0.0.1, nunca sale a Internet). Es el camino principal de
// impresión: no depende de que el agente tenga el socket.io conectado al
// servidor. El backend igual emite el mismo evento por socket como respaldo
// (por si el agente está en otra PC, o si esta falla), y el propio agente
// deduplica para no imprimir el mismo pedido dos veces.
const PUERTO_AGENTE_LOCAL = 4321;
const TIMEOUT_MS = 1500;

function postConTimeout(url, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: controller.signal,
  }).finally(() => clearTimeout(timer));
}

// `forzar` salta la deduplicación de 5 minutos del agente (pensada para no
// imprimir dos veces el mismo pedido cuando llega por socket y local casi
// al mismo tiempo). Úsalo solo para una reimpresión explícita pedida por el
// usuario (botón "Imprimir de nuevo"), nunca para el auto-print inicial.
// `modo_impresion` viaja en cada payload (lo agrega el backend según la caja
// que hizo la venta — ver _emitirImpresion en ventas.service.js): 'fisica'
// sigue el camino de siempre (agente de Windows local), 'bluetooth' arma el
// ticket ESC/POS acá mismo y lo manda por RawBT (ver rawbt.js) — no pasa por
// ningún agente ni por el local host, así que no tiene sentido de "respaldo
// por socket" como el modo físico.
export function imprimirLocal(datosImpresion, { forzar = false } = {}) {
  if (!datosImpresion) return;
  const base = `http://127.0.0.1:${PUERTO_AGENTE_LOCAL}`;
  const qs = forzar ? '?forzar=1' : '';
  const cajaBT = datosImpresion.caja?.modo_impresion === 'bluetooth';
  const cocinaBT = datosImpresion.cocina?.modo_impresion === 'bluetooth';
  // Si hay una pantalla dedicada en cocina (ver PantallaCocinaImpresion.jsx),
  // esa pantalla es la única responsable de imprimir la comanda por
  // Bluetooth — el dispositivo que vendió no debe imprimirla también, o
  // sale duplicada. El flag viaja en el propio payload de cocina (lo agrega
  // el backend en _emitirImpresion), así que no hace falta otra consulta.
  const cocinaConPantallaDedicada = cocinaBT && datosImpresion.cocina?.config?.cocina_pantalla_dedicada === 'true';

  // Los dos tickets Bluetooth no se disparan juntos (ver por qué en
  // store/impresionStore.js) — se imprime caja y cocina queda pendiente de
  // un botón manual ("Imprimir cocina") para que la persona corte el papel
  // con calma antes de mandar el siguiente.
  if (cajaBT && cocinaBT && !cocinaConPantallaDedicada) {
    imprimirBluetoothCaja(datosImpresion.caja).then(() => {
      useImpresionStore.getState().marcarCocinaPendiente(datosImpresion.cocina);
    });
  } else {
    if (datosImpresion.caja) {
      if (cajaBT) {
        imprimirBluetoothCaja(datosImpresion.caja);
      } else {
        postConTimeout(`${base}/imprimir/caja${qs}`, datosImpresion.caja).catch(() => {
          // Sin agente local en esta PC: no pasa nada, el socket.io del backend
          // ya mandó el mismo ticket como respaldo.
        });
      }
    }
    if (datosImpresion.cocina && !cocinaConPantallaDedicada) {
      if (cocinaBT) {
        imprimirBluetoothCocina(datosImpresion.cocina);
      } else {
        postConTimeout(`${base}/imprimir/cocina${qs}`, datosImpresion.cocina).catch(() => {});
      }
    }
  }
}

// Para el botón "Imprimir de nuevo": intenta el agente local primero (con
// forzar=1, saltando la deduplicación) y, si el agente no responde (apagado,
// CORS, timeout), cae automáticamente al diálogo de impresión del navegador
// con el mismo ticket, para que el usuario elija una impresora de Windows.
// Solo se usa para la reimpresión manual — el auto-print inicial no tiene
// fallback (ver imprimirLocal arriba).
export function reimprimirConFallback(datosImpresion) {
  if (!datosImpresion) return;
  const base = `http://127.0.0.1:${PUERTO_AGENTE_LOCAL}`;
  const cajaBT = datosImpresion.caja?.modo_impresion === 'bluetooth';
  const cocinaBT = datosImpresion.cocina?.modo_impresion === 'bluetooth';

  if (cajaBT && cocinaBT) {
    // No hay agente/local host de por medio en este modo — reimprimir es
    // simplemente volver a disparar RawBT, sin fallback al navegador. Cocina
    // vuelve a quedar pendiente del botón manual, igual que en la impresión
    // automática (ver imprimirLocal arriba).
    imprimirBluetoothCaja(datosImpresion.caja).then(() => {
      useImpresionStore.getState().marcarCocinaPendiente(datosImpresion.cocina);
    });
    return;
  }

  if (datosImpresion.caja) {
    if (cajaBT) {
      imprimirBluetoothCaja(datosImpresion.caja);
    } else {
      postConTimeout(`${base}/imprimir/caja?forzar=1`, datosImpresion.caja).catch(() => {
        const { pedido, metodo_pago, config, numero_orden_diario } = datosImpresion.caja;
        imprimirTicketVenta(pedido, { total: pedido.total, metodo_pago }, config, numero_orden_diario);
      });
    }
  }
  if (datosImpresion.cocina) {
    if (cocinaBT) {
      imprimirBluetoothCocina(datosImpresion.cocina);
    } else {
      postConTimeout(`${base}/imprimir/cocina?forzar=1`, datosImpresion.cocina).catch(() => {
        const { pedido, config, numero_orden_diario, anulacion } = datosImpresion.cocina;
        imprimirTicketCocina(pedido, config, numero_orden_diario, anulacion);
      });
    }
  }
}

// Cierre de caja: acción manual del cajero en esta misma PC (a diferencia de
// venta/cocina, no tiene respaldo por socket ni modo Bluetooth — cada cierre
// es un evento único, no algo que otra caja necesite recibir como backup).
// Mismo molde que imprimirLocal: intenta el agente local primero (ESC/POS
// crudo — evita la corrupción que causaba imprimirla como página HTML
// rasterizada vía window.print()) y cae al ticket HTML viejo si el agente no
// está corriendo en esta PC.
export function imprimirCierreLocal(reporte, config) {
  const base = `http://127.0.0.1:${PUERTO_AGENTE_LOCAL}`;
  postConTimeout(`${base}/imprimir/cierre`, { reporte, config }).catch(() => {
    imprimirTicketCierreCaja(reporte, config);
  });
}
