import {
  Sun, ShoppingBag, ChefHat, Wallet, BookOpen, Truck, UtensilsCrossed, Users, Boxes,
  BarChart3, UsersRound, Settings2, Clock, Package, Gift, Layers, Tag, Ticket, Disc3,
  Wheat, ShoppingCart, Shield, UserCheck, Building2, Landmark, Grid3x3, Store, Star,
  Cake, Plug, Workflow, Receipt, History, Printer, QrCode,
} from 'lucide-react';

// Cada destino: `ver` dice qué permiso lo muestra. Los `hijos` se muestran
// como pestañas dentro de la sección y también en el buscador (Ctrl+K).
export const SECCIONES = [
  { to: '/', etiqueta: 'Hoy', Icono: Sun, ver: ['dashboard.ver'], fin: true, principal: true },
  { to: '/vender', etiqueta: 'Vender', Icono: ShoppingBag, ver: ['ventas.ver'], principal: true },
  { to: '/cocina', etiqueta: 'Cocina', Icono: ChefHat, ver: ['cocina.ver'], principal: true },
  { to: '/caja', etiqueta: 'Caja', Icono: Wallet, ver: ['caja.ver'], principal: true },
  { to: '/externos', etiqueta: 'Delivery', Icono: Truck, ver: ['pedidos_externos.ver'] },
  {
    to: '/menu', etiqueta: 'Menú', Icono: UtensilsCrossed, ver: ['productos.ver', 'combos.ver', 'inventario.ver'],
    hijos: [
      { to: '/menu/productos', etiqueta: 'Productos', Icono: Package, ver: ['productos.ver', 'inventario.ver'] },
      { to: '/menu/categorias', etiqueta: 'Categorías', Icono: Layers, ver: ['productos.ver'] },
      { to: '/menu/opciones', etiqueta: 'Opciones', Icono: Workflow, ver: ['productos.ver'] },
      { to: '/menu/combos', etiqueta: 'Combos', Icono: Gift, ver: ['combos.ver'] },
    ],
  },
  {
    to: '/clientes', etiqueta: 'Clientes', Icono: Users, ver: ['clientes.ver', 'promociones.ver', 'cupones.ver', 'ruleta.girar', 'ventas.ver'],
    hijos: [
      { to: '/clientes/lista', etiqueta: 'Clientes', Icono: Users, ver: ['clientes.ver', 'ventas.ver'] },
      { to: '/clientes/promociones', etiqueta: 'Promociones', Icono: Tag, ver: ['promociones.ver'] },
      { to: '/clientes/cupones', etiqueta: 'Cupones', Icono: Ticket, ver: ['cupones.ver'] },
      { to: '/clientes/ruleta', etiqueta: 'Ruleta', Icono: Disc3, ver: ['ruleta.girar', 'ruleta.ver'] },
    ],
  },
  {
    to: '/inventario', etiqueta: 'Inventario', Icono: Boxes, ver: ['inventario.ajustar', 'insumos.ver', 'compras.ver'],
    hijos: [
      { to: '/inventario/stock', etiqueta: 'Stock', Icono: Boxes, ver: ['inventario.ajustar', 'inventario.ver'] },
      { to: '/inventario/insumos', etiqueta: 'Insumos', Icono: Wheat, ver: ['insumos.ver'] },
      { to: '/inventario/compras', etiqueta: 'Compras', Icono: ShoppingCart, ver: ['compras.ver'] },
      { to: '/inventario/proveedores', etiqueta: 'Proveedores', Icono: Truck, ver: ['proveedores.ver'] },
    ],
  },
  {
    to: '/finanzas', etiqueta: 'Finanzas', Icono: BarChart3, ver: ['reportes.ver', 'libro_caja.ver'],
    hijos: [
      { to: '/finanzas/reportes', etiqueta: 'Reportes', Icono: BarChart3, ver: ['reportes.ver'] },
      { to: '/finanzas/libro', etiqueta: 'Libro de caja', Icono: BookOpen, ver: ['libro_caja.ver'] },
      { to: '/finanzas/turnos', etiqueta: 'Turnos de caja', Icono: History, ver: ['caja.ver'] },
    ],
  },
  {
    to: '/equipo', etiqueta: 'Equipo', Icono: UsersRound, ver: ['usuarios.ver', 'roles.ver', 'personal.administrar'],
    hijos: [
      { to: '/equipo/usuarios', etiqueta: 'Usuarios', Icono: UsersRound, ver: ['usuarios.ver'] },
      { to: '/equipo/roles', etiqueta: 'Roles y permisos', Icono: Shield, ver: ['roles.ver'] },
      { to: '/equipo/asistencia', etiqueta: 'Asistencia', Icono: UserCheck, ver: ['personal.administrar'] },
    ],
  },
  {
    to: '/ajustes', etiqueta: 'Ajustes', Icono: Settings2, ver: ['configuracion.ver', 'sucursales.ver', 'cajas.ver'],
    hijos: [
      { to: '/ajustes/negocio', etiqueta: 'Negocio y marca', Icono: Store, ver: ['configuracion.ver'] },
      { to: '/ajustes/salon', etiqueta: 'Salón y mesas', Icono: Grid3x3, ver: ['configuracion.ver'] },
      { to: '/ajustes/sucursales', etiqueta: 'Sucursales', Icono: Building2, ver: ['sucursales.ver'] },
      { to: '/ajustes/cajas', etiqueta: 'Cajas e impresión', Icono: Landmark, ver: ['cajas.ver'] },
      { to: '/ajustes/cocina', etiqueta: 'Flujo de cocina', Icono: ChefHat, ver: ['configuracion.ver'] },
      { to: '/ajustes/fidelidad', etiqueta: 'Puntos y cumpleaños', Icono: Star, ver: ['configuracion.ver'] },
      { to: '/ajustes/cobro-qr', etiqueta: 'Cobro con QR', Icono: QrCode, ver: ['configuracion.ver'] },
      { to: '/ajustes/integraciones', etiqueta: 'Integraciones', Icono: Plug, ver: ['configuracion.ver'] },
    ],
  },
];

// Accesos que no son secciones, pero que el buscador ofrece.
export const EXTRAS = [
  { to: '/vender/mis-ventas', etiqueta: 'Mis ventas de hoy', Icono: Receipt, ver: ['ventas.ver'] },
  { to: '/cocina/bluetooth', etiqueta: 'Pantalla de impresión de cocina', Icono: Printer, ver: ['cocina.ver'] },
  { to: '/mi-asistencia', etiqueta: 'Marcar asistencia', Icono: Clock, ver: [] },
  { to: '/perfil', etiqueta: 'Mi perfil', Icono: Cake, ver: [] },
];

export const puedeVer = (item, permisos) => !item.ver?.length || item.ver.some((p) => permisos.includes(p));

export function seccionesVisibles(permisos) {
  return SECCIONES
    .filter((s) => puedeVer(s, permisos))
    .map((s) => (s.hijos ? { ...s, hijos: s.hijos.filter((h) => puedeVer(h, permisos)) } : s))
    .filter((s) => !s.hijos || s.hijos.length);
}

export function primeraRuta(permisos = []) {
  const s = seccionesVisibles(permisos)[0];
  if (!s) return '/perfil';
  return s.hijos?.[0]?.to ?? s.to;
}
