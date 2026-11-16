import api from './cliente';

export const getKardex = (params) => api.get('/kardex', { params }).then((r) => r.data.datos);
export const getKardexItem = (clase, id, params) => api.get(`/kardex/${clase}/${id}`, { params }).then((r) => r.data.datos);
