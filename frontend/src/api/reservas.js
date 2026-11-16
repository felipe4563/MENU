import api from './cliente';

// fecha: 'yyyy-mm-dd' (por defecto hoy).
export const getReservas = (fecha) => api.get('/reservas', { params: { fecha } }).then(r => r.data.datos);
export const crearReserva = (datos) => api.post('/reservas', datos).then(r => r.data.datos);
export const actualizarReserva = (id, datos) => api.put(`/reservas/${id}`, datos).then(r => r.data.datos);
export const cambiarEstadoReserva = (id, estado) => api.put(`/reservas/${id}/estado`, { estado }).then(r => r.data.datos);
