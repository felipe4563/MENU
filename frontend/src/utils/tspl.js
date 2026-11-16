// Impresoras de etiquetas (Knaon Y813BT, Munbyn, iDPRT… las de 4×6): no
// entienden ESC/POS, el idioma de las impresoras de tickets, sino TSPL.
// Reciben los bytes de un ticket ESC/POS y no imprimen nada.
//
// Acá el ticket ESC/POS que arma escpos.js (texto, negrita, tamaño,
// alineación, logo, corte) se dibuja en el navegador y se manda como UNA
// imagen por página, con los mismos comandos que usa el driver oficial de
// Knaon (filtro rastertolabel): SIZE, GAP, REFERENCE, DENSITY, SPEED, CLS,
// BITMAP modo 1 y PRINT. Nada de TEXT, CODEPAGE ni BAR: las impresoras
// baratas solo entienden esa parte de TSPL y descartan el trabajo entero si
// llega un comando que no conocen. Como el ticket va dibujado, la ñ y las
// tildes salen perfectas en cualquier impresora.
// Cada dispositivo elige en Probar impresora si su impresora es TSPL y el
// papel que tiene (rollo continuo o etiquetas).
import { CODIFICACIONES } from './escpos';

const CLAVE = 'rusoft-impresora-lenguaje';
const DOTS_MM = 8; // 203 dpi
export const CONFIG_DEFECTO = {
  lenguaje: 'escpos', // 'escpos' | 'tspl'
  ancho_mm: 80,
  papel: 'continuo', // 'continuo' | 'etiqueta'
  alto_mm: 150, // alto de cada etiqueta
  gap_mm: 3, // separación entre etiquetas
  x_mm: 0, // correr el ticket a la derecha
  densidad: 8, // oscuridad 0–15
  velocidad: 4, // pulgadas por segundo
  girar: false, // dar vuelta la imagen 180°
  invertir: false, // si sale en negativo (fondo negro)
};

export function configImpresora() {
  try { return { ...CONFIG_DEFECTO, ...(JSON.parse(localStorage.getItem(CLAVE)) || {}) }; } catch { return { ...CONFIG_DEFECTO }; }
}
export function guardarConfigImpresora(cfg) {
  try { localStorage.setItem(CLAVE, JSON.stringify(cfg)); } catch { /* sin almacenamiento */ }
  window.dispatchEvent(new Event('impresora-bt'));
}

// ── Leer el ticket ESC/POS ────────────────────────────────────────────────

// Tabla de letras de ESC t n → byte → letra.
function inversa(escT) {
  const c = CODIFICACIONES.find((x) => x.escT === escT && x.mapa) ?? CODIFICACIONES[0];
  const m = {};
  Object.entries(c.mapa).forEach(([ch, b]) => { if (m[b] == null) m[b] = ch; });
  return m;
}

/**
 * Convierte los bytes ESC/POS en renglones:
 *   { tipo: 'texto', alinear, partes: [{ texto, negrita, ancho, alto }] }
 *   { tipo: 'imagen', alinear, anchoBytes, alto, datos }
 */
