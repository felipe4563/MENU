import { useEffect } from 'react';
import { RouterProvider } from 'react-router-dom';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { router } from './router';
import { Avisos } from './components/ui/Aviso';
import { useTemaStore } from './store/temaStore';
import { useConfigPublica } from './hooks/useConfig';
import ActualizarApp from './components/shell/ActualizarApp';
import { hexACanales, tintaSobre } from './lib/util';
import { opcionesPersistencia, queryClient } from './lib/queryClient';


// Aplica claro/oscuro y el color de marca del negocio.
function Tema() {
  const { modo, setAcento } = useTemaStore();
  const { data: cfg } = useConfigPublica();

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const aplicar = () => {
      const oscuro = modo === 'oscuro' || (modo === 'sistema' && mq.matches);
      document.documentElement.classList.toggle('dark', oscuro);
      document.querySelector('meta[name=theme-color]')?.setAttribute('content', oscuro ? '#091012' : '#17262B');
    };
    aplicar();
    mq.addEventListener('change', aplicar);
    return () => mq.removeEventListener('change', aplicar);
  }, [modo]);

  useEffect(() => {
    const canales = hexACanales(cfg?.color_primario);
    const raiz = document.documentElement.style;
    if (canales) {
      raiz.setProperty('--aji', canales);
      raiz.setProperty('--sobre-aji', tintaSobre(canales));
      setAcento(canales);
    } else if (cfg) {
      raiz.removeProperty('--aji');
      raiz.removeProperty('--sobre-aji');
      setAcento(null);
    }
    if (cfg?.nombre_negocio) document.title = cfg.nombre_negocio;
    if (cfg) iconoPestana(cfg);
  }, [cfg, setAcento]);

  return null;
}

// Ícono de la pestaña con el logo del negocio (lo genera el backend). ?v cambia
// con el logo para que el navegador no se quede con el anterior.
function iconoPestana(cfg) {
  const v = encodeURIComponent(`${cfg?.logo || ''}${cfg?.nombre_negocio || ''}`);
  for (const [rel, tam] of [['icon', 64], ['apple-touch-icon', 180]]) {
    const link = document.querySelector(`link[rel="${rel}"]`);
    if (link) link.href = `/api/v1/pwa/icono/${tam}?v=${v}`;
  }
}

// Al tocar una notificación con la app abierta, el service worker pide ir a su pantalla.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data?.tipo !== 'ir') return;
    const u = new URL(e.data.url, window.location.origin);
    router.navigate(u.pathname + u.search);
  });
}

export default function App() {
  return (
    <PersistQueryClientProvider client={queryClient} persistOptions={opcionesPersistencia}>
      <Tema />
      <RouterProvider router={router} future={{ v7_startTransition: true }} />
      <Avisos />
      <ActualizarApp />
    </PersistQueryClientProvider>
  );
}
