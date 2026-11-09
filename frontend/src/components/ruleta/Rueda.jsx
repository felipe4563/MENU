// Rueda de premios, compartida por Clientes › Ruleta y el cobro.
import { useEffect, useRef, useState } from 'react';
import { Disc3, Gift } from 'lucide-react';
import { cx } from '../../lib/util';

// La rueda usa siempre los mismos tres tonos, alternados: el color del
// negocio, pizarra y crema. Así se ve pareja aunque haya muchos premios.
const TONOS = [
  { fondo: 'rgb(var(--aji))', texto: 'rgb(var(--sobre-aji))' },
  { fondo: '#17262B', texto: '#F4EFE4' },
  { fondo: '#F7F1E5', texto: '#17262B' },
];

// Tono de cada gajo según su lugar. Si el último quedaría igual al primero
// (son vecinos en el círculo), se cambia por pizarra.
export function tonoDe(i, n) {
  if (n > 1 && i === n - 1 && i % 3 === 0) return TONOS[1];
  return TONOS[i % 3];
}

// Todos los gajos miden lo mismo: la probabilidad de cada premio la decide
// el servidor, no el tamaño en pantalla.
export const anguloMedio = (i, n) => (i + 0.5) * (360 / n);

// Parte el nombre en hasta dos líneas que entren en el gajo.
function lineas(nombre, max) {
  const palabras = String(nombre).trim().split(/\s+/);
  const res = [''];
  for (const p of palabras) {
    const actual = res[res.length - 1];
    if (!actual) res[res.length - 1] = p;
    else if (`${actual} ${p}`.length <= max) res[res.length - 1] = `${actual} ${p}`;
    else if (res.length < 2) res.push(p);
    else { res[1] += ` ${p}`; break; }
  }
  return res.map((l) => (l.length > max ? `${l.slice(0, max - 1)}…` : l));
}

function punto(angulo, r) {
  const rad = ((angulo - 90) * Math.PI) / 180;
  return [Math.cos(rad) * r, Math.sin(rad) * r];
}

export function Rueda({ premios, rotacion, girando, ganadorId }) {
  const n = premios.length;
  const paso = 360 / n;
  const R = 90;
  const tam = n <= 6 ? 8.5 : n <= 10 ? 7.2 : 6;
  const maxCar = Math.max(8, Math.floor(58 / (tam * 0.58)));
  const focos = Math.max(16, n * 2);
  return (
    <div className="relative mx-auto w-full max-w-[26rem] aspect-square select-none">
      <svg viewBox="-100 -100 200 200" className="w-full h-full drop-shadow-[0_18px_30px_rgba(23,38,43,.22)]" role="img" aria-label="Ruleta de premios">
        {/* Aro con focos: no gira */}
        <circle r="99" fill="#17262B" />
        {Array.from({ length: focos }, (_, i) => {
          const [x, y] = punto((i * 360) / focos, 95);
          return <circle key={i} cx={x} cy={y} r="1.7" style={{ fill: i % 2 ? '#F7F1E5' : 'rgb(var(--aji))' }} className={girando ? 'animate-pulse' : ''} />;
        })}
        <g style={{ transform: `rotate(${rotacion}deg)`, transition: girando ? 'transform 5s cubic-bezier(.12,.8,.2,1)' : 'none' }}>
          {premios.map((p, i) => {
            const t = tonoDe(i, n);
            const ini = i * paso;
            const [x1, y1] = punto(ini, R);
            const [x2, y2] = punto(ini + paso, R);
            const d = n === 1 ? `M0 ${-R} A${R} ${R} 0 1 1 -0.01 ${-R}Z` : `M0 0 L${x1} ${y1} A${R} ${R} 0 ${paso > 180 ? 1 : 0} 1 ${x2} ${y2}Z`;
            const medio = anguloMedio(i, n);
            // En la mitad izquierda el texto se da vuelta para no quedar de cabeza.
            const izquierda = medio > 180;
            const x = izquierda ? -84 : 84;
            const ls = lineas(p.nombre, maxCar);
            const apagado = ganadorId != null && ganadorId !== p.id;
            return (
              <g key={p.id} style={{ opacity: apagado ? 0.3 : 1, transition: 'opacity .4s' }}>
                <path d={d} style={{ fill: t.fondo }} stroke="#F7F1E5" strokeOpacity=".55" strokeWidth=".8" />
                <g transform={`rotate(${izquierda ? medio + 90 : medio - 90})`}>
                  <text x={x} textAnchor={izquierda ? 'start' : 'end'} dominantBaseline="middle" style={{ fill: t.texto, fontSize: tam, fontWeight: 700 }} className="font-display">
                    {ls.map((l, k) => <tspan key={k} x={x} dy={k === 0 ? (ls.length > 1 ? -tam * 0.55 : 0) : tam * 1.1}>{l}</tspan>)}
                  </text>
                </g>
              </g>
            );
          })}
        </g>
        {/* Filo entre el aro y los gajos, y centro */}
        <circle r="90.6" fill="none" stroke="#F7F1E5" strokeWidth="1.6" />
        <circle r="16" fill="#17262B" stroke="#F7F1E5" strokeWidth="1.6" />
      </svg>
      <div className="absolute inset-0 m-auto w-[9%] h-[9%] grid place-items-center pointer-events-none"><Disc3 className={cx('w-full h-full text-aji', girando && 'animate-spin')} /></div>
      {/* Puntero */}
      <svg viewBox="0 0 24 30" className="absolute left-1/2 -translate-x-1/2 -top-2 w-[9%] drop-shadow-md" aria-hidden="true">
        <path d="M12 29 L2.5 8 A10 10 0 0 1 21.5 8 Z" style={{ fill: 'rgb(var(--aji))' }} stroke="#17262B" strokeWidth="2" strokeLinejoin="round" />
        <circle cx="12" cy="9" r="3" fill="#17262B" />
      </svg>
    </div>
  );
}

