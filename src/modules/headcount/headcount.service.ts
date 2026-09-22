import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { HeadcountQueries } from './queries/headcount.queries';
import { UpdateHeadcountDto } from './dto/update-headcount.dto';
import * as ExcelJS from 'exceljs';

@Injectable()
export class HeadcountService {
    constructor(private prisma: PrismaService) { }

    async findAll(companyId: number, page: number, search: string, limit: number, locationId?: number) {
        const skip = (page - 1) * limit;

        // 1. Ejecutamos en paralelo la consulta base paginada y el conteo total de registros
        const [matrixRecords, totalRecords, globalSummary] = await Promise.all([
            HeadcountQueries.getPaginatedMatrix(this.prisma, companyId, skip, limit, search, locationId),
            HeadcountQueries.countMatrixRecords(this.prisma, companyId, search, locationId),
            HeadcountQueries.getGlobalSummary(this.prisma, companyId, search, locationId),
        ]);

        // 2. Por cada uno de los 10 registros de Área-Ubicación, traemos sus puestos específicos con su estado local
        const dataGrid = await Promise.all(
            matrixRecords.map(async (row) => {
                const puestosRaw = await HeadcountQueries.getPuestosPorAreaSite(this.prisma, row.idArea, row.idSite);

                // Mapeamos los puestos y calculamos de forma dinámica las vacantes
                const puestosAutorizados = puestosRaw.map((p) => {
                    const autorizado = Number(p.autorizado);
                    const ocupado = Number(p.ocupado);
                    return {
                        idPuesto: p.idPuesto,
                        nombrePuesto: p.nombrePuesto,
                        autorizado: autorizado,
                        ocupado: ocupado,
                        vacante: Math.max(0, autorizado - ocupado),
                        nombreNivel: p.nombreNivel,
                        salarioMinimo: Number(p.salarioMinimo),
                        salarioMaximo: Number(p.salarioMaximo)
                    };
                });

                const plazasTotales = Number(row.plazasTotales);
                const plazasOcupadas = Number(row.plazasOcupadas);

                return {
                    idAreaUbicacion: row.idAreaUbicacion,
                    idSite: row.idSite,
                    siteDescripcion: row.siteDescripcion,
                    idArea: row.idArea,
                    areaDescripcion: row.areaDescripcion,
                    presupuestoAsignado: Number(row.PresupuestoAsignado),
                    plazasTotales: plazasTotales,
                    plazasOcupadas: plazasOcupadas,
                    vacantesLibres: Math.max(0, plazasTotales - plazasOcupadas),
                    puestosAutorizados: puestosAutorizados,
                };
            })
        );

        // 3. Retornamos la estructura unificada idéntica a lo que espera consumir tu Front
        return {
            dataGrid,
            total: totalRecords,
            currentPage: page,
            totalPages: Math.ceil(totalRecords / limit) || 1,
            summary: {
                totalAutorizado: globalSummary.totalAutorizado,
                totalEjecutado: 0, // Pausado temporalmente con 0 por negocio
                totalVacantes: 0,  // Pausado temporalmente con 0 por negocio
                totalDisponible: globalSummary.totalAutorizado // Al ser los demás 0, el disponible es igual al autorizado
            }
        };
    }

    async update(companyId: number, dto: UpdateHeadcountDto) {
        const { idSite, plazas } = dto;

        // Verificación de seguridad: Confirmar que el site exista y pertenezca a la empresa actual
        const siteExists = await this.prisma.catSites.findFirst({
            where: {
                idSite: idSite,
                idEmpresa: companyId,
            },
        });

        if (!siteExists) {
            throw new BadRequestException('El Site especificado no pertenece a la compañía provista.');
        }

        await this.prisma.$transaction(async (tx) => {
            for (const [idPuestoStr, nuevasPlazas] of Object.entries(plazas)) {
                const clockPuestoId = Number(idPuestoStr);
                const totalPlazasAsignar = Number(nuevasPlazas);

                if (totalPlazasAsignar < 0) {
                    throw new BadRequestException(`Las plazas para el puesto ID ${clockPuestoId} no pueden ser valores negativos.`);
                }

                await tx.relPuestosUbicaciones.upsert({
                    where: {
                        idPuesto_idSite: {
                            idPuesto: clockPuestoId,
                            idSite: idSite,
                        },
                    },
                    // Si ya existe el registro en la tabla intermedia, lo actualizamos
                    update: {
                        PlazasAutorizadas: totalPlazasAsignar,
                    },
                    // Si no existe (asumido en 0 por el Front), creamos la fila por primera vez
                    create: {
                        idPuesto: clockPuestoId,
                        idSite: idSite,
                        PlazasAutorizadas: totalPlazasAsignar,
                    },
                });
            }
        });

        return { message: 'Estructura de plazas y headcount configurada exitosamente.' };
    }

