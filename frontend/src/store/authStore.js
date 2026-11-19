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
      // La sesión se perdió (refresh vencido o reemplazado) en un aparato habilitado:
      // se queda el usuario y se pide el PIN en el servidor para volver a entrar.
      sesionCaducada: false,
      // Un login sin dispositivo_token ("Todas las sucursales") no deshabilita el aparato.
      setAuth: ({ token, refresh_token, usuario, dispositivo_token }) =>
        set((s) => ({
          token, refreshToken: refresh_token, usuario,
          dispositivoToken: dispositivo_token ?? s.dispositivoToken,
          sesionCaducada: false,
        })),
      setToken: (token) => set({ token }),
      setDispositivoToken: (dispositivoToken) => set({ dispositivoToken }),
      updateUsuario: (campos) => set((s) => ({ usuario: s.usuario ? { ...s.usuario, ...campos } : s.usuario })),
      caducarSesion: () => set({ token: null, refreshToken: null, sesionCaducada: true }),
      logout: () => set({ token: null, refreshToken: null, usuario: null, dispositivoToken: null, sesionCaducada: false }),
    }),
    { name: 'auth' },
  ),
);
