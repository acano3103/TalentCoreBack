import { Prisma } from 'generated/prisma/client';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ExcelColumn, ExcelExportService } from 'src/common/services/excel-export.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { UpdateSalaryLevelsCatalogDto } from '../dto/update-salary-levels-catalog.dto';
import { CreateSalaryLevelsCatalogDto } from '../dto/create-salary-levels-catalog.dto';
import { ActiveUserDto } from 'src/modules/auth/dto/active-user.dto';

@Injectable()
export class SalaryLevelsCatalogService {
    constructor(
        private readonly prismaService: PrismaService,
        private readonly excelExportService: ExcelExportService,
    ) { }

        /**
     * Where común de niveles salariales (tenant, empresa y búsqueda).
     * Lo usan la tabla paginada y la exportación, para que ambas filtren igual.
     */
    private buildSalaryLevelsWhere(activeUser: ActiveUserDto, companyId: number, query?: string): Prisma.CatNivelesSalarioWhereInput {
        const whereCondition: Prisma.CatNivelesSalarioWhereInput = {
            idTenant: activeUser.idTenant,
            IdEmpresa: companyId,
        };

        if (query) {
            whereCondition.OR = [
                { NombreNivel: { contains: query } },
                { Descripcion: { contains: query } },
            ];
        }

        return whereCondition;
    }


    async findAll(activeUser: ActiveUserDto, companyId: number, page: number, limit: number, query: string,) {
        const skip = (page - 1) * limit;

        const whereCondition = this.buildSalaryLevelsWhere(activeUser, companyId, query);

        const [salaryLevels, total] = await Promise.all([
            this.prismaService.catNivelesSalario.findMany({
                where: whereCondition,
                include: {
                    _count: {
                        select: { CatPuestos: true },
                    },
                },
                skip: skip,
                take: limit,
                orderBy: { IdNivelSalario: 'desc' },
            }),
            this.prismaService.catNivelesSalario.count({ where: whereCondition }),
        ]);

        if ((!salaryLevels || salaryLevels.length === 0) && page === 1 && !query) {
            return {
                salaryLevels: [],
                total: 0,
                currentPage: page,
                totalPages: 1,
            };
        }

        const flattenedSalaryLevels = salaryLevels.map((level) => {
            const { _count, ...levelData } = level;
            return {
                ...levelData,
                totalPuestos: _count?.CatPuestos || 0,
            };
        });

        return {
            salaryLevels: flattenedSalaryLevels,
            total,
            currentPage: page,
            totalPages: Math.ceil(total / limit) || 1,
        };
    }

        // Exporta a Excel TODOS los niveles salariales que cumplan los filtros (sin paginar)
    async exportSalaryLevels(
        activeUser: ActiveUserDto,
        companyId: number,
        filters: { search?: string; activo?: string },
    ): Promise<Buffer> {
        if (!activeUser.idTenant) {
            throw new BadRequestException('El usuario no tiene un tenant asignado.');
        }

        const where = this.buildSalaryLevelsWhere(activeUser, companyId, filters.search?.trim());

        // Estatus: 'true' = activos, 'false' = inactivos, vacío = todos
        if (filters.activo === 'true') where.Activo = true;
        if (filters.activo === 'false') where.Activo = false;

        const salaryLevels = await this.prismaService.catNivelesSalario.findMany({
            where,
            include: {
                _count: {
                    select: { CatPuestos: true }, // Mismo conteo que la tabla
                },
            },
            orderBy: { IdNivelSalario: 'desc' }, // Mismo orden que la tabla
        });

        type NivelExport = (typeof salaryLevels)[number];

        const columns: ExcelColumn<NivelExport>[] = [
            { header: 'Nombre', key: 'nombre', width: 22, value: (n) => n.NombreNivel },
            { header: 'Descripción', key: 'descripcion', width: 45, value: (n) => n.Descripcion },
            { header: 'Salario Mínimo', key: 'salarioMinimo', width: 16, value: (n) => (n.SalarioMinimo != null ? Number(n.SalarioMinimo) : '') },
            { header: 'Salario Máximo', key: 'salarioMaximo', width: 16, value: (n) => (n.SalarioMaximo != null ? Number(n.SalarioMaximo) : '') },
            { header: 'Total Puestos', key: 'totalPuestos', width: 14, value: (n) => n._count?.CatPuestos ?? 0 },
            { header: 'Estatus', key: 'estatus', width: 12, value: (n) => (n.Activo ? 'Activo' : 'Inactivo') },
        ];

        return this.excelExportService.generate({
            sheetName: 'Niveles Salariales',
            columns,
            rows: salaryLevels,
        });
    }

    async findOne(activeUser: ActiveUserDto, companyId: number, id: number) {
        const salaryLevel = await this.prismaService.catNivelesSalario.findUnique({
            where: {
                IdNivelSalario: id,
                idTenant: activeUser.idTenant,
                IdEmpresa: companyId,
            },
            include: {
                _count: {
                    select: {
                        CatPuestos: true,
                    },
                },
                CatPuestos: {
                    select: {
                        idPuesto: true,
                        NombrePuesto: true,
                        DescripcionPuesto: true,
                        Activo: true,
                    },
                    orderBy: {
                        DescripcionPuesto: 'desc',
                    },
                },
            },
        });

        if (!salaryLevel) throw new NotFoundException('El nivel salarial no existe');

        const { _count, CatPuestos, ...levelData } = salaryLevel;

        return {
            ...levelData,
            totalPuestos: _count.CatPuestos,
            puestos: CatPuestos,
        };
    }

    async create(activeUser: ActiveUserDto, companyId: number, data: CreateSalaryLevelsCatalogDto) {
        await this.prismaService.catNivelesSalario.create({
            data: {
                idTenant: activeUser.idTenant,
                IdEmpresa: companyId,
                NombreNivel: data.NombreNivel,
                Descripcion: data.Descripcion,
                SalarioMinimo: data.SalarioMinimo,
                SalarioMaximo: data.SalarioMaximo,
                Activo: data.Activo ? true : false,
            },
        });

        return { message: 'Nivel salarial creado correctamente' };
    }

    async update(activeUser: ActiveUserDto, companyId: number, id: number, data: UpdateSalaryLevelsCatalogDto) {
        const salaryLevel = await this.prismaService.catNivelesSalario.findUnique({
            where: {
                IdNivelSalario: id,
                idTenant: activeUser.idTenant,
                IdEmpresa: companyId,
            },
        });

        if (!salaryLevel) throw new NotFoundException('El nivel salarial no existe');

        await this.prismaService.catNivelesSalario.update({
            where: {
                IdNivelSalario: id,
                IdEmpresa: companyId,
            },
            data: {
                ...data,
            },
        });

        return { message: 'Nivel salarial actualizado correctamente' };
    }

    async changeStatus(activeUser: ActiveUserDto, companyId: number, id: number, active: boolean) {

        await this.prismaService.catNivelesSalario.update({
            where: { IdNivelSalario: id, idTenant: activeUser.idTenant, IdEmpresa: companyId },
            data: {
                Activo: active
            },
        });

        return {
            message: active ? 'Nivel salarial activado correctamente' : 'Nivel salarial desactivado correctamente'
        };
    }
}