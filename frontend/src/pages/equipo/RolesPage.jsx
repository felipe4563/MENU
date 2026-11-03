import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Shield, Trash2 } from 'lucide-react';
import { getRoles, getPermisos, crearRol, actualizarRol, eliminarRol } from '../../api/roles';
import { usePermisos } from '../../hooks/usePermisos';
import { Cargando, Campo, Encabezado, Pagina, SinPermiso, useConfirmar } from '../../components/ui/piezas';
import { avisar } from '../../components/ui/Aviso';
import { cx, errorDe } from '../../lib/util';

// Nombres que entiende el dueño del negocio, no los del código.
const MODULOS = {
  dashboard: 'Pantalla Hoy', ventas: 'Ventas', pedidos_externos: 'Delivery (apps)', cocina: 'Cocina', caja: 'Caja (turnos)',
  cajas: 'Cajas (configurar)', libro_caja: 'Libro de caja', reportes: 'Reportes', productos: 'Productos', combos: 'Combos',
  inventario: 'Inventario', insumos: 'Insumos', compras: 'Compras', proveedores: 'Proveedores', clientes: 'Clientes',
  promociones: 'Promociones', cupones: 'Cupones', ruleta: 'Ruleta', usuarios: 'Usuarios', roles: 'Roles', personal: 'Asistencia del personal',
  sucursales: 'Sucursales', configuracion: 'Ajustes', pagos_qr: 'Cobro con QR (cuenta del banco)',
};
const ACCIONES = {
  ver: 'Ver', crear: 'Crear', editar: 'Editar', eliminar: 'Eliminar', cobrar: 'Cobrar', anular: 'Anular y devolver', cancelar: 'Cancelar pedidos',
  abrir: 'Abrir', cerrar: 'Cerrar', disponibilidad: 'Marcar agotado', entrada: 'Entradas', salida: 'Salidas', ajustar: 'Ajustar',
  recibir: 'Recibir', girar: 'Girar', administrar: 'Administrar', configurar: 'Configurar',
};

