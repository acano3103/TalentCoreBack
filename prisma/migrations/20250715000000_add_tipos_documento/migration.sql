CREATE TABLE TiposDocumento (
    id INT NOT NULL AUTO_INCREMENT,
    nombre VARCHAR(200) NOT NULL,
    idEmpresa INT NOT NULL,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    fechaCreacion TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_tipo_doc_nombre_empresa (nombre, idEmpresa),
    INDEX idx_tipo_doc_empresa (idEmpresa)
);

ALTER TABLE PlantillasDocumentos ADD COLUMN idTipoDocumento INT NULL;
ALTER TABLE PlantillasDocumentos ADD INDEX idx_plantilla_tipo_doc (idTipoDocumento);
ALTER TABLE PlantillasDocumentos ADD CONSTRAINT fk_plantilla_tipo_doc FOREIGN KEY (idTipoDocumento) REFERENCES TiposDocumento(id);
