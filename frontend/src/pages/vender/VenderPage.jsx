import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Wallet, Receipt, LayoutGrid, Plus, Trash2, ChevronUp } from 'lucide-react';
import { getMesas, cerrarSesionMesa, abrirSesionMesa } from '../../api/mesas';
import { getVentas, crearVentaCompleta } from '../../api/ventas';
import { useCajaActiva } from '../../hooks/useCajaActiva';
import { usePermisos } from '../../hooks/usePermisos';
import { useMoneda } from '../../hooks/useConfig';
import { useSocket } from '../../hooks/useSocket';
import { useCatalogo } from './datosCatalogo';
import { useAgregar } from './useAgregar';
import { useCarrito } from './carritoStore';
import Catalogo from './Catalogo';
import Salon from './Salon';
import HojaCobro from './HojaCobro';
import PagosQrPorConfirmar from './PagosQrPorConfirmar';
import { DestinoChips, LineaComanda, TotalComanda } from './Comanda';
import Hoja from '../../components/ui/Hoja';
import { Cargando, Segmentado, SinPermiso, Vacio, useConfirmar } from '../../components/ui/piezas';
import { avisar } from '../../components/ui/Aviso';
import { dinero, errorDe } from '../../lib/util';

function HojaMesas({ mesas, ocupadas, onElegir, onCerrar }) {
  const libres = mesas.filter((m) => !ocupadas.has(m.id) && m.estado !== 'ocupada');
  return (
    <Hoja onCerrar={onCerrar} titulo="¿Qué mesa?" subtitulo={`${libres.length} libres`}>
      {mesas.length === 0 ? (
        <Vacio titulo="Todavía no hay mesas" texto="Créalas en Ajustes › Salón y mesas. Mientras tanto puedes vender para llevar." />
      ) : libres.length === 0 ? <Vacio titulo="Todas las mesas están ocupadas" texto="Vende para llevar, o agrega al pedido de una mesa desde Salón." /> : (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {libres.map((m) => (
            <button key={m.id} onClick={() => onElegir(m)} className="aspect-square rounded-xl border-2 border-linea hover:border-tinta flex flex-col items-center justify-center">
              <span className="font-display font-extrabold text-2xl">{m.nombre}</span>
              <span className="text-xs text-tenue">{m.area?.nombre}</span>
            </button>
          ))}
        </div>
      )}
    </Hoja>
  );
}

function HojaDelivery({ inicial, onGuardar, onCerrar }) {
  const [f, setF] = useState({ nombre: inicial?.nombre ?? '', telefono: inicial?.telefono ?? '', direccion: inicial?.direccion ?? '' });
  return (
    <Hoja onCerrar={onCerrar} titulo="Datos de entrega" ancho="max-w-md"
      pie={<button data-principal className="btn-aji w-full" disabled={!f.direccion.trim()} onClick={() => onGuardar({ tipo: 'delivery', ...f })}>Listo</button>}>
      <div className="space-y-3">
        <div><label className="etiqueta">Dirección *</label><textarea rows={2} autoFocus className="campo" value={f.direccion} onChange={(e) => setF({ ...f, direccion: e.target.value })} placeholder="Calle, número, referencia" /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="etiqueta">Nombre</label><input className="campo" value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} /></div>
          <div><label className="etiqueta">Teléfono</label><input className="campo" inputMode="tel" value={f.telefono} onChange={(e) => setF({ ...f, telefono: e.target.value })} /></div>
        </div>
      </div>
    </Hoja>
  );
}

