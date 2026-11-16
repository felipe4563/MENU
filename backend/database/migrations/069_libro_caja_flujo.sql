-- Flujo de caja (Finanzas › Flujo de caja): cada movimiento del libro de caja
-- puede llevar una categoría (sueldos, luz, retiro del dueño…), un detalle
-- (a quién se pagó, qué se compró) y la fecha en que pasó (para anotar un
-- gasto de otro día). Los movimientos que no pasan por una caja guardan su
-- sucursal para el filtro por sucursal.

ALTER TABLE `libro_caja`
  ADD COLUMN `sucursal_id` int(10) unsigned DEFAULT NULL AFTER `sesion_caja_id`,
  ADD COLUMN `categoria` varchar(40) DEFAULT NULL AFTER `concepto`,
  ADD COLUMN `detalle` varchar(120) DEFAULT NULL AFTER `categoria`,
  ADD COLUMN `fecha` date DEFAULT NULL AFTER `detalle`,
  ADD KEY `idx_libro_caja_fecha` (`fecha`),
  ADD KEY `idx_libro_caja_creado` (`creado_en`);
