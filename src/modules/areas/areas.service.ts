import { BadRequestException, ConflictException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateAreaDto } from './dto/create-area.dto';
import { UpdateAreaDto } from './dto/update-area.dto';
import { ActiveUserDto } from '../auth/dto/active-user.dto';
import * as ExcelJS from 'exceljs';

@Injectable()
export class AreasService {
    constructor(private prismaService: PrismaService) { }

    async findAll(user: ActiveUserDto, companyId: number, page: number, query: string, limit: number) {
        const skip = (page - 1) * limit;

        // Filtramos las áreas del tenant y empresa actual
        const whereCondition: any = {
            idTenant: user.idTenant,
            idEmpresa: companyId,
        };

        // Búsqueda por texto (Query) adaptada a los campos del catálogo y las relaciones
        if (query) {
            whereCondition.OR = [
                { Descripcion: { contains: query } },
                {
                    RelAreasUbicaciones: {
                        some: {
                            OR: [
                                { Encargado: { contains: query } },
                                { Correo: { contains: query } },
                                { CatCentroCostos: { Descripcion: { contains: query } } },
                                { CatCentroCostos: { Codigo: { contains: query } } },
                                { CatSites: { Descripcion: { contains: query } } }
                            ]
                        }
                    }
                }
            ];
        }

        // Consultas en paralelo optimizadas con aislamiento por tenant y empresa
        const [areas, total, totalActivas] = await Promise.all([
            this.prismaService.catAreas.findMany({
                where: whereCondition,
                include: {
                    RelAreasUbicaciones: {
                        where: {
                            OR: [
                                { CatSites: { idEmpresa: companyId, idTenant: user.idTenant } },
                                { CatCentroCostos: { idEmpresa: companyId } }
                            ]
                        },
                        include: {
                            CatCentroCostos: true,
                            CatSites: true,
                        }
                    }
                },
                skip: skip,
                take: limit,
                orderBy: { idArea: 'desc' },
            }),
            this.prismaService.catAreas.count({ where: whereCondition }),
            this.prismaService.catAreas.count({
                where: {
                    ...whereCondition,
                    Activo: true,
                }
            })
        ]);

        // Si no hay datos, retornamos la estructura limpia por defecto
        if ((!areas || areas.length === 0) && page === 1 && !query) {
            return {
                areas: [],
                total: 0,
                currentPage: page,
                totalPages: 1,
                summary: {
                    totalActivas: 0,
                    totalAsignado: 0,
                    totalEjecutado: 0
                }
            };
        }

        // Mapeo, consolidación de presupuestos y conteo de presencia geográfica
        let globalAsignado = 0;
        let globalEjecutado = 0;

        const flattenedAreas = areas.map((area) => {
            const asignaciones = area.RelAreasUbicaciones || [];

            // Sumamos los presupuestos específicos de esta área a lo largo de todas sus sedes vinculadas
            const presupuestoAsignadoArea = asignaciones.reduce((acc, curr) => acc + Number(curr.PresupuestoAsignado || 0), 0);
            const presupuestoEjecutadoArea = asignaciones.reduce((acc, curr) => acc + Number(curr.PresupuestoEjecutado || 0), 0);

            // Acumulamos para las métricas globales del summary del pie de página de la tabla
            globalAsignado += presupuestoAsignadoArea;
            globalEjecutado += presupuestoEjecutadoArea;

            // Extraemos valores únicos de centros de costos y sedes involucradas en esta área para la vista general
            const codigosCC = Array.from(new Set(asignaciones.map(a => a.CatCentroCostos?.Codigo).filter(Boolean)));
            const nombresSites = Array.from(new Set(asignaciones.map(a => a.CatSites?.Descripcion).filter(Boolean)));

            return {
                idArea: area.idArea,
                descripcion: area.Descripcion,
                activo: area.Activo,
                totalSitesVinculados: nombresSites.length,
                presupuestoAsignado: presupuestoAsignadoArea,
                presupuestoEjecutado: presupuestoEjecutadoArea,
                codigoCentroCostos: codigosCC.length > 0 ? codigosCC.join(', ') : '—',
                siteDescripcion: nombresSites.length > 0 ? nombresSites.join(', ') : 'Sin Sedes',
            };
        });

        return {
            areas: flattenedAreas,
            total,
            currentPage: page,
            totalPages: Math.ceil(total / limit) || 1,
            summary: {
                totalActivas: totalActivas || 0,
                totalAsignado: globalAsignado,
                totalEjecutado: globalEjecutado
            }
        };
    }

