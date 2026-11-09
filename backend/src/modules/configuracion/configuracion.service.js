const { Configuracion, Usuario } = require('../../models');
const { cifrarSecreto } = require('../../utils/secretos');
const banecoClient = require('../../integrations/baneco/baneco.client');
const pin = require('./pinCobroQr');

// El cobro con QR (a qué cuenta o QR llega el dinero) no se ve ni se cambia
// por la configuración general: tiene su propio endpoint, con el permiso
// pagos_qr.configurar y el PIN de pagos (ver pinCobroQr.js).
const esDeCobroQr = (clave) => clave.startsWith('baneco_') || clave.startsWith('qr_pin') || clave === 'qr_ultimo_cambio';
const SOLO_COBRO_QR = (clave) => esDeCobroQr(clave) || clave === 'qr_proveedor' || clave === 'qr_propio_imagen';

async function obtenerTodo() {
  const configs = await Configuracion.findAll({ order: [['clave', 'ASC']] });
  const todo = configs.reduce((obj, c) => {
    if (!esDeCobroQr(c.clave)) obj[c.clave] = c.valor;
    return obj;
  }, {});
  // Solo lectura: si el servidor puede mandar correos (SMTP_* del .env).
  todo.correo_configurado = require('../../integrations/email/email.client').correoConfigurado() ? 'true' : 'false';
  return todo;
}

async function obtenerPublica() {
  const claves = ['nombre_negocio', 'logo', 'portada', 'moneda', 'simbolo_moneda', 'color_primario', 'color_secundario', 'fidelidad_activa', 'fidelidad_canje_qr', 'qr_proveedor'];
  const configs = await Configuracion.findAll({ where: { clave: claves } });
  return configs.reduce((obj, c) => {
    obj[c.clave] = c.valor;
    return obj;
  }, {});
}

async function actualizar(pares) {
  if (Object.keys(pares).some(SOLO_COBRO_QR)) {
    throw Object.assign(new Error('El cobro con QR se cambia en Ajustes › Cobro con QR.'), { status: 403 });
  }
  for (const [clave, valor] of Object.entries(pares)) {
    await Configuracion.upsert({ clave, valor });
  }
  return obtenerTodo();
}

// ---------- Cobro con QR ----------

const PROVEEDORES = ['codepay', 'baneco', 'propio'];

async function _valores(claves) {
  const filas = await Configuracion.findAll({ where: { clave: claves } });
  return Object.fromEntries(filas.map((f) => [f.clave, f.valor ?? '']));
}

// Lo que ve la pantalla. Los datos del banco solo los recibe quien puede
// configurarlos, y aun así nunca la contraseña, la llave ni la cuenta completa.
async function obtenerCobroQr({ puedeConfigurar, usuario_id, pase }) {
  const v = await _valores(['qr_proveedor', 'qr_propio_imagen', 'qr_ultimo_cambio', 'baneco_url', 'baneco_usuario', 'baneco_password', 'baneco_aes_key', 'baneco_cuenta', 'baneco_sucursal']);
  let ultimoCambio = null;
  try { ultimoCambio = v.qr_ultimo_cambio ? JSON.parse(v.qr_ultimo_cambio) : null; } catch { /* valor viejo */ }
  // Con titular, solo él configura; los demás quedan como solo lectura.
  const titular = await pin.titular();
  if (puedeConfigurar && titular && titular.id !== usuario_id) puedeConfigurar = false;
  const respuesta = {
    titular: titular ? { nombre: titular.nombre } : null,
    qr_proveedor: PROVEEDORES.includes(v.qr_proveedor) ? v.qr_proveedor : 'codepay',
    qr_propio_imagen: v.qr_propio_imagen,
    codepay_configurado: Boolean(process.env.CODEPAY_API_URL),
    puede_configurar: puedeConfigurar,
    ultimo_cambio: ultimoCambio,
    baneco: { origen: banecoClient.enServidor() ? 'servidor' : 'pantalla' },
  };
  // Sin el PIN, quien puede configurar solo sabe que hay que desbloquear.
  if (puedeConfigurar) {
    respuesta.pin_creado = await pin.hayPin();
    respuesta.desbloqueado = pin.paseValido(pase, usuario_id);
    if (!respuesta.desbloqueado) {
      delete respuesta.qr_propio_imagen;
      return respuesta;
    }
  }
  if (puedeConfigurar && !banecoClient.enServidor()) {
    let cuentaFinal = '';
    try {
      const { cuenta } = await banecoClient.leerConfig();
      cuentaFinal = cuenta ? cuenta.slice(-4) : '';
    } catch { /* no se pudo descifrar: se muestra como no cargada */ }
    Object.assign(respuesta.baneco, {
      url: v.baneco_url, usuario: v.baneco_usuario, sucursal: v.baneco_sucursal,
      password_cargada: Boolean(v.baneco_password), aes_cargada: Boolean(v.baneco_aes_key), cuenta_final: cuentaFinal,
    });
  }
  return respuesta;
}

