import { useEffect, useRef, useState } from 'react';
import { NavLink, Navigate, Outlet, useLocation } from 'react-router-dom';
import { ChevronDown, ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { usePermisos } from '../../hooks/usePermisos';
import { SECCIONES, puedeVer } from './navegacion';
import Hoja from '../ui/Hoja';
import { cx } from '../../lib/util';

// Más de estas pestañas no entran en el celular: ahí se elige desde una lista.
const MAX_PESTANAS_CELULAR = 3;

// Pestañas que se deslizan de lado; si no entran todas, aparecen flechas y la
// pestaña activa siempre queda a la vista.
function Pestanas({ hijos, pathname }) {
  const ref = useRef(null);
  const [lados, setLados] = useState({ izq: false, der: false });

  const centrar = () => {
    const el = ref.current;
    const activa = el?.querySelector('[aria-current="page"]');
    if (el && activa) el.scrollLeft = activa.offsetLeft - (el.clientWidth - activa.offsetWidth) / 2;
  };
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    let centrada = false;
    const medir = () => {
      // Si estaba oculta (celular) y ahora se ve, se lleva la activa a la vista.
      if (!centrada && el.clientWidth > 0) { centrada = true; centrar(); }
      setLados({
        izq: el.scrollLeft > 4,
        der: el.scrollLeft + el.clientWidth < el.scrollWidth - 4,
      });
    };
    medir();
    el.addEventListener('scroll', medir, { passive: true });
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    return () => { el.removeEventListener('scroll', medir); obs.disconnect(); };
  }, []);

  useEffect(centrar, [pathname]);

  const mover = (dir) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.7, behavior: 'smooth' });

  return (
    <div className="relative min-w-0 flex-1">
      <nav ref={ref} className="flex gap-1 overflow-x-auto sin-scroll -mb-px scroll-smooth" aria-label="Pestañas">
        {hijos.map((h) => (
          <NavLink
            key={h.to}
            to={h.to}
            className={({ isActive }) => cx(
              'shrink-0 flex items-center gap-2 h-12 px-3 text-sm font-semibold border-b-2 transition-colors',
              isActive ? 'border-aji text-tinta' : 'border-transparent text-tenue hover:text-tinta',
            )}
          >
            <h.Icono className="w-4 h-4" /> {h.etiqueta}
          </NavLink>
        ))}
      </nav>
      {lados.izq && (
        <button type="button" onClick={() => mover(-1)} aria-label="Ver pestañas anteriores"
          className="absolute left-0 inset-y-0 w-12 flex items-center justify-start bg-gradient-to-r from-fondo via-fondo/90 to-transparent">
          <span className="w-8 h-8 rounded-full bg-papel border border-linea shadow-sm grid place-items-center"><ChevronLeft className="w-4 h-4" /></span>
        </button>
      )}
      {lados.der && (
        <button type="button" onClick={() => mover(1)} aria-label="Ver más pestañas"
          className="absolute right-0 inset-y-0 w-12 flex items-center justify-end bg-gradient-to-l from-fondo via-fondo/90 to-transparent">
          <span className="w-8 h-8 rounded-full bg-papel border border-linea shadow-sm grid place-items-center"><ChevronRight className="w-4 h-4" /></span>
        </button>
      )}
    </div>
  );
}

// En el celular: un botón con la pantalla actual que abre la lista completa.
function Selector({ seccion, hijos, pathname }) {
  const [abierto, setAbierto] = useState(false);
  const actual = hijos.find((h) => pathname.startsWith(h.to)) ?? hijos[0];
  return (
    <>
      <button type="button" onClick={() => setAbierto(true)} aria-haspopup="dialog"
        className="w-full my-2 flex items-center gap-3 rounded-xl bg-papel border border-linea px-3 h-12 text-left active:bg-hundido">
        <span className="w-8 h-8 rounded-lg bg-hundido grid place-items-center shrink-0"><actual.Icono className="w-4 h-4" /></span>
        <span className="flex-1 min-w-0">
          <span className="block text-[11px] text-tenue leading-tight">{seccion.etiqueta} · {hijos.indexOf(actual) + 1} de {hijos.length}</span>
          <span className="block font-semibold truncate leading-tight">{actual.etiqueta}</span>
        </span>
        <span className="flex items-center gap-1 text-[13px] font-semibold text-tenue shrink-0">Cambiar <ChevronDown className="w-4 h-4" /></span>
      </button>
      {abierto && (
        <Hoja onCerrar={() => setAbierto(false)} titulo={seccion.etiqueta} ancho="max-w-sm">
          <nav className="grid gap-1 pb-2" aria-label={seccion.etiqueta}>
            {hijos.map((h) => {
              const activa = h === actual;
              return (
                <NavLink key={h.to} to={h.to} onClick={() => setAbierto(false)}
                  className={cx('flex items-center gap-3 rounded-xl px-3 h-14 font-semibold', activa ? 'bg-hundido text-tinta' : 'text-tinta/85 active:bg-hundido')}>
                  <span className={cx('w-9 h-9 rounded-lg grid place-items-center shrink-0', activa ? 'bg-aji text-sobre-aji' : 'bg-hundido')}><h.Icono className="w-4 h-4" /></span>
                  <span className="flex-1">{h.etiqueta}</span>
                  {activa && <Check className="w-5 h-5 text-aji" />}
                </NavLink>
              );
            })}
          </nav>
        </Hoja>
      )}
    </>
  );
}

// Sección con pestañas (Menú, Clientes, Inventario…). Las pestañas salen de
// navegacion.js filtradas por permiso.
export default function Seccion({ base }) {
  const { permisos } = usePermisos();
  const { pathname } = useLocation();
  const seccion = SECCIONES.find((s) => s.to === base);
  const hijos = seccion.hijos.filter((h) => puedeVer(h, permisos));
  if (!hijos.length) return <Navigate to="/" replace />;
  if (pathname === base || pathname === `${base}/`) return <Navigate to={hijos[0].to} replace />;
  const conSelector = hijos.length > MAX_PESTANAS_CELULAR;

  return (
    <div className="min-h-full flex flex-col">
      <div className="sticky top-0 md:top-0 z-10 bg-fondo/92 backdrop-blur border-b border-linea">
        <div className="px-4 sm:px-6 lg:px-8 2xl:px-10 flex items-center gap-6">
          <p className="hidden sm:block font-display font-bold text-lg py-3 shrink-0">{seccion.etiqueta}</p>
          {conSelector && <div className="sm:hidden flex-1 min-w-0"><Selector seccion={seccion} hijos={hijos} pathname={pathname} /></div>}
          <div className={cx('min-w-0 flex-1', conSelector ? 'hidden sm:flex' : 'flex')}>
            <Pestanas hijos={hijos} pathname={pathname} />
          </div>
        </div>
      </div>
      <div className="flex-1"><Outlet /></div>
    </div>
  );
}
