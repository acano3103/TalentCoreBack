-- CreateTable
CREATE TABLE `AsignacionAprobador` (
    `idAsignacionAprobador` INTEGER NOT NULL AUTO_INCREMENT,
    `idRolAprobador` INTEGER NOT NULL,
    `idArea` INTEGER NULL,
    `idUsuario` INTEGER NOT NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,

    INDEX `idx_AsignacionAprobador_RolAprobador`(`idRolAprobador`),
    INDEX `idx_AsignacionAprobador_Area`(`idArea`),
    INDEX `idx_AsignacionAprobador_Usuario`(`idUsuario`),
    PRIMARY KEY (`idAsignacionAprobador`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `AsignacionAprobador` ADD CONSTRAINT `FK_AsignacionAprobador_RolAprobador` FOREIGN KEY (`idRolAprobador`) REFERENCES `CatRolAprobador`(`idRolAprobador`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AsignacionAprobador` ADD CONSTRAINT `FK_AsignacionAprobador_Area` FOREIGN KEY (`idArea`) REFERENCES `CatAreas`(`idArea`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AsignacionAprobador` ADD CONSTRAINT `FK_AsignacionAprobador_Usuario` FOREIGN KEY (`idUsuario`) REFERENCES `auth_user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
