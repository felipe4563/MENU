import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { getConfiguracion, actualizarConfiguracion } from '../../api/configuracion';
import { avisar } from '../../components/ui/Aviso';
import { cx, errorDe } from '../../lib/util';

export function useConfiguracion() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['configuracion'], queryFn: getConfiguracion });
  const guardar = useMutation({
    mutationFn: actualizarConfiguracion,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['configuracion'] });
      qc.invalidateQueries({ queryKey: ['configuracion-publica'] });
      avisar.ok('Guardado');
    },
    onError: (e) => avisar.error(errorDe(e)),
  });
  return { config: q.data, cargando: q.isLoading, guardar };
}

// Tarjeta seleccionable para opciones excluyentes de configuración.
export function OpcionTarjeta({ activa, onClick, Icono, titulo, texto, disabled }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cx('text-left rounded-2xl border-2 p-4 flex gap-3 transition disabled:opacity-60', activa ? 'border-tinta bg-papel shadow-papel' : 'border-linea hover:border-tenue')}
    >
      {Icono && <span className={cx('w-10 h-10 rounded-xl grid place-items-center shrink-0', activa ? 'bg-aji text-sobre-aji' : 'bg-hundido')}><Icono className="w-5 h-5" /></span>}
      <span className="flex-1">
        <span className="font-semibold block">{titulo}</span>
        <span className="text-[13px] text-tenue block mt-0.5 leading-snug">{texto}</span>
      </span>
      <span className={cx('w-5 h-5 rounded-full border-2 grid place-items-center shrink-0', activa ? 'bg-tinta border-tinta text-fondo' : 'border-linea')}>{activa && <Check className="w-3 h-3" />}</span>
    </button>
  );
}

export function Seccion({ titulo, texto, children }) {
  return (
    <section className="grid lg:grid-cols-[260px_minmax(0,1fr)] 2xl:grid-cols-[320px_minmax(0,1fr)] gap-x-8 2xl:gap-x-12 gap-y-3 py-7 border-b border-linea last:border-0">
      <div>
        <h2 className="font-display font-semibold text-lg">{titulo}</h2>
        {texto && <p className="text-[13px] text-tenue mt-1">{texto}</p>}
      </div>
      <div>{children}</div>
    </section>
  );
}
