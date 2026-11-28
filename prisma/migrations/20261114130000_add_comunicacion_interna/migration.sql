-- Comunicación interna (CA1).
-- Aplicar a mano sobre una copia de la base, igual que las migraciones del kiosco.
-- No usar `prisma db pull`.
--
--   mysql -h <host> -u <user> -p <base> < prisma/migrations/20261114130000_add_comunicacion_interna/migration.sql
--
-- Después, semillas idempotentes (se puede correr más de una vez):
--
--   npm run seed:comunicacion
--
-- TODO: CatPuestos.idTipoPersonal queda nullable.
-- Esta migración lo rellena con el tipo ADMINISTRATIVO del mismo tenant.
-- Los puestos sin idTenant se quedan en NULL.
-- Volver la columna NOT NULL cuando RH clasifique esos puestos.
-- El DTO de puestos lo exige a partir de CA2.
-- OPERATIVO y DIRECTIVO los inserta el script de semillas, no esta migración.

-- CreateTable
CREATE TABLE `CatTiposPersonal` (
    `idTipoPersonal` INTEGER NOT NULL AUTO_INCREMENT,
    `idTenant` INTEGER NOT NULL,
    `Codigo` VARCHAR(30) NOT NULL,
    `Nombre` VARCHAR(80) NOT NULL,
    `Activo` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `UK_CatTiposPersonal_Tenant_Codigo`(`idTenant`, `Codigo`),
    INDEX `IDX_CatTiposPersonal_Tenant`(`idTenant`),
    PRIMARY KEY (`idTipoPersonal`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CatEtiquetasPuesto` (
    `idEtiqueta` INTEGER NOT NULL AUTO_INCREMENT,
    `idTenant` INTEGER NOT NULL,
    `Nombre` VARCHAR(60) NOT NULL,
    `Activo` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `UK_CatEtiquetasPuesto_Tenant_Nombre`(`idTenant`, `Nombre`),
    INDEX `IDX_CatEtiquetasPuesto_Tenant`(`idTenant`),
    PRIMARY KEY (`idEtiqueta`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RelPuestoEtiqueta` (
    `idPuesto` INTEGER NOT NULL,
    `idEtiqueta` INTEGER NOT NULL,

    INDEX `FK_RelPuestoEtiqueta_Etiqueta`(`idEtiqueta`),
    PRIMARY KEY (`idPuesto`, `idEtiqueta`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ComAudiencias` (
    `idAudiencia` INTEGER NOT NULL AUTO_INCREMENT,
    `idTenant` INTEGER NOT NULL,
    `idEmpresa` INTEGER NOT NULL,
    `Nombre` VARCHAR(120) NOT NULL,
    `Tipo` ENUM('DINAMICA', 'FIJA') NOT NULL,
    `Criterios` JSON NOT NULL,
    `CreadoPor` VARCHAR(36) NOT NULL,
    `FechaRegistro` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `FechaActualizacion` DATETIME(0) NULL,
    `Activo` BOOLEAN NOT NULL DEFAULT true,

    INDEX `IDX_ComAudiencias_Tenant_Empresa`(`idTenant`, `idEmpresa`),
    INDEX `FK_ComAudiencias_Empresa`(`idEmpresa`),
    PRIMARY KEY (`idAudiencia`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ComAudienciaPersonas` (
    `idAudiencia` INTEGER NOT NULL,
    `idEmpleado` INTEGER NOT NULL,

    INDEX `FK_ComAudienciaPersonas_Empleado`(`idEmpleado`),
    PRIMARY KEY (`idAudiencia`, `idEmpleado`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ComTiposComunicado` (
    `idTipo` INTEGER NOT NULL AUTO_INCREMENT,
    `idTenant` INTEGER NOT NULL,
    `Codigo` VARCHAR(40) NOT NULL,
    `Nombre` VARCHAR(80) NOT NULL,
    `PrioridadDefault` ENUM('NORMAL', 'IMPORTANTE', 'CRITICA') NOT NULL,
    `AcuseDefault` ENUM('NINGUNO', 'LEIDO', 'LEI_ENTENDI') NOT NULL,
    `ModalDefault` BOOLEAN NOT NULL,
    `IdentidadDefault` BOOLEAN NOT NULL,
    `EsCorto` BOOLEAN NOT NULL DEFAULT false,
    `Activo` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `UK_ComTiposComunicado_Tenant_Codigo`(`idTenant`, `Codigo`),
    INDEX `IDX_ComTiposComunicado_Tenant`(`idTenant`),
    PRIMARY KEY (`idTipo`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ComComunicados` (
    `idComunicado` INTEGER NOT NULL AUTO_INCREMENT,
    `idTenant` INTEGER NOT NULL,
    `idEmpresa` INTEGER NOT NULL,
    `idTipo` INTEGER NOT NULL,
    `Estado` ENUM('BORRADOR', 'PROGRAMADO', 'ENVIANDO', 'ENVIADO', 'EXPIRADO', 'CANCELADO', 'ARCHIVADO') NOT NULL,
    `Prioridad` ENUM('NORMAL', 'IMPORTANTE', 'CRITICA') NOT NULL,
    `AcuseModo` ENUM('NINGUNO', 'LEIDO', 'LEI_ENTENDI') NOT NULL,
    `MostrarModal` BOOLEAN NOT NULL DEFAULT false,
    `RequiereIdentidad` BOOLEAN NOT NULL DEFAULT false,
    `IncluirNuevos` BOOLEAN NOT NULL DEFAULT false,
    `PermitePregunta` BOOLEAN NOT NULL DEFAULT false,
    `CanalesForzados` JSON NULL,
    `Escalamiento` JSON NULL,
    `RecordatorioCadaDias` INTEGER NULL,
    `RecordatorioMax` INTEGER NULL,
    `CtaTipo` VARCHAR(40) NULL,
    `CtaTexto` VARCHAR(60) NULL,
    `CtaDestino` VARCHAR(500) NULL,
    `Categoria` VARCHAR(60) NULL,
    `idAudiencia` INTEGER NULL,
    `CriteriosAudiencia` JSON NOT NULL,
    `ProgramadoPara` DATETIME(0) NULL,
    `EnviadoEn` DATETIME(0) NULL,
    `VigenteHasta` DATETIME(0) NULL,
    `VersionActual` INTEGER NOT NULL DEFAULT 1,
    `TotalDestinatarios` INTEGER NOT NULL DEFAULT 0,
    `CreadoPor` VARCHAR(36) NOT NULL,
    `FechaRegistro` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `ArchivadoEn` DATETIME(0) NULL,

    INDEX `IDX_ComComunicados_Tenant_Emp_Est`(`idTenant`, `idEmpresa`, `Estado`),
    INDEX `FK_ComComunicados_Empresa`(`idEmpresa`),
    INDEX `FK_ComComunicados_Tipo`(`idTipo`),
    INDEX `FK_ComComunicados_Audiencia`(`idAudiencia`),
    PRIMARY KEY (`idComunicado`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ComComunicadoVersiones` (
    `idVersion` INTEGER NOT NULL AUTO_INCREMENT,
    `idComunicado` INTEGER NOT NULL,
    `NumVersion` INTEGER NOT NULL,
    `Titulo` VARCHAR(120) NOT NULL,
    `Resumen` VARCHAR(200) NOT NULL,
    `CuerpoHtml` TEXT NOT NULL,
    `PortadaRuta` VARCHAR(500) NULL,
    `CreadoPor` VARCHAR(36) NOT NULL,
    `FechaRegistro` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `EsCorreccionMenor` BOOLEAN NOT NULL DEFAULT false,

    UNIQUE INDEX `UK_ComVersiones_Com_Num`(`idComunicado`, `NumVersion`),
    INDEX `FK_ComVersiones_Comunicado`(`idComunicado`),
    PRIMARY KEY (`idVersion`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ComComunicadoAdjuntos` (
    `idAdjunto` INTEGER NOT NULL AUTO_INCREMENT,
    `idVersion` INTEGER NOT NULL,
    `Nombre` VARCHAR(255) NOT NULL,
    `Ruta` VARCHAR(500) NOT NULL,
    `Mime` VARCHAR(120) NOT NULL,
    `TamanoBytes` INTEGER NOT NULL,

    INDEX `FK_ComAdjuntos_Version`(`idVersion`),
    PRIMARY KEY (`idAdjunto`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ComDestinatarios` (
    `idDestinatario` INTEGER NOT NULL AUTO_INCREMENT,
    `idComunicado` INTEGER NOT NULL,
    `idEmpleado` INTEGER NOT NULL,
    `idUsuario` VARCHAR(36) NULL,
    `idSite` INTEGER NULL,
    `idArea` INTEGER NULL,
    `idPuesto` INTEGER NULL,
    `idTipoPersonal` INTEGER NULL,
    `idJefe` INTEGER NULL,
    `CanalesEfectivos` JSON NOT NULL,
    `Estado` ENUM('PENDIENTE', 'ENTREGADO', 'LEIDO', 'CONFIRMADO', 'FALLIDO', 'SIN_CANAL', 'EXPIRADO') NOT NULL,
    `LeidoEn` DATETIME(0) NULL,
    `ConfirmadoEn` DATETIME(0) NULL,
    `VersionConfirmada` INTEGER NULL,
    `RecordatoriosEnviados` INTEGER NOT NULL DEFAULT 0,
    `UltimoIntentoEn` DATETIME(0) NULL,
    `EscaladoA` JSON NULL,

    UNIQUE INDEX `UK_ComDestinatarios_Com_Emp`(`idComunicado`, `idEmpleado`),
    INDEX `IDX_ComDestinatarios_Emp_Estado`(`idEmpleado`, `Estado`),
    INDEX `FK_ComDestinatarios_Comunicado`(`idComunicado`),
    INDEX `FK_ComDestinatarios_Empleado`(`idEmpleado`),
    PRIMARY KEY (`idDestinatario`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ComAcuses` (
    `idAcuse` INTEGER NOT NULL AUTO_INCREMENT,
    `idComunicado` INTEGER NOT NULL,
    `idVersion` INTEGER NOT NULL,
    `idDestinatario` INTEGER NOT NULL,
    `idEmpleado` INTEGER NOT NULL,
    `FechaUtc` DATETIME(0) NOT NULL,
    `ZonaHoraria` VARCHAR(50) NOT NULL,
    `Canal` ENUM('APP', 'WEB', 'ENLACE', 'KIOSCO') NOT NULL,
    `Metodo` VARCHAR(40) NOT NULL,
    `Ip` VARCHAR(45) NULL,
    `UserAgent` VARCHAR(300) NULL,
    `Dispositivo` VARCHAR(120) NULL,

    INDEX `FK_ComAcuses_Comunicado`(`idComunicado`),
    INDEX `FK_ComAcuses_Version`(`idVersion`),
    INDEX `FK_ComAcuses_Destinatario`(`idDestinatario`),
    INDEX `FK_ComAcuses_Empleado`(`idEmpleado`),
    PRIMARY KEY (`idAcuse`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ComPreguntas` (
    `idPregunta` INTEGER NOT NULL AUTO_INCREMENT,
    `idComunicado` INTEGER NOT NULL,
    `idEmpleado` INTEGER NOT NULL,
    `Pregunta` TEXT NOT NULL,
    `Respuesta` TEXT NULL,
    `RespondidoPor` VARCHAR(36) NULL,
    `FechaPregunta` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `FechaRespuesta` DATETIME(0) NULL,

    INDEX `FK_ComPreguntas_Comunicado`(`idComunicado`),
    INDEX `FK_ComPreguntas_Empleado`(`idEmpleado`),
    PRIMARY KEY (`idPregunta`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ComEnlacesSeguros` (
    `idEnlace` INTEGER NOT NULL AUTO_INCREMENT,
    `idDestinatario` INTEGER NOT NULL,
    `TokenHash` CHAR(64) NOT NULL,
    `ExpiraEn` DATETIME(0) NOT NULL,
    `Intentos` INTEGER NOT NULL DEFAULT 0,
    `BloqueadoHasta` DATETIME(0) NULL,
    `VerificadoEn` DATETIME(0) NULL,

    UNIQUE INDEX `UK_ComEnlacesSeguros_TokenHash`(`TokenHash`),
    INDEX `FK_ComEnlaces_Destinatario`(`idDestinatario`),
    PRIMARY KEY (`idEnlace`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PushTokens` (
    `idPushToken` INTEGER NOT NULL AUTO_INCREMENT,
    `user_uuid` VARCHAR(36) NOT NULL,
    `idEmpleado` INTEGER NULL,
    `Token` VARCHAR(255) NOT NULL,
    `Plataforma` VARCHAR(20) NOT NULL,
    `Dispositivo` VARCHAR(120) NULL,
    `Activo` BOOLEAN NOT NULL DEFAULT true,
    `UltimoUso` DATETIME(0) NULL,
    `FechaBaja` DATETIME(0) NULL,
    `MotivoBaja` VARCHAR(60) NULL,

    UNIQUE INDEX `UK_PushTokens_Token`(`Token`),
    INDEX `IDX_PushTokens_Usuario`(`user_uuid`),
    INDEX `FK_PushTokens_Empleado`(`idEmpleado`),
    PRIMARY KEY (`idPushToken`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ComPerfilesCanal` (
    `idPerfil` INTEGER NOT NULL AUTO_INCREMENT,
    `idTenant` INTEGER NOT NULL,
    `idEmpresa` INTEGER NOT NULL,
    `Nivel` ENUM('TIPO_PERSONAL', 'UBICACION', 'EMPLEADO') NOT NULL,
    `idReferencia` INTEGER NOT NULL,
    `Canales` JSON NOT NULL,
    `Nota` VARCHAR(200) NULL,

    UNIQUE INDEX `UK_ComPerfilesCanal_Emp_Nivel_Ref`(`idEmpresa`, `Nivel`, `idReferencia`),
    INDEX `IDX_ComPerfilesCanal_Tenant`(`idTenant`),
    INDEX `FK_ComPerfilesCanal_Empresa`(`idEmpresa`),
    PRIMARY KEY (`idPerfil`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ComConfigEmpresa` (
    `idEmpresa` INTEGER NOT NULL,
    `idTenant` INTEGER NOT NULL,
    `PoliticaWhatsApp` VARCHAR(30) NOT NULL DEFAULT 'IMPORTANTE_CRITICA',
    `EscalaImportanteMin` INTEGER NOT NULL DEFAULT 240,
    `EscalaCriticaMin` INTEGER NOT NULL DEFAULT 120,
    `EscalaCorreoMin` INTEGER NOT NULL DEFAULT 240,
    `SilencioActivo` BOOLEAN NOT NULL DEFAULT true,
    `SilencioInicio` VARCHAR(5) NOT NULL DEFAULT '21:00',
    `SilencioFin` VARCHAR(5) NOT NULL DEFAULT '07:00',
    `LimiteDiarioRecordatorios` INTEGER NOT NULL DEFAULT 5,
    `JefesAvisoEquipo` BOOLEAN NOT NULL DEFAULT true,
    `PlantillasWhatsApp` JSON NULL,

    INDEX `IDX_ComConfigEmpresa_Tenant`(`idTenant`),
    PRIMARY KEY (`idEmpresa`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ComReglasRecordatorio` (
    `idRegla` INTEGER NOT NULL AUTO_INCREMENT,
    `idTenant` INTEGER NOT NULL,
    `idEmpresa` INTEGER NOT NULL,
    `Codigo` VARCHAR(5) NOT NULL,
    `Activo` BOOLEAN NOT NULL,
    `Parametros` JSON NOT NULL,
    `Canales` JSON NOT NULL,
    `Plantilla` VARCHAR(500) NOT NULL,
    `AplicaTiposPersonal` JSON NULL,
    `ExcluyeSites` JSON NULL,

    UNIQUE INDEX `UK_ComReglasRecordatorio_Emp_Codigo`(`idEmpresa`, `Codigo`),
    INDEX `IDX_ComReglasRecordatorio_Tenant`(`idTenant`),
    INDEX `FK_ComReglasRecordatorio_Empresa`(`idEmpresa`),
    PRIMARY KEY (`idRegla`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ComRecordatoriosEnviados` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `idEmpresa` INTEGER NOT NULL,
    `Codigo` VARCHAR(5) NOT NULL,
    `idEmpleado` INTEGER NOT NULL,
    `Referencia` VARCHAR(80) NOT NULL,
    `Intento` INTEGER NOT NULL,
    `EnviadoEn` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `IDX_ComRecordatorios_Emp_Fecha`(`idEmpleado`, `EnviadoEn`),
    INDEX `IDX_ComRecordatorios_Empresa`(`idEmpresa`),
    INDEX `FK_ComRecordatoriosEnviados_Empleado`(`idEmpleado`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CatComCapacidades` (
    `idCapacidad` INTEGER NOT NULL AUTO_INCREMENT,
    `Codigo` VARCHAR(40) NOT NULL,
    `Descripcion` VARCHAR(200) NOT NULL,
    `Fase` INTEGER NOT NULL DEFAULT 1,

    UNIQUE INDEX `UK_CatComCapacidades_Codigo`(`Codigo`),
    PRIMARY KEY (`idCapacidad`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RelRolComCapacidad` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `idTenant` INTEGER NOT NULL,
    `idRol` INTEGER NOT NULL,
    `idCapacidad` INTEGER NOT NULL,
    `Alcance` ENUM('TENANT', 'EMPRESAS', 'UNIDADES', 'UBICACIONES', 'ESTRUCTURA', 'EQUIPO_DIRECTO') NOT NULL,
    `Referencias` JSON NULL,
    `TiposPermitidos` JSON NULL,
    `RequiereAprobacion` BOOLEAN NOT NULL DEFAULT false,

    UNIQUE INDEX `UK_RelRolComCapacidad_Rol_Cap`(`idRol`, `idCapacidad`),
    INDEX `IDX_RelRolComCapacidad_Tenant`(`idTenant`),
    INDEX `FK_RelRolComCapacidad_Rol`(`idRol`),
    INDEX `FK_RelRolComCapacidad_Capacidad`(`idCapacidad`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WaConsumo` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `idTenant` INTEGER NOT NULL,
    `idEmpresa` INTEGER NOT NULL,
    `idEntrega` VARCHAR(36) NULL,
    `Plantilla` VARCHAR(80) NOT NULL,
    `CategoriaInterna` VARCHAR(20) NOT NULL,
    `CategoriaMeta` VARCHAR(20) NULL,
    `OrigenTipo` VARCHAR(20) NOT NULL,
    `OrigenId` VARCHAR(40) NOT NULL,
    `TelefonoUlt4` CHAR(4) NOT NULL,
    `ProveedorMsgId` VARCHAR(80) NULL,
    `Estatus` VARCHAR(20) NOT NULL,
    `PrecioUnitario` DECIMAL(10, 4) NOT NULL,
    `Moneda` CHAR(3) NOT NULL,
    `Costo` DECIMAL(10, 4) NOT NULL,
    `EnviadoEn` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `IDX_WaConsumo_Tenant_Fecha`(`idTenant`, `EnviadoEn`),
    INDEX `FK_WaConsumo_Empresa`(`idEmpresa`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WaPrecios` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `idTenant` INTEGER NULL,
    `PrecioBase` DECIMAL(10, 4) NOT NULL,
    `PreciosCategoria` JSON NULL,
    `Moneda` CHAR(3) NOT NULL DEFAULT 'MXN',
    `VigenteDesde` DATETIME(0) NOT NULL,
    `CreadoPor` VARCHAR(36) NOT NULL,
    `FechaRegistro` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `IDX_WaPrecios_Tenant_Vigencia`(`idTenant`, `VigenteDesde`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WaTopes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `idTenant` INTEGER NOT NULL,
    `idEmpresa` INTEGER NULL,
    `TopeMensual` DECIMAL(12, 2) NOT NULL,
    `Accion` VARCHAR(20) NOT NULL DEFAULT 'BLOQUEAR',
    `Activo` BOOLEAN NOT NULL DEFAULT true,

    INDEX `IDX_WaTopes_Tenant`(`idTenant`),
    INDEX `FK_WaTopes_Empresa`(`idEmpresa`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Semilla mínima para poder rellenar puestos. El resto de catálogos va en el script.
INSERT INTO `CatTiposPersonal` (`idTenant`, `Codigo`, `Nombre`, `Activo`)
SELECT t.`idTenant`, 'ADMINISTRATIVO', 'Administrativo', TRUE
FROM `CatTenants` t
WHERE NOT EXISTS (
    SELECT 1
    FROM `CatTiposPersonal` c
    WHERE c.`idTenant` = t.`idTenant`
      AND c.`Codigo` = 'ADMINISTRATIVO'
);

-- AlterTable
ALTER TABLE `CatPuestos`
    ADD COLUMN `idTipoPersonal` INTEGER NULL,
    ADD INDEX `FK_Puestos_TipoPersonal`(`idTipoPersonal`);

UPDATE `CatPuestos` p
INNER JOIN `CatTiposPersonal` t
    ON t.`idTenant` = p.`idTenant`
   AND t.`Codigo` = 'ADMINISTRATIVO'
SET p.`idTipoPersonal` = t.`idTipoPersonal`
WHERE p.`idTipoPersonal` IS NULL
  AND p.`idTenant` IS NOT NULL;

-- AlterTable
ALTER TABLE `Empleados`
    ADD COLUMN `idTipoPersonalOverride` INTEGER NULL,
    ADD INDEX `FK_Empleados_TipoPersonal`(`idTipoPersonalOverride`);

-- AlterTable
ALTER TABLE `Notificaciones`
    ADD COLUMN `idTenant` INTEGER NULL,
    ADD COLUMN `idEmpresa` INTEGER NULL,
    ADD COLUMN `Categoria` VARCHAR(30) NULL,
    ADD COLUMN `Prioridad` ENUM('NORMAL', 'IMPORTANTE', 'CRITICA') NOT NULL DEFAULT 'NORMAL',
    ADD COLUMN `DeepLink` VARCHAR(500) NULL,
    ADD COLUMN `OrigenTipo` VARCHAR(40) NULL,
    ADD COLUMN `OrigenId` VARCHAR(40) NULL,
    ADD COLUMN `ClaveAgrupacion` VARCHAR(120) NULL,
    ADD COLUMN `ExpiraEn` DATETIME(0) NULL,
    ADD INDEX `IDX_Notificaciones_Tenant_Empresa`(`idTenant`, `idEmpresa`);

-- AlterTable
ALTER TABLE `NotificacionesEntregas`
    ADD COLUMN `ProveedorMsgId` VARCHAR(80) NULL,
    ADD COLUMN `Intento` INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN `Costo` DECIMAL(10, 4) NULL;

-- AddForeignKey
ALTER TABLE `RelPuestoEtiqueta` ADD CONSTRAINT `FK_RelPuestoEtiqueta_Puesto` FOREIGN KEY (`idPuesto`) REFERENCES `CatPuestos`(`idPuesto`) ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE `RelPuestoEtiqueta` ADD CONSTRAINT `FK_RelPuestoEtiqueta_Etiqueta` FOREIGN KEY (`idEtiqueta`) REFERENCES `CatEtiquetasPuesto`(`idEtiqueta`) ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE `CatPuestos` ADD CONSTRAINT `FK_Puestos_TipoPersonal` FOREIGN KEY (`idTipoPersonal`) REFERENCES `CatTiposPersonal`(`idTipoPersonal`) ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE `Empleados` ADD CONSTRAINT `FK_Empleados_TipoPersonal` FOREIGN KEY (`idTipoPersonalOverride`) REFERENCES `CatTiposPersonal`(`idTipoPersonal`) ON DELETE RESTRICT ON UPDATE NO ACTION;

ALTER TABLE `ComAudiencias` ADD CONSTRAINT `FK_ComAudiencias_Empresa` FOREIGN KEY (`idEmpresa`) REFERENCES `CatEmpresas`(`idEmpresa`) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE `ComAudienciaPersonas` ADD CONSTRAINT `FK_ComAudienciaPersonas_Audiencia` FOREIGN KEY (`idAudiencia`) REFERENCES `ComAudiencias`(`idAudiencia`) ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE `ComAudienciaPersonas` ADD CONSTRAINT `FK_ComAudienciaPersonas_Empleado` FOREIGN KEY (`idEmpleado`) REFERENCES `Empleados`(`idEmpleado`) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE `ComComunicados` ADD CONSTRAINT `FK_ComComunicados_Empresa` FOREIGN KEY (`idEmpresa`) REFERENCES `CatEmpresas`(`idEmpresa`) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE `ComComunicados` ADD CONSTRAINT `FK_ComComunicados_Tipo` FOREIGN KEY (`idTipo`) REFERENCES `ComTiposComunicado`(`idTipo`) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE `ComComunicados` ADD CONSTRAINT `FK_ComComunicados_Audiencia` FOREIGN KEY (`idAudiencia`) REFERENCES `ComAudiencias`(`idAudiencia`) ON DELETE SET NULL ON UPDATE NO ACTION;

ALTER TABLE `ComComunicadoVersiones` ADD CONSTRAINT `FK_ComVersiones_Comunicado` FOREIGN KEY (`idComunicado`) REFERENCES `ComComunicados`(`idComunicado`) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE `ComComunicadoAdjuntos` ADD CONSTRAINT `FK_ComAdjuntos_Version` FOREIGN KEY (`idVersion`) REFERENCES `ComComunicadoVersiones`(`idVersion`) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE `ComDestinatarios` ADD CONSTRAINT `FK_ComDestinatarios_Comunicado` FOREIGN KEY (`idComunicado`) REFERENCES `ComComunicados`(`idComunicado`) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE `ComDestinatarios` ADD CONSTRAINT `FK_ComDestinatarios_Empleado` FOREIGN KEY (`idEmpleado`) REFERENCES `Empleados`(`idEmpleado`) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE `ComAcuses` ADD CONSTRAINT `FK_ComAcuses_Comunicado` FOREIGN KEY (`idComunicado`) REFERENCES `ComComunicados`(`idComunicado`) ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE `ComAcuses` ADD CONSTRAINT `FK_ComAcuses_Version` FOREIGN KEY (`idVersion`) REFERENCES `ComComunicadoVersiones`(`idVersion`) ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE `ComAcuses` ADD CONSTRAINT `FK_ComAcuses_Destinatario` FOREIGN KEY (`idDestinatario`) REFERENCES `ComDestinatarios`(`idDestinatario`) ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE `ComAcuses` ADD CONSTRAINT `FK_ComAcuses_Empleado` FOREIGN KEY (`idEmpleado`) REFERENCES `Empleados`(`idEmpleado`) ON DELETE RESTRICT ON UPDATE NO ACTION;

ALTER TABLE `ComPreguntas` ADD CONSTRAINT `FK_ComPreguntas_Comunicado` FOREIGN KEY (`idComunicado`) REFERENCES `ComComunicados`(`idComunicado`) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE `ComPreguntas` ADD CONSTRAINT `FK_ComPreguntas_Empleado` FOREIGN KEY (`idEmpleado`) REFERENCES `Empleados`(`idEmpleado`) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE `ComEnlacesSeguros` ADD CONSTRAINT `FK_ComEnlaces_Destinatario` FOREIGN KEY (`idDestinatario`) REFERENCES `ComDestinatarios`(`idDestinatario`) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE `PushTokens` ADD CONSTRAINT `FK_PushTokens_Empleado` FOREIGN KEY (`idEmpleado`) REFERENCES `Empleados`(`idEmpleado`) ON DELETE SET NULL ON UPDATE NO ACTION;

ALTER TABLE `ComPerfilesCanal` ADD CONSTRAINT `FK_ComPerfilesCanal_Empresa` FOREIGN KEY (`idEmpresa`) REFERENCES `CatEmpresas`(`idEmpresa`) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE `ComConfigEmpresa` ADD CONSTRAINT `FK_ComConfigEmpresa_Empresa` FOREIGN KEY (`idEmpresa`) REFERENCES `CatEmpresas`(`idEmpresa`) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE `ComReglasRecordatorio` ADD CONSTRAINT `FK_ComReglasRecordatorio_Empresa` FOREIGN KEY (`idEmpresa`) REFERENCES `CatEmpresas`(`idEmpresa`) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE `ComRecordatoriosEnviados` ADD CONSTRAINT `FK_ComRecordatoriosEnviados_Empleado` FOREIGN KEY (`idEmpleado`) REFERENCES `Empleados`(`idEmpleado`) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE `RelRolComCapacidad` ADD CONSTRAINT `FK_RelRolComCapacidad_Rol` FOREIGN KEY (`idRol`) REFERENCES `CatRoles`(`idRol`) ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE `RelRolComCapacidad` ADD CONSTRAINT `FK_RelRolComCapacidad_Capacidad` FOREIGN KEY (`idCapacidad`) REFERENCES `CatComCapacidades`(`idCapacidad`) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE `WaConsumo` ADD CONSTRAINT `FK_WaConsumo_Empresa` FOREIGN KEY (`idEmpresa`) REFERENCES `CatEmpresas`(`idEmpresa`) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE `WaTopes` ADD CONSTRAINT `FK_WaTopes_Empresa` FOREIGN KEY (`idEmpresa`) REFERENCES `CatEmpresas`(`idEmpresa`) ON DELETE NO ACTION ON UPDATE NO ACTION;
