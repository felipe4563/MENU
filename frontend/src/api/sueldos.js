import api from './cliente';

const d = (r) => r.data.datos;
export const getSueldos = () => api.get('/sueldos').then(d);
export const getMiSueldo = () => api.get('/sueldos/mio').then(d);
export const getSueldoPersona = (id) => api.get(`/sueldos/${id}`).then(d);
export const configurarSueldo = (id, datos) => api.put(`/sueldos/${id}/sueldo`, datos).then(d);
export const eliminarSueldo = (id, sueldoId) => api.delete(`/sueldos/${id}/sueldo/${sueldoId}`).then(d);
export const registrarMovimientoSueldo = (id, datos) => api.post(`/sueldos/${id}/movimientos`, datos).then(d);
export const anularMovimientoSueldo = (id, pagoId) => api.delete(`/sueldos/${id}/movimientos/${pagoId}`).then(d);
export const justificarFalta = (id, datos) => api.post(`/sueldos/${id}/justificadas`, datos).then(d);
export const quitarJustificacion = (id, fecha) => api.delete(`/sueldos/${id}/justificadas/${fecha}`).then(d);
