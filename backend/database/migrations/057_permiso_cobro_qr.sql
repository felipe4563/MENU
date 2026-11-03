-- backend/database/migrations/057_permiso_cobro_qr.sql
-- Quién cobra con QR y a qué cuenta llega el dinero es tan delicado como la
-- caja: tiene su propio permiso, separado de "configuracion.editar". Se le
-- da solo al rol Administrador (el dueño); se puede asignar a otro rol desde
-- Equipo › Roles.
INSERT INTO permisos (modulo, accion, descripcion) VALUES
  ('pagos_qr', 'configurar', 'Elegir el cobro con QR y cargar los datos del banco');

INSERT INTO roles_permisos (rol_id, permiso_id)
SELECT r.id, p.id
FROM roles r
JOIN permisos p ON p.modulo = 'pagos_qr' AND p.accion = 'configurar'
WHERE r.nombre = 'Administrador';

-- Registro del último cambio (quién y cuándo), visible en la pantalla.
INSERT IGNORE INTO configuraciones (clave, valor) VALUES ('qr_ultimo_cambio', '');
