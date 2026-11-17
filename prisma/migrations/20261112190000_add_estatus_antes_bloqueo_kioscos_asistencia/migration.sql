-- Estatus que tenía el kiosco antes de bloquearlo; al desbloquear se restaura.
-- Lo agregó development (acano3103) en el schema sin migración. Mismo procedimiento
-- que el resto de cambios de kiosco: aplicar a mano en MySQL, solo si la columna
-- todavía no existe (SHOW COLUMNS FROM KioscosAsistencia LIKE 'estatusAntesBloqueo').
-- No usar `prisma db pull`.
ALTER TABLE `KioscosAsistencia`
  ADD COLUMN `estatusAntesBloqueo` VARCHAR(30) NULL AFTER `estatus`;
