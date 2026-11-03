import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Ticket, Pencil, Trash2, Shuffle, Copy } from 'lucide-react';
import { getCupones, crearCupon, actualizarCupon, eliminarCupon } from '../../api/cupones';
import { usePermisos } from '../../hooks/usePermisos';
import { useMoneda } from '../../hooks/useConfig';
import Hoja from '../../components/ui/Hoja';
import { Buscador, Cargando, Campo, Encabezado, Interruptor, Pagina, Segmentado, SinPermiso, Vacio, Insignia, useConfirmar } from '../../components/ui/piezas';
import { numero, useCampos } from '../../components/ui/formulario';
import { avisar } from '../../components/ui/Aviso';
import SelectorProductos from './SelectorProductos';
import { cx, errorDe, normalizar } from '../../lib/util';

const codigoAleatorio = () => Array.from({ length: 8 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');

function HojaCupon({ c, onCerrar }) {
  const qc = useQueryClient();
  const moneda = useMoneda();
  const { f, campo, poner } = useCampos({
    codigo: c?.codigo ?? codigoAleatorio(), tipo: c?.tipo ?? 'porcentaje', valor: c ? String(Number(c.valor)) : '',
    usos_maximos: String(c?.usos_maximos ?? 1), limite_por_cliente: c?.limite_por_cliente ? String(c.limite_por_cliente) : '',
    fecha_expiracion: c?.fecha_expiracion ?? '', activo: c ? !!c.activo : true,
    soloProductos: !!(c?.productos?.length), producto_ids: (c?.productos ?? []).map((x) => x.id),
  });
  const guardar = useMutation({
    mutationFn: () => {
      const d = {
        codigo: f.codigo.trim().toUpperCase(), tipo: f.tipo, valor: Number(f.valor), usos_maximos: Number(f.usos_maximos || 1),
        limite_por_cliente: f.limite_por_cliente ? Number(f.limite_por_cliente) : null, fecha_expiracion: f.fecha_expiracion || null,
        activo: f.activo ? 1 : 0, producto_ids: f.soloProductos ? f.producto_ids : [],
      };
      return c ? actualizarCupon(c.id, d) : crearCupon(d);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['cupones'] }); avisar.ok('Cupón guardado'); onCerrar(); },
    onError: (e) => avisar.error(errorDe(e)),
  });
  return (
    <Hoja onCerrar={onCerrar} titulo={c ? `Cupón ${c.codigo}` : 'Nuevo cupón'} ancho="max-w-lg"
      pie={<button data-principal className="btn-aji w-full" disabled={!f.codigo.trim() || !(Number(f.valor) > 0) || guardar.isPending} onClick={() => guardar.mutate()}>Guardar cupón</button>}>
      <div className="space-y-4">
        <Campo etiqueta="Código que dicta el cliente">
          <div className="flex gap-2">
            <input className="campo uppercase font-display font-bold tracking-wider" {...campo('codigo', (v) => v.toUpperCase().replace(/\s/g, ''))} />
            <button type="button" className="btn-icono btn-borde" onClick={() => poner('codigo', codigoAleatorio())} aria-label="Generar código"><Shuffle className="w-4 h-4" /></button>
          </div>
        </Campo>
        <div>
          <span className="etiqueta">Descuento</span>
          <div className="flex gap-2">
            <Segmentado valor={f.tipo} onCambio={(v) => poner('tipo', v)} opciones={[{ valor: 'porcentaje', etiqueta: '%' }, { valor: 'fijo', etiqueta: moneda }]} />
            <input className="campo num" inputMode="decimal" {...campo('valor', numero)} />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Campo etiqueta="Usos en total"><input className="campo num" {...campo('usos_maximos', (v) => v.replace(/\D/g, ''))} /></Campo>
          <Campo etiqueta="Por cliente"><input className="campo num" placeholder="Sin límite" {...campo('limite_por_cliente', (v) => v.replace(/\D/g, ''))} /></Campo>
          <Campo etiqueta="Vence"><input type="date" className="campo" {...campo('fecha_expiracion')} /></Campo>
        </div>
        <Interruptor activo={f.soloProductos} onCambio={(v) => poner('soloProductos', v)} etiqueta="Solo para ciertos productos" />
        {f.soloProductos && <SelectorProductos valor={f.producto_ids} onCambio={(v) => poner('producto_ids', v)} />}
        <Interruptor activo={f.activo} onCambio={(v) => poner('activo', v)} etiqueta="Activo" />
      </div>
    </Hoja>
  );
}

