-- Compras pagadas con efectivo de la caja abierta.
--
-- * compras.proveedor_id pasa a ser opcional: una compra "al paso" (verduras
--   del mercado, gas) no tiene un proveedor registrado.
-- * compras.sesion_caja_id: la sesión de caja de la que salió la plata
--   (NULL = se pagó por fuera de la caja, como hasta ahora).
-- * gastos.compra_id y libro_caja.compra_id: el gasto del turno y el egreso
--   del libro de caja que corresponden a una compra. Finanzas usa
--   libro_caja.compra_id para no contar la compra dos veces (una como compra
--   y otra como gasto operativo).

ALTER TABLE `compras`
  MODIFY `proveedor_id` int(10) UNSIGNED DEFAULT NULL,
  ADD COLUMN `sesion_caja_id` int(10) UNSIGNED DEFAULT NULL AFTER `usuario_id`,
  ADD CONSTRAINT `compras_sesion_caja_fk` FOREIGN KEY (`sesion_caja_id`) REFERENCES `sesiones_caja` (`id`) ON DELETE SET NULL;

ALTER TABLE `gastos`
  ADD COLUMN `compra_id` int(10) UNSIGNED DEFAULT NULL,
  ADD CONSTRAINT `gastos_compra_fk` FOREIGN KEY (`compra_id`) REFERENCES `compras` (`id`) ON DELETE SET NULL;

ALTER TABLE `libro_caja`
  ADD COLUMN `compra_id` int(10) UNSIGNED DEFAULT NULL,
  ADD CONSTRAINT `libro_caja_compra_fk` FOREIGN KEY (`compra_id`) REFERENCES `compras` (`id`) ON DELETE SET NULL;

-- Los egresos que ya generó "Recibir compra" se reconocen por su concepto
-- ("Compra #12 - Proveedor").
UPDATE `libro_caja` l
  JOIN `compras` c ON c.id = CAST(SUBSTRING_INDEX(SUBSTRING(l.concepto, 9), ' ', 1) AS UNSIGNED)
  SET l.compra_id = c.id
  WHERE l.tipo = 'egreso' AND l.sesion_caja_id IS NULL AND l.concepto LIKE 'Compra #%';
