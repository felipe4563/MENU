// Reportes en hoja carta: el mismo contenido sale como PDF (jsPDF) o como
// página para la impresora normal (ventana de impresión del navegador).
//
// Un reporte se describe así:
// {
//   titulo: 'Reporte de ventas',
//   rango: { desde: '2026-11-01', hasta: '2026-11-07' },
//   resumen: [{ etiqueta: 'Ventas netas', valor: 'Bs. 1.234,00' }, ...],
//   secciones: [{ titulo, columnas: [{ titulo, derecha? }], filas: [[...textos]], pie?: [...textos] }],
// }
import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import { imprimirHtml } from './imprimirHtml';
import { logoSrc } from '../api/configuracion';

const fechaLarga = (iso) => new Date(`${iso}T12:00`).toLocaleDateString('es-BO', { day: 'numeric', month: 'long', year: 'numeric' });
export const textoRango = ({ desde, hasta }) => (desde === hasta ? fechaLarga(desde) : `Del ${fechaLarga(desde)} al ${fechaLarga(hasta)}`);
const generado = () => new Date().toLocaleString('es-BO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const nombreArchivo = (def) => `${def.titulo}_${def.rango.desde}_${def.rango.hasta}`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9_-]+/g, '_');

// Logo como PNG en base64 (jsPDF no lee URLs). Si falla, el reporte sale sin logo.
async function logoDataUrl(cfg) {
  const url = logoSrc(cfg?.logo);
  if (!url) return null;
  try {
    const res = await fetch(url, { mode: 'cors' });
    const img = await createImageBitmap(await res.blob());
    const lado = 160;
    const escala = Math.min(lado / img.width, lado / img.height);
    const c = Object.assign(document.createElement('canvas'), { width: Math.round(img.width * escala), height: Math.round(img.height * escala) });
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return { data: c.toDataURL('image/png'), ancho: c.width, alto: c.height };
  } catch {
    return null;
  }
}

// Las fuentes base de jsPDF solo traen Latin-1: espacios finos, el signo
// menos tipográfico o las comillas curvas saldrían como basura.
const limpiar = (v) => String(v ?? '').replace(/[\u202f\u2009\u00a0]/g, ' ').replace(/\u2212/g, '-').replace(/[\u201c\u201d]/g, '"').replace(/[\u2018\u2019]/g, "'").replace(/\u2026/g, '...');

const TINTA = [24, 33, 38];
const TENUE = [110, 116, 120];
const ACENTO = [139, 0, 0];

export async function descargarPdf(def, cfg = {}) {
  const doc = new jsPDF({ unit: 'mm', format: 'letter' });
  const ancho = doc.internal.pageSize.getWidth();
  const M = 16;
  let y = M;

  const logo = await logoDataUrl(cfg);
  if (logo) {
    const h = 16;
    doc.addImage(logo.data, 'PNG', M, y, (logo.ancho / logo.alto) * h, h);
  }
  const x0 = logo ? M + 22 : M;
  doc.setTextColor(...TENUE).setFont('helvetica', 'normal').setFontSize(10).text(cfg.nombre_negocio || '', x0, y + 4);
  doc.setTextColor(...TINTA).setFont('helvetica', 'bold').setFontSize(18).text(def.titulo, x0, y + 11);
  doc.setTextColor(...TENUE).setFont('helvetica', 'normal').setFontSize(10).text(limpiar(textoRango(def.rango)), x0, y + 16.5);
  y += 24;
  doc.setDrawColor(...ACENTO).setLineWidth(0.6).line(M, y, ancho - M, y);
  y += 6;

  // Resumen en cajas de hasta 4 por fila.
  if (def.resumen?.length) {
    const porFila = Math.min(4, def.resumen.length);
    const gap = 3;
    const w = (ancho - 2 * M - gap * (porFila - 1)) / porFila;
    def.resumen.forEach((k, i) => {
      const col = i % porFila;
      if (i > 0 && col === 0) y += 19;
      const x = M + col * (w + gap);
      doc.setFillColor(244, 243, 239).roundedRect(x, y, w, 16, 2, 2, 'F');
      doc.setTextColor(...TENUE).setFontSize(8.5).setFont('helvetica', 'normal').text(limpiar(k.etiqueta), x + 3, y + 5.5);
      doc.setTextColor(...TINTA).setFontSize(13).setFont('helvetica', 'bold').text(limpiar(k.valor), x + 3, y + 12.5);
    });
    y += 24;
  }

  for (const s of def.secciones || []) {
    if (y > doc.internal.pageSize.getHeight() - 40) { doc.addPage(); y = M; }
    doc.setTextColor(...TINTA).setFontSize(12).setFont('helvetica', 'bold').text(s.titulo, M, y);
    y += 2;
    if (!s.filas.length) {
      doc.setTextColor(...TENUE).setFontSize(9.5).setFont('helvetica', 'normal').text(s.vacio || 'Sin datos en estas fechas.', M, y + 5);
      y += 13;
      continue;
    }
    const derecha = Object.fromEntries(s.columnas.map((c, i) => [i, c.derecha ? { halign: 'right' } : {}]));
    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M },
      head: [s.columnas.map((c) => c.titulo)],
      body: s.filas.map((f) => f.map(limpiar)),
      foot: s.pie ? [s.pie.map(limpiar)] : undefined,
      theme: 'plain',
      styles: { font: 'helvetica', fontSize: 9, textColor: TINTA, cellPadding: { top: 1.8, bottom: 1.8, left: 2, right: 2 } },
      headStyles: { textColor: TENUE, fontStyle: 'normal', fontSize: 8.5, lineWidth: { bottom: 0.3 }, lineColor: [200, 200, 195] },
      footStyles: { fontStyle: 'bold', lineWidth: { top: 0.3 }, lineColor: [200, 200, 195] },
      alternateRowStyles: { fillColor: [249, 248, 245] },
      columnStyles: derecha,
      didParseCell: (d) => { if ((d.section === 'head' || d.section === 'foot') && derecha[d.column.index]?.halign) d.cell.styles.halign = 'right'; },
    });
    y = doc.lastAutoTable.finalY + 10;
  }

  const paginas = doc.getNumberOfPages();
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i);
    const alto = doc.internal.pageSize.getHeight();
    doc.setTextColor(...TENUE).setFontSize(8).setFont('helvetica', 'normal');
    doc.text(`Generado el ${generado()}`, M, alto - 8);
    doc.text(`Página ${i} de ${paginas}`, ancho - M, alto - 8, { align: 'right' });
  }
  doc.save(`${nombreArchivo(def)}.pdf`);
}

