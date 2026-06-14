import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { UpdateSalaryLevelsCatalogDto } from '../dto/update-salary-levels-catalog.dto';
import { CreateSalaryLevelsCatalogDto } from '../dto/create-salary-levels-catalog.dto';

@Injectable()
export class SalaryLevelsCatalogService {
    constructor(private readonly prismaService: PrismaService) { }

    async findAll(companyId: number, page: number, limit: number, query: string,) {
        const skip = (page - 1) * limit;

        const whereCondition: any = {
            IdEmpresa: companyId,
        };

        if (query) {
            whereCondition.OR = [
                { NombreNivel: { contains: query } },
                { Descripcion: { contains: query } },
            ];
        }

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

    async findOne(companyId: number, id: number) {
        const salaryLevel = await this.prismaService.catNivelesSalario.findUnique({
            where: {
                IdNivelSalario: id,
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

    async create(companyId: number, data: CreateSalaryLevelsCatalogDto) {
        await this.prismaService.catNivelesSalario.create({
            data: {
                NombreNivel: data.NombreNivel,
                Descripcion: data.Descripcion,
                SalarioMinimo: data.SalarioMinimo,
                SalarioMaximo: data.SalarioMaximo,
                Activo: data.Activo ? true : false,
                IdEmpresa: companyId,
            },
        });

        return { message: 'Nivel salarial creado correctamente' };
    }

    async update(companyId: number, id: number, data: UpdateSalaryLevelsCatalogDto) {
        const salaryLevel = await this.prismaService.catNivelesSalario.findUnique({
            where: {
                IdNivelSalario: id,
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

    async changeStatus(companyId: number, id: number, active: boolean) {

        await this.prismaService.catNivelesSalario.update({
            where: { IdNivelSalario: id, IdEmpresa: companyId },
            data: {
                Activo: active
            },
        });

        return {
            message: active ? 'Nivel salarial activado correctamente' : 'Nivel salarial desactivado correctamente'
        };
    }
}