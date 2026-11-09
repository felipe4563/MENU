-- Cuándo se le avisó al cliente (por correo) que su cupón está por vencer.
-- Así el aviso sale una sola vez por cupón.
ALTER TABLE cupones
  ADD COLUMN aviso_vencimiento_en DATETIME NULL AFTER usado_en;
