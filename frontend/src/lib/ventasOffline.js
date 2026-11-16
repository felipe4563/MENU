// Vender sin internet: solo efectivo y para llevar.
//
// Si al cobrar no hay conexión con el servidor, la venta se guarda en este
// navegador, se imprime con la impresora local (el agente de 127.0.0.1 o
// Bluetooth, que no necesitan internet) y se sube sola cuando vuelve la
// conexión. Cada venta lleva una clave propia: si el servidor ya la recibió
// (se cortó justo la respuesta), al reintentar devuelve la misma venta en vez
// de registrarla dos veces.
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { crearVentaCompleta } from '../api/ventas';
import { errorDe } from './util';

const CLAVE_PLANTILLA = 'plantilla-ticket';
const CLAVE_NUMERO = 'numero-sin-conexion';
const ESPERA_MS = 15000; // sin respuesta en este tiempo, la venta se guarda acá

export const useColaOffline = create(
  persist(
    (set) => ({
      ventas: [], // { clave, usuario_id, datos, numero, total, vendido_en, error? }
      subiendo: false,
      agregar: (v) => set((s) => ({ ventas: [...s.ventas, v] })),
      quitar: (clave) => set((s) => ({ ventas: s.ventas.filter((v) => v.clave !== clave) })),
      marcarError: (clave, error) => set((s) => ({ ventas: s.ventas.map((v) => (v.clave === clave ? { ...v, error } : v)) })),
      setSubiendo: (subiendo) => set({ subiendo }),
    }),
    { name: 'ventas-sin-conexion', partialize: (s) => ({ ventas: s.ventas }) },
  ),
);

