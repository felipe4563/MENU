import axios from 'axios';
import { useAuthStore } from '../store/authStore';
import { marcarServidor } from '../hooks/useEnLinea';
import { bloquear } from '../lib/bloqueo';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:3001/api/v1',
});

// Adjuntar token a cada request
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/** Pide un token de acceso nuevo con el refresh token y lo guarda. */
export async function refrescarSesion() {
  const refreshToken = useAuthStore.getState().refreshToken;
  const { data } = await axios.post(`${api.defaults.baseURL}/auth/refresh`, { refresh_token: refreshToken });
  useAuthStore.getState().setToken(data.datos.token);
  return data.datos.token;
}

/**
 * La sesión ya no se puede renovar. En un aparato habilitado se queda el
 * usuario y se pide el PIN (la caja compartida no termina en /login); si no,
 * se cierra la sesión como siempre.
 */
export function perderSesion(codigo) {
  const { dispositivoToken, usuario, caducarSesion, logout } = useAuthStore.getState();
  if (dispositivoToken && usuario) {
    caducarSesion();
    bloquear();
    return;
  }
  logout();
  const motivo = codigo === 'SESION_REEMPLAZADA' ? '?motivo=sesion_otro_dispositivo' : '';
  window.location.href = `/login${motivo}`;
}

// Refresh automático en 401
api.interceptors.response.use(
  (response) => { marcarServidor(true); return response; },
  async (error) => {
    // Sin respuesta: el servidor no se alcanza (sin internet). Con respuesta, aunque sea un error, sí hay conexión.
    if (error.response) marcarServidor(true);
    else if (error.code !== 'ERR_CANCELED') marcarServidor(false);
    const config = error.config;
    if (error.response?.status === 401 && !config._reintentado) {
      config._reintentado = true;
      try {
        const token = await refrescarSesion();
        config.headers.Authorization = `Bearer ${token}`;
        return api(config);
      } catch (errorRefresh) {
        // Sin respuesta (sin internet) no se pierde la sesión: se vuelve a intentar luego.
        if (errorRefresh.response) perderSesion(errorRefresh.response.data?.codigo);
      }
    }
    return Promise.reject(error);
  }
);

export default api;