    async findOne(user: ActiveUserDto, companyId: number, id: number) {
        // 1. Buscamos el área y traemos TODAS sus sedes y centros de costos vinculados de esta empresa y tenant
        const area = await this.prismaService.catAreas.findFirst({
            where: {
                idArea: id,
                idTenant: user.idTenant,
                idEmpresa: companyId,
            },
            include: {
                RelAreasUbicaciones: {
                    where: {
                        OR: [
                            { CatSites: { idEmpresa: companyId, idTenant: user.idTenant } },
                            { CatCentroCostos: { idEmpresa: companyId } }
                        ]
                    },
                    include: {
                        CatSites: {
                            select: {
                                idSite: true,
                                Descripcion: true,
                                Activo: true
                            }
                        },
                        CatCentroCostos: {
                            select: {
                                idCentroCostos: true,
                                Codigo: true,
                                Descripcion: true
                            }
                        }
                    }
                }
            }
        });

        if (!area) throw new NotFoundException(`Área no encontrada o no pertenece a la empresa actual.`);

        // Traemos los puestos que pertenecen a esta área en esta empresa y tenant
        const dbPositions = await this.prismaService.catPuestos.findMany({
            where: {
                idArea: id,
                idEmpresa: companyId,
                idTenant: user.idTenant,
            },
            select: {
                idPuesto: true,
                NombrePuesto: true,
                DescripcionPuesto: true,
                idSite: true,
                CatSites: {
                    select: {
                        Descripcion: true
                    }
                },
                CatNivelesSalario: {
                    select: {
                        SalarioMinimo: true,
                        SalarioMaximo: true
                    }
                }
            },
        });

        // Mapeamos los puestos de forma limpia para que el Front los pinte en una linda tabla de detalles
        const positions = dbPositions.map(position => {
            const nivelSalario = (position as any).CatNivelesSalario || (position as any).catNivelesSalario;
            const site = (position as any).CatSites || (position as any).catSites;

            return {
                idPuesto: position.idPuesto,
                NombrePuesto: position.NombrePuesto,
                DescripcionPuesto: position.DescripcionPuesto,
                idSite: position.idSite,
                siteDescripcion: site?.Descripcion ?? 'Sin Sede Asignada',
                SalarioMinimo: nivelSalario?.SalarioMinimo ?? 0.00,
                SalarioMaximo: nivelSalario?.SalarioMaximo ?? 0.00,
            };
        });

        // Aplanamos la información del área y sus ubicaciones en una estructura cómoda para tus formularios del Front
        const formattedArea = {
            idArea: area.idArea,
            descripcion: area.Descripcion,
            activo: area.Activo,
            ubicacionesVinculadas: area.RelAreasUbicaciones.map(rel => {
                const s = (rel as any).CatSites || (rel as any).catSites;
                const cc = (rel as any).CatCentroCostos || (rel as any).catCentroCostos;

                return {
                    idRelAreaUbicacion: (rel as any).idRelAreaUbicacion || (rel as any).idAreaUbicacion || 0,
                    idSite: rel.idSite,
                    siteDescripcion: s?.Descripcion ?? '—',
                    siteActivo: s?.Activo ?? false,
                    idCentroCostos: rel.idCentroCostos,
                    centroCostosCodigo: cc?.Codigo ?? '',
                    centroCostosDescripcion: cc?.Descripcion ?? '',
                    encargado: rel.Encargado ?? '',
                    correo: rel.Correo ?? '',
                    presupuestoAsignado: rel.PresupuestoAsignado ?? 0,
                    presupuestoEjecutado: rel.PresupuestoEjecutado ?? 0,
                };
            })
        };

        return {
            area: formattedArea,
            positions
        };
    }