export function leerEscPos(bytes) {
  const renglones = [];
  let estado = { alinear: 0, negrita: false, ancho: 1, alto: 1 };
  let tabla = inversa(16);
  let actual = { tipo: 'texto', alinear: 0, partes: [] };
  const agregarLetra = (ch) => {
    const ult = actual.partes[actual.partes.length - 1];
    if (ult && ult.negrita === estado.negrita && ult.ancho === estado.ancho && ult.alto === estado.alto) ult.texto += ch;
    else actual.partes.push({ texto: ch, negrita: estado.negrita, ancho: estado.ancho, alto: estado.alto });
  };
  const cerrar = () => { actual.alinear = estado.alinear; renglones.push(actual); actual = { tipo: 'texto', alinear: estado.alinear, partes: [] }; };

  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (b === 0x1B) { // ESC
      const c = bytes[i + 1];
      if (c === 0x40) { estado = { alinear: 0, negrita: false, ancho: 1, alto: 1 }; i += 1; } // ESC @
      else if (c === 0x61) { estado.alinear = bytes[i + 2] & 3; i += 2; } // ESC a n
      else if (c === 0x45) { estado.negrita = !!bytes[i + 2]; i += 2; } // ESC E n
      else if (c === 0x74) { tabla = inversa(bytes[i + 2]); i += 2; } // ESC t n
      else if (c === 0x64) { for (let k = 0; k < bytes[i + 2]; k++) cerrar(); i += 2; } // ESC d n
      else i += 2;
    } else if (b === 0x1C) { i += 1; // FS . (modo chino) y otros FS de 2 bytes
    } else if (b === 0x1D) { // GS
      const c = bytes[i + 1];
      if (c === 0x21) { const n = bytes[i + 2]; estado.ancho = ((n >> 4) & 7) + 1; estado.alto = (n & 7) + 1; i += 2; } // GS ! n
      else if (c === 0x56) { i += bytes[i + 2] >= 0x41 ? 3 : 2; } // GS V (corte)
      else if (c === 0x76 && bytes[i + 2] === 0x30) { // GS v 0 (imagen)
        const anchoBytes = bytes[i + 4] | (bytes[i + 5] << 8);
        const alto = bytes[i + 6] | (bytes[i + 7] << 8);
        const datos = bytes.slice(i + 8, i + 8 + anchoBytes * alto);
        if (actual.partes.length) cerrar();
        renglones.push({ tipo: 'imagen', alinear: estado.alinear, anchoBytes, alto, datos });
        i += 7 + anchoBytes * alto;
      } else i += 2;
    } else if (b === 0x0A) { cerrar();
    } else if (b === 0x0D) { /* nada */
    } else if (b >= 0x20) {
      agregarLetra(b < 0x80 ? String.fromCharCode(b) : (tabla[b] ?? '?'));
    }
  }
  if (actual.partes.length) cerrar();
  // Los renglones vacíos del final (avance antes del corte) no hacen falta.
  while (renglones.length && renglones[renglones.length - 1].tipo === 'texto' && !renglones[renglones.length - 1].partes.length) renglones.pop();
  return renglones;
}


// ── Medidas ───────────────────────────────────────────────────────────────

const CELDA = { ancho: 12, alto: 22 }; // como la fuente A de ESC/POS (48 columnas en 72 mm)
const ESPACIO = 8; // entre renglones
const MARGEN = 16;
// Con rollo continuo: papel en blanco al final para cortarlo en la barra sin
// llevarse lo impreso.
const AVANCE_CORTE = 15 * 8;
const anchoTicketPx = (cfg) => (Number(cfg.ancho_mm) <= 58 ? 384 : 576); // 32 o 48 columnas
const altoRenglon = (r) => (r.tipo === 'imagen' ? r.alto + ESPACIO
  : (r.partes.length ? Math.max(...r.partes.map((p) => p.alto)) : 1) * CELDA.alto + ESPACIO);
const anchoRenglon = (r) => (r.tipo === 'imagen' ? r.anchoBytes * 8 : r.partes.reduce((s, p) => s + [...p.texto].length * CELDA.ancho * p.ancho, 0));
const xInicio = (r, ancho) => {
  const w = anchoRenglon(r);
  return r.alinear === 1 ? Math.max(0, Math.round((ancho - w) / 2)) : r.alinear === 2 ? Math.max(0, ancho - w) : 0;
};
const anchoPapelPx = (cfg) => Math.round(Number(cfg.ancho_mm) * DOTS_MM);

// Reparte los renglones en páginas (una etiqueta cada una; con rollo
// continuo, una sola página del largo del ticket).
function paginas(renglones, cfg) {
  if (cfg.papel !== 'etiqueta') {
    return [{ alto: renglones.reduce((s, r) => s + altoRenglon(r), 0) + MARGEN * 2, renglones }];
  }
  const altoPag = Math.round(Number(cfg.alto_mm) * DOTS_MM);
  const lista = [];
  // `alto` es el de la etiqueta (lo que avanza el papel); `contenido`, lo
  // que ocupa lo impreso: la imagen se manda solo de ese alto, para no
  // mandar una etiqueta de 15 cm entera por Bluetooth.
  let pag = { alto: altoPag, renglones: [] };
  let y = MARGEN;
  for (const r of renglones) {
    const h = altoRenglon(r);
    if (y + h > altoPag - MARGEN && pag.renglones.length) { lista.push({ ...pag, contenido: y + MARGEN }); pag = { alto: altoPag, renglones: [] }; y = MARGEN; }
    pag.renglones.push(r);
    y += h;
  }
  lista.push({ ...pag, contenido: Math.min(altoPag, y + MARGEN) });
  return lista;
}

