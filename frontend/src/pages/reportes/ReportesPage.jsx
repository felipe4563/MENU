import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart2, FileText, Package, Truck, BookOpen, Trophy, ListTree, Landmark, Wallet } from 'lucide-react';
import { getConfiguracion, logoSrc } from '../../api/configuracion';
import { usePermisos } from '../../hooks/usePermisos';
import TabVentas     from './tabs/TabVentas';
import TabProductos  from './tabs/TabProductos';
import TabVariantes  from './tabs/TabVariantes';
import TabInventario from './tabs/TabInventario';
import TabCompras    from './tabs/TabCompras';
import TabCaja       from './tabs/TabCaja';
import TabArqueos    from './tabs/TabArqueos';
import TabFinanzas   from './tabs/TabFinanzas';

const TABS = [
  { id: 'ventas',     label: 'Ventas',        Icono: FileText, Comp: TabVentas },
  { id: 'productos',  label: 'Más vendidos',  Icono: Trophy,   Comp: TabProductos },
  { id: 'variantes',  label: 'Variantes',     Icono: ListTree, Comp: TabVariantes },
  { id: 'inventario', label: 'Inventario',    Icono: Package,  Comp: TabInventario },
  { id: 'compras',    label: 'Compras',       Icono: Truck,    Comp: TabCompras },
  { id: 'caja',       label: 'Caja',          Icono: BookOpen, Comp: TabCaja },
  { id: 'arqueos',    label: 'Arqueos',       Icono: Landmark, Comp: TabArqueos },
  { id: 'finanzas',   label: 'Finanzas',      Icono: Wallet,   Comp: TabFinanzas },
];

export default function ReportesPage() {
  const { tienePermiso } = usePermisos();
  const [tab, setTab] = useState('ventas');

  const { data: config = {} } = useQuery({
    queryKey: ['configuracion'],
    queryFn: getConfiguracion,
    staleTime: 5 * 60 * 1000,
  });

  const empresaInfo = {
    empresa:   config.nombre_negocio || 'RESTAURANTE',
    logo:      logoSrc(config.logo),
    direccion: config.direccion,
    telefono:  config.telefono,
  };

  if (!tienePermiso('reportes', 'ver')) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        No tienes permiso para ver reportes.
      </div>
    );
  }

  const tabActivo = TABS.find(t => t.id === tab) || TABS[0];
  const TabActivo = tabActivo.Comp;

  return (
    <>
      <style>{`
        @keyframes rpFadeUp {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-primary/10 rounded-xl shrink-0">
            <BarChart2 className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-foreground">Reportes</h1>
            <p className="text-xs text-muted-foreground">Filtra, analiza y exporta datos del negocio</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="grid grid-cols-3 sm:flex sm:flex-wrap gap-2">
          {TABS.map(({ id, label, Icono }) => (
            <button key={id} onClick={() => setTab(id)}
              className={`flex items-center justify-center gap-1.5 sm:gap-2 px-3 py-2.5 rounded-xl text-xs sm:text-sm font-medium transition-colors border ${
                tab === id
                  ? 'bg-primary text-primary-foreground border-primary shadow-sm shadow-primary/20'
                  : 'bg-card text-muted-foreground border-border hover:text-foreground hover:bg-muted/50'
              }`}>
              <Icono className="w-4 h-4 shrink-0" />
              <span className="truncate">{label}</span>
            </button>
          ))}
        </div>

        <div className="bg-card rounded-2xl border border-border shadow-sm p-3 sm:p-6">
          {TabActivo && <TabActivo {...empresaInfo} />}
        </div>
      </div>
    </>
  );
}
