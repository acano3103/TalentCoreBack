-- BR1 · Rutas de aprendizaje, constancias DC-3 y reporte DC-4.
-- Aplicar a mano. No usar `prisma db pull`.
-- El script es idempotente: se puede correr dos veces.
--
--   mysql -h <host> -u <user> -p <base> < prisma/migrations/20261125120000_br1_rutas_aprendizaje/migration.sql
--
-- CursoParticipantes no recibe fechaCompletado. La fecha de término ya la escribe
-- CourseLearningService en CursoSeguimientoParticipante.fechaConclusion.
-- estadoVigente es columna generada: NULL en versiones retiradas, para que
-- solo pueda haber una borrador y una publicada por ruta.
-- RutaElemento.idVersion copia la versión de la etapa y hace único el curso
-- dentro de esa versión. No tiene FK para no cruzar dos ON DELETE CASCADE.

CREATE TABLE IF NOT EXISTS `RutaAprendizaje` (
    `idRutaAprendizaje` INTEGER NOT NULL AUTO_INCREMENT,
    `idTenant` INTEGER NULL,
    `idEmpresa` INTEGER NOT NULL,
    `nombre` VARCHAR(200) NOT NULL,
    `descripcion` TEXT NULL,
    `proposito` ENUM('ingreso', 'puesto', 'promocion', 'cumplimiento') NOT NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `fechaRegistro` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `usuarioRegistro` VARCHAR(45) NULL,

    INDEX `idx_ruta_aprendizaje_empresa_nombre`(`idEmpresa`, `nombre`, `proposito`),
    INDEX `idx_ruta_aprendizaje_tenant`(`idTenant`),
    PRIMARY KEY (`idRutaAprendizaje`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `RutaVersion` (
    `idVersion` INTEGER NOT NULL AUTO_INCREMENT,
    `idRutaAprendizaje` INTEGER NOT NULL,
    `numero` INTEGER NOT NULL,
    `estado` ENUM('borrador', 'publicada', 'retirada') NOT NULL,
    `basadaEnVersion` INTEGER NULL,
    `publicadaEn` TIMESTAMP(0) NULL,
    `publicadaPor` VARCHAR(36) NULL,
    `notas` TEXT NULL,
    `estadoVigente` VARCHAR(20) GENERATED ALWAYS AS (
        CASE
            WHEN `estado` IN ('borrador', 'publicada') THEN CAST(`estado` AS CHAR(20))
            ELSE NULL
        END
    ) STORED,

    UNIQUE INDEX `uk_ruta_version_numero`(`idRutaAprendizaje`, `numero`),
    UNIQUE INDEX `uk_ruta_version_una_vigente`(`idRutaAprendizaje`, `estadoVigente`),
    INDEX `FK_RutaVersion_Base`(`basadaEnVersion`),
    PRIMARY KEY (`idVersion`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `RutaEtapa` (
    `idEtapa` INTEGER NOT NULL AUTO_INCREMENT,
    `idVersion` INTEGER NOT NULL,
    `nombre` VARCHAR(200) NOT NULL,
    `orden` INTEGER NOT NULL,
    `diaInicio` INTEGER NOT NULL,
    `diaFin` INTEGER NOT NULL,
    `requiereEtapaAnterior` BOOLEAN NOT NULL DEFAULT false,

    INDEX `idx_ruta_etapa_version_orden`(`idVersion`, `orden`),
    PRIMARY KEY (`idEtapa`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `RutaElemento` (
    `idElemento` INTEGER NOT NULL AUTO_INCREMENT,
    `idEtapa` INTEGER NOT NULL,
    `idVersion` INTEGER NOT NULL,
    `idCurso` INTEGER NOT NULL,
    `orden` INTEGER NOT NULL,
    `obligatorio` BOOLEAN NOT NULL DEFAULT true,
    `idElementoPrerrequisito` INTEGER NULL,
    `vigenciaMeses` INTEGER NULL,

    UNIQUE INDEX `uk_ruta_elemento_version_curso`(`idVersion`, `idCurso`),
    INDEX `idx_ruta_elemento_etapa_orden`(`idEtapa`, `orden`),
    INDEX `FK_RutaElemento_Curso`(`idCurso`),
    INDEX `FK_RutaElemento_Prerrequisito`(`idElementoPrerrequisito`),
    PRIMARY KEY (`idElemento`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `RutaAlcance` (
    `idAlcance` INTEGER NOT NULL AUTO_INCREMENT,
    `idVersion` INTEGER NOT NULL,
    `modo` ENUM('incluir', 'excluir') NOT NULL,
    `idUnidadOperativa` INTEGER NULL,
    `estado` VARCHAR(150) NULL,
    `idSite` INTEGER NULL,
    `idPuesto` INTEGER NULL,
    `idArea` INTEGER NULL,

    INDEX `idx_ruta_alcance_version`(`idVersion`),
    INDEX `FK_RutaAlcance_Unidad`(`idUnidadOperativa`),
    INDEX `FK_RutaAlcance_Site`(`idSite`),
    INDEX `FK_RutaAlcance_Puesto`(`idPuesto`),
    INDEX `FK_RutaAlcance_Area`(`idArea`),
    PRIMARY KEY (`idAlcance`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `RutaLote` (
    `idLote` INTEGER NOT NULL AUTO_INCREMENT,
    `idTenant` INTEGER NULL,
    `idEmpresa` INTEGER NOT NULL,
    `idRutaAprendizaje` INTEGER NOT NULL,
    `idVersion` INTEGER NOT NULL,
    `disparador` ENUM('publicacion', 'alta', 'movimiento', 'recertificacion', 'manual') NOT NULL,
    `descripcion` VARCHAR(255) NULL,
    `estatus` ENUM('por_aprobar', 'aprobado', 'rechazado', 'aplicado') NOT NULL,
    `personas` INTEGER NOT NULL DEFAULT 0,
    `cursos` INTEGER NOT NULL DEFAULT 0,
    `creadoEn` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `creadoPor` VARCHAR(36) NULL,
    `resueltoEn` TIMESTAMP(0) NULL,
    `resueltoPor` VARCHAR(36) NULL,
    `motivoRechazo` TEXT NULL,

    INDEX `idx_ruta_lote_empresa`(`idEmpresa`),
    INDEX `idx_ruta_lote_tenant`(`idTenant`),
    INDEX `FK_RutaLote_Ruta`(`idRutaAprendizaje`),
    INDEX `FK_RutaLote_Version`(`idVersion`),
    PRIMARY KEY (`idLote`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `RutaAsignacion` (
    `idAsignacion` INTEGER NOT NULL AUTO_INCREMENT,
    `idTenant` INTEGER NULL,
    `idEmpresa` INTEGER NOT NULL,
    `idEmpleado` INTEGER NOT NULL,
    `idRutaAprendizaje` INTEGER NOT NULL,
    `idVersion` INTEGER NOT NULL,
    `idLote` INTEGER NULL,
    `disparador` ENUM('publicacion', 'alta', 'movimiento', 'recertificacion', 'manual') NOT NULL,
    `estatus` ENUM('por_aprobar', 'activa', 'completada', 'sustituida', 'cancelada') NOT NULL,
    `fechaBase` DATE NOT NULL,
    `fechaAsignacion` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `fechaCompletada` TIMESTAMP(0) NULL,

    UNIQUE INDEX `uk_ruta_asignacion_empleado_version`(`idEmpleado`, `idVersion`),
    INDEX `idx_ruta_asignacion_empresa`(`idEmpresa`),
    INDEX `idx_ruta_asignacion_tenant`(`idTenant`),
    INDEX `FK_RutaAsignacion_Ruta`(`idRutaAprendizaje`),
    INDEX `FK_RutaAsignacion_Version`(`idVersion`),
    INDEX `FK_RutaAsignacion_Lote`(`idLote`),
    INDEX `FK_RutaAsignacion_Empleado`(`idEmpleado`),
    PRIMARY KEY (`idAsignacion`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `RutaAsignacionCurso` (
    `idAsignacionCurso` INTEGER NOT NULL AUTO_INCREMENT,
    `idAsignacion` INTEGER NOT NULL,
    `idElemento` INTEGER NOT NULL,
    `idCurso` INTEGER NOT NULL,
    `estado` ENUM('reconocido', 'inscrito', 'por_programar', 'completado', 'vencido', 'cancelado') NOT NULL,
    `idParticipante` INTEGER NULL,
    `fechaLimite` DATE NOT NULL,
    `fechaCompletado` DATETIME(0) NULL,
    `venceVigencia` DATE NULL,
    `reconocidoDeParticipante` INTEGER NULL,

    INDEX `idx_ruta_asignacion_curso_asignacion`(`idAsignacion`),
    INDEX `FK_RutaAsignacionCurso_Elemento`(`idElemento`),
    INDEX `FK_RutaAsignacionCurso_Curso`(`idCurso`),
    INDEX `FK_RutaAsignacionCurso_Participante`(`idParticipante`),
    INDEX `FK_RutaAsignacionCurso_Reconocido`(`reconocidoDeParticipante`),
    PRIMARY KEY (`idAsignacionCurso`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ReporteDc4` (
    `idReporteDc4` INTEGER NOT NULL AUTO_INCREMENT,
    `idTenant` INTEGER NULL,
    `idEmpresa` INTEGER NOT NULL,
    `idSite` INTEGER NOT NULL,
    `anio` INTEGER NOT NULL,
    `fechaCierreEtapa` DATE NOT NULL,
    `fechaLimite` DATE NOT NULL,
    `estatus` ENUM('borrador', 'presentado') NOT NULL DEFAULT 'borrador',
    `archivo` VARCHAR(500) NULL,
    `fechaPresentado` DATETIME(0) NULL,

    INDEX `idx_reporte_dc4_empresa_site_anio`(`idEmpresa`, `idSite`, `anio`),
    INDEX `FK_ReporteDc4_Site`(`idSite`),
    INDEX `idx_reporte_dc4_tenant`(`idTenant`),
    PRIMARY KEY (`idReporteDc4`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `CursoConstanciaDc3` (
    `idConstancia` INTEGER NOT NULL AUTO_INCREMENT,
    `idTenant` INTEGER NULL,
    `idEmpresa` INTEGER NOT NULL,
    `idParticipante` INTEGER NOT NULL,
    `idEmpleado` INTEGER NOT NULL,
    `idCurso` INTEGER NOT NULL,
    `fechaTerminoCurso` DATE NOT NULL,
    `fechaLimiteEntrega` DATE NOT NULL,
    `estatus` ENUM('pendiente', 'generada', 'entregada') NOT NULL DEFAULT 'pendiente',
    `fechaGenerada` DATETIME(0) NULL,
    `fechaEntregada` DATETIME(0) NULL,
    `archivo` VARCHAR(500) NULL,
    `idReporteDc4` INTEGER NULL,

    UNIQUE INDEX `uk_constancia_dc3_participante`(`idParticipante`),
    INDEX `idx_constancia_dc3_empresa`(`idEmpresa`),
    INDEX `idx_constancia_dc3_tenant`(`idTenant`),
    INDEX `FK_ConstanciaDc3_Empleado`(`idEmpleado`),
    INDEX `FK_ConstanciaDc3_Curso`(`idCurso`),
    INDEX `FK_ConstanciaDc3_ReporteDc4`(`idReporteDc4`),
    PRIMARY KEY (`idConstancia`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CatCursos
SET @col := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'CatCursos' AND COLUMN_NAME = 'esNormativoStps'
);
SET @sql := IF(@col = 0, 'ALTER TABLE `CatCursos` ADD COLUMN `esNormativoStps` BOOLEAN NOT NULL DEFAULT false', 'SET @br1_skip := 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'CatCursos' AND COLUMN_NAME = 'duracionHoras'
);
SET @sql := IF(@col = 0, 'ALTER TABLE `CatCursos` ADD COLUMN `duracionHoras` DECIMAL(5, 2) NULL', 'SET @br1_skip := 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'CatCursos' AND COLUMN_NAME = 'areaTematicaStps'
);
SET @sql := IF(@col = 0, 'ALTER TABLE `CatCursos` ADD COLUMN `areaTematicaStps` VARCHAR(10) NULL', 'SET @br1_skip := 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- CursoSesiones
SET @col := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'CursoSesiones' AND COLUMN_NAME = 'esPermanente'
);
SET @sql := IF(@col = 0, 'ALTER TABLE `CursoSesiones` ADD COLUMN `esPermanente` BOOLEAN NOT NULL DEFAULT false', 'SET @br1_skip := 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- CursoParticipantes.fechaLimite. Sin fechaCompletado: ver el comentario del encabezado.
SET @col := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'CursoParticipantes' AND COLUMN_NAME = 'fechaLimite'
);
SET @sql := IF(@col = 0, 'ALTER TABLE `CursoParticipantes` ADD COLUMN `fechaLimite` DATE NULL', 'SET @br1_skip := 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- RelPuestoRuta
SET @col := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'RelPuestoRuta' AND COLUMN_NAME = 'tipo'
);
SET @sql := IF(@col = 0, 'ALTER TABLE `RelPuestoRuta` ADD COLUMN `tipo` ENUM(''ascenso'', ''lateral'') NOT NULL DEFAULT ''ascenso''', 'SET @br1_skip := 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'RelPuestoRuta' AND COLUMN_NAME = 'antiguedadMinimaMeses'
);
SET @sql := IF(@col = 0, 'ALTER TABLE `RelPuestoRuta` ADD COLUMN `antiguedadMinimaMeses` INTEGER NULL', 'SET @br1_skip := 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'RelPuestoRuta' AND COLUMN_NAME = 'idRutaAprendizaje'
);
SET @sql := IF(@col = 0, 'ALTER TABLE `RelPuestoRuta` ADD COLUMN `idRutaAprendizaje` INTEGER NULL', 'SET @br1_skip := 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- PlanCarreraColaborador. Los estados anteriores conservan su significado.
ALTER TABLE `PlanCarreraColaborador`
    MODIFY `estatus` ENUM('en_preparacion', 'listo_para_ascenso', 'promovido', 'nominado', 'en_riesgo', 'cancelado') NOT NULL DEFAULT 'en_preparacion';

SET @col := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'PlanCarreraColaborador' AND COLUMN_NAME = 'origen'
);
SET @sql := IF(@col = 0, 'ALTER TABLE `PlanCarreraColaborador` ADD COLUMN `origen` ENUM(''rh'', ''jefe'') NOT NULL DEFAULT ''rh''', 'SET @br1_skip := 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'PlanCarreraColaborador' AND COLUMN_NAME = 'fechaListo'
);
SET @sql := IF(@col = 0, 'ALTER TABLE `PlanCarreraColaborador` ADD COLUMN `fechaListo` TIMESTAMP(0) NULL', 'SET @br1_skip := 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'PlanCarreraColaborador' AND COLUMN_NAME = 'fechaRiesgo'
);
SET @sql := IF(@col = 0, 'ALTER TABLE `PlanCarreraColaborador` ADD COLUMN `fechaRiesgo` TIMESTAMP(0) NULL', 'SET @br1_skip := 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'PlanCarreraColaborador' AND COLUMN_NAME = 'fechaLimiteRenovacion'
);
SET @sql := IF(@col = 0, 'ALTER TABLE `PlanCarreraColaborador` ADD COLUMN `fechaLimiteRenovacion` DATE NULL', 'SET @br1_skip := 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'PlanCarreraColaborador' AND COLUMN_NAME = 'idMovimiento'
);
SET @sql := IF(@col = 0, 'ALTER TABLE `PlanCarreraColaborador` ADD COLUMN `idMovimiento` INTEGER NULL', 'SET @br1_skip := 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'PlanCarreraColaborador' AND COLUMN_NAME = 'idVersionRuta'
);
SET @sql := IF(@col = 0, 'ALTER TABLE `PlanCarreraColaborador` ADD COLUMN `idVersionRuta` INTEGER NULL', 'SET @br1_skip := 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Foreign keys. CREATE TABLE IF NOT EXISTS no las vuelve a crear; este bloque sí se salta si ya existen.
SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'RutaAprendizaje' AND CONSTRAINT_NAME = 'FK_RutaAprendizaje_Empresa');
SET @sql := IF(@fk = 0, 'ALTER TABLE `RutaAprendizaje` ADD CONSTRAINT `FK_RutaAprendizaje_Empresa` FOREIGN KEY (`idEmpresa`) REFERENCES `CatEmpresas`(`idEmpresa`) ON DELETE NO ACTION ON UPDATE NO ACTION', 'SET @br1_skip := 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'RutaVersion' AND CONSTRAINT_NAME = 'FK_RutaVersion_Ruta');
SET @sql := IF(@fk = 0, 'ALTER TABLE `RutaVersion` ADD CONSTRAINT `FK_RutaVersion_Ruta` FOREIGN KEY (`idRutaAprendizaje`) REFERENCES `RutaAprendizaje`(`idRutaAprendizaje`) ON DELETE CASCADE ON UPDATE NO ACTION', 'SET @br1_skip := 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'RutaVersion' AND CONSTRAINT_NAME = 'FK_RutaVersion_Base');
SET @sql := IF(@fk = 0, 'ALTER TABLE `RutaVersion` ADD CONSTRAINT `FK_RutaVersion_Base` FOREIGN KEY (`basadaEnVersion`) REFERENCES `RutaVersion`(`idVersion`) ON DELETE SET NULL ON UPDATE NO ACTION', 'SET @br1_skip := 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'RutaEtapa' AND CONSTRAINT_NAME = 'FK_RutaEtapa_Version');
SET @sql := IF(@fk = 0, 'ALTER TABLE `RutaEtapa` ADD CONSTRAINT `FK_RutaEtapa_Version` FOREIGN KEY (`idVersion`) REFERENCES `RutaVersion`(`idVersion`) ON DELETE CASCADE ON UPDATE NO ACTION', 'SET @br1_skip := 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'RutaElemento' AND CONSTRAINT_NAME = 'FK_RutaElemento_Etapa');
SET @sql := IF(@fk = 0, 'ALTER TABLE `RutaElemento` ADD CONSTRAINT `FK_RutaElemento_Etapa` FOREIGN KEY (`idEtapa`) REFERENCES `RutaEtapa`(`idEtapa`) ON DELETE CASCADE ON UPDATE NO ACTION', 'SET @br1_skip := 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'RutaElemento' AND CONSTRAINT_NAME = 'FK_RutaElemento_Curso');
SET @sql := IF(@fk = 0, 'ALTER TABLE `RutaElemento` ADD CONSTRAINT `FK_RutaElemento_Curso` FOREIGN KEY (`idCurso`) REFERENCES `CatCursos`(`idCursos`) ON DELETE NO ACTION ON UPDATE NO ACTION', 'SET @br1_skip := 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'RutaElemento' AND CONSTRAINT_NAME = 'FK_RutaElemento_Prerrequisito');
SET @sql := IF(@fk = 0, 'ALTER TABLE `RutaElemento` ADD CONSTRAINT `FK_RutaElemento_Prerrequisito` FOREIGN KEY (`idElementoPrerrequisito`) REFERENCES `RutaElemento`(`idElemento`) ON DELETE SET NULL ON UPDATE NO ACTION', 'SET @br1_skip := 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'RutaAlcance' AND CONSTRAINT_NAME = 'FK_RutaAlcance_Version');
SET @sql := IF(@fk = 0, 'ALTER TABLE `RutaAlcance` ADD CONSTRAINT `FK_RutaAlcance_Version` FOREIGN KEY (`idVersion`) REFERENCES `RutaVersion`(`idVersion`) ON DELETE CASCADE ON UPDATE NO ACTION', 'SET @br1_skip := 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'RutaAlcance' AND CONSTRAINT_NAME = 'FK_RutaAlcance_Unidad');
SET @sql := IF(@fk = 0, 'ALTER TABLE `RutaAlcance` ADD CONSTRAINT `FK_RutaAlcance_Unidad` FOREIGN KEY (`idUnidadOperativa`) REFERENCES `CatUnidadesOperativas`(`idUnidadOperativa`) ON DELETE NO ACTION ON UPDATE NO ACTION', 'SET @br1_skip := 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'RutaAlcance' AND CONSTRAINT_NAME = 'FK_RutaAlcance_Site');
SET @sql := IF(@fk = 0, 'ALTER TABLE `RutaAlcance` ADD CONSTRAINT `FK_RutaAlcance_Site` FOREIGN KEY (`idSite`) REFERENCES `CatSites`(`idSite`) ON DELETE NO ACTION ON UPDATE NO ACTION', 'SET @br1_skip := 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'RutaAlcance' AND CONSTRAINT_NAME = 'FK_RutaAlcance_Puesto');
SET @sql := IF(@fk = 0, 'ALTER TABLE `RutaAlcance` ADD CONSTRAINT `FK_RutaAlcance_Puesto` FOREIGN KEY (`idPuesto`) REFERENCES `CatPuestos`(`idPuesto`) ON DELETE NO ACTION ON UPDATE NO ACTION', 'SET @br1_skip := 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'RutaAlcance' AND CONSTRAINT_NAME = 'FK_RutaAlcance_Area');
SET @sql := IF(@fk = 0, 'ALTER TABLE `RutaAlcance` ADD CONSTRAINT `FK_RutaAlcance_Area` FOREIGN KEY (`idArea`) REFERENCES `CatAreas`(`idArea`) ON DELETE NO ACTION ON UPDATE NO ACTION', 'SET @br1_skip := 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'RutaLote' AND CONSTRAINT_NAME = 'FK_RutaLote_Empresa');
SET @sql := IF(@fk = 0, 'ALTER TABLE `RutaLote` ADD CONSTRAINT `FK_RutaLote_Empresa` FOREIGN KEY (`idEmpresa`) REFERENCES `CatEmpresas`(`idEmpresa`) ON DELETE NO ACTION ON UPDATE NO ACTION', 'SET @br1_skip := 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'RutaLote' AND CONSTRAINT_NAME = 'FK_RutaLote_Ruta');
SET @sql := IF(@fk = 0, 'ALTER TABLE `RutaLote` ADD CONSTRAINT `FK_RutaLote_Ruta` FOREIGN KEY (`idRutaAprendizaje`) REFERENCES `RutaAprendizaje`(`idRutaAprendizaje`) ON DELETE NO ACTION ON UPDATE NO ACTION', 'SET @br1_skip := 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'RutaLote' AND CONSTRAINT_NAME = 'FK_RutaLote_Version');
SET @sql := IF(@fk = 0, 'ALTER TABLE `RutaLote` ADD CONSTRAINT `FK_RutaLote_Version` FOREIGN KEY (`idVersion`) REFERENCES `RutaVersion`(`idVersion`) ON DELETE NO ACTION ON UPDATE NO ACTION', 'SET @br1_skip := 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'RutaAsignacion' AND CONSTRAINT_NAME = 'FK_RutaAsignacion_Empresa');
SET @sql := IF(@fk = 0, 'ALTER TABLE `RutaAsignacion` ADD CONSTRAINT `FK_RutaAsignacion_Empresa` FOREIGN KEY (`idEmpresa`) REFERENCES `CatEmpresas`(`idEmpresa`) ON DELETE NO ACTION ON UPDATE NO ACTION', 'SET @br1_skip := 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'RutaAsignacion' AND CONSTRAINT_NAME = 'FK_RutaAsignacion_Empleado');
SET @sql := IF(@fk = 0, 'ALTER TABLE `RutaAsignacion` ADD CONSTRAINT `FK_RutaAsignacion_Empleado` FOREIGN KEY (`idEmpleado`) REFERENCES `Empleados`(`idEmpleado`) ON DELETE NO ACTION ON UPDATE NO ACTION', 'SET @br1_skip := 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'RutaAsignacion' AND CONSTRAINT_NAME = 'FK_RutaAsignacion_Ruta');
SET @sql := IF(@fk = 0, 'ALTER TABLE `RutaAsignacion` ADD CONSTRAINT `FK_RutaAsignacion_Ruta` FOREIGN KEY (`idRutaAprendizaje`) REFERENCES `RutaAprendizaje`(`idRutaAprendizaje`) ON DELETE NO ACTION ON UPDATE NO ACTION', 'SET @br1_skip := 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'RutaAsignacion' AND CONSTRAINT_NAME = 'FK_RutaAsignacion_Version');
SET @sql := IF(@fk = 0, 'ALTER TABLE `RutaAsignacion` ADD CONSTRAINT `FK_RutaAsignacion_Version` FOREIGN KEY (`idVersion`) REFERENCES `RutaVersion`(`idVersion`) ON DELETE NO ACTION ON UPDATE NO ACTION', 'SET @br1_skip := 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'RutaAsignacion' AND CONSTRAINT_NAME = 'FK_RutaAsignacion_Lote');
SET @sql := IF(@fk = 0, 'ALTER TABLE `RutaAsignacion` ADD CONSTRAINT `FK_RutaAsignacion_Lote` FOREIGN KEY (`idLote`) REFERENCES `RutaLote`(`idLote`) ON DELETE SET NULL ON UPDATE NO ACTION', 'SET @br1_skip := 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'RutaAsignacionCurso' AND CONSTRAINT_NAME = 'FK_RutaAsignacionCurso_Asignacion');
SET @sql := IF(@fk = 0, 'ALTER TABLE `RutaAsignacionCurso` ADD CONSTRAINT `FK_RutaAsignacionCurso_Asignacion` FOREIGN KEY (`idAsignacion`) REFERENCES `RutaAsignacion`(`idAsignacion`) ON DELETE CASCADE ON UPDATE NO ACTION', 'SET @br1_skip := 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'RutaAsignacionCurso' AND CONSTRAINT_NAME = 'FK_RutaAsignacionCurso_Elemento');
SET @sql := IF(@fk = 0, 'ALTER TABLE `RutaAsignacionCurso` ADD CONSTRAINT `FK_RutaAsignacionCurso_Elemento` FOREIGN KEY (`idElemento`) REFERENCES `RutaElemento`(`idElemento`) ON DELETE NO ACTION ON UPDATE NO ACTION', 'SET @br1_skip := 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'RutaAsignacionCurso' AND CONSTRAINT_NAME = 'FK_RutaAsignacionCurso_Curso');
SET @sql := IF(@fk = 0, 'ALTER TABLE `RutaAsignacionCurso` ADD CONSTRAINT `FK_RutaAsignacionCurso_Curso` FOREIGN KEY (`idCurso`) REFERENCES `CatCursos`(`idCursos`) ON DELETE NO ACTION ON UPDATE NO ACTION', 'SET @br1_skip := 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'RutaAsignacionCurso' AND CONSTRAINT_NAME = 'FK_RutaAsignacionCurso_Participante');
SET @sql := IF(@fk = 0, 'ALTER TABLE `RutaAsignacionCurso` ADD CONSTRAINT `FK_RutaAsignacionCurso_Participante` FOREIGN KEY (`idParticipante`) REFERENCES `CursoParticipantes`(`idParticipante`) ON DELETE SET NULL ON UPDATE NO ACTION', 'SET @br1_skip := 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'RutaAsignacionCurso' AND CONSTRAINT_NAME = 'FK_RutaAsignacionCurso_Reconocido');
SET @sql := IF(@fk = 0, 'ALTER TABLE `RutaAsignacionCurso` ADD CONSTRAINT `FK_RutaAsignacionCurso_Reconocido` FOREIGN KEY (`reconocidoDeParticipante`) REFERENCES `CursoParticipantes`(`idParticipante`) ON DELETE SET NULL ON UPDATE NO ACTION', 'SET @br1_skip := 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'ReporteDc4' AND CONSTRAINT_NAME = 'FK_ReporteDc4_Empresa');
SET @sql := IF(@fk = 0, 'ALTER TABLE `ReporteDc4` ADD CONSTRAINT `FK_ReporteDc4_Empresa` FOREIGN KEY (`idEmpresa`) REFERENCES `CatEmpresas`(`idEmpresa`) ON DELETE NO ACTION ON UPDATE NO ACTION', 'SET @br1_skip := 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'ReporteDc4' AND CONSTRAINT_NAME = 'FK_ReporteDc4_Site');
SET @sql := IF(@fk = 0, 'ALTER TABLE `ReporteDc4` ADD CONSTRAINT `FK_ReporteDc4_Site` FOREIGN KEY (`idSite`) REFERENCES `CatSites`(`idSite`) ON DELETE NO ACTION ON UPDATE NO ACTION', 'SET @br1_skip := 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'CursoConstanciaDc3' AND CONSTRAINT_NAME = 'FK_ConstanciaDc3_Empresa');
SET @sql := IF(@fk = 0, 'ALTER TABLE `CursoConstanciaDc3` ADD CONSTRAINT `FK_ConstanciaDc3_Empresa` FOREIGN KEY (`idEmpresa`) REFERENCES `CatEmpresas`(`idEmpresa`) ON DELETE NO ACTION ON UPDATE NO ACTION', 'SET @br1_skip := 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'CursoConstanciaDc3' AND CONSTRAINT_NAME = 'FK_ConstanciaDc3_Participante');
SET @sql := IF(@fk = 0, 'ALTER TABLE `CursoConstanciaDc3` ADD CONSTRAINT `FK_ConstanciaDc3_Participante` FOREIGN KEY (`idParticipante`) REFERENCES `CursoParticipantes`(`idParticipante`) ON DELETE NO ACTION ON UPDATE NO ACTION', 'SET @br1_skip := 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'CursoConstanciaDc3' AND CONSTRAINT_NAME = 'FK_ConstanciaDc3_Empleado');
SET @sql := IF(@fk = 0, 'ALTER TABLE `CursoConstanciaDc3` ADD CONSTRAINT `FK_ConstanciaDc3_Empleado` FOREIGN KEY (`idEmpleado`) REFERENCES `Empleados`(`idEmpleado`) ON DELETE NO ACTION ON UPDATE NO ACTION', 'SET @br1_skip := 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'CursoConstanciaDc3' AND CONSTRAINT_NAME = 'FK_ConstanciaDc3_Curso');
SET @sql := IF(@fk = 0, 'ALTER TABLE `CursoConstanciaDc3` ADD CONSTRAINT `FK_ConstanciaDc3_Curso` FOREIGN KEY (`idCurso`) REFERENCES `CatCursos`(`idCursos`) ON DELETE NO ACTION ON UPDATE NO ACTION', 'SET @br1_skip := 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'CursoConstanciaDc3' AND CONSTRAINT_NAME = 'FK_ConstanciaDc3_ReporteDc4');
SET @sql := IF(@fk = 0, 'ALTER TABLE `CursoConstanciaDc3` ADD CONSTRAINT `FK_ConstanciaDc3_ReporteDc4` FOREIGN KEY (`idReporteDc4`) REFERENCES `ReporteDc4`(`idReporteDc4`) ON DELETE SET NULL ON UPDATE NO ACTION', 'SET @br1_skip := 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'RelPuestoRuta' AND CONSTRAINT_NAME = 'FK_RelPuestoRuta_RutaAprendizaje');
SET @sql := IF(@fk = 0, 'ALTER TABLE `RelPuestoRuta` ADD CONSTRAINT `FK_RelPuestoRuta_RutaAprendizaje` FOREIGN KEY (`idRutaAprendizaje`) REFERENCES `RutaAprendizaje`(`idRutaAprendizaje`) ON DELETE SET NULL ON UPDATE NO ACTION', 'SET @br1_skip := 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'PlanCarreraColaborador' AND CONSTRAINT_NAME = 'FK_PlanCarrera_Movimiento');
SET @sql := IF(@fk = 0, 'ALTER TABLE `PlanCarreraColaborador` ADD CONSTRAINT `FK_PlanCarrera_Movimiento` FOREIGN KEY (`idMovimiento`) REFERENCES `MovimientosInternos`(`idMovimiento`) ON DELETE SET NULL ON UPDATE NO ACTION', 'SET @br1_skip := 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'PlanCarreraColaborador' AND CONSTRAINT_NAME = 'FK_PlanCarrera_VersionRuta');
SET @sql := IF(@fk = 0, 'ALTER TABLE `PlanCarreraColaborador` ADD CONSTRAINT `FK_PlanCarrera_VersionRuta` FOREIGN KEY (`idVersionRuta`) REFERENCES `RutaVersion`(`idVersion`) ON DELETE SET NULL ON UPDATE NO ACTION', 'SET @br1_skip := 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
