-- backend/database/migrations/074_pin_usuarios.sql
-- PIN de 4 números por usuario para entrar rápido desde la pantalla de
-- bloqueo. pin guarda solo el hash bcrypt. Con 5 PIN equivocados seguidos
-- pin_bloqueado pasa a 1 y el usuario debe entrar con correo y contraseña
-- (eso reinicia pin_intentos y pin_bloqueado).

ALTER TABLE usuarios
  ADD COLUMN pin VARCHAR(255) NULL AFTER activo,
  ADD COLUMN pin_intentos TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER pin,
  ADD COLUMN pin_bloqueado TINYINT(1) NOT NULL DEFAULT 0 AFTER pin_intentos;