    // Genera la plantilla Excel con todas las combinaciones Site - Área - Puesto precargadas
    async generateBulkTemplate(companyId: number): Promise<Buffer> {
        // 1. Obtener todas las relaciones Área-Ubicación asignadas para la empresa
        const asignacionesAreas = await this.prisma.relAreasUbicaciones.findMany({
            where: {
                Activo: true,
                CatSites: { idEmpresa: companyId, Activo: true },
            },
            include: {
                CatSites: { select: { idSite: true, Descripcion: true } },
                CatAreas: { select: { idArea: true, Descripcion: true } },
            },
            orderBy: [
                { CatSites: { Descripcion: 'asc' } },
                { CatAreas: { Descripcion: 'asc' } },
            ],
        });

        // 2. Obtener todos los puestos activos de la empresa
        const puestosEmpresa = await this.prisma.catPuestos.findMany({
            where: { idEmpresa: companyId, Activo: true },
            select: {
                idPuesto: true,
                NombrePuesto: true,
                idArea: true,
                CatNivelesSalario: {
                    select: { NombreNivel: true, SalarioMinimo: true, SalarioMaximo: true }
                }
            },
            orderBy: { NombrePuesto: 'asc' },
        });

        // 3. Obtener todas las plazas actualmente autorizadas en relPuestosUbicaciones
        const plazasExistentes = await this.prisma.relPuestosUbicaciones.findMany({
            where: {
                CatSites: { idEmpresa: companyId }
            },
            select: {
                idPuesto: true,
                idSite: true,
                PlazasAutorizadas: true,
            }
        });

        const plazasMap = new Map<string, number>();
        plazasExistentes.forEach((p) => {
            plazasMap.set(`${p.idSite}_${p.idPuesto}`, Number(p.PlazasAutorizadas || 0));
        });

        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'Talent Core';
        workbook.created = new Date();

        const sheet = workbook.addWorksheet('Plazas Headcount');

        const styleHeader = (row: ExcelJS.Row, colorHex: string = 'FF1E293B') => {
            row.height = 28;
            row.eachCell((cell) => {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colorHex } };
                cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
                cell.alignment = { vertical: 'middle', horizontal: 'center' };
            });
        };

        sheet.columns = [
            { header: 'Ubicación / Sede *', key: 'site', width: 32 },
            { header: 'Área Operativa *', key: 'area', width: 32 },
            { header: 'Puesto *', key: 'puesto', width: 35 },
            { header: 'Nivel Salarial (Referencia)', key: 'nivelSalario', width: 28 },
            { header: 'Plazas Autorizadas *', key: 'plazas', width: 22, style: { numFmt: '#,##0' } },
        ];
        styleHeader(sheet.getRow(1), 'FF1E40AF'); // Azul Talent Core

        // Nota flotante de guía
        sheet.getCell('E1').note = {
            texts: [{ text: 'Indica el número total de plazas autorizadas para este puesto en esta sede (debe ser un número entero >= 0).' }],
        };

        // 4. Volcar las combinaciones reales
        let rowIdx = 2;
        for (const asignacion of asignacionesAreas) {
            const siteName = asignacion.CatSites?.Descripcion?.trim() || '';
            const areaName = asignacion.CatAreas?.Descripcion?.trim() || '';
            const idSite = asignacion.idSite;
            const idArea = asignacion.idArea;

            // Filtrar los puestos que pertenecen a esta área
            const puestosDelArea = puestosEmpresa.filter((p) => p.idArea === idArea);

            for (const puesto of puestosDelArea) {
                const puestoName = puesto.NombrePuesto?.trim() || '';
                const key = `${idSite}_${puesto.idPuesto}`;
                const plazasActuales = plazasMap.has(key) ? plazasMap.get(key) : 0;
                const nivelNombre = puesto.CatNivelesSalario?.NombreNivel || 'Sin Tabulador';

                sheet.addRow({
                    site: siteName,
                    area: areaName,
                    puesto: puestoName,
                    nivelSalario: nivelNombre,
                    plazas: plazasActuales,
                });

                // Bloqueamos celdas informativas si se desea, o validamos que Plazas sea >= 0
                sheet.getCell(`E${rowIdx}`).dataValidation = {
                    type: 'whole',
                    operator: 'greaterThanOrEqual',
                    formulae: [0],
                    showErrorMessage: true,
                    errorTitle: 'Valor Inválido',
                    error: 'El número de plazas autorizadas debe ser un número entero mayor o igual a 0.',
                };

                rowIdx++;
            }
        }

        // Si la empresa aún no tiene combinaciones, agregamos una fila guía
        if (rowIdx === 2) {
            const sample = sheet.addRow({
                site: 'CORPORATIVO CENTRAL',
                area: 'TECNOLOGÍA',
                puesto: 'DESARROLLADOR BACKEND',
                nivelSalario: 'NIVEL A',
                plazas: 3,
            });
            sample.font = { italic: true, color: { argb: 'FF64748B' } };
        }

        const uint8Array = await workbook.xlsx.writeBuffer();
        return Buffer.from(uint8Array);
    }

    // Procesa el archivo Excel y actualiza las plazas autorizadas en relPuestosUbicaciones
    async processBulkPlazas(companyId: number, file: Express.Multer.File) {
        const workbook = new ExcelJS.Workbook();
        try {
            await workbook.xlsx.load(file.buffer as any);
        } catch {
            throw new BadRequestException('El archivo Excel es inválido o está dañado.');
        }

        const sheet = workbook.getWorksheet('Plazas Headcount') || workbook.worksheets[0];
        if (!sheet) {
            throw new BadRequestException('El archivo debe incluir la hoja de "Plazas Headcount".');
        }

        const errors: { row: number; error: string }[] = [];
        let updatedCount = 0;

        const normalize = (v: any) =>
            String(v || '')
                .trim()
                .toUpperCase()
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '');

        // 1. Precargar Sites y Puestos de la empresa en memoria
        const [sites, puestos] = await Promise.all([
            this.prisma.catSites.findMany({
                where: { idEmpresa: companyId, Activo: true },
                select: { idSite: true, Descripcion: true },
            }),
            this.prisma.catPuestos.findMany({
                where: { idEmpresa: companyId, Activo: true },
                select: { idPuesto: true, NombrePuesto: true, idArea: true },
            }),
        ]);

        const siteMap = new Map<string, number>();
        sites.forEach((s) => {
            if (s.Descripcion) siteMap.set(normalize(s.Descripcion), s.idSite);
        });

        const puestoMap = new Map<string, number>();
        puestos.forEach((p) => {
            if (p.NombrePuesto) puestoMap.set(normalize(p.NombrePuesto), p.idPuesto);
        });

        // 2. Iterar filas del Excel
        for (let r = 2; r <= sheet.rowCount; r++) {
            const row = sheet.getRow(r);
            const rawSite = row.getCell(1).text?.replace(/["']/g, '').trim();
            const rawPuesto = row.getCell(3).text?.replace(/["']/g, '').trim();
            const rawPlazas = row.getCell(5).text?.replace(/["',\s]/g, '').trim();

            if (!rawSite && !rawPuesto) continue; // Fila vacía

            if (!rawSite) {
                errors.push({ row: r, error: 'La sede/ubicación es obligatoria.' });
                continue;
            }
            if (!rawPuesto) {
                errors.push({ row: r, error: 'El nombre del puesto es obligatorio.' });
                continue;
            }

            const idSite = siteMap.get(normalize(rawSite));
            if (!idSite) {
                errors.push({ row: r, error: `La sede "${rawSite}" no existe en el sistema para esta empresa.` });
                continue;
            }

            const idPuesto = puestoMap.get(normalize(rawPuesto));
            if (!idPuesto) {
                errors.push({ row: r, error: `El puesto "${rawPuesto}" no existe en el sistema para esta empresa.` });
                continue;
            }

            const plazasNum = parseInt(rawPlazas, 10);
            if (isNaN(plazasNum) || plazasNum < 0) {
                errors.push({
                    row: r,
                    error: `[${rawSite} - ${rawPuesto}]: El valor de plazas "${rawPlazas}" no es válido (debe ser un número entero >= 0).`,
                });
                continue;
            }

            try {
                // Upsert idéntico a tu función update individual
                await this.prisma.relPuestosUbicaciones.upsert({
                    where: {
                        idPuesto_idSite: {
                            idPuesto: idPuesto,
                            idSite: idSite,
                        },
                    },
                    update: {
                        PlazasAutorizadas: plazasNum,
                    },
                    create: {
                        idPuesto: idPuesto,
                        idSite: idSite,
                        PlazasAutorizadas: plazasNum,
                    },
                });

                updatedCount++;
            } catch (err: any) {
                errors.push({
                    row: r,
                    error: `[${rawSite} - ${rawPuesto}]: ${err.message || 'Error al actualizar plazas'}`,
                });
            }
        }

        return {
            success: true,
            message: `Carga completada: ${updatedCount} plazas actualizadas correctamente.`,
            successCount: updatedCount,
            totalProcessed: updatedCount + errors.length,
            details: { updatedCount },
            errors,
        };
    }
}
