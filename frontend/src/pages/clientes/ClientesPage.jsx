import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Users, Star, Cake, Phone, KeyRound, Search, Loader2, Clock, Disc3, Ticket, MessageCircle } from 'lucide-react';
import { getClientes, crearCliente, actualizarCliente, buscarClientePorDocumento, resetearPinCliente, getFichaCliente } from '../../api/clientes';
import { getVentas } from '../../api/ventas';
import { usePermisos } from '../../hooks/usePermisos';
import { useConfig, useMoneda } from '../../hooks/useConfig';
import Hoja from '../../components/ui/Hoja';
import { Buscador, Cargando, Campo, Encabezado, Pagina, Segmentado, SinPermiso, Vacio, Insignia, useConfirmar } from '../../components/ui/piezas';
import { useCampos } from '../../components/ui/formulario';
import { avisar } from '../../components/ui/Aviso';
import { etiquetaDestino } from '../vender/datosCatalogo';
import { cx, dinero, errorDe, fechaCorta, iniciales } from '../../lib/util';
import { numeroWhatsApp, vencimiento, whatsappCupon } from '../../lib/cupones';

function useDebounce(v, ms = 350) {
  const [d, setD] = useState(v);
  useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t); }, [v, ms]);
  return d;
}

function HojaCliente({ c, onCerrar }) {
  const qc = useQueryClient();
  const { f, setF, campo } = useCampos({
    nombre: c?.nombre ?? '', tipo_documento: c?.tipo_documento ?? 'CI', numero_documento: c?.numero_documento ?? '',
    telefono: c?.telefono ?? '', email: c?.email ?? '', direccion: c?.direccion ?? '', fecha_nacimiento: c?.fecha_nacimiento ?? '',
  });
  const buscar = useMutation({
    mutationFn: () => buscarClientePorDocumento(f.numero_documento.trim()),
    onSuccess: (d) => { if (!d) return avisar.info('No encontramos a nadie con ese documento.'); setF((x) => ({ ...x, nombre: d.nombre || x.nombre, fecha_nacimiento: d.fecha_nacimiento || x.fecha_nacimiento })); },
    onError: (e) => avisar.error(errorDe(e, 'No se pudo consultar el documento.')),
  });
  const guardar = useMutation({
    mutationFn: () => {
      const d = { ...f, nombre: f.nombre.trim(), numero_documento: f.numero_documento.trim() || null, fecha_nacimiento: f.fecha_nacimiento || null };
      return c ? actualizarCliente(c.id, d) : crearCliente(d);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['clientes'] }); avisar.ok('Cliente guardado'); onCerrar(); },
    onError: (e) => avisar.error(errorDe(e)),
  });
  return (
    <Hoja onCerrar={onCerrar} titulo={c ? c.nombre : 'Nuevo cliente'} ancho="max-w-lg"
      pie={<button data-principal className="btn-aji w-full" disabled={!f.nombre.trim() || guardar.isPending} onClick={() => guardar.mutate()}>Guardar</button>}>
      <div className="space-y-3">
        <Campo etiqueta="Documento" ayuda={!c ? 'Escribe el CI y toca la lupa para completar el nombre.' : undefined}>
          <div className="flex gap-2">
            <select className="campo w-24" {...campo('tipo_documento')}><option>CI</option><option>NIT</option><option>Pasaporte</option></select>
            <input className="campo flex-1 num" autoFocus={!c} {...campo('numero_documento')} />
            <button type="button" className="btn-icono btn-borde" disabled={f.numero_documento.trim().length < 5 || buscar.isPending} onClick={() => buscar.mutate()} aria-label="Buscar por documento">{buscar.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}</button>
          </div>
        </Campo>
        <Campo etiqueta="Nombre"><input className="campo" {...campo('nombre')} /></Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo etiqueta="Celular"><input className="campo" inputMode="tel" {...campo('telefono')} /></Campo>
          <Campo etiqueta="Cumpleaños"><input type="date" className="campo" {...campo('fecha_nacimiento')} /></Campo>
        </div>
        <Campo etiqueta="Correo"><input className="campo" type="email" {...campo('email')} /></Campo>
        <Campo etiqueta="Dirección"><input className="campo" {...campo('direccion')} /></Campo>
      </div>
    </Hoja>
  );
}

