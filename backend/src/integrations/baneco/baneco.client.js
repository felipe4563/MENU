// Cliente de la API QR Connect de Banco Económico (especificación v1.4.0).
// Las credenciales las carga cada negocio en Ajustes › Cobro con QR y se
// guardan en `configuraciones` (claves baneco_*).
const { createCipheriv, randomBytes } = require('crypto');
const { Configuracion } = require('../../models');
const { descifrarSecreto } = require('../../utils/secretos');

const URL_CERTIFICACION = 'https://apimktdesa.baneco.com.bo/ApiGateway';

// AES-256-CBC con la llave de 32 caracteres que entrega el banco; el IV
// aleatorio va antepuesto al texto cifrado y todo en base64. Verificado con
// el ejemplo del documento: "1234" ↔ "KJAzqjmwjxIOqVo5J3IH0/7fGmNdzuyszrlqexVSeos=".
function cifrar(texto, aesKey) {
  const llave = Buffer.from(String(aesKey), 'utf8');
  if (llave.length !== 32) throw Object.assign(new Error('La llave AES del banco debe tener 32 caracteres'), { status: 400 });
  const iv = randomBytes(16);
  const c = createCipheriv('aes-256-cbc', llave, iv);
  return Buffer.concat([iv, c.update(String(texto), 'utf8'), c.final()]).toString('base64');
}

// Los datos del banco pueden venir del .env de la instancia (los carga quien
// instala el sistema y nadie los ve desde la app) o, si no están ahí, de lo
// que el dueño cargó en Ajustes › Cobro con QR (cifrado en la base).
const enServidor = () => Boolean(process.env.BANECO_USUARIO);

async function leerConfig() {
  if (enServidor()) {
    return {
      origen: 'servidor',
      url: (process.env.BANECO_URL || URL_CERTIFICACION).replace(/\/+$/, ''),
      usuario: process.env.BANECO_USUARIO, password: process.env.BANECO_PASSWORD || '', aesKey: process.env.BANECO_AES_KEY || '',
      cuenta: process.env.BANECO_CUENTA || '', sucursal: process.env.BANECO_SUCURSAL || '',
    };
  }
  const filas = await Configuracion.findAll({ where: { clave: ['baneco_url', 'baneco_usuario', 'baneco_password', 'baneco_aes_key', 'baneco_cuenta', 'baneco_sucursal'] } });
  const c = Object.fromEntries(filas.map((f) => [f.clave, f.valor ?? '']));
  return {
    origen: 'pantalla',
    url: (c.baneco_url || URL_CERTIFICACION).replace(/\/+$/, ''),
    usuario: c.baneco_usuario, password: descifrarSecreto(c.baneco_password), aesKey: descifrarSecreto(c.baneco_aes_key),
    cuenta: descifrarSecreto(c.baneco_cuenta), sucursal: c.baneco_sucursal,
  };
}

function _faltantes(cfg) {
  return [['usuario', 'el usuario'], ['password', 'la contraseña'], ['aesKey', 'la llave AES'], ['cuenta', 'la cuenta']]
    .filter(([k]) => !cfg[k]).map(([, n]) => n);
}

const _error = (mensaje, status = 502) => Object.assign(new Error(mensaje), { status });

async function _llamar(cfg, metodo, ruta, { token, cuerpo } = {}) {
  let res;
  try {
    res = await fetch(`${cfg.url}${ruta}`, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw _error('No se pudo conectar con Banco Económico, intenta de nuevo o cobra en efectivo');
  }
  const datos = await res.json().catch(() => null);
  if (!res.ok || !datos) throw _error(`Banco Económico respondió con error (${res.status})`);
  if (datos.responseCode !== 0) throw _error(`Banco Económico: ${datos.message || `código ${datos.responseCode}`}`);
  return datos;
}

// El token del banco dura ~30 min; se reusa hasta 5 min antes de vencer.
let _token = null;
async function _obtenerToken(cfg) {
  const clave = `${cfg.url}|${cfg.usuario}|${cfg.password}`;
  if (_token && _token.clave === clave && _token.vence > Date.now()) return _token.valor;
  const faltan = _faltantes(cfg);
  if (faltan.length) throw _error(`Falta configurar ${faltan.join(', ')} de Banco Económico (Ajustes › Cobro con QR)`, 409);
  const r = await _llamar(cfg, 'POST', '/api/authentication/authenticate', { cuerpo: { userName: cfg.usuario, password: cifrar(cfg.password, cfg.aesKey) } });
  let vence = Date.now() + 25 * 60 * 1000;
  try {
    const exp = JSON.parse(Buffer.from(r.token.split('.')[1], 'base64url').toString()).exp;
    if (exp) vence = exp * 1000 - 5 * 60 * 1000;
  } catch { /* token sin exp legible: se usa el plazo por defecto */ }
  _token = { clave, valor: r.token, vence };
  return r.token;
}

async function probarConexion() {
  const cfg = await leerConfig();
  _token = null;
  await _obtenerToken(cfg);
  cifrar(cfg.cuenta, cfg.aesKey);
  return { ok: true };
}

// Fecha de vencimiento del QR (yyyy-MM-dd, hora Bolivia): mañana, para que
// un QR generado cerca de medianoche no venza antes de que el cliente pague.
// El vencimiento real del cobro lo controla el sistema (expires_at).
function _fechaVencimiento() {
  return new Date(Date.now() - 4 * 3600 * 1000 + 24 * 3600 * 1000).toISOString().slice(0, 10);
}

async function generarQr({ transactionId, amount, description }) {
  const cfg = await leerConfig();
  const token = await _obtenerToken(cfg);
  const r = await _llamar(cfg, 'POST', '/api/qrsimple/generateQR', {
    token,
    cuerpo: {
      transactionId: String(transactionId),
      accountCredit: cifrar(cfg.cuenta, cfg.aesKey),
      currency: 'BOB',
      amount: Math.round(Number(amount) * 100) / 100,
      description: description || undefined,
      dueDate: _fechaVencimiento(),
      singleUse: true,
      modifyAmount: false,
      ...(cfg.sucursal ? { branchCode: String(cfg.sucursal).slice(0, 5) } : {}),
    },
  });
  return { qrId: r.qrId, qrImage: r.qrImage };
}

// statusQrCode: 0 pendiente, 1 pagado, 9 anulado.
async function consultarEstado(qrId) {
  const cfg = await leerConfig();
  const token = await _obtenerToken(cfg);
  const r = await _llamar(cfg, 'GET', `/api/qrsimple/v2/statusQR/${encodeURIComponent(qrId)}`, { token });
  const codigo = r.statusQrCode ?? r.statusQRCode;
  const pago = Array.isArray(r.payment) ? r.payment[0] : r.payment;
  return { codigo: Number(codigo), pago: pago ?? null };
}

async function anularQr(qrId) {
  const cfg = await leerConfig();
  const token = await _obtenerToken(cfg);
  await _llamar(cfg, 'DELETE', '/api/qrsimple/cancelQR', { token, cuerpo: { qrId } });
}

module.exports = { cifrar, generarQr, consultarEstado, anularQr, probarConexion, leerConfig, enServidor, URL_CERTIFICACION };
