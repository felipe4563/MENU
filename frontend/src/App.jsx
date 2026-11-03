import { useEffect } from 'react';
import { RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { router } from './router';
import { Avisos } from './components/ui/Aviso';
import { useTemaStore } from './store/temaStore';
import { useConfigPublica } from './hooks/useConfig';
import { hexACanales, tintaSobre } from './lib/util';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 20_000, refetchOnWindowFocus: true, retry: 1 },
  },
});

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
  }, [cfg, setAcento]);

  return null;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Tema />
      <RouterProvider router={router} future={{ v7_startTransition: true }} />
      <Avisos />
    </QueryClientProvider>
  );
}
