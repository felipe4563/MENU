-- La pantalla "Pedidos externos" hasta ahora colgaba de ventas.ver: quien
-- veía Ventas veía también los pedidos de la app externa. Se le da un
-- permiso propio para poder habilitarla por rol (pensando en planes/SaaS
-- donde la integración no esté contratada).
-- Se asigna a los roles que hoy tienen ventas.ver para no cambiar el
-- comportamiento actual; el administrador lo puede quitar desde Roles.
INSERT INTO permisos (modulo, accion, descripcion) VALUES
  ('pedidos_externos', 'ver', 'Ver y cobrar pedidos llegados desde apps externas');

INSERT INTO roles_permisos (rol_id, permiso_id)
SELECT rp.rol_id, pe.id
FROM roles_permisos rp
JOIN permisos pv ON pv.id = rp.permiso_id AND pv.modulo = 'ventas' AND pv.accion = 'ver'
JOIN permisos pe ON pe.modulo = 'pedidos_externos' AND pe.accion = 'ver';
