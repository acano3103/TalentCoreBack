-- CA15: destino lógico de la notificación y alineación de recordatorios de asistencia.
-- DeepLink se conserva. Destino lo usan los clientes: { tipo, id?, params? }.
ALTER TABLE `Notificaciones`
    ADD COLUMN `Destino` JSON NULL;

-- Renumera en este orden para no chocar con UK_ComReglasRecordatorio_Emp_Codigo
-- ni aplicar dos veces el mismo prefijo: R1 → R12, R2 → R1, R3 → R2.
-- R1 pasa a ser «falta checar entrada», R2 «olvidó checar salida» y el aviso
-- previo a la entrada queda en R12. R3 (resumen al jefe) se crea después, apagado.
UPDATE `ComReglasRecordatorio` SET `Codigo` = 'R12' WHERE `Codigo` = 'R1';
UPDATE `ComReglasRecordatorio` SET `Codigo` = 'R1' WHERE `Codigo` = 'R2';
UPDATE `ComReglasRecordatorio` SET `Codigo` = 'R2' WHERE `Codigo` = 'R3';

UPDATE `ComRecordatoriosEnviados` SET `Codigo` = 'R12' WHERE `Codigo` = 'R1';
UPDATE `ComRecordatoriosEnviados` SET `Codigo` = 'R1' WHERE `Codigo` = 'R2';
UPDATE `ComRecordatoriosEnviados` SET `Codigo` = 'R2' WHERE `Codigo` = 'R3';

-- OrigenId es `R1:referencia`. R10, R11 y R12 no deben entrar en el prefijo R1.
UPDATE `Notificaciones`
SET `OrigenId` = CONCAT('R12:', SUBSTRING(`OrigenId`, 4))
WHERE `OrigenTipo` = 'RECORDATORIO'
  AND `OrigenId` LIKE 'R1:%'
  AND `OrigenId` NOT LIKE 'R10:%'
  AND `OrigenId` NOT LIKE 'R11:%'
  AND `OrigenId` NOT LIKE 'R12:%';

UPDATE `Notificaciones`
SET `OrigenId` = CONCAT('R1:', SUBSTRING(`OrigenId`, 4))
WHERE `OrigenTipo` = 'RECORDATORIO'
  AND `OrigenId` LIKE 'R2:%';

UPDATE `Notificaciones`
SET `OrigenId` = CONCAT('R2:', SUBSTRING(`OrigenId`, 4))
WHERE `OrigenTipo` = 'RECORDATORIO'
  AND `OrigenId` LIKE 'R3:%';
