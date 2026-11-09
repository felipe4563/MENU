const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');

let _io = null;

// socket.id -> { sucursal_id, caja_ids, conectado_en } — solo agentes de
// impresión física que se identificaron con 'agente:conectado' (ver
// print-agent/agent.js). Un navegador de staff normal nunca emite ese
// evento, así que nunca aparece acá. caja_ids es un array porque una misma
// PC/agente puede atender más de una caja (una sola impresora para varios
// puntos de cobro).
const agentesConectados = new Map();
// caja_id (o 'sucursal:<id>' sin caja) -> última vez que su agente se
// desconectó, para mostrar "Desconectado hace 3 h". Solo en memoria: tras
// reiniciar el servidor se pierde, y el dashboard muestra solo "sin conexión".
const ultimaDesconexion = new Map();

const igualSeguro = (a, b) => {
  const x = Buffer.from(String(a)); const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

// Quién puede conectarse: el personal con su token de sesión (solo a su
// sucursal), o el agente de impresión con AGENTE_IMPRESION_CLAVE. Sin esa
// variable en el .env se aceptan agentes sin clave (los instalados antes de
// existir), pero cualquiera que conozca la URL podría escuchar los pedidos.
async function identificar(socket, next) {
  const { token, clave_agente: claveAgente } = socket.handshake.auth || {};
  if (token) {
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      if (payload.tipo === 'pre_login') throw new Error('pre_login');
      const { Usuario } = require('./models');
      const usuario = await Usuario.findOne({ where: { id: payload.id, activo: 1 }, attributes: ['id', 'sesion_version'] });
      if (!usuario || (payload.sesion_version ?? 0) !== usuario.sesion_version) throw new Error('sesion');
      socket.data.quien = { tipo: 'personal', sucursal_id: payload.sucursal_id ?? null };
      return next();
    } catch {
      return next(new Error('No autorizado'));
    }
  }
  const claveServidor = process.env.AGENTE_IMPRESION_CLAVE;
  if (claveServidor ? (claveAgente && igualSeguro(claveAgente, claveServidor)) : true) {
    socket.data.quien = { tipo: 'agente' };
    return next();
  }
  return next(new Error('No autorizado'));
}

// El personal solo entra a la sala de la sucursal de su sesión (o a
// cualquiera si su sesión es "Todas las sucursales").
function puedeEntrar(socket, sucursal_id) {
  const quien = socket.data.quien;
  if (!quien || quien.tipo === 'agente') return true;
  return quien.sucursal_id === null || Number(sucursal_id) === Number(quien.sucursal_id);
}

function init(server) {
  const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map(o => o.trim());

  _io = new Server(server, {
    cors: {
      // Acepta los orígenes configurados + el agente de impresión (sin origin)
      origin: (origin, cb) => {
        if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
        cb(new Error('socket.io CORS: ' + origin));
      },
      methods: ['GET', 'POST'],
    },
  });
  if (!process.env.AGENTE_IMPRESION_CLAVE) {
    console.warn('AGENTE_IMPRESION_CLAVE no está en el .env: los agentes de impresión se conectan sin clave.');
  }
  _io.use(identificar);
  _io.on('connection', (socket) => {
    console.log('Socket conectado:', socket.id, socket.data.quien?.tipo);
    socket.on('unirse_sucursal', (sucursal_id) => {
      if (sucursal_id && puedeEntrar(socket, sucursal_id)) socket.join(`sucursal:${sucursal_id}`);
    });
    // Sala por caja: permite mandar el ticket de venta solo al agente de
    // impresión de la caja que hizo la venta, en vez de a todas las cajas
    // de la sucursal (ver print:caja en emitir()).
    socket.on('unirse_caja', async (caja_id) => {
      if (!caja_id) return;
      if (socket.data.quien?.tipo !== 'agente') {
        const { Caja } = require('./models');
        const caja = await Caja.findByPk(caja_id, { attributes: ['sucursal_id'] }).catch(() => null);
        if (!caja || !puedeEntrar(socket, caja.sucursal_id)) return;
      }
      socket.join(`caja:${caja_id}`);
    });
    // El agente de impresión física se identifica apenas conecta (ver
    // print-agent/agent.js) — a diferencia de unirse_sucursal/unirse_caja
    // (que también usan pantallas de staff normales), esto es exclusivo
    // del agente, así que sirve para saber "está vivo" desde el backend.
    socket.on('agente:conectado', ({ sucursal_id, caja_id, caja_ids, version, version_pendiente, autoactualizacion } = {}) => {
      if (!sucursal_id || socket.data.quien?.tipo !== 'agente') return;
      // Compatibilidad: agentes viejos (antes de la selección múltiple de
      // cajas) mandan un único `caja_id` en vez de `caja_ids`.
      const idsFinal = Array.isArray(caja_ids) && caja_ids.length ? caja_ids : (caja_id ? [caja_id] : []);
      // version llega desde el agente 1.1.0 (auto-actualización); los anteriores no la mandan.
      const texto = (v) => (typeof v === 'string' && /^\d+\.\d+\.\d+$/.test(v) ? v : null);
      agentesConectados.set(socket.id, {
        sucursal_id, caja_ids: idsFinal, conectado_en: Date.now(),
        version: texto(version), version_pendiente: texto(version_pendiente),
        autoactualizacion: autoactualizacion === undefined ? null : Boolean(autoactualizacion),
      });
      if (idsFinal.length) {
        idsFinal.forEach((id) => emitir('agente:estado', { caja_id: id, conectado: true }, sucursal_id));
      } else {
        emitir('agente:estado', { caja_id: null, conectado: true }, sucursal_id);
      }
    });
    socket.on('disconnect', () => {
      console.log('Socket desconectado:', socket.id);
      const info = agentesConectados.get(socket.id);
      if (info) {
        agentesConectados.delete(socket.id);
        const ahora = Date.now();
        if (info.caja_ids.length) info.caja_ids.forEach((id) => ultimaDesconexion.set(id, ahora));
        else ultimaDesconexion.set(`sucursal:${info.sucursal_id}`, ahora);
        if (info.caja_ids.length) {
          info.caja_ids.forEach((id) => emitir('agente:estado', { caja_id: id, conectado: false }, info.sucursal_id));
        } else {
          emitir('agente:estado', { caja_id: null, conectado: false }, info.sucursal_id);
        }
      }
    });
  });
  return _io;
}

function emitir(evento, datos = {}, sucursal_id = null, caja_id = null) {
  if (!_io) return;
  if (caja_id) {
    _io.to(`caja:${caja_id}`).emit(evento, datos);
  } else if (sucursal_id) {
    _io.to(`sucursal:${sucursal_id}`).emit(evento, datos);
  } else {
    _io.emit(evento, datos);
  }
}

// Aplana un agente con varias cajas en una fila por cada una — así
// obtenerEstadoAgentes() (que arma un Set de caja_id) marca conectadas TODAS
// las cajas que ese agente atiende, no solo la primera.
function estadoAgentes() {
  const filas = [];
  for (const info of agentesConectados.values()) {
    const datos = { sucursal_id: info.sucursal_id, conectado_en: info.conectado_en, version: info.version, version_pendiente: info.version_pendiente, autoactualizacion: info.autoactualizacion };
    if (info.caja_ids.length) {
      info.caja_ids.forEach((caja_id) => filas.push({ ...datos, caja_id }));
    } else {
      filas.push({ ...datos, caja_id: null });
    }
  }
  return filas;
}

const desconectadoEn = (caja_id) => ultimaDesconexion.get(caja_id) ?? null;

module.exports = { init, emitir, estadoAgentes, desconectadoEn };
