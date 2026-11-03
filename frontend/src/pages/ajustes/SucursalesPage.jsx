import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Building2, Pencil, MapPin, LocateFixed } from 'lucide-react';
import { getSucursales, crearSucursal, actualizarSucursal } from '../../api/sucursales';
import { usePermisos } from '../../hooks/usePermisos';
import Hoja from '../../components/ui/Hoja';
import { Cargando, Campo, Encabezado, Interruptor, Pagina, SinPermiso, Vacio, Insignia } from '../../components/ui/piezas';
import { useCampos, numero } from '../../components/ui/formulario';
import { OpcionTarjeta } from './comun';
import { avisar } from '../../components/ui/Aviso';
import { errorDe } from '../../lib/util';

function HojaSucursal({ s, onCerrar }) {
  const qc = useQueryClient();
  const { f, campo, poner } = useCampos({
    nombre: s?.nombre ?? '', direccion: s?.direccion ?? '', telefono: s?.telefono ?? '',
    latitud: s?.latitud ?? '', longitud: s?.longitud ?? '', radio_geocerca_metros: String(s?.radio_geocerca_metros ?? 150),
    modo_cierre_caja: s?.modo_cierre_caja ?? 'directo', tolerancia_cierre_caja: String(Number(s?.tolerancia_cierre_caja ?? 10)),
    activo: s ? !!s.activo : true,
  });
  const ubicar = () => navigator.geolocation?.getCurrentPosition(
    (p) => { poner('latitud', p.coords.latitude.toFixed(7)); poner('longitud', p.coords.longitude.toFixed(7)); },
    () => avisar.error('No se pudo obtener la ubicación. Revisa el permiso del navegador.'),
  );
  const guardar = useMutation({
    mutationFn: () => {
      const d = { ...f, nombre: f.nombre.trim(), latitud: f.latitud || null, longitud: f.longitud || null, radio_geocerca_metros: Number(f.radio_geocerca_metros || 150), tolerancia_cierre_caja: Number(f.tolerancia_cierre_caja || 0), activo: f.activo ? 1 : 0 };
      return s ? actualizarSucursal(s.id, d) : crearSucursal(d);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sucursales'] }); avisar.ok('Sucursal guardada'); onCerrar(); },
    onError: (e) => avisar.error(errorDe(e)),
  });
  return (
    <Hoja onCerrar={onCerrar} titulo={s ? s.nombre : 'Nueva sucursal'} ancho="max-w-2xl"
      pie={<><button className="btn-suave" onClick={onCerrar}>Cancelar</button><button data-principal className="btn-aji" disabled={!f.nombre.trim() || guardar.isPending} onClick={() => guardar.mutate()}>Guardar</button></>}>
      <div className="space-y-4">
        <Campo etiqueta="Nombre"><input className="campo" autoFocus={!s} {...campo('nombre')} /></Campo>
        <div className="grid sm:grid-cols-2 gap-3">
          <Campo etiqueta="Dirección"><input className="campo" {...campo('direccion')} /></Campo>
          <Campo etiqueta="Teléfono"><input className="campo" {...campo('telefono')} /></Campo>
        </div>
        <div>
          <span className="etiqueta">Ubicación (para marcar asistencia)</span>
          <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
            <input className="campo num" placeholder="Latitud" {...campo('latitud', numero)} />
            <input className="campo num" placeholder="Longitud" {...campo('longitud', (v) => v.replace(/[^\d.-]/g, ''))} />
            <button className="btn-borde" onClick={ubicar} type="button"><LocateFixed className="w-4 h-4" /> Aquí</button>
          </div>
          <div className="flex items-center gap-2 mt-2 text-sm"><span className="text-tenue">El personal debe estar a menos de</span><input className="campo w-20 h-9 num" {...campo('radio_geocerca_metros', (v) => v.replace(/\D/g, ''))} /><span className="text-tenue">metros</span></div>
        </div>
        <div>
          <span className="etiqueta">Cierre de caja</span>
          <div className="grid sm:grid-cols-2 gap-2">
            <OpcionTarjeta activa={f.modo_cierre_caja === 'directo'} onClick={() => poner('modo_cierre_caja', 'directo')} titulo="Directo" texto="El cajero ve cuánto debería haber mientras cuenta." />
            <OpcionTarjeta activa={f.modo_cierre_caja === 'ciego'} onClick={() => poner('modo_cierre_caja', 'ciego')} titulo="Ciego" texto="Cuenta sin ver el esperado. Más seguro contra faltantes." />
          </div>
          <div className="flex items-center gap-2 mt-2 text-sm"><span className="text-tenue">Diferencia aceptada sin pedir motivo:</span><input className="campo w-24 h-9 num" inputMode="decimal" {...campo('tolerancia_cierre_caja', numero)} /></div>
        </div>
        {s && <Interruptor activo={f.activo} onCambio={(v) => poner('activo', v)} etiqueta="Sucursal activa" />}
      </div>
    </Hoja>
  );
}

export default function SucursalesPage() {
  const { tiene } = usePermisos();
  const [editar, setEditar] = useState(null);
  const q = useQuery({ queryKey: ['sucursales'], queryFn: getSucursales, enabled: tiene('sucursales', 'ver') });
  if (!tiene('sucursales', 'ver')) return <SinPermiso />;
  return (
    <Pagina>
      <Encabezado titulo="Sucursales" texto="Cada sucursal tiene sus cajas, mesas y stock."
        acciones={tiene('sucursales', 'crear') && <button className="btn-aji" onClick={() => setEditar('nueva')}><Plus className="w-4 h-4" /> Nueva sucursal</button>} />
      {q.isLoading ? <Cargando /> : (q.data ?? []).length === 0 ? <Vacio Icono={Building2} titulo="Sin sucursales" /> : (
        <ul className="ficha divide-y divide-linea">
          {q.data.map((s) => (
            <li key={s.id} className="flex items-center gap-3 px-4 py-3.5">
              <span className="w-10 h-10 rounded-xl bg-hundido grid place-items-center"><Building2 className="w-5 h-5" /></span>
              <div className="flex-1 min-w-0">
                <p className="font-semibold">{s.nombre}</p>
                <p className="text-xs text-tenue truncate flex items-center gap-1">{s.direccion && <><MapPin className="w-3 h-3" /> {s.direccion}</>} {s.telefono && `· ${s.telefono}`}</p>
              </div>
              <Insignia>{s.modo_cierre_caja === 'ciego' ? 'Cierre ciego' : 'Cierre directo'}</Insignia>
              {!s.activo && <Insignia tono="peligro">Inactiva</Insignia>}
              {tiene('sucursales', 'editar') && <button className="btn-icono btn-fantasma" onClick={() => setEditar(s)} aria-label="Editar"><Pencil className="w-4 h-4" /></button>}
            </li>
          ))}
        </ul>
      )}
      {editar && <HojaSucursal s={editar === 'nueva' ? null : editar} onCerrar={() => setEditar(null)} />}
    </Pagina>
  );
}
