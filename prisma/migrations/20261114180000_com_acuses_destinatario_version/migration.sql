-- CA7. Un acuse por destinatario y versión vigente.
-- Sin este índice, dos confirmaciones simultáneas dejarían dos evidencias.
-- Aplicar a mano, igual que las migraciones del kiosco. No usar `prisma db pull`.
--
--   mysql -h <host> -u <user> -p <base> < prisma/migrations/20261114180000_com_acuses_destinatario_version/migration.sql

CREATE UNIQUE INDEX `UK_ComAcuses_Dest_Version` ON `ComAcuses`(`idDestinatario`, `idVersion`);
