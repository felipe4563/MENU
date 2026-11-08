// Convierte el logo del negocio (imagen normal — PNG/JPG) a un bitmap
// monocromo en el formato que espera el comando ESC/POS "GS v 0" (raster bit
// image), para poder imprimirlo con Esc.imagen() en escpos.js. Solo hace
// falta para el canal Bluetooth: la impresora física ya recibe el ticket
// armado por print-agent/agent.js, que no imprime logo (queda fuera de este
// cambio — se puede agregar ahí después con el mismo criterio si hace falta).

// Se descarga con fetch (no con <img crossOrigin>): si el mismo logo ya se
// mostró en la página como <img> normal, Chrome puede reusar esa copia sin
// permiso CORS y el canvas queda "contaminado" — el ticket salía sin logo y
// sin avisar.
async function cargarImagen(url) {
  const res = await fetch(url, { mode: 'cors', cache: 'no-cache' });
  if (!res.ok) throw new Error(`No se pudo descargar el logo (${res.status}).`);
  const img = await createImageBitmap(await res.blob());
  return img;
}

// Encaja el logo dentro de un cuadro de `maxAnchoPx` x `maxAltoPx` sin
// deformarlo (mismo criterio "object-fit: contain"): antes solo se limitaba
// el ancho y la altura salía proporcional al original, así que un logo
// panorámico terminaba ocupando todo el ancho del papel en vez de un tamaño
// chico arriba del ticket. `anchoFinal` se redondea hacia abajo al múltiplo
// de 8 más cercano — el formato raster empaqueta 8 píxeles por byte, una
// fila no puede terminar a mitad de byte.
export async function logoAEscPos(url, maxAnchoPx = 240, maxAltoPx = 240, umbral = 160) {
  const img = await cargarImagen(url);
  const escala = Math.min(maxAnchoPx / img.width, maxAltoPx / img.height, 1);
  const anchoBytes = Math.max(1, Math.floor((img.width * escala) / 8));
  const anchoFinal = anchoBytes * 8;
  const altoPx = Math.max(1, Math.round(img.height * (anchoFinal / img.width)));

  const canvas = document.createElement('canvas');
  canvas.width = anchoFinal;
  canvas.height = altoPx;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, anchoFinal, altoPx);
  ctx.drawImage(img, 0, 0, anchoFinal, altoPx);
  const { data } = ctx.getImageData(0, 0, anchoFinal, altoPx);

  const datos = new Uint8Array(anchoBytes * altoPx);
  for (let y = 0; y < altoPx; y++) {
    for (let xByte = 0; xByte < anchoBytes; xByte++) {
      let byte = 0;
      for (let bit = 0; bit < 8; bit++) {
        const x = xByte * 8 + bit;
        const idx = (y * anchoFinal + x) * 4;
        const gris = data[idx] * 0.3 + data[idx + 1] * 0.59 + data[idx + 2] * 0.11;
        const esOpaco = data[idx + 3] > 128;
        // 1 = imprime el punto (oscuro); umbral simple, sin difuminado —
        // suficiente para un logo de línea simple, no para fotos con degradé.
        if (esOpaco && gris < umbral) byte |= (0x80 >> bit);
      }
      datos[y * anchoBytes + xByte] = byte;
    }
  }
  return { anchoBytes, alto: altoPx, datos };
}
