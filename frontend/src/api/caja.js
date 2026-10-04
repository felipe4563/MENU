import api from './cliente';

export const getEstadoCajas = (sucursal_id) =>
  api.get('/caja/estado', { params: sucursal_id ? { sucursal_id } : {} }).then(r => r.data.datos).catch(() => []);

export const getSesiones = () =>
  api.get('/caja').then(r => r.data.datos);

export const getSesion = (id) =>
  api.get(`/caja/${id}`).then(r => r.data.datos);

export const abrirCaja = (caja_id, monto_apertura) =>
  api.post('/caja/abrir', { caja_id, monto_apertura }).then(r => r.data.datos);

export const cerrarCaja = (id, { denominaciones, monto_cierre, confirmar_pese_a_diferencia, nota_diferencia } = {}) =>
  api.post(`/caja/${id}/cerrar`, { denominaciones, monto_cierre, confirmar_pese_a_diferencia, nota_diferencia }).then(r => r.data.datos);

export const getReporte = (id) =>
  api.get(`/caja/${id}/reporte`).then(r => r.data.datos);

export const registrarGasto = (id, datos) =>
  api.post(`/caja/${id}/gastos`, datos).then(r => r.data.datos);

export const getGastos = (id) =>
  api.get(`/caja/${id}/gastos`).then(r => r.data.datos);
