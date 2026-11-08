-- Cajas con impresora Bluetooth: cómo se conecta el celular/PC a la impresora.
--   'directo': el navegador (Chrome/Edge) habla con la impresora por Web
--              Bluetooth, sin apps. Se empareja una vez por dispositivo.
--   'rawbt':   la app RawBT de Android (como funcionaba hasta ahora).
-- Las cajas que ya existían siguen con RawBT; las nuevas arrancan en directo.
ALTER TABLE cajas
  ADD COLUMN conexion_bluetooth ENUM('directo', 'rawbt') NOT NULL DEFAULT 'rawbt' AFTER ancho_papel_bluetooth;
ALTER TABLE cajas
  ALTER COLUMN conexion_bluetooth SET DEFAULT 'directo';
