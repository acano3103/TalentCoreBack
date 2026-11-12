-- Datos de la checada que se guardan junto con la incidencia.
-- KB1 los describía para RegistrosKioscoPorIdentificar y no estaban en el esquema.
-- Mismo procedimiento que el resto de cambios de kiosco en esta rama:
-- aplicar este SQL a mano. No usar `prisma db pull`.
ALTER TABLE `RegistrosKioscoPorIdentificar`
  ADD COLUMN `metodoIdentificacion` VARCHAR(30) NULL AFTER `uuidCliente`,
  ADD COLUMN `esOffline` TINYINT(1) NOT NULL DEFAULT 0 AFTER `metodoIdentificacion`,
  ADD COLUMN `desfaseRelojSegundos` INT NULL AFTER `esOffline`;
