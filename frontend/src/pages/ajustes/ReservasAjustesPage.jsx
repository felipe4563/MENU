import { useState } from 'react';
import { DoorOpen, Clock, Hand } from 'lucide-react';
import { usePermisos } from '../../hooks/usePermisos';
import { Cargando, Encabezado, Pagina, SinPermiso } from '../../components/ui/piezas';
import { useConfiguracion, OpcionTarjeta, Seccion } from './comun';

// Mismos valores por defecto que configReservas en el backend.
const POR_DEFECTO = { envio: 'al_llegar', antes: 30, tolerancia: 30 };

// Minutos que se guardan al salir del campo (o con Enter), si cambiaron y son válidos.
function CampoMinutos({ valor, min, max, disabled, onGuardar, antes, despues }) {
  const [texto, setTexto] = useState(String(valor));
  const [previo, setPrevio] = useState(valor);
  if (previo !== valor) { setPrevio(valor); setTexto(String(valor)); }
  const n = Number(texto);
  const valido = texto !== '' && Number.isInteger(n) && n >= min && n <= max;
  const guardar = () => { if (valido && n !== valor) onGuardar(n); };
  return (
    <div>
      <label className="flex flex-wrap items-center gap-2 text-sm">
        {antes && <span>{antes}</span>}
        <input
          type="number" inputMode="numeric" min={min} max={max} disabled={disabled}
          className="campo h-10 w-24 num text-center font-semibold"
          value={texto}
          onChange={(e) => setTexto(e.target.value.replace(/[^\d]/g, ''))}
          onBlur={guardar}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
        />
        <span>{despues}</span>
      </label>
      {!valido && <p className="text-sm text-locoto mt-1">Pon un número entre {min} y {max}.</p>}
    </div>
  );
}

export default function ReservasAjustesPage() {
  const { tiene } = usePermisos();
  const { config, cargando, guardar } = useConfiguracion();
  if (!tiene('configuracion', 'ver')) return <SinPermiso />;
  if (cargando) return <Cargando />;
  const editar = tiene('configuracion', 'editar') && !guardar.isPending;
  const entero = (v, defecto) => (v != null && v !== '' && Number.isInteger(Number(v)) ? Number(v) : defecto);
  const envio = ['al_llegar', 'antes', 'manual'].includes(config.reservas_envio_cocina) ? config.reservas_envio_cocina : POR_DEFECTO.envio;
  const minutosAntes = entero(config.reservas_minutos_antes, POR_DEFECTO.antes);
  const tolerancia = entero(config.reservas_tolerancia_no_vino, POR_DEFECTO.tolerancia);

  return (
    <Pagina>
      <Encabezado titulo="Reservas" texto="Cuándo cocina prepara los platos de una reserva y cuándo avisar que no llegaron." />
      <Seccion titulo="¿Cuándo pasan a cocina los platos de una reserva?" texto="Cada reserva puede cambiarlo al anotarla.">
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
          <OpcionTarjeta disabled={!editar} activa={envio === 'al_llegar'} onClick={() => guardar.mutate({ reservas_envio_cocina: 'al_llegar' })} Icono={DoorOpen} titulo="Al llegar el cliente" texto="Cuando tocas “Llegaron”, se abre su pedido y los platos van a cocina." />
          <OpcionTarjeta disabled={!editar} activa={envio === 'antes'} onClick={() => guardar.mutate({ reservas_envio_cocina: 'antes' })} Icono={Clock} titulo="Antes de la hora" texto="Los platos van solos a cocina unos minutos antes, para que estén listos cuando lleguen." />
          <OpcionTarjeta disabled={!editar} activa={envio === 'manual'} onClick={() => guardar.mutate({ reservas_envio_cocina: 'manual' })} Icono={Hand} titulo="Cuando el cajero lo mande" texto="Quedan guardados hasta que toques “Mandar a cocina” en la reserva." />
        </div>
        {envio === 'antes' && (
          <div className="mt-4">
            <CampoMinutos valor={minutosAntes} min={0} max={1440} disabled={!editar}
              onGuardar={(n) => guardar.mutate({ reservas_minutos_antes: String(n) })}
              antes="Mandar a cocina" despues="minutos antes de la hora" />
          </div>
        )}
      </Seccion>
      <Seccion titulo="Cliente que no llega" texto="Te avisamos para que marques “No vino” y liberes la mesa.">
        <CampoMinutos valor={tolerancia} min={5} max={600} disabled={!editar}
          onGuardar={(n) => guardar.mutate({ reservas_tolerancia_no_vino: String(n) })}
          antes="Avisar que no llegó después de" despues="minutos" />
      </Seccion>
    </Pagina>
  );
}
