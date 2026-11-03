import { useMemo, useState } from 'react';
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

const PALETA = ['#F2B705', '#17262B', '#E4572E', '#2F9E6B', '#2F6FD2', '#D73382', '#7B4AE2', '#8A0000'];
const TIPOS = { porcentaje: '% de descuento', fijo: 'Descuento fijo', producto_gratis: 'Producto gratis', combo_gratis: 'Combo gratis', nada: 'Sin premio' };

function Rueda({ premios, rotacion, girando }) {
  const total = premios.reduce((s, p) => s + p.probabilidad, 0) || 1;
  const acumulado = premios.map((_, i) => premios.slice(0, i).reduce((s, x) => s + x.probabilidad, 0));
  const partes = premios.map((p, i) => ({
    ...p,
    ini: (acumulado[i] / total) * 360,
    fin: ((acumulado[i] + p.probabilidad) / total) * 360,
    color: p.color || PALETA[i % PALETA.length],
  }));
  const fondo = partes.length ? `conic-gradient(${partes.map((p) => `${p.color} ${p.ini}deg ${p.fin}deg`).join(',')})` : 'rgb(var(--hundido))';
  return (
    <div className="relative w-72 h-72 sm:w-80 sm:h-80 mx-auto">
      <div className="absolute left-1/2 -top-2 -translate-x-1/2 z-10 w-0 h-0 border-l-[12px] border-r-[12px] border-t-[22px] border-l-transparent border-r-transparent border-t-tinta drop-shadow" />
      <div className="w-full h-full rounded-full border-[10px] border-tinta shadow-flota relative overflow-hidden"
        style={{ background: fondo, transform: `rotate(${rotacion}deg)`, transition: girando ? 'transform 5s cubic-bezier(.16,1,.3,1)' : 'none' }}>
        {partes.map((p) => {
          const medio = (p.ini + p.fin) / 2;
          return (
            <span key={p.id} className="absolute left-1/2 top-1/2 text-[11px] font-bold text-white drop-shadow origin-left whitespace-nowrap" style={{ transform: `rotate(${medio - 90}deg) translateX(38px)` }}>
              {p.nombre.length > 14 ? `${p.nombre.slice(0, 13)}…` : p.nombre}
            </span>
          );
        })}
      </div>
      <div className="absolute inset-0 m-auto w-14 h-14 rounded-full bg-tinta grid place-items-center"><Disc3 className="w-6 h-6 text-aji" /></div>
    </div>
  );
}

