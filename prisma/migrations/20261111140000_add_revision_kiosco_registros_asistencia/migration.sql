ALTER TABLE `RegistrosAsistencia`
  ADD COLUMN `metodoIdentificacion` VARCHAR(30) NULL AFTER `numeroEmpleadoCapturado`,
  ADD COLUMN `rostroDetectado` TINYINT(1) NULL AFTER `metodoIdentificacion`,
  ADD COLUMN `deteccionRostroActiva` TINYINT(1) NULL AFTER `rostroDetectado`,
  ADD COLUMN `requiereRevision` TINYINT(1) NOT NULL DEFAULT 0 AFTER `deteccionRostroActiva`,
  ADD COLUMN `banderasRevision` JSON NULL AFTER `requiereRevision`;