    async create(user: ActiveUserDto, companyId: number, createAreaDto: CreateAreaDto) {
        return await this.prismaService.$transaction(async (tx) => {
            // Buscar si el área ya existe como concepto global en la empresa para este tenant
            let area = await tx.catAreas.findFirst({
                where: {
                    idTenant: user.idTenant,
                    Descripcion: createAreaDto.descripcion.toUpperCase(),
                    idEmpresa: companyId
                },
            });

            // Si no existe el registro maestro, lo creamos asignando el idTenant
            if (!area) {
                area = await tx.catAreas.create({
                    data: {
                        idTenant: user.idTenant,
                        Descripcion: createAreaDto.descripcion.toUpperCase(),
                        idEmpresa: companyId,
                        Activo: true,
                    },
                });
            }

            // Procesar las asignaciones masivas en lote si es que vienen en el payload
            if (createAreaDto.asignaciones && createAreaDto.asignaciones.length > 0) {
                for (const asignation of createAreaDto.asignaciones) {
                    // Validar que la sede (Site) pertenezca a la empresa y al tenant
                    const site = await tx.catSites.findFirst({
                        where: {
                            idSite: asignation.idSite,
                            idEmpresa: companyId,
                            idTenant: user.idTenant,
                        }
                    });

                    if (!site) {
                        throw new NotFoundException(
                            `La sucursal (Site) ID ${asignation.idSite} no pertenece a esta empresa o no existe.`
                        );
                    }

                    // Si el usuario seleccionó un centro de costos, validamos presupuestos
                    if (asignation.idCentroCostos) {
                        const costCenter = await tx.catCentroCostos.findFirst({
                            where: {
                                idCentroCostos: asignation.idCentroCostos,
                                idEmpresa: companyId,
                            },
                            include: {
                                RelAreasUbicaciones: true,
                            },
                        });

                        if (!costCenter) {
                            throw new NotFoundException(
                                `El centro de costos ID ${asignation.idCentroCostos} no pertenece a esta empresa o no existe.`
                            );
                        }

                        // Verificar si el área ya está registrada ESPECÍFICAMENTE en este Site dentro de la tabla intermedia
                        const isAreaDuplicateInSite = costCenter.RelAreasUbicaciones.some(
                            (au) => au.idArea === area.idArea && au.idSite === asignation.idSite
                        );

                        if (isAreaDuplicateInSite) {
                            throw new ConflictException(
                                `El área ya se encuentra vinculada a esta sucursal (Site) con ese Centro de Costos.`
                            );
                        }

                        // Calcular el presupuesto total asignado a otras áreas en este Centro de Costos
                        const totalAsignadoOtrasAreas = costCenter.RelAreasUbicaciones.reduce(
                            (acc, au) => acc + Number(au.PresupuestoAsignado || 0), 0
                        );

                        const presupuestoAnualCentro = Number(costCenter.PresupuestoAnual || 0);
                        const presupuestoDisponibleCentro = presupuestoAnualCentro - totalAsignadoOtrasAreas;

                        // Si el presupuesto solicitado excede el disponible del centro de costos, disparamos el error
                        if (asignation.presupuestoAsignado > presupuestoDisponibleCentro) {
                            throw new BadRequestException(
                                `Excedente Presupuestal. El centro de costos (${costCenter.Codigo}) solo cuenta con un saldo disponible de $${presupuestoDisponibleCentro} MXN ` +
                                `y se intentó asignar $${asignation.presupuestoAsignado} MXN para la sede.`
                            );
                        }
                    }

                    // Registrar la relación en la nueva tabla intermedia transaccional
                    await tx.relAreasUbicaciones.create({
                        data: {
                            idArea: area.idArea,
                            idSite: asignation.idSite,
                            idCentroCostos: asignation.idCentroCostos ? Number(asignation.idCentroCostos) : null,
                            PresupuestoAsignado: asignation.presupuestoAsignado || 0.00,
                            PresupuestoEjecutado: 0.00,
                            Encargado: asignation.encargado || null,
                            Correo: asignation.correo || null,
                            Telefono: asignation.telefono || null,
                            Extension: asignation.extension || null,
                            Activo: true,
                        },
                    });
                }
            }

            return { message: 'Catálogo de área y asignaciones geográficas procesadas con éxito.' };
        });
    }

