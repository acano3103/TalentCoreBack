CREATE TABLE IF NOT EXISTS CursoLogrosEmpleado (
  idLogro INT AUTO_INCREMENT PRIMARY KEY,
  idTenant INT NOT NULL,
  idEmpresa INT NOT NULL,
  idEmpleado INT NOT NULL,
  codigo VARCHAR(40) NOT NULL,
  fechaObtencion DATETIME NOT NULL,
  vistoEn DATETIME NULL,
  UNIQUE KEY uk_logro_empleado (idEmpleado, codigo),
  KEY idx_logro_tenant (idTenant)
);

CREATE TABLE IF NOT EXISTS CursoTiempoDiario (
  idParticipante INT NOT NULL,
  fecha DATE NOT NULL,
  idTenant INT NOT NULL,
  segundos INT NOT NULL DEFAULT 0,
  PRIMARY KEY (idParticipante, fecha),
  KEY idx_tiempo_tenant (idTenant)
);
