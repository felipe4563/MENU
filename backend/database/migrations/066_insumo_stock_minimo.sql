-- Stock mínimo de un insumo: cuando lo que queda en una sucursal llega a
-- este número, el dashboard avisa. NULL = sin mínimo (solo se avisa por el
-- ritmo de consumo, como antes). Se usa el mismo mínimo en cada sucursal.

ALTER TABLE `insumos`
  ADD COLUMN `stock_minimo` decimal(10,3) DEFAULT NULL AFTER `unidad_medida`;
