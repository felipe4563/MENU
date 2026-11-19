-- Notificaciones push: cada celular o computadora que las activa guarda acá
-- su suscripción (la da el navegador). Un dispositivo es de un usuario a la
-- vez: si otro inicia sesión en el mismo navegador, la suscripción pasa a él.
-- endpoint_hash (sha256 del endpoint) es la clave única: el endpoint es una
-- URL larga que no entra en un índice.
CREATE TABLE IF NOT EXISTS `push_suscripciones` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `usuario_id` int unsigned NOT NULL,
  `endpoint` text NOT NULL,
  `endpoint_hash` char(64) NOT NULL,
  `p256dh` varchar(255) NOT NULL,
  `auth` varchar(255) NOT NULL,
  `dispositivo` varchar(120) DEFAULT NULL,
  `creado_en` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `actualizado_en` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `push_endpoint_unico` (`endpoint_hash`),
  KEY `push_usuario` (`usuario_id`),
  CONSTRAINT `push_suscripciones_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
