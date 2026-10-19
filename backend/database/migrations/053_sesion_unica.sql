-- backend/database/migrations/053_sesion_unica.sql
-- Una sola sesión activa por usuario: cada login nuevo incrementa
-- sesion_version, invalidando los tokens (y refresh tokens) emitidos antes
-- en cualquier otro dispositivo.

ALTER TABLE usuarios
  ADD COLUMN sesion_version INT UNSIGNED NOT NULL DEFAULT 0 AFTER debe_cambiar_contrasena;
