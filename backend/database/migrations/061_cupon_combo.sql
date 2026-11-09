-- Un cupón puede quedar amarrado a un combo (además de a productos, ver
-- cupon_productos): solo descuenta si ese combo está en la venta. Lo usa la
-- ruleta para el premio "combo gratis".
ALTER TABLE cupones
  ADD COLUMN combo_id INT UNSIGNED NULL AFTER cliente_id,
  ADD CONSTRAINT cupones_combo_fk FOREIGN KEY (combo_id) REFERENCES combos(id) ON DELETE SET NULL;

-- Cupones de la ruleta ya entregados: hasta ahora "producto gratis" y "combo
-- gratis" descontaban su precio de cualquier compra. Se amarran a su ítem.
INSERT INTO cupon_productos (cupon_id, producto_id)
SELECT g.cupon_id, p.producto_id
FROM ruleta_giros g
JOIN ruleta_premios p ON p.id = g.premio_id
LEFT JOIN cupon_productos cp ON cp.cupon_id = g.cupon_id
WHERE p.tipo = 'producto_gratis' AND g.cupon_id IS NOT NULL AND p.producto_id IS NOT NULL AND cp.cupon_id IS NULL;

UPDATE cupones c
JOIN ruleta_giros g ON g.cupon_id = c.id
JOIN ruleta_premios p ON p.id = g.premio_id
SET c.combo_id = p.combo_id
WHERE p.tipo = 'combo_gratis' AND p.combo_id IS NOT NULL;