async function guardarCobroQr(usuario_id, datos, pase) {
  pin.exigirPase(pase, usuario_id);
  await pin.verificarPin(datos.pin, usuario_id);
  const usuario = await Usuario.findByPk(usuario_id);

  const proveedor = datos.qr_proveedor;
  if (!PROVEEDORES.includes(proveedor)) throw Object.assign(new Error('Proveedor de QR inválido'), { status: 400 });

  const cambios = { qr_proveedor: proveedor };
  if (datos.qr_propio_imagen !== undefined) cambios.qr_propio_imagen = datos.qr_propio_imagen || '';

  if (!banecoClient.enServidor()) {
    for (const k of ['baneco_url', 'baneco_usuario', 'baneco_sucursal']) {
      if (datos[k] !== undefined) cambios[k] = String(datos[k] ?? '').trim();
    }
    if (cambios.baneco_sucursal && cambios.baneco_sucursal.length > 5) throw Object.assign(new Error('El código de sucursal admite hasta 5 caracteres.'), { status: 400 });
    // Vacío = se mantiene lo guardado (la pantalla nunca recibe estos valores).
    for (const k of ['baneco_password', 'baneco_aes_key', 'baneco_cuenta']) {
      if (datos[k]) cambios[k] = cifrarSecreto(String(datos[k]).trim());
    }
    if (datos.baneco_aes_key && String(datos.baneco_aes_key).trim().length !== 32) {
      throw Object.assign(new Error('La llave de cifrado debe tener 32 caracteres.'), { status: 400 });
    }
  }

  const final = { ...(await _valores(['qr_propio_imagen', 'baneco_usuario', 'baneco_password', 'baneco_aes_key', 'baneco_cuenta'])), ...cambios };
  if (proveedor === 'propio' && !final.qr_propio_imagen) {
    throw Object.assign(new Error('Sube la imagen de tu QR para usar esta opción.'), { status: 400 });
  }
  if (proveedor === 'baneco' && !banecoClient.enServidor() && ['baneco_usuario', 'baneco_password', 'baneco_aes_key', 'baneco_cuenta'].some((k) => !final[k])) {
    throw Object.assign(new Error('Para usar Banco Económico completa usuario, contraseña, llave de cifrado y cuenta.'), { status: 400 });
  }
  if (proveedor === 'codepay' && !process.env.CODEPAY_API_URL) {
    throw Object.assign(new Error('CodePay no está configurado en este servidor.'), { status: 400 });
  }

  cambios.qr_ultimo_cambio = JSON.stringify({ usuario: usuario.nombre, usuario_id: usuario.id, fecha: new Date().toISOString() });
  for (const [clave, valor] of Object.entries(cambios)) {
    await Configuracion.upsert({ clave, valor });
  }
  console.log(`Cobro QR actualizado por ${usuario.nombre} (#${usuario.id}): proveedor ${proveedor}, claves ${Object.keys(cambios).join(', ')}`);
  return obtenerCobroQr({ puedeConfigurar: true, usuario_id, pase });
}

module.exports = { obtenerTodo, obtenerPublica, actualizar, obtenerCobroQr, guardarCobroQr };
