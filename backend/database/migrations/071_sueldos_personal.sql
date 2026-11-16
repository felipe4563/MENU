-- Sueldos del personal (Equipo › Sueldos).
-- sueldos_personal: cómo se le paga a cada uno (diario, semanal, quincenal,
--   mensual) y cuánto, desde qué día rige. Un cambio de sueldo es una fila
--   nueva: lo anterior se sigue calculando con el monto de antes. 'ninguno'
--   = deja de cobrar desde ese día (se fue, licencia sin goce).
-- pagos_personal: pagos y adelantos (sale plata: van al libro de caja como
--   Sueldos y, si salen de una caja abierta, también como gasto de esa caja)
--   y bonos/descuentos (cambian lo que se le debe, no mueven plata).
-- ausencias_personal: faltas justificadas (permiso con goce): no se descuentan.
CREATE TABLE IF NOT EXISTS `sueldos_personal` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `usuario_id` int(10) unsigned NOT NULL,
  `modalidad` enum('diario','semanal','quincenal','mensual','ninguno') NOT NULL,
  `monto` decimal(10,2) NOT NULL DEFAULT 0.00,
  `descontar_faltas` tinyint(1) NOT NULL DEFAULT 1,
  `vigente_desde` date NOT NULL,
  `creado_por` int(10) unsigned DEFAULT NULL,
  `creado_en` datetime NOT NULL DEFAULT current_timestamp(),
  `actualizado_en` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_sueldo_usuario_desde` (`usuario_id`, `vigente_desde`),
  CONSTRAINT `fk_sueldo_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `pagos_personal` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `usuario_id` int(10) unsigned NOT NULL,
  `tipo` enum('pago','adelanto','bono','descuento') NOT NULL,
  `monto` decimal(10,2) NOT NULL,
  `fecha` date NOT NULL,
  `nota` varchar(160) DEFAULT NULL,
  `metodo_pago` enum('efectivo','qr') DEFAULT NULL,
  `sucursal_id` int(10) unsigned DEFAULT NULL,
  `sesion_caja_id` int(10) unsigned DEFAULT NULL,
  `gasto_id` int(10) unsigned DEFAULT NULL,
  `libro_caja_id` int(10) unsigned DEFAULT NULL,
  `registrado_por` int(10) unsigned NOT NULL,
  `creado_en` datetime NOT NULL DEFAULT current_timestamp(),
  `actualizado_en` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_pagos_personal_usuario` (`usuario_id`, `fecha`),
  KEY `idx_pagos_personal_libro` (`libro_caja_id`),
  CONSTRAINT `fk_pago_personal_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ausencias_personal` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `usuario_id` int(10) unsigned NOT NULL,
  `fecha` date NOT NULL,
  `motivo` varchar(120) DEFAULT NULL,
  `registrado_por` int(10) unsigned DEFAULT NULL,
  `creado_en` datetime NOT NULL DEFAULT current_timestamp(),
  `actualizado_en` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_ausencia_usuario_fecha` (`usuario_id`, `fecha`),
  CONSTRAINT `fk_ausencia_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Los pagos de sueldo caen en esta categoría del flujo: que no se pueda borrar.
UPDATE `categorias_flujo` SET `sistema` = 1, `activo` = 1 WHERE `clave` = 'sueldos';

-- Pagar sueldos mueve plata de la caja: permiso propio, solo para el
-- Administrador (se puede dar a otro rol desde Equipo › Roles).
INSERT INTO permisos (modulo, accion, descripcion) VALUES
  ('personal', 'pagar', 'Configurar sueldos y pagar sueldos, adelantos y bonos');

INSERT INTO roles_permisos (rol_id, permiso_id)
SELECT r.id, p.id
FROM roles r
JOIN permisos p ON p.modulo = 'personal' AND p.accion = 'pagar'
WHERE r.nombre = 'Administrador';
