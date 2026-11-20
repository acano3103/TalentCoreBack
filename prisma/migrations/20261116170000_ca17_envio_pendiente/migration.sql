-- CA17: un envío que no pudo encolarse queda en ENVIANDO y se reintenta.
-- EnvioPendienteDesde marca desde cuándo espera la cola, para no reencolar
-- un intento que acaba de fallar.
ALTER TABLE `ComComunicados`
    ADD COLUMN `EnvioPendiente` BOOLEAN NOT NULL DEFAULT 0,
    ADD COLUMN `EnvioPendienteDesde` DATETIME(0) NULL;