export default function VenderPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const moneda = useMoneda();
  const { tiene } = usePermisos();
  const puedeVer = tiene('ventas', 'ver');
  const puedeCrear = tiene('ventas', 'crear');
  const puedeCobrar = tiene('ventas', 'cobrar');

  const [vista, setVista] = useState('vender');
  const [hoja, setHoja] = useState(null); // 'mesas' | 'delivery' | 'cobro' | 'comanda'
  const [confirmacion, confirmar] = useConfirmar();
  const caja = useCajaActiva();
  const cat = useCatalogo();
  const { lineas, destino, agregar, cambiar, setDestino, limpiar } = useCarrito();

  const mesasQ = useQuery({ queryKey: ['mesas'], queryFn: () => getMesas(), enabled: puedeVer });
  const activosQ = useQuery({ queryKey: ['ventas', 'activos'], queryFn: () => getVentas({ estado: 'pendiente,listo' }), enabled: puedeVer });
  const mesas = mesasQ.data ?? [];
  const activos = useMemo(() => (activosQ.data ?? []).filter((p) => p.origen !== 'app_externa'), [activosQ.data]);
  const ocupadas = useMemo(() => new Set(activos.map((p) => p.mesa_id).filter(Boolean)), [activos]);

  useSocket('restaurante:actualizar', () => {
    qc.invalidateQueries({ queryKey: ['mesas'] });
    qc.invalidateQueries({ queryKey: ['ventas'] });
  });
  useSocket('productos:actualizado', () => qc.invalidateQueries({ queryKey: ['productos-pos'] }));

  const ag = useAgregar({
    precioDe: cat.precioDe,
    onAgregar: (l) => { if (puedeCrear) agregar(l); },
  });

  const cantidades = useMemo(() => {
    const m = {};
    lineas.forEach((l) => {
      const k = l.combo_id ? `c${l.combo_id}` : l.producto_id;
      m[k] = (m[k] ?? 0) + l.cantidad;
    });
    return m;
  }, [lineas]);
  const total = lineas.reduce((s, l) => s + l.precio * l.cantidad, 0);
  const items = lineas.reduce((s, l) => s + l.cantidad, 0);

  const liberarMesa = useMutation({
    mutationFn: (m) => cerrarSesionMesa(m.id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['mesas'] }); avisar.ok('Mesa liberada'); },
    onError: (e) => avisar.error(errorDe(e)),
  });

  const abrirQr = useMutation({
    mutationFn: (m) => abrirSesionMesa(m.id),
    onSuccess: (_r, m) => { qc.invalidateQueries({ queryKey: ['mesas'] }); avisar.ok(`${m.nombre} lista: los clientes ya pueden pedir escaneando el QR.`); },
    onError: (e) => avisar.error(errorDe(e)),
  });

  if (!puedeVer) return <SinPermiso />;
  if (caja.cargando) return <Cargando />;
  if (!caja.sesion) {
    return (
      <Vacio
        className="min-h-[70vh] justify-center"
        Icono={Wallet}
        titulo={caja.sinSucursal ? 'Elige una sucursal para vender' : 'Abre tu caja para empezar a vender'}
        texto={caja.sinSucursal ? 'Entraste con “Todas las sucursales”. Cierra sesión y entra a una sucursal concreta.' : 'Cada venta queda registrada en el turno de tu caja.'}
        accion={!caja.sinSucursal && <Link to="/caja" className="btn-aji btn-lg">Abrir caja</Link>}
      />
    );
  }

  const datosVenta = () => ({
    tipo: destino?.tipo ?? 'llevar',
    mesa_id: destino?.tipo === 'mesa' ? destino.mesa.id : undefined,
    nombre_cliente: destino?.nombre?.trim() || undefined,
    direccion_entrega: destino?.tipo === 'delivery' ? destino.direccion : undefined,
    telefono_cliente: destino?.tipo === 'delivery' ? (destino.telefono || undefined) : undefined,
    items: lineas.map((l) => ({
      producto_id: l.producto_id, combo_id: l.combo_id, cantidad: l.cantidad, nota: l.nota, peso: l.peso,
      opcion_ids: l.opcion_ids, opciones_por_producto: l.opciones_por_producto,
    })),
    sesion_caja_id: caja.sesion.id,
  });

  const subtituloDestino = !destino ? 'Para llevar'
    : destino.tipo === 'mesa' ? destino.mesa.nombre
      : destino.tipo === 'delivery' ? `Delivery · ${destino.direccion}` : `Para llevar${destino.nombre ? ` · ${destino.nombre}` : ''}`;

  const abrirCobro = () => {
    if (!lineas.length) return;
    setHoja('cobro');
  };

  const terminar = (_r, extra) => {
    limpiar();
    setHoja(null);
    qc.invalidateQueries({ queryKey: ['ventas'] });
    qc.invalidateQueries({ queryKey: ['mesas'] });
    qc.invalidateQueries({ queryKey: ['productos-pos'] });
    if (extra?.diferido) avisar.ok('Enviado a cocina. Cóbralo desde el salón cuando termine.');
  };

  const vaciar = async () => {
    if (await confirmar({ titulo: '¿Vaciar la comanda?', texto: 'Se quitan todos los productos que agregaste.', confirmar: 'Vaciar', peligro: true })) limpiar();
  };

  const panelComanda = (
    <div className="flex flex-col h-full min-h-0">
      <div className="p-4 pb-3 space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="font-display font-bold text-xl flex-1">Comanda</h2>
          <span className="text-xs text-tenue">{caja.sesion.caja_nombre}</span>
          {lineas.length > 0 && <button className="btn-icono btn-fantasma h-8 w-8" onClick={vaciar} aria-label="Vaciar comanda"><Trash2 className="w-4 h-4" /></button>}
        </div>
        <DestinoChips
          destino={destino}
          onMesa={() => setHoja('mesas')}
          onLlevar={() => setDestino({ tipo: 'llevar', nombre: destino?.tipo === 'llevar' ? destino.nombre : '' })}
          onDelivery={() => setHoja('delivery')}
        />
        {destino?.tipo === 'llevar' && (
          <input className="campo h-10" placeholder="Nombre para llamar (opcional)" value={destino.nombre ?? ''} onChange={(e) => setDestino({ ...destino, nombre: e.target.value })} />
        )}
        {destino?.tipo === 'delivery' && (
          <button onClick={() => setHoja('delivery')} className="w-full text-left text-sm rounded-xl bg-hundido px-3 py-2">
            <span className="font-semibold">{destino.nombre || 'Cliente'}</span> {destino.telefono && <span className="text-tenue">· {destino.telefono}</span>}
            <span className="block text-tenue truncate">{destino.direccion}</span>
          </button>
        )}
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto scroll-fino px-4">
        <div className="perforado mb-1" />
        {lineas.length === 0 ? (
          <div className="py-12 text-center text-tenue text-sm">
            <Plus className="w-6 h-6 mx-auto mb-2 opacity-50" />
            Toca un producto para agregarlo.
          </div>
        ) : (
          <ul className="divide-y divide-dashed divide-linea">
            {lineas.map((l) => (
              <LineaComanda key={l.id} linea={l} onMas={() => cambiar(l.id, 1)} onMenos={() => cambiar(l.id, -1)} />
            ))}
          </ul>
        )}
      </div>
      <div className="p-4 pt-3 space-y-3 border-t border-dashed border-linea">
        <TotalComanda total={total} items={items} />
        <button className="btn-aji btn-lg w-full" disabled={!lineas.length || !puedeCrear} onClick={abrirCobro}>
          {puedeCobrar ? 'Cobrar' : 'Enviar pedido'} {lineas.length > 0 && <span className="num">· {dinero(total, moneda)}</span>}
        </button>
      </div>
    </div>
  );

  return (
    <div className="h-full flex">
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="flex items-center gap-3 px-4 sm:px-5 pt-4">
          <Segmentado
            valor={vista}
            onCambio={setVista}
            opciones={[
              { valor: 'vender', etiqueta: 'Vender', Icono: Plus },
              { valor: 'salon', etiqueta: 'Salón', Icono: LayoutGrid, cuenta: activos.length || null },
            ]}
          />
          <Link to="/vender/mis-ventas" className="btn-fantasma ml-auto"><Receipt className="w-4 h-4" /> <span className="hidden sm:inline">Mis ventas</span></Link>
        </div>
        <PagosQrPorConfirmar />
        {vista === 'vender' ? (
          <div className="flex-1 min-h-0">
            <Catalogo cat={cat} cantidades={cantidades} onProducto={ag.producto} onCombo={ag.combo} />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto scroll-fino px-4 sm:px-5 py-5">
            {mesasQ.isLoading ? <Cargando /> : (
              <Salon
                mesas={mesas}
                pedidos={activos}
                onPedido={(p) => navigate(`/vender/pedido/${p.id}`)}
                onMesaLibre={(m) => { setDestino({ tipo: 'mesa', mesa: m }); setVista('vender'); }}
                onAbrirQr={puedeCrear ? (m) => abrirQr.mutate(m) : undefined}
                onMesaSinPedido={async (m) => {
                  const ok = await confirmar({
                    titulo: `${m.nombre} todavía no pidió`,
                    texto: 'La mesa está abierta para pedir por QR. Si los clientes se fueron o prefieren pedirte a ti, libérala.',
                    confirmar: 'Liberar mesa',
                    cancelar: 'Dejarla así',
                  });
                  if (ok) liberarMesa.mutate(m);
                }}
              />
            )}
          </div>
        )}
      </div>

      {/* Comanda lateral en pantallas anchas */}
      <aside className="hidden lg:block w-[380px] shrink-0 p-4 pl-0">
        <div className="comanda rounded-t-2xl h-full shadow-papel">{panelComanda}</div>
      </aside>

      {/* Barra de comanda en celular/tablet */}
      {vista === 'vender' && lineas.length > 0 && (
        <div className="lg:hidden fixed inset-x-0 bottom-16 md:bottom-0 md:left-[84px] z-20 p-3">
          <button onClick={() => setHoja('comanda')} className="w-full h-14 rounded-2xl bg-tinta text-fondo px-4 flex items-center gap-3 shadow-flota">
            <span className="w-8 h-8 rounded-full bg-aji text-sobre-aji num font-bold grid place-items-center">{items}</span>
            <span className="font-semibold flex-1 text-left">Ver comanda</span>
            <span className="num font-bold text-lg">{dinero(total, moneda)}</span>
            <ChevronUp className="w-5 h-5" />
          </button>
        </div>
      )}

      {hoja === 'comanda' && (
        <Hoja onCerrar={() => setHoja(null)} sinRelleno>
          <div className="h-[75dvh]">{panelComanda}</div>
        </Hoja>
      )}
      {hoja === 'mesas' && (
        <HojaMesas mesas={mesas} ocupadas={ocupadas} onCerrar={() => setHoja(null)} onElegir={(m) => { setDestino({ tipo: 'mesa', mesa: m }); setHoja(null); }} />
      )}
      {hoja === 'delivery' && (
        <HojaDelivery inicial={destino?.tipo === 'delivery' ? destino : null} onCerrar={() => setHoja(null)} onGuardar={(d) => { setDestino(d); setHoja(null); }} />
      )}
      {hoja === 'cobro' && (
        <HojaCobro
          total={total}
          subtitulo={subtituloDestino}
          items={lineas.map((l) => ({ producto_id: l.producto_id ?? null, cantidad: l.cantidad, precio: l.precio }))}
          permitirDespues={destino?.tipo === 'mesa' || destino?.tipo === 'delivery' || !puedeCobrar}
          puedeCobrar={puedeCobrar}
          onConfirmar={(p) => crearVentaCompleta({ ...datosVenta(), ...p })}
          onDespues={(p) => crearVentaCompleta({ ...datosVenta(), ...p, metodo_pago: 'diferido' })}
          onCreado={() => { limpiar(); qc.invalidateQueries({ queryKey: ['ventas'] }); }}
          onTerminado={terminar}
          onCerrar={() => setHoja(null)}
        />
      )}
      {ag.hojas}
      {confirmacion}
    </div>
  );
}