export default function CuponesPage() {
  const qc = useQueryClient();
  const moneda = useMoneda();
  const { tiene } = usePermisos();
  const [q, setQ] = useState('');
  const [editar, setEditar] = useState(null);
  const [confirmacion, confirmar] = useConfirmar();
  const lista = useQuery({ queryKey: ['cupones'], queryFn: getCupones, enabled: tiene('cupones', 'ver') });
  const borrar = useMutation({ mutationFn: (c) => eliminarCupon(c.id), onSuccess: () => qc.invalidateQueries({ queryKey: ['cupones'] }), onError: (e) => avisar.error(errorDe(e)) });
  if (!tiene('cupones', 'ver')) return <SinPermiso />;
  const t = normalizar(q);
  const filas = (lista.data ?? []).filter((c) => !t || normalizar(`${c.codigo} ${c.cliente?.nombre ?? ''}`).includes(t));
  return (
    <Pagina>
      <Encabezado titulo="Cupones" texto="Códigos de descuento que el cliente presenta al pagar."
        acciones={tiene('cupones', 'crear') && <button className="btn-aji" onClick={() => setEditar('nuevo')}><Plus className="w-4 h-4" /> Nuevo cupón</button>} />
      <Buscador valor={q} onCambio={setQ} placeholder="Buscar código o cliente" className="mb-4 max-w-md" />
      {lista.isLoading ? <Cargando /> : filas.length === 0 ? <Vacio Icono={Ticket} titulo="Sin cupones" /> : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filas.map((c) => {
            const agotado = c.usos_actuales >= c.usos_maximos;
            const vencido = c.fecha_expiracion && c.fecha_expiracion < new Date().toISOString().slice(0, 10);
            return (
              <article key={c.id} className={cx('ficha flex overflow-hidden', (!c.activo || agotado || vencido) && 'opacity-60')}>
                <div className="w-24 bg-aji text-sobre-aji grid place-items-center font-display font-extrabold text-xl border-r-2 border-dashed border-fondo">
                  {c.tipo === 'porcentaje' ? `${Number(c.valor)}%` : Number(c.valor)}
                </div>
                <div className="flex-1 p-3 min-w-0">
                  <div className="flex items-center gap-1">
                    <p className="font-display font-bold tracking-wider flex-1 truncate">{c.codigo}</p>
                    <button className="btn-icono btn-fantasma h-7 w-7" onClick={() => { navigator.clipboard?.writeText(c.codigo); avisar.ok('Código copiado'); }} aria-label="Copiar"><Copy className="w-3.5 h-3.5" /></button>
                    {tiene('cupones', 'editar') && <button className="btn-icono btn-fantasma h-7 w-7" onClick={() => setEditar(c)} aria-label="Editar"><Pencil className="w-3.5 h-3.5" /></button>}
                    {tiene('cupones', 'eliminar') && <button className="btn-icono btn-fantasma h-7 w-7" aria-label="Eliminar" onClick={async () => { if (await confirmar({ titulo: `¿Eliminar ${c.codigo}?`, confirmar: 'Eliminar', peligro: true })) borrar.mutate(c); }}><Trash2 className="w-3.5 h-3.5" /></button>}
                  </div>
                  <p className="text-xs text-tenue">{c.usos_actuales}/{c.usos_maximos} usos{c.fecha_expiracion ? ` · vence ${c.fecha_expiracion}` : ''}</p>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {c.tipo === 'fijo' && <Insignia>{moneda} de descuento</Insignia>}
                    {c.cliente && <Insignia tono="info">{c.cliente.nombre}</Insignia>}
                    {agotado && <Insignia tono="peligro">Agotado</Insignia>}
                    {vencido && <Insignia tono="peligro">Vencido</Insignia>}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
      {editar && <HojaCupon c={editar === 'nuevo' ? null : editar} onCerrar={() => setEditar(null)} />}
      {confirmacion}
    </Pagina>
  );
}