export function nuevaClave() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `off-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// Sin respuesta del servidor (no hay internet, se cayó, o tardó demasiado).
// Un error con respuesta (400, 409…) es un "no" del servidor, no un corte.
export const esErrorDeRed = (e) => !!e && !e.response && e.code !== 'ERR_CANCELED';

// Lo que se puede vender sin internet: efectivo, para llevar, sin cliente,
// puntos ni cupón (eso necesita al servidor para validarse).
export const puedeSinConexion = (d) => d.tipo === 'llevar' && d.metodo_pago === 'efectivo'
  && !d.cliente_id && !(Number(d.puntos_canjear) > 0) && !d.cupon_codigo;

// Guarda cómo imprime esta caja (datos del negocio, impresora, ancho) a partir
// del último ticket que mandó el servidor, para armar el ticket sin internet.
export function guardarPlantilla(datosImpresion) {
  if (!datosImpresion) return;
  const quitarPedido = (x) => (x ? { ...x, pedido: undefined, numero_orden_diario: undefined, cambio: undefined, metodo_pago: undefined, partes: undefined, pago_parcial: undefined } : null);
  try {
    localStorage.setItem(CLAVE_PLANTILLA, JSON.stringify({ caja: quitarPedido(datosImpresion.caja), cocina: quitarPedido(datosImpresion.cocina) }));
  } catch { /* sin espacio: se vende igual, sin ticket */ }
}

function leerPlantilla() {
  try { return JSON.parse(localStorage.getItem(CLAVE_PLANTILLA)) || null; } catch { return null; }
}

// Número para llamar al cliente: S-1, S-2… por día y por caja ("S" de sin
// internet, para no confundirlo con los números que da el servidor).
function siguienteNumero() {
  const hoy = new Date().toLocaleDateString('en-CA');
  let n = 1;
  try {
    const g = JSON.parse(localStorage.getItem(CLAVE_NUMERO));
    if (g?.fecha === hoy) n = g.n + 1;
    localStorage.setItem(CLAVE_NUMERO, JSON.stringify({ fecha: hoy, n }));
  } catch { /* sin almacenamiento: S-1 */ }
  return `S-${n}`;
}

// Ticket con la misma forma que el que arma el servidor (ver _emitirImpresion).
function armarTicket({ numero, datos, lineas, total, neto, cambio, sucursal_id, vendido_en }) {
  const plantilla = leerPlantilla();
  if (!plantilla) return null;
  const pedido = {
    id: numero, tipo: 'llevar', numero_llevar: null, sucursal_id, estado: 'completado', sin_conexion: true,
    nombre_cliente: datos.nombre_cliente || 'Cliente', notas: datos.notas || null, creado_en: vendido_en,
    total, descuento: 0, propina: Number(datos.propina) || 0, metodo_pago: 'efectivo',
    monto_recibido: Number(datos.monto_recibido) || neto, cambio,
    detalles: lineas.map((l) => ({
      id: l.id, cantidad: l.cantidad, cantidad_anulada: 0, precio: l.precio, peso: l.peso ?? null, nota: l.nota || null,
      producto: l.combo_id ? null : { nombre: l.nombre, precio: l.peso ? l.precio / l.peso : l.precio },
      combo: l.combo_id ? { nombre: l.nombre, productos: [] } : null,
      opciones: l.detalle ? [{ nombre: l.detalle }] : [],
    })),
  };
  return {
    caja: plantilla.caja ? { ...plantilla.caja, pedido, metodo_pago: 'efectivo', cambio, numero_orden_diario: numero } : null,
    cocina: plantilla.cocina ? { ...plantilla.cocina, pedido, numero_orden_diario: numero } : null,
  };
}

/**
 * Cobra una venta. Si se puede vender sin internet, le pone su clave y, si el
 * servidor no responde, la guarda en la cola y devuelve una respuesta con la
 * misma forma que la del servidor (id, total, datos_impresion) más
 * `sin_conexion: true`.
 * `lineas` son las de la comanda (nombre, detalle, precio…) para el ticket.
 */
export async function cobrarConRespaldo(datos, { lineas, usuario_id, sucursal_id }) {
  if (!puedeSinConexion(datos)) {
    try {
      const r = await crearVentaCompleta(datos);
      guardarPlantilla(r?.datos_impresion);
      return r;
    } catch (e) {
      if (esErrorDeRed(e)) throw new Error('Sin internet solo se puede cobrar en efectivo y para llevar (sin cliente ni cupón).', { cause: e });
      throw e;
    }
  }
  const clave = nuevaClave();
  const conClave = { ...datos, clave_offline: clave };
  try {
    const r = await crearVentaCompleta(conClave, { timeout: ESPERA_MS });
    guardarPlantilla(r?.datos_impresion);
    return r;
  } catch (e) {
    if (!esErrorDeRed(e)) throw e;
  }

  const vendido_en = new Date().toISOString();
  const total = lineas.reduce((s, l) => s + l.precio * l.cantidad, 0);
  const neto = Math.max(0, total - (Number(datos.descuento) || 0) + (Number(datos.propina) || 0));
  const cambio = Math.max(0, (Number(datos.monto_recibido) || neto) - neto);
  const numero = siguienteNumero();
  useColaOffline.getState().agregar({
    clave, usuario_id, numero, total: neto, vendido_en,
    datos: { ...conClave, sin_conexion: true, vendido_en },
  });
  return {
    id: clave, numero, total, estado: 'completado', sin_conexion: true, vendido_en,
    datos_impresion: armarTicket({ numero, datos, lineas, total, neto, cambio, sucursal_id, vendido_en }),
  };
}

/**
 * Sube las ventas guardadas de este usuario, en orden. Se detiene si sigue
 * sin internet; si el servidor rechaza una, la deja marcada con el motivo y
 * sigue con las demás. Devuelve cuántas subió.
 */
export async function subirPendientes(usuario_id) {
  const cola = useColaOffline.getState();
  if (cola.subiendo) return 0;
  const mias = cola.ventas.filter((v) => v.usuario_id === usuario_id);
  if (!mias.length) return 0;
  cola.setSubiendo(true);
  let subidas = 0;
  try {
    for (const v of mias) {
      try {
        await crearVentaCompleta(v.datos, { timeout: ESPERA_MS });
        useColaOffline.getState().quitar(v.clave);
        subidas += 1;
      } catch (e) {
        if (esErrorDeRed(e)) break;
        useColaOffline.getState().marcarError(v.clave, errorDe(e));
      }
    }
  } finally {
    useColaOffline.getState().setSubiendo(false);
  }
  return subidas;
}
