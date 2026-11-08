import api from './cliente';

// URL base del servidor (sin /api/v1) para construir rutas de archivos estáticos
export const BASE_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:3001/api/v1').replace('/api/v1', '');

export const logoSrc = (path) => (path ? `${BASE_URL}${path}` : null);

export const getConfiguracion = () =>
  api.get('/configuracion').then((r) => r.data.datos);

export const getConfiguracionPublica = () =>
  api.get('/configuracion/publica').then((r) => r.data.datos);

export const actualizarConfiguracion = (datos) =>
  api.put('/configuracion', datos).then((r) => r.data.datos);

export const subirLogo = (file) => {
  const form = new FormData();
  form.append('imagen', file);
  return api.post('/uploads/imagen', form).then((r) => r.data.datos.url);
};

// Cobro con QR: endpoint propio (permiso pagos_qr.configurar + PIN de pagos).
// El pase que da el PIN vive solo en la pantalla (nunca en el navegador).
const conPase = (pase) => (pase ? { headers: { 'x-pase-cobro-qr': pase } } : undefined);

export const getCobroQr = (pase) =>
  api.get('/configuracion/cobro-qr', conPase(pase)).then((r) => r.data.datos);

export const guardarCobroQr = (datos, pase) =>
  api.put('/configuracion/cobro-qr', datos, conPase(pase)).then((r) => r.data.datos);

export const probarBaneco = (pase) =>
  api.post('/configuracion/cobro-qr/probar', null, conPase(pase)).then((r) => r.data.datos);

export const crearPinPagos = (datos) =>
  api.post('/configuracion/cobro-qr/pin', datos).then((r) => r.data.datos);

export const desbloquearCobroQr = (pin) =>
  api.post('/configuracion/cobro-qr/desbloquear', { pin }).then((r) => r.data.datos);
