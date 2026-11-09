import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Disc3, Pencil, Trash2, Search, Gift } from 'lucide-react';
import { getPremiosRuleta, getPremiosRuletaActivos, crearPremioRuleta, actualizarPremioRuleta, eliminarPremioRuleta, getEstadoRuleta, girarRuleta } from '../../api/ruleta';
import { getClientes } from '../../api/clientes';
import { getProductos } from '../../api/productos';
import { getCombos } from '../../api/combos';
import { usePermisos } from '../../hooks/usePermisos';
import { useMoneda } from '../../hooks/useConfig';
import Hoja from '../../components/ui/Hoja';
import { Cargando, Campo, Encabezado, Interruptor, Pagina, Segmentado, SinPermiso, Vacio, Insignia, useConfirmar } from '../../components/ui/piezas';
import { numero, useCampos } from '../../components/ui/formulario';
import { avisar } from '../../components/ui/Aviso';
import { cx, errorDe } from '../../lib/util';
import { DatosGiro, LeyendaPremios, Rueda, TarjetaPremio, tonoDe, useGiro } from '../../components/ruleta/Rueda';

const TIPOS = { porcentaje: '% de descuento', fijo: 'Descuento fijo', producto_gratis: 'Producto gratis', combo_gratis: 'Combo gratis', nada: 'Sin premio' };

