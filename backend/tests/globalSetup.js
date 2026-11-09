// Antes de correr los tests, la base de test se pone al día sola:
// - si no existe, se crea completa (npm run test:preparar);
// - si existe, se le aplican las migraciones nuevas que falten.
// Sin esto, después de agregar una migración los tests fallaban como si la
// base estuviera "sucia" hasta reconstruirla a mano.
const path = require('path');
const { execFileSync } = require('child_process');
const mysql = require('mysql2/promise');

module.exports = async () => {
  require('dotenv').config({ quiet: true });
  const base = process.env.TEST_DB_NAME || `${process.env.DB_NAME}_test`;
  const c = await mysql.createConnection({ host: process.env.DB_HOST, port: process.env.DB_PORT || 3306, user: process.env.DB_USER, password: process.env.DB_PASS });
  const [filas] = await c.query('SELECT 1 FROM information_schema.schemata WHERE schema_name = ?', [base]);
  await c.end();

  const db = path.join(__dirname, '..', 'database');
  if (!filas.length) {
    execFileSync(process.execPath, [path.join(db, 'preparar-test.js')], { stdio: 'inherit' });
    return;
  }
  execFileSync(process.execPath, [path.join(db, 'preparar.js')], {
    stdio: ['ignore', 'pipe', 'inherit'],
    env: { ...process.env, DB_NAME: base, ADMIN_EMAIL: 'admin@restaurante.com', ADMIN_PASSWORD: 'admin123', NOMBRE_NEGOCIO: '' },
  });
};
