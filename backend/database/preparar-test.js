// Crea desde cero la base que usan los tests (npm run test:preparar), para
// que los tests no escriban en la base de desarrollo:
//   1. Borra y crea <DB_NAME>_test (o TEST_DB_NAME).
//   2. Importa el volcado inicial bd/bd_codeculinary.sql.
//   3. Corre preparar.js (migraciones + admin admin@restaurante.com / admin123,
//      que es el usuario con el que entran los tests) y el seed.
require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const mysql = require('mysql2/promise');

const nombreBase = process.env.TEST_DB_NAME || `${process.env.DB_NAME}_test`;

(async () => {
  if (!/^[a-zA-Z0-9_]+_test$/.test(nombreBase)) throw new Error(`Nombre de base de tests inválido: ${nombreBase}`);

  const c = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    multipleStatements: true,
  });
  try {
    await c.query(`DROP DATABASE IF EXISTS \`${nombreBase}\``);
    await c.query(`CREATE DATABASE \`${nombreBase}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await c.query(`USE \`${nombreBase}\``);
    await c.query(fs.readFileSync(path.join(__dirname, '../../bd/bd_codeculinary.sql'), 'utf8'));
  } finally {
    await c.end();
  }

  execFileSync(process.execPath, [path.join(__dirname, 'preparar.js')], {
    stdio: 'inherit',
    env: { ...process.env, DB_NAME: nombreBase, ADMIN_EMAIL: 'admin@restaurante.com', ADMIN_PASSWORD: 'admin123', NOMBRE_NEGOCIO: '' },
  });

  // Los tests esperan los datos base del seed: la "Sucursal Principal" (la 1
  // del volcado, renombrada) y los roles Cajero y Mozo con sus permisos.
  const t0 = await mysql.createConnection({
    host: process.env.DB_HOST, port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER, password: process.env.DB_PASS, database: nombreBase,
  });
  await t0.query("UPDATE sucursales SET nombre = 'Sucursal Principal' WHERE id = 1");
  // El seed reemplaza los permisos de cada rol por su lista (más corta que la
  // de las migraciones): se guardan antes y se devuelven después.
  await t0.query('CREATE TABLE _permisos_previos AS SELECT * FROM roles_permisos');
  await t0.end();
  execFileSync(process.execPath, [path.join(__dirname, 'seeds/seed.js')], {
    stdio: 'inherit',
    env: { ...process.env, DB_NAME: nombreBase, ADMIN_PASSWORD: 'admin123' },
  });

  const t1 = await mysql.createConnection({
    host: process.env.DB_HOST, port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER, password: process.env.DB_PASS, database: nombreBase,
  });
  await t1.query('INSERT IGNORE INTO roles_permisos SELECT * FROM _permisos_previos');
  await t1.query('DROP TABLE _permisos_previos');
  await t1.end();

  // Los tests entran directo: sin el aviso de cambiar la contraseña inicial.
  const t = await mysql.createConnection({
    host: process.env.DB_HOST, port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER, password: process.env.DB_PASS, database: nombreBase,
  });
  // El admin de los tests trabaja en una sola sucursal (la 1), así el login
  // devuelve el token directo sin pedir elegir sucursal.
  await t.query("UPDATE usuarios SET debe_cambiar_contrasena = 0, acceso_todas_sucursales = 0 WHERE email = 'admin@restaurante.com'");
  await t.query("INSERT IGNORE INTO usuarios_sucursales (usuario_id, sucursal_id) SELECT id, 1 FROM usuarios WHERE email = 'admin@restaurante.com'");
  await t.end();
  console.log(`Base de tests lista: ${nombreBase}`);
})().catch((err) => {
  console.error('Error preparando la base de tests:', err.message);
  process.exit(1);
});
