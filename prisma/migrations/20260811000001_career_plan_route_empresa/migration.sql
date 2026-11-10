-- AlterTable
ALTER TABLE `RelPuestoRuta` ADD COLUMN `idEmpresa` INTEGER NOT NULL;

-- DropIndex
ALTER TABLE `RelPuestoRuta` DROP INDEX `unique_ruta_origen_destino`;

-- CreateIndex
ALTER TABLE `RelPuestoRuta` ADD UNIQUE INDEX `unique_ruta_origen_destino`(`idEmpresa`, `idPuestoOrigen`, `idPuestoDestino`);
