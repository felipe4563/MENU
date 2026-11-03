import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Truck, Pencil, Phone, Trash2 } from 'lucide-react';
import { getProveedores, crearProveedor, actualizarProveedor, desactivarProveedor } from '../../api/compras';
import { usePermisos } from '../../hooks/usePermisos';
import Hoja from '../../components/ui/Hoja';
import { Cargando, Campo, Encabezado, Pagina, SinPermiso, Vacio, useConfirmar } from '../../components/ui/piezas';
import { useCampos } from '../../components/ui/formulario';
import { avisar } from '../../components/ui/Aviso';
import { errorDe } from '../../lib/util';

function HojaProveedor({ p, onCerrar }) {
  const qc = useQueryClient();
  const { f, campo } = useCampos({ nombre: p?.nombre ?? '', contacto: p?.contacto ?? '', telefono: p?.telefono ?? '', email: p?.email ?? '', direccion: p?.direccion ?? '' });
  const guardar = useMutation({
    mutationFn: () => (p ? actualizarProveedor(p.id, f) : crearProveedor(f)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['proveedores'] }); avisar.ok('Proveedor guardado'); onCerrar(); },
    onError: (e) => avisar.error(errorDe(e)),
  });
  return (
    <Hoja onCerrar={onCerrar} titulo={p ? p.nombre : 'Nuevo proveedor'} ancho="max-w-md"
      pie={<button data-principal className="btn-aji w-full" disabled={!f.nombre.trim() || guardar.isPending} onClick={() => guardar.mutate()}>Guardar</button>}>
      <div className="space-y-3">
        <Campo etiqueta="Nombre"><input autoFocus={!p} className="campo" {...campo('nombre')} /></Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo etiqueta="Contacto"><input className="campo" {...campo('contacto')} /></Campo>
          <Campo etiqueta="Teléfono"><input className="campo" inputMode="tel" {...campo('telefono')} /></Campo>
        </div>
        <Campo etiqueta="Correo"><input className="campo" type="email" {...campo('email')} /></Campo>
        <Campo etiqueta="Dirección"><input className="campo" {...campo('direccion')} /></Campo>
      </div>
    </Hoja>
  );
}

export default function ProveedoresPage() {
  const qc = useQueryClient();
  const { tiene } = usePermisos();
  const [editar, setEditar] = useState(null);
  const [confirmacion, confirmar] = useConfirmar();
  const q = useQuery({ queryKey: ['proveedores'], queryFn: getProveedores, enabled: tiene('proveedores', 'ver') });
  const quitar = useMutation({ mutationFn: (p) => desactivarProveedor(p.id), onSuccess: () => qc.invalidateQueries({ queryKey: ['proveedores'] }), onError: (e) => avisar.error(errorDe(e)) });
  if (!tiene('proveedores', 'ver')) return <SinPermiso />;
  const lista = (q.data ?? []).filter((p) => p.activo !== 0);
  return (
    <Pagina>
      <Encabezado titulo="Proveedores" texto="A quién le compras."
        acciones={tiene('proveedores', 'crear') && <button className="btn-aji" onClick={() => setEditar('nuevo')}><Plus className="w-4 h-4" /> Nuevo proveedor</button>} />
      {q.isLoading ? <Cargando /> : lista.length === 0 ? <Vacio Icono={Truck} titulo="Sin proveedores" /> : (
        <ul className="ficha divide-y divide-linea">
          {lista.map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-4 py-3">
              <div className="flex-1 min-w-0"><p className="font-semibold">{p.nombre}</p><p className="text-xs text-tenue">{[p.contacto, p.direccion].filter(Boolean).join(' · ')}</p></div>
              {p.telefono && <a href={`tel:${p.telefono}`} className="btn-fantasma h-9 text-[13px]"><Phone className="w-4 h-4" /> {p.telefono}</a>}
              {tiene('proveedores', 'editar') && <button className="btn-icono btn-fantasma" onClick={() => setEditar(p)} aria-label="Editar"><Pencil className="w-4 h-4" /></button>}
              {tiene('proveedores', 'editar') && <button className="btn-icono btn-fantasma" aria-label="Quitar" onClick={async () => { if (await confirmar({ titulo: `¿Quitar ${p.nombre}?`, confirmar: 'Quitar', peligro: true })) quitar.mutate(p); }}><Trash2 className="w-4 h-4" /></button>}
            </li>
          ))}
        </ul>
      )}
      {editar && <HojaProveedor p={editar === 'nuevo' ? null : editar} onCerrar={() => setEditar(null)} />}
      {confirmacion}
    </Pagina>
  );
}