function Caja({ valor, texto }) {
  return <div className="rounded-xl bg-hundido px-3 py-2.5 min-w-0"><p className="num text-lg font-bold truncate">{valor}</p><p className="text-xs text-tenue">{texto}</p></div>;
}

// Ficha del cliente: resumen, lo que más pide, cupones, ruleta, puntos y compras.
function Detalle({ c, onEditar, onCerrar }) {
  const moneda = useMoneda();
  const { config } = useConfig();
  const { tiene } = usePermisos();
  const [tab, setTab] = useState('resumen');
  const [confirmacion, confirmar] = useConfirmar();
  const ficha = useQuery({ queryKey: ['cliente-ficha', c.id], queryFn: () => getFichaCliente(c.id) });
  const compras = useQuery({ queryKey: ['cliente-compras', c.id], queryFn: () => getVentas({ cliente_id: c.id, estado: 'completado' }), enabled: tab === 'compras' && tiene('ventas', 'ver') });
  const pin = useMutation({ mutationFn: () => resetearPinCliente(c.id), onSuccess: () => avisar.ok('PIN reiniciado. El cliente creará uno nuevo en el menú QR.'), onError: (e) => avisar.error(errorDe(e)) });
  const d = ficha.data;
  const cupones = d?.cupones ?? [];
  const urgentes = cupones.filter((x) => vencimiento(x.fecha_expiracion).urgente).length;

  return (
    <Hoja onCerrar={onCerrar} ancho="max-w-xl">
      <div className="flex items-center gap-4 pt-5">
        <span className="w-16 h-16 shrink-0 rounded-full bg-aji text-sobre-aji grid place-items-center font-display font-extrabold text-xl">{iniciales(c.nombre)}</span>
        <div className="flex-1 min-w-0">
          <p className="font-display font-bold text-2xl leading-tight truncate">{c.nombre}</p>
          <p className="text-sm text-tenue">{c.tipo_documento} {c.numero_documento || '—'}</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm mt-1">
            {c.telefono && <a href={`tel:${c.telefono}`} className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5 text-tenue" /> {c.telefono}</a>}
            {c.fecha_nacimiento && <span className="flex items-center gap-1.5"><Cake className="w-3.5 h-3.5 text-tenue" /> {new Date(`${c.fecha_nacimiento}T12:00`).toLocaleDateString('es-BO', { day: 'numeric', month: 'long' })}</span>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 my-5">
        <Caja valor={d?.cliente.puntos ?? c.puntos ?? 0} texto="puntos" />
        <Caja valor={d?.resumen.visitas ?? '—'} texto="visitas" />
        <Caja valor={d ? dinero(d.resumen.gastado, moneda) : '—'} texto="en total" />
        <Caja valor={d?.resumen.ultima_visita ? haceDias(d.resumen.ultima_visita) : '—'} texto="última visita" />
      </div>

      <Segmentado className="w-full mb-4" valor={tab} onCambio={setTab} opciones={[
        { valor: 'resumen', etiqueta: 'Resumen' },
        { valor: 'cupones', etiqueta: cupones.length ? `Cupones · ${cupones.length}` : 'Cupones' },
        { valor: 'puntos', etiqueta: 'Puntos' },
        { valor: 'compras', etiqueta: 'Compras' },
      ]} />

      {ficha.isLoading ? <Cargando /> : !d ? <p className="text-sm text-tenue">No se pudo cargar la ficha.</p> : (
        <>
          {tab === 'resumen' && (
            <div className="space-y-5">
              {urgentes > 0 && (
                <button type="button" onClick={() => setTab('cupones')} className="w-full flex items-center gap-3 rounded-xl bg-locoto/10 text-locoto px-3 py-2.5 text-left text-sm font-semibold">
                  <Clock className="w-4 h-4 shrink-0" /> {urgentes === 1 ? 'Tiene 1 cupón por vencer' : `Tiene ${urgentes} cupones por vencer`}
                </button>
              )}
              <div>
                <p className="etiqueta">Lo que más pide</p>
                {d.favoritos.length === 0 ? <p className="text-sm text-tenue">Todavía no hay compras registradas.</p> : (
                  <ul className="space-y-2">
                    {d.favoritos.map((f, i) => (
                      <li key={`${f.producto_id}-${f.combo_id}`} className="flex items-center gap-3 text-sm">
                        <span className="num w-5 text-tenue">{i + 1}</span>
                        <span className="flex-1 min-w-0 truncate font-medium">{f.nombre}{f.combo_id ? <span className="text-tenue font-normal"> · combo</span> : null}</span>
                        <span className="text-tenue text-xs">{f.veces === 1 ? '1 visita' : `${f.veces} visitas`}</span>
                        <span className="num font-semibold w-10 text-right">×{f.cantidad}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {d.giros.length > 0 && (
                <div>
                  <p className="etiqueta">Ruleta</p>
                  <ul className="divide-y divide-linea text-sm">
                    {d.giros.slice(0, 6).map((g) => (
                      <li key={g.id} className="py-2 flex items-center gap-3">
                        <Disc3 className="w-4 h-4 text-tenue shrink-0" />
                        <span className="text-tenue w-16 shrink-0">{fechaCorta(g.fecha)}</span>
                        <span className={cx('flex-1 min-w-0 truncate', g.sin_premio && 'text-tenue')}>{g.premio}</span>
                        {g.cupon && <Insignia tono={g.cupon.estado === 'usado' ? 'ok' : g.cupon.estado === 'vencido' ? 'neutro' : 'alerta'}>{g.cupon.estado}</Insignia>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {tab === 'cupones' && (cupones.length === 0 ? <p className="text-sm text-tenue">No tiene cupones vigentes.</p> : (
            <ul className="space-y-2">
              {cupones.map((x) => {
                const v = vencimiento(x.fecha_expiracion);
                const wa = whatsappCupon({ telefono: c.telefono, cliente: c.nombre, negocio: config.nombre_negocio, cupon: x });
                return (
                  <li key={x.id} className="rounded-xl border border-dashed border-aji/60 bg-aji/5 px-3 py-2.5 flex items-center gap-3">
                    <Ticket className="w-5 h-5 text-aji shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate">{x.descripcion || x.codigo}</p>
                      <p className="text-xs text-tenue truncate">
                        {x.descripcion ? `${x.codigo} · ` : ''}{x.tipo === 'porcentaje' ? `${Number(x.valor)}%` : dinero(x.valor, moneda)} · <span className={cx(v.urgente && 'font-semibold text-locoto')}>{v.texto}</span>
                      </p>
                    </div>
                    {wa && <a href={wa} target="_blank" rel="noreferrer" className="btn-suave h-9 px-3 shrink-0" title="Recordarle por WhatsApp"><MessageCircle className="w-4 h-4" /> Avisar</a>}
                  </li>
                );
              })}
              {!numeroWhatsApp(c.telefono) && <p className="text-xs text-tenue pt-1">Registra su celular para poder recordarle sus cupones por WhatsApp.</p>}
            </ul>
          ))}

          {tab === 'puntos' && (d.movimientos.length === 0 ? <p className="text-sm text-tenue">Sin movimientos de puntos.</p> : (
            <ul className="divide-y divide-linea text-sm">
              {d.movimientos.map((m, i) => (
                <li key={i} className="py-2 flex items-center gap-3">
                  <span className="text-tenue w-16 shrink-0">{fechaCorta(m.fecha)}</span>
                  <span className="flex-1 min-w-0 truncate">{m.detalle}{m.pedido_id ? <span className="text-tenue"> #{m.pedido_id}</span> : null}</span>
                  <span className={cx('num font-semibold', m.puntos > 0 ? 'text-hierba' : 'text-tenue')}>{m.puntos > 0 ? '+' : ''}{m.puntos}</span>
                </li>
              ))}
            </ul>
          ))}

          {tab === 'compras' && (!tiene('ventas', 'ver') ? <p className="text-sm text-tenue">No tienes permiso para ver ventas.</p> : compras.isLoading ? <Cargando /> : (compras.data ?? []).length === 0 ? <p className="text-sm text-tenue">Sin compras registradas.</p> : (
            <ul className="divide-y divide-linea text-sm">
              {compras.data.slice(0, 15).map((p) => <li key={p.id} className="py-2 flex gap-3"><span className="text-tenue w-16">{fechaCorta(p.creado_en)}</span><span className="flex-1">{etiquetaDestino(p)}</span><span className="num">{dinero(p.total, moneda)}</span></li>)}
            </ul>
          ))}
        </>
      )}

      <div className="flex gap-2 mt-6">
        {tiene('clientes', 'editar') && <button className="btn-borde flex-1" onClick={onEditar}>Editar datos</button>}
        {tiene('clientes', 'editar') && <button className="btn-fantasma" onClick={async () => { if (await confirmar({ titulo: '¿Reiniciar el PIN?', texto: 'Úsalo si el cliente olvidó su PIN del menú QR.', confirmar: 'Reiniciar' })) pin.mutate(); }}><KeyRound className="w-4 h-4" /> PIN</button>}
      </div>
      {confirmacion}
    </Hoja>
  );
}

// "hoy", "ayer", "hace 5 días", "hace 3 meses".
function haceDias(fecha) {
  const d = Math.floor((Date.now() - new Date(fecha)) / 86400000);
  if (d <= 0) return 'hoy';
  if (d === 1) return 'ayer';
  if (d < 45) return `hace ${d} días`;
  return `hace ${Math.round(d / 30)} meses`;
}

export default function ClientesPage() {
  const { tiene } = usePermisos();
  const [q, setQ] = useState('');
  const buscar = useDebounce(q.trim());
  const [ver, setVer] = useState(null);
  const [editar, setEditar] = useState(null);
  const lista = useQuery({ queryKey: ['clientes', buscar], queryFn: () => getClientes(buscar ? { buscar } : {}), enabled: tiene('clientes', 'ver'), placeholderData: (x) => x });
  if (!tiene('clientes', 'ver')) return <SinPermiso />;
  const filas = lista.data ?? [];
  return (
    <Pagina>
      <Encabezado titulo="Clientes" texto={`${filas.length} ${buscar ? 'encontrados' : 'registrados'}`}
        acciones={tiene('clientes', 'crear') && <button className="btn-aji" onClick={() => setEditar('nuevo')}><Plus className="w-4 h-4" /> Nuevo cliente</button>} />
      <Buscador valor={q} onCambio={setQ} placeholder="Buscar por nombre o CI" className="mb-4 max-w-md" />
      {lista.isLoading ? <Cargando /> : filas.length === 0 ? <Vacio Icono={Users} titulo={buscar ? 'Nadie coincide' : 'Aún no hay clientes'} texto={!buscar ? 'Se registran al cobrar o desde aquí. Con puntos activados, vuelven más.' : undefined} /> : (
        <ul className="ficha divide-y divide-linea">
          {filas.slice(0, 200).map((c) => (
            <li key={c.id}>
              <button className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-hundido" onClick={() => setVer(c)}>
                <span className="w-10 h-10 rounded-full bg-hundido grid place-items-center font-display font-bold text-sm">{iniciales(c.nombre)}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{c.nombre}</p>
                  <p className="text-xs text-tenue">{c.numero_documento ? `${c.tipo_documento} ${c.numero_documento}` : 'Sin documento'}{c.telefono ? ` · ${c.telefono}` : ''}</p>
                </div>
                {c.puntos > 0 && <Insignia tono="alerta"><Star className="w-3 h-3" /> {c.puntos}</Insignia>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {ver && !editar && <Detalle c={ver} onCerrar={() => setVer(null)} onEditar={() => setEditar(ver)} />}
      {editar && <HojaCliente c={editar === 'nuevo' ? null : editar} onCerrar={() => { setEditar(null); setVer(null); }} />}
    </Pagina>
  );
}
