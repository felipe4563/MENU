require('dotenv').config({ quiet: true });
const express = require('express');
const path = require('path');
const cors = require('cors');
const manejarErrores = require('./middlewares/errores');
const uploadsRoutes = require('./modules/uploads/uploads.routes');
const authRoutes = require('./modules/auth/auth.routes');
const rolesRoutes = require('./modules/roles/roles.routes');
const sucursalesRoutes = require('./modules/sucursales/sucursales.routes');
const cajasRoutes = require('./modules/cajas/cajas.routes');
const usuariosRoutes = require('./modules/usuarios/usuarios.routes');
const mesasRoutes = require('./modules/mesas/mesas.routes');
const areasRoutes = require('./modules/mesas/areas.routes');
const productosRoutes = require('./modules/productos/productos.routes');
const categoriasRoutes = require('./modules/productos/categorias.routes');
const gruposOpcionesRoutes = require('./modules/productos/grupos-opciones.routes');
const clientesRoutes = require('./modules/clientes/clientes.routes');
const cajaRoutes = require('./modules/caja/caja.routes');
const ventasRoutes = require('./modules/ventas/ventas.routes');
const libroCajaRoutes = require('./modules/libro_caja/libro_caja.routes');
const comprasRoutes = require('./modules/compras/compras.routes');
const proveedoresRoutes = require('./modules/compras/proveedores.routes');
const inventarioRoutes = require('./modules/inventario/inventario.routes');
const configuracionRoutes = require('./modules/configuracion/configuracion.routes');
const integracionesAdminRoutes = require('./modules/integraciones/integracionesAdmin.routes');
const integracionesRoutes = require('./modules/integraciones/integraciones.routes');
const reportesRoutes = require('./modules/reportes/reportes.routes');
const perfilRoutes = require('./modules/perfil/perfil.routes');
const combosRoutes = require('./modules/combos/combos.routes');
const promocionesRoutes = require('./modules/promociones/promociones.routes');
const cuponesRoutes = require('./modules/cupones/cupones.routes');
const ruletaRoutes = require('./modules/ruleta/ruleta.routes');
const insumosRoutes = require('./modules/insumos/insumos.routes');
const autoservicioRoutes = require('./modules/autoservicio/autoservicio.routes');
const clientePublicoRoutes = require('./modules/clientePublico/clientePublico.routes');
const codepayWebhookRoutes = require('./webhooks/codepay.webhook.routes');
const banecoWebhookRoutes = require('./webhooks/baneco.webhook.routes');
const impresionRoutes = require('./modules/impresion/impresion.routes');
const agenteRoutes = require('./modules/agente/agente.routes');
const pwaRoutes = require('./modules/pwa/pwa.routes');
const devolucionesRoutes = require('./modules/devoluciones/devoluciones.routes');
const personalRoutes = require('./modules/personal/personal.routes');

const app = express();

// En producción hay dos nginx delante (el del VPS y el del contenedor del
// frontend): sin esto req.ip sería el del nginx y el límite de intentos
// frenaría a todos juntos.
app.set('trust proxy', Number(process.env.TRUST_PROXY ?? (process.env.NODE_ENV === 'production' ? 2 : 0)));
app.disable('x-powered-by');

app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json({
  verify: (req, _res, buf) => { req.rawBody = buf; },
}));
app.use('/uploads', (_req, res, next) => {
  res.set({ 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; img-src 'self'; sandbox" });
  next();
}, express.static(path.join(__dirname, '../uploads')));

app.get('/api/v1/salud', (_req, res) => {
  res.json({ ok: true, datos: 'API restaurante funcionando' });
});

app.use('/webhooks', codepayWebhookRoutes);
// Ruta fija que exige Banco Económico para avisar pagos de QR.
app.use('/api/qrsimple', banecoWebhookRoutes);

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/roles', rolesRoutes);
app.use('/api/v1/sucursales', sucursalesRoutes);
app.use('/api/v1/cajas', cajasRoutes);
app.use('/api/v1/usuarios', usuariosRoutes);
app.use('/api/v1/mesas', mesasRoutes);
app.use('/api/v1/areas', areasRoutes);
app.use('/api/v1/productos', productosRoutes);
app.use('/api/v1/categorias', categoriasRoutes);
app.use('/api/v1/grupos-opciones', gruposOpcionesRoutes);
app.use('/api/v1/clientes', clientesRoutes);
app.use('/api/v1/caja', cajaRoutes);
app.use('/api/v1/ventas', ventasRoutes);
app.use('/api/v1/libro-caja', libroCajaRoutes);
app.use('/api/v1/compras', comprasRoutes);
app.use('/api/v1/proveedores', proveedoresRoutes);
app.use('/api/v1/inventario', inventarioRoutes);
app.use('/api/v1/configuracion', configuracionRoutes);
app.use('/api/v1/integraciones-admin', integracionesAdminRoutes);
app.use('/api/v1/integraciones', integracionesRoutes);
app.use('/api/v1/reportes', reportesRoutes);
app.use('/api/v1/perfil', perfilRoutes);
app.use('/api/v1/combos', combosRoutes);
app.use('/api/v1/promociones', promocionesRoutes);
app.use('/api/v1/cupones', cuponesRoutes);
app.use('/api/v1/ruleta', ruletaRoutes);
app.use('/api/v1/insumos', insumosRoutes);
app.use('/api/v1/autoservicio', autoservicioRoutes);
app.use('/api/v1/cliente', clientePublicoRoutes);
app.use('/api/v1/impresion', impresionRoutes);
app.use('/api/v1/agente', agenteRoutes);
app.use('/api/v1/pwa', pwaRoutes);
app.use('/api/v1/uploads', uploadsRoutes);
app.use('/api/v1/personal', personalRoutes);
app.use('/api/v1/devoluciones', devolucionesRoutes);

app.use(manejarErrores);

module.exports = app;