// ── Dibujar ───────────────────────────────────────────────────────────────

function lienzo(ancho, alto) {
  const c = document.createElement('canvas');
  c.width = ancho;
  c.height = alto;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, ancho, alto);
  ctx.fillStyle = '#000';
  ctx.strokeStyle = '#000';
  ctx.textBaseline = 'top';
  return { c, ctx };
}

function dibujarPagina(pag, cfg) {
  const anchoPapel = anchoPapelPx(cfg);
  const anchoTicket = Math.min(anchoTicketPx(cfg), anchoPapel);
  // El ticket va centrado en el papel, más lo que se haya corrido a mano.
  const dx = Math.round((anchoPapel - anchoTicket) / 2 + Number(cfg.x_mm || 0) * DOTS_MM);
  const { c, ctx } = lienzo(anchoPapel, pag.contenido ?? pag.alto);
  let y = MARGEN;
  for (const r of pag.renglones) {
    let x = dx + xInicio(r, anchoTicket);
    if (r.tipo === 'imagen') {
      const img = ctx.createImageData(r.anchoBytes * 8, r.alto);
      for (let fila = 0; fila < r.alto; fila++) {
        for (let col = 0; col < r.anchoBytes * 8; col++) {
          const negro = (r.datos[fila * r.anchoBytes + (col >> 3)] >> (7 - (col & 7))) & 1;
          const k = (fila * r.anchoBytes * 8 + col) * 4;
          img.data[k] = img.data[k + 1] = img.data[k + 2] = negro ? 0 : 255;
          img.data[k + 3] = 255;
        }
      }
      ctx.putImageData(img, x, y);
    } else {
      const altoMax = r.partes.length ? Math.max(...r.partes.map((p) => p.alto)) : 1;
      for (const p of r.partes) {
        // Courier mide 0,6 de su alto de ancho: a 20 px, 12 de ancho. Con
        // doble alto se escala a lo ancho para que siga la celda.
        ctx.font = (p.negrita ? 'bold ' : '') + (20 * p.alto) + 'px "Courier New", monospace';
        const yp = y + (altoMax - p.alto) * CELDA.alto + 1;
        for (const ch of p.texto) {
          ctx.setTransform(p.ancho / p.alto, 0, 0, 1, x, yp);
          ctx.fillText(ch, 0, 0);
          x += CELDA.ancho * p.ancho;
        }
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      }
    }
    y += altoRenglon(r);
  }
  return c;
}

// ── TSPL ──────────────────────────────────────────────────────────────────

const ascii = (s) => Array.from(s, (ch) => ch.charCodeAt(0) & 0xFF);

