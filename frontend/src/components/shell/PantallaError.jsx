// Cuando una pantalla se rompe: el caracol se esconde en su concha y se
// ofrece recargar, en vez de la página en blanco del navegador.
import { useRouteError } from 'react-router-dom';
import { RotateCw } from 'lucide-react';
import Caracol from '../ui/Caracol';

// Después de actualizar el sistema, una pestaña abierta pide archivos que
// ya no existen: con recargar se arregla.
const esVersionNueva = (e) => /dynamically imported module|Importing a module script failed|Loading chunk|error loading dynamically/i.test(String(e?.message ?? e));

export default function PantallaError() {
  const error = useRouteError();
  const nueva = esVersionNueva(error);
  if (error) console.error(error);

  return (
    <div className="min-h-full grid place-items-center bg-fondo px-6 py-16">
      <div className="flex flex-col items-center text-center max-w-sm">
        <Caracol escondido className="w-28" />
        <h1 className="text-2xl font-extrabold mt-4">{nueva ? 'Hay una versión nueva' : 'Algo salió mal'}</h1>
        <p className="text-tenue mt-2">
          {nueva ? 'El sistema se actualizó mientras lo tenías abierto. Recarga para seguir.' : 'Esta pantalla no pudo abrirse. Recarga la página; si vuelve a pasar, avisa al administrador.'}
        </p>
        <button type="button" className="btn-aji btn-lg mt-6" onClick={() => window.location.reload()}>
          <RotateCw className="w-5 h-5" /> Recargar
        </button>
      </div>
    </div>
  );
}
