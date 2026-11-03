/** @type {import('tailwindcss').Config} */
const c = (v) => `rgb(var(${v}) / <alpha-value>)`;

export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        fondo: c('--fondo'),
        papel: c('--papel'),
        hundido: c('--hundido'),
        tinta: c('--tinta'),
        tenue: c('--tenue'),
        linea: c('--linea'),
        aji: c('--aji'),
        'sobre-aji': c('--sobre-aji'),
        locoto: c('--locoto'),
        hierba: c('--hierba'),
        cielo: c('--cielo'),
        pizarra: c('--pizarra'),
        'sobre-pizarra': c('--sobre-pizarra'),
      },
      fontFamily: {
        display: ['"Bricolage Grotesque Variable"', 'system-ui', 'sans-serif'],
        sans: ['"Instrument Sans Variable"', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        ficha: '14px',
      },
      boxShadow: {
        papel: '0 1px 0 rgb(var(--linea)), 0 8px 24px -12px rgb(23 38 43 / .25)',
        flota: '0 24px 60px -20px rgb(10 20 24 / .45)',
      },
      keyframes: {
        entra: { from: { opacity: 0, transform: 'translateY(6px) scale(.98)' }, to: { opacity: 1, transform: 'none' } },
        sube: { from: { transform: 'translateY(100%)' }, to: { transform: 'none' } },
        imprime: { from: { clipPath: 'inset(0 0 100% 0)' }, to: { clipPath: 'inset(0 0 0 0)' } },
        latido: { '0%,100%': { opacity: 1 }, '50%': { opacity: .35 } },
        balanceo: { '0%': { transform: 'rotate(-5deg)' }, '30%': { transform: 'rotate(3deg)' }, '55%': { transform: 'rotate(-1.5deg)' }, '78%': { transform: 'rotate(.6deg)' }, '100%': { transform: 'none' } },
        meceo: { '0%,100%': { transform: 'rotate(-1.2deg)' }, '50%': { transform: 'rotate(1.2deg)' } },
        sacude: { '0%,100%': { transform: 'none' }, '20%,60%': { transform: 'translateX(-7px) rotate(-1deg)' }, '40%,80%': { transform: 'translateX(7px) rotate(1deg)' } },
        aparece: { from: { opacity: 0, transform: 'translateX(-6px)' }, to: { opacity: 1, transform: 'none' } },
      },
      animation: {
        entra: 'entra .18s ease-out',
        sube: 'sube .24s cubic-bezier(.2,.8,.2,1)',
        imprime: 'imprime .5s steps(12) both',
        latido: 'latido 1.6s ease-in-out infinite',
        balanceo: 'balanceo 1.8s cubic-bezier(.3,.6,.4,1) both',
        meceo: 'meceo 7s ease-in-out infinite',
        sacude: 'sacude .45s ease-in-out',
        aparece: 'aparece .35s ease-out both',
      },
    },
  },
  plugins: [],
};
