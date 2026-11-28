-- BC3: el pase de lista desde la app guarda un método distinto al QR público.
ALTER TABLE `CursoAsistencias`
    MODIFY COLUMN `metodoRegistro` ENUM('qr_autoatendido', 'manual_instructor', 'link_web', 'app_movil') NULL DEFAULT 'qr_autoatendido';
