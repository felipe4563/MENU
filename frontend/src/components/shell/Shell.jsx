import { useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { MoreHorizontal, Search, LogOut, Moon, Sun, Monitor, UserRound, Clock, WifiOff, Bluetooth, ArrowLeft } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useTemaStore } from '../../store/temaStore';
import { usePermisos } from '../../hooks/usePermisos';
import { useConfigPublica } from '../../hooks/useConfig';
import { logoSrc } from '../../api/configuracion';
import { avatarSrc } from '../../api/perfil';
import { seccionesVisibles } from './navegacion';
import { cx, iniciales } from '../../lib/util';
import Paleta from './Paleta';
import Hoja from '../ui/Hoja';
import CambioContrasena from './CambioContrasena';
import ActualizarApp from './ActualizarApp';
import CocinaPendienteBT from './CocinaPendienteBT';
import ImpresoraDispositivo from './ImpresoraDispositivo';
import { useEnLinea } from '../../hooks/useEnLinea';

function Marca({ compacto }) {
  const { data: cfg = {} } = useConfigPublica();
  const logo = logoSrc(cfg.logo);
  return (
    <div className={cx('flex items-center gap-2.5', compacto && 'justify-center')}>
      <div className="w-10 h-10 rounded-xl bg-aji text-sobre-aji grid place-items-center overflow-hidden shrink-0">
        {logo ? <img src={logo} alt="" className="w-full h-full object-cover" /> : <span className="font-display font-extrabold text-lg">{iniciales(cfg.nombre_negocio || 'M')}</span>}
      </div>
    </div>
  );
}

function Avatar({ usuario, className }) {
  const src = avatarSrc(usuario?.avatar);
  return (
    <span className={cx('rounded-full bg-aji text-sobre-aji grid place-items-center font-display font-bold overflow-hidden', className)}>
      {src ? <img src={src} alt="" className="w-full h-full object-cover" /> : iniciales(usuario?.nombre)}
    </span>
  );
}

function MenuUsuario({ onCerrar }) {
  const usuario = useAuthStore((s) => s.usuario);
  const logout = useAuthStore((s) => s.logout);
  const { modo, setModo } = useTemaStore();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const ir = (to) => { onCerrar(); navigate(to); };
  const [verImpresora, setVerImpresora] = useState(false);

  if (verImpresora) {
    return (
      <Hoja onCerrar={onCerrar} ancho="max-w-sm" titulo="Impresora de este dispositivo" subtitulo="Para cajas que imprimen por Bluetooth directo.">
        <button className="btn-fantasma -ml-3 mb-3" onClick={() => setVerImpresora(false)}><ArrowLeft className="w-4 h-4" /> Volver</button>
        <ImpresoraDispositivo compacto />
      </Hoja>
    );
  }

  return (
    <Hoja onCerrar={onCerrar} ancho="max-w-sm">
      <div className="flex items-center gap-3 pt-5 pb-4">
        <Avatar usuario={usuario} className="w-12 h-12 text-lg" />
        <div className="min-w-0">
          <p className="font-display font-bold text-lg leading-tight truncate">{usuario?.nombre}</p>
          <p className="text-sm text-tenue truncate">{usuario?.rol} · {usuario?.sucursal_activa?.nombre ?? 'Todas las sucursales'}</p>
        </div>
      </div>
      <div className="space-y-1">
        <button className="btn-fantasma w-full justify-start" onClick={() => ir('/perfil')}><UserRound className="w-4 h-4" /> Mi perfil</button>
        <button className="btn-fantasma w-full justify-start" onClick={() => ir('/mi-asistencia')}><Clock className="w-4 h-4" /> Marcar asistencia</button>
        <button className="btn-fantasma w-full justify-start" onClick={() => setVerImpresora(true)}><Bluetooth className="w-4 h-4" /> Impresora de este dispositivo</button>
      </div>
      <p className="etiqueta mt-4">Apariencia</p>
      <div className="grid grid-cols-3 gap-2">
        {[['sistema', 'Automático', Monitor], ['claro', 'Claro', Sun], ['oscuro', 'Oscuro', Moon]].map(([v, t, I]) => (
          <button key={v} onClick={() => setModo(v)} className={cx('rounded-xl border p-3 flex flex-col items-center gap-1.5 text-[13px] font-medium', modo === v ? 'border-tinta bg-hundido' : 'border-linea')}>
            <I className="w-4 h-4" /> {t}
          </button>
        ))}
      </div>
      <button
        className="btn-borde w-full mt-5 text-locoto"
        onClick={() => { logout(); qc.clear(); navigate('/login'); }}
      >
        <LogOut className="w-4 h-4" /> Cerrar sesión
      </button>
    </Hoja>
  );
}

