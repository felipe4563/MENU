import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { getPerfil, actualizarPerfil, cambiarContrasena } from '../../api/perfil';
import { useAuthStore } from '../../store/authStore';
import { useTemaStore } from '../../store/temaStore';
import { Cargando, Campo, Pagina } from '../../components/ui/piezas';
import { SubirImagen } from '../../components/ui/formulario';
import { avisar } from '../../components/ui/Aviso';
import { cx, errorDe } from '../../lib/util';

function Datos({ perfil }) {
  const updateUsuario = useAuthStore((s) => s.updateUsuario);
  const [f, setF] = useState({ nombre: perfil.nombre ?? '', email: perfil.email ?? '', avatar: perfil.avatar ?? null });
  const guardar = useMutation({
    mutationFn: () => actualizarPerfil({ nombre: f.nombre.trim(), email: f.email.trim(), avatar: f.avatar }),
    onSuccess: () => { updateUsuario({ nombre: f.nombre.trim(), email: f.email.trim(), avatar: f.avatar }); avisar.ok('Perfil actualizado'); },
    onError: (e) => avisar.error(errorDe(e)),
  });
  return (
    <section className="ficha p-5 sm:p-6 h-full">
      <h2 className="font-display font-semibold text-lg mb-4">Tus datos</h2>
      <div className="flex gap-5 items-start">
        <SubirImagen redonda className="w-24 h-24 shrink-0" valor={f.avatar} onCambio={(v) => setF({ ...f, avatar: v })} />
        <div className="flex-1 space-y-3">
          <Campo etiqueta="Nombre"><input className="campo" value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} /></Campo>
          <Campo etiqueta="Correo"><input className="campo" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Campo>
          <button className="btn-aji" disabled={!f.nombre.trim() || guardar.isPending} onClick={() => guardar.mutate()}>Guardar</button>
        </div>
      </div>
    </section>
  );
}

function Clave() {
  const [f, setF] = useState({ actual: '', nueva: '', repetir: '' });
  const cambiar = useMutation({
    mutationFn: () => cambiarContrasena({ contrasena_actual: f.actual, nueva_contrasena: f.nueva }),
    onSuccess: () => { setF({ actual: '', nueva: '', repetir: '' }); avisar.ok('Contraseña cambiada'); },
    onError: (e) => avisar.error(errorDe(e)),
  });
  const error = f.nueva && f.nueva.length < 6 ? 'Mínimo 6 caracteres.' : f.repetir && f.repetir !== f.nueva ? 'No coinciden.' : null;
  const c = (k) => ({ value: f[k], onChange: (e) => setF({ ...f, [k]: e.target.value }), type: 'password', className: 'campo' });
  return (
    <section className="ficha p-5 sm:p-6 space-y-3 h-full">
      <h2 className="font-display font-semibold text-lg">Cambiar contraseña</h2>
      <Campo etiqueta="Contraseña actual"><input {...c('actual')} autoComplete="current-password" /></Campo>
      <div className="grid sm:grid-cols-2 gap-3">
        <Campo etiqueta="Nueva" error={error}><input {...c('nueva')} autoComplete="new-password" /></Campo>
        <Campo etiqueta="Repite la nueva"><input {...c('repetir')} autoComplete="new-password" /></Campo>
      </div>
      <button className="btn-tinta" disabled={!f.actual || !f.nueva || !!error || f.nueva !== f.repetir || cambiar.isPending} onClick={() => cambiar.mutate()}>Cambiar contraseña</button>
    </section>
  );
}

const TEMAS = [
  { valor: 'sistema', etiqueta: 'Automático', texto: 'Sigue a tu dispositivo' },
  { valor: 'claro', etiqueta: 'Claro', texto: 'Para lugares con luz' },
  { valor: 'oscuro', etiqueta: 'Oscuro', texto: 'Cansa menos la vista de noche' },
];

function Miniatura({ oscuro }) {
  const c = oscuro ? { fondo: '#141d22', papel: '#1d282e', linea: '#2c3a41' } : { fondo: '#f2f1ec', papel: '#ffffff', linea: '#e3e1da' };
  return (
    <div className="flex h-full" style={{ background: c.fondo }}>
      <div className="w-[14%] bg-[#1b262c]" />
      <div className="flex-1 p-[8%] space-y-[8%]">
        <div className="h-[12%] w-1/2 rounded-sm" style={{ background: c.linea }} />
        <div className="h-[46%] rounded-md border" style={{ background: c.papel, borderColor: c.linea }} />
        <div className="h-[12%] w-1/3 rounded-sm bg-aji" />
      </div>
    </div>
  );
}

function Apariencia() {
  const { modo, setModo } = useTemaStore();
  return (
    <section className="ficha p-5 sm:p-6 lg:col-span-2">
      <h2 className="font-display font-semibold text-lg">Apariencia</h2>
      <p className="text-[13px] text-tenue mt-1 mb-4">Solo cambia en este dispositivo.</p>
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        {TEMAS.map((t) => (
          <button key={t.valor} onClick={() => setModo(t.valor)} aria-pressed={modo === t.valor}
            className={cx('text-left rounded-2xl border-2 p-2 transition-colors', modo === t.valor ? 'border-aji' : 'border-linea hover:border-tenue/50')}>
            <div className="aspect-[16/9] rounded-xl overflow-hidden">
              {t.valor === 'sistema'
                ? <div className="relative h-full"><Miniatura /><div className="absolute inset-0" style={{ clipPath: 'polygon(100% 0, 100% 100%, 0 100%)' }}><Miniatura oscuro /></div></div>
                : <Miniatura oscuro={t.valor === 'oscuro'} />}
            </div>
            <p className="font-semibold mt-2 px-1">{t.etiqueta}</p>
            <p className="text-xs text-tenue px-1 pb-1 hidden sm:block">{t.texto}</p>
          </button>
        ))}
      </div>
    </section>
  );
}

export default function PerfilPage() {
  const q = useQuery({ queryKey: ['perfil'], queryFn: getPerfil });
  if (q.isLoading) return <Cargando />;
  return (
    <Pagina>
      <h1 className="text-[30px] font-extrabold leading-none mb-6">Mi perfil</h1>
      <div className="grid lg:grid-cols-2 gap-4 items-stretch">
        {q.data && <Datos perfil={q.data} />}
        <Clave />
        <Apariencia />
      </div>
    </Pagina>
  );
}