// Estado del giro: el servidor sortea el premio y la rueda solo anima hasta él.
export function useGiro(premios, { duracion = 5200, alTerminar } = {}) {
  const [rotacion, setRotacion] = useState(0);
  const [girando, setGirando] = useState(false);
  const [ganado, setGanado] = useState(null);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);

  const animar = (resultado) => {
    const n = premios.length || 1;
    const i = Math.max(0, premios.findIndex((p) => p.id === resultado.premio?.id));
    // Cae en el gajo ganador, pero no siempre en el centro exacto.
    const destino = anguloMedio(i, n) + (Math.random() - 0.5) * (360 / n) * 0.6;
    setGanado(null);
    setGirando(true);
    setRotacion((x) => x - (((x % 360) + 360) % 360) + 360 * 6 + (360 - destino));
    timer.current = setTimeout(() => { setGirando(false); setGanado(resultado); alTerminar?.(resultado); }, duracion);
  };
  return { rotacion, girando, ganado, animar, limpiar: () => setGanado(null) };
}

// Lista de premios debajo de la rueda (nombres completos, mismo color).
export function LeyendaPremios({ premios, ganadorId, className }) {
  return (
    <ul className={cx('flex flex-wrap justify-center gap-1.5', className)}>
      {premios.map((p, i) => (
        <li key={p.id} className={cx('chip bg-hundido text-tinta gap-1.5 transition-opacity', ganadorId != null && ganadorId !== p.id && 'opacity-40')}>
          <span className="w-2.5 h-2.5 rounded-full ring-1 ring-tinta/25" style={{ background: tonoDe(i, premios.length).fondo }} />{p.nombre}
        </li>
      ))}
    </ul>
  );
}

// Tarjeta del resultado. `children` va al pie (ej. "Usar en esta compra").
export function TarjetaPremio({ ganado, nombreCliente, children, refDiv }) {
  const sinPremio = ganado?.premio?.tipo === 'nada';
  return (
    <div ref={refDiv} className={cx('rounded-2xl p-5 text-center animate-entra', sinPremio ? 'bg-hundido' : 'bg-pizarra text-sobre-pizarra')}>
      {!sinPremio && <span className="w-12 h-12 mx-auto rounded-full bg-aji text-sobre-aji grid place-items-center"><Gift className="w-6 h-6" /></span>}
      <p className="text-sm opacity-70 mt-1">{sinPremio ? 'Resultado' : `¡${nombreCliente?.split(' ')[0] ?? 'El cliente'} ganó!`}</p>
      <p className="font-display font-extrabold text-2xl mt-1">{sinPremio ? 'Esta vez no hubo premio' : ganado.premio?.nombre}</p>
      {ganado.cupon?.codigo && (
        <div className="mt-3 rounded-xl border border-dashed border-sobre-pizarra/30 py-2.5">
          <p className="text-xs opacity-70">Cupón del premio</p>
          <p className="font-display font-bold text-xl tracking-[.15em]">{ganado.cupon.codigo}</p>
        </div>
      )}
      {children}
    </div>
  );
}

// Puntos del cliente, costo del giro y giros usados en el periodo.
export function DatosGiro({ e }) {
  const caja = (valor, texto) => (
    <div className="rounded-xl bg-hundido py-2.5"><p className="num font-display font-bold text-xl">{valor}</p><p className="text-xs text-tenue">{texto}</p></div>
  );
  return (
    <div className="grid grid-cols-3 gap-2 text-center">
      {caja(e.cliente.puntos, 'puntos')}
      {caja(e.costo_puntos, 'por giro')}
      {caja(`${e.giros_usados}/${e.max_giros_periodo}`, e.periodo === 'semana' ? 'esta semana' : 'hoy')}
    </div>
  );
}
