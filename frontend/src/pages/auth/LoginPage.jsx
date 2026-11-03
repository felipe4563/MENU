import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, ArrowLeft, Building2, Loader2, Check } from 'lucide-react';
import api from '../../api/cliente';
import { useAuthStore } from '../../store/authStore';
import { logoSrc } from '../../api/configuracion';
import { useConfigPublica } from '../../hooks/useConfig';
import { primeraRuta } from '../../components/shell/navegacion';
import { errorDe, iniciales } from '../../lib/util';

function useReloj() {
  const [ahora, setAhora] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return ahora;
}

const saludoDe = (h) => (h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches');
const turnoDe = (h) => (h < 12 ? 'Turno mañana' : h < 19 ? 'Turno tarde' : 'Turno noche');

// Lo que dice la línea de Caja según lo que pasa en el formulario.
function lineaCaja({ estado, quien }) {
  if (estado === 'abriendo') return { texto: 'abriendo…', clase: 'text-tinta font-semibold', punto: 'bg-aji animate-latido' };
  if (estado === 'error') return { texto: 'revisa tus datos', clase: 'text-locoto font-semibold', punto: 'bg-locoto' };
  if (quien) return { texto: `para ${quien}`, clase: 'text-tinta font-semibold', punto: 'bg-hierba' };
  return { texto: 'esperando turno', clase: 'text-tenue', punto: 'bg-tenue/60 animate-latido' };
}

function ComandaBienvenida({ nombre, logo, estado, quien, sacudidas }) {
  const ahora = useReloj();
  const h = ahora.getHours();
  const caja = lineaCaja({ estado, quien });
  const lineas = [
    ['Mesas', 'listas'],
    ['Cocina', 'encendida'],
  ];
  return (
    // Cuelga del riel: se balancea al llegar y se sacude si la contraseña falla.
    <div className="origin-top motion-safe:animate-balanceo" style={{ animationDelay: '.15s' }}>
      <div key={sacudidas} className={sacudidas ? 'motion-safe:animate-sacude' : ''}>
        <div className="mx-auto w-3 h-6 rounded-b-md bg-white/25 relative z-10 -mb-2" />
        <div className="comanda w-[300px] max-w-full rounded-t-xl shadow-flota px-6 pt-6 text-tinta animate-imprime origin-top" style={{ animationDelay: '.2s' }}>
          <div className="flex items-center justify-between text-xs text-tenue">
            <span>{turnoDe(h)}</span>
            <span className="num font-semibold text-tinta">
              {String(h).padStart(2, '0')}
              <span className="motion-safe:animate-latido">:</span>
              {String(ahora.getMinutes()).padStart(2, '0')}
            </span>
          </div>
          <div className="flex flex-col items-center text-center gap-3 mt-4">
            <div className="w-16 h-16 rounded-2xl bg-aji text-sobre-aji grid place-items-center overflow-hidden">
              {logo ? <img src={logo} alt="" className="w-full h-full object-cover" /> : <span className="font-display font-extrabold text-2xl">{iniciales(nombre)}</span>}
            </div>
            <p className="font-display font-extrabold text-2xl leading-tight">{nombre}</p>
            <p className="text-xs text-tenue num first-letter:uppercase">
              {ahora.toLocaleDateString('es-BO', { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
          </div>
          <div className="perforado my-5" />
          <ul className="space-y-2.5 text-sm">
            {lineas.map(([a, b], i) => (
              <li key={a} className="flex items-baseline gap-2 motion-safe:animate-aparece" style={{ animationDelay: `${0.9 + i * 0.35}s` }}>
                <Check className="w-3.5 h-3.5 text-hierba self-center" strokeWidth={3} />
                <span className="font-semibold">{a}</span>
                <span className="flex-1 border-b border-dotted border-linea translate-y-[-3px]" />
                <span className="text-tenue">{b}</span>
              </li>
            ))}
            <li className="flex items-baseline gap-2 motion-safe:animate-aparece" style={{ animationDelay: '1.6s' }}>
              <span className={`w-2 h-2 mx-[3px] rounded-full self-center ${caja.punto}`} />
              <span className="font-semibold">Caja</span>
              <span className="flex-1 border-b border-dotted border-linea translate-y-[-3px]" />
              <span key={caja.texto} className={`truncate max-w-[150px] animate-entra ${caja.clase}`}>{caja.texto}</span>
            </li>
          </ul>
          <div className="perforado my-5" />
          <p className="text-center font-display font-bold text-lg">{saludoDe(h)}</p>
          <p className="text-center text-xs text-tenue pb-2 mt-0.5">Buen turno</p>
        </div>
      </div>
    </div>
  );
}

// En el celular: una comanda corta colgando arriba, con lo mismo que en grande.
function ComandaMovil({ nombre, logo, estado, quien, sacudidas }) {
  const ahora = useReloj();
  const h = ahora.getHours();
  const caja = lineaCaja({ estado, quien });
  return (
    <div className="origin-top motion-safe:animate-balanceo w-full max-w-[340px]" style={{ animationDelay: '.1s' }}>
      <div key={sacudidas} className={sacudidas ? 'motion-safe:animate-sacude' : ''}>
        <div className="mx-auto w-3 h-5 rounded-b-md bg-white/25 relative z-10 -mb-2" />
        <div className="comanda rounded-t-xl shadow-flota px-5 pt-5 text-tinta animate-imprime" style={{ animationDelay: '.15s' }}>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 shrink-0 rounded-xl bg-aji text-sobre-aji grid place-items-center overflow-hidden">
              {logo ? <img src={logo} alt="" className="w-full h-full object-cover" /> : <span className="font-display font-extrabold">{iniciales(nombre)}</span>}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-display font-extrabold text-lg leading-tight truncate">{nombre}</p>
              <p className="text-xs text-tenue first-letter:uppercase">{saludoDe(h)} · {turnoDe(h).toLowerCase()}</p>
            </div>
            <span className="num font-semibold text-sm">
              {String(h).padStart(2, '0')}
              <span className="motion-safe:animate-latido">:</span>
              {String(ahora.getMinutes()).padStart(2, '0')}
            </span>
          </div>
          <div className="perforado my-4" />
          <div className="flex items-baseline gap-2 text-sm pb-1">
            <span className={`w-2 h-2 rounded-full self-center ${caja.punto}`} />
            <span className="font-semibold">Caja</span>
            <span className="flex-1 border-b border-dotted border-linea translate-y-[-3px]" />
            <span key={caja.texto} className={`truncate max-w-[60%] animate-entra ${caja.clase}`}>{caja.texto}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Comandas de fondo colgadas del mismo riel, para que se lea como la cocina.
function ComandaFondo({ className, style, filas = 4 }) {
  return (
    <div aria-hidden className={`absolute top-0 origin-top motion-safe:animate-meceo ${className}`} style={style}>
      <div className="mx-auto w-2.5 h-5 rounded-b-md bg-white/15 -mb-2" />
      <div className="comanda w-[180px] rounded-t-lg px-4 pt-5 opacity-[.08]">
        <div className="h-2.5 w-16 rounded bg-tinta mb-4" />
        {Array.from({ length: filas }, (_, i) => (
          <div key={i} className="h-2 rounded bg-tinta mb-2.5" style={{ width: `${55 + ((i * 37) % 40)}%` }} />
        ))}
      </div>
    </div>
  );
}

export default function LoginPage() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const { data: cfg = {} } = useConfigPublica();
  const nombre = cfg.nombre_negocio || 'Tu restaurante';

  const [email, setEmail] = useState('');
  const [clave, setClave] = useState('');
  const [ver, setVer] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [paso, setPaso] = useState('credenciales');
  const [preToken, setPreToken] = useState(null);
  const [sucursales, setSucursales] = useState([]);
  const [sacudidas, setSacudidas] = useState(0);
  const [error, setError] = useState(() =>
    new URLSearchParams(window.location.search).get('motivo') === 'sesion_otro_dispositivo'
      ? 'Tu sesión se cerró porque entraste con tu usuario en otro dispositivo.'
      : '');

  useEffect(() => {
    if (window.location.search) window.history.replaceState({}, '', '/login');
  }, []);

  function entrar(datos) {
    setAuth(datos);
    navigate(primeraRuta(datos.usuario?.permisos), { replace: true });
  }

  async function enviar(e) {
    e.preventDefault();
    setError('');
    setCargando(true);
    try {
      const { data } = await api.post('/auth/login', { email: email.trim(), contrasena: clave });
      if (data.datos.requiere_sucursal) {
        setPreToken(data.datos.pre_token);
        setSucursales(data.datos.sucursales);
        setPaso('sucursal');
      } else {
        entrar(data.datos);
      }
    } catch (err) {
      setError(errorDe(err, 'No se pudo iniciar sesión.'));
      setSacudidas((n) => n + 1);
    } finally {
      setCargando(false);
    }
  }

  async function elegir(id) {
    setError('');
    setCargando(true);
    try {
      const { data } = await api.post('/auth/login/sucursal', { pre_token: preToken, sucursal_id: id });
      entrar(data.datos);
    } catch (err) {
      setError(errorDe(err, 'No se pudo entrar a esa sucursal. Vuelve a iniciar sesión.'));
      setPaso('credenciales');
    } finally {
      setCargando(false);
    }
  }

  const usuarioCorreo = email.split('@')[0].replace(/[._-]+/g, ' ').trim();
  const quien = paso === 'sucursal' ? 'elegir sucursal' : usuarioCorreo && usuarioCorreo.charAt(0).toUpperCase() + usuarioCorreo.slice(1);
  const estadoComanda = cargando ? 'abriendo' : error && sacudidas ? 'error' : 'espera';

  return (
    <div className="min-h-[100dvh] lg:min-h-full flex flex-col lg:grid lg:grid-cols-[1.1fr_1fr] bg-pizarra lg:bg-transparent">
      <section className="lg:hidden relative px-5 pt-[max(env(safe-area-inset-top),1.25rem)] pb-12">
        <div className="h-2.5 bg-white/10 rounded-full mx-1" />
        <div className="flex justify-center -mt-1">
          <ComandaMovil nombre={nombre} logo={logoSrc(cfg.logo)} estado={estadoComanda} quien={quien} sacudidas={sacudidas} />
        </div>
      </section>

      <section className="relative hidden lg:flex flex-col bg-pizarra text-sobre-pizarra overflow-hidden">
        {/* El riel de comandas de la cocina */}
        <div className="relative mt-16 mx-12">
          <div className="h-3 bg-white/10 rounded-full" />
          <ComandaFondo className="left-[6%] top-1.5" style={{ animationDelay: '-2s' }} filas={5} />
          <ComandaFondo className="right-[5%] top-1.5" style={{ animationDelay: '-4.5s' }} filas={3} />
        </div>
        <div className="flex-1 flex items-start justify-center -mt-1.5 relative">
          <ComandaBienvenida nombre={nombre} logo={logoSrc(cfg.logo)} estado={estadoComanda} quien={quien} sacudidas={sacudidas} />
        </div>
        <div className="px-12 pb-12 pt-8">
          <p className="font-display font-extrabold text-[clamp(28px,2.6vw,44px)] leading-[1.05] max-w-[16ch]">
            Ventas, cocina y caja en una sola pantalla.
          </p>
          <p className="mt-3 text-sm text-sobre-pizarra/60">Funciona en la computadora, la tablet y el celular.</p>
        </div>
      </section>

      <section className="flex-1 flex lg:items-center justify-center bg-fondo rounded-t-[28px] lg:rounded-none -mt-6 lg:mt-0 relative px-5 pt-8 pb-[max(env(safe-area-inset-bottom),2rem)] lg:py-12">
        <div className="w-full max-w-[380px] flex flex-col">
          {paso === 'credenciales' ? (
            <form onSubmit={enviar} className="space-y-4">
              <div className="mb-6 lg:mb-8">
                <h1 className="text-[30px] sm:text-[34px] font-extrabold leading-none">Entrar al turno</h1>
                <p className="text-tenue mt-2">Usa el correo y la contraseña que te dio el administrador.</p>
              </div>
              <div>
                <label className="etiqueta" htmlFor="email">Correo</label>
                <input id="email" className="campo h-12" type="email" autoComplete="username" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div>
                <label className="etiqueta" htmlFor="clave">Contraseña</label>
                <div className="relative">
                  <input id="clave" className="campo h-12 pr-12" type={ver ? 'text' : 'password'} autoComplete="current-password" required value={clave} onChange={(e) => setClave(e.target.value)} />
                  <button type="button" onClick={() => setVer(!ver)} className="absolute right-1 top-1 btn-icono btn-fantasma" aria-label={ver ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
                    {ver ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>
              {error && <p className="text-sm text-locoto bg-locoto/10 rounded-xl px-3 py-2.5">{error}</p>}
              <button className="btn-aji btn-lg w-full" disabled={cargando}>
                {cargando ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Entrar'}
              </button>
            </form>
          ) : (
            <div>
              <button className="btn-fantasma -ml-3 mb-4" onClick={() => { setPaso('credenciales'); setError(''); }}>
                <ArrowLeft className="w-4 h-4" /> Volver
              </button>
              <h1 className="text-[30px] font-extrabold leading-none">¿Dónde trabajas hoy?</h1>
              <p className="text-tenue mt-2 mb-6">Tu usuario tiene acceso a varias sucursales.</p>
              <div className="space-y-2">
                {sucursales.map((s) => (
                  <button
                    key={s.id ?? 'todas'}
                    disabled={cargando}
                    onClick={() => elegir(s.id)}
                    className="w-full ficha flex items-center gap-3 p-4 text-left hover:border-tinta/40 transition"
                  >
                    <span className="w-10 h-10 rounded-xl bg-hundido grid place-items-center"><Building2 className="w-5 h-5" /></span>
                    <span className="flex-1 font-semibold">{s.nombre}</span>
                  </button>
                ))}
              </div>
              {error && <p className="text-sm text-locoto mt-4">{error}</p>}
            </div>
          )}
          <p className="lg:hidden mt-auto pt-10 text-center text-xs text-tenue">Ventas, cocina y caja en una sola pantalla.</p>
        </div>
      </section>
    </div>
  );
}
