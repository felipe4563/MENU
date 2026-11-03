import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Workflow, Trash2, Pencil, ArrowUp, ArrowDown } from 'lucide-react';
import { getGruposOpciones, crearGrupoOpciones, actualizarGrupoOpciones, eliminarGrupoOpciones } from '../../api/gruposOpciones';
import { usePermisos } from '../../hooks/usePermisos';
import { useMoneda } from '../../hooks/useConfig';
import Hoja from '../../components/ui/Hoja';
import { Cargando, Campo, Encabezado, Pagina, Segmentado, SinPermiso, Vacio, useConfirmar } from '../../components/ui/piezas';
import { numero } from '../../components/ui/formulario';
import { avisar } from '../../components/ui/Aviso';
import { dinero, errorDe } from '../../lib/util';

function HojaGrupo({ grupo, onCerrar }) {
  const qc = useQueryClient();
  const [nombre, setNombre] = useState(grupo?.nombre ?? '');
  const [tipo, setTipo] = useState(grupo?.tipo_seleccion ?? 'unica');
  const [ops, setOps] = useState(() => (grupo?.opciones ?? []).map((o) => ({ nombre: o.nombre, precio_adicional: String(Number(o.precio_adicional || 0)) })).concat(grupo ? [] : [{ nombre: '', precio_adicional: '0' }]));
  const set = (i, k, v) => setOps(ops.map((o, j) => (j === i ? { ...o, [k]: v } : o)));
  const mover = (i, d) => { const c = [...ops]; [c[i], c[i + d]] = [c[i + d], c[i]]; setOps(c); };
  const limpias = ops.filter((o) => o.nombre.trim());
  const guardar = useMutation({
    mutationFn: () => {
      const datos = { nombre: nombre.trim(), tipo_seleccion: tipo, opciones: limpias.map((o, i) => ({ nombre: o.nombre.trim(), precio_adicional: Number(o.precio_adicional || 0), orden: i })) };
      return grupo ? actualizarGrupoOpciones(grupo.id, datos) : crearGrupoOpciones(datos);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['grupos-opciones'] }); qc.invalidateQueries({ queryKey: ['productos-pos'] }); avisar.ok('Grupo guardado'); onCerrar(); },
    onError: (e) => avisar.error(errorDe(e)),
  });
  return (
    <Hoja onCerrar={onCerrar} titulo={grupo ? 'Editar grupo' : 'Nuevo grupo de opciones'} ancho="max-w-lg"
      pie={<button data-principal className="btn-aji w-full" disabled={!nombre.trim() || !limpias.length || guardar.isPending} onClick={() => guardar.mutate()}>Guardar grupo</button>}>
      <div className="space-y-4">
        <Campo etiqueta="Nombre del grupo" ayuda="Es la pregunta que verá el cajero."><input autoFocus className="campo" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej.: Punto de la carne" /></Campo>
        <div>
          <span className="etiqueta">El cliente elige</span>
          <Segmentado valor={tipo} onCambio={setTipo} opciones={[{ valor: 'unica', etiqueta: 'Una sola' }, { valor: 'multiple', etiqueta: 'Varias' }]} />
        </div>
        <div>
          <span className="etiqueta">Opciones</span>
          <ul className="space-y-2">
            {ops.map((o, i) => (
              <li key={i} className="flex items-center gap-2">
                <div className="flex flex-col">
                  <button className="text-tenue disabled:opacity-20" disabled={i === 0} onClick={() => mover(i, -1)} aria-label="Subir"><ArrowUp className="w-3.5 h-3.5" /></button>
                  <button className="text-tenue disabled:opacity-20" disabled={i === ops.length - 1} onClick={() => mover(i, 1)} aria-label="Bajar"><ArrowDown className="w-3.5 h-3.5" /></button>
                </div>
                <input className="campo flex-1" value={o.nombre} onChange={(e) => set(i, 'nombre', e.target.value)} placeholder={`Opción ${i + 1}`} />
                <div className="relative w-28">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-tenue text-sm">+</span>
                  <input className="campo pl-6 num" inputMode="decimal" value={o.precio_adicional} onChange={(e) => set(i, 'precio_adicional', numero(e.target.value))} />
                </div>
                <button className="btn-icono btn-fantasma h-9 w-9" onClick={() => setOps(ops.filter((_, j) => j !== i))} aria-label="Quitar"><Trash2 className="w-4 h-4" /></button>
              </li>
            ))}
          </ul>
          <button className="btn-fantasma mt-2" onClick={() => setOps([...ops, { nombre: '', precio_adicional: '0' }])}><Plus className="w-4 h-4" /> Agregar opción</button>
        </div>
      </div>
    </Hoja>
  );
}

export default function OpcionesPage() {
  const qc = useQueryClient();
  const moneda = useMoneda();
  const { tiene } = usePermisos();
  const [editar, setEditar] = useState(null);
  const [confirmacion, confirmar] = useConfirmar();
  const q = useQuery({ queryKey: ['grupos-opciones'], queryFn: getGruposOpciones });
  const borrar = useMutation({ mutationFn: (g) => eliminarGrupoOpciones(g.id), onSuccess: () => { qc.invalidateQueries({ queryKey: ['grupos-opciones'] }); avisar.ok('Grupo eliminado'); }, onError: (e) => avisar.error(errorDe(e)) });
  if (!tiene('productos', 'ver')) return <SinPermiso />;
  return (
    <Pagina>
      <Encabezado titulo="Opciones" texto="Preguntas que se hacen al vender: tamaño, punto, sabor, extras. Se asignan a cada producto."
        acciones={tiene('productos', 'crear') && <button className="btn-aji" onClick={() => setEditar('nuevo')}><Plus className="w-4 h-4" /> Nuevo grupo</button>} />
      {q.isLoading ? <Cargando /> : (q.data ?? []).length === 0 ? <Vacio Icono={Workflow} titulo="Sin grupos de opciones" texto="Ej.: “Tamaño” con Chico, Mediano y Grande (+5)." /> : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {q.data.map((g) => (
            <div key={g.id} className="ficha p-4">
              <div className="flex items-start gap-2">
                <div className="flex-1">
                  <p className="font-display font-semibold text-lg leading-tight">{g.nombre}</p>
                  <p className="text-xs text-tenue">{g.tipo_seleccion === 'multiple' ? 'Puede elegir varias' : 'Elige una'}</p>
                </div>
                {tiene('productos', 'editar') && <button className="btn-icono btn-fantasma h-8 w-8" onClick={() => setEditar(g)} aria-label="Editar"><Pencil className="w-4 h-4" /></button>}
                {tiene('productos', 'eliminar') && <button className="btn-icono btn-fantasma h-8 w-8" aria-label="Eliminar" onClick={async () => { if (await confirmar({ titulo: `¿Eliminar “${g.nombre}”?`, texto: 'Se quita de todos los productos que lo usan.', confirmar: 'Eliminar', peligro: true })) borrar.mutate(g); }}><Trash2 className="w-4 h-4" /></button>}
              </div>
              <div className="flex flex-wrap gap-1.5 mt-3">
                {g.opciones.map((o) => (
                  <span key={o.id} className="chip bg-hundido text-tinta font-medium">{o.nombre}{Number(o.precio_adicional) > 0 && <span className="text-tenue num">+{dinero(o.precio_adicional, moneda)}</span>}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      {editar && <HojaGrupo grupo={editar === 'nuevo' ? null : editar} onCerrar={() => setEditar(null)} />}
      {confirmacion}
    </Pagina>
  );
}
