import api from './cliente';

export const getEstadoAgentes = () =>
  api.get('/impresion/estado-agentes').then(r => r.data.datos);

// El mismo .exe que las cajas descargan para auto-actualizarse (público).
export const urlDescargaAgente = `${api.defaults.baseURL}/agente/descargar`;
