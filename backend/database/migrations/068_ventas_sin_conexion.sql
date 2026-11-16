-- Ventas hechas sin internet (efectivo, para llevar) que la caja guarda en
-- el navegador y sube cuando vuelve la conexión.
-- clave_offline: id que arma el navegador; si la misma venta llega dos veces
-- (se cortó la respuesta y se reintentó) el servidor devuelve la que ya tiene.
-- sin_conexion: 1 si la venta se hizo sin internet y se subió después.

ALTER TABLE `pedidos`
  ADD COLUMN `clave_offline` varchar(40) DEFAULT NULL AFTER `notas`,
  ADD COLUMN `sin_conexion` tinyint(1) NOT NULL DEFAULT 0 AFTER `clave_offline`,
  ADD UNIQUE KEY `uq_pedidos_clave_offline` (`clave_offline`);
