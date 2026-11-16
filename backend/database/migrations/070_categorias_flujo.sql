-- Categorías del flujo de caja (luz, agua, internet, sueldos…) editables desde
-- Finanzas › Flujo de caja. Antes estaban fijas en el código. `clave` es lo que
-- guarda libro_caja.categoria y no cambia al renombrar. `sistema`: las que el
-- flujo necesita (ventas, compras, traspasos…), no se borran ni cambian de grupo.
-- `auto`: las llena el sistema, no se eligen al anotar.

CREATE TABLE IF NOT EXISTS `categorias_flujo` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `clave` varchar(40) NOT NULL,
  `nombre` varchar(60) NOT NULL,
  `grupo` varchar(20) NOT NULL,
  `ayuda` varchar(120) DEFAULT NULL,
  `pide_persona` tinyint(1) NOT NULL DEFAULT 0,
  `auto` tinyint(1) NOT NULL DEFAULT 0,
  `sistema` tinyint(1) NOT NULL DEFAULT 0,
  `activo` tinyint(1) NOT NULL DEFAULT 1,
  `orden` int(11) NOT NULL DEFAULT 0,
  `creado_en` datetime NOT NULL DEFAULT current_timestamp(),
  `actualizado_en` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_categorias_flujo_clave` (`clave`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO `categorias_flujo` (`clave`, `nombre`, `grupo`, `ayuda`, `pide_persona`, `auto`, `sistema`, `orden`) VALUES
  ('ventas', 'Ventas', 'ingresos', NULL, 0, 1, 1, 10),
  ('inyeccion', 'Inyección de efectivo', 'ingresos', 'Plata que pone el dueño o un préstamo', 0, 0, 0, 20),
  ('otro_ingreso', 'Otros ingresos', 'ingresos', NULL, 0, 0, 1, 900),
  ('compras', 'Compras de insumos y bebidas', 'costo_variable', NULL, 0, 1, 1, 10),
  ('materia_prima', 'Compras al paso (sin registrar en Compras)', 'costo_variable', 'Mercado, sin pasar por Inventario › Compras', 0, 0, 0, 20),
  ('sueldos', 'Sueldos y mano de obra', 'costo_fijo', 'En el detalle va el nombre de la persona', 1, 0, 0, 10),
  ('bonos', 'Bonos y extras', 'costo_fijo', NULL, 1, 0, 0, 20),
  ('luz', 'Electricidad', 'costo_fijo', NULL, 0, 0, 0, 30),
  ('gas', 'Gas', 'costo_fijo', NULL, 0, 0, 0, 40),
  ('agua', 'Agua', 'costo_fijo', NULL, 0, 0, 0, 50),
  ('internet', 'Internet y teléfono', 'costo_fijo', NULL, 0, 0, 0, 60),
  ('alquiler', 'Alquiler', 'costo_fijo', NULL, 0, 0, 0, 70),
  ('emergencia', 'Emergencias', 'costo_fijo', NULL, 0, 0, 0, 80),
  ('gastos_caja', 'Gastos de caja', 'otros_gastos', NULL, 0, 1, 1, 10),
  ('limpieza', 'Limpieza y desechables', 'otros_gastos', NULL, 0, 0, 0, 20),
  ('combustible', 'Combustible', 'otros_gastos', NULL, 0, 0, 0, 30),
  ('mantenimiento', 'Mantenimiento', 'otros_gastos', NULL, 0, 0, 0, 40),
  ('pasanaku', 'Pasanaku', 'otros_gastos', NULL, 0, 0, 0, 50),
  ('banco', 'Banco y comisiones', 'otros_gastos', NULL, 0, 0, 0, 60),
  ('viveres', 'Víveres de casa', 'otros_gastos', NULL, 0, 0, 0, 70),
  ('devoluciones', 'Devoluciones a clientes', 'otros_gastos', NULL, 0, 1, 1, 80),
  ('otro_gasto', 'Otros gastos', 'otros_gastos', NULL, 0, 0, 1, 900),
  ('asociacion', 'Gastos de asociación', 'no_operativo', NULL, 0, 0, 0, 10),
  ('retiro', 'Retiro y uso familiar', 'no_operativo', NULL, 0, 0, 0, 20),
  ('traspaso', 'Traspaso', 'traspaso', NULL, 0, 0, 1, 10),
  ('ajuste', 'Saldo inicial o ajuste', 'ajuste', 'Para cargar con cuánto se empieza o corregir una diferencia', 0, 0, 1, 10);
