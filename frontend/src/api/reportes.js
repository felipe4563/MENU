import api from './cliente';

export const getReporteVentas        = (params = {}) => api.get('/reportes/ventas',            { params }).then(r => r.data.datos);
export const getReporteVentasResumen = (params = {}) => api.get('/reportes/ventas/resumen',     { params }).then(r => r.data.datos);
export const getReporteVentasProductos = (params = {}) => api.get('/reportes/ventas/productos', { params }).then(r => r.data.datos);
export const getReporteVentasVariantes = (params = {}) => api.get('/reportes/ventas/variantes', { params }).then(r => r.data.datos);
export const getReporteInventario     = (params = {}) => api.get('/reportes/inventario',        { params }).then(r => r.data.datos);
export const getReporteInventarioResumen = (params = {}) => api.get('/reportes/inventario/resumen', { params }).then(r => r.data.datos);
export const getReporteCompras        = (params = {}) => api.get('/reportes/compras',           { params }).then(r => r.data.datos);
export const getReporteComprasResumen = (params = {}) => api.get('/reportes/compras/resumen',    { params }).then(r => r.data.datos);
export const getReporteCaja           = (params = {}) => api.get('/reportes/caja',              { params }).then(r => r.data.datos);
export const getReporteCajaResumen    = (params = {}) => api.get('/reportes/caja/resumen',       { params }).then(r => r.data.datos);
export const getReporteArqueos        = (params = {}) => api.get('/reportes/arqueos',         { params }).then(r => r.data.datos);
export const getReporteArqueosResumen = (params = {}) => api.get('/reportes/arqueos/resumen',  { params }).then(r => r.data.datos);
export const getReporteFinanzasResumen = (params = {}) => api.get('/reportes/finanzas/resumen', { params }).then(r => r.data.datos);
export const getReporteFinanzasSerie   = (params = {}) => api.get('/reportes/finanzas/serie',   { params }).then(r => r.data.datos);
