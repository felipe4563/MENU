import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Building2, Plus, Pencil, Trash2, AlertCircle, RefreshCw } from 'lucide-react';
import { getSucursales, crearSucursal, actualizarSucursal, eliminarSucursal } from '../../api/sucursales';
import { usePermisos } from '../../hooks/usePermisos';
import Modal from '../../components/ui/Modal';

function BadgeEstado({ activo }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${activo ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'}`}>
      {activo ? 'Activa' : 'Inactiva'}
    </span>
  );
}

export default function SucursalesPage() {
  const { tienePermiso } = usePermisos();
  const qc = useQueryClient();

  const puedeVer      = tienePermiso('sucursales', 'ver');
  const puedeCrear    = tienePermiso('sucursales', 'crear');
  const puedeEditar   = tienePermiso('sucursales', 'editar');
  const puedeEliminar = tienePermiso('sucursales', 'eliminar');

  const [modalForm, setModalForm] = useState(null); // null | 'nuevo' | sucursal-object
  const [confirmar, setConfirmar] = useState(null); // null | sucursal-object

  const { data: sucursales = [], isLoading } = useQuery({
    queryKey: ['sucursales'],
    queryFn: getSucursales,
    enabled: puedeVer,
  });

  const eliminar = useMutation({
    mutationFn: (id) => eliminarSucursal(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sucursales'] });
      setConfirmar(null);
    },
    onError: (err) => alert(err?.response?.data?.mensaje ?? 'Error al eliminar la sucursal'),
  });

  if (!puedeVer) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
        <AlertCircle className="w-10 h-10" />
        <p className="font-medium">No tienes permiso para ver las sucursales</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 gap-3 text-muted-foreground">
        <RefreshCw className="w-5 h-5 animate-spin" /><span>Cargando...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Sucursales</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{sucursales.length} sucursales registradas</p>
        </div>
        {puedeCrear && (
          <button
            onClick={() => setModalForm('nuevo')}
            className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-sm font-semibold transition-colors"
          >
            <Plus className="w-4 h-4" /> Nueva Sucursal
          </button>
        )}
      </div>

      {sucursales.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
          <Building2 className="w-10 h-10" />
          <p className="text-sm">No hay sucursales registradas</p>
        </div>
      ) : (
        <>
          {/* mobile: tarjetas */}
          <div className="sm:hidden space-y-2">
            {sucursales.map(s => (
              <div key={s.id} className="bg-card border border-border rounded-xl p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Building2 className="w-4 h-4 text-primary" />
                    </div>
                    <span className="font-semibold text-foreground truncate">{s.nombre}</span>
                  </div>
                  {(puedeEditar || puedeEliminar) && (
                    <div className="flex items-center gap-1 shrink-0">
                      {puedeEditar && (
                        <button
                          onClick={() => setModalForm(s)}
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {puedeEliminar && (
                        <button
                          onClick={() => setConfirmar(s)}
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <div className="text-xs text-muted-foreground space-y-0.5 min-w-0">
                    <p className="truncate">{s.direccion || '—'}</p>
                    <p>{s.telefono || '—'}</p>
                  </div>
                  <BadgeEstado activo={s.activo} />
                </div>
              </div>
            ))}
          </div>

          {/* desktop: tabla */}
          <div className="hidden sm:block bg-card border border-border rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted border-b border-border">
                    <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Sucursal</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Dirección</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Teléfono</th>
                    <th className="px-5 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide">Estado</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {sucursales.map(s => (
                    <tr key={s.id} className="hover:bg-muted/50 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                            <Building2 className="w-4 h-4 text-primary" />
                          </div>
                          <span className="font-semibold text-foreground">{s.nombre}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-muted-foreground">
                        {s.direccion || <span className="italic text-muted-foreground">—</span>}
                      </td>
                      <td className="px-5 py-3.5 text-muted-foreground">
                        {s.telefono || <span className="italic text-muted-foreground">—</span>}
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        <BadgeEstado activo={s.activo} />
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center justify-end gap-1">
                          {puedeEditar && (
                            <button
                              onClick={() => setModalForm(s)}
                              className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                              title="Editar"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                          )}
                          {puedeEliminar && (
                            <button
                              onClick={() => setConfirmar(s)}
                              className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                              title="Eliminar"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {modalForm !== null && (
        <ModalSucursal
          sucursal={modalForm === 'nuevo' ? null : modalForm}
          onClose={() => setModalForm(null)}
          onExito={() => {
            setModalForm(null);
            qc.invalidateQueries({ queryKey: ['sucursales'] });
          }}
        />
      )}

      {confirmar && (
        <Modal titulo="Eliminar sucursal" onClose={() => setConfirmar(null)} ancho="max-w-sm">
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              ¿Eliminar la sucursal <span className="font-semibold text-foreground">"{confirmar.nombre}"</span>?
              Esta acción no se puede deshacer.
            </p>
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-3 text-xs text-amber-700 dark:text-amber-400">
              Solo se puede eliminar si no hay usuarios asignados a esta sucursal.
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmar(null)}
                className="px-4 py-2 rounded-xl text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => eliminar.mutate(confirmar.id)}
                disabled={eliminar.isPending}
                className="px-5 py-2 rounded-xl text-sm bg-destructive hover:bg-destructive/90 text-destructive-foreground font-semibold transition-colors disabled:opacity-60"
              >
                {eliminar.isPending ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function ModalSucursal({ sucursal, onClose, onExito }) {
  const esNuevo = !sucursal;
  const [nombre, setNombre]       = useState(sucursal?.nombre ?? '');
  const [direccion, setDireccion] = useState(sucursal?.direccion ?? '');
  const [telefono, setTelefono]   = useState(sucursal?.telefono ?? '');
  const [latitud, setLatitud]     = useState(sucursal?.latitud ?? '');
  const [longitud, setLongitud]   = useState(sucursal?.longitud ?? '');
  const [radioGeocerca, setRadioGeocerca] = useState(sucursal?.radio_geocerca_metros ?? 150);
  const [modoCierre, setModoCierre] = useState(sucursal?.modo_cierre_caja ?? 'directo');
  const [toleranciaCierre, setToleranciaCierre] = useState(sucursal?.tolerancia_cierre_caja ?? 10);
  const [activo, setActivo]       = useState(sucursal?.activo ?? 1);
  const [error, setError]         = useState(null);
  const [buscandoUbicacion, setBuscandoUbicacion] = useState(false);

  const usarUbicacionActual = () => {
    if (!navigator.geolocation) {
      setError('Tu navegador no soporta obtener la ubicación actual');
      return;
    }
    setBuscandoUbicacion(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitud(String(pos.coords.latitude));
        setLongitud(String(pos.coords.longitude));
        setBuscandoUbicacion(false);
      },
      () => {
        setError('No se pudo obtener tu ubicación — revisá los permisos del navegador');
        setBuscandoUbicacion(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const guardar = useMutation({
    mutationFn: () => {
      const datos = {
        nombre: nombre.trim(), direccion: direccion.trim(), telefono: telefono.trim(),
        latitud: latitud === '' ? null : parseFloat(latitud),
        longitud: longitud === '' ? null : parseFloat(longitud),
        radio_geocerca_metros: radioGeocerca === '' ? 150 : parseInt(radioGeocerca, 10),
        modo_cierre_caja: modoCierre,
        tolerancia_cierre_caja: toleranciaCierre === '' ? 10 : parseFloat(toleranciaCierre),
        activo,
      };
      return esNuevo ? crearSucursal(datos) : actualizarSucursal(sucursal.id, datos);
    },
    onSuccess: onExito,
    onError: (err) => setError(err?.response?.data?.mensaje ?? 'Error al guardar la sucursal'),
  });

  return (
    <Modal titulo={esNuevo ? 'Nueva Sucursal' : `Editar: ${sucursal.nombre}`} onClose={onClose} ancho="max-w-md">
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
            Nombre <span className="text-destructive">*</span>
          </label>
          <input
            autoFocus
            value={nombre}
            onChange={e => { setNombre(e.target.value); setError(null); }}
            placeholder="Ej: Sucursal Centro"
            className="w-full bg-background border border-input rounded-xl px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
            Dirección
          </label>
          <input
            value={direccion}
            onChange={e => setDireccion(e.target.value)}
            placeholder="Av. Principal #123"
            className="w-full bg-background border border-input rounded-xl px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
            Teléfono
          </label>
          <input
            value={telefono}
            onChange={e => setTelefono(e.target.value)}
            placeholder="70000000"
            className="w-full bg-background border border-input rounded-xl px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
            Ubicación (pedidos externos y control de personal)
          </label>
          <div className="grid grid-cols-2 gap-3">
            <input
              type="number"
              step="any"
              value={latitud}
              onChange={e => setLatitud(e.target.value)}
              placeholder="Latitud, ej: -17.783"
              className="w-full bg-background border border-input rounded-xl px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition"
            />
            <input
              type="number"
              step="any"
              value={longitud}
              onChange={e => setLongitud(e.target.value)}
              placeholder="Longitud, ej: -63.183"
              className="w-full bg-background border border-input rounded-xl px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition"
            />
          </div>
          <button
            type="button"
            onClick={usarUbicacionActual}
            disabled={buscandoUbicacion}
            className="mt-2 text-xs font-medium text-primary hover:underline disabled:opacity-60"
          >
            {buscandoUbicacion ? 'Buscando ubicación...' : '📍 Usar mi ubicación actual'}
          </button>
          <p className="text-xs text-muted-foreground mt-1.5">
            Opcional. Buscá la sucursal en Google Maps, clic derecho sobre el pin y copiá las coordenadas, o
            usá el botón de arriba si estás físicamente en el local.
          </p>
        </div>
        <div>
          <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
            Radio de geocerca (metros)
          </label>
          <input
            type="number"
            min="1"
            step="1"
            value={radioGeocerca}
            onChange={e => setRadioGeocerca(e.target.value)}
            className="w-full bg-background border border-input rounded-xl px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition"
          />
          <p className="text-xs text-muted-foreground mt-1.5">
            Distancia máxima a la ubicación de arriba para que el control de personal acepte una marcación
            de entrada/salida como "dentro de rango". Por defecto 150m.
          </p>
        </div>
        <div>
          <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
            Modo de cierre de caja
          </label>
          <div className="flex bg-muted rounded-lg p-0.5 w-fit">
            <button
              type="button"
              onClick={() => setModoCierre('directo')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                modoCierre === 'directo' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
              }`}
            >
              Directo
            </button>
            <button
              type="button"
              onClick={() => setModoCierre('ciego')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                modoCierre === 'ciego' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
              }`}
            >
              Ciego
            </button>
          </div>
          <p className="text-xs text-muted-foreground mt-1.5">
            Directo: el cajero ve el efectivo esperado mientras cuenta. Ciego: no lo ve hasta después de cerrar.
          </p>
        </div>
        <div>
          <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
            Tolerancia de cierre (Bs)
          </label>
          <input
            type="number"
            min="0"
            step="0.5"
            value={toleranciaCierre}
            onChange={e => setToleranciaCierre(e.target.value)}
            className="w-full bg-background border border-input rounded-xl px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition"
          />
          <p className="text-xs text-muted-foreground mt-1.5">
            Diferencia máxima entre lo contado y lo esperado que se considera cuadrado. Por defecto Bs 10.
          </p>
        </div>
        {!esNuevo && (
          <div className="flex items-center gap-3">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Estado</label>
            <button
              type="button"
              onClick={() => setActivo(a => a ? 0 : 1)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${activo ? 'bg-emerald-500' : 'bg-muted'}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${activo ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
            <span className="text-xs text-muted-foreground">{activo ? 'Activa' : 'Inactiva'}</span>
          </div>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-3 pt-1 border-t border-border">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors">
            Cancelar
          </button>
          <button
            onClick={() => guardar.mutate()}
            disabled={guardar.isPending || !nombre.trim()}
            className="px-5 py-2 rounded-xl text-sm bg-primary hover:bg-primary/90 text-primary-foreground font-semibold transition-colors disabled:opacity-60"
          >
            {guardar.isPending ? 'Guardando...' : esNuevo ? 'Crear Sucursal' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
