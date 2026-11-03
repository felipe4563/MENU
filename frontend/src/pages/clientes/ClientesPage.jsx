import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Users, Star, Cake, Phone, KeyRound, Search, Loader2 } from 'lucide-react';
import { getClientes, crearCliente, actualizarCliente, buscarClientePorDocumento, resetearPinCliente } from '../../api/clientes';
import { getVentas } from '../../api/ventas';
import { usePermisos } from '../../hooks/usePermisos';
import { useMoneda } from '../../hooks/useConfig';
import Hoja from '../../components/ui/Hoja';
import { Buscador, Cargando, Campo, Encabezado, Pagina, SinPermiso, Vacio, Insignia, useConfirmar } from '../../components/ui/piezas';
import { useCampos } from '../../components/ui/formulario';
import { avisar } from '../../components/ui/Aviso';
import { etiquetaDestino } from '../vender/datosCatalogo';
import { dinero, errorDe, fechaCorta, iniciales } from '../../lib/util';

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

function Detalle({ c, onEditar, onCerrar }) {
  const moneda = useMoneda();
  const { tiene } = usePermisos();
  const [confirmacion, confirmar] = useConfirmar();
  const compras = useQuery({ queryKey: ['cliente-compras', c.id], queryFn: () => getVentas({ cliente_id: c.id, estado: 'completado' }), enabled: tiene('ventas', 'ver') });
  const pin = useMutation({ mutationFn: () => resetearPinCliente(c.id), onSuccess: () => avisar.ok('PIN reiniciado. El cliente creará uno nuevo en el menú QR.'), onError: (e) => avisar.error(errorDe(e)) });
  const lista = compras.data ?? [];
  const gastado = lista.reduce((s, p) => s + Number(p.total) - Number(p.total_devuelto || 0), 0);
  return (
    <Hoja onCerrar={onCerrar} ancho="max-w-lg">
      <div className="flex items-center gap-4 pt-5">
        <span className="w-16 h-16 rounded-full bg-aji text-sobre-aji grid place-items-center font-display font-extrabold text-xl">{iniciales(c.nombre)}</span>
        <div className="flex-1 min-w-0">
          <p className="font-display font-bold text-2xl leading-tight">{c.nombre}</p>
          <p className="text-sm text-tenue">{c.tipo_documento} {c.numero_documento || '—'}</p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 my-5">
        <div className="rounded-xl bg-hundido p-3"><p className="num text-xl font-bold">{c.puntos ?? 0}</p><p className="text-xs text-tenue">puntos</p></div>
        <div className="rounded-xl bg-hundido p-3"><p className="num text-xl font-bold">{lista.length}</p><p className="text-xs text-tenue">compras</p></div>
        <div className="rounded-xl bg-hundido p-3"><p className="num text-xl font-bold">{dinero(gastado, moneda)}</p><p className="text-xs text-tenue">en total</p></div>
      </div>
      <div className="text-sm space-y-1.5 mb-4">
        {c.telefono && <a href={`tel:${c.telefono}`} className="flex gap-2"><Phone className="w-4 h-4 text-tenue" /> {c.telefono}</a>}
        {c.fecha_nacimiento && <p className="flex gap-2"><Cake className="w-4 h-4 text-tenue" /> {new Date(`${c.fecha_nacimiento}T12:00`).toLocaleDateString('es-BO', { day: 'numeric', month: 'long' })}</p>}
      </div>
      <p className="etiqueta">Últimas compras</p>
      {compras.isLoading ? <Cargando /> : lista.length === 0 ? <p className="text-sm text-tenue">Sin compras registradas.</p> : (
        <ul className="divide-y divide-linea text-sm">
          {lista.slice(0, 10).map((p) => <li key={p.id} className="py-2 flex gap-3"><span className="text-tenue w-16">{fechaCorta(p.creado_en)}</span><span className="flex-1">{etiquetaDestino(p)}</span><span className="num">{dinero(p.total, moneda)}</span></li>)}
        </ul>
      )}
      <div className="flex gap-2 mt-5">
        {tiene('clientes', 'editar') && <button className="btn-borde flex-1" onClick={onEditar}>Editar datos</button>}
        {tiene('clientes', 'editar') && <button className="btn-fantasma" onClick={async () => { if (await confirmar({ titulo: '¿Reiniciar el PIN?', texto: 'Úsalo si el cliente olvidó su PIN del menú QR.', confirmar: 'Reiniciar' })) pin.mutate(); }}><KeyRound className="w-4 h-4" /> PIN</button>}
      </div>
      {confirmacion}
    </Hoja>
  );
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
