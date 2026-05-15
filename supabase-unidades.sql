-- Ejecutar en Supabase antes de desplegar el codigo con unidades de medida.
-- Permite vender por unidad, kg, g, l o ml, y usar cantidades decimales.

ALTER TABLE productos
ADD COLUMN IF NOT EXISTS unidad_medida TEXT DEFAULT 'unidad';

UPDATE productos
SET unidad_medida = 'unidad'
WHERE unidad_medida IS NULL;

ALTER TABLE productos
ALTER COLUMN unidad_medida SET DEFAULT 'unidad';

ALTER TABLE productos
ALTER COLUMN stock TYPE numeric USING stock::numeric;

ALTER TABLE productos
ALTER COLUMN stock_min TYPE numeric USING stock_min::numeric;

ALTER TABLE venta_items
ADD COLUMN IF NOT EXISTS unidad_medida TEXT DEFAULT 'unidad';

UPDATE venta_items
SET unidad_medida = 'unidad'
WHERE unidad_medida IS NULL;

ALTER TABLE venta_items
ALTER COLUMN unidad_medida SET DEFAULT 'unidad';

ALTER TABLE venta_items
ALTER COLUMN cantidad TYPE numeric USING cantidad::numeric;

ALTER TABLE compra_items
ADD COLUMN IF NOT EXISTS unidad_medida TEXT DEFAULT 'unidad';

UPDATE compra_items
SET unidad_medida = 'unidad'
WHERE unidad_medida IS NULL;

ALTER TABLE compra_items
ALTER COLUMN unidad_medida SET DEFAULT 'unidad';

ALTER TABLE compra_items
ALTER COLUMN cantidad TYPE numeric USING cantidad::numeric;
