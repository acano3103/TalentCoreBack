-- Índice para armar me/comms-capabilities con una búsqueda por usuario, sin recorrer RelUsuarioRol.
-- Aplicar a mano en MySQL, solo si el índice todavía no existe:
-- SHOW INDEX FROM RelUsuarioRol WHERE Key_name = 'IDX_RelUsuarioRol_Usuario_Activo';
-- No usar `prisma db pull`.
CREATE INDEX `IDX_RelUsuarioRol_Usuario_Activo` ON `RelUsuarioRol`(`idUsuario`, `activo`);
