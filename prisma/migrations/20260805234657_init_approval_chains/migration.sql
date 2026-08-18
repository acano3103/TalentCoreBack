CREATE TABLE CatRolAprobador (
    idRolAprobador INT NOT NULL AUTO_INCREMENT,
    codigo VARCHAR(50) NOT NULL,
    
ombre VARCHAR(100) NOT NULL,
    PRIMARY KEY (idRolAprobador),
    UNIQUE INDEX uk_CatRolAprobador_codigo (codigo)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE CatTipoMovimiento (
    idTipoMovimiento INT NOT NULL AUTO_INCREMENT,
    codigo VARCHAR(50) NOT NULL,
    
ombre VARCHAR(100) NOT NULL,
    PRIMARY KEY (idTipoMovimiento),
    UNIQUE INDEX uk_CatTipoMovimiento_codigo (codigo)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE ConfiguracionPasosAprobacion (
    idConfiguracionPasos INT NOT NULL AUTO_INCREMENT,
    idTipoMovimiento INT NOT NULL,
    idRolAprobador INT NOT NULL,
    paso INT NOT NULL,
    esOpcional BOOLEAN NOT NULL DEFAULT false,
    condicion VARCHAR(255) NULL,
    ctivo BOOLEAN NOT NULL DEFAULT true,
    PRIMARY KEY (idConfiguracionPasos),
    INDEX idx_ConfigPasosAprobacion_TipoMovimiento (idTipoMovimiento),
    INDEX idx_ConfigPasosAprobacion_RolAprobador (idRolAprobador),
    UNIQUE INDEX uk_ConfigPasosAprobacion_TipoMovimiento_paso (idTipoMovimiento, paso)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE PasosAprobacionMovimiento (
    idPasoAprobacion INT NOT NULL AUTO_INCREMENT,
    idMovimiento INT NOT NULL,
    idRolAprobador INT NOT NULL,
    paso INT NOT NULL,
    idEstatus INT NOT NULL DEFAULT 1,
    comentarios TEXT NULL,
    idUsuarioAprobador VARCHAR(36) NULL,
    echaActualizacion TIMESTAMP(0) NULL ON UPDATE CURRENT_TIMESTAMP(0),
    echaCreacion TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    PRIMARY KEY (idPasoAprobacion),
    INDEX idx_PasosAprobacionMov_Movimiento (idMovimiento),
    INDEX idx_PasosAprobacionMov_RolAprobador (idRolAprobador),
    INDEX idx_PasosAprobacionMov_Estatus (idEstatus),
    UNIQUE INDEX uk_PasosAprobacionMov_Movimiento_paso (idMovimiento, paso)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE ConfiguracionPasosAprobacion ADD CONSTRAINT FK_ConfigPasosAprobacion_TipoMovimiento FOREIGN KEY (idTipoMovimiento) REFERENCES CatTipoMovimiento(idTipoMovimiento) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE ConfiguracionPasosAprobacion ADD CONSTRAINT FK_ConfigPasosAprobacion_RolAprobador FOREIGN KEY (idRolAprobador) REFERENCES CatRolAprobador(idRolAprobador) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE PasosAprobacionMovimiento ADD CONSTRAINT FK_PasosAprobacionMov_Movimiento FOREIGN KEY (idMovimiento) REFERENCES MovimientosInternos(idMovimiento) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE PasosAprobacionMovimiento ADD CONSTRAINT FK_PasosAprobacionMov_RolAprobador FOREIGN KEY (idRolAprobador) REFERENCES CatRolAprobador(idRolAprobador) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE PasosAprobacionMovimiento ADD CONSTRAINT FK_PasosAprobacionMov_Estatus FOREIGN KEY (idEstatus) REFERENCES CatEstatusMovimiento(idEstatusMovimiento) ON DELETE RESTRICT ON UPDATE CASCADE;
