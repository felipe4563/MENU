import api from './cliente';

// Entrar con PIN en un aparato habilitado. Un 401 acá es "PIN incorrecto" o
// "aparato no habilitado", no un token vencido: _reintentado evita que
// api/cliente.js intente refrescar la sesión y repita el pedido.
const sinRefrescar = { _reintentado: true, timeout: 10000 };

export const usuariosConPin = (dispositivo_token) =>
  api.post('/auth/pin/usuarios', { dispositivo_token }, sinRefrescar).then((r) => r.data.datos);

export const entrarConPin = ({ dispositivo_token, usuario_id, pin }) =>
  api.post('/auth/pin', { dispositivo_token, usuario_id, pin }, sinRefrescar).then((r) => r.data.datos);

// Desbloquear la sesión propia con PIN (sin aparato habilitado o con la sesión
// vigente): mismo usuario y misma sucursal.
export const desbloquearConPin = (pin) =>
  api.post('/auth/pin/mismo', { pin }, sinRefrescar).then((r) => r.data.datos);

// Datos actuales de la sesión (ej. si ya tiene PIN). Un 401 no cierra nada.
export const leerYo = () => api.get('/auth/yo', sinRefrescar).then((r) => r.data.datos);
