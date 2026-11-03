import { useState } from 'react';
import { ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { Segmentado } from '../../components/ui/piezas';

const iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

export function rangoDe(preset) {
  const hoy = new Date();
  if (preset === 'hoy') return { desde: iso(hoy), hasta: iso(hoy) };
  if (preset === 'ayer') { const a = new Date(Date.now() - 86400000); return { desde: iso(a), hasta: iso(a) }; }
  if (preset === '7d') return { desde: iso(new Date(Date.now() - 6 * 86400000)), hasta: iso(hoy) };
  if (preset === 'mes') return { desde: iso(new Date(hoy.getFullYear(), hoy.getMonth(), 1)), hasta: iso(hoy) };
  if (preset === 'mes_ant') return { desde: iso(new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1)), hasta: iso(new Date(hoy.getFullYear(), hoy.getMonth(), 0)) };
  return null;
}

export function useRango(inicial = '7d') {
  const [preset, setPreset] = useState(inicial);
  const [manual, setManual] = useState(rangoDe(inicial));
  const rango = preset === 'otro' ? manual : rangoDe(preset);
  return { preset, setPreset: (p) => { if (p === 'otro') setManual(rango); setPreset(p); }, rango, setManual };
}

export function SelectorRango({ r }) {
  return (
    <div className="flex flex-wrap gap-2 items-center">
      <Segmentado tamano="sm" valor={r.preset} onCambio={r.setPreset} opciones={[
        { valor: 'hoy', etiqueta: 'Hoy' }, { valor: 'ayer', etiqueta: 'Ayer' }, { valor: '7d', etiqueta: '7 días' },
        { valor: 'mes', etiqueta: 'Este mes' }, { valor: 'mes_ant', etiqueta: 'Mes pasado' }, { valor: 'otro', etiqueta: 'Elegir' },
      ]} />
      {r.preset === 'otro' && (
        <div className="flex items-center gap-1.5">
          <input type="date" className="campo h-9 w-auto" value={r.rango.desde} onChange={(e) => r.setManual({ ...r.rango, desde: e.target.value })} />
          <span className="text-tenue">a</span>
          <input type="date" className="campo h-9 w-auto" value={r.rango.hasta} onChange={(e) => r.setManual({ ...r.rango, hasta: e.target.value })} />
        </div>
      )}
    </div>
  );
}

// Descarga filas como CSV que Excel abre bien (separador ; y BOM).
export function exportarCsv(nombre, columnas, filas) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [columnas.map((c) => esc(c.titulo)).join(';'), ...filas.map((f) => columnas.map((c) => esc(c.valor(f))).join(';'))].join('\r\n');
  const url = URL.createObjectURL(new Blob([String.fromCharCode(0xfeff) + csv], { type: 'text/csv;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: `${nombre}.csv` });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function BotonCsv({ onClick, disabled }) {
  return <button className="btn-borde h-9" onClick={onClick} disabled={disabled}><Download className="w-4 h-4" /> Excel</button>;
}

export function Paginador({ pagina, total, onCambio }) {
  if (!total || total <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-3 mt-4">
      <button className="btn-icono btn-borde" disabled={pagina <= 1} onClick={() => onCambio(pagina - 1)} aria-label="Anterior"><ChevronLeft className="w-4 h-4" /></button>
      <span className="text-sm num">{pagina} de {total}</span>
      <button className="btn-icono btn-borde" disabled={pagina >= total} onClick={() => onCambio(pagina + 1)} aria-label="Siguiente"><ChevronRight className="w-4 h-4" /></button>
    </div>
  );
}
