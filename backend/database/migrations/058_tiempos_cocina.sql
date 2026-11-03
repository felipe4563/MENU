-- backend/database/migrations/058_tiempos_cocina.sql
-- Tiempo de cocina: desde que llega a cocina la primera comida de una ronda
-- hasta que la marcan lista. pedidos.cocina_desde es la ronda en curso;
-- cocina_tiempos guarda cada ronda terminada, para promedios y reportes.

ALTER TABLE pedidos
  ADD COLUMN cocina_desde DATETIME NULL DEFAULT NULL AFTER estado_cocina;

CREATE TABLE IF NOT EXISTS cocina_tiempos (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  pedido_id INT UNSIGNED NOT NULL,
  sucursal_id INT UNSIGNED NOT NULL,
  desde DATETIME NOT NULL,
  listo_en DATETIME NOT NULL,
  segundos INT UNSIGNED NOT NULL,
  KEY idx_cocina_tiempos_sucursal_listo (sucursal_id, listo_en),
  CONSTRAINT fk_cocina_tiempos_pedido FOREIGN KEY (pedido_id) REFERENCES pedidos (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
