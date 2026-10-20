import {
  LayoutDashboard, UtensilsCrossed, Wallet, BookOpen,
  Package, Boxes, Truck, Users, UserCog, Shield, Settings,
  BarChart2, ChefHat, Building2, Landmark, Store, Grid3x3,
  Gift, Tag, Star, Ticket, Cake, Disc3, Wheat, Printer, Plug,
  Clock, UserCheck,
} from 'lucide-react';

// Estructura del menú lateral, reutilizada también por LoginPage para saber
// a qué pantalla mandar a cada usuario apenas entra (ver primeraRutaDisponible).
export const NAV_GROUPS = [
  {
    key: 'operacion',
    label: 'Operación',
    items: [
      { to: '/',           label: 'Dashboard',    Icono: LayoutDashboard, modulo: 'dashboard', accion: 'ver' },
      { to: '/ventas',     label: 'Ventas / POS',  Icono: UtensilsCrossed, modulo: 'ventas',     accion: 'ver' },
      { to: '/pedidos-externos', label: 'Pedidos externos', Icono: Truck, modulo: 'pedidos_externos', accion: 'ver' },
      { to: '/cocina',     label: 'Cocina',        Icono: ChefHat,         modulo: 'cocina',     accion: 'ver' },
      { to: '/pantalla-cocina-impresion', label: 'Pantalla Cocina (BT)', Icono: Printer, modulo: 'cocina', accion: 'ver' },
      { to: '/mi-asistencia', label: 'Mi Asistencia', Icono: Clock, siempre: true },
    ],
  },
  {
    key: 'finanzas',
    label: 'Caja y Finanzas',
    items: [
      { to: '/caja',       label: 'Caja',          Icono: Wallet,          modulo: 'caja',       accion: 'ver' },
      { to: '/libro-caja', label: 'Libro Caja',    Icono: BookOpen,        modulo: 'libro_caja', accion: 'ver' },
      { to: '/reportes',   label: 'Reportes',      Icono: BarChart2,       modulo: 'reportes',   accion: 'ver' },
    ],
  },
  {
    key: 'menu',
    label: 'Menú',
    items: [
      { to: '/productos',    label: 'Productos',    Icono: Package, modulo: 'inventario',   accion: 'ver' },
      { to: '/combos',       label: 'Combos',       Icono: Gift,    modulo: 'combos',       accion: 'ver' },
    ],
  },
  {
    key: 'marketing',
    label: 'Clientes y Marketing',
    items: [
      { to: '/clientes',     label: 'Clientes',     Icono: Users,   modulo: 'ventas',       accion: 'ver' },
      { to: '/promociones',  label: 'Promociones',  Icono: Tag,     modulo: 'promociones',  accion: 'ver' },
      { to: '/cupones',      label: 'Cupones',      Icono: Ticket,  modulo: 'cupones',      accion: 'ver' },
      { to: '/ruleta',       label: 'Ruleta',       Icono: Disc3,   modulo: 'ruleta',       accion: 'girar' },
    ],
  },
  {
    key: 'inventario',
    label: 'Inventario',
    items: [
      { to: '/inventario',   label: 'Inventario',   Icono: Boxes,   modulo: 'inventario',   accion: 'ajustar' },
      { to: '/insumos',      label: 'Insumos',      Icono: Wheat,   modulo: 'insumos',      accion: 'ver' },
      { to: '/compras',      label: 'Compras',      Icono: Truck,   modulo: 'compras',      accion: 'ver' },
    ],
  },
  {
    key: 'equipo',
    label: 'Equipo',
    items: [
      { to: '/usuarios',      label: 'Usuarios',      Icono: UserCog,   modulo: 'usuarios',      accion: 'ver' },
      { to: '/roles',         label: 'Roles',         Icono: Shield,    modulo: 'roles',         accion: 'ver' },
      { to: '/personal',      label: 'Control de Personal', Icono: UserCheck, modulo: 'personal', accion: 'administrar' },
    ],
  },
  {
    key: 'administracion',
    label: 'Administración',
    items: [
      { to: '/sucursales',    label: 'Sucursales',    Icono: Building2, modulo: 'sucursales',    accion: 'ver' },
      { to: '/cajas',         label: 'Cajas',         Icono: Landmark,  modulo: 'cajas',         accion: 'ver' },
      {
        to: '/configuracion', label: 'Configuración', Icono: Settings, modulo: 'configuracion', accion: 'ver',
        subItems: [
          { to: '/configuracion/negocio', label: 'Negocio',      Icono: Store },
          { to: '/configuracion/areas',   label: 'Áreas',        Icono: Building2 },
          { to: '/configuracion/mesas',   label: 'Mesas',        Icono: Grid3x3 },
          { to: '/configuracion/flujo',   label: 'Flujo Cocina', Icono: ChefHat },
          { to: '/configuracion/fidelidad', label: 'Fidelidad', Icono: Star },
          { to: '/configuracion/cumpleanos', label: 'Cumpleaños', Icono: Cake },
          { to: '/configuracion/ruleta', label: 'Ruleta', Icono: Disc3 },
          { to: '/configuracion/integraciones', label: 'Integraciones', Icono: Plug },
        ],
      },
    ],
  },
];
