import { useRef, useState } from 'react';
import { ImagePlus, Loader2, X } from 'lucide-react';
import api from '../../api/cliente';
import { BASE_URL } from '../../api/configuracion';
import { cx, errorDe } from '../../lib/util';
import { avisar } from './Aviso';

export const urlImagen = (ruta) => (!ruta ? null : /^https?:/.test(ruta) ? ruta : `${BASE_URL}${ruta}`);

// El QR de cobro llega como imagen embebida (CodePay, Banco Económico) o como
// ruta subida (QR propio del negocio).
export const srcQr = (codigo) => (!codigo || /^data:/.test(codigo) ? codigo : urlImagen(codigo));

// Sube a /uploads/imagen y devuelve la ruta relativa.
export function SubirImagen({ valor, onCambio, className, redonda }) {
  const ref = useRef(null);
  const [subiendo, setSubiendo] = useState(false);
  const elegir = async (archivo) => {
    if (!archivo) return;
    if (archivo.size > 5 * 1024 * 1024) return avisar.error('La imagen pesa más de 5 MB. Usa una más liviana.');
    setSubiendo(true);
    try {
      const fd = new FormData();
      fd.append('imagen', archivo);
      const { data } = await api.post('/uploads/imagen', fd);
      onCambio(data.datos.url);
    } catch (e) {
      avisar.error(errorDe(e, 'No se pudo subir la imagen.'));
    } finally {
      setSubiendo(false);
    }
  };
  const src = urlImagen(valor);
  return (
    <div className={cx('relative group', className)}>
      <button
        type="button"
        onClick={() => ref.current?.click()}
        className={cx('w-full h-full border-2 border-dashed border-linea bg-hundido overflow-hidden grid place-items-center text-tenue hover:border-tenue transition', redonda ? 'rounded-full' : 'rounded-2xl')}
      >
        {subiendo ? <Loader2 className="w-6 h-6 animate-spin" /> : src ? <img src={src} alt="" className="w-full h-full object-cover" /> : (
          <span className="flex flex-col items-center gap-1 text-xs font-medium"><ImagePlus className="w-6 h-6" /> Subir foto</span>
        )}
      </button>
      {src && !subiendo && (
        <button type="button" onClick={() => onCambio(null)} className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-tinta text-fondo grid place-items-center shadow" aria-label="Quitar imagen">
          <X className="w-4 h-4" />
        </button>
      )}
      <input ref={ref} type="file" accept="image/*" hidden onChange={(e) => { elegir(e.target.files?.[0]); e.target.value = ''; }} />
    </div>
  );
}

const DIAS = [['1', 'L'], ['2', 'M'], ['3', 'X'], ['4', 'J'], ['5', 'V'], ['6', 'S'], ['0', 'D']];

// dias_semana como CSV "1,2,3" (0 = domingo). Vacío = todos los días.
export function SelectorDias({ valor, onCambio }) {
  const sel = new Set((valor || '').split(',').filter(Boolean));
  const tocar = (d) => {
    const s = new Set(sel);
    if (s.has(d)) s.delete(d); else s.add(d);
    onCambio([...s].sort().join(',') || null);
  };
  return (
    <div>
      <div className="flex gap-1.5">
        {DIAS.map(([d, t]) => (
          <button key={d} type="button" onClick={() => tocar(d)} className={cx('w-10 h-10 rounded-full font-semibold text-sm border', sel.has(d) ? 'bg-tinta text-fondo border-tinta' : 'border-linea text-tenue')}>{t}</button>
        ))}
      </div>
      <p className="text-[13px] text-tenue mt-1.5">{sel.size === 0 ? 'Todos los días' : 'Solo los días marcados'}</p>
    </div>
  );
}

export const numero = (v) => v.replace(',', '.').replace(/[^\d.]/g, '');

// Atajo para inputs controlados sobre un objeto.
export function useCampos(inicial) {
  const [f, setF] = useState(inicial);
  const campo = (k, transformar) => ({
    value: f[k] ?? '',
    onChange: (e) => setF((x) => ({ ...x, [k]: transformar ? transformar(e.target.value) : e.target.value })),
  });
  const poner = (k, v) => setF((x) => ({ ...x, [k]: v }));
  return { f, setF, campo, poner };
}
