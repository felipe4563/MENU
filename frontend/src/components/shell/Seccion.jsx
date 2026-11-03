import { NavLink, Navigate, Outlet, useLocation } from 'react-router-dom';
import { usePermisos } from '../../hooks/usePermisos';
import { SECCIONES, puedeVer } from './navegacion';
import { cx } from '../../lib/util';

// Sección con pestañas (Menú, Clientes, Inventario…). Las pestañas salen de
// navegacion.js filtradas por permiso.
export default function Seccion({ base }) {
  const { permisos } = usePermisos();
  const { pathname } = useLocation();
  const seccion = SECCIONES.find((s) => s.to === base);
  const hijos = seccion.hijos.filter((h) => puedeVer(h, permisos));
  if (!hijos.length) return <Navigate to="/" replace />;
  if (pathname === base || pathname === `${base}/`) return <Navigate to={hijos[0].to} replace />;

  return (
    <div className="min-h-full flex flex-col">
      <div className="sticky top-0 md:top-0 z-10 bg-fondo/92 backdrop-blur border-b border-linea">
        <div className="px-4 sm:px-6 lg:px-8 2xl:px-10 flex items-center gap-6">
          <p className="hidden sm:block font-display font-bold text-lg py-3">{seccion.etiqueta}</p>
          <nav className="flex gap-1 overflow-x-auto sin-scroll -mb-px">
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
        </div>
      </div>
      <div className="flex-1"><Outlet /></div>
    </div>
  );
}
