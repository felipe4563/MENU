import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CloudUpload, WifiOff, AlertTriangle } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { usePermisos } from '../../hooks/usePermisos';
import { useMoneda } from '../../hooks/useConfig';
import { useEnLinea } from '../../hooks/useEnLinea';
import { subirPendientes, useColaOffline } from '../../lib/ventasOffline';
import Hoja from '../ui/Hoja';
import { useConfirmar } from '../ui/piezas';
import { avisar } from '../ui/Aviso';
import { dinero, hora } from '../../lib/util';

const CADA_MS = 20000;

// Aviso de "sin internet" y de las ventas guardadas en esta caja que faltan
// subir. Las sube solo: al volver la conexión y cada 20 s mientras queden.
export default function VentasSinConexion() {
  const qc = useQueryClient();
  const moneda = useMoneda();
  const enLinea = useEnLinea();
  const { tiene } = usePermisos();
  const usuarioId = useAuthStore((s) => s.usuario?.id);
  const todas = useColaOffline((s) => s.ventas);
  const subiendo = useColaOffline((s) => s.subiendo);
  const quitar = useColaOffline((s) => s.quitar);
  const mias = todas.filter((v) => v.usuario_id === usuarioId);
  const [ver, setVer] = useState(false);
  const [confirmacion, confirmar] = useConfirmar();

  const subir = async ({ manual = false } = {}) => {
    const n = await subirPendientes(usuarioId);
    if (n > 0) {
      avisar.ok(n === 1 ? 'Se subió la venta hecha sin internet' : `Se subieron ${n} ventas hechas sin internet`);
      qc.invalidateQueries({ queryKey: ['ventas'] });
      qc.invalidateQueries({ queryKey: ['caja-estado'] });
      qc.invalidateQueries({ queryKey: ['caja'] });
    } else if (manual && useColaOffline.getState().ventas.some((v) => v.usuario_id === usuarioId && !v.error)) {
      avisar.error('Todavía no hay conexión con el servidor.');
    }
  };

  const hayPendientes = mias.length > 0;
  useEffect(() => {
    if (!usuarioId || !hayPendientes) return undefined;
    subir();
    const t = setInterval(() => subir(), CADA_MS);
    window.addEventListener('online', subir);
    return () => { clearInterval(t); window.removeEventListener('online', subir); };
  }, [usuarioId, hayPendientes]); // eslint-disable-line react-hooks/exhaustive-deps

  if (enLinea && !hayPendientes) return null;
  const conError = mias.filter((v) => v.error).length;
  const totalMias = mias.reduce((s, v) => s + Number(v.total || 0), 0);

  return (
    <>
      {!enLinea ? (
        <div className="bg-locoto text-white text-[13px] text-center py-1.5 px-4 flex items-center justify-center gap-2 flex-wrap">
          <WifiOff className="w-4 h-4" />
          {tiene('ventas', 'crear')
            ? 'Sin internet. Puedes seguir cobrando en efectivo y para llevar: se sube solo cuando vuelva la conexión.'
            : 'Sin conexión. Puedes ver el menú, pero no se registran cambios hasta que vuelva el internet.'}
          {hayPendientes && <button className="underline underline-offset-2 font-semibold" onClick={() => setVer(true)}>{mias.length} por subir</button>}
        </div>
      ) : (
        <button onClick={() => setVer(true)} className="w-full bg-aji/15 text-tinta text-[13px] py-1.5 px-4 flex items-center justify-center gap-2">
          {conError ? <AlertTriangle className="w-4 h-4 text-locoto" /> : <CloudUpload className="w-4 h-4" />}
          {subiendo ? 'Subiendo ventas hechas sin internet…'
            : `${mias.length} ${mias.length === 1 ? 'venta hecha' : 'ventas hechas'} sin internet por subir${conError ? ` · ${conError} con problema` : ''}`}
          <span className="underline underline-offset-2 font-semibold">Ver</span>
        </button>
      )}

      {ver && (
        <Hoja onCerrar={() => setVer(false)} titulo="Ventas sin internet por subir" subtitulo={`${mias.length} en esta caja · ${dinero(totalMias, moneda)}`} ancho="max-w-md"
          pie={<button data-principal className="btn-aji w-full" disabled={subiendo || !mias.length} onClick={() => subir({ manual: true })}><CloudUpload className="w-4 h-4" /> {subiendo ? 'Subiendo…' : 'Subir ahora'}</button>}>
          {mias.length === 0 ? <p className="text-sm text-tenue py-6 text-center">Ya se subieron todas.</p> : (
            <ul className="divide-y divide-linea">
              {mias.map((v) => (
                <li key={v.clave} className="py-3">
                  <div className="flex items-center gap-3">
                    <span className="num font-bold w-12">{v.numero}</span>
                    <span className="text-sm text-tenue flex-1">{hora(v.vendido_en)} · {v.datos.items.length} {v.datos.items.length === 1 ? 'producto' : 'productos'}</span>
                    <span className="num font-semibold">{dinero(v.total, moneda)}</span>
                  </div>
                  {v.error && (
                    <div className="mt-2 rounded-lg bg-locoto/10 text-locoto text-sm px-3 py-2 flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                      <p className="flex-1">El servidor no la aceptó: {v.error}</p>
                      <button className="font-semibold underline underline-offset-2" onClick={async () => {
                        if (await confirmar({
                          titulo: `¿Quitar la venta ${v.numero}?`,
                          texto: `No se va a registrar en el sistema. Anota a mano los ${dinero(v.total, moneda)} cobrados para el arqueo.`,
                          confirmar: 'Quitar', peligro: true,
                        })) quitar(v.clave);
                      }}>Quitar</button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Hoja>
      )}
      {confirmacion}
    </>
  );
}
