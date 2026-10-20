// Corre antes de levantar el servidor (ver Dockerfile):
//   1. Aplica las migraciones de database/migrations que falten, en orden,
//      y las anota en la tabla `migraciones`.
//   2. En una instalación nueva, configura el admin y el nombre del negocio
//      con las variables del .env de esa instancia.
// Si una migración falla, sale con error y el servidor NO arranca, para no
// correr código nuevo sobre un esquema viejo.
//
// Uso manual: node database/preparar.js [--baseline 053]
//   --baseline NNN: para una base que ya existía antes de este control de
//   migraciones. Marca como aplicadas todas hasta NNN (inclusive) sin
//   correrlas, y después aplica las siguientes.
require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

const DIR_MIGRACIONES = path.join(__dirname, 'migrations');
// Email con el que viene el admin del volcado inicial (bd/bd_codeculinary.sql).
const EMAIL_ADMIN_INICIAL = 'admin@instalacion.local';

async function tablaExiste(c, tabla) {
  const [r] = await c.query(
    'SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?',
    [tabla],
  );
  return r[0].n > 0;
}

async function migrar(c, baseline) {
  const archivos = fs.readdirSync(DIR_MIGRACIONES).filter((f) => f.endsWith('.sql')).sort();

  if (!(await tablaExiste(c, 'migraciones'))) {
    if (!baseline) {
      throw new Error(
        'La base no tiene la tabla `migraciones`. Si es una base que ya existía, indicá hasta qué ' +
        'migración tiene aplicada: node database/preparar.js --baseline 053',
      );
    }
    await c.query(`CREATE TABLE migraciones (
      nombre VARCHAR(150) NOT NULL PRIMARY KEY,
      aplicada_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    const previas = archivos.filter((f) => f.slice(0, 3) <= baseline).map((f) => [f.replace(/\.sql$/, '')]);
    if (previas.length) await c.query('INSERT INTO migraciones (nombre) VALUES ?', [previas]);
    console.log(`Migraciones: base marcada hasta ${baseline} (${previas.length} sin correr)`);
  }

  const [filas] = await c.query('SELECT nombre FROM migraciones');
  const aplicadas = new Set(filas.map((f) => f.nombre));
  const pendientes = archivos.filter((f) => !aplicadas.has(f.replace(/\.sql$/, '')));

  for (const archivo of pendientes) {
    const nombre = archivo.replace(/\.sql$/, '');
    console.log(`Migraciones: aplicando ${nombre}...`);
    await c.query(fs.readFileSync(path.join(DIR_MIGRACIONES, archivo), 'utf8'));
    await c.query('INSERT INTO migraciones (nombre) VALUES (?)', [nombre]);
  }
  console.log(pendientes.length ? `Migraciones: ${pendientes.length} aplicada(s)` : 'Migraciones: al día');
}

async function primerInicio(c) {
  const [admins] = await c.query('SELECT id FROM usuarios WHERE email = ?', [EMAIL_ADMIN_INICIAL]);
  if (!admins.length) return;

  const { ADMIN_EMAIL, ADMIN_PASSWORD, NOMBRE_NEGOCIO } = process.env;
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    console.warn(`Instalación nueva sin ADMIN_EMAIL/ADMIN_PASSWORD en el .env: el admin sigue como ${EMAIL_ADMIN_INICIAL}`);
    return;
  }
  // Pide cambiar la contraseña al primer login: la inicial queda escrita en el .env.
  await c.query(
    'UPDATE usuarios SET email = ?, contrasena = ?, debe_cambiar_contrasena = 1 WHERE id = ?',
    [ADMIN_EMAIL, await bcrypt.hash(ADMIN_PASSWORD, 10), admins[0].id],
  );
  if (NOMBRE_NEGOCIO) {
    await c.query('UPDATE sucursales SET nombre = ? WHERE id = 1', [NOMBRE_NEGOCIO]);
    await c.query("UPDATE configuraciones SET valor = ? WHERE clave = 'nombre_negocio'", [NOMBRE_NEGOCIO]);
  }
  console.log(`Primer inicio: admin configurado como ${ADMIN_EMAIL}`);
}

// En una instalación nueva MySQL tarda en importar el volcado inicial y el
// healthcheck ya da OK durante esa importación: se reintenta hasta 2 min.
async function conectar() {
  for (let intento = 1; ; intento++) {
    try {
      return await mysql.createConnection({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT || 3306,
        user: process.env.DB_USER,
        password: process.env.DB_PASS,
        database: process.env.DB_NAME,
        multipleStatements: true,
      });
    } catch (err) {
      if (intento >= 40) throw err;
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

(async () => {
  const i = process.argv.indexOf('--baseline');
  const baseline = i > -1 ? String(process.argv[i + 1] || '').padStart(3, '0') : process.env.MIGRACIONES_BASELINE;

  const c = await conectar();
  try {
    await migrar(c, baseline);
    await primerInicio(c);
  } finally {
    await c.end();
  }
})().catch((err) => {
  console.error('Error preparando la base:', err.message);
  process.exit(1);
});