    async update(user: ActiveUserDto, companyId: number, areaId: number, updateAreaDto: UpdateAreaDto) {
        return await this.prismaService.$transaction(async (tx) => {
            const currentArea = await tx.catAreas.findFirst({
                where: { idArea: areaId, idTenant: user.idTenant, idEmpresa: companyId },
            });

            if (!currentArea) {
                throw new NotFoundException('El área operativa que intentas modificar no existe o no pertenece a esta empresa.');
            }

            // Si se envió una nueva descripción, validar duplicados dentro del tenant en la empresa (exceptuando la misma área)
            if (updateAreaDto.descripcion) {
                const descriptionUpper = updateAreaDto.descripcion.toUpperCase();

                const duplicateArea = await tx.catAreas.findFirst({
                    where: {
                        idTenant: user.idTenant,
                        Descripcion: descriptionUpper,
                        idEmpresa: companyId,
                        NOT: { idArea: areaId }
                    }
                });

                if (duplicateArea) {
                    throw new ConflictException(`El área "${updateAreaDto.descripcion}" ya se encuentra registrada en la empresa.`);
                }

                await tx.catAreas.update({
                    where: { idArea: areaId },
                    data: { Descripcion: descriptionUpper }
                });
            }

            if (updateAreaDto.asignaciones) {
                // Validar que las sedes (Sites) pertenezcan al tenant y a la empresa
                for (const asignation of updateAreaDto.asignaciones) {
                    const site = await tx.catSites.findFirst({
                        where: {
                            idSite: asignation.idSite,
                            idEmpresa: companyId,
                            idTenant: user.idTenant,
                        }
                    });

                    if (!site) {
                        throw new NotFoundException(
                            `La sucursal (Site) ID ${asignation.idSite} no pertenece a esta empresa o no existe.`
                        );
                    }
                }

                // Paso A: Limpiar las asignaciones anteriores para esta área 
                await tx.relAreasUbicaciones.deleteMany({
                    where: { idArea: areaId }
                });

                // Paso B: Validar e insertar las nuevas asignaciones
                for (const asignation of updateAreaDto.asignaciones) {

                    if (asignation.idCentroCostos) {
                        const costCenter = await tx.catCentroCostos.findFirst({
                            where: {
                                idCentroCostos: asignation.idCentroCostos,
                                idEmpresa: companyId,
                            },
                            include: {
                                RelAreasUbicaciones: {
                                    where: {
                                        NOT: { idArea: areaId }
                                    }
                                }
                            },
                        });

                        if (!costCenter) {
                            throw new NotFoundException(
                                `El centro de costos ID ${asignation.idCentroCostos} no pertenece a esta empresa o no existe.`
                            );
                        }

                        // Calcular el presupuesto acumulado por OTRAS áreas en este centro de costos
                        const totalAsignadoOtrasAreas = costCenter.RelAreasUbicaciones.reduce(
                            (acc, au) => acc + Number(au.PresupuestoAsignado || 0), 0
                        );

                        const presupuestoAnualCentro = Number(costCenter.PresupuestoAnual || 0);
                        const presupuestoDisponibleCentro = presupuestoAnualCentro - totalAsignadoOtrasAreas;

                        // Validar excedente
                        if (asignation.presupuestoAsignado > presupuestoDisponibleCentro) {
                            throw new BadRequestException(
                                `Excedente Presupuestal. El centro de costos (${costCenter.Codigo}) solo cuenta con un saldo disponible de $${presupuestoDisponibleCentro} MXN ` +
                                `y se intentó asignar $${asignation.presupuestoAsignado} MXN para la sede.`
                            );
                        }
                    }

                    // Insertar el registro en la intermedia
                    await tx.relAreasUbicaciones.create({
                        data: {
                            idArea: areaId,
                            idSite: asignation.idSite,
                            idCentroCostos: asignation.idCentroCostos ? Number(asignation.idCentroCostos) : null,
                            PresupuestoAsignado: asignation.presupuestoAsignado || 0.00,
                            PresupuestoEjecutado: 0.00,
                            Encargado: asignation.encargado || null,
                            Correo: asignation.correo || null,
                            Telefono: asignation.telefono || null,
                            Extension: asignation.extension || null,
                            Activo: true,
                        },
                    });
                }
            }

            return { message: 'Área operativa y sus asignaciones actualizadas con éxito.' };
        });
    }

    async changeStatus(user: ActiveUserDto, companyId: number, id: number, active: boolean) {
        // Verificamos si el área existe y si pertenece al tenant y empresa actual
        const area = await this.prismaService.catAreas.findFirst({
            where: {
                idArea: id,
                idTenant: user.idTenant,
                idEmpresa: companyId,
            },
            include: {
                RelAreasUbicaciones: {
                    include: {
                        CatSites: true
                    }
                }
            }
        });

        if (!area) {
            throw new NotFoundException('Área no encontrada o no pertenece a la empresa actual');
        }

        // Si el usuario quiere ACTIVAR el área, validamos que al menos una de sus sedes asociadas esté activa
        if (active) {
            const tieneSitioActivo = area.RelAreasUbicaciones.some(
                (rel) => rel.CatSites && rel.CatSites.idEmpresa === companyId && rel.CatSites.Activo === true
            );

            if (!tieneSitioActivo) {
                throw new BadRequestException('No se puede activar el área porque no tiene sedes operativas o activas asociadas en esta empresa.');
            }
        }

        // Si pasa las validaciones (o si es una desactivación directa), actualizamos el estatus
        await this.prismaService.catAreas.update({
            where: { idArea: id },
            data: {
                Activo: active
            },
        });

        return {
            message: active ? 'Área activada correctamente' : 'Área desactivada correctamente'
        };
    }

