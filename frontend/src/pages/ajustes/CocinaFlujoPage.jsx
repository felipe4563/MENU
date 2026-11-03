import { Monitor, Printer, Building, Smartphone } from 'lucide-react';
import { usePermisos } from '../../hooks/usePermisos';
import { Cargando, Encabezado, Interruptor, Pagina, SinPermiso } from '../../components/ui/piezas';
import { useConfiguracion, OpcionTarjeta, Seccion } from './comun';

export default function CocinaFlujoPage() {
  const { tiene } = usePermisos();
  const { config, cargando, guardar } = useConfiguracion();
  if (!tiene('configuracion', 'ver')) return <SinPermiso />;
  if (cargando) return <Cargando />;
  const editar = tiene('configuracion', 'editar') && !guardar.isPending;
  const flujo = config.flujo_cocina ?? 'digital';
  const destino = config.cocina_destino ?? 'centralizada';

  return (
    <Pagina>
      <Encabezado titulo="Flujo de cocina" texto="Cómo llegan los pedidos a la cocina." />
      <Seccion titulo="¿Cómo trabaja la cocina?">
        <div className="grid sm:grid-cols-2 gap-3">
          <OpcionTarjeta disabled={!editar} activa={flujo === 'digital'} onClick={() => guardar.mutate({ flujo_cocina: 'digital' })} Icono={Monitor} titulo="Con pantalla" texto="Los pedidos aparecen en la pantalla Cocina. La cocina marca “Listo” y el mesero lo ve al instante." />
          <OpcionTarjeta disabled={!editar} activa={flujo === 'fisico'} onClick={() => guardar.mutate({ flujo_cocina: 'fisico' })} Icono={Printer} titulo="Con ticket impreso" texto="Cada pedido imprime una comanda en papel para la cocina." />
        </div>
      </Seccion>
      <Seccion titulo="¿Dónde se imprime la comanda?">
        <div className="grid sm:grid-cols-2 gap-3">
          <OpcionTarjeta disabled={!editar} activa={destino === 'centralizada'} onClick={() => guardar.mutate({ cocina_destino: 'centralizada' })} Icono={Building} titulo="En una impresora de cocina" texto="Todas las cajas mandan la comanda a la misma impresora. Para cocinas fijas." />
          <OpcionTarjeta disabled={!editar} activa={destino === 'por_caja'} onClick={() => guardar.mutate({ cocina_destino: 'por_caja' })} Icono={Smartphone} titulo="En la impresora de cada caja" texto="Cada caja imprime su comanda junto al ticket. Ideal si el mesero cobra desde el celular." />
        </div>
      </Seccion>
      <Seccion titulo="Pantalla de impresión Bluetooth" texto="Para una tablet o celular fijo en cocina con impresora Bluetooth.">
        <Interruptor
          disabled={!editar}
          activo={config.cocina_pantalla_dedicada === 'true'}
          onCambio={(v) => guardar.mutate({ cocina_pantalla_dedicada: v ? 'true' : 'false' })}
          etiqueta="La comanda la imprime solo la pantalla de cocina"
          descripcion="Abre “Pantalla de impresión de cocina” en ese dispositivo (búscala con Ctrl+K). Así salen también los pedidos del menú QR, y la caja deja de imprimir la comanda."
        />
      </Seccion>
    </Pagina>
  );
}
