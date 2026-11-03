import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, UsersRound, Pencil, KeyRound, Eye, EyeOff } from 'lucide-react';
import { getUsuarios, crearUsuario, actualizarUsuario, actualizarSucursalesUsuario } from '../../api/usuarios';
import { getRoles } from '../../api/roles';
import { getSucursales } from '../../api/sucursales';
import { avatarSrc } from '../../api/perfil';
import { useAuthStore } from '../../store/authStore';
import { usePermisos } from '../../hooks/usePermisos';
import Hoja from '../../components/ui/Hoja';
import { Buscador, Cargando, Campo, Encabezado, Interruptor, Pagina, SinPermiso, Vacio, Insignia } from '../../components/ui/piezas';
import { useCampos } from '../../components/ui/formulario';
import { avisar } from '../../components/ui/Aviso';
import { cx, errorDe, iniciales, normalizar } from '../../lib/util';

function claveAleatoria() {
  const letras = 'abcdefghjkmnpqrstuvwxyz23456789';
  return Array.from({ length: 8 }, () => letras[Math.floor(Math.random() * letras.length)]).join('');
}

function HojaUsuario({ u, roles, sucursales, onCerrar }) {
  const qc = useQueryClient();
  const [ver, setVer] = useState(!u);
  const { f, campo, poner } = useCampos({
    nombre: u?.nombre ?? '', email: u?.email ?? '', contrasena: u ? '' : claveAleatoria(), rol_id: u?.rol_id ?? roles[0]?.id ?? '',
    activo: u ? !!u.activo : true, todas: !!u?.acceso_todas_sucursales, sucursal_ids: (u?.sucursales ?? []).map((s) => s.id),
  });
  const guardar = useMutation({
    mutationFn: async () => {
      const d = { nombre: f.nombre.trim(), email: f.email.trim(), rol_id: Number(f.rol_id), activo: f.activo ? 1 : 0 };
      if (f.contrasena) d.contrasena = f.contrasena;
      const r = u ? await actualizarUsuario(u.id, d) : await crearUsuario(d);
      await actualizarSucursalesUsuario(u?.id ?? r.id, { sucursal_ids: f.sucursal_ids, acceso_todas_sucursales: f.todas });
      return r;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['usuarios'] });
      avisar.ok(u ? 'Usuario guardado' : `Usuario creado. Contraseña inicial: ${f.contrasena}`, { duracion: 12000 });
      onCerrar();
    },
    onError: (e) => avisar.error(errorDe(e)),
  });
  const tocarSuc = (id) => poner('sucursal_ids', f.sucursal_ids.includes(id) ? f.sucursal_ids.filter((x) => x !== id) : [...f.sucursal_ids, id]);
  const valido = f.nombre.trim() && /\S+@\S+/.test(f.email) && f.rol_id && (u || f.contrasena.length >= 6) && (f.todas || f.sucursal_ids.length);

  return (
    <Hoja onCerrar={onCerrar} titulo={u ? u.nombre : 'Nuevo usuario'} ancho="max-w-lg"
      pie={<button data-principal className="btn-aji w-full" disabled={!valido || guardar.isPending} onClick={() => guardar.mutate()}>{u ? 'Guardar' : 'Crear usuario'}</button>}>
      <div className="space-y-4">
        <Campo etiqueta="Nombre completo"><input className="campo" autoFocus={!u} {...campo('nombre')} /></Campo>
        <Campo etiqueta="Correo (para entrar)"><input className="campo" type="email" {...campo('email')} /></Campo>
        <Campo etiqueta={u ? 'Nueva contraseña (déjala vacía para no cambiarla)' : 'Contraseña inicial'} ayuda={!u ? 'Al entrar por primera vez se le pide crear la suya.' : undefined}>
          <div className="relative">
            <input className="campo pr-20" type={ver ? 'text' : 'password'} {...campo('contrasena')} />
            <div className="absolute right-1 top-1 flex">
              <button type="button" className="btn-icono btn-fantasma h-9 w-9" onClick={() => setVer(!ver)} aria-label="Mostrar">{ver ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button>
              <button type="button" className="btn-icono btn-fantasma h-9 w-9" onClick={() => { poner('contrasena', claveAleatoria()); setVer(true); }} aria-label="Generar"><KeyRound className="w-4 h-4" /></button>
            </div>
          </div>
        </Campo>
        <Campo etiqueta="Rol">
          <select className="campo" {...campo('rol_id')}>{roles.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}</select>
        </Campo>
        <div>
          <span className="etiqueta">Sucursales donde trabaja</span>
          <Interruptor activo={f.todas} onCambio={(v) => poner('todas', v)} etiqueta="Todas las sucursales" descripcion="Para dueños y administradores." />
          {!f.todas && (
            <div className="flex flex-wrap gap-2 mt-3">
              {sucursales.map((s) => (
                <button key={s.id} type="button" onClick={() => tocarSuc(s.id)} className={cx('h-9 px-3 rounded-full border text-sm font-medium', f.sucursal_ids.includes(s.id) ? 'bg-tinta text-fondo border-tinta' : 'border-linea')}>{s.nombre}</button>
              ))}
            </div>
          )}
        </div>
        {u && <Interruptor activo={f.activo} onCambio={(v) => poner('activo', v)} etiqueta="Puede entrar al sistema" />}
      </div>
    </Hoja>
  );
}

