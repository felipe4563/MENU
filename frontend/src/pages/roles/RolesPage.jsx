import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Shield, Plus, Pencil, Trash2, AlertCircle, RefreshCw,
  CheckSquare, Square, MinusSquare, ChevronDown, ChevronUp,
} from 'lucide-react';
import { getRoles, getPermisos, crearRol, actualizarRol, eliminarRol } from '../../api/roles';
import { usePermisos } from '../../hooks/usePermisos';
import Modal from '../../components/ui/Modal';

/* ── Etiquetas legibles por módulo ─────────────────────────────────────── */
const MODULO_LABELS = {
  ventas:       'Ventas',
  usuarios:     'Usuarios',
  inventario:   'Inventario',
  caja:         'Caja',
  libro_caja:   'Libro de Caja',
  compras:      'Compras',
  proveedores:  'Proveedores',
  productos:    'Productos',
  combos:       'Combos',
  promociones:  'Promociones',
  cupones:      'Cupones',
  ruleta:       'Ruleta',
  clientes:     'Clientes',
  configuracion:'Configuración',
  roles:        'Roles',
  reportes:     'Reportes',
  pedidos_externos: 'Pedidos externos',
};

/* ── Colores por módulo ─────────────────────────────────────────────────── */
const MODULO_COLOR = {
  ventas:       'blue',
  caja:         'emerald',
  libro_caja:   'teal',
  productos:    'violet',
  combos:       'pink',
  promociones:  'lime',
  cupones:      'fuchsia',
  ruleta:       'red',
  inventario:   'purple',
  compras:      'orange',
  proveedores:  'amber',
  clientes:     'cyan',
  usuarios:     'indigo',
  roles:        'rose',
  configuracion:'gray',
  reportes:     'sky',
  pedidos_externos: 'orange',
};

const COLOR_CLASSES = {
  blue:    'bg-blue-50   dark:bg-blue-900/20   text-blue-700   dark:text-blue-400   border-blue-200   dark:border-blue-800',
  emerald: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800',
  teal:    'bg-teal-50   dark:bg-teal-900/20   text-teal-700   dark:text-teal-400   border-teal-200   dark:border-teal-800',
  violet:  'bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-400 border-violet-200 dark:border-violet-800',
  purple:  'bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-800',
  orange:  'bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-800',
  amber:   'bg-amber-50  dark:bg-amber-900/20  text-amber-700  dark:text-amber-400  border-amber-200  dark:border-amber-800',
  cyan:    'bg-cyan-50   dark:bg-cyan-900/20   text-cyan-700   dark:text-cyan-400   border-cyan-200   dark:border-cyan-800',
  indigo:  'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800',
  rose:    'bg-rose-50   dark:bg-rose-900/20   text-rose-700   dark:text-rose-400   border-rose-200   dark:border-rose-800',
  gray:    'bg-gray-50   dark:bg-gray-700/40   text-gray-700   dark:text-gray-300   border-gray-200   dark:border-gray-600',
  sky:     'bg-sky-50    dark:bg-sky-900/20    text-sky-700    dark:text-sky-400    border-sky-200    dark:border-sky-800',
  pink:    'bg-pink-50   dark:bg-pink-900/20   text-pink-700   dark:text-pink-400   border-pink-200   dark:border-pink-800',
  lime:    'bg-lime-50   dark:bg-lime-900/20   text-lime-700   dark:text-lime-400   border-lime-200   dark:border-lime-800',
  fuchsia: 'bg-fuchsia-50 dark:bg-fuchsia-900/20 text-fuchsia-700 dark:text-fuchsia-400 border-fuchsia-200 dark:border-fuchsia-800',
  red:     'bg-red-50    dark:bg-red-900/20    text-red-700    dark:text-red-400    border-red-200    dark:border-red-800',
};

/* ─────────────────────────────────────────────────────── página principal ── */

