import { io } from 'socket.io-client';
import { BASE_URL } from './api/configuracion';
import { useAuthStore } from './store/authStore';

// El servidor solo acepta el socket con el token de la sesión: se lee en cada
// (re)conexión y se reconecta cuando cambia (login, cambio de sucursal, logout).
const socket = io(BASE_URL, {
  autoConnect: Boolean(useAuthStore.getState().token),
  auth: (cb) => cb({ token: useAuthStore.getState().token }),
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionAttempts: Infinity,
});

function unirseSucursalActiva() {
  const sucursalId = useAuthStore.getState().usuario?.sucursal_activa?.id;
  if (sucursalId) socket.emit('unirse_sucursal', sucursalId);
}

// Al reconectar (incluye la primera conexión) y cada vez que cambia el usuario logueado
socket.on('connect', unirseSucursalActiva);
useAuthStore.subscribe((state, prevState) => {
  if (state.token !== prevState.token) {
    socket.disconnect();
    if (state.token) socket.connect();
  } else if (state.usuario?.sucursal_activa?.id !== prevState.usuario?.sucursal_activa?.id) {
    unirseSucursalActiva();
  }
});

export default socket;
