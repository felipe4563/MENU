require('dotenv').config({ quiet: true });

// Los tests usan su propia base (la crea `npm run test:preparar`), nunca la
// de desarrollo: muchas suites dejan filas de prueba.
process.env.DB_NAME = process.env.TEST_DB_NAME || `${process.env.DB_NAME}_test`;
process.env.ADMIN_PASSWORD = 'admin123';
