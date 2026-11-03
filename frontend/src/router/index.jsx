import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import Protegida from './Protegida';
import Shell from '../components/shell/Shell';
import Seccion from '../components/shell/Seccion';
import LoginPage from '../pages/auth/LoginPage';
import { Cargando } from '../components/ui/piezas';

const l = (fn) => {
  const C = lazy(fn);
  return (
    <Suspense fallback={<Cargando />}>
      <C />
    </Suspense>
  );
};

const futuro = {
  v7_relativeSplatPath: true,
  v7_fetcherPersist: true,
  v7_normalizeFormMethod: true,
  v7_partialHydration: true,
  v7_skipActionErrorRevalidation: true,
};

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  // Menú público de autoservicio (los QR impresos de las mesas apuntan acá).
  { path: '/m/:codigo', element: l(() => import('../pages/autoservicio/AutoservicioPage')) },
  {
    element: <Protegida><Shell /></Protegida>,
    children: [
      { path: '/', element: l(() => import('../pages/hoy/HoyPage')) },
      { path: '/vender', element: l(() => import('../pages/vender/VenderPage')) },
      { path: '/vender/pedido/:id', element: l(() => import('../pages/vender/PedidoPage')) },
      { path: '/vender/mis-ventas', element: l(() => import('../pages/vender/MisVentasPage')) },
      { path: '/cocina', element: l(() => import('../pages/cocina/CocinaPage')) },
      { path: '/cocina/bluetooth', element: l(() => import('../pages/cocina/CocinaBluetoothPage')) },
      { path: '/caja', element: l(() => import('../pages/caja/CajaPage')) },
      { path: '/caja/cierre/:id', element: l(() => import('../pages/caja/ReporteCierrePage')) },
      { path: '/externos', element: l(() => import('../pages/externos/ExternosPage')) },
      {
        path: '/menu', element: <Seccion base="/menu" />,
        children: [
          { path: 'productos', element: l(() => import('../pages/menu/ProductosPage')) },
          { path: 'categorias', element: l(() => import('../pages/menu/CategoriasPage')) },
          { path: 'opciones', element: l(() => import('../pages/menu/OpcionesPage')) },
          { path: 'combos', element: l(() => import('../pages/menu/CombosPage')) },
        ],
      },
      {
        path: '/clientes', element: <Seccion base="/clientes" />,
        children: [
          { path: 'lista', element: l(() => import('../pages/clientes/ClientesPage')) },
          { path: 'promociones', element: l(() => import('../pages/clientes/PromocionesPage')) },
          { path: 'cupones', element: l(() => import('../pages/clientes/CuponesPage')) },
          { path: 'ruleta', element: l(() => import('../pages/clientes/RuletaPage')) },
        ],
      },
      {
        path: '/inventario', element: <Seccion base="/inventario" />,
        children: [
          { path: 'stock', element: l(() => import('../pages/inventario/StockPage')) },
          { path: 'insumos', element: l(() => import('../pages/inventario/InsumosPage')) },
          { path: 'compras', element: l(() => import('../pages/inventario/ComprasPage')) },
          { path: 'proveedores', element: l(() => import('../pages/inventario/ProveedoresPage')) },
        ],
      },
      {
        path: '/finanzas', element: <Seccion base="/finanzas" />,
        children: [
          { path: 'reportes', element: l(() => import('../pages/finanzas/ReportesPage')) },
          { path: 'platos', element: l(() => import('../pages/finanzas/GananciaPlatosPage')) },
          { path: 'libro', element: l(() => import('../pages/finanzas/LibroCajaPage')) },
          { path: 'turnos', element: l(() => import('../pages/finanzas/TurnosPage')) },
        ],
      },
      {
        path: '/equipo', element: <Seccion base="/equipo" />,
        children: [
          { path: 'usuarios', element: l(() => import('../pages/equipo/UsuariosPage')) },
          { path: 'roles', element: l(() => import('../pages/equipo/RolesPage')) },
          { path: 'asistencia', element: l(() => import('../pages/equipo/AsistenciaPage')) },
        ],
      },
      {
        path: '/ajustes', element: <Seccion base="/ajustes" />,
        children: [
          { path: 'negocio', element: l(() => import('../pages/ajustes/NegocioPage')) },
          { path: 'salon', element: l(() => import('../pages/ajustes/SalonPage')) },
          { path: 'sucursales', element: l(() => import('../pages/ajustes/SucursalesPage')) },
          { path: 'cajas', element: l(() => import('../pages/ajustes/CajasPage')) },
          { path: 'cocina', element: l(() => import('../pages/ajustes/CocinaFlujoPage')) },
          { path: 'fidelidad', element: l(() => import('../pages/ajustes/FidelidadPage')) },
          { path: 'cobro-qr', element: l(() => import('../pages/ajustes/CobroQrPage')) },
          { path: 'integraciones', element: l(() => import('../pages/ajustes/IntegracionesPage')) },
        ],
      },
      { path: '/perfil', element: l(() => import('../pages/perfil/PerfilPage')) },
      { path: '/mi-asistencia', element: l(() => import('../pages/perfil/MiAsistenciaPage')) },

      // Rutas del sistema anterior (accesos directos instalados, marcadores).
      { path: '/ventas', element: <Navigate to="/vender" replace /> },
      { path: '/ventas/mis-ventas', element: <Navigate to="/vender/mis-ventas" replace /> },
      { path: '/pedidos-externos', element: <Navigate to="/externos" replace /> },
      { path: '/pantalla-cocina-impresion', element: <Navigate to="/cocina/bluetooth" replace /> },
      { path: '/productos', element: <Navigate to="/menu/productos" replace /> },
      { path: '/reportes', element: <Navigate to="/finanzas/reportes" replace /> },
      { path: '/libro-caja', element: <Navigate to="/finanzas/libro" replace /> },
      { path: '/configuracion/*', element: <Navigate to="/ajustes" replace /> },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
], { future: futuro });
