import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateCostCenterDto } from './dto/create-cost-center.dto';
import { UpdateCostCenterDto } from './dto/update-cost-center.dto';

@Injectable()
export class CostCenterService {
    private readonly logger = new Logger(CostCenterService.name);

    constructor(private prismaService: PrismaService) { }

    async findAll(companyId: number, page: number, query: string, limit: number) {
        const skip = (page - 1) * limit;

        const whereCondition: any = {
            idEmpresa: companyId,
        };

        if (query) {
            whereCondition.OR = [
                { Descripcion: { contains: query } },
                { Codigo: { contains: query } },
            ];
        }

        const [costCenters, total, metrics] = await Promise.all([
            this.prismaService.catCentroCostos.findMany({
                where: whereCondition,
                include: {
                    _count: {
                        select: { RelAreasUbicaciones: true },
                    },
                },
                skip: skip,
                take: limit,
                orderBy: { idCentroCostos: 'desc' },
            }),
            this.prismaService.catCentroCostos.count({ where: whereCondition }),
            this.prismaService.catCentroCostos.aggregate({
                where: whereCondition,
                _sum: {
                    PresupuestoAnual: true,
                    PresupuestoEjecutado: true,
                }
            })
        ]);

        if ((!costCenters || costCenters.length === 0) && page === 1 && !query) {
            return {
                costCenters: [],
                total: 0,
                currentPage: page,
                totalPages: 1,
                summary: {
                    totalAnualGlobal: 0,
                    totalEjecutadoGlobal: 0,
                    totalDisponibleGlobal: 0
                }
            };
        }

        const flattenedCostCenters = costCenters.map((cc) => {
            const { _count, ...ccData } = cc;
            return {
                ...ccData,
                totalAreas: _count?.RelAreasUbicaciones || 0,
            };
        });

        const totalAnualGlobal = Number(metrics._sum.PresupuestoAnual || 0);
        const totalEjecutadoGlobal = Number(metrics._sum.PresupuestoEjecutado || 0);

        return {
            costCenters: flattenedCostCenters,
            total,
            currentPage: page,
            totalPages: Math.ceil(total / limit) || 1,
            summary: {
                totalAnualGlobal,
                totalEjecutadoGlobal,
                totalDisponibleGlobal: totalAnualGlobal - totalEjecutadoGlobal,
            }
        };
    }

    async findOne(companyId: number, id: number) {
        const costCenter = await this.prismaService.catCentroCostos.findFirst({
            where: { idCentroCostos: id, idEmpresa: companyId },
            include: {
                RelAreasUbicaciones: {
                    select: {
                        PresupuestoAsignado: true,
                        PresupuestoEjecutado: true,
                        Encargado: true,
                        Activo: true,
                        // Traemos el catálogo maestro del área
                        CatAreas: {
                            select: {
                                idArea: true,
                                Descripcion: true,
                            }
                        },
                        // Traemos la sucursal (Site) vinculada
                        CatSites: {
                            select: {
                                idSite: true,
                                Descripcion: true,
                            }
                        }
                    }
                },
                _count: {
                    select: { RelAreasUbicaciones: true },
                },
            },
        });

        if (!costCenter) throw new NotFoundException(`Centro de costo no encontrado`);

        const { _count, RelAreasUbicaciones, ...ccData } = costCenter;

        const mappedAreas = (RelAreasUbicaciones || []).map((rel) => ({
            idArea: rel.CatAreas?.idArea,
            Descripcion: rel.CatAreas?.Descripcion || '—',
            idSite: rel.CatSites?.idSite,
            siteDescripcion: rel.CatSites?.Descripcion || '—',
            Encargado: rel.Encargado,
            PresupuestoAsignado: rel.PresupuestoAsignado,
            PresupuestoEjecutado: rel.PresupuestoEjecutado,
            Activo: rel.Activo,
        }));

        return {
            ...ccData,
            totalAreas: _count?.RelAreasUbicaciones || 0,
            CatAreas: mappedAreas
        };
    }

    async create(companyId: number, createCostCenterDto: CreateCostCenterDto) {
        const existingCC = await this.prismaService.catCentroCostos.findFirst({
            where: {
                idEmpresa: companyId,
                Codigo: createCostCenterDto.Codigo,
            },
        });

        if (existingCC) {
            throw new ConflictException(
                `El código "${createCostCenterDto.Codigo}" ya está asignado a otro centro de costos en esta empresa.`,
            );
        }

        await this.prismaService.catCentroCostos.create({
            data: {
                idEmpresa: companyId,
                Codigo: createCostCenterDto.Codigo,
                Descripcion: createCostCenterDto.Descripcion,
                PresupuestoAnual: createCostCenterDto.PresupuestoAnual,
                PresupuestoEjecutado: 0.00,
                Activo: true,
                FechaCreacion: new Date()
            },
        });

        return { message: 'Centro de costos registrado con éxito.' };
    }

    async update(companyId: number, costCenterId: number, updateCostCenterDto: UpdateCostCenterDto) {
        const currentCC = await this.prismaService.catCentroCostos.findFirst({
            where: {
                idCentroCostos: costCenterId,
                idEmpresa: companyId,
            },
            include: {
                RelAreasUbicaciones: true,
            },
        });

        if (!currentCC) throw new NotFoundException('El centro de costos solicitado no existe en esta empresa.');

        // Validación de duplicado de código
        if (currentCC.Codigo !== updateCostCenterDto.Codigo) {
            const codeDuplicate = await this.prismaService.catCentroCostos.findFirst({
                where: {
                    idEmpresa: companyId,
                    Codigo: updateCostCenterDto.Codigo,
                    NOT: {
                        idCentroCostos: costCenterId,
                    },
                },
            });

            if (codeDuplicate) throw new ConflictException(
                `El código "${updateCostCenterDto.Codigo}" ya pertenece a otro centro de costos registrado.`,
            );
        }

        // Calculamos el dinero total distribuido sumando los registros de la tabla intermedia
        const totalDistribuidoAreas = (currentCC.RelAreasUbicaciones || []).reduce(
            (acc, rel) => acc + Number(rel.PresupuestoAsignado || 0), 0
        );

        // Validamos que el nuevo techo financiero anual no sea menor a lo ya repartido
        if (updateCostCenterDto.PresupuestoAnual < totalDistribuidoAreas) {
            throw new BadRequestException(
                `No es posible reducir el presupuesto anual a $${updateCostCenterDto.PresupuestoAnual}. ` +
                `Actualmente ya tienes asignados $${totalDistribuidoAreas} distribuidos entre las áreas de este centro.`,
            );
        }

        // Ejecutamos la actualización normal en la base de datos
        await this.prismaService.catCentroCostos.update({
            where: {
                idCentroCostos: costCenterId,
            },
            data: {
                Codigo: updateCostCenterDto.Codigo,
                Descripcion: updateCostCenterDto.Descripcion,
                PresupuestoAnual: updateCostCenterDto.PresupuestoAnual,
            },
        });

        return { message: 'Centro de costos actualizado correctamente.' };
    }

    async changeStatus(companyId: number, id: number, active: boolean) {

        await this.prismaService.catCentroCostos.update({
            where: { idCentroCostos: id, idEmpresa: companyId },
            data: {
                Activo: active
            },
        });

        return {
            message: active ? 'Centro de costo activado correctamente' : 'Centro de costo desactivado correctamente'
        };
    }
}
