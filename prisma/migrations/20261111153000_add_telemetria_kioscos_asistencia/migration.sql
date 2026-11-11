-- Telemetría que la tablet reporta al activarse y en el latido.
-- Mismo procedimiento que el resto de cambios de kiosco en esta rama:
-- aplicar este SQL a mano. No usar `prisma db pull`.
-- Las tablas de kiosco no nacieron en prisma/migrations; los ALTER posteriores
-- (teléfono, revisión y este) se versionan aquí y se ejecutan directo en MySQL.
ALTER TABLE `KioscosAsistencia`
  ADD COLUMN `plataforma` VARCHAR(20) NULL AFTER `ultimoLatido`,
  ADD COLUMN `modelo` VARCHAR(120) NULL AFTER `plataforma`,
  ADD COLUMN `versionApp` VARCHAR(20) NULL AFTER `modelo`,
  ADD COLUMN `pendientesReportados` INT NOT NULL DEFAULT 0 AFTER `versionApp`;
