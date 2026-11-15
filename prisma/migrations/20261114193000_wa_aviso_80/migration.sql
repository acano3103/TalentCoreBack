-- El aviso del 80 % se marca en el tope, una vez por mes. No se reescriben precios ni WaConsumo.
ALTER TABLE `WaTopes`
    ADD COLUMN `Aviso80Mes` CHAR(7) NULL;
