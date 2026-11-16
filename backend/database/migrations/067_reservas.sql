-- Reservas de mesa: quién viene, cuántos, a qué hora y (si ya se eligió) a
-- qué mesa. La mesa se ve como reservada en el salón un rato antes de la
-- hora; no se cambia mesas.estado, se calcula a partir de las reservas.
-- estado: pendiente (por llegar), llego (ya se sentaron), cancelada, no_vino.

CREATE TABLE `reservas` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `sucursal_id` int(10) UNSIGNED NOT NULL,
  `mesa_id` int(10) UNSIGNED DEFAULT NULL,
  `usuario_id` int(10) UNSIGNED DEFAULT NULL,
  `nombre_cliente` varchar(100) NOT NULL,
  `telefono` varchar(30) DEFAULT NULL,
  `personas` smallint(5) UNSIGNED NOT NULL DEFAULT 2,
  `fecha_hora` datetime NOT NULL,
  `duracion_min` smallint(5) UNSIGNED NOT NULL DEFAULT 120,
  `notas` varchar(255) DEFAULT NULL,
  `estado` enum('pendiente','llego','cancelada','no_vino') NOT NULL DEFAULT 'pendiente',
  `creado_en` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `actualizado_en` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `reservas_sucursal_fecha_idx` (`sucursal_id`, `fecha_hora`),
  KEY `reservas_mesa_idx` (`mesa_id`),
  CONSTRAINT `reservas_sucursal_fk` FOREIGN KEY (`sucursal_id`) REFERENCES `sucursales` (`id`),
  CONSTRAINT `reservas_mesa_fk` FOREIGN KEY (`mesa_id`) REFERENCES `mesas` (`id`) ON DELETE SET NULL,
  CONSTRAINT `reservas_usuario_fk` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
