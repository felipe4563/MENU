// Clasificar gastos: el ABM de las categorías del flujo de caja (luz, agua,
// wifi, sueldos…). Son las filas del flujo y lo que se elige al anotar un
// movimiento o al registrar un gasto en Caja.
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Eye, Pencil, Plus, Trash2, X } from 'lucide-react';
import { getCategoriasFlujo, crearCategoriaFlujo, editarCategoriaFlujo, eliminarCategoriaFlujo } from '../../api/flujoCaja';
import Hoja from '../../components/ui/Hoja';
import { Cargando, Insignia, useConfirmar } from '../../components/ui/piezas';
import { avisar } from '../../components/ui/Aviso';
import { cx, errorDe } from '../../lib/util';

const vacia = (grupo = 'costo_fijo') => ({ nombre: '', grupo, pide_persona: false, ayuda: '' });

function Formulario({ valor, grupos, elegibles, bloquearGrupo, onCambio, onGuardar, onCancelar, guardando, texto }) {
  const poner = (k, v) => onCambio({ ...valor, [k]: v });
  return (
    <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); if (valor.nombre.trim()) onGuardar(); }}>
      <div className="flex flex-col sm:flex-row gap-2">
        <input className="campo flex-1" value={valor.nombre} maxLength={60} autoFocus placeholder="Ej.: Wifi, Gas, Sueldo de cocina"
          onChange={(e) => poner('nombre', e.target.value)} aria-label="Nombre" />
        <select className="campo sm:w-52" value={valor.grupo} disabled={bloquearGrupo} onChange={(e) => poner('grupo', e.target.value)} aria-label="Dónde va en el flujo">
          {grupos.filter((g) => elegibles.includes(g.clave) || g.clave === valor.grupo).map((g) => <option key={g.clave} value={g.clave}>{g.nombre}</option>)}
        </select>
      </div>
      <input className="campo" value={valor.ayuda ?? ''} maxLength={120} placeholder="Nota para quien anota (opcional)"
        onChange={(e) => poner('ayuda', e.target.value)} aria-label="Nota" />
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-[13px] text-tenue mr-auto">
          <input type="checkbox" checked={!!valor.pide_persona} onChange={(e) => poner('pide_persona', e.target.checked)} />
          Pide el nombre de la persona (sueldos, bonos, adelantos)
        </label>
        {onCancelar && <button type="button" className="btn-suave h-9" onClick={onCancelar}><X className="w-4 h-4" /> Cancelar</button>}
        <button type="submit" className="btn-aji h-9" disabled={!valor.nombre.trim() || guardando}>{texto}</button>
      </div>
    </form>
  );
}

