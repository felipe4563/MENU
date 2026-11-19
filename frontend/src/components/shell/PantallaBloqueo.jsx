import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Delete, Loader2, LockKeyhole, LogIn, Users, WifiOff } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useCarrito } from '../../pages/vender/carritoStore';
import { useEnLinea } from '../../hooks/useEnLinea';
import { useConfigPublica } from '../../hooks/useConfig';
import { avatarSrc } from '../../api/perfil';
import { entrarConPin, usuariosConPin } from '../../api/pin';
import { borrarVerificador, guardarVerificador, marcarDesbloqueado, puedeVerificarLocal, verificarLocal } from '../../lib/bloqueo';
import { desvincularPush, vincularPush } from '../../lib/push';
import { limpiarDatos } from '../../lib/queryClient';
import { primeraRuta } from './navegacion';
import { Cargando } from '../ui/piezas';
import { cx, iniciales } from '../../lib/util';

const LARGO = 4;

function Avatar({ usuario, className }) {
  const src = avatarSrc(usuario?.avatar);
  return (
    <span className={cx('rounded-full bg-aji text-sobre-aji grid place-items-center font-display font-bold overflow-hidden shrink-0', className)}>
      {src ? <img src={src} alt="" className="w-full h-full object-cover" /> : iniciales(usuario?.nombre)}
    </span>
  );
}

// Cuatro casillas que se llenan con el teclado de la pantalla o el del aparato.
function Casillas({ largo, error }) {
  return (
    <div aria-hidden className="flex justify-center gap-3">
      {Array.from({ length: LARGO }, (_, i) => {
        const lleno = i < largo;
        return (
          <span key={i} className={cx(
            'w-14 h-16 rounded-2xl border-2 grid place-items-center bg-papel transition-colors',
            error ? 'border-locoto' : lleno ? 'border-tinta' : 'border-linea',
          )}>
            {lleno && <span className="w-3.5 h-3.5 rounded-full bg-tinta" />}
          </span>
        );
      })}
    </div>
  );
}

function Teclado({ onDigito, onBorrar, disabled }) {
  const tecla = 'h-16 rounded-2xl text-2xl font-display font-bold num bg-hundido hover:bg-linea active:scale-95 transition disabled:opacity-50';
  return (
    <div className="grid grid-cols-3 gap-2.5 w-full max-w-[280px] mx-auto">
      {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
        <button key={d} type="button" className={tecla} disabled={disabled} onClick={() => onDigito(d)}>{d}</button>
      ))}
      <span />
      <button type="button" className={tecla} disabled={disabled} onClick={() => onDigito('0')}>0</button>
      <button type="button" className={cx(tecla, 'grid place-items-center bg-transparent hover:bg-hundido')} disabled={disabled} onClick={onBorrar} aria-label="Borrar">
        <Delete className="w-6 h-6" />
      </button>
    </div>
  );
}

// Mensaje para cada respuesta del servidor al PIN.
function mensajeError(err) {
  const r = err?.response;
  if (!r) return 'No se pudo conectar. Inténtalo de nuevo.';
  if (r.status === 401 && r.data?.intentos_restantes !== undefined) {
    const n = r.data.intentos_restantes;
    return n > 0 ? `PIN incorrecto. ${n === 1 ? 'Te queda 1 intento' : `Te quedan ${n} intentos`}.` : 'PIN incorrecto.';
  }
  return r.data?.mensaje || 'No se pudo entrar. Inténtalo de nuevo.';
}

