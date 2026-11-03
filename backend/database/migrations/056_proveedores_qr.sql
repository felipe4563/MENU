-- backend/database/migrations/056_proveedores_qr.sql
-- Cobro con QR con tres proveedores a elegir desde Ajustes:
--   codepay: el de siempre (credenciales en variables de entorno).
--   propio:  imagen del QR del banco del negocio; el cajero confirma a mano.
--   baneco:  API QR Connect de Banco Económico (QR dinámico por pedido).

ALTER TABLE pagos_qr
  ADD COLUMN proveedor ENUM('codepay','baneco','propio') NOT NULL DEFAULT 'codepay' AFTER sucursal_id;

-- pedidos.qr_tipo / qr_confirmado_por: algunas bases de desarrollo viejas ya
-- las tienen y las instalaciones desde el volcado no; MySQL 8 no tiene
-- ADD COLUMN IF NOT EXISTS, así que se decide con information_schema.
SET @hay_qr_tipo := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'pedidos' AND column_name = 'qr_tipo');
SET @sql := IF(@hay_qr_tipo = 0,
  "ALTER TABLE pedidos ADD COLUMN qr_tipo ENUM('codepay','manual','baneco') NULL DEFAULT NULL",
  "ALTER TABLE pedidos MODIFY COLUMN qr_tipo ENUM('codepay','manual','baneco') NULL DEFAULT NULL");
PREPARE paso FROM @sql;
EXECUTE paso;
DEALLOCATE PREPARE paso;

SET @hay_confirmado := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'pedidos' AND column_name = 'qr_confirmado_por');
SET @sql := IF(@hay_confirmado = 0,
  'ALTER TABLE pedidos ADD COLUMN qr_confirmado_por INT UNSIGNED NULL DEFAULT NULL, ADD CONSTRAINT fk_pedidos_qr_confirmado_por FOREIGN KEY (qr_confirmado_por) REFERENCES usuarios (id) ON DELETE SET NULL',
  'SELECT 1');
PREPARE paso FROM @sql;
EXECUTE paso;
DEALLOCATE PREPARE paso;

INSERT IGNORE INTO configuraciones (clave, valor) VALUES
  ('qr_proveedor', 'codepay'),
  ('qr_propio_imagen', ''),
  ('baneco_url', 'https://apimktdesa.baneco.com.bo/ApiGateway'),
  ('baneco_usuario', ''),
  ('baneco_password', ''),
  ('baneco_aes_key', ''),
  ('baneco_cuenta', ''),
  ('baneco_sucursal', '');
