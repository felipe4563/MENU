-- Partes iguales: cada parte guarda cuál era y en cuántas se dividió la
-- cuenta, para que su comprobante diga "Parte 2 de 4". NULL en las partes
-- por platos y en las cobradas antes de este cambio.

ALTER TABLE `pedido_pagos`
  ADD COLUMN `parte_numero` tinyint(3) UNSIGNED DEFAULT NULL AFTER `modo`,
  ADD COLUMN `partes_de` tinyint(3) UNSIGNED DEFAULT NULL AFTER `parte_numero`;