export default function UsuariosPage() {
  const { tiene } = usePermisos();
  const yo = useAuthStore((s) => s.usuario);
  const [q, setQ] = useState('');
  const [editar, setEditar] = useState(null);
  const usuarios = useQuery({ queryKey: ['usuarios'], queryFn: getUsuarios, enabled: tiene('usuarios', 'ver') });
  const roles = useQuery({ queryKey: ['roles'], queryFn: getRoles, enabled: tiene('usuarios', 'ver') });
  const sucursales = useQuery({ queryKey: ['sucursales'], queryFn: getSucursales, enabled: tiene('sucursales', 'ver') });
  if (!tiene('usuarios', 'ver')) return <SinPermiso />;
  const t = normalizar(q);
  const lista = (usuarios.data ?? []).filter((u) => !t || normalizar(`${u.nombre} ${u.email}`).includes(t));
  const listaSuc = sucursales.data ?? (yo?.sucursal_activa?.id ? [yo.sucursal_activa] : []);

  return (
    <Pagina>
      <Encabezado titulo="Usuarios" texto="Quién entra al sistema y con qué rol."
        acciones={tiene('usuarios', 'crear') && <button className="btn-aji" onClick={() => setEditar('nuevo')}><Plus className="w-4 h-4" /> Nuevo usuario</button>} />
      <Buscador valor={q} onCambio={setQ} placeholder="Buscar por nombre o correo" className="mb-4 max-w-md" />
      {usuarios.isLoading ? <Cargando /> : lista.length === 0 ? <Vacio Icono={UsersRound} titulo="Nadie coincide" /> : (
        <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {lista.map((u) => (
            <li key={u.id} className={cx('ficha p-4 flex items-center gap-3', !u.activo && 'opacity-55')}>
              <span className="w-12 h-12 rounded-full bg-aji text-sobre-aji grid place-items-center font-display font-bold overflow-hidden shrink-0">
                {u.avatar ? <img src={avatarSrc(u.avatar)} alt="" className="w-full h-full object-cover" /> : iniciales(u.nombre)}
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-semibold truncate">{u.nombre}{u.id === yo?.id ? ' (tú)' : ''}</p>
                <p className="text-xs text-tenue truncate">{u.email}</p>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  <Insignia tono="tinta">{u.rol?.nombre}</Insignia>
                  <Insignia>{u.acceso_todas_sucursales ? 'Todas' : (u.sucursales ?? []).map((s) => s.nombre).join(', ') || 'Sin sucursal'}</Insignia>
                  {!u.activo && <Insignia tono="peligro">Sin acceso</Insignia>}
                </div>
              </div>
              {tiene('usuarios', 'editar') && <button className="btn-icono btn-fantasma" onClick={() => setEditar(u)} aria-label="Editar"><Pencil className="w-4 h-4" /></button>}
            </li>
          ))}
        </ul>
      )}
      {editar && <HojaUsuario u={editar === 'nuevo' ? null : editar} roles={roles.data ?? []} sucursales={listaSuc} onCerrar={() => setEditar(null)} />}
    </Pagina>
  );
}