const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export async function imprimirReporte(def, cfg = {}) {
  const logo = logoSrc(cfg?.logo);
  const tabla = (s) => {
    if (!s.filas.length) return `<p class="vacio">${esc(s.vacio || 'Sin datos en estas fechas.')}</p>`;
    const cls = (c) => (c.derecha ? ' class="der"' : '');
    return `<table><thead><tr>${s.columnas.map((c) => `<th${cls(c)}>${esc(c.titulo)}</th>`).join('')}</tr></thead>
      <tbody>${s.filas.map((f) => `<tr>${f.map((v, i) => `<td${cls(s.columnas[i])}>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody>
      ${s.pie ? `<tfoot><tr>${s.pie.map((v, i) => `<td${cls(s.columnas[i])}>${esc(v)}</td>`).join('')}</tr></tfoot>` : ''}</table>`;
  };
  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>${esc(def.titulo)}</title>
<style>
  @page { size: letter; margin: 14mm 14mm 16mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #182126; font-size: 10.5pt; margin: 0; }
  header { display: flex; gap: 14px; align-items: center; border-bottom: 2px solid #8b0000; padding-bottom: 10px; margin-bottom: 14px; }
  header img { width: 56px; height: 56px; object-fit: contain; }
  .negocio { color: #6e7478; font-size: 10pt; }
  h1 { font-size: 19pt; margin: 2px 0; }
  .rango { color: #6e7478; font-size: 10pt; }
  .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 16px; }
  .kpi { background: #f4f3ef; border-radius: 6px; padding: 8px 10px; }
  .kpi span { display: block; color: #6e7478; font-size: 8.5pt; }
  .kpi b { font-size: 13.5pt; }
  h2 { font-size: 12.5pt; margin: 16px 0 6px; break-after: avoid; }
  table { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
  thead { display: table-header-group; }
  th { text-align: left; color: #6e7478; font-weight: 400; border-bottom: 1px solid #c8c8c3; padding: 5px 6px; }
  td { padding: 4px 6px; border-bottom: 1px solid #ecebe6; }
  tr { break-inside: avoid; }
  tfoot td { font-weight: 700; border-top: 1px solid #c8c8c3; border-bottom: 0; }
  .der { text-align: right; font-variant-numeric: tabular-nums; }
  .vacio { color: #6e7478; }
  footer { margin-top: 18px; color: #6e7478; font-size: 8.5pt; }
</style></head><body>
<header>${logo ? `<img src="${esc(logo)}" alt="">` : ''}<div>
  <div class="negocio">${esc(cfg.nombre_negocio || '')}</div><h1>${esc(def.titulo)}</h1><div class="rango">${esc(textoRango(def.rango))}</div>
</div></header>
${def.resumen?.length ? `<div class="kpis">${def.resumen.map((k) => `<div class="kpi"><span>${esc(k.etiqueta)}</span><b>${esc(k.valor)}</b></div>`).join('')}</div>` : ''}
${(def.secciones || []).map((s) => `<h2>${esc(s.titulo)}</h2>${tabla(s)}`).join('')}
<footer>Generado el ${esc(generado())}</footer>
</body></html>`;
  imprimirHtml(html);
}
