import api from './cliente';

// fecha: 'yyyy-mm-dd' (por defecto hoy).
export const getReservas = (fecha) => api.get('/reservas', { params: { fecha } }).then(r => r.data.datos);
export const getReserva = (id) => api.get(`/reservas/${id}`).then(r => r.data.datos);
// datos.items (opcional) reemplaza todos los platos; datos.envio_cocina: null | 'al_llegar' | 'antes' | 'manual'.
export const crearReserva = (datos) => api.post('/reservas', datos).then(r => r.data.datos);
export const actualizarReserva = (id, datos) => api.put(`/reservas/${id}`, datos).then(r => r.data.datos);
// extra: { mesa_id } al llegar; { destino_adelanto: 'retenido'|'devuelto', metodo_devolucion } al cerrar con adelanto.
export const cambiarEstadoReserva = (id, estado, extra = {}) => api.put(`/reservas/${id}/estado`, { estado, ...extra }).then(r => r.data.datos);
// { metodo_pago: 'efectivo'|'qr', monto, monto_recibido? } → reserva.
export const cobrarAdelantoReserva = (id, datos) => api.post(`/reservas/${id}/adelantos`, datos).then(r => r.data.datos);
// → { reserva, pedido|null }
export const mandarReservaACocina = (id) => api.post(`/reservas/${id}/cocina`).then(r => r.data.datos);
// Platos de las reservas por llegar de un día: { fecha, totales: [{ nombre, cantidad }], reservas: [...] }.
export const getPlatosDeReservas = (fecha) => api.get('/reservas/hoy/platos', { params: { fecha } }).then(r => r.data.datos);