export default function PantallaBloqueo() {
  const navigate = useNavigate();
  const usuario = useAuthStore((s) => s.usuario);
  const dispositivoToken = useAuthStore((s) => s.dispositivoToken);
  const setAuth = useAuthStore((s) => s.setAuth);
  const setDispositivoToken = useAuthStore((s) => s.setDispositivoToken);
  const logout = useAuthStore((s) => s.logout);
  const enLinea = useEnLinea();
  const { data: cfg = {} } = useConfigPublica();

  const [vista, setVista] = useState('pin'); // 'pin' | 'lista'
  const [elegido, setElegido] = useState(null); // otro usuario; null = el de la sesión
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [sacudidas, setSacudidas] = useState(0);
  const [saliendo, setSaliendo] = useState(false);
  const ocupadoRef = useRef(false);

  const quien = elegido ?? usuario;
  const mismo = !elegido;
  // El de la sesión puede entrar con PIN si lo tiene y el aparato está habilitado,
  // o sin internet si ya entró antes con su PIN en este aparato.
  const tienePin = mismo ? Boolean(usuario?.tiene_pin) || puedeVerificarLocal(usuario?.id) : true;
  const puedeEscribir = Boolean(dispositivoToken) && tienePin;

  const lista = useQuery({
    queryKey: ['pin-usuarios', dispositivoToken],
    queryFn: () => usuariosConPin(dispositivoToken),
    enabled: vista === 'lista' && Boolean(dispositivoToken),
    meta: { sinCopia: true },
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });

  // El aparato dejó de estar habilitado: queda solo entrar con correo.
  useEffect(() => {
    if (lista.error?.response?.status === 401) setDispositivoToken(null);
  }, [lista.error, setDispositivoToken]);

  function fallar(texto) {
    setError(texto);
    setPin('');
    setSacudidas((n) => n + 1);
  }

  async function entrarMismo(valor) {
    const local = async () => {
      if (!puedeVerificarLocal(usuario.id)) {
        return fallar('Sin internet no se puede revisar tu PIN en este aparato. Conéctate o entra con tu correo.');
      }
      if (await verificarLocal(usuario.id, valor)) return marcarDesbloqueado();
      fallar(puedeVerificarLocal(usuario.id) ? 'PIN incorrecto.' : 'Muchos intentos sin internet. Conéctate para entrar.');
    };
    if (!enLinea) return local();
    try {
      const datos = await entrarConPin({ dispositivo_token: dispositivoToken, usuario_id: usuario.id, pin: valor });
      await guardarVerificador(datos.usuario.id, valor);
      setAuth(datos);
      marcarDesbloqueado();
    } catch (err) {
      if (!err?.response && err?.code !== 'ERR_CANCELED') return local();
      tratarError(err);
    }
  }

  async function entrarOtro(valor) {
    try {
      const datos = await entrarConPin({ dispositivo_token: dispositivoToken, usuario_id: elegido.id, pin: valor });
      // Lo del usuario anterior no se le muestra al que entra (la cola de ventas sin internet sí se queda).
      await desvincularPush();
      await limpiarDatos();
      useCarrito.getState().limpiar();
      borrarVerificador();
      setAuth(datos);
      await guardarVerificador(datos.usuario.id, valor);
      vincularPush();
      marcarDesbloqueado();
      navigate(primeraRuta(datos.usuario?.permisos), { replace: true });
    } catch (err) {
      if (!err?.response) return fallar('Para cambiar de usuario necesitas internet');
      tratarError(err);
    }
  }

  function tratarError(err) {
    const status = err.response?.status;
    if (status === 401 && err.response.data?.intentos_restantes === undefined) setDispositivoToken(null);
    // PIN bloqueado en el servidor: tampoco sirve sin internet.
    if (status === 423 && mismo) borrarVerificador();
    fallar(mensajeError(err));
  }

  async function probar(valor) {
    if (ocupadoRef.current) return;
    ocupadoRef.current = true;
    setOcupado(true);
    setError('');
    try {
      if (mismo) await entrarMismo(valor);
      else await entrarOtro(valor);
    } finally {
      ocupadoRef.current = false;
      setOcupado(false);
    }
  }

  function escribir(d) {
    if (ocupadoRef.current || pin.length >= LARGO) return;
    setError('');
    const nuevo = pin + d;
    setPin(nuevo);
    if (nuevo.length === LARGO) probar(nuevo);
  }
  const borrar = () => { if (!ocupadoRef.current) setPin((p) => p.slice(0, -1)); };

  // El teclado del aparato también sirve (se vuelve a enganchar en cada render
  // para usar el PIN escrito hasta ahora).
  const activo = vista === 'pin' && puedeEscribir;
  useEffect(() => {
    if (!activo) return undefined;
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (/^\d$/.test(e.key)) { e.preventDefault(); escribir(e.key); }
      else if (e.key === 'Backspace') { e.preventDefault(); borrar(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  async function entrarConCorreo() {
    setSaliendo(true);
    await desvincularPush();
    logout();
    await limpiarDatos();
    navigate('/login');
  }

  function elegir(u) {
    setElegido(u.id === usuario?.id ? null : u);
    setPin('');
    setError('');
    setVista('pin');
  }

  const botonCorreo = (
    <button className="btn-borde w-full" onClick={entrarConCorreo} disabled={saliendo}>
      {saliendo ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />} Entrar con correo
    </button>
  );

  return (
    <div className="min-h-[100dvh] bg-fondo flex flex-col items-center px-5 pt-[max(env(safe-area-inset-top),2rem)] pb-[max(env(safe-area-inset-bottom),1.5rem)]">
      <p className="flex items-center gap-1.5 text-sm text-tenue">
        <LockKeyhole className="w-4 h-4" /> {cfg.nombre_negocio || 'Bloqueado'}
        {!enLinea && <span className="flex items-center gap-1 text-locoto ml-2"><WifiOff className="w-4 h-4" /> Sin internet</span>}
      </p>

      <div className="w-full max-w-sm flex-1 flex flex-col justify-center py-6">
        {vista === 'lista' ? (
          <div>
            <button className="btn-fantasma -ml-3 mb-3" onClick={() => setVista('pin')}><ArrowLeft className="w-4 h-4" /> Volver</button>
            <h1 className="font-display font-extrabold text-[28px] leading-none">¿Quién entra?</h1>
            <p className="text-tenue mt-2 mb-5">Personas de esta sucursal con PIN.</p>
            {lista.isLoading ? <Cargando /> : lista.error ? (
              <p className="text-sm text-locoto bg-locoto/10 rounded-xl px-3 py-2.5">{mensajeError(lista.error)}</p>
            ) : (
              <div className="space-y-2 max-h-[55dvh] overflow-y-auto">
                {(lista.data ?? []).filter((u) => u.id !== usuario?.id).map((u) => (
                  <button key={u.id} onClick={() => elegir(u)} className="w-full ficha flex items-center gap-3 p-3 text-left hover:border-tinta/40 transition">
                    <Avatar usuario={u} className="w-11 h-11" />
                    <span className="flex-1 font-semibold truncate">{u.nombre}</span>
                  </button>
                ))}
                {lista.data?.filter((u) => u.id !== usuario?.id).length === 0 && (
                  <p className="text-sm text-tenue">Nadie más tiene PIN en esta sucursal.</p>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center text-center">
            {!mismo && (
              <button className="btn-fantasma self-start -ml-3 mb-2" onClick={() => elegir(usuario)}><ArrowLeft className="w-4 h-4" /> {usuario?.nombre}</button>
            )}
            <Avatar usuario={quien} className="w-20 h-20 text-2xl" />
            <h1 className="font-display font-extrabold text-2xl mt-3 leading-tight">{quien?.nombre}</h1>

            {!dispositivoToken ? (
              <p className={cx('mt-2', error ? 'text-locoto' : 'text-tenue')}>{error || 'Para seguir, entra con tu correo.'}</p>
            ) : !tienePin ? (
              <p className="text-tenue mt-2">No tienes PIN en este aparato. Entra con tu correo; luego puedes crearlo en Mi perfil.</p>
            ) : (
              <>
                <p className="text-tenue mt-1 mb-5">Escribe tu PIN</p>
                <div key={sacudidas} className={sacudidas ? 'motion-safe:animate-sacude' : ''}>
                  <Casillas largo={pin.length} error={Boolean(error)} />
                </div>
                <p role="alert" className={cx('min-h-[2.75rem] text-sm mt-3 flex items-center justify-center gap-2', error ? 'text-locoto' : 'text-tenue')}>
                  {ocupado ? <><Loader2 className="w-4 h-4 animate-spin" /> Revisando…</> : error}
                </p>
                <Teclado onDigito={escribir} onBorrar={borrar} disabled={ocupado} />
              </>
            )}
          </div>
        )}
      </div>

      <div className="w-full max-w-sm space-y-2">
        {dispositivoToken && vista === 'pin' && (
          <>
            <button className="btn-suave w-full" disabled={!enLinea} onClick={() => { setVista('lista'); setError(''); }}>
              <Users className="w-4 h-4" /> Otro usuario
            </button>
            {!enLinea && <p className="text-xs text-tenue text-center">Para cambiar de usuario necesitas internet</p>}
          </>
        )}
        {botonCorreo}
      </div>
    </div>
  );
}
