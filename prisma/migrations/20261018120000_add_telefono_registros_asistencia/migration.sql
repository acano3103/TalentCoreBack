ALTER TABLE `RegistrosAsistencia`
  ADD COLUMN `telefonoOrigen` VARCHAR(20) NULL AFTER `canal`,
  ADD COLUMN `telefonoDestino` VARCHAR(20) NULL AFTER `telefonoOrigen`,
  ADD INDEX `IDX_Registros_TelefonoOrigen` (`telefonoOrigen`);
