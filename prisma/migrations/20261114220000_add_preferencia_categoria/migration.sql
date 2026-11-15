-- CA8: la matriz de preferencias es categoría × canal.
-- Se agrega la columna. No se renombra ni se borra ninguna.
-- El índice único anterior (user_uuid, channel_id) solo permitía un canal por persona;
-- se sustituye por (user_uuid, channel_id, categoria).
-- Las filas con categoria NULL son las del dispatcher anterior y él las sigue leyendo así.
-- MySQL trata NULL como distinto en el índice único, así que esas filas pueden repetirse.
-- La matriz nueva no escribe NULL: busca la fila de su categoría y hace update o create por id.
-- Aplicar a mano en MySQL. No usar `prisma db pull`.
-- SHOW INDEX FROM PreferenciasNotificacionesUsuario WHERE Key_name = 'user_uuid';
-- SHOW COLUMNS FROM PreferenciasNotificacionesUsuario LIKE 'categoria';

ALTER TABLE `PreferenciasNotificacionesUsuario`
    ADD COLUMN `categoria` VARCHAR(30) NULL AFTER `channel_id`;

ALTER TABLE `PreferenciasNotificacionesUsuario`
    DROP INDEX `user_uuid`;

CREATE UNIQUE INDEX `UK_PrefNotif_Usuario_Canal_Cat`
    ON `PreferenciasNotificacionesUsuario` (`user_uuid`, `channel_id`, `categoria`);