function Girar() {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [cliente, setCliente] = useState(null);
  const [rot, setRot] = useState(0);
  const [girando, setGirando] = useState(false);
  const [ganado, setGanado] = useState(null);
  const premios = useQuery({ queryKey: ['ruleta-activos'], queryFn: getPremiosRuletaActivos });
  const buscar = useQuery({ queryKey: ['clientes-buscar', q], queryFn: () => getClientes({ buscar: q.trim() }), enabled: q.trim().length >= 2 });
  const estado = useQuery({ queryKey: ['ruleta-estado', cliente?.id], queryFn: () => getEstadoRuleta(cliente.id), enabled: !!cliente });
  const lista = useMemo(() => premios.data ?? [], [premios.data]);

  const girar = useMutation({
    mutationFn: () => girarRuleta(cliente.id),
    onSuccess: (r) => {
      const total = lista.reduce((s, p) => s + p.probabilidad, 0) || 1;
      let acc = 0; let medio = 0;
      lista.forEach((p) => { const ini = acc; acc += p.probabilidad; if (p.id === r.premio?.id) medio = ((ini + acc) / 2 / total) * 360; });
      setGirando(true);
      setRot((x) => x - (x % 360) + 360 * 6 + (360 - medio));
      setTimeout(() => { setGirando(false); setGanado(r); qc.invalidateQueries({ queryKey: ['ruleta-estado'] }); }, 5200);
    },
    onError: (e) => avisar.error(errorDe(e)),
  });

  const e = estado.data;
  return (
    <div className="grid lg:grid-cols-[1fr_340px] gap-6 items-start">
      <div className="ficha p-6">{premios.isLoading ? <Cargando /> : lista.length === 0 ? <Vacio Icono={Gift} titulo="Configura premios primero" /> : <Rueda premios={lista} rotacion={rot} girando={girando} />}</div>
      <div className="space-y-3">
        {!cliente ? (
          <div className="ficha p-4">
            <p className="font-semibold mb-2">¿Quién gira?</p>
            <label className="relative block"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-tenue" /><input autoFocus className="campo pl-9" placeholder="Nombre o CI" value={q} onChange={(ev) => setQ(ev.target.value)} /></label>
            <ul className="mt-2">{(buscar.data ?? []).slice(0, 6).map((c) => <li key={c.id}><button className="w-full text-left px-3 py-2 rounded-lg hover:bg-hundido" onClick={() => setCliente(c)}>{c.nombre} <span className="text-xs text-tenue">· {c.puntos} pts</span></button></li>)}</ul>
          </div>
        ) : (
          <div className="ficha p-4 space-y-3">
            <div className="flex items-center"><p className="font-display font-bold text-lg flex-1">{cliente.nombre}</p><button className="text-sm text-tenue underline" onClick={() => { setCliente(null); setGanado(null); }}>Cambiar</button></div>
            {e && (
              <>
                <p className="text-sm">Tiene <b>{e.cliente.puntos} puntos</b>. Cada giro cuesta {e.costo_puntos}. Giró {e.giros_usados} de {e.max_giros_periodo} veces este {e.periodo === 'semana' ? 'semana' : 'día'}.</p>
                {!e.puede_girar && <p className="text-sm text-locoto">{e.motivo_bloqueo}</p>}
                <button className="btn-aji btn-lg w-full" disabled={!e.puede_girar || girando || girar.isPending || !lista.length} onClick={() => { setGanado(null); girar.mutate(); }}>
                  <Disc3 className={cx('w-5 h-5', girando && 'animate-spin')} /> {girando ? 'Girando…' : 'Girar la ruleta'}
                </button>
              </>
            )}
          </div>
        )}
        {ganado && (
          <div className="rounded-2xl bg-pizarra text-sobre-pizarra p-5 text-center animate-entra">
            <p className="text-sm opacity-70">Resultado</p>
            <p className="font-display font-extrabold text-2xl text-aji mt-1">{ganado.premio?.tipo === 'nada' ? 'Esta vez no hubo premio' : ganado.premio?.nombre}</p>
            {ganado.cupon?.codigo && <p className="text-sm mt-2">Cupón: <b className="tracking-wider">{ganado.cupon.codigo}</b></p>}
          </div>
        )}
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
    color: p?.color ?? PALETA[0], producto_id: p?.producto_id ?? '', combo_id: p?.combo_id ?? '', activo: p ? !!p.activo : true,
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
        <Campo etiqueta="Peso (más alto = sale más seguido)"><input className="campo num" {...campo('probabilidad', (v) => v.replace(/\D/g, ''))} /></Campo>
        <div><span className="etiqueta">Color</span><div className="flex gap-2">{PALETA.map((c) => <button key={c} type="button" onClick={() => poner('color', c)} className={cx('w-8 h-8 rounded-full', f.color === c && 'ring-2 ring-offset-2 ring-tinta')} style={{ background: c }} aria-label={c} />)}</div></div>
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
  const total = (premios.data ?? []).filter((p) => p.activo).reduce((s, p) => s + p.probabilidad, 0) || 1;

  return (
    <Pagina>
      <Encabezado titulo="Ruleta" texto="El cliente canjea puntos por un giro. Actívala en Ajustes › Puntos y cumpleaños."
        acciones={<Segmentado valor={tab} onCambio={setTab} opciones={[...(tiene('ruleta', 'girar') ? [{ valor: 'girar', etiqueta: 'Girar' }] : []), ...(tiene('ruleta', 'ver') ? [{ valor: 'premios', etiqueta: 'Premios' }] : [])]} />} />
      {tab === 'girar' ? <Girar /> : premios.isLoading ? <Cargando /> : (
        <>
          {tiene('ruleta', 'crear') && <button className="btn-aji mb-4" onClick={() => setEditar('nuevo')}><Plus className="w-4 h-4" /> Nuevo premio</button>}
          {(premios.data ?? []).length === 0 ? <Vacio Icono={Gift} titulo="Sin premios" /> : (
            <ul className="ficha divide-y divide-linea">
              {premios.data.map((p, i) => (
                <li key={p.id} className={cx('flex items-center gap-3 px-4 py-3', !p.activo && 'opacity-50')}>
                  <span className="w-4 h-4 rounded-full" style={{ background: p.color || PALETA[i % PALETA.length] }} />
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
