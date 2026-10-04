-- backend/database/migrations/052_cierre_caja_ciego.sql
-- Cierre de caja: modo directo/ciego por sucursal, tolerancia configurable y
-- justificación obligatoria cuando la diferencia la supera. Ver spec en
-- docs/superpowers/specs/2026-10-04-cierre-caja-ciego-design.md

ALTER TABLE sucursales
  ADD COLUMN modo_cierre_caja ENUM('directo','ciego') NOT NULL DEFAULT 'directo' AFTER radio_geocerca_metros,
  ADD COLUMN tolerancia_cierre_caja DECIMAL(10,2) NOT NULL DEFAULT 10.00 AFTER modo_cierre_caja;

ALTER TABLE sesiones_caja
  ADD COLUMN nota_diferencia VARCHAR(255) NULL AFTER diferencia;
