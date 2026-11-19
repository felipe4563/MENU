-- Reservas con platos y adelanto: la reserva puede llevar platos anotados
-- (reserva_items, con el precio y el nombre congelados al anotar) y plata
-- adelantada (reserva_pagos: adelanto o devolución). Al llegar (o un rato
-- antes) la reserva se vuelve un pedido (reservas.pedido_id) y el adelanto
-- cuenta como pago de ese pedido (pedido_pagos.modo = 'adelanto').
-- envio_cocina: cuándo se manda a cocina (al_llegar, antes, manual).
-- destino_adelanto: qué pasó con el adelanto si no se usó (retenido, devuelto).

CREATE TABLE IF NOT EXISTS `reserva_items` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `reserva_id` int unsigned NOT NULL,
  `producto_id` int unsigned DEFAULT NULL,
  `combo_id` int unsigned DEFAULT NULL,
  `cantidad` int unsigned NOT NULL DEFAULT 1,
  `peso` decimal(10,3) DEFAULT NULL,
  `nota` varchar(255) DEFAULT NULL,
  `opcion_ids` json DEFAULT NULL,
  `opciones_por_producto` json DEFAULT NULL,
  `precio` decimal(10,2) NOT NULL,
  `nombre` varchar(150) NOT NULL,
  `creado_en` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `actualizado_en` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `reserva_items_reserva_idx` (`reserva_id`),
  KEY `reserva_items_producto_fk` (`producto_id`),
  KEY `reserva_items_combo_fk` (`combo_id`),
  CONSTRAINT `reserva_items_reserva_fk` FOREIGN KEY (`reserva_id`) REFERENCES `reservas` (`id`) ON DELETE CASCADE,
  CONSTRAINT `reserva_items_producto_fk` FOREIGN KEY (`producto_id`) REFERENCES `productos` (`id`),
  CONSTRAINT `reserva_items_combo_fk` FOREIGN KEY (`combo_id`) REFERENCES `combos` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `reserva_pagos` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `reserva_id` int unsigned NOT NULL,
  `usuario_id` int unsigned NOT NULL,
  `sesion_caja_id` int unsigned DEFAULT NULL,
  `tipo` enum('adelanto','devolucion') NOT NULL,
  `metodo_pago` enum('efectivo','qr') NOT NULL,
  `monto` decimal(10,2) NOT NULL,
  `monto_recibido` decimal(10,2) DEFAULT NULL,
  `cambio` decimal(10,2) NOT NULL DEFAULT 0.00,
  `estado` enum('completado','anulado') NOT NULL DEFAULT 'completado',
  `creado_en` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `actualizado_en` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `reserva_pagos_reserva_idx` (`reserva_id`),
  KEY `reserva_pagos_usuario_fk` (`usuario_id`),
  KEY `reserva_pagos_sesion_fk` (`sesion_caja_id`),
  CONSTRAINT `reserva_pagos_reserva_fk` FOREIGN KEY (`reserva_id`) REFERENCES `reservas` (`id`) ON DELETE CASCADE,
  CONSTRAINT `reserva_pagos_usuario_fk` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`),
  CONSTRAINT `reserva_pagos_sesion_fk` FOREIGN KEY (`sesion_caja_id`) REFERENCES `sesiones_caja` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `reservas`
  ADD COLUMN `pedido_id` int unsigned DEFAULT NULL AFTER `estado`,
  ADD COLUMN `envio_cocina` enum('al_llegar','antes','manual') DEFAULT NULL AFTER `pedido_id`,
  ADD COLUMN `enviada_cocina_en` datetime DEFAULT NULL AFTER `envio_cocina`,
  ADD COLUMN `destino_adelanto` enum('retenido','devuelto') DEFAULT NULL AFTER `enviada_cocina_en`,
  ADD COLUMN `aviso_no_vino_en` datetime DEFAULT NULL AFTER `destino_adelanto`,
  ADD KEY `reservas_pedido_fk` (`pedido_id`),
  ADD CONSTRAINT `reservas_pedido_fk` FOREIGN KEY (`pedido_id`) REFERENCES `pedidos` (`id`) ON DELETE SET NULL;

ALTER TABLE `pedido_pagos`
  MODIFY COLUMN `modo` enum('platos','iguales','adelanto') NOT NULL;

INSERT IGNORE INTO `categorias_flujo` (`clave`, `nombre`, `grupo`, `ayuda`, `pide_persona`, `auto`, `sistema`, `orden`) VALUES
  ('adelantos_reserva', 'Adelantos de reservas', 'ingresos', NULL, 0, 1, 1, 15);
