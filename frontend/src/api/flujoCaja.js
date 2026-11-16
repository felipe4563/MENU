import api from './cliente';

export const getFlujoCaja = (mes) => api.get('/flujo-caja', { params: { mes } }).then((r) => r.data.datos);
export const getMovimientosFlujo = (mes) => api.get('/flujo-caja/movimientos', { params: { mes } }).then((r) => r.data.datos);
export const crearMovimientoFlujo = (datos) => api.post('/flujo-caja/movimientos', datos).then((r) => r.data.datos);
export const editarMovimientoFlujo = (id, datos) => api.put(`/flujo-caja/movimientos/${id}`, datos).then((r) => r.data.datos);
export const eliminarMovimientoFlujo = (id) => api.delete(`/flujo-caja/movimientos/${id}`).then((r) => r.data.datos);
export const getCategoriasFlujo = () => api.get('/flujo-caja/categorias').then((r) => r.data.datos);
export const crearCategoriaFlujo = (datos) => api.post('/flujo-caja/categorias', datos).then((r) => r.data.datos);
export const editarCategoriaFlujo = (id, datos) => api.put(`/flujo-caja/categorias/${id}`, datos).then((r) => r.data.datos);
export const eliminarCategoriaFlujo = (id) => api.delete(`/flujo-caja/categorias/${id}`).then((r) => r.data.datos);
