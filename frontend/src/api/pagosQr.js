import api from './cliente';

export const consultarEstadoPagoQr = (pedidoId) =>
  api.get(`/ventas/${pedidoId}/pago-qr/estado`).then((r) => r.data.datos);

export const cancelarPagoQr = (pedidoId) =>
  api.post(`/ventas/${pedidoId}/pago-qr/cancelar`).then((r) => r.data.datos);

// QR propio del negocio: el cajero confirma que el pago llegó.
export const confirmarPagoQr = (pedidoId) =>
  api.post(`/ventas/${pedidoId}/pago-qr/confirmar`).then((r) => r.data.datos);

export const getPagosQrPorConfirmar = () =>
  api.get('/ventas/pagos-qr/por-confirmar').then((r) => r.data.datos);
