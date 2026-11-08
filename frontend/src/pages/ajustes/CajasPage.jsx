import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Landmark, Pencil, Printer, Bluetooth, Trash2, Download } from 'lucide-react';
import { getCajas, crearCaja, actualizarCaja, eliminarCaja } from '../../api/cajas';
import { getSucursales } from '../../api/sucursales';
import { getEstadoAgentes } from '../../api/impresion';
import { useAuthStore } from '../../store/authStore';
import { usePermisos } from '../../hooks/usePermisos';
import Hoja from '../../components/ui/Hoja';
import { Cargando, Campo, Encabezado, Interruptor, Pagina, Segmentado, SinPermiso, Vacio, Insignia, useConfirmar } from '../../components/ui/piezas';
import { useCampos } from '../../components/ui/formulario';
import { OpcionTarjeta } from './comun';
import ImpresoraDispositivo from '../../components/shell/ImpresoraDispositivo';
import { avisar } from '../../components/ui/Aviso';
import { errorDe } from '../../lib/util';

function HojaCaja({ caja, sucursales, sucursalDefecto, onCerrar }) {
  const qc = useQueryClient();
  const { f, campo, poner } = useCampos({
    nombre: caja?.nombre ?? '', sucursal_id: caja?.sucursal_id ?? sucursalDefecto ?? sucursales[0]?.id ?? '',
    modo_impresion: caja?.modo_impresion ?? 'fisica', ancho_papel_bluetooth: caja?.ancho_papel_bluetooth ?? '80mm',
    conexion_bluetooth: caja?.conexion_bluetooth ?? 'directo',
    imprimir_logo: caja ? caja.imprimir_logo !== 0 : true,
    imprimir_ticket_cliente: caja ? !!caja.imprimir_ticket_cliente : true, activo: caja ? !!caja.activo : true,
  });
  const guardar = useMutation({
    mutationFn: () => {
      const d = { ...f, nombre: f.nombre.trim(), sucursal_id: Number(f.sucursal_id), imprimir_ticket_cliente: f.imprimir_ticket_cliente ? 1 : 0, imprimir_logo: f.imprimir_logo ? 1 : 0, activo: f.activo ? 1 : 0 };
      return caja ? actualizarCaja(caja.id, d) : crearCaja(d);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['cajas'] }); qc.invalidateQueries({ queryKey: ['caja-estado'] }); avisar.ok('Caja guardada'); onCerrar(); },
    onError: (e) => avisar.error(errorDe(e)),
  });
  return (
    <Hoja onCerrar={onCerrar} titulo={caja ? caja.nombre : 'Nueva caja'} ancho="max-w-lg"
      pie={<button data-principal className="btn-aji w-full" disabled={!f.nombre.trim() || !f.sucursal_id || guardar.isPending} onClick={() => guardar.mutate()}>Guardar caja</button>}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Campo etiqueta="Nombre"><input className="campo" autoFocus={!caja} {...campo('nombre')} placeholder="Caja 1" /></Campo>
          <Campo etiqueta="Sucursal">
            <select className="campo" {...campo('sucursal_id')} disabled={!!caja}>{sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}</select>
          </Campo>
        </div>
        <div>
          <span className="etiqueta">¿Cómo imprime?</span>
          <div className="grid sm:grid-cols-2 gap-2">
            <OpcionTarjeta Icono={Printer} activa={f.modo_impresion === 'fisica'} onClick={() => poner('modo_impresion', 'fisica')} titulo="Impresora en la PC" texto="USB o red, con el agente de impresión instalado en Windows." />
            <OpcionTarjeta Icono={Bluetooth} activa={f.modo_impresion === 'bluetooth'} onClick={() => poner('modo_impresion', 'bluetooth')} titulo="Bluetooth" texto="Impresora térmica Bluetooth, desde el celular, tablet o PC." />
          </div>
        </div>
        {f.modo_impresion === 'bluetooth' && (
          <div className="rounded-2xl bg-hundido/60 p-4 space-y-4">
            <div>
              <span className="etiqueta">Forma de conexión</span>
              <Segmentado valor={f.conexion_bluetooth} onCambio={(v) => poner('conexion_bluetooth', v)} opciones={[{ valor: 'directo', etiqueta: 'Directo' }, { valor: 'rawbt', etiqueta: 'App RawBT' }]} />
              <p className="text-[13px] text-tenue mt-2">
                {f.conexion_bluetooth === 'directo'
                  ? 'Recomendado. Chrome o Edge se conectan solos a la impresora, en Android o en la PC, sin instalar nada. Cada aparato que vende la conecta una vez desde su perfil › Impresora de este dispositivo.'
                  : 'Para impresoras que no aparecen en modo directo. Solo en Android, con la app RawBT instalada y la impresora emparejada en ella.'}
              </p>
            </div>
            <div><span className="etiqueta">Ancho del papel</span><Segmentado valor={f.ancho_papel_bluetooth} onCambio={(v) => poner('ancho_papel_bluetooth', v)} opciones={[{ valor: '58mm', etiqueta: '58 mm' }, { valor: '80mm', etiqueta: '80 mm' }]} /></div>
            <Interruptor activo={f.imprimir_logo} onCambio={(v) => poner('imprimir_logo', v)} etiqueta="Imprimir el logo en el ticket" descripcion="Apágalo si tu impresora no lo saca bien, o para que el ticket salga más rápido." />
          </div>
        )}
        <Interruptor activo={f.imprimir_ticket_cliente} onCambio={(v) => poner('imprimir_ticket_cliente', v)} etiqueta="Imprimir ticket para el cliente" descripcion="Apágalo para ahorrar papel: solo sale la comanda de cocina." />
        {caja && <Interruptor activo={f.activo} onCambio={(v) => poner('activo', v)} etiqueta="Caja activa" />}
      </div>
    </Hoja>
  );
}

