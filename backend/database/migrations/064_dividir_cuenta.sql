-- Dividir la cuenta: cobrar un pedido en varias partes.
--
-- * pedido_pagos: cada cobro parcial de un pedido (por platos o en partes
--   iguales). Un pedido se considera pagado cuando la suma de sus pagos
--   completados alcanza el total. 'pendiente' es un QR por pagar.
-- * pedido_pago_items: qué platos (y cuántas unidades) cubre un pago hecho en
--   modo 'platos'; en modo 'iguales' no tiene filas.
-- * pedidos.pagado: lo cobrado hasta ahora; pedidos.metodo_pago suma 'mixto'
--   para cuando las partes se pagaron con métodos distintos.
-- * pagos_qr.pedido_pago_id: el pago parcial al que corresponde un QR.

CREATE TABLE `pedido_pagos` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `pedido_id` int(10) UNSIGNED NOT NULL,
  `usuario_id` int(10) UNSIGNED NOT NULL,
  `sesion_caja_id` int(10) UNSIGNED DEFAULT NULL,
  `metodo_pago` enum('efectivo','qr') NOT NULL,
  `monto` decimal(10,2) NOT NULL,
  `monto_recibido` decimal(10,2) DEFAULT NULL,
  `cambio` decimal(10,2) NOT NULL DEFAULT 0.00,
  `persona` varchar(80) DEFAULT NULL,
  `modo` enum('platos','iguales') NOT NULL,
  `estado` enum('pendiente','completado','anulado') NOT NULL DEFAULT 'completado',
  `creado_en` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `actualizado_en` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `pedido_pagos_pedido_idx` (`pedido_id`),
  CONSTRAINT `pedido_pagos_pedido_fk` FOREIGN KEY (`pedido_id`) REFERENCES `pedidos` (`id`) ON DELETE CASCADE,
  CONSTRAINT `pedido_pagos_usuario_fk` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`),
  CONSTRAINT `pedido_pagos_sesion_fk` FOREIGN KEY (`sesion_caja_id`) REFERENCES `sesiones_caja` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `pedido_pago_items` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `pedido_pago_id` int(10) UNSIGNED NOT NULL,
  `detalle_pedido_id` int(10) UNSIGNED NOT NULL,
  `cantidad` int(11) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `pedido_pago_items_pago_idx` (`pedido_pago_id`),
  KEY `pedido_pago_items_detalle_idx` (`detalle_pedido_id`),
  CONSTRAINT `pedido_pago_items_pago_fk` FOREIGN KEY (`pedido_pago_id`) REFERENCES `pedido_pagos` (`id`) ON DELETE CASCADE,
  CONSTRAINT `pedido_pago_items_detalle_fk` FOREIGN KEY (`detalle_pedido_id`) REFERENCES `detalle_pedidos` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `pedidos`
  ADD COLUMN `pagado` decimal(10,2) NOT NULL DEFAULT 0.00,
  MODIFY COLUMN `metodo_pago` enum('efectivo','qr','app_externa','mixto') NOT NULL DEFAULT 'efectivo';

ALTER TABLE `pagos_qr`
  ADD COLUMN `pedido_pago_id` int(10) UNSIGNED DEFAULT NULL,
  ADD CONSTRAINT `pagos_qr_pedido_pago_fk` FOREIGN KEY (`pedido_pago_id`) REFERENCES `pedido_pagos` (`id`) ON DELETE SET NULL;
