import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// modo: 'sistema' | 'claro' | 'oscuro'. acento: canales RGB ("242 183 5") del
// color del negocio, guardado para pintarlo antes de que cargue la config.
export const useTemaStore = create(
  persist(
    (set) => ({
      modo: 'sistema',
      acento: null,
      setModo: (modo) => set({ modo }),
      setAcento: (acento) => set({ acento }),
    }),
    { name: 'tema' },
  ),
);
