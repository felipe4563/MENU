const nodemailer = require('nodemailer');

let _transporter = null;
function _obtenerTransporter() {
  if (_transporter) return _transporter;
  _transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT, 10) || 587,
    secure: false, // STARTTLS sobre el puerto 587, no TLS implícito
    requireTLS: true,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return _transporter;
}

async function enviarCodigoPin({ to, codigo }) {
  try {
    await _obtenerTransporter().sendMail({
      from: process.env.SMTP_FROM,
      to,
      subject: 'Tu código para activar tu PIN',
      text: `Tu código para activar tu PIN es: ${codigo}\n\nVence en 10 minutos. Si no pediste esto, ignorá este mensaje.`,
    });
  } catch {
    throw Object.assign(new Error('No se pudo enviar el código por email. Intentá de nuevo.'), { status: 502 });
  }
}

// true si el servidor tiene correo configurado (SMTP_* en el .env).
const correoConfigurado = () => Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_FROM);

// Recordatorio de un cupón por vencer. Lanza si el envío falla, para que el
// job no lo marque como avisado y lo reintente al día siguiente.
async function enviarAvisoCupon({ to, cliente, negocio, premio, codigo, vence }) {
  const nombre = String(cliente || '').split(' ')[0] || 'Hola';
  await _obtenerTransporter().sendMail({
    from: process.env.SMTP_FROM,
    to,
    subject: `${nombre}, tu cupón de ${negocio} vence ${vence}`,
    text: [
      `Hola ${nombre}:`,
      '',
      `Tienes un cupón sin usar en ${negocio}${premio ? `: ${premio}` : ''}.`,
      `Código: ${codigo}`,
      `Vence ${vence}.`,
      '',
      'Muéstralo al pagar en tu próxima visita. ¡Te esperamos!',
    ].join('\n'),
  });
}

module.exports = { enviarCodigoPin, enviarAvisoCupon, correoConfigurado };
