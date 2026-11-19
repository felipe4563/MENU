import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useAuthStore = create(
  persist(
    (set) => ({
      token: null,
      refreshToken: null,
      usuario: null,
      // Habilita este aparato para entrar con PIN (solo sesiones con una sucursal concreta).
      dispositivoToken: null,
      setAuth: ({ token, refresh_token, usuario, dispositivo_token }) =>
        set({ token, refreshToken: refresh_token, usuario, dispositivoToken: dispositivo_token ?? null }),
      setToken: (token) => set({ token }),
      setDispositivoToken: (dispositivoToken) => set({ dispositivoToken }),
      updateUsuario: (campos) => set((s) => ({ usuario: s.usuario ? { ...s.usuario, ...campos } : s.usuario })),
      logout: () => set({ token: null, refreshToken: null, usuario: null, dispositivoToken: null }),
    }),
    { name: 'auth' },
  ),
);