export default function ClasificarGastos({ onCerrar }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['flujo', 'categorias'], queryFn: getCategoriasFlujo });
  const [nueva, setNueva] = useState(vacia());
  const [editando, setEditando] = useState(null); // { id, ...campos }
  const [confirmacion, confirmar] = useConfirmar();
  const listo = (msg) => { qc.invalidateQueries({ queryKey: ['flujo'] }); avisar.ok(msg); };

  const crear = useMutation({
    mutationFn: () => crearCategoriaFlujo({ ...nueva, nombre: nueva.nombre.trim() }),
    onSuccess: (c) => { listo(`"${c.nombre}" agregada`); setNueva(vacia(nueva.grupo)); },
    onError: (e) => avisar.error(errorDe(e)),
  });
  const editar = useMutation({
    mutationFn: ({ id, ...datos }) => editarCategoriaFlujo(id, datos),
    onSuccess: (c, v) => { listo(v.activo === true ? `"${c.nombre}" se muestra de nuevo` : 'Cambios guardados'); setEditando(null); },
    onError: (e) => avisar.error(errorDe(e)),
  });
  const borrar = useMutation({
    mutationFn: (c) => eliminarCategoriaFlujo(c.id),
    onSuccess: (r, c) => listo(r.borrada ? `"${c.nombre}" borrada` : `"${c.nombre}" oculta: lo ya anotado sigue en el flujo`),
    onError: (e) => avisar.error(errorDe(e)),
  });

  const d = q.data;
  const pedirBorrar = async (c) => {
    const texto = c.usos
      ? `Tiene ${c.usos} ${c.usos === 1 ? 'movimiento' : 'movimientos'}: no se borra, se oculta. Ya no se ofrece al anotar, pero lo anotado sigue en el flujo con este nombre.`
      : 'No tiene movimientos anotados.';
    if (await confirmar({ titulo: `¿${c.usos ? 'Ocultar' : 'Borrar'} "${c.nombre}"?`, texto, confirmar: c.usos ? 'Ocultar' : 'Borrar', peligro: true })) borrar.mutate(c);
  };

  return (
    <Hoja onCerrar={onCerrar} titulo="Clasificar gastos" ancho="max-w-2xl"
      subtitulo="Las filas del flujo de caja. También se eligen al anotar un movimiento y al registrar un gasto en Caja.">
      {!d ? <Cargando /> : (
        <div className="space-y-6">
          <section className="rounded-xl bg-hundido p-3">
            <p className="font-semibold text-sm mb-2">Nueva categoría</p>
            <Formulario valor={nueva} grupos={d.grupos} elegibles={d.elegibles} onCambio={setNueva}
              onGuardar={() => crear.mutate()} guardando={crear.isPending} texto={<><Plus className="w-4 h-4" /> Agregar</>} />
          </section>

          {d.grupos.map((g) => {
            const cats = d.categorias.filter((c) => c.grupo === g.clave);
            if (!cats.length) return null;
            return (
              <section key={g.clave}>
                <h3 className="font-display font-semibold mb-1">{g.nombre}</h3>
                <ul className="divide-y divide-linea">
                  {cats.map((c) => (
                    <li key={c.id} className={cx('py-2', !c.activo && 'opacity-60')}>
                      {editando?.id === c.id ? (
                        <Formulario valor={editando} grupos={d.grupos} elegibles={d.elegibles} bloquearGrupo={c.sistema}
                          onCambio={setEditando} onCancelar={() => setEditando(null)} guardando={editar.isPending}
                          onGuardar={() => editar.mutate({ ...editando, nombre: editando.nombre.trim() })} texto={<><Check className="w-4 h-4" /> Guardar</>} />
                      ) : (
                        <div className="flex items-center gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="truncate">{c.nombre}</p>
                            {c.ayuda && <p className="text-[12px] text-tenue truncate">{c.ayuda}</p>}
                          </div>
                          {c.auto && <Insignia title="La llena el sistema con las ventas, compras y la caja">Automática</Insignia>}
                          {c.pideDetalle && <Insignia tono="info">Por persona</Insignia>}
                          {!c.activo && <Insignia tono="alerta">Oculta</Insignia>}
                          {c.usos > 0 && <span className="text-[12px] text-tenue num w-16 text-right">{c.usos} mov.</span>}
                          {!c.activo && (
                            <button className="btn-icono btn-fantasma" aria-label={`Mostrar ${c.nombre}`} title="Volver a mostrar"
                              onClick={() => editar.mutate({ id: c.id, activo: true })}><Eye className="w-4 h-4" /></button>
                          )}
                          <button className="btn-icono btn-fantasma" aria-label={`Editar ${c.nombre}`}
                            onClick={() => setEditando({ id: c.id, nombre: c.nombre, grupo: c.grupo, ayuda: c.ayuda ?? '', pide_persona: !!c.pideDetalle })}>
                            <Pencil className="w-4 h-4" />
                          </button>
                          {c.sistema ? <span className="w-10 shrink-0" aria-hidden /> : (
                            <button className="btn-icono btn-fantasma text-locoto" aria-label={`Borrar ${c.nombre}`} disabled={!c.activo}
                              onClick={() => pedirBorrar(c)}><Trash2 className="w-4 h-4" /></button>
                          )}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
          <p className="text-[12px] text-tenue">
            Cambiar el nombre no cambia lo ya anotado: se ve con el nombre nuevo. Las categorías automáticas y las de traspasos y ajustes las necesita el flujo: se pueden renombrar pero no borrar.
          </p>
        </div>
      )}
      {confirmacion}
    </Hoja>
  );
}
