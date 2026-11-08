-- Cada caja con impresora Bluetooth decide si el ticket lleva el logo del
-- negocio. Sin logo el ticket sale más rápido y gasta menos papel.
ALTER TABLE cajas
  ADD COLUMN imprimir_logo TINYINT(1) NOT NULL DEFAULT 1 AFTER conexion_bluetooth;
