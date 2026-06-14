import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateAreaDto } from './dto/create-area.dto';
import { UpdateAreaDto } from './dto/update-area.dto';

@Injectable()
export class AreasService {
    constructor(private prismaService: PrismaService) { }

    async findAll(companyId: number, page: number, query: string, limit: number) {
        const skip = (page - 1) * limit;

        const whereCondition: any = {
            CatCentroCostos: {
                idEmpresa: companyId,
            }
        };

        if (query) {
            whereCondition.OR = [
                { Descripcion: { contains: query } },
                { Encargado: { contains: query } },
                {
                    CatCentroCostos: {
                        OR: [
                            { Descripcion: { contains: query } },
                            { Codigo: { contains: query } }
                        ]
                    }
                }
            ];
        }

        const [areas, total, metrics, totalActivas] = await Promise.all([
            this.prismaService.catAreas.findMany({
                where: whereCondition,
                include: {
                    CatCentroCostos: true,
                    CatSites: true,
                },
                skip: skip,
                take: limit,
                orderBy: { idArea: 'desc' },
            }),
            this.prismaService.catAreas.count({ where: whereCondition }),
            this.prismaService.catAreas.aggregate({
                where: whereCondition,
                _sum: {
                    PresupuestoAsignado: true,
                    PresupuestoEjecutado: true,
                }
            }),
            this.prismaService.catAreas.count({
                where: {
                    ...whereCondition,
                    Activo: true,
                }
            })
        ]);

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

        const flattenedAreas = areas.map((area) => {
            const { CatCentroCostos, CatSites, ...areaData } = area;
            return {
                ...areaData,
                codigoCentroCostos: CatCentroCostos?.Codigo || '—',
                centroCostosDescripcion: CatCentroCostos?.Descripcion || '—',
                siteDescripcion: CatSites?.Descripcion || '—',
            };
        });

        return {
            areas: flattenedAreas,
            total,
            currentPage: page,
            totalPages: Math.ceil(total / limit) || 1,
            summary: {
                totalActivas: totalActivas || 0,
                totalAsignado: Number(metrics._sum.PresupuestoAsignado || 0),
                totalEjecutado: Number(metrics._sum.PresupuestoEjecutado || 0)
            }
        };
    }

    async findOne(companyId: number, id: number) {
        const area = await this.prismaService.catAreas.findFirst({
            where: {
                idArea: id,
                CatCentroCostos: {
                    idEmpresa: companyId,
                },
                CatSites: {
                    idEmpresa: companyId,
                }
            },
            include: {
                CatCentroCostos: {
                    select: {
                        idEmpresa: true,
                        idCentroCostos: true,
                        Codigo: true,
                        Descripcion: true,
                        PresupuestoAnual: true,
                        PresupuestoEjecutado: true,
                    },
                },
                CatSites: {
                    select: {
                        idSite: true,
                        idEmpresa: true,
                        Descripcion: true,
                    },
                },
            },
        });

        if (!area) throw new NotFoundException(`Área no encontrada.`);

        const dbPositions = await this.prismaService.catPuestos.findMany({
            where: {
                idArea: id,
                idEmpresa: companyId
            },
            select: {
                idPuesto: true,
                NombrePuesto: true,
                DescripcionPuesto: true,
                CatNivelesSalario: {
                    select: {
                        SalarioMinimo: true,
                        SalarioMaximo: true
                    }
                }
            },
        });

        const positions = dbPositions.map(position => ({
            idPuesto: position.idPuesto,
            NombrePuesto: position.NombrePuesto,
            DescripcionPuesto: position.DescripcionPuesto,
            SalarioMinimo: position.CatNivelesSalario?.SalarioMinimo ?? 0.00,
            SalarioMaximo: position.CatNivelesSalario?.SalarioMaximo ?? 0.00,
        }));

        return { area, positions };
    }

