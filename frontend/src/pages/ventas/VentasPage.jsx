import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  RefreshCw, AlertCircle, Package, ShoppingCart, ShoppingBag,
  Plus, Minus, Trash2, CreditCard, Wallet, ChevronRight, LayoutGrid, CheckCircle2, Gift, Disc3,
  Eye, EyeOff, Receipt,
} from 'lucide-react';
import { getMesas } from '../../api/mesas';
import { getVentas, crearVentaCompleta, cobrarVenta, reimprimirVenta } from '../../api/ventas';
import { getEstadoCajas } from '../../api/caja';
import { getProductos, actualizarDisponibilidad } from '../../api/productos';
import { getCategorias } from '../../api/categorias';
import { getCombosActivos } from '../../api/combos';
import { getPromocionesActivas } from '../../api/promociones';
import ClienteFidelidad from './components/ClienteFidelidad';
import CuponInput from './components/CuponInput';
import GirarRuletaPanel from '../ruleta/GirarRuletaPanel';
import { getConfiguracion } from '../../api/configuracion';
import { usePermisos } from '../../hooks/usePermisos';
import { useAuth } from '../../hooks/useAuth';
import { imprimirLocal, reimprimirConFallback } from '../../utils/impresionLocal';
import { calcularPrecioPesable, redondearAMedio } from '../../utils/precio';
import ModalLlevar from './components/ModalLlevar';
import ModalMesas from './components/ModalMesas';
import CategoriasBar from './components/CategoriasBar';
import ModalPagoQr from './components/ModalPagoQr';
import SelectorOpcionModal from './components/SelectorOpcionModal';
import ModalPeso from './components/ModalPeso';
import Modal from '../../components/ui/Modal';
import socket from '../../socket';

