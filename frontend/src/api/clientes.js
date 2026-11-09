import api from './cliente';

export const getClientes = (params = {}) =>
  api.get('/clientes', { params }).then(r => r.data.datos);

export const getCliente = (id) =>
  api.get(`/clientes/${id}`).then(r => r.data.datos);

export const crearCliente = (datos) =>
  api.post('/clientes', datos).then(r => r.data.datos);

export const actualizarCliente = (id, datos) =>
  api.put(`/clientes/${id}`, datos).then(r => r.data.datos);

export const buscarClientePorDocumento = (numero) =>
  api.get(`/clientes/buscar-documento/${encodeURIComponent(numero)}`).then(r => r.data.datos);

export const buscarClientesPorNombre = (q) =>
  api.get('/clientes/buscar-nombre', { params: { q } }).then(r => r.data.datos);

export const buscarClientePorCodigo = (codigo) =>
  api.get(`/clientes/buscar-codigo/${encodeURIComponent(codigo)}`).then(r => r.data.datos);

export const resetearPinCliente = (id) =>
  api.post(`/clientes/${id}/resetear-pin`).then(r => r.data.datos);

// Todo lo del cliente: cupones, ruleta, movimientos de puntos y lo que más pide.
export const getFichaCliente = (id) => api.get(`/clientes/${id}/ficha`).then((r) => r.data.datos);
