-- Analítica de un comunicado (KPIs por estado y desglose por ubicación)
-- sobre ComDestinatarios, sin recorrer Notificaciones.
-- Aplicar a mano en MySQL, solo si los índices todavía no existen:
-- SHOW INDEX FROM ComDestinatarios WHERE Key_name IN ('IDX_ComDestinatarios_Com_Estado', 'IDX_ComDestinatarios_Com_Site');
-- No usar `prisma db pull`.
CREATE INDEX `IDX_ComDestinatarios_Com_Estado` ON `ComDestinatarios`(`idComunicado`, `Estado`);
CREATE INDEX `IDX_ComDestinatarios_Com_Site` ON `ComDestinatarios`(`idComunicado`, `idSite`);
