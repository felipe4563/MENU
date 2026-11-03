import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plug, Plus, Copy, RefreshCw, Power, KeyRound } from 'lucide-react';
import { getApiKeys, crearApiKey, desactivarApiKey, regenerarApiKey } from '../../api/integraciones';
import { getSucursales } from '../../api/sucursales';
import { useAuthStore } from '../../store/authStore';
import { usePermisos } from '../../hooks/usePermisos';
import Hoja from '../../components/ui/Hoja';
import { Cargando, Campo, Encabezado, Insignia, Pagina, SinPermiso, Vacio, useConfirmar } from '../../components/ui/piezas';
import { avisar } from '../../components/ui/Aviso';
import { errorDe, fechaCorta } from '../../lib/util';

export default function IntegracionesPage() {
  const qc = useQueryClient();
  const { tiene } = usePermisos();
  const usuario = useAuthStore((s) => s.usuario);
  const [crear, setCrear] = useState(false);
  const [nombre, setNombre] = useState('');
  const [sucursal, setSucursal] = useState(usuario?.sucursal_activa?.id ?? '');
  const [generada, setGenerada] = useState(null);
  const [confirmacion, confirmar] = useConfirmar();
  const keys = useQuery({ queryKey: ['api-keys'], queryFn: getApiKeys, enabled: tiene('configuracion', 'ver') });
  const sucursales = useQuery({ queryKey: ['sucursales'], queryFn: getSucursales, enabled: tiene('sucursales', 'ver') });
  const listo = (d) => { qc.invalidateQueries({ queryKey: ['api-keys'] }); if (d?.api_key) setGenerada(d); };
  const mCrear = useMutation({ mutationFn: () => crearApiKey({ nombre_app: nombre.trim(), sucursal_id: Number(sucursal) }), onSuccess: (d) => { setCrear(false); setNombre(''); listo(d); }, onError: (e) => avisar.error(errorDe(e)) });
  const mRegenerar = useMutation({ mutationFn: regenerarApiKey, onSuccess: listo, onError: (e) => avisar.error(errorDe(e)) });
  const mDesactivar = useMutation({ mutationFn: desactivarApiKey, onSuccess: () => { listo(); avisar.ok('Integración desactivada'); }, onError: (e) => avisar.error(errorDe(e)) });

  if (!tiene('configuracion', 'ver')) return <SinPermiso />;
  const editar = tiene('configuracion', 'editar');

  return (
    <Pagina>
      <Encabezado titulo="Integraciones" texto="Conecta apps de delivery o tu página web para que manden pedidos directo a la cocina."
        acciones={editar && <button className="btn-aji" onClick={() => setCrear(true)}><Plus className="w-4 h-4" /> Nueva conexión</button>} />
      {keys.isLoading ? <Cargando /> : (keys.data ?? []).length === 0 ? (
        <Vacio Icono={Plug} titulo="Sin conexiones" texto="Crea una clave para cada app que vaya a enviar pedidos. Los pedidos llegan a Delivery." />
      ) : (
        <ul className="ficha divide-y divide-linea">
          {keys.data.map((k) => (
            <li key={k.id} className="flex items-center gap-3 px-4 py-3.5">
              <span className="w-10 h-10 rounded-xl bg-hundido grid place-items-center"><KeyRound className="w-5 h-5" /></span>
              <div className="flex-1 min-w-0">
                <p className="font-semibold truncate">{k.nombre_app}</p>
                <p className="text-xs text-tenue">{k.sucursal?.nombre}{k.creado_en ? ` · desde ${fechaCorta(k.creado_en)}` : ''}</p>
              </div>
              <Insignia tono={k.activo ? 'ok' : 'neutro'}>{k.activo ? 'Activa' : 'Desactivada'}</Insignia>
              {editar && (
                <>
                  <button className="btn-icono btn-fantasma" title="Generar clave nueva" onClick={async () => { if (await confirmar({ titulo: `¿Clave nueva para ${k.nombre_app}?`, texto: 'La clave actual deja de funcionar de inmediato. Tendrás que pegar la nueva en la app.', confirmar: 'Generar nueva' })) mRegenerar.mutate(k.id); }}><RefreshCw className="w-4 h-4" /></button>
                  {k.activo ? <button className="btn-icono btn-fantasma text-locoto" title="Desactivar" onClick={async () => { if (await confirmar({ titulo: `¿Desactivar ${k.nombre_app}?`, texto: 'Esa app ya no podrá mandar pedidos.', confirmar: 'Desactivar', peligro: true })) mDesactivar.mutate(k.id); }}><Power className="w-4 h-4" /></button> : null}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {crear && (
        <Hoja onCerrar={() => setCrear(false)} titulo="Nueva conexión" ancho="max-w-md"
          pie={<button data-principal className="btn-aji w-full" disabled={!nombre.trim() || !sucursal || mCrear.isPending} onClick={() => mCrear.mutate()}>Crear clave</button>}>
          <div className="space-y-3">
            <Campo etiqueta="Nombre de la app"><input autoFocus className="campo" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej.: Página web, PedidosYa" /></Campo>
            <Campo etiqueta="Sucursal que recibe los pedidos">
              <select className="campo" value={sucursal} onChange={(e) => setSucursal(e.target.value)}>
                <option value="">Elige…</option>
                {(sucursales.data ?? (usuario?.sucursal_activa?.id ? [usuario.sucursal_activa] : [])).map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              </select>
            </Campo>
          </div>
        </Hoja>
      )}
      {generada && (
        <Hoja onCerrar={() => setGenerada(null)} titulo="Copia la clave ahora" subtitulo="Por seguridad no se vuelve a mostrar." ancho="max-w-md">
          <code className="block break-all rounded-xl bg-pizarra text-aji p-4 text-sm">{generada.api_key}</code>
          <button className="btn-aji w-full mt-3" onClick={() => { navigator.clipboard?.writeText(generada.api_key); avisar.ok('Clave copiada'); }}><Copy className="w-4 h-4" /> Copiar clave</button>
        </Hoja>
      )}
      {confirmacion}
    </Pagina>
  );
}
