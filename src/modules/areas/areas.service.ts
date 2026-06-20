import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateAreaDto } from './dto/create-area.dto';
import { UpdateAreaDto } from './dto/update-area.dto';

@Injectable()
export class AreasService {
    constructor(private prismaService: PrismaService) { }

    async findAll(companyId: number, page: number, query: string, limit: number) {
        const skip = (page - 1) * limit;

        // Filtramos las áreas que tengan presencia operativa en la empresa actual a través de relAreasUbicaciones
        const whereCondition: any = {
            RelAreasUbicaciones: {
                some: {
                    OR: [
                        { CatCentroCostos: { idEmpresa: companyId } },
                        { CatSites: { idEmpresa: companyId } }
                    ]
                }
            }
        };

        // Búsqueda por texto (Query) adaptada a los campos del catálogo y las relaciones
        if (query) {
            whereCondition.OR = [
                { Descripcion: { contains: query } },
                {
                    relAreasUbicaciones: {
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

        // Consultas en paralelo optimizadas
        const [areas, total, totalActivas] = await Promise.all([
            this.prismaService.catAreas.findMany({
                where: whereCondition,
                include: {
                    RelAreasUbicaciones: {
                        where: {
                            OR: [
                                { CatSites: { idEmpresa: companyId } },
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

    async findOne(companyId: number, id: number) {
        // 1. Buscamos el área y traemos TODAS sus sedes y centros de costos vinculados de esta empresa
        const area = await this.prismaService.catAreas.findFirst({
            where: {
                idArea: id,
                RelAreasUbicaciones: {
                    some: {
                        OR: [
                            { CatSites: { idEmpresa: companyId } },
                            { CatCentroCostos: { idEmpresa: companyId } }
                        ]
                    }
                }
            },
            include: {
                RelAreasUbicaciones: {
                    where: {
                        OR: [
                            { CatSites: { idEmpresa: companyId } },
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

        // Traemos los puestos que pertenecen a esta área en esta empresa
        const dbPositions = await this.prismaService.catPuestos.findMany({
            where: {
                idArea: id,
                idEmpresa: companyId
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

    async create(companyId: number, createAreaDto: CreateAreaDto) {
        return await this.prismaService.$transaction(async (tx) => {
            // Buscar si el área ya existe como concepto global en la empresa
            let area = await tx.catAreas.findFirst({
                where: {
                    Descripcion: createAreaDto.descripcion.toUpperCase(),
                    idEmpresa: companyId
                },
            });

            // Si no existe el registro maestro, lo creamos
            if (!area) {
                area = await tx.catAreas.create({
                    data: {
                        Descripcion: createAreaDto.descripcion.toUpperCase(),
                        idEmpresa: companyId,
                        Activo: true,
                    },
                });
            }

            // Procesar las asignaciones masivas en lote si es que vienen en el payload
            if (createAreaDto.asignaciones && createAreaDto.asignaciones.length > 0) {
                for (const asignation of createAreaDto.asignaciones) {

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

    async update(companyId: number, areaId: number, updateAreaDto: UpdateAreaDto) {
        return await this.prismaService.$transaction(async (tx) => {
            const currentArea = await tx.catAreas.findFirst({
                where: { idArea: areaId, idEmpresa: companyId },
            });

            if (!currentArea) {
                throw new NotFoundException('El área operativa que intentas modificar no existe o no pertenece a esta empresa.');
            }

            // Si se envió una nueva descripción, validar duplicados globales (exceptuando la misma área)
            if (updateAreaDto.descripcion) {
                const descriptionUpper = updateAreaDto.descripcion.toUpperCase();

                const duplicateArea = await tx.catAreas.findFirst({
                    where: {
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

    async changeStatus(companyId: number, id: number, active: boolean) {
        // Verificamos si el área existe y si tiene presencia en la empresa actual
        const area = await this.prismaService.catAreas.findFirst({
            where: {
                idArea: id,
                RelAreasUbicaciones: {
                    some: {
                        OR: [
                            { CatSites: { idEmpresa: companyId } },
                            { CatCentroCostos: { idEmpresa: companyId } }
                        ]
                    }
                }
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
            throw new Error('Área no encontrada o no pertenece a la empresa actual');
        }

        // Si el usuario quiere ACTIVAR el área, validamos que al menos una de sus sedes asociadas esté activa
        if (active) {
            const tieneSitioActivo = area.RelAreasUbicaciones.some(
                (rel) => rel.CatSites && rel.CatSites.idEmpresa === companyId && rel.CatSites.Activo === true
            );

            if (!tieneSitioActivo) {
                throw new Error('No se puede activar el área porque no tiene sedes operativas o activas asociadas en esta empresa.');
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
}
