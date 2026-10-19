import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Eye, EyeOff, UtensilsCrossed, Mail, Lock,
  Cherry, Citrus, Grape, Croissant, LeafyGreen, Coffee,
} from 'lucide-react';
import api from '../../api/cliente';
import { useAuthStore } from '../../store/authStore';
import { getConfiguracionPublica, logoSrc } from '../../api/configuracion';
import { NAV_GROUPS } from '../../components/layout/navGroups';

// Tras loguearse, manda a la primera pantalla del menú a la que el usuario
// realmente tiene acceso — no siempre "/" (Dashboard), porque ese permiso
// se puede sacar por rol. Sin esto, un rol sin permiso de Dashboard vería
// "No tienes permiso" apenas entra, en vez de la pantalla que sí le toca.
function primeraRutaDisponible(permisos = []) {
  for (const grupo of NAV_GROUPS) {
    for (const item of grupo.items) {
      if (item.modulo && permisos.includes(`${item.modulo}.${item.accion}`)) return item.to;
    }
  }
  return '/perfil';
}

// Signature element: a rotating HUD ring + fine-dining medallion around the
// logo — the fusion of "restaurant emblem" and "futuristic scanner target".
function Medallion({ logo, nombre }) {
  return (
    <div className="relative w-36 h-36 mx-auto">
      {/* Ambient glow halo */}
      <div
        aria-hidden
        className="absolute -inset-3 rounded-full blur-xl opacity-70 animate-pulse"
        style={{ background: 'radial-gradient(circle, rgba(217,155,58,0.45) 0%, transparent 70%)' }}
      />

      {/* Slow-rotating dashed ring with compass ornaments */}
      <svg
        className="absolute inset-0 w-full h-full text-amber-500/70 dark:text-amber-400/60 animate-[spin_16s_linear_infinite]"
        viewBox="0 0 96 96"
        aria-hidden
      >
        <circle cx="48" cy="48" r="44" fill="none" stroke="currentColor" strokeWidth="0.75" strokeDasharray="1 7" />
        <polygon points="48,1 51,4 48,7 45,4"     fill="currentColor" />
        <polygon points="92,45 95,48 92,51 89,48" fill="currentColor" />
        <polygon points="48,89 51,92 48,95 45,92" fill="currentColor" />
        <polygon points="4,45 7,48 4,51 1,48"     fill="currentColor" />
      </svg>

      {/* Static inner ring — cool accent, counterpoints the warm amber */}
      <svg className="absolute inset-0 w-full h-full text-cyan-500/40 dark:text-cyan-400/25" viewBox="0 0 96 96" aria-hidden>
        <circle cx="48" cy="48" r="37" fill="none" stroke="currentColor" strokeWidth="0.5" />
      </svg>

      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-[96px] h-[96px] rounded-full flex items-center justify-center overflow-hidden bg-white/80 dark:bg-[#150D05]/90 backdrop-blur-sm border border-amber-300/60 dark:border-amber-500/30 shadow-[0_0_22px_rgba(217,155,58,0.35)]">
          {logo
            ? <img src={logo} alt={nombre} className="w-full h-full object-contain p-1" />
            : <UtensilsCrossed className="w-10 h-10 text-amber-600 dark:text-amber-400" />
          }
        </div>
      </div>
    </div>
  );
}

// HUD-style corner bracket, used to frame the login card like a scanner
// reticle — purely decorative, aria-hidden.
function EsquinaHUD({ className }) {
  return (
    <div
      aria-hidden
      className={`absolute w-5 h-5 border-amber-400/50 dark:border-amber-400/40 ${className}`}
    />
  );
}

// Íconos de comida/frutas flotando de fondo — puramente ambientales, no
// reaccionan al mouse. Posiciones y tiempos fijos (no aleatorios en cada
// render) para que el movimiento sea lento, predecible y no distraiga del
// formulario. Se usan íconos lucide (línea fina) en vez de emojis del
// sistema operativo para que combinen con el resto de la estética HUD.
const ICONOS_AMBIENTE = [
  { Icono: Cherry,     top: '12%', left: '8%',  size: 30, duration: 9.5, delay: 0,    tinte: 'amber' },
  { Icono: Citrus,     top: '74%', left: '9%',  size: 26, duration: 11,  delay: 1.6,  tinte: 'cyan'  },
  { Icono: Grape,      top: '18%', left: '87%', size: 28, duration: 10,  delay: 0.8,  tinte: 'cyan'  },
  { Icono: Croissant,  top: '78%', left: '85%', size: 32, duration: 8.5, delay: 2.2,  tinte: 'amber' },
  { Icono: LeafyGreen, top: '48%', left: '4%',  size: 24, duration: 12,  delay: 1.1,  tinte: 'amber' },
  { Icono: Coffee,     top: '46%', left: '93%', size: 26, duration: 9,   delay: 1.9,  tinte: 'cyan'  },
];

export default function LoginPage() {
  const [email, setEmail]                       = useState('');
  const [contrasena, setContrasena]             = useState('');
  const [mostrarContrasena, setMostrarContrasena] = useState(false);
  const [error, setError]                       = useState(() =>
    new URLSearchParams(window.location.search).get('motivo') === 'sesion_otro_dispositivo'
      ? 'Tu sesión se cerró porque iniciaste sesión en otro dispositivo.'
      : ''
  );
  const [cargando, setCargando]                 = useState(false);
  const [paso, setPaso]                         = useState('credenciales'); // 'credenciales' | 'sucursal'
  const [preToken, setPreToken]                 = useState(null);
  const [sucursales, setSucursales]             = useState([]);
  const setAuth   = useAuthStore((s) => s.setAuth);
  const navigate  = useNavigate();

  // Limpia el ?motivo= de la URL una vez leído, para que no reaparezca el
  // aviso si el usuario simplemente refresca la página de login.
  useEffect(() => {
    if (window.location.search.includes('motivo=')) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  // Load display font for restaurant name
  useEffect(() => {
    const link = Object.assign(document.createElement('link'), {
      rel:  'stylesheet',
      href: 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600&display=swap',
    });
    document.head.appendChild(link);
    return () => document.head.removeChild(link);
  }, []);

  const { data: branding = {} } = useQuery({
    queryKey: ['configuracion-publica'],
    queryFn:  getConfiguracionPublica,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const nombreNegocio = branding.nombre_negocio || 'Mi Restaurante';
  const logo          = logoSrc(branding.logo);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setCargando(true);
    try {
      const { data } = await api.post('/auth/login', { email, contrasena });
      if (data.datos.requiere_sucursal) {
        setPreToken(data.datos.pre_token);
        setSucursales(data.datos.sucursales);
        setPaso('sucursal');
      } else {
        setAuth(data.datos);
        navigate(primeraRutaDisponible(data.datos.usuario?.permisos));
      }
    } catch (err) {
      setError(err.response?.data?.mensaje ?? 'Error al iniciar sesión');
    } finally {
      setCargando(false);
    }
  }

  async function handleElegirSucursal(sucursalId) {
    setError('');
    setCargando(true);
    try {
      const { data } = await api.post('/auth/login/sucursal', { pre_token: preToken, sucursal_id: sucursalId });
      setAuth(data.datos);
      navigate(primeraRutaDisponible(data.datos.usuario?.permisos));
    } catch (err) {
      setError(err.response?.data?.mensaje ?? 'Error al seleccionar la sucursal');
      setPaso('credenciales');
    } finally {
      setCargando(false);
    }
  }

  function volverACredenciales() {
    setPaso('credenciales');
    setPreToken(null);
    setSucursales([]);
    setError('');
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center px-4 py-12 bg-gradient-to-b from-[#FCFAF6] to-[#F2E9DA] dark:from-[#0A0704] dark:to-[#160D06] transition-colors duration-300 overflow-hidden">

      {/* Scoped keyframes for the scanline sweep + ambient food icons */}
      <style>{`
        @keyframes loginScan {
          0%   { transform: translateY(-10%); opacity: 0; }
          10%  { opacity: 0.6; }
          90%  { opacity: 0.6; }
          100% { transform: translateY(110%); opacity: 0; }
        }
        @keyframes ambientFloat {
          0%, 100% { transform: translateY(0) rotate(-4deg); }
          50%      { transform: translateY(-18px) rotate(4deg); }
        }
      `}</style>

      {/* Íconos de comida flotando de fondo, ambientales */}
      {ICONOS_AMBIENTE.map(({ Icono, top, left, size, duration, delay, tinte }, i) => (
        <Icono
          key={i}
          aria-hidden
          className={`absolute pointer-events-none z-[1] opacity-[0.14] dark:opacity-[0.12] ${
            tinte === 'amber' ? 'text-amber-600 dark:text-amber-400' : 'text-cyan-600 dark:text-cyan-400'
          }`}
          style={{
            top, left, width: size, height: size,
            animation: `ambientFloat ${duration}s ease-in-out ${delay}s infinite`,
          }}
        />
      ))}

      {/* Fine HUD grid texture */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none opacity-70"
        style={{
          backgroundImage:
            'linear-gradient(rgba(200,136,58,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(200,136,58,0.06) 1px, transparent 1px)',
          backgroundSize: '38px 38px',
        }}
      />

      {/* Ambient glow blobs — warm amber + cool cyan, off-center for depth */}
      <div
        aria-hidden
        className="absolute top-[15%] left-[18%] w-[420px] h-[420px] rounded-full pointer-events-none animate-pulse"
        style={{ background: 'radial-gradient(circle, rgba(217,155,58,0.16) 0%, transparent 70%)' }}
      />
      <div
        aria-hidden
        className="absolute bottom-[10%] right-[15%] w-[360px] h-[360px] rounded-full pointer-events-none animate-pulse [animation-delay:1.2s]"
        style={{ background: 'radial-gradient(circle, rgba(45,180,200,0.10) 0%, transparent 70%)' }}
      />

      <div className="relative z-10 w-full max-w-sm">

        {/* Medallion + business name */}
        <div className="text-center mb-7 space-y-4">
          <Medallion logo={logo} nombre={nombreNegocio} />
          <div>
            <h1
              className="text-[1.65rem] leading-snug text-[#1C1208] dark:text-[#F5EDD8] tracking-tight"
              style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 600 }}
            >
              {nombreNegocio}
            </h1>
            <div className="flex items-center justify-center gap-2 mt-2">
              <span className="h-px w-6 bg-gradient-to-r from-transparent to-amber-400/70" />
              <p className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-amber-700/80 dark:text-amber-400/70 font-mono">
                Sistema de Gestión
              </p>
              <span className="h-px w-6 bg-gradient-to-l from-transparent to-amber-400/70" />
            </div>
          </div>
        </div>

        {/* Login card — gradient-glow border wrapper */}
        <div className="relative rounded-[28px] p-px bg-gradient-to-br from-amber-400/50 via-white/5 to-cyan-400/30 dark:from-amber-500/40 dark:via-white/[0.03] dark:to-cyan-500/20 shadow-[0_8px_40px_rgba(0,0,0,0.08)] dark:shadow-[0_8px_50px_rgba(0,0,0,0.55)]">
          <div className="relative overflow-hidden rounded-[27px] bg-white/85 dark:bg-[#120B05]/90 backdrop-blur-xl px-8 py-8">

            {/* Scanline sweep */}
            <div
              aria-hidden
              className="absolute left-0 right-0 h-16 pointer-events-none opacity-0 dark:opacity-100 animate-[loginScan_7s_ease-in-out_infinite]"
              style={{ background: 'linear-gradient(to bottom, transparent, rgba(217,155,58,0.08), transparent)' }}
            />

            {/* HUD corner brackets */}
            <EsquinaHUD className="top-3 left-3 border-t-2 border-l-2 rounded-tl-lg" />
            <EsquinaHUD className="bottom-3 right-3 border-b-2 border-r-2 rounded-br-lg" />

            <p className="relative text-sm text-center text-[#9A8878] dark:text-amber-100/40 mb-7 -mt-1">
              Inicia sesión para continuar
            </p>

            {paso === 'credenciales' ? (
              <form onSubmit={handleSubmit} className="relative space-y-5">

                {/* Email */}
                <div className="space-y-1.5">
                  <label className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-amber-700/70 dark:text-amber-400/60 font-mono">
                    <Mail className="w-3 h-3" /> Correo electrónico
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    placeholder="correo@restaurante.com"
                    className="w-full bg-black/[0.02] dark:bg-white/[0.03] border border-[#E2D9CE] dark:border-amber-500/15 rounded-xl px-4 py-3 text-sm text-[#1C1208] dark:text-[#F0E8D8] placeholder-[#CCC0B4] dark:placeholder-[#5A4A38] focus:outline-none focus:ring-2 focus:ring-amber-400/40 focus:border-amber-400 dark:focus:border-amber-500/60 focus:shadow-[0_0_16px_rgba(217,155,58,0.25)] transition-all"
                  />
                </div>

                {/* Password */}
                <div className="space-y-1.5">
                  <label className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-amber-700/70 dark:text-amber-400/60 font-mono">
                    <Lock className="w-3 h-3" /> Contraseña
                  </label>
                  <div className="relative">
                    <input
                      type={mostrarContrasena ? 'text' : 'password'}
                      value={contrasena}
                      onChange={(e) => setContrasena(e.target.value)}
                      required
                      autoComplete="current-password"
                      placeholder="••••••••"
                      className="w-full bg-black/[0.02] dark:bg-white/[0.03] border border-[#E2D9CE] dark:border-amber-500/15 rounded-xl px-4 py-3 pr-12 text-sm text-[#1C1208] dark:text-[#F0E8D8] placeholder-[#CCC0B4] dark:placeholder-[#5A4A38] focus:outline-none focus:ring-2 focus:ring-amber-400/40 focus:border-amber-400 dark:focus:border-amber-500/60 focus:shadow-[0_0_16px_rgba(217,155,58,0.25)] transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setMostrarContrasena((v) => !v)}
                      tabIndex={-1}
                      aria-label={mostrarContrasena ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#CCC0B4] dark:text-[#5A4A38] hover:text-amber-500 dark:hover:text-amber-400 transition-colors"
                    >
                      {mostrarContrasena ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Error message */}
                {error && (
                  <div className="rounded-xl bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-500/25 px-4 py-3">
                    <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                  </div>
                )}

                {/* Submit */}
                <button
                  type="submit"
                  disabled={cargando}
                  className="w-full mt-1 relative overflow-hidden bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 active:from-amber-700 active:to-amber-600 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-xl py-3 text-sm font-semibold tracking-wide transition-all duration-200 shadow-[0_2px_16px_rgba(217,155,58,0.25)] hover:shadow-[0_4px_28px_rgba(217,155,58,0.45)]"
                >
                  {cargando ? 'Iniciando sesión...' : 'Iniciar sesión'}
                </button>
              </form>
            ) : (
              <div className="relative space-y-3">
                <p className="text-xs text-center text-[#9A8878] dark:text-amber-100/40 -mt-1 mb-2">
                  Elige con qué sucursal quieres trabajar
                </p>

                {sucursales.map((s) => (
                  <button
                    key={s.id ?? 'todas'}
                    type="button"
                    disabled={cargando}
                    onClick={() => handleElegirSucursal(s.id)}
                    className="w-full text-left bg-black/[0.02] dark:bg-white/[0.03] border border-[#E2D9CE] dark:border-amber-500/15 rounded-xl px-4 py-3 text-sm text-[#1C1208] dark:text-[#F0E8D8] hover:border-amber-400 dark:hover:border-amber-500/60 hover:bg-amber-50/40 dark:hover:bg-amber-500/[0.06] hover:shadow-[0_0_16px_rgba(217,155,58,0.2)] transition-all disabled:opacity-60"
                  >
                    {s.nombre}
                  </button>
                ))}

                {error && (
                  <div className="rounded-xl bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-500/25 px-4 py-3">
                    <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                  </div>
                )}

                <button
                  type="button"
                  onClick={volverACredenciales}
                  className="w-full mt-1 text-sm text-[#9A8878] dark:text-amber-100/40 hover:text-amber-600 dark:hover:text-amber-400 transition-colors"
                >
                  ← Volver
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Desarrollado por CodeWave */}
        <div className="flex flex-col items-center gap-2 mt-6">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#CCC0B4] dark:text-[#3A2E22] font-mono">
            Desarrollado por
          </p>
          <img src="/logo-light.png" alt="CodeWave" className="h-9 object-contain dark:hidden opacity-60" />
          <img src="/logo-dark.png"  alt="CodeWave" className="h-9 object-contain hidden dark:block opacity-60" />
        </div>

      </div>
    </div>
  );
}