function Editor({ rol, permisos, onListo }) {
  const qc = useQueryClient();
  const [confirmacion, confirmar] = useConfirmar();
  const [nombre, setNombre] = useState(rol?.nombre ?? '');
  const [desc, setDesc] = useState(rol?.descripcion ?? '');
  const [sel, setSel] = useState(() => new Set((rol?.permisos ?? []).map((p) => p.id)));
  const { tiene } = usePermisos();
  const editar = tiene('roles', rol ? 'editar' : 'crear');
  const todos = useMemo(() => Object.values(permisos).flat().map((p) => p.id), [permisos]);
  const tocar = (ids, on) => setSel((s) => { const n = new Set(s); ids.forEach((id) => (on ? n.add(id) : n.delete(id))); return n; });

  const guardar = useMutation({
    mutationFn: () => {
      const d = { nombre: nombre.trim(), descripcion: desc.trim() || null, permiso_ids: [...sel] };
      return rol ? actualizarRol(rol.id, d) : crearRol(d);
    },
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: ['roles'] }); avisar.ok('Rol guardado. Los usuarios lo verán al volver a entrar.'); onListo(r?.id); },
    onError: (e) => avisar.error(errorDe(e)),
  });
  const borrar = useMutation({ mutationFn: () => eliminarRol(rol.id), onSuccess: () => { qc.invalidateQueries({ queryKey: ['roles'] }); onListo(null); }, onError: (e) => avisar.error(errorDe(e)) });

  return (
    <div>
      <div className="grid sm:grid-cols-2 gap-3 mb-5">
        <Campo etiqueta="Nombre del rol"><input className="campo" disabled={!editar} value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej.: Mesero" /></Campo>
        <Campo etiqueta="Descripción"><input className="campo" disabled={!editar} value={desc} onChange={(e) => setDesc(e.target.value)} /></Campo>
      </div>
      <div className="flex items-center gap-2 mb-3">
        <p className="font-display font-semibold flex-1">Qué puede hacer <span className="text-tenue font-normal text-sm">· {sel.size} de {todos.length}</span></p>
        {editar && <button className="btn-fantasma h-8 text-[13px]" onClick={() => tocar(todos, sel.size !== todos.length)}>{sel.size === todos.length ? 'Quitar todo' : 'Marcar todo'}</button>}
      </div>
      <div className="grid md:grid-cols-2 gap-3">
        {Object.entries(permisos).sort(([a], [b]) => (MODULOS[a] ?? a).localeCompare(MODULOS[b] ?? b)).map(([modulo, lista]) => {
          const ids = lista.map((p) => p.id);
          const todosOn = ids.every((id) => sel.has(id));
          return (
            <div key={modulo} className="rounded-xl border border-linea p-3">
              <label className="flex items-center gap-2 font-semibold mb-2">
                <input type="checkbox" disabled={!editar} checked={todosOn} onChange={(e) => tocar(ids, e.target.checked)} /> {MODULOS[modulo] ?? modulo}
              </label>
              <div className="flex flex-wrap gap-1.5">
                {lista.map((p) => (
                  <button key={p.id} type="button" disabled={!editar} title={p.descripcion ?? ''} onClick={() => tocar([p.id], !sel.has(p.id))}
                    className={cx('h-8 px-3 rounded-full text-[13px] font-medium border transition', sel.has(p.id) ? 'bg-tinta text-fondo border-tinta' : 'border-linea text-tenue')}>
                    {ACCIONES[p.accion] ?? p.accion}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      {editar && (
        <div className="sticky bottom-20 md:bottom-4 mt-5 flex gap-2 justify-end">
          {rol && tiene('roles', 'eliminar') && <button className="btn-borde text-locoto mr-auto" onClick={async () => { if (await confirmar({ titulo: `¿Eliminar el rol ${rol.nombre}?`, texto: 'Solo se puede si ningún usuario lo tiene.', confirmar: 'Eliminar', peligro: true })) borrar.mutate(); }}><Trash2 className="w-4 h-4" /> Eliminar rol</button>}
          <button className="btn-aji btn-lg shadow-flota" disabled={!nombre.trim() || guardar.isPending} onClick={() => guardar.mutate()}>{rol ? 'Guardar cambios' : 'Crear rol'}</button>
        </div>
      )}
      {confirmacion}
    </div>
  );
}

export default function RolesPage() {
  const { tiene } = usePermisos();
  const [activo, setActivo] = useState(null); // id | 'nuevo'
  const roles = useQuery({ queryKey: ['roles'], queryFn: getRoles, enabled: tiene('roles', 'ver') });
  const permisos = useQuery({ queryKey: ['permisos'], queryFn: getPermisos, enabled: tiene('roles', 'ver') });
  if (!tiene('roles', 'ver')) return <SinPermiso />;
  if (roles.isLoading || permisos.isLoading) return <Cargando />;
  const lista = roles.data ?? [];
  const actualId = activo ?? lista[0]?.id;
  const rol = actualId === 'nuevo' ? null : lista.find((r) => r.id === actualId);

  return (
    <Pagina>
      <Encabezado titulo="Roles y permisos" texto="Cada rol define qué pantallas y acciones tiene una persona." />
      <div className="grid lg:grid-cols-[240px_1fr] gap-5 items-start">
        <nav className="flex lg:flex-col gap-1.5 overflow-x-auto sin-scroll">
          {lista.map((r) => (
            <button key={r.id} onClick={() => setActivo(r.id)} className={cx('shrink-0 text-left rounded-xl px-4 py-3 transition', actualId === r.id ? 'bg-tinta text-fondo' : 'hover:bg-hundido')}>
              <span className="font-semibold flex items-center gap-2"><Shield className="w-4 h-4" /> {r.nombre}</span>
              <span className={cx('text-xs', actualId === r.id ? 'opacity-70' : 'text-tenue')}>{r.permisos?.length ?? 0} permisos</span>
            </button>
          ))}
          {tiene('roles', 'crear') && <button onClick={() => setActivo('nuevo')} className={cx('shrink-0 rounded-xl px-4 py-3 border-2 border-dashed text-sm font-semibold flex items-center gap-2', actualId === 'nuevo' ? 'border-tinta' : 'border-linea text-tenue')}><Plus className="w-4 h-4" /> Nuevo rol</button>}
        </nav>
        <section className="ficha p-5">
          <Editor key={actualId} rol={rol} permisos={permisos.data ?? {}} onListo={(id) => setActivo(id ?? null)} />
        </section>
      </div>
    </Pagina>
  );
}
