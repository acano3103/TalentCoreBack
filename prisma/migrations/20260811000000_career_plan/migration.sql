-- AlterTable
ALTER TABLE `MovimientosInternos` ADD COLUMN `idPlanCarrera` INTEGER NULL;

-- CreateTable
CREATE TABLE `RelPuestoRuta` (
    `idRuta` INTEGER NOT NULL AUTO_INCREMENT,
    `idPuestoOrigen` INTEGER NOT NULL,
    `idPuestoDestino` INTEGER NOT NULL,
    `activo` BOOLEAN NULL DEFAULT true,
    `fechaRegistro` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `usuarioRegistro` VARCHAR(45) NULL,

    INDEX `idx_ruta_destino`(`idPuestoDestino`),
    UNIQUE INDEX `unique_ruta_origen_destino`(`idPuestoOrigen`, `idPuestoDestino`),
    PRIMARY KEY (`idRuta`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PlanCarreraColaborador` (
    `idPlanCarrera` INTEGER NOT NULL AUTO_INCREMENT,
    `idEmpleado` INTEGER NOT NULL,
    `idRuta` INTEGER NOT NULL,
    `idPuestoActual` INTEGER NOT NULL,
    `idPuestoObjetivo` INTEGER NOT NULL,
    `estatus` ENUM('en_preparacion', 'listo_para_ascenso', 'promovido') NOT NULL DEFAULT 'en_preparacion',
    `fechaInscripcion` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `fechaPromocion` TIMESTAMP(0) NULL,
    `usuarioRegistro` VARCHAR(45) NULL,

    INDEX `idx_plan_ruta`(`idRuta`),
    UNIQUE INDEX `unique_empleado_ruta`(`idEmpleado`, `idRuta`),
    PRIMARY KEY (`idPlanCarrera`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ConfiguracionEmpresa` (
    `idConfiguracion` INTEGER NOT NULL AUTO_INCREMENT,
    `idEmpresa` INTEGER NOT NULL,
    `clave` VARCHAR(100) NOT NULL,
    `valor` VARCHAR(255) NULL,
    `activo` BOOLEAN NULL DEFAULT true,
    `fechaRegistro` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `usuarioRegistro` VARCHAR(45) NULL,

    INDEX `idx_config_empresa`(`idEmpresa`),
    UNIQUE INDEX `unique_empresa_clave`(`idEmpresa`, `clave`),
    PRIMARY KEY (`idConfiguracion`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