export default function Shell() {
  const usuario = useAuthStore((s) => s.usuario);
  const { permisos } = usePermisos();
  const secciones = useMemo(() => seccionesVisibles(permisos), [permisos]);
  const [paleta, setPaleta] = useState(false);
  const [menuUsuario, setMenuUsuario] = useState(false);
  const [mas, setMas] = useState(false);
  const enLinea = useEnLinea();
  const { pathname } = useLocation();

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPaleta((v) => !v); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Pantallas de trabajo a pantalla completa en el celular (sin barra abajo).
  const inmersiva = /^\/vender\/pedido|^\/cocina\/bluetooth/.test(pathname);
  // Pantallas que manejan su propio scroll interno (catálogo + comanda).
  const ajustada = pathname === '/vender';
  const principales = secciones.filter((s) => s.principal).slice(0, 4);
  const resto = secciones.filter((s) => !principales.includes(s));

  return (
    <div className="h-full flex">
      {/* Riel lateral (tablet y escritorio) */}
      <nav className="hidden md:flex w-[84px] shrink-0 flex-col items-center bg-pizarra text-sobre-pizarra py-4 gap-1 z-30" aria-label="Secciones">
        <Marca compacto />
        <button onClick={() => setPaleta(true)} className="mt-4 mb-2 w-12 h-10 rounded-xl grid place-items-center text-sobre-pizarra/70 hover:bg-white/10 hover:text-white" title="Buscar (Ctrl+K)" aria-label="Buscar">
          <Search className="w-5 h-5" />
        </button>
        <div className="flex-1 w-full overflow-y-auto sin-scroll flex flex-col items-center gap-1 px-2">
          {secciones.map((s) => (
            <NavLink
              key={s.to}
              to={s.hijos ? s.hijos[0].to : s.to}
              end={s.fin}
              className={({ isActive }) => {
                const activa = isActive || (s.hijos && pathname.startsWith(s.to));
                return cx(
                  'group w-full rounded-xl flex flex-col items-center gap-0.5 py-1.5 text-[11px] font-semibold transition-colors',
                  activa ? 'bg-aji text-sobre-aji' : 'text-sobre-pizarra/65 hover:text-white hover:bg-white/8',
                );
              }}
            >
              <s.Icono className="w-5 h-5" strokeWidth={2} />
              {s.etiqueta}
            </NavLink>
          ))}
        </div>
        {!enLinea && <WifiOff className="w-5 h-5 text-locoto my-2" aria-label="Sin conexión" />}
        <button onClick={() => setMenuUsuario(true)} className="mt-2 rounded-full ring-2 ring-white/10 hover:ring-aji" aria-label="Mi cuenta">
          <Avatar usuario={usuario} className="w-10 h-10 text-sm" />
        </button>
      </nav>

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Barra superior (solo celular) */}
        {!inmersiva && (
          <header className="md:hidden sticky top-0 z-20 flex items-center gap-2 px-4 h-14 bg-fondo/90 backdrop-blur border-b border-linea" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
            <Marca />
            <p className="flex-1 font-display font-bold truncate">{usuario?.sucursal_activa?.nombre ?? 'Todas las sucursales'}</p>
            {!enLinea && <WifiOff className="w-5 h-5 text-locoto" aria-label="Sin conexión" />}
            <button className="btn-icono btn-fantasma" onClick={() => setPaleta(true)} aria-label="Buscar"><Search className="w-5 h-5" /></button>
            <button onClick={() => setMenuUsuario(true)} aria-label="Mi cuenta"><Avatar usuario={usuario} className="w-9 h-9 text-xs" /></button>
          </header>
        )}

        {!enLinea && (
          <div className="bg-locoto text-white text-[13px] text-center py-1.5 px-4">
            Sin conexión. Puedes ver el menú, pero no se registran ventas hasta que vuelva el internet.
          </div>
        )}

        <main className={cx('flex-1 min-h-0', ajustada ? 'overflow-hidden' : 'overflow-y-auto', !inmersiva && (ajustada ? 'pb-16 md:pb-0' : 'pb-20 md:pb-0'))}>
          <Outlet />
        </main>

        {/* Barra inferior (celular) */}
        {!inmersiva && (
          <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-pizarra text-sobre-pizarra pb-seguro" aria-label="Secciones">
            <div className="flex h-16">
              {principales.map((s) => (
                <NavLink
                  key={s.to}
                  to={s.hijos ? s.hijos[0].to : s.to}
                  end={s.fin}
                  className={({ isActive }) => cx('flex-1 flex flex-col items-center justify-center gap-1 text-[11px] font-semibold', isActive ? 'text-aji' : 'text-sobre-pizarra/60')}
                >
                  <s.Icono className="w-[22px] h-[22px]" />
                  {s.etiqueta}
                </NavLink>
              ))}
              {resto.length > 0 && (
                <button onClick={() => setMas(true)} className="flex-1 flex flex-col items-center justify-center gap-1 text-[11px] font-semibold text-sobre-pizarra/60">
                  <MoreHorizontal className="w-[22px] h-[22px]" /> Más
                </button>
              )}
            </div>
          </nav>
        )}
      </div>

      {mas && (
        <Hoja onCerrar={() => setMas(false)} titulo="Todo el sistema">
          <div className="grid grid-cols-3 gap-2">
            {resto.map((s) => (
              <NavLink key={s.to} to={s.hijos ? s.hijos[0].to : s.to} onClick={() => setMas(false)} className="rounded-2xl bg-hundido p-4 flex flex-col items-center gap-2 text-[13px] font-semibold text-center">
                <s.Icono className="w-6 h-6" /> {s.etiqueta}
              </NavLink>
            ))}
          </div>
        </Hoja>
      )}
      {paleta && <Paleta onCerrar={() => setPaleta(false)} />}
      {menuUsuario && <MenuUsuario onCerrar={() => setMenuUsuario(false)} />}
      {usuario?.debe_cambiar_contrasena && <CambioContrasena />}
      <ActualizarApp />
      <CocinaPendienteBT />
    </div>
  );
}