    async create(companyId: number, createAreaDto: CreateAreaDto) {
        const costCenter = await this.prismaService.catCentroCostos.findFirst({
            where: {
                idCentroCostos: createAreaDto.idCentroCostos,
                idEmpresa: companyId,
            },
            include: {
                CatAreas: true,
            },
        });

        if (!costCenter) throw new NotFoundException('El centro de costos seleccionado no pertenece a esta empresa o no existe.');

        const areaDuplicate = costCenter.CatAreas.find(
            (area) => area.Descripcion.toUpperCase() === createAreaDto.descripcion.toUpperCase()
        );

        if (areaDuplicate) throw new ConflictException(`El área "${createAreaDto.descripcion}" ya se encuentra registrada en este centro de costos.`);

        const totalAsignadoOtrasAreas = costCenter.CatAreas.reduce(
            (acc, area) => acc + Number(area.PresupuestoAsignado || 0), 0
        );

        const presupuestoAnualCentro = Number(costCenter.PresupuestoAnual || 0);
        const presupuestoDisponibleCentro = presupuestoAnualCentro - totalAsignadoOtrasAreas;

        if (createAreaDto.presupuestoAsignado > presupuestoDisponibleCentro) {
            throw new BadRequestException(
                `Excedente Presupuestal. El centro de costos solo cuenta con un saldo disponible de $${presupuestoDisponibleCentro} MXN ` +
                `para asignar, y se intentó fondear el área con $${createAreaDto.presupuestoAsignado} MXN.`,
            );
        }

        const newArea = await this.prismaService.catAreas.create({
            data: {
                idSite: createAreaDto.idSite,
                idCentroCostos: createAreaDto.idCentroCostos,
                Descripcion: createAreaDto.descripcion,
                Encargado: createAreaDto.encargado || null,
                Correo: createAreaDto.correo || null,
                Telefono: createAreaDto.telefono || null,
                Extension: createAreaDto.extension || null,
                PresupuestoAsignado: createAreaDto.presupuestoAsignado,
                PresupuestoEjecutado: 0.00,
                Activo: true,
            },
        });

        return { message: 'Área operativa registrada con éxito.' };
    }

    async update(companyId: number, areaId: number, updateAreaDto: UpdateAreaDto) {
        const currentArea = await this.prismaService.catAreas.findUnique({
            where: { idArea: areaId },
        });

        if (!currentArea) throw new NotFoundException('El área operativa que intentas modificar no existe.');

        const costCenter = await this.prismaService.catCentroCostos.findFirst({
            where: {
                idCentroCostos: updateAreaDto.idCentroCostos,
                idEmpresa: companyId,
            },
            include: {
                CatAreas: true,
            },
        });

        if (!costCenter) throw new NotFoundException('El centro de costos seleccionado no pertenece a esta empresa o no existe.');

        const isNameDuplicate = costCenter.CatAreas.some(
            (area) =>
                area.Descripcion.toUpperCase() === updateAreaDto.descripcion.toUpperCase() &&
                area.idArea !== areaId
        );

        if (isNameDuplicate) {
            throw new ConflictException(
                `El área "${updateAreaDto.descripcion}" ya se encuentra registrada en ese centro de costos.`,
            );
        }

        const totalAsignadoOtrasAreas = costCenter.CatAreas.reduce((acc, area) => {
            return area.idArea === areaId ? acc : acc + Number(area.PresupuestoAsignado || 0);
        }, 0);

        const presupuestoAnualCentro = Number(costCenter.PresupuestoAnual || 0);
        const presupuestoDisponibleCentro = presupuestoAnualCentro - totalAsignadoOtrasAreas;

        if (updateAreaDto.presupuestoAsignado > presupuestoDisponibleCentro) {
            throw new BadRequestException(
                `Excedente Presupuestal. El centro de costos destino solo cuenta con un saldo disponible de $${presupuestoDisponibleCentro} MXN ` +
                `para asignar, y se intentó fondear el área con $${updateAreaDto.presupuestoAsignado} MXN.`,
            );
        }

        const updatedArea = await this.prismaService.catAreas.update({
            where: { idArea: areaId },
            data: {
                idSite: updateAreaDto.idSite,
                idCentroCostos: updateAreaDto.idCentroCostos,
                Descripcion: updateAreaDto.descripcion,
                Encargado: updateAreaDto.encargado || null,
                Correo: updateAreaDto.correo || null,
                Telefono: updateAreaDto.telefono || null,
                Extension: updateAreaDto.extension || null,
                PresupuestoAsignado: updateAreaDto.presupuestoAsignado,
            },
        });

        return { message: 'Área operativa actualizada con éxito.' };
    }

    async changeStatus(companyId: number, id: number, active: boolean) {
        const area = await this.prismaService.catAreas.findFirst({
            where: { idArea: id },
        });
        if (!area || !area.idSite) throw new Error('Área no encontrada');

        const site = await this.prismaService.catSites.findFirst({
            where: { idSite: area.idSite, idEmpresa: companyId, Activo: true },
        });

        if (!site) throw new Error('No se puede desactivar el área porque no tiene sitios activos');

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
