// Instalar el sistema como app en este dispositivo (Ajustes y Mi perfil).
// Android y computadora (Chrome o Edge): un botón. iPhone y iPad: los pasos
// a mano, porque ahí el navegador no deja instalar desde un botón.
import { useState } from 'react';
import { CheckCircle2, Download, MoreVertical, PlusSquare, Share } from 'lucide-react';
import { esSafariApple, instalar, useInstalarApp } from '../../lib/instalarApp';

const Paso = ({ n, children }) => (
  <li className="flex gap-3 items-start">
    <span className="w-6 h-6 rounded-full bg-hundido grid place-items-center text-[13px] font-semibold shrink-0">{n}</span>
    <span className="flex-1">{children}</span>
  </li>
);
const icono = 'inline w-4 h-4 -mt-0.5 mx-0.5';

export default function InstalarApp() {
  const estado = useInstalarApp();
  const [ocupado, setOcupado] = useState(false);

  if (estado === 'instalada') {
    return (
      <p className="flex items-center gap-2 text-sm">
        <CheckCircle2 className="w-5 h-5 text-hierba shrink-0" /> La app ya está instalada en este dispositivo.
      </p>
    );
  }

  if (estado === 'lista') {
    const tocar = async () => {
      setOcupado(true);
      try { await instalar(); } finally { setOcupado(false); }
    };
    return (
      <div className="space-y-2">
        <button type="button" className="btn-aji btn-lg" disabled={ocupado} onClick={tocar}>
          <Download className="w-5 h-5" /> Instalar la app
        </button>
        <p className="text-[13px] text-tenue">Queda con su ícono, como cualquier otra app, y abre a pantalla completa.</p>
      </div>
    );
  }

  if (estado === 'apple') {
    return (
      <div className="text-sm space-y-3">
        <p className="text-tenue">En iPhone y iPad se instala a mano, en tres toques:</p>
        <ol className="space-y-2">
          <Paso n={1}>Toca <b>Compartir</b> <Share className={icono} />{esSafariApple() ? ', abajo o arriba en Safari.' : ', al lado de la dirección.'}</Paso>
          <Paso n={2}>Elige <b>Agregar a inicio</b> <PlusSquare className={icono} /> (hay que bajar un poco en la lista).</Paso>
          <Paso n={3}>Toca <b>Agregar</b>. El ícono queda en la pantalla de inicio.</Paso>
        </ol>
        {'bluetooth' in navigator && <p className="text-[13px] text-tenue">Si imprimes por Bluetooth desde este navegador (Bluefy), sigue entrando por aquí: la app instalada en iPhone y iPad no puede usar Bluetooth.</p>}
        {!esSafariApple() && <p className="text-[13px] text-tenue">Si no aparece “Agregar a inicio”, abre esta misma página en Safari y repite los pasos.</p>}
      </div>
    );
  }

  return (
    <div className="text-sm space-y-3">
      <p className="text-tenue">Este navegador no mostró el botón para instalar. Se puede hacer desde su menú:</p>
      <ol className="space-y-2">
        <Paso n={1}>Abre el sistema en <b>Chrome</b> o <b>Edge</b>.</Paso>
        <Paso n={2}>Toca el menú <MoreVertical className={icono} /> del navegador.</Paso>
        <Paso n={3}>Elige <b>Instalar app</b> o <b>Agregar a la pantalla principal</b>.</Paso>
      </ol>
      <p className="text-[13px] text-tenue">Si ya la instalaste antes, búscala entre tus apps.</p>
    </div>
  );
}
