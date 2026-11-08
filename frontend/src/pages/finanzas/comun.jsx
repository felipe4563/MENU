import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, FileDown, Loader2, Printer } from 'lucide-react';
import { Segmentado } from '../../components/ui/piezas';
import { avisar } from '../../components/ui/Aviso';
import { useConfig } from '../../hooks/useConfig';
import { descargarPdf, imprimirReporte } from '../../utils/reporteDocumento';
import { errorDe } from '../../lib/util';

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

// Botón "Exportar": PDF tamaño carta o imprimir en impresora normal.
// `armar` es async y devuelve la definición del reporte (ver reporteDocumento.js);
// trae todos los datos del rango, no solo la página que se ve.
export function BotonExportar({ armar, disabled }) {
  const { config } = useConfig();
  const [abierto, setAbierto] = useState(false);
  const [ocupado, setOcupado] = useState(null);
  const ref = useRef(null);
  useEffect(() => {
    if (!abierto) return undefined;
    const fuera = (e) => { if (!ref.current?.contains(e.target)) setAbierto(false); };
    const esc = (e) => { if (e.key === 'Escape') setAbierto(false); };
    document.addEventListener('pointerdown', fuera);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', fuera); document.removeEventListener('keydown', esc); };
  }, [abierto]);

  const hacer = async (que) => {
    setAbierto(false);
    setOcupado(que);
    try {
      const def = await armar();
      if (que === 'pdf') await descargarPdf(def, config);
      else await imprimirReporte(def, config);
    } catch (e) {
      avisar.error(errorDe(e, 'No se pudo armar el reporte.'));
    } finally { setOcupado(null); }
  };

  return (
    <div className="relative" ref={ref}>
      <button className="btn-borde h-9" disabled={disabled || !!ocupado} onClick={() => setAbierto(!abierto)} aria-haspopup="menu" aria-expanded={abierto}>
        {ocupado ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />} Exportar
      </button>
      {abierto && (
        <div role="menu" className="absolute right-0 z-30 mt-1.5 w-52 rounded-xl bg-papel border border-linea shadow-flota p-1 animate-entra">
          <button role="menuitem" className="w-full flex items-center gap-2.5 rounded-lg px-3 h-10 text-sm font-medium hover:bg-hundido" onClick={() => hacer('pdf')}><FileDown className="w-4 h-4" /> Descargar PDF</button>
          <button role="menuitem" className="w-full flex items-center gap-2.5 rounded-lg px-3 h-10 text-sm font-medium hover:bg-hundido" onClick={() => hacer('imprimir')}><Printer className="w-4 h-4" /> Imprimir</button>
        </div>
      )}
    </div>
  );
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
