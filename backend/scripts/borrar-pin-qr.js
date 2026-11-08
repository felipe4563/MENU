// Borra el PIN de pagos y su titular (Ajustes › Cobro con QR): cuando el
// dueño lo olvidó, cambió el dueño o lo creó la persona equivocada. La próxima
// persona con el permiso que abra la pantalla crea el PIN y queda como
// titular: que sea el dueño. Uso: npm run pin-qr:borrar
require('dotenv').config();
const { sequelize } = require('../src/models');
const { borrarPin } = require('../src/modules/configuracion/pinCobroQr');

borrarPin()
  .then(() => console.log('PIN de pagos y titular borrados. El próximo que abra Cobro con QR los crea: que sea el dueño.'))
  .catch((e) => { console.error('No se pudo borrar el PIN:', e.message); process.exitCode = 1; })
  .finally(() => sequelize.close());