    // Genera la plantilla excel para carga de áreas y centros de costos
    async generateBulkTemplate(companyId: number, user: ActiveUserDto): Promise<Buffer> {
        if (!user.idTenant) throw new InternalServerErrorException('El usuario no tiene un tenant asignado.');

        // Consultar centros de costos, áreas maestras y ubicaciones activas
        const [centrosExistentes, areasExistentes, ubicaciones] = await Promise.all([
            this.prismaService.catCentroCostos.findMany({
                where: { idEmpresa: companyId, idTenant: user.idTenant, Activo: true },
                select: { Codigo: true, Descripcion: true, PresupuestoAnual: true },
                orderBy: { Codigo: 'asc' },
            }),
            this.prismaService.catAreas.findMany({
                where: { idEmpresa: companyId, idTenant: user.idTenant, Activo: true },
                select: { Descripcion: true },
                orderBy: { Descripcion: 'asc' },
            }),
            this.prismaService.catSites.findMany({
                where: { idEmpresa: companyId, idTenant: user.idTenant, Activo: true },
                select: { idSite: true, Descripcion: true },
                orderBy: { Descripcion: 'asc' },
            }),
        ]);

        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'Talent Core';
        workbook.created = new Date();

        const styleHeader = (row: ExcelJS.Row, colorHex: string = 'FF1E293B') => {
            row.height = 28;
            row.eachCell((cell) => {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colorHex } };
                cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
                cell.alignment = { vertical: 'middle', horizontal: 'center' };
            });
        };

        const cleanDecimal = (val: any): number => {
            if (val === null || val === undefined) return 0.00;
            const strVal = String(val).replace(/["'\s]/g, '').trim();
            const num = parseFloat(strVal);
            return isNaN(num) ? 0.00 : num;
        };

        // ── HOJA 0: CATÁLOGOS (OCULTA CON SITES) ──
        const sheetCat = workbook.addWorksheet('Catalogos');
        sheetCat.state = 'veryHidden';
        sheetCat.getCell('A1').value = 'Ubicaciones';
        ubicaciones.forEach((u, idx) => {
            if (u.Descripcion) {
                sheetCat.getCell(`A${idx + 2}`).value = u.Descripcion.trim();
            }
        });
        const totalUbicaciones = ubicaciones.filter(u => !!u.Descripcion).length;

        // ── HOJA 1: CENTROS DE COSTOS ──
        const sheetCC = workbook.addWorksheet('Centros de Costos');
        sheetCC.columns = [
            { header: 'Código del Centro de Costos *', key: 'codigo', width: 30 },
            { header: 'Descripción *', key: 'descripcion', width: 40 },
            { header: 'Presupuesto Anual (MXN) *', key: 'presupuestoAnual', width: 28, style: { numFmt: '#,##0.00' } },
        ];
        styleHeader(sheetCC.getRow(1), 'FF3B82F6'); // Azul

        centrosExistentes.forEach((cc) => {
            sheetCC.addRow({
                codigo: String(cc.Codigo || '').replace(/["']/g, '').trim(),
                descripcion: String(cc.Descripcion || '').replace(/["']/g, '').trim(),
                presupuestoAnual: cleanDecimal(cc.PresupuestoAnual),
            });
        });

        if (centrosExistentes.length === 0) {
            const sampleCC = sheetCC.addRow({
                codigo: 'CC-RH-01',
                descripcion: 'Centro de Costos de Recursos Humanos',
                presupuestoAnual: 500000.00,
            });
            sampleCC.font = { italic: true, color: { argb: 'FF64748B' } };
        }

        // ── HOJA 2: CATÁLOGO DE ÁREAS ──
        const sheetCatAreas = workbook.addWorksheet('Catálogo de Áreas');
        sheetCatAreas.columns = [
            { header: 'Nombre del Área Operativa *', key: 'nombreArea', width: 40 },
        ];
        styleHeader(sheetCatAreas.getRow(1), 'FF0D9488'); // Teal

        areasExistentes.forEach((a) => {
            if (a.Descripcion) {
                sheetCatAreas.addRow({
                    nombreArea: a.Descripcion.toUpperCase().trim(),
                });
            }
        });

        if (areasExistentes.length === 0) {
            const sampleAreaName = sheetCatAreas.addRow({
                nombreArea: 'RECURSOS HUMANOS',
            });
            sampleAreaName.font = { italic: true, color: { argb: 'FF64748B' } };
        }

        // ── HOJA 3: ASIGNACIONES DE ÁREAS POR SEDE ──
        const sheetAreas = workbook.addWorksheet('Asignaciones de Areas');
        sheetAreas.columns = [
            { header: 'Nombre del Área *', key: 'nombreArea', width: 34 },
            { header: 'Ubicación / Sede *', key: 'ubicacion', width: 34 },
            { header: 'Código Centro de Costos *', key: 'centroCostos', width: 30 },
            { header: 'Presupuesto Asignado a la Sede *', key: 'presupuesto', width: 34, style: { numFmt: '#,##0.00' } },
            { header: 'Encargado / Responsable', key: 'encargado', width: 30 },
            { header: 'Correo Electrónico', key: 'correo', width: 32 },
            { header: 'Teléfono', key: 'telefono', width: 20 },
            { header: 'Extensión', key: 'extension', width: 16 },
        ];
        styleHeader(sheetAreas.getRow(1), 'FF8B5CF6'); // Púrpura

        const primerCC = centrosExistentes[0]?.Codigo || 'CC-RH-01';
        const primeraUbicacion = ubicaciones[0]?.Descripcion || 'CORPORATIVO CENTRAL';
        const primerArea = areasExistentes[0]?.Descripcion || 'RECURSOS HUMANOS';

        const sampleArea = sheetAreas.addRow({
            nombreArea: primerArea,
            ubicacion: primeraUbicacion,
            centroCostos: primerCC,
            presupuesto: 150000.00,
            encargado: 'Lic. Laura Martínez',
            correo: 'laura.martinez@empresa.com',
            telefono: '5512345678',
            extension: '101',
        });
        sampleArea.font = { italic: true, color: { argb: 'FF64748B' } };

        // Validaciones dinámicas
        for (let row = 2; row <= 400; row++) {
            // Columna A: Nombre del Área (Apunta a la Hoja 2 Catálogo de Áreas)
            sheetAreas.getCell(`A${row}`).dataValidation = {
                type: 'list',
                allowBlank: false,
                formulae: ["'Catálogo de Áreas'!$A$2:$A$150"],
                showErrorMessage: true,
                errorTitle: 'Área no válida',
                error: 'Selecciona o añade primero el área en la pestaña "Catálogo de Áreas".',
            };

            // Columna B: Ubicación / Sede (Apunta a la hoja Catalogos oculta)
            if (totalUbicaciones > 0) {
                sheetAreas.getCell(`B${row}`).dataValidation = {
                    type: 'list',
                    allowBlank: false,
                    formulae: [`Catalogos!$A$2:$A$${totalUbicaciones + 1}`],
                    showErrorMessage: true,
                    errorTitle: 'Ubicación no válida',
                    error: 'Selecciona una sede válida de la lista desplegable.',
                };
            }

            // Columna C: Centro de Costos (Apunta a la Hoja 1 de Centros de Costos)
            sheetAreas.getCell(`C${row}`).dataValidation = {
                type: 'list',
                allowBlank: false,
                formulae: ["'Centros de Costos'!$A$2:$A$150"],
                showErrorMessage: true,
                errorTitle: 'Centro de costos no válido',
                error: 'Selecciona un centro de costos configurado en la primera hoja.',
            };
        }

        const uint8Array = await workbook.xlsx.writeBuffer();
        return Buffer.from(uint8Array);
    }

    // Procesa la plantilla excel con las áreas y centros de costos
    async processBulkAreas(companyId: number, file: Express.Multer.File, user: ActiveUserDto) {
        if (!user.idTenant) throw new InternalServerErrorException('El usuario no tiene un tenant asignado.');
        const idTenant = user.idTenant;

        const workbook = new ExcelJS.Workbook();
        try {
            await workbook.xlsx.load(file.buffer as any);
        } catch {
            throw new BadRequestException('El archivo Excel es inválido o está dañado.');
        }

        const sheetCC = workbook.getWorksheet('Centros de Costos');
        const sheetCatAreas = workbook.getWorksheet('Catálogo de Áreas');
        const sheetAreas = workbook.getWorksheet('Asignaciones de Areas');

        if (!sheetAreas) {
            throw new BadRequestException('El archivo debe incluir la hoja "Asignaciones de Areas".');
        }

        const errors: { row: number; error: string }[] = [];
        let createdCC = 0;
        let reusedCC = 0;
        let createdAreasMaster = 0;
        let reusedAreasMaster = 0;
        let createdAssignments = 0;

        // Mapas de resolución en memoria
        const ccMap = new Map<string, { idCentroCostos: number; presupuestoTotal: number; asignado: number }>();
        const siteMap = new Map<string, number>(); // Descripcion (lowercase) -> idSite
        const areaMasterMap = new Map<string, number>(); // Descripcion (uppercase) -> idArea

        // Precargar Sites, Áreas y Centros de Costos existentes
        const [existingSites, existingAreas, existingCCs] = await Promise.all([
            this.prismaService.catSites.findMany({
                where: { idEmpresa: companyId, idTenant },
                select: { idSite: true, Descripcion: true },
            }),
            this.prismaService.catAreas.findMany({
                where: { idEmpresa: companyId, idTenant },
                select: { idArea: true, Descripcion: true },
            }),
            this.prismaService.catCentroCostos.findMany({
                where: { idEmpresa: companyId, idTenant },
                include: { RelAreasUbicaciones: true },
            }),
        ]);

        existingSites.forEach((s) => {
            if (s.Descripcion) {
                siteMap.set(s.Descripcion.toLowerCase().trim(), s.idSite);
            }
        });

        existingAreas.forEach((a) => {
            if (a.Descripcion) {
                areaMasterMap.set(a.Descripcion.toUpperCase().trim(), a.idArea);
            }
        });

        existingCCs.forEach((cc) => {
            if (cc.Codigo) {
                const asignadoActual = cc.RelAreasUbicaciones.reduce(
                    (acc, rel) => acc + Number(rel.PresupuestoAsignado || 0),
                    0,
                );
                ccMap.set(cc.Codigo.toUpperCase().trim(), {
                    idCentroCostos: cc.idCentroCostos,
                    presupuestoTotal: Number(cc.PresupuestoAnual || 0),
                    asignado: asignadoActual,
                });
            }
        });

        // ─────────────────────────────────────────────────────────────
        // PASO 1: PROCESAR HOJA DE CENTROS DE COSTOS
        // ─────────────────────────────────────────────────────────────
        if (sheetCC) {
            for (let rowNumber = 2; rowNumber <= sheetCC.rowCount; rowNumber++) {
                const row = sheetCC.getRow(rowNumber);
                const rawCodigo = row.getCell(1).text?.replace(/["']/g, '').trim().toUpperCase();
                const rawDesc = row.getCell(2).text?.replace(/["']/g, '').trim();
                const rawPresupuesto = row.getCell(3).text?.replace(/["'\s]/g, '').trim();

                if (!rawCodigo) continue;

                const presupuestoNum = (!rawPresupuesto || isNaN(Number(rawPresupuesto))) ? 0.00 : Number(rawPresupuesto);

                if (!ccMap.has(rawCodigo)) {
                    try {
                        const nuevoCC = await this.prismaService.catCentroCostos.create({
                            data: {
                                idTenant,
                                idEmpresa: companyId,
                                Codigo: rawCodigo,
                                Descripcion: rawDesc || `Centro de costos ${rawCodigo}`,
                                PresupuestoAnual: presupuestoNum,
                                PresupuestoEjecutado: 0.00,
                                Activo: true,
                                FechaCreacion: new Date(),
                            },
                        });

                        ccMap.set(rawCodigo, {
                            idCentroCostos: nuevoCC.idCentroCostos,
                            presupuestoTotal: presupuestoNum,
                            asignado: 0.00,
                        });
                        createdCC++;
                    } catch (err: any) {
                        errors.push({
                            row: rowNumber,
                            error: `[Centro de Costos ${rawCodigo}]: ${err.message || 'Error al registrar'}`,
                        });
                    }
                } else {
                    reusedCC++;
                }
            }
        }

        // ─────────────────────────────────────────────────────────────
        // PASO 2: PROCESAR HOJA DE CATÁLOGO DE ÁREAS (NUEVAS O EXISTENTES)
        // ─────────────────────────────────────────────────────────────
        if (sheetCatAreas) {
            for (let rowNumber = 2; rowNumber <= sheetCatAreas.rowCount; rowNumber++) {
                const row = sheetCatAreas.getRow(rowNumber);
                const rawArea = row.getCell(1).text?.replace(/["']/g, '').trim().toUpperCase();

                if (!rawArea) continue;

                if (!areaMasterMap.has(rawArea)) {
                    try {
                        const nuevaArea = await this.prismaService.catAreas.create({
                            data: {
                                idTenant,
                                idEmpresa: companyId,
                                Descripcion: rawArea,
                                Activo: true,
                            },
                        });
                        areaMasterMap.set(rawArea, nuevaArea.idArea);
                        createdAreasMaster++;
                    } catch (err: any) {
                        errors.push({
                            row: rowNumber,
                            error: `[Catálogo de Áreas - ${rawArea}]: ${err.message || 'Error al registrar el área maestra'}`,
                        });
                    }
                } else {
                    reusedAreasMaster++;
                }
            }
        }

        // ─────────────────────────────────────────────────────────────
        // PASO 3: PROCESAR HOJA DE ASIGNACIONES DE ÁREAS POR SEDE
        // ─────────────────────────────────────────────────────────────
        for (let rowNumber = 2; rowNumber <= sheetAreas.rowCount; rowNumber++) {
            const row = sheetAreas.getRow(rowNumber);

            const rawArea = row.getCell(1).text?.replace(/["']/g, '').trim().toUpperCase();
            const rawUbicacion = row.getCell(2).text?.replace(/["']/g, '').trim().toLowerCase();
            const rawCC = row.getCell(3).text?.replace(/["']/g, '').trim().toUpperCase();
            const rawPresupuesto = row.getCell(4).text?.replace(/["'\s]/g, '').trim();
            const encargado = row.getCell(5).text?.replace(/["']/g, '').trim() || null;
            const correo = row.getCell(6).text?.replace(/["']/g, '').trim() || null;
            const telefono = row.getCell(7).text?.replace(/["']/g, '').trim() || null;
            const extension = row.getCell(8).text?.replace(/["']/g, '').trim() || null;

            if (!rawArea && !rawUbicacion) continue;

            if (!rawArea) {
                errors.push({ row: rowNumber, error: '[Asignaciones]: El nombre del área es obligatorio.' });
                continue;
            }
            if (!rawUbicacion) {
                errors.push({ row: rowNumber, error: `[Asignación ${rawArea}]: La ubicación / sede es obligatoria.` });
                continue;
            }

            // Validar existencia de la sede
            const idSite = siteMap.get(rawUbicacion);
            if (!idSite) {
                errors.push({
                    row: rowNumber,
                    error: `[Asignación ${rawArea}]: La sede "${row.getCell(2).text}" no existe en el sistema.`,
                });
                continue;
            }

            // Validar existencia del Centro de Costos
            const ccData = rawCC ? ccMap.get(rawCC) : null;
            if (rawCC && !ccData) {
                errors.push({
                    row: rowNumber,
                    error: `[Asignación ${rawArea}]: El centro de costos "${rawCC}" no existe ni pudo ser creado.`,
                });
                continue;
            }

            const presupuestoAsignado = (!rawPresupuesto || isNaN(Number(rawPresupuesto))) ? 0.00 : Number(rawPresupuesto);

            // Validar saldo presupuestal disponible
            if (ccData) {
                const disponible = ccData.presupuestoTotal - ccData.asignado;
                if (presupuestoAsignado > disponible) {
                    errors.push({
                        row: rowNumber,
                        error: `[Asignación ${rawArea} en ${row.getCell(2).text}]: Excedente presupuestal. El centro (${rawCC}) solo cuenta con $${disponible.toFixed(2)} disponibles y se intentó asignar $${presupuestoAsignado.toFixed(2)}.`,
                    });
                    continue;
                }
            }

            try {
                await this.prismaService.$transaction(async (tx) => {
                    // Obtener el ID del área (crear sobre la marcha si no venía en la hoja de catálogo)
                    let idArea = areaMasterMap.get(rawArea);
                    if (!idArea) {
                        const nuevaArea = await tx.catAreas.create({
                            data: {
                                idTenant,
                                idEmpresa: companyId,
                                Descripcion: rawArea,
                                Activo: true,
                            },
                        });
                        idArea = nuevaArea.idArea;
                        areaMasterMap.set(rawArea, idArea);
                        createdAreasMaster++;
                    }

                    // Evitar duplicar el área en la misma sucursal
                    const relacionExistente = await tx.relAreasUbicaciones.findFirst({
                        where: {
                            idArea,
                            idSite,
                        },
                    });

                    if (relacionExistente) {
                        throw new ConflictException(`El área ya se encuentra asignada a esta sucursal.`);
                    }

                    // Registrar asignación física y financiera
                    await tx.relAreasUbicaciones.create({
                        data: {
                            idArea,
                            idSite,
                            idCentroCostos: ccData ? ccData.idCentroCostos : null,
                            PresupuestoAsignado: presupuestoAsignado,
                            PresupuestoEjecutado: 0.00,
                            Encargado: encargado,
                            Correo: correo,
                            Telefono: telefono,
                            Extension: extension,
                            Activo: true,
                        },
                    });

                    // Descontar presupuesto en memoria para las filas subsiguientes
                    if (ccData) {
                        ccData.asignado += presupuestoAsignado;
                    }
                });

                createdAssignments++;
            } catch (err: any) {
                errors.push({
                    row: rowNumber,
                    error: `[Asignación ${rawArea} en ${row.getCell(2).text}]: ${err.message || 'Error al procesar la asignación'}`,
                });
            }
        }

        // Resumen estructurado para la notificación toast
        const parts: string[] = [`${createdAssignments} asignaciones creadas`];
        if (createdAreasMaster > 0) parts.push(`${createdAreasMaster} áreas maestras nuevas`);
        else if (reusedAreasMaster > 0) parts.push(`${reusedAreasMaster} áreas existentes asociadas`);

        if (createdCC > 0) parts.push(`${createdCC} centros de costos nuevos`);
        else if (reusedCC > 0) parts.push(`${reusedCC} centros de costos vinculados`);

        return {
            success: true,
            message: `Carga completada: ${parts.join(', ')}.`,
            successCount: createdAssignments,
            totalProcessed: createdAssignments + errors.length,
            details: { createdAssignments, createdAreasMaster, reusedAreasMaster, createdCC, reusedCC },
            errors,
        };
    }
}
