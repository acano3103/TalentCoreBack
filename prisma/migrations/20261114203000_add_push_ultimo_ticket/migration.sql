-- CA6: el recibo de Expo identifica el ticket, no el token.
-- UltimoTicket liga el ticket con el dispositivo para darlo de baja si ya no está registrado.
-- Aplicar a mano en MySQL. No usar `prisma db pull`.
-- SHOW COLUMNS FROM PushTokens LIKE 'UltimoTicket';

ALTER TABLE `PushTokens`
  ADD COLUMN `UltimoTicket` VARCHAR(80) NULL AFTER `MotivoBaja`;

CREATE INDEX `IDX_PushTokens_UltimoTicket` ON `PushTokens` (`UltimoTicket`);

-- Canales que el dispatcher de comunicados busca por código.
INSERT INTO `CatCanalesNotificaciones` (`code`, `description`, `activo`)
SELECT 'PUSH', 'Notificación push Expo', 1
WHERE NOT EXISTS (SELECT 1 FROM `CatCanalesNotificaciones` WHERE `code` = 'PUSH');

INSERT INTO `CatCanalesNotificaciones` (`code`, `description`, `activo`)
SELECT 'KIOSCO', 'Consulta en kiosco', 1
WHERE NOT EXISTS (SELECT 1 FROM `CatCanalesNotificaciones` WHERE `code` = 'KIOSCO');