function nuevoLineaId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `linea-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function VentasPage() {
  const { tienePermiso } = usePermisos();
  const { usuario } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const puedeVer    = tienePermiso('ventas', 'ver');
  const puedeCrear  = tienePermiso('ventas', 'crear');
  const puedeCobrar = tienePermiso('ventas', 'cobrar');
  const puedeDisponibilidad = tienePermiso('productos', 'disponibilidad');

  const [categoriaActiva, setCategoriaActiva] = useState(null);
  const [carrito, setCarrito] = useState([]); // [{linea_id, producto_id, nombre, precio, cantidad, nota, peso?, precio_kg?}]
  const [mesaSeleccionada, setMesaSeleccionada] = useState(null); // id o null
  const [modoLlevar, setModoLlevar] = useState(null); // nombre_cliente o null
  const [modalLlevar, setModalLlevar] = useState(false);
  const [modalMesas, setModalMesas] = useState(false);
  const [modalCobrar, setModalCobrar] = useState(false);
  const [tabMobile, setTabMobile] = useState('productos'); // 'productos' | 'orden'
  const [selectorOpcion, setSelectorOpcion] = useState(null); // producto con grupo_opciones, o null
  const [colaOpcionesCombo, setColaOpcionesCombo] = useState(null); // { combo, pendientes: [producto...], resueltas: [{producto_id, opcion_ids}] } | null
  const [modalPeso, setModalPeso] = useState(null); // producto pesable pendiente de peso, o null

  const { data: mesas = [], isLoading: cargandoMesas } = useQuery({
    queryKey: ['mesas'],
    queryFn: getMesas,
    enabled: puedeVer,
  });

  const { data: cajasEstado = [], isLoading: cargandoCaja } = useQuery({
    queryKey: ['caja-estado', usuario?.sucursal_activa?.id],
    queryFn: () => getEstadoCajas(usuario?.sucursal_activa?.id),
    refetchInterval: 60_000,
    enabled: puedeVer && !!usuario?.sucursal_activa?.id,
  });

  // sesión abierta del usuario actual (no la primera que aparezca en la sucursal), usada como caja operativa de la venta
  const cajaActiva = cajasEstado.map(c => c.sesion_abierta).find(s => s?.usuario_id === usuario?.id) ?? null;

  const { data: pedidosActivos = [] } = useQuery({
    queryKey: ['ventas', 'activos'],
    queryFn: () => getVentas({ estado: 'pendiente,listo' }),
    enabled: puedeVer,
  });

  const { data: categorias = [] } = useQuery({
    queryKey: ['categorias'],
    queryFn: getCategorias,
  });

  const { data: productos = [], isLoading: cargandoProductos } = useQuery({
    queryKey: ['productos-pos', categoriaActiva],
    queryFn: () => getProductos({ solo_vendibles: true, solo_disponibles: true, order_by: 'mas_vendido', ...(categoriaActiva ? { categoria_id: categoriaActiva } : {}) }),
  });

  const { data: combosActivos = [] } = useQuery({
    queryKey: ['combos-activos'],
    queryFn: getCombosActivos,
    enabled: puedeVer,
  });

  const { data: promocionesActivas = [] } = useQuery({
    queryKey: ['promociones-activas'],
    queryFn: getPromocionesActivas,
    enabled: puedeVer,
  });

  const promoPorProducto = useMemo(() => {
    const mapa = {};
    promocionesActivas.forEach((p) => { mapa[p.producto_id] = p; });
    return mapa;
  }, [promocionesActivas]);

  function precioConPromo(prod) {
    const base = parseFloat(prod.precio);
    const promo = promoPorProducto[prod.id];
    if (!promo) return base;
    const descuento = promo.tipo === 'porcentaje' ? base * (parseFloat(promo.valor) / 100) : parseFloat(promo.valor);
    return redondearAMedio(Math.max(0, base - descuento));
  }

  useEffect(() => {
    function onActualizar() {
      queryClient.invalidateQueries({ queryKey: ['mesas'] });
      queryClient.invalidateQueries({ queryKey: ['ventas'] });
    }
    socket.on('restaurante:actualizar', onActualizar);
    return () => socket.off('restaurante:actualizar', onActualizar);
  }, [queryClient]);

  const toggleDisponibilidad = useMutation({
    mutationFn: ({ id, disponible_hoy }) => actualizarDisponibilidad(id, disponible_hoy),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['productos-pos'] }),
  });

  const pedidoPorMesa = pedidosActivos.reduce((acc, p) => {
    if (p.mesa_id) acc[p.mesa_id] = p;
    return acc;
  }, {});

  const cantidadPorProducto = useMemo(() => {
    return carrito.reduce((acc, it) => {
      if (it.producto_id) acc[it.producto_id] = (acc[it.producto_id] ?? 0) + it.cantidad;
      return acc;
    }, {});
  }, [carrito]);

  const total = carrito.reduce((sum, it) => sum + it.cantidad * it.precio, 0);
  const totalItems = carrito.reduce((sum, it) => sum + it.cantidad, 0);
  const puedeCobrarAhora = totalItems > 0 && (mesaSeleccionada != null || modoLlevar != null);

  function agregarAlCarrito(prod, seleccion) {
    const nota = seleccion?.nota ?? null;
    const opcionIds = seleccion?.opcionIds ?? [];
    const extra = seleccion?.extra ?? 0;
    const precioBase = precioConPromo(prod);
    setCarrito((prev) => {
      const existente = prev.find((it) => it.producto_id === prod.id && it.nota === nota);
      if (existente) {
        return prev.map((it) => it === existente ? { ...it, cantidad: it.cantidad + 1 } : it);
      }
      return [...prev, {
        linea_id: nuevoLineaId(), producto_id: prod.id, nombre: prod.nombre,
        precio: precioBase + extra, cantidad: 1, nota, opcion_ids: opcionIds,
      }];
    });
  }

  function agregarPesableAlCarrito(prod, pesoKg) {
    const precioBase = precioConPromo(prod);
    const precio = calcularPrecioPesable(pesoKg, precioBase);
    setCarrito((prev) => [...prev, {
      linea_id: nuevoLineaId(), producto_id: prod.id, nombre: prod.nombre,
      precio, cantidad: 1, nota: null, peso: pesoKg, precio_kg: precioBase,
    }]);
  }

  function comboContenido(combo) {
    return (combo.productos || []).map((p) => `${p.ComboProducto?.cantidad ?? 1}x ${p.nombre}`).join(', ');
  }

  // Clave para distinguir variantes del mismo combo en el carrito (ej. combo
  // con "Papas: Grande" vs. mismo combo con "Papas: Chico") — mismo criterio
  // que ya usa agregarAlCarrito con `nota` para productos sueltos.
  function _claveOpcionesCombo(opcionesPorProducto) {
    return JSON.stringify(
      [...(opcionesPorProducto || [])]
        .map((o) => ({ producto_id: o.producto_id, opcion_ids: [...(o.opcion_ids || [])].sort((a, b) => a - b) }))
        .sort((a, b) => a.producto_id - b.producto_id)
    );
  }

  function _extraOpcionesCombo(combo, opcionesPorProducto) {
    const opcionesPorId = new Map();
    (combo.productos || []).forEach((p) => (p.grupos_opciones || []).forEach((g) => (g.opciones || []).forEach((o) => opcionesPorId.set(o.id, o))));
    return (opcionesPorProducto || []).reduce(
      (sum, entrada) => sum + (entrada.opcion_ids || []).reduce((s, id) => s + parseFloat(opcionesPorId.get(id)?.precio_adicional || 0), 0),
      0
    );
  }

  function agregarComboAlCarrito(combo, opcionesPorProducto) {
    const clave = _claveOpcionesCombo(opcionesPorProducto);
    setCarrito((prev) => {
      const existente = prev.find((it) => it.combo_id === combo.id && it.combo_opciones_key === clave);
      if (existente) {
        return prev.map((it) => it === existente ? { ...it, cantidad: it.cantidad + 1 } : it);
      }
      return [...prev, {
        linea_id: nuevoLineaId(), combo_id: combo.id, nombre: `Combo: ${combo.nombre}`,
        precio: parseFloat(combo.precio) + _extraOpcionesCombo(combo, opcionesPorProducto), cantidad: 1, nota: null,
        combo_contenido: comboContenido(combo),
        opciones_por_producto: opcionesPorProducto,
        combo_opciones_key: clave,
      }];
    });
  }

  function agregarCombo(combo) {
    if (!puedeCrear) return;
    const productosConOpciones = (combo.productos || []).filter((p) => p.grupos_opciones?.length > 0);
    if (productosConOpciones.length === 0) {
      agregarComboAlCarrito(combo, []);
      return;
    }
    setColaOpcionesCombo({ combo, pendientes: productosConOpciones, resueltas: [] });
  }

  function elegirOpcionCombo(seleccion) {
    const cola = colaOpcionesCombo;
    if (!cola) return;
    const [actual, ...resto] = cola.pendientes;
    const resueltas = [...cola.resueltas, { producto_id: actual.id, opcion_ids: seleccion.opcionIds }];
    if (resto.length === 0) {
      agregarComboAlCarrito(cola.combo, resueltas);
      setColaOpcionesCombo(null);
    } else {
      setColaOpcionesCombo({ ...cola, pendientes: resto, resueltas });
    }
  }

  function handleProducto(prod) {
    if (!puedeCrear) return;
    if (!prod.disponible_hoy) return;
    if (prod.es_pesable) {
      setModalPeso(prod);
      return;
    }
    if (prod.grupos_opciones?.length > 0) {
      setSelectorOpcion(prod);
      return;
    }
    agregarAlCarrito(prod, null);
  }

  function elegirOpcion(seleccion) {
    agregarAlCarrito(selectorOpcion, seleccion);
    setSelectorOpcion(null);
  }

  function incrementar(linea_id) {
    setCarrito((prev) => prev.map((it) => it.linea_id === linea_id ? { ...it, cantidad: it.cantidad + 1 } : it));
  }

  function decrementar(linea_id) {
    setCarrito((prev) => {
      const item = prev.find((it) => it.linea_id === linea_id);
      if (item.cantidad <= 1) return prev.filter((it) => it !== item);
      return prev.map((it) => it === item ? { ...it, cantidad: it.cantidad - 1 } : it);
    });
  }

  function quitar(linea_id) {
    setCarrito((prev) => prev.filter((it) => it.linea_id !== linea_id));
  }

  function handleClickMesaDisponible(mesa) {
    setModoLlevar(null);
    setMesaSeleccionada((prev) => prev === mesa.id ? null : mesa.id);
  }

  function handleClickMesaOcupada(mesa) {
    const pedido = pedidoPorMesa[mesa.id];
    if (pedido) navigate(`/ventas/pedido/${pedido.id}`);
  }

  function limpiarTodo() {
    setCarrito([]);
    setMesaSeleccionada(null);
    setModoLlevar(null);
  }

  const mesaActual = mesas.find((m) => m.id === mesaSeleccionada);
  const mesasOcupadas = mesas.filter((m) => m.estado === 'ocupada' && pedidoPorMesa[m.id]);

  if (!puedeVer) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
        <AlertCircle className="w-10 h-10" />
        <p className="text-sm font-medium">No tienes permiso para ver ventas</p>
      </div>
    );
  }

  if (!cargandoCaja && !cajaActiva) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-amber-600 dark:text-amber-400">
        <Wallet className="w-10 h-10" />
        <p className="text-sm font-medium">No hay caja abierta</p>
        <button onClick={() => navigate('/caja')} className="text-sm underline flex items-center gap-1">
          Ir a Caja <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Header */}
      <header className="flex items-center justify-between gap-3 pb-3 border-b border-border shrink-0">
        <h1 className="font-bold text-foreground">Ventas</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/ventas/mis-ventas')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <Receipt className="w-3.5 h-3.5" /> Mis Ventas
          </button>
          <div className="flex md:hidden gap-1 bg-muted p-1 rounded-xl">
            <button
              onClick={() => setTabMobile('productos')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${tabMobile === 'productos' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'}`}
            >
              Menú
            </button>
            <button
              onClick={() => setTabMobile('orden')}
              className={`relative px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${tabMobile === 'orden' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'}`}
            >
              Orden
              {totalItems > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-primary text-primary-foreground text-[10px] rounded-full flex items-center justify-center">
                  {totalItems}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      <div className="flex flex-1 gap-4 overflow-hidden pt-4">
        {/* Panel izquierdo: productos */}
        <div className={`flex flex-col flex-1 min-w-0 overflow-hidden ${tabMobile === 'orden' ? 'hidden md:flex' : 'flex'}`}>
          <CategoriasBar
            categorias={categorias}
            categoriaActiva={categoriaActiva}
            onSeleccionar={setCategoriaActiva}
          />

          {combosActivos.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-2 mt-2 shrink-0 scrollbar-hide">
              {combosActivos.map((combo) => (
                <button
                  key={combo.id}
                  onClick={() => puedeCrear && agregarCombo(combo)}
                  disabled={!puedeCrear}
                  className="shrink-0 flex flex-col items-start gap-0.5 px-3.5 py-2.5 rounded-xl border border-primary/40 bg-primary/5 hover:bg-primary/10 transition-colors text-left disabled:opacity-50"
                >
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                    <Gift className="w-3.5 h-3.5 text-primary shrink-0" /> {combo.nombre}
                  </span>
                  {combo.productos?.length > 0 && (
                    <span className="text-[11px] text-muted-foreground max-w-[220px] truncate">
                      {comboContenido(combo)}
                    </span>
                  )}
                  <span className="text-xs font-bold text-primary">Bs {parseFloat(combo.precio).toFixed(2)}</span>
                </button>
              ))}
            </div>
          )}

          <div className="flex-1 overflow-y-auto mt-2 pb-4">
            {cargandoProductos ? (
              <div className="flex items-center justify-center h-32 gap-2 text-muted-foreground">
                <RefreshCw className="w-4 h-4 animate-spin" /><span className="text-sm">Cargando...</span>
              </div>
            ) : productos.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 gap-2 text-muted-foreground">
                <Package className="w-8 h-8" />
                <p className="text-sm">No hay productos en esta categoría</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                {productos.map((prod) => {
                  const cantidadEnCarrito = cantidadPorProducto[prod.id];
                  return (
                    <button
                      key={prod.id}
                      onClick={() => handleProducto(prod)}
                      disabled={!puedeCrear}
                      className={`relative flex flex-col rounded-xl border transition-all text-left overflow-hidden ${
                        !puedeCrear || !prod.disponible_hoy
                          ? 'opacity-50 cursor-not-allowed'
                          : cantidadEnCarrito
                          ? 'border-primary bg-primary/10 hover:bg-primary/15'
                          : 'border-border bg-card hover:border-primary/50 hover:shadow-sm'
                      }`}
                    >
                      {puedeDisponibilidad && (
                        <span
                          onClick={(e) => { e.stopPropagation(); toggleDisponibilidad.mutate({ id: prod.id, disponible_hoy: !prod.disponible_hoy }); }}
                          title={prod.disponible_hoy ? 'Marcar no disponible hoy' : 'Marcar disponible hoy'}
                          className="absolute top-2 left-2 z-10 w-6 h-6 rounded-full flex items-center justify-center bg-black/50 hover:bg-black/70 text-white cursor-pointer"
                        >
                          {prod.disponible_hoy ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                        </span>
                      )}
                      <div className="w-full aspect-square bg-muted overflow-hidden">
                        {prod.imagen ? (
                          <img src={prod.imagen} alt={prod.nombre} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Package className="w-10 h-10 text-muted-foreground" />
                          </div>
                        )}
                      </div>
                      <div className="p-2.5">
                        <p className="text-sm font-medium text-foreground leading-tight line-clamp-2">{prod.nombre}</p>
                        {!prod.disponible_hoy && (
                          <p className="text-[10px] font-semibold text-rose-600 dark:text-rose-400 mt-0.5">No disponible hoy</p>
                        )}
                        {promoPorProducto[prod.id] ? (
                          <div className="mt-1">
                            <p className="text-xs text-muted-foreground line-through">Bs {parseFloat(prod.precio).toFixed(2)}</p>
                            <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">Bs {precioConPromo(prod).toFixed(2)}{prod.es_pesable ? '/kg' : ''}</p>
                          </div>
                        ) : (
                          <p className="text-sm font-bold text-primary mt-1">Bs {parseFloat(prod.precio).toFixed(2)}{prod.es_pesable ? '/kg' : ''}</p>
                        )}
                      </div>
                      {cantidadEnCarrito && !prod.es_pesable && (
                        <span className="absolute top-2 right-2 w-6 h-6 bg-primary text-primary-foreground text-xs font-bold rounded-full flex items-center justify-center shadow">
                          {cantidadEnCarrito}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Panel derecho: orden + mesas + cobro */}
        <aside className={`flex flex-col w-full md:w-[320px] lg:w-[360px] xl:w-[400px] shrink-0 overflow-y-auto gap-4 ${tabMobile === 'productos' ? 'hidden md:flex' : 'flex'}`}>

          {/* Carrito */}
          <div className="flex flex-col bg-card border border-border rounded-2xl overflow-hidden shrink-0">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-4 h-4 text-muted-foreground" />
                <span className="font-semibold text-sm text-foreground">Orden</span>
              </div>
              {carrito.length > 0 && (
                <button onClick={limpiarTodo} className="text-xs text-destructive hover:text-destructive/80">Vaciar</button>
              )}
            </div>
            <div className="max-h-64 overflow-y-auto divide-y divide-border">
              {carrito.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-24 gap-2 text-muted-foreground">
                  <ShoppingCart className="w-8 h-8" />
                  <p className="text-xs">Toca un producto para agregarlo</p>
                </div>
              ) : (
                carrito.map((it) => (
                  <div key={it.linea_id} className="px-4 py-2.5 flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{it.nombre}</p>
                      {it.combo_contenido && <p className="text-xs text-muted-foreground/80 italic truncate">{it.combo_contenido}</p>}
                      {it.nota && <p className="text-xs text-amber-600 dark:text-amber-400 truncate">{it.nota}</p>}
                      {it.peso != null ? (
                        <p className="text-xs text-muted-foreground">{it.peso.toFixed(3)} kg × Bs {it.precio_kg.toFixed(2)}/kg</p>
                      ) : (
                        <p className="text-xs text-muted-foreground">Bs {it.precio.toFixed(2)} c/u</p>
                      )}
                    </div>
                    {it.peso != null ? (
                      <span className="text-sm font-semibold text-foreground shrink-0">{it.peso.toFixed(3)} kg</span>
                    ) : (
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => decrementar(it.linea_id)} className="w-6 h-6 rounded-lg bg-muted hover:bg-accent hover:text-accent-foreground flex items-center justify-center">
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="w-5 text-center text-sm font-semibold text-foreground">{it.cantidad}</span>
                        <button onClick={() => incrementar(it.linea_id)} className="w-6 h-6 rounded-lg bg-muted hover:bg-accent hover:text-accent-foreground flex items-center justify-center">
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                    <button onClick={() => quitar(it.linea_id)} className="shrink-0 p-1 text-muted-foreground hover:text-destructive">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
            <div className="px-4 py-3 flex items-center justify-between bg-muted border-t border-border">
              <span className="text-sm font-medium text-muted-foreground">Total</span>
              <span className="text-xl font-bold text-foreground">Bs {total.toFixed(2)}</span>
            </div>
          </div>

          {/* Mesa / para llevar */}
          <div className="flex flex-col bg-card border border-border rounded-2xl overflow-hidden shrink-0">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <span className="font-semibold text-sm text-foreground">Mesa</span>
              <button
                onClick={() => setModalLlevar(true)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  modoLlevar ? 'bg-orange-500 text-white' : 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 hover:bg-orange-100 dark:hover:bg-orange-900/30'
                }`}
              >
                <ShoppingBag className="w-3.5 h-3.5" />
                {modoLlevar ? `Llevar: ${modoLlevar}` : 'Para llevar'}
              </button>
            </div>

            <div className="p-3 flex flex-col gap-3">
              <button
                onClick={() => setModalMesas(true)}
                disabled={cargandoMesas}
                className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl border-2 text-left transition-colors ${
                  mesaActual
                    ? 'border-primary bg-primary/10'
                    : 'border-dashed border-border hover:border-primary'
                }`}
              >
                <LayoutGrid className={`w-4.5 h-4.5 shrink-0 ${mesaActual ? 'text-primary' : 'text-muted-foreground'}`} />
                <span className="flex-1 min-w-0">
                  {mesaActual ? (
                    <>
                      <span className="block text-sm font-semibold text-foreground">{mesaActual.nombre}</span>
                      <span className="block text-xs text-muted-foreground">{mesaActual.area?.nombre ?? 'Sin área'} · {mesaActual.asientos} asientos</span>
                    </>
                  ) : (
                    <span className="text-sm font-medium text-muted-foreground">
                      {cargandoMesas ? 'Cargando mesas...' : 'Elegir mesa'}
                    </span>
                  )}
                </span>
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              </button>

              {mesasOcupadas.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5">
                    Mesas ocupadas ({mesasOcupadas.length})
                  </p>
                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                    {mesasOcupadas.map((mesa) => (
                      <button
                        key={mesa.id}
                        onClick={() => handleClickMesaOcupada(mesa)}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-xs font-medium text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                        {mesa.nombre}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Cobrar */}
          {puedeCobrar && (
            <button
              onClick={() => setModalCobrar(true)}
              disabled={!puedeCobrarAhora}
              className="w-full flex items-center justify-center gap-2 py-3.5 bg-primary hover:bg-primary/90 active:bg-primary/80 disabled:opacity-50 text-primary-foreground rounded-xl font-bold text-base transition-colors shadow-sm shrink-0"
            >
              <CreditCard className="w-5 h-5" /> Cobrar
            </button>
          )}
        </aside>
      </div>

      {modalLlevar && (
        <ModalLlevar
          cargando={false}
          onClose={() => setModalLlevar(false)}
          onConfirmar={(nombre) => {
            setMesaSeleccionada(null);
            setModoLlevar(nombre || 'Cliente');
            setModalLlevar(false);
          }}
        />
      )}

      {modalMesas && (
        <ModalMesas
          mesas={mesas}
          pedidoPorMesa={pedidoPorMesa}
          mesaSeleccionada={mesaSeleccionada}
          onSeleccionar={(mesa) => handleClickMesaDisponible(mesa)}
          onClose={() => setModalMesas(false)}
        />
      )}

      {modalCobrar && (
        <ModalCobrar
          total={total}
          carrito={carrito}
          tipo={modoLlevar ? 'llevar' : 'mesa'}
          mesaId={mesaSeleccionada}
          nombreCliente={modoLlevar}
          sesionCajaId={cajaActiva?.id}
          onClose={() => setModalCobrar(false)}
          onExito={() => {
            limpiarTodo();
            setModalCobrar(false);
            queryClient.invalidateQueries({ queryKey: ['mesas'] });
            queryClient.invalidateQueries({ queryKey: ['ventas'] });
          }}
        />
      )}

      {selectorOpcion && (
        <SelectorOpcionModal
          producto={selectorOpcion}
          onElegir={elegirOpcion}
          onClose={() => setSelectorOpcion(null)}
        />
      )}

      {colaOpcionesCombo && (
        <SelectorOpcionModal
          key={colaOpcionesCombo.pendientes[0]?.id}
          producto={colaOpcionesCombo.pendientes[0]}
          subtitulo={`Combo: ${colaOpcionesCombo.combo.nombre} — Producto ${colaOpcionesCombo.resueltas.length + 1} de ${colaOpcionesCombo.pendientes.length + colaOpcionesCombo.resueltas.length}`}
          onElegir={elegirOpcionCombo}
          onClose={() => setColaOpcionesCombo(null)}
        />
      )}

      {modalPeso && (
        <ModalPeso
          producto={modalPeso}
          onConfirmar={(pesoKg) => { agregarPesableAlCarrito(modalPeso, pesoKg); setModalPeso(null); }}
          onClose={() => setModalPeso(null)}
        />
      )}
    </div>
  );
}

/* ─── Modal Cobrar ──────────────────────────────────────────────────────── */

function ModalCobrar({ total, carrito, tipo, mesaId, nombreCliente, sesionCajaId, onClose, onExito }) {
  const qc = useQueryClient();
  const { tienePermiso } = usePermisos();
  const [metodo, setMetodo] = useState('efectivo');
  const [notas, setNotas] = useState('');
  const [error, setError] = useState(null);
  const [pagoQrEstado, setPagoQrEstado] = useState(null); // { pedidoId, pagoQr } | null
  const [ventaExitosa, setVentaExitosa] = useState(null); // { pedidoId, metodoPago } | null
  const [clienteFidelidad, setClienteFidelidad] = useState(null);
  const [puntosCanjear, setPuntosCanjear] = useState(0);
  const [descuentoPuntos, setDescuentoPuntos] = useState(0);
  const [cuponAplicado, setCuponAplicado] = useState(null); // { codigo, descuento } | null
  const [mostrarRuleta, setMostrarRuleta] = useState(false);

  const { data: config = {} } = useQuery({ queryKey: ['configuracion'], queryFn: getConfiguracion, staleTime: 60_000 });
  const puedeCanjearPuntos = metodo === 'qr' ? config.fidelidad_canje_qr === 'true' : config.fidelidad_canje_efectivo !== 'false';

  const descuentoCupon = cuponAplicado?.descuento ?? 0;
  const totalFinal = Math.max(0, total - (puedeCanjearPuntos ? descuentoPuntos : 0) - descuentoCupon);

  const reimprimir = useMutation({
    mutationFn: () => reimprimirVenta(ventaExitosa.pedidoId),
    onSuccess: (datos) => reimprimirConFallback(datos),
  });

  const iniciar = useMutation({
    mutationFn: () => crearVentaCompleta({
      tipo,
      mesa_id: tipo === 'mesa' ? mesaId : undefined,
      nombre_cliente: nombreCliente ?? undefined,
      notas: notas.trim() || undefined,
      items: carrito.map((it) => ({ producto_id: it.producto_id, combo_id: it.combo_id, cantidad: it.cantidad, nota: it.nota, peso: it.peso, opcion_ids: it.opcion_ids, opciones_por_producto: it.opciones_por_producto })),
      metodo_pago: metodo,
      monto_recibido: totalFinal,
      sesion_caja_id: sesionCajaId,
      cliente_id: clienteFidelidad?.id,
      puntos_canjear: puedeCanjearPuntos ? puntosCanjear : 0,
      cupon_codigo: cuponAplicado?.codigo,
    }),
    onSuccess: (resultado) => {
      if (resultado.pago_qr) {
        setPagoQrEstado({ pedidoId: resultado.pedido.id, pagoQr: resultado.pago_qr });
      } else {
        imprimirLocal(resultado.datos_impresion);
        setVentaExitosa({ pedidoId: resultado.id, metodoPago: metodo });
      }
    },
    onError: (err) => setError(err?.response?.data?.mensaje ?? 'Error al cobrar'),
  });

  const reintentar = useMutation({
    mutationFn: () => cobrarVenta(pagoQrEstado.pedidoId, { metodo_pago: 'qr', monto_recibido: total }),
    onSuccess: (resultado) => setPagoQrEstado({ pedidoId: resultado.pedido.id, pagoQr: resultado.pago_qr }),
    onError: (err) => setError(err?.response?.data?.mensaje ?? 'Error al generar el QR'),
  });

  if (ventaExitosa) {
    return (
      <Modal titulo="Venta cobrada" onClose={onExito} ancho="max-w-sm">
        <div className="space-y-5 text-center">
          <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto" />
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Total cobrado</p>
            <p className="text-3xl font-bold text-foreground">Bs {totalFinal.toFixed(2)}</p>
            <p className="text-sm text-muted-foreground mt-1">
              {ventaExitosa.metodoPago === 'qr' ? 'QR / Transferencia' : 'Efectivo'}
            </p>
          </div>
          {reimprimir.isError && (
            <p className="text-sm text-destructive">No se pudo reimprimir.</p>
          )}
          <div className="flex justify-center gap-3">
            <button
              onClick={() => reimprimir.mutate()}
              disabled={reimprimir.isPending}
              className="px-4 py-2 rounded-xl text-sm border border-border text-foreground hover:bg-accent hover:text-accent-foreground transition-colors disabled:opacity-60"
            >
              {reimprimir.isPending ? 'Imprimiendo...' : '🖨 Imprimir de nuevo'}
            </button>
            <button
              onClick={onExito}
              className="px-5 py-2 rounded-xl text-sm bg-primary hover:bg-primary/90 text-primary-foreground font-semibold transition-colors"
            >
              Cerrar
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  if (pagoQrEstado) {
    return (
      <ModalPagoQr
        pedidoId={pagoQrEstado.pedidoId}
        pagoQr={pagoQrEstado.pagoQr}
        onClose={onClose}
        onCompletado={(pedido) => setVentaExitosa({ pedidoId: pedido.id, metodoPago: 'qr' })}
        onReintentar={() => reintentar.mutate()}
      />
    );
  }

  return (
    <>
    <Modal titulo="Cobrar orden" onClose={onClose} ancho="max-w-sm">
      <div className="space-y-5">
        <div className="bg-muted rounded-xl p-4 text-center">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Total a cobrar</p>
          {(puedeCanjearPuntos && descuentoPuntos > 0) || descuentoCupon > 0 ? (
            <>
              <p className="text-sm text-muted-foreground line-through">Bs {total.toFixed(2)}</p>
              <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">Bs {totalFinal.toFixed(2)}</p>
            </>
          ) : (
            <p className="text-3xl font-bold text-foreground">Bs {total.toFixed(2)}</p>
          )}
        </div>

        <ClienteFidelidad
          cliente={clienteFidelidad}
          onCambiarCliente={setClienteFidelidad}
          puntosCanjear={puntosCanjear}
          onCambiarPuntos={(puntos, descuento) => { setPuntosCanjear(puntos); setDescuentoPuntos(descuento); }}
          metodoPago={metodo}
        />

        <CuponInput
          subtotal={total - descuentoPuntos}
          cupon={cuponAplicado}
          onAplicar={(codigo, descuento) => setCuponAplicado({ codigo, descuento })}
          onQuitar={() => setCuponAplicado(null)}
          clienteId={clienteFidelidad?.id}
          items={carrito.map((it) => ({ producto_id: it.producto_id, cantidad: it.cantidad, precio: it.precio }))}
        />

        {clienteFidelidad?.id && tienePermiso('ruleta', 'girar') && (
          <button
            type="button"
            onClick={() => setMostrarRuleta(true)}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-primary/50 text-primary hover:bg-primary/10 text-sm font-semibold transition-colors"
          >
            <Disc3 className="w-4 h-4" /> Girar Ruleta de Premios
          </button>
        )}

        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Método de pago</p>
          <div className="grid grid-cols-2 gap-2">
            {[{ id: 'efectivo', label: 'Efectivo' }, { id: 'qr', label: 'QR / Transferencia' }].map((m) => (
              <button
                key={m.id}
                onClick={() => { setMetodo(m.id); setError(null); }}
                className={`py-3 rounded-xl text-sm font-medium border transition-colors ${
                  metodo === m.id ? 'bg-primary border-primary text-primary-foreground' : 'border-border text-muted-foreground hover:border-primary/50'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Nota del pedido (opcional)</p>
          <textarea
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Ej: entregar en recepción, para llevar en dos bolsas..."
            rows={2}
            className="w-full text-sm border border-input rounded-xl px-3 py-2 bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex justify-end gap-3 pt-1">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors">
            Cancelar
          </button>
          <button
            onClick={() => iniciar.mutate()}
            disabled={iniciar.isPending}
            className="px-5 py-2 rounded-xl text-sm bg-primary hover:bg-primary/90 text-primary-foreground font-semibold transition-colors disabled:opacity-60"
          >
            {iniciar.isPending ? 'Procesando...' : 'Confirmar cobro'}
          </button>
        </div>
      </div>
    </Modal>

    {mostrarRuleta && clienteFidelidad?.id && (
      <Modal titulo="Ruleta de Premios" onClose={() => setMostrarRuleta(false)} ancho="max-w-sm">
        <GirarRuletaPanel
          cliente={clienteFidelidad}
          layout="stack"
          onGanoPremio={() => qc.invalidateQueries({ queryKey: ['cupones-disponibles', clienteFidelidad.id] })}
        />
      </Modal>
    )}
    </>
  );
}