export default function RolesPage() {
  const { tienePermiso } = usePermisos();
  const qc = useQueryClient();

  const puedeVer      = tienePermiso('roles', 'ver');
  const puedeCrear    = tienePermiso('roles', 'crear');
  const puedeEditar   = tienePermiso('roles', 'editar');
  const puedeEliminar = tienePermiso('roles', 'eliminar');

  const [modalForm,  setModalForm]  = useState(null);  // null | 'nuevo' | rol-object
  const [confirmar,  setConfirmar]  = useState(null);  // null | rol-object

  const { data: roles = [], isLoading } = useQuery({
    queryKey: ['roles'],
    queryFn: getRoles,
    enabled: puedeVer,
  });

  const eliminar = useMutation({
    mutationFn: (id) => eliminarRol(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['roles'] });
      setConfirmar(null);
    },
    onError: (err) => alert(err?.response?.data?.mensaje ?? 'Error al eliminar el rol'),
  });

  if (!puedeVer) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
        <AlertCircle className="w-10 h-10" />
        <p className="font-medium">No tienes permiso para ver los roles</p>
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

      {/* Cabecera */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Roles y Permisos</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{roles.length} roles configurados</p>
        </div>
        {puedeCrear && (
          <button
            onClick={() => setModalForm('nuevo')}
            className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-sm font-semibold transition-colors"
          >
            <Plus className="w-4 h-4" /> Nuevo Rol
          </button>
        )}
      </div>

      {/* Lista — cards en mobile, tabla en sm+ */}

      {/* Mobile: cards */}
      <div className="space-y-3 sm:hidden">
        {roles.map(rol => (
          <RolCard
            key={rol.id}
            rol={rol}
            puedeEditar={puedeEditar}
            puedeEliminar={puedeEliminar}
            onEditar={() => setModalForm(rol)}
            onEliminar={() => setConfirmar(rol)}
          />
        ))}
      </div>

      {/* sm+: tabla */}
      <div className="hidden sm:block bg-card border border-border rounded-2xl overflow-hidden">
        {roles.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
            <Shield className="w-10 h-10" />
            <p className="text-sm">No hay roles configurados</p>
            {puedeCrear && (
              <button
                onClick={() => setModalForm('nuevo')}
                className="text-sm text-primary hover:underline"
              >
                Crear el primero
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted border-b border-border">
                  <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Rol</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Descripción</th>
                  <th className="px-5 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide">Permisos</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Módulos</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {roles.map(rol => {
                  const modulos = [...new Set(rol.permisos?.map(p => p.modulo) ?? [])];
                  return (
                    <tr key={rol.id} className="hover:bg-muted/50 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                            <Shield className="w-4 h-4 text-primary" />
                          </div>
                          <span className="font-semibold text-foreground">{rol.nombre}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-muted-foreground">
                        {rol.descripcion ?? <span className="italic text-muted-foreground">—</span>}
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-muted text-xs font-bold text-muted-foreground">
                          {rol.permisos?.length ?? 0}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex flex-wrap gap-1">
                          {modulos.slice(0, 4).map(m => {
                            const color = MODULO_COLOR[m] ?? 'gray';
                            return (
                              <span
                                key={m}
                                className={`text-xs px-1.5 py-0.5 rounded border font-medium ${COLOR_CLASSES[color]}`}
                              >
                                {MODULO_LABELS[m] ?? m}
                              </span>
                            );
                          })}
                          {modulos.length > 4 && (
                            <span className="text-xs px-1.5 py-0.5 rounded border bg-muted text-muted-foreground border-border">
                              +{modulos.length - 4}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center justify-end gap-1">
                          {puedeEditar && (
                            <button
                              onClick={() => setModalForm(rol)}
                              className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                              title="Editar"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                          )}
                          {puedeEliminar && (
                            <button
                              onClick={() => setConfirmar(rol)}
                              className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                              title="Eliminar"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal formulario */}
      {modalForm !== null && (
        <ModalRol
          rol={modalForm === 'nuevo' ? null : modalForm}
          onClose={() => setModalForm(null)}
          onExito={() => {
            setModalForm(null);
            qc.invalidateQueries({ queryKey: ['roles'] });
          }}
        />
      )}

      {/* Modal confirmar eliminar */}
      {confirmar && (
        <Modal titulo="Eliminar rol" onClose={() => setConfirmar(null)} ancho="max-w-sm">
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              ¿Eliminar el rol <span className="font-semibold text-foreground">"{confirmar.nombre}"</span>?
              Esta acción no se puede deshacer.
            </p>
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-3 text-xs text-amber-700 dark:text-amber-400">
              Solo se puede eliminar si no hay usuarios asignados a este rol.
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

/* ─── Card mobile de un rol ─────────────────────────────────────────────── */

function RolCard({ rol, puedeEditar, puedeEliminar, onEditar, onEliminar }) {
  const [expandido, setExpandido] = useState(false);
  const modulos = [...new Set(rol.permisos?.map(p => p.modulo) ?? [])];

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <div className="flex items-start gap-3 p-4">
        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <Shield className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-foreground">{rol.nombre}</p>
          {rol.descripcion && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{rol.descripcion}</p>
          )}
          <div className="flex flex-wrap gap-1 mt-2">
            {modulos.slice(0, 3).map(m => {
              const color = MODULO_COLOR[m] ?? 'gray';
              return (
                <span key={m} className={`text-xs px-1.5 py-0.5 rounded border font-medium ${COLOR_CLASSES[color]}`}>
                  {MODULO_LABELS[m] ?? m}
                </span>
              );
            })}
            {modulos.length > 3 && (
              <span className="text-xs px-1.5 py-0.5 rounded border bg-muted text-muted-foreground border-border">
                +{modulos.length - 3}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className="text-xs font-bold text-muted-foreground">
            {rol.permisos?.length ?? 0} permisos
          </span>
          <div className="flex gap-1 mt-1">
            {puedeEditar && (
              <button onClick={onEditar} className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors">
                <Pencil className="w-4 h-4" />
              </button>
            )}
            {puedeEliminar && (
              <button onClick={onEliminar} className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
      {rol.permisos?.length > 0 && (
        <button
          onClick={() => setExpandido(v => !v)}
          className="w-full flex items-center justify-center gap-1 py-2 border-t border-border text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
        >
          {expandido ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          {expandido ? 'Ocultar permisos' : 'Ver permisos'}
        </button>
      )}
      {expandido && (
        <div className="px-4 pb-4 pt-2 border-t border-border space-y-2">
          {modulos.map(m => {
            const perms = rol.permisos.filter(p => p.modulo === m);
            const color = MODULO_COLOR[m] ?? 'gray';
            return (
              <div key={m}>
                <p className={`text-xs font-semibold mb-1 ${COLOR_CLASSES[color].split(' ').find(c => c.startsWith('text-'))}`}>
                  {MODULO_LABELS[m] ?? m}
                </p>
                <div className="flex flex-wrap gap-1">
                  {perms.map(p => (
                    <span key={p.id} className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded">
                      {p.descripcion ?? p.accion}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─── Modal crear / editar rol ──────────────────────────────────────────── */

function ModalRol({ rol, onClose, onExito }) {
  const esNuevo = !rol;

  const [nombre,      setNombre]      = useState(rol?.nombre      ?? '');
  const [descripcion, setDescripcion] = useState(rol?.descripcion ?? '');
  const [selectedIds, setSelectedIds] = useState(new Set(rol?.permisos?.map(p => p.id) ?? []));
  const [error,       setError]       = useState(null);

  const { data: permisosAgrupados = {}, isLoading } = useQuery({
    queryKey: ['permisos-catalogo'],
    queryFn: getPermisos,
    staleTime: Infinity,
  });

  const modulos = Object.keys(permisosAgrupados);

  const togglePermiso = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleModulo = (permsModulo) => {
    const ids = permsModulo.map(p => p.id);
    const allOn = ids.every(id => selectedIds.has(id));
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allOn) ids.forEach(id => next.delete(id));
      else ids.forEach(id => next.add(id));
      return next;
    });
  };

  const toggleTodo = () => {
    const todosIds = modulos.flatMap(m => permisosAgrupados[m].map(p => p.id));
    const todosOn = todosIds.every(id => selectedIds.has(id));
    setSelectedIds(todosOn ? new Set() : new Set(todosIds));
  };

  const todosIds = modulos.flatMap(m => permisosAgrupados[m].map(p => p.id));
  const todosOn  = todosIds.length > 0 && todosIds.every(id => selectedIds.has(id));

  const guardar = useMutation({
    mutationFn: () => {
      const datos = { nombre: nombre.trim(), descripcion: descripcion.trim(), permiso_ids: [...selectedIds] };
      return esNuevo ? crearRol(datos) : actualizarRol(rol.id, datos);
    },
    onSuccess: onExito,
    onError: (err) => setError(err?.response?.data?.mensaje ?? 'Error al guardar el rol'),
  });

  return (
    <Modal titulo={esNuevo ? 'Nuevo Rol' : `Editar: ${rol.nombre}`} onClose={onClose} ancho="max-w-3xl">
      <div className="space-y-5">

        {/* Nombre y descripción */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
              Nombre <span className="text-destructive">*</span>
            </label>
            <input
              autoFocus
              value={nombre}
              onChange={e => { setNombre(e.target.value); setError(null); }}
              placeholder="Ej: Supervisor"
              className="w-full bg-background border border-input rounded-xl px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
              Descripción
            </label>
            <input
              value={descripcion}
              onChange={e => setDescripcion(e.target.value)}
              placeholder="Ej: Acceso parcial a ventas"
              className="w-full bg-background border border-input rounded-xl px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition"
            />
          </div>
        </div>

        {/* Matriz de permisos */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Permisos ({selectedIds.size} seleccionados)
            </p>
            {!isLoading && (
              <button
                onClick={toggleTodo}
                className="flex items-center gap-1.5 text-xs text-primary hover:underline font-medium"
              >
                {todosOn
                  ? <><CheckSquare className="w-3.5 h-3.5" /> Quitar todos</>
                  : <><Square className="w-3.5 h-3.5" /> Seleccionar todos</>
                }
              </button>
            )}
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center h-24 gap-2 text-muted-foreground">
              <RefreshCw className="w-4 h-4 animate-spin" /> Cargando permisos...
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[50vh] overflow-y-auto pr-1">
              {modulos.map(modulo => {
                const perms   = permisosAgrupados[modulo];
                const ids     = perms.map(p => p.id);
                const allOn   = ids.every(id => selectedIds.has(id));
                const someOn  = ids.some(id => selectedIds.has(id));
                const color   = MODULO_COLOR[modulo] ?? 'gray';
                const classes = COLOR_CLASSES[color];

                return (
                  <div
                    key={modulo}
                    className="border border-border rounded-xl overflow-hidden"
                  >
                    {/* Cabecera de módulo */}
                    <button
                      onClick={() => toggleModulo(perms)}
                      className={`w-full flex items-center justify-between px-3 py-2.5 border-b border-border hover:opacity-90 transition-opacity ${classes.split(' ').slice(0, 2).join(' ')} bg-opacity-50`}
                    >
                      <span className={`text-xs font-bold ${classes.split(' ').find(c => c.startsWith('text-'))}`}>
                        {MODULO_LABELS[modulo] ?? modulo}
                      </span>
                      {allOn
                        ? <CheckSquare className={`w-4 h-4 ${classes.split(' ').find(c => c.startsWith('text-'))}`} />
                        : someOn
                        ? <MinusSquare className={`w-4 h-4 ${classes.split(' ').find(c => c.startsWith('text-'))}`} />
                        : <Square className="w-4 h-4 text-muted-foreground" />
                      }
                    </button>

                    {/* Permisos del módulo */}
                    <div className="bg-card divide-y divide-border">
                      {perms.map(p => (
                        <label
                          key={p.id}
                          className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-muted/50 transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={selectedIds.has(p.id)}
                            onChange={() => togglePermiso(p.id)}
                            className="w-3.5 h-3.5 rounded accent-primary cursor-pointer"
                          />
                          <span className="text-xs text-foreground leading-tight">
                            {p.descripcion ?? p.accion}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

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
            {guardar.isPending ? 'Guardando...' : esNuevo ? 'Crear Rol' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
