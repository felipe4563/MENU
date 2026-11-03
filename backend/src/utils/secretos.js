// Cifrado de datos sensibles guardados en `configuraciones` (credenciales y
// cuenta del banco). AES-256-GCM con una llave derivada de CONFIG_SECRET
// (o JWT_SECRET si no está): quien copie la base sin el .env no puede leerlos.
const { createCipheriv, createDecipheriv, createHash, randomBytes } = require('crypto');

const PREFIJO = 'enc:v1:';

function _llave() {
  const base = process.env.CONFIG_SECRET || process.env.JWT_SECRET;
  if (!base) throw new Error('Falta CONFIG_SECRET (o JWT_SECRET) en el .env para cifrar datos sensibles');
  return createHash('sha256').update(base).digest();
}

function cifrarSecreto(texto) {
  if (!texto) return '';
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', _llave(), iv);
  const datos = Buffer.concat([c.update(String(texto), 'utf8'), c.final()]);
  return PREFIJO + Buffer.concat([iv, c.getAuthTag(), datos]).toString('base64');
}

// Devuelve el texto plano; un valor sin prefijo se toma tal cual (datos
// cargados antes de cifrar). Si la llave del .env cambió, no se puede leer.
function descifrarSecreto(valor) {
  if (!valor) return '';
  if (!String(valor).startsWith(PREFIJO)) return String(valor);
  const b = Buffer.from(String(valor).slice(PREFIJO.length), 'base64');
  try {
    const d = createDecipheriv('aes-256-gcm', _llave(), b.subarray(0, 12));
    d.setAuthTag(b.subarray(12, 28));
    return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8');
  } catch {
    throw Object.assign(new Error('No se pueden leer los datos del banco guardados (cambió CONFIG_SECRET). Vuelve a cargarlos en Ajustes › Cobro con QR.'), { status: 409 });
  }
}

module.exports = { cifrarSecreto, descifrarSecreto };
