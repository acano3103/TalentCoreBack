import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateCostCenterDto } from './dto/create-cost-center.dto';
import { UpdateCostCenterDto } from './dto/update-cost-center.dto';
import { ActiveUserDto } from '../auth/dto/active-user.dto';
import { Prisma } from 'generated/prisma/client';
import { ExcelColumn, ExcelExportService } from 'src/common/services/excel-export.service';


@Injectable()
export class CostCenterService {
    private readonly logger = new Logger(CostCenterService.name);

    constructor(
        private prismaService: PrismaService,
        private readonly excelExportService: ExcelExportService,
    ) { }

    /**
     * Where común de centros de costos (tenant, empresa y búsqueda).
     * Lo usan la tabla paginada, las tarjetas y la exportación, para que filtren igual.
     */
    private buildCostCentersWhere(user: ActiveUserDto, companyId: number, query?: string): Prisma.CatCentroCostosWhereInput {
        const whereCondition: Prisma.CatCentroCostosWhereInput = {
            idTenant: user.idTenant,
            idEmpresa: companyId,
        };

        if (query) {
            whereCondition.OR = [
                { Descripcion: { contains: query } },
                { Codigo: { contains: query } },
            ];
        }

        return whereCondition;
    }

    async findAll(user: ActiveUserDto, companyId: number, page: number, query: string, limit: number) {
        const skip = (page - 1) * limit;

        const whereCondition = this.buildCostCentersWhere(user, companyId, query);

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

    // Exporta a Excel TODOS los centros de costos que cumplan los filtros (sin paginar)
    async exportCostCenters(
        user: ActiveUserDto,
        companyId: number,
        filters: { search?: string; activo?: string; fechaDesde?: string; fechaHasta?: string },
    ): Promise<Buffer> {
        if (!user.idTenant) {
            throw new BadRequestException('El usuario no tiene un tenant asignado.');
        }

        const where = this.buildCostCentersWhere(user, companyId, filters.search?.trim());

        // Estatus: 'true' = activos, 'false' = inactivos, vacío = todos
        if (filters.activo === 'true') where.Activo = true;
        if (filters.activo === 'false') where.Activo = false;

        // Rango de fechas de creación (días completos)
        const esFecha = (f?: string) => !!f && /^\d{4}-\d{2}-\d{2}$/.test(f);
        if (esFecha(filters.fechaDesde) || esFecha(filters.fechaHasta)) {
            where.FechaCreacion = {
                ...(esFecha(filters.fechaDesde) && { gte: new Date(`${filters.fechaDesde}T00:00:00.000Z`) }),
                ...(esFecha(filters.fechaHasta) && { lte: new Date(`${filters.fechaHasta}T23:59:59.999Z`) }),
            };
        }

        const costCenters = await this.prismaService.catCentroCostos.findMany({
            where,
            include: {
                _count: {
                    select: { RelAreasUbicaciones: true }, // Mismo conteo que la tabla
                },
            },
            orderBy: { idCentroCostos: 'desc' }, // Mismo orden que la tabla
        });

        type CentroExport = (typeof costCenters)[number];

        const formatFecha = (fecha: Date | null) => {
            if (!fecha) return '';
            const [anio, mes, dia] = fecha.toISOString().split('T')[0].split('-');
            return `${dia}/${mes}/${anio}`;
        };

        const columns: ExcelColumn<CentroExport>[] = [
            { header: 'Código', key: 'codigo', width: 16, value: (c) => c.Codigo },
            { header: 'Descripción', key: 'descripcion', width: 36, value: (c) => c.Descripcion },
            { header: 'Presupuesto Anual', key: 'presupuestoAnual', width: 20, value: (c) => Number(c.PresupuestoAnual || 0) },
            { header: 'Presupuesto Ejecutado', key: 'presupuestoEjecutado', width: 20, value: (c) => Number(c.PresupuestoEjecutado || 0) },
            {
                header: 'Balance Disponible', key: 'disponible', width: 20,
                value: (c) => Number(c.PresupuestoAnual || 0) - Number(c.PresupuestoEjecutado || 0),
            },
            { header: 'Total de Áreas', key: 'totalAreas', width: 14, value: (c) => c._count?.RelAreasUbicaciones ?? 0 },
            { header: 'Estatus', key: 'estatus', width: 12, value: (c) => (c.Activo ? 'Activo' : 'Inactivo') },
            { header: 'Fecha de Creación', key: 'fechaCreacion', width: 18, value: (c) => formatFecha(c.FechaCreacion) },
        ];

        return this.excelExportService.generate({
            sheetName: 'Centros de Costos',
            columns,
            rows: costCenters,
        });
    }

    async findOne(user: ActiveUserDto, companyId: number, id: number) {
        const costCenter = await this.prismaService.catCentroCostos.findFirst({
            where: { idCentroCostos: id, idEmpresa: companyId, idTenant: user.idTenant },
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

    async create(user: ActiveUserDto, companyId: number, createCostCenterDto: CreateCostCenterDto) {
        const existingCC = await this.prismaService.catCentroCostos.findFirst({
            where: {
                idEmpresa: companyId,
                idTenant: user.idTenant,
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
                idTenant: user.idTenant,
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

    async update(user: ActiveUserDto, companyId: number, costCenterId: number, updateCostCenterDto: UpdateCostCenterDto) {
        const currentCC = await this.prismaService.catCentroCostos.findFirst({
            where: {
                idCentroCostos: costCenterId,
                idTenant: user.idTenant,
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
                    idTenant: user.idTenant,
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

    async changeStatus(user: ActiveUserDto, companyId: number, id: number, active: boolean) {

        await this.prismaService.catCentroCostos.update({
            where: { idCentroCostos: id, idEmpresa: companyId, idTenant: user.idTenant },
            data: {
                Activo: active
            },
        });

        return {
            message: active ? 'Centro de costo activado correctamente' : 'Centro de costo desactivado correctamente'
        };
    }
}
