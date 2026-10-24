-- backend/database/migrations/055_devoluciones.sql
-- Anular productos y devoluciones: anulación parcial/total de ítems de un
-- pedido ya cobrado, con registro de la devolución de dinero. Ver spec en
-- docs/superpowers/specs/2026-10-23-anular-productos-design.md

-- sesiones_caja.cerrado_en usa DEFAULT '0000-00-00 00:00:00' (esquema viejo);
-- bajo sql_mode estricto cualquier ALTER de esa tabla falla (ver 016).
-- Se relaja para esta sesión y se restaura al final.
SET @old_sql_mode = @@SESSION.sql_mode;
SET SESSION sql_mode = '';

ALTER TABLE detalle_pedidos
  ADD COLUMN cantidad_anulada INT NOT NULL DEFAULT 0 AFTER cantidad;

ALTER TABLE pedidos
  ADD COLUMN total_devuelto DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER total;

ALTER TABLE sesiones_caja
  ADD COLUMN total_devoluciones DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER total_gastos;

CREATE TABLE devoluciones (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  pedido_id INT UNSIGNED NOT NULL,
  sesion_caja_id INT UNSIGNED NULL,
  usuario_id INT UNSIGNED NOT NULL,
  motivo ENUM('demora','error_pedido','cliente_arrepentido','producto_mal_estado','otro') NOT NULL,
  nota VARCHAR(255) NULL,
  monto DECIMAL(10,2) NOT NULL,
  forma ENUM('efectivo','transferencia','app','sin_dinero') NOT NULL,
  estado_transferencia ENUM('pendiente','hecha') NULL,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (pedido_id) REFERENCES pedidos(id),
  FOREIGN KEY (sesion_caja_id) REFERENCES sesiones_caja(id),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);

CREATE TABLE devolucion_items (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  devolucion_id INT UNSIGNED NOT NULL,
  detalle_pedido_id INT UNSIGNED NOT NULL,
  cantidad INT NOT NULL,
  monto DECIMAL(10,2) NOT NULL,
  vuelve_stock TINYINT(1) NOT NULL DEFAULT 0,
  FOREIGN KEY (devolucion_id) REFERENCES devoluciones(id),
  FOREIGN KEY (detalle_pedido_id) REFERENCES detalle_pedidos(id)
);

-- Permiso propio para anular productos; se asigna a todo rol que ya puede cobrar.
INSERT INTO permisos (modulo, accion, descripcion) VALUES
  ('ventas', 'anular', 'Anular productos de pedidos cobrados y registrar devoluciones');

INSERT INTO roles_permisos (rol_id, permiso_id)
SELECT rp.rol_id, pa.id
FROM roles_permisos rp
JOIN permisos pc ON pc.id = rp.permiso_id AND pc.modulo = 'ventas' AND pc.accion = 'cobrar'
JOIN permisos pa ON pa.modulo = 'ventas' AND pa.accion = 'anular';

SET SESSION sql_mode = @old_sql_mode;