function Girar() {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [cliente, setCliente] = useState(null);
  const resultado = useRef(null);
  const premios = useQuery({ queryKey: ['ruleta-activos'], queryFn: getPremiosRuletaActivos });
  const buscar = useQuery({ queryKey: ['clientes-buscar', q], queryFn: () => getClientes({ buscar: q.trim() }), enabled: q.trim().length >= 2 });
  const estado = useQuery({ queryKey: ['ruleta-estado', cliente?.id], queryFn: () => getEstadoRuleta(cliente.id), enabled: !!cliente });
  const lista = useMemo(() => premios.data ?? [], [premios.data]);
  const giro = useGiro(lista, { alTerminar: () => qc.invalidateQueries({ queryKey: ['ruleta-estado'] }) });
  // En el celular el resultado queda debajo de la rueda: se lleva a la vista.
  useEffect(() => { if (giro.ganado) resultado.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, [giro.ganado]);

  const girar = useMutation({ mutationFn: () => girarRuleta(cliente.id), onSuccess: giro.animar, onError: (e) => avisar.error(errorDe(e)) });

  const e = estado.data;
  const inicial = (nombre) => nombre?.trim()?.[0]?.toUpperCase() ?? '?';
  const ganadorId = giro.ganado ? giro.ganado.premio?.id : null;
  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_360px] gap-6 items-start">
      <div className="ficha p-5 sm:p-8 overflow-hidden bg-[radial-gradient(circle_at_50%_42%,rgb(var(--aji)/.12),transparent_62%)]">
        {premios.isLoading ? <Cargando /> : lista.length === 0 ? <Vacio Icono={Gift} titulo="Configura premios primero" texto="Agrégalos en la pestaña Premios." /> : (
          <>
            <Rueda premios={lista} rotacion={giro.rotacion} girando={giro.girando} ganadorId={ganadorId} />
            <LeyendaPremios premios={lista} ganadorId={ganadorId} className="mt-7" />
          </>
        )}
      </div>
      <div className="space-y-3">
        {!cliente ? (
          <div className="ficha p-5">
            <p className="font-display font-semibold text-lg">¿Quién gira?</p>
            <p className="text-sm text-tenue mb-3">Busca al cliente para ver sus puntos.</p>
            <label className="relative block"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-tenue" /><input autoFocus className="campo pl-9" placeholder="Nombre o CI" value={q} onChange={(ev) => setQ(ev.target.value)} /></label>
            {q.trim().length >= 2 && buscar.isSuccess && buscar.data.length === 0 && <p className="text-sm text-tenue mt-3">Nadie con ese nombre o CI.</p>}
            <ul className="mt-2 -mx-1">
              {(buscar.data ?? []).slice(0, 6).map((c) => (
                <li key={c.id}>
                  <button className="w-full flex items-center gap-3 text-left px-2 py-2 rounded-xl hover:bg-hundido" onClick={() => setCliente(c)}>
                    <span className="w-9 h-9 shrink-0 rounded-full bg-hundido grid place-items-center font-semibold text-sm">{inicial(c.nombre)}</span>
                    <span className="flex-1 min-w-0 truncate">{c.nombre}</span>
                    <span className="num text-sm text-tenue">{c.puntos} pts</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="ficha p-5 space-y-4">
            <div className="flex items-center gap-3">
              <span className="w-11 h-11 shrink-0 rounded-full bg-aji text-sobre-aji grid place-items-center font-display font-bold text-lg">{inicial(cliente.nombre)}</span>
              <p className="font-display font-bold text-lg flex-1 min-w-0 truncate">{cliente.nombre}</p>
              <button className="text-sm text-tenue underline disabled:opacity-40" disabled={giro.girando} onClick={() => { setCliente(null); giro.limpiar(); }}>Cambiar</button>
            </div>
            {estado.isLoading && <Cargando />}
            {e && <DatosGiro e={e} />}
            {e && (
              <>
                {!e.puede_girar && <p className="text-sm text-locoto">{e.motivo_bloqueo}</p>}
                <button className="btn-aji btn-lg w-full" disabled={!e.puede_girar || giro.girando || girar.isPending || !lista.length} onClick={() => girar.mutate()}>
                  <Disc3 className={cx('w-5 h-5', giro.girando && 'animate-spin')} /> {giro.girando ? 'Girando…' : `Girar por ${e.costo_puntos} puntos`}
                </button>
              </>
            )}
          </div>
        )}
        {giro.ganado && <TarjetaPremio ganado={giro.ganado} nombreCliente={cliente?.nombre} refDiv={resultado} />}
      </div>
    </div>
  );
}

function HojaPremio({ p, onCerrar }) {
  const qc = useQueryClient();
  const moneda = useMoneda();
  const productos = useQuery({ queryKey: ['productos', 'activos'], queryFn: () => getProductos() });
  const combos = useQuery({ queryKey: ['combos'], queryFn: getCombos });
  const { f, campo, poner } = useCampos({
    nombre: p?.nombre ?? '', tipo: p?.tipo ?? 'porcentaje', valor: p?.valor != null ? String(Number(p.valor)) : '', probabilidad: String(p?.probabilidad ?? 1),
    producto_id: p?.producto_id ?? '', combo_id: p?.combo_id ?? '', activo: p ? !!p.activo : true,
  });
  const guardar = useMutation({
    mutationFn: () => {
      const d = { ...f, nombre: f.nombre.trim(), valor: ['porcentaje', 'fijo'].includes(f.tipo) ? Number(f.valor) : null, probabilidad: Number(f.probabilidad || 1), producto_id: f.tipo === 'producto_gratis' ? Number(f.producto_id) : null, combo_id: f.tipo === 'combo_gratis' ? Number(f.combo_id) : null, activo: f.activo ? 1 : 0 };
      return p ? actualizarPremioRuleta(p.id, d) : crearPremioRuleta(d);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ruleta-premios'] }); qc.invalidateQueries({ queryKey: ['ruleta-activos'] }); avisar.ok('Premio guardado'); onCerrar(); },
    onError: (e) => avisar.error(errorDe(e)),
  });
  return (
    <Hoja onCerrar={onCerrar} titulo={p ? 'Editar premio' : 'Nuevo premio'} ancho="max-w-md"
      pie={<button data-principal className="btn-aji w-full" disabled={!f.nombre.trim() || guardar.isPending} onClick={() => guardar.mutate()}>Guardar</button>}>
      <div className="space-y-3">
        <Campo etiqueta="Nombre en la rueda"><input autoFocus className="campo" {...campo('nombre')} placeholder="Ej.: 10% OFF" /></Campo>
        <Campo etiqueta="Tipo"><select className="campo" {...campo('tipo')}>{Object.entries(TIPOS).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></Campo>
        {['porcentaje', 'fijo'].includes(f.tipo) && <Campo etiqueta={f.tipo === 'porcentaje' ? 'Porcentaje' : `Monto (${moneda})`}><input className="campo num" {...campo('valor', numero)} /></Campo>}
        {f.tipo === 'producto_gratis' && <Campo etiqueta="Producto"><select className="campo" {...campo('producto_id')}><option value="">Elige…</option>{(productos.data ?? []).map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select></Campo>}
        {f.tipo === 'combo_gratis' && <Campo etiqueta="Combo"><select className="campo" {...campo('combo_id')}><option value="">Elige…</option>{(combos.data ?? []).map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select></Campo>}
        <Campo etiqueta="Peso (más alto = sale más seguido)" ayuda="En la rueda todos los premios se ven del mismo tamaño; el peso solo cambia cuánto sale."><input className="campo num" {...campo('probabilidad', (v) => v.replace(/\D/g, ''))} /></Campo>
        <Interruptor activo={f.activo} onCambio={(v) => poner('activo', v)} etiqueta="En la rueda" />
      </div>
    </Hoja>
  );
}

export default function RuletaPage() {
  const qc = useQueryClient();
  const { tiene } = usePermisos();
  const [tab, setTab] = useState(tiene('ruleta', 'girar') ? 'girar' : 'premios');
  const [editar, setEditar] = useState(null);
  const [confirmacion, confirmar] = useConfirmar();
  const premios = useQuery({ queryKey: ['ruleta-premios'], queryFn: getPremiosRuleta, enabled: tab === 'premios' && tiene('ruleta', 'ver') });
  const borrar = useMutation({ mutationFn: (p) => eliminarPremioRuleta(p.id), onSuccess: () => { qc.invalidateQueries({ queryKey: ['ruleta-premios'] }); qc.invalidateQueries({ queryKey: ['ruleta-activos'] }); }, onError: (e) => avisar.error(errorDe(e)) });
  if (!tiene('ruleta', 'girar') && !tiene('ruleta', 'ver')) return <SinPermiso />;
  const activos = (premios.data ?? []).filter((p) => p.activo);
  const total = activos.reduce((s, p) => s + p.probabilidad, 0) || 1;

  return (
    <Pagina>
      <Encabezado titulo="Ruleta" texto="El cliente canjea puntos por un giro. Actívala en Ajustes › Puntos y cumpleaños."
        acciones={<Segmentado valor={tab} onCambio={setTab} opciones={[...(tiene('ruleta', 'girar') ? [{ valor: 'girar', etiqueta: 'Girar' }] : []), ...(tiene('ruleta', 'ver') ? [{ valor: 'premios', etiqueta: 'Premios' }] : [])]} />} />
      {tab === 'girar' ? <Girar /> : premios.isLoading ? <Cargando /> : (
        <>
          {tiene('ruleta', 'crear') && <button className="btn-aji mb-4" onClick={() => setEditar('nuevo')}><Plus className="w-4 h-4" /> Nuevo premio</button>}
          {(premios.data ?? []).length === 0 ? <Vacio Icono={Gift} titulo="Sin premios" /> : (
            <ul className="ficha divide-y divide-linea">
              {premios.data.map((p) => (
                <li key={p.id} className={cx('flex items-center gap-3 px-4 py-3', !p.activo && 'opacity-50')}>
                  <span className="w-4 h-4 rounded-full ring-1 ring-tinta/20" style={{ background: p.activo ? tonoDe(activos.indexOf(p), activos.length).fondo : 'rgb(var(--hundido))' }} />
                  <div className="flex-1"><p className="font-semibold">{p.nombre}</p><p className="text-xs text-tenue">{TIPOS[p.tipo]}{p.valor ? ` · ${Number(p.valor)}` : ''}</p></div>
                  {p.activo && <Insignia>{Math.round((p.probabilidad / total) * 100)}% de salir</Insignia>}
                  {tiene('ruleta', 'editar') && <button className="btn-icono btn-fantasma h-8 w-8" onClick={() => setEditar(p)} aria-label="Editar"><Pencil className="w-4 h-4" /></button>}
                  {tiene('ruleta', 'eliminar') && <button className="btn-icono btn-fantasma h-8 w-8" aria-label="Eliminar" onClick={async () => { if (await confirmar({ titulo: `¿Eliminar ${p.nombre}?`, confirmar: 'Eliminar', peligro: true })) borrar.mutate(p); }}><Trash2 className="w-4 h-4" /></button>}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {editar && <HojaPremio p={editar === 'nuevo' ? null : editar} onCerrar={() => setEditar(null)} />}
      {confirmacion}
    </Pagina>
  );
}