export default function CajasPage() {
  const qc = useQueryClient();
  const { tiene } = usePermisos();
  const usuario = useAuthStore((s) => s.usuario);
  const [editar, setEditar] = useState(null);
  const [confirmacion, confirmar] = useConfirmar();
  const cajas = useQuery({ queryKey: ['cajas'], queryFn: () => getCajas(), enabled: tiene('cajas', 'ver') });
  const sucursales = useQuery({ queryKey: ['sucursales'], queryFn: getSucursales, enabled: tiene('sucursales', 'ver') });
  const agentes = useQuery({ queryKey: ['agentes'], queryFn: getEstadoAgentes, enabled: tiene('caja', 'ver') });
  const borrar = useMutation({ mutationFn: (c) => eliminarCaja(c.id), onSuccess: () => { qc.invalidateQueries({ queryKey: ['cajas'] }); avisar.ok('Caja eliminada'); }, onError: (e) => avisar.error(errorDe(e)) });
  if (!tiene('cajas', 'ver')) return <SinPermiso />;
  const listaSuc = sucursales.data ?? (usuario?.sucursal_activa?.id ? [usuario.sucursal_activa] : []);
  const conectada = (id) => (agentes.data ?? []).find((a) => a.caja_id === id)?.conectado;

  return (
    <Pagina>
      <Encabezado titulo="Cajas e impresión" texto="Puntos de cobro y cómo imprime cada uno."
        acciones={tiene('cajas', 'crear') && <button className="btn-aji" onClick={() => setEditar('nueva')}><Plus className="w-4 h-4" /> Nueva caja</button>} />
      {cajas.isLoading ? <Cargando /> : (cajas.data ?? []).length === 0 ? <Vacio Icono={Landmark} titulo="Sin cajas" texto="Crea al menos una para poder vender." /> : (
        <ul className="ficha divide-y divide-linea">
          {cajas.data.map((c) => {
            const estado = (
              <>
                {c.modo_impresion === 'fisica' && agentes.data && (conectada(c.id) ? <Insignia tono="ok">Impresora conectada</Insignia> : <Insignia tono="peligro">Impresora sin conexión</Insignia>)}
                {!c.activo && <Insignia>Inactiva</Insignia>}
              </>
            );
            return (
            <li key={c.id} className="flex items-center gap-3 px-4 py-3.5">
              <span className="w-10 h-10 shrink-0 rounded-xl bg-hundido grid place-items-center">{c.modo_impresion === 'bluetooth' ? <Bluetooth className="w-5 h-5" /> : <Printer className="w-5 h-5" />}</span>
              <div className="flex-1 min-w-0">
                <p className="font-semibold">{c.nombre}</p>
                <p className="text-xs text-tenue">{c.sucursal?.nombre} · {c.modo_impresion === 'bluetooth' ? `Bluetooth ${c.conexion_bluetooth === 'directo' ? 'directo' : 'con RawBT'} · ${c.ancho_papel_bluetooth}` : 'Impresora en la PC'}{!c.imprimir_ticket_cliente ? ' · sin ticket de cliente' : ''}</p>
                {/* En el celular el estado va debajo del nombre; en pantallas grandes, a la derecha. */}
                <div className="flex flex-wrap gap-1.5 mt-1.5 empty:hidden sm:hidden">{estado}</div>
              </div>
              <div className="hidden sm:flex items-center gap-2 shrink-0">{estado}</div>
              {tiene('cajas', 'editar') && <button className="btn-icono btn-fantasma" onClick={() => setEditar(c)} aria-label="Editar"><Pencil className="w-4 h-4" /></button>}
              {tiene('cajas', 'eliminar') && <button className="btn-icono btn-fantasma" aria-label="Eliminar" onClick={async () => { if (await confirmar({ titulo: `¿Eliminar ${c.nombre}?`, texto: 'Si tiene turnos registrados no se puede eliminar; desactívala.', confirmar: 'Eliminar', peligro: true })) borrar.mutate(c); }}><Trash2 className="w-4 h-4" /></button>}
            </li>
            );
          })}
        </ul>
      )}
      {(cajas.data ?? []).some((c) => c.modo_impresion === 'bluetooth' && c.conexion_bluetooth === 'directo') && (
        <section className="mt-6 ficha p-5 sm:p-6 grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] gap-5 md:gap-8 items-start">
          <div>
            <h2 className="font-display font-semibold text-lg flex items-center gap-2"><Bluetooth className="w-5 h-5" /> Impresora de este dispositivo</h2>
            <p className="text-sm text-tenue mt-1">El navegador recuerda la impresora en cada celular o computadora. Conéctala aquí si este aparato vende con una caja Bluetooth directo. Los cajeros lo hacen desde su perfil.</p>
          </div>
          <ImpresoraDispositivo />
        </section>
      )}
      <div className="mt-6 rounded-2xl bg-hundido p-4 flex gap-3 items-start">
        <Download className="w-5 h-5 mt-0.5" />
        <p className="text-sm">Para imprimir desde una computadora con Windows se instala el <b>agente de impresión</b> en esa PC (carpeta <code>print-agent</code> del sistema). Cuando está abierto, aquí aparece “Impresora conectada”.</p>
      </div>
      {editar && <HojaCaja caja={editar === 'nueva' ? null : editar} sucursales={listaSuc} sucursalDefecto={usuario?.sucursal_activa?.id} onCerrar={() => setEditar(null)} />}
      {confirmacion}
    </Pagina>
  );
}
