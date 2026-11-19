import axios from 'axios';
import { useAuthStore } from '../store/authStore';
import { marcarServidor } from '../hooks/useEnLinea';

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
        const refreshToken = useAuthStore.getState().refreshToken;
        const { data } = await axios.post(
          `${api.defaults.baseURL}/auth/refresh`,
          { refresh_token: refreshToken }
        );
        useAuthStore.getState().setToken(data.datos.token);
        config.headers.Authorization = `Bearer ${data.datos.token}`;
        return api(config);
      } catch (errorRefresh) {
        useAuthStore.getState().logout();
        const motivo = errorRefresh.response?.data?.codigo === 'SESION_REEMPLAZADA' ? '?motivo=sesion_otro_dispositivo' : '';
        window.location.href = `/login${motivo}`;
      }
    }
    return Promise.reject(error);
  }
);

export default api;
