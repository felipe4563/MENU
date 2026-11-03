const { Router } = require('express');
const ventasService = require('../modules/ventas/ventas.service');

// Banco Económico llama a POST {dominio}/api/qrsimple/notifyPaymentQR cuando
// se paga un QR (ruta fija de su especificación). La notificación no trae
// firma, así que el pago se confirma recién después de consultar al banco el
// estado del QR (ver procesarNotificacionBaneco).
const router = Router();

router.post('/notifyPaymentQR', async (req, res) => {
  try {
    await ventasService.procesarNotificacionBaneco(req.body?.payment ?? req.body?.Payment);
  } catch (err) {
    console.error('Error procesando notificación de Banco Económico:', err);
  }
  res.status(200).json({ responseCode: 0, message: '' });
});

module.exports = router;