// Canvas → una página TSPL, igual que el driver oficial: BITMAP modo 1 con
// 1 = blanco y 0 = punto negro (al revés que ESC/POS; probado con la Knaon
// Y813BT, que con 1 = negro sacaba el ticket en negativo). `invertir` lo da
// vuelta para la impresora que lo tome al revés. `girar` da vuelta la imagen
// acá (el driver no usa DIRECTION).
//
// Para que pese poco por Bluetooth (las impresoras baratas cortan la conexión
// si les llega un trabajo muy grande), no se manda la página entera: se
// manda una imagen por cada franja con tinta (un renglón, el logo…),
// recortada a lo que ocupa a lo ancho. Lo blanco no viaja.
const ALTO_MAX_FRANJA = 96;
function paginaTspl(canvas, cfg, altoPapel = canvas.height) {
  const { width: ancho, height: alto } = canvas;
  const anchoBytes = Math.ceil(ancho / 8);
  const px = canvas.getContext('2d').getImageData(0, 0, ancho, alto).data;
  const tinta = new Uint8Array(anchoBytes * alto); // 1 = punto negro
  const filaConTinta = new Uint8Array(alto);
  for (let fila = 0; fila < alto; fila++) {
    const f = cfg.girar ? alto - 1 - fila : fila;
    for (let col = 0; col < ancho; col++) {
      const cc = cfg.girar ? ancho - 1 - col : col;
      if (px[(f * ancho + cc) * 4] < 190) {
        tinta[fila * anchoBytes + (col >> 3)] |= 0x80 >> (col & 7);
        filaConTinta[fila] = 1;
      }
    }
  }
  const gap = cfg.papel === 'etiqueta' ? 'GAP ' + (Number(cfg.gap_mm) || 0) + ' mm,0 mm' : 'GAP 0 mm,0 mm';
  const partes = [Uint8Array.from(ascii([
    'SIZE ' + Math.round(ancho / DOTS_MM) + ' mm,' + Math.ceil(altoPapel / DOTS_MM) + ' mm', gap, 'REFERENCE 0,0',
    'DENSITY ' + cfg.densidad, 'SPEED ' + cfg.velocidad, 'CLS', '',
  ].join('\r\n')))];

  let fila = 0;
  while (fila < alto) {
    if (!filaConTinta[fila]) { fila++; continue; }
    let fin = fila;
    while (fin < alto && filaConTinta[fin] && fin - fila < ALTO_MAX_FRANJA) fin++;
    let b0 = anchoBytes;
    let b1 = -1;
    for (let r = fila; r < fin; r++) {
      for (let b = 0; b < anchoBytes; b++) {
        if (tinta[r * anchoBytes + b]) { if (b < b0) b0 = b; if (b > b1) b1 = b; }
      }
    }
    const w = b1 - b0 + 1;
    const h = fin - fila;
    const datos = new Uint8Array(w * h);
    for (let r = 0; r < h; r++) {
      for (let b = 0; b < w; b++) {
        const v = tinta[(fila + r) * anchoBytes + b0 + b];
        datos[r * w + b] = cfg.invertir ? v : (~v) & 0xFF;
      }
    }
    partes.push(Uint8Array.from(ascii('BITMAP ' + (b0 * 8) + ',' + fila + ',' + w + ',' + h + ',1,')), datos, Uint8Array.from(ascii('\r\n')));
    fila = fin;
  }
  partes.push(Uint8Array.from(ascii('PRINT 1,1\r\n')));
  const total = partes.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let k = 0;
  for (const p of partes) { out.set(p, k); k += p.length; }
  return out;
}

/** Traduce un ticket ESC/POS a un trabajo TSPL (una imagen por página). */
export function escPosATspl(bytes, cfg = configImpresora()) {
  const renglones = leerEscPos(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
  const trabajos = paginas(renglones, cfg).map((pag) => paginaTspl(dibujarPagina(pag, cfg), cfg, cfg.papel === 'etiqueta' ? pag.alto : pag.alto + AVANCE_CORTE));
  const out = new Uint8Array(trabajos.reduce((s, t) => s + t.length, 0));
  let k = 0;
  for (const t of trabajos) { out.set(t, k); k += t.length; }
  return out;
}

/** Lo que hay que mandarle a la impresora de este dispositivo. */
export function bytesParaImpresora(bytes, cfg = configImpresora()) {
  return cfg.lenguaje === 'tspl' ? escPosATspl(bytes, cfg) : bytes;
}

/**
 * Etiqueta de prueba corta (3 cm), dibujada: marco, PRUEBA y el título (p. ej.
 * el número de canal). Si la impresora habla TSPL sale algo visible aunque
 * los colores estén al revés (sale negra con letras blancas).
 */
export function pruebaTsplSimple(titulo, cfg = configImpresora()) {
  const ancho = anchoPapelPx(cfg);
  const alto = 30 * DOTS_MM;
  const { c, ctx } = lienzo(ancho, alto);
  ctx.lineWidth = 6;
  ctx.strokeRect(12, 12, ancho - 24, alto - 24);
  ctx.font = 'bold 56px Arial, sans-serif';
  ctx.fillText('PRUEBA', 32, 36);
  ctx.font = 'bold 40px Arial, sans-serif';
  ctx.fillText(String(titulo), 32, 110);
  ctx.font = '24px Arial, sans-serif';
  ctx.fillText('Si lees esto, la impresora entiende TSPL', 32, 180);
  // Con etiquetas se declara la etiqueta entera: avanza justo hasta la
  // siguiente y la impresora no pierde la cuenta del papel.
  return (paginaTspl(c, cfg, cfg.papel === 'etiqueta' ? Math.round(Number(cfg.alto_mm) * DOTS_MM) : alto + AVANCE_CORTE));
}
