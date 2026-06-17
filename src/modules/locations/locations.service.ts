import { Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateLocationDto } from './dto/create-location.dto';
import { UpdateLocationDto } from './dto/update-location.dto';

@Injectable()
export class LocationsService {
    private readonly logger = new Logger(LocationsService.name);

    constructor(private prismaService: PrismaService) { }

    async findAll(companyId: number, page: number, query: string, limit: number) {
        const skip = (page - 1) * limit;

        const whereCondition: any = {
            idEmpresa: companyId,
        };

        if (query) {
            whereCondition.OR = [
                { Descripcion: { contains: query } },
                { estado: { contains: query } },
                { municipio: { contains: query } },
                { colonia: { contains: query } },
                { calle: { contains: query } },
                { codigo_postal: { contains: query } }
            ];
        }

        const [sites, total] = await Promise.all([
            this.prismaService.catSites.findMany({
                where: whereCondition,
                skip: skip,
                take: limit,
                orderBy: { idSite: 'desc' },
            }),
            this.prismaService.catSites.count({ where: whereCondition }),
        ]);

        if ((!sites || sites.length === 0) && page === 1 && !query) {
            return {
                locations: [],
                total: 0,
                currentPage: page,
                totalPages: 1,
            };
        }

        return {
            locations: sites,
            total,
            currentPage: page,
            totalPages: Math.ceil(total / limit) || 1,
        };
    }

    async create(companyId: number, dto: CreateLocationDto) {
        const companyExists = await this.prismaService.catEmpresas.findUnique({
            where: { idEmpresa: companyId },
        });
        if (!companyExists) throw new NotFoundException('La empresa especificada no existe.');

        try {
            await this.prismaService.catSites.create({
                data: {
                    idEmpresa: companyId,
                    Descripcion: dto.descripcion,
                    idTipoUbicacion: dto.idTipoUbicacion,
                    EsPrincipal: dto.esPrincipal === 1,
                    CodigoPostal: dto.codigoPostal,
                    Colonia: dto.colonia,
                    MunicipioDelegacion: dto.municipio,
                    Estado: dto.estado,
                    Calle: dto.calle,
                    NoExterior: dto.noExt,
                    NoInterior: dto.noInt || null,
                    Pais: dto.pais,
                    Latitud: dto.latitud,
                    Longitud: dto.longitud,
                    idRegistroPatronal: dto.idRegistroPatronal || null,
                    ZonaFronteriza: dto.zonaFronteriza === 1,
                    Activo: true,
                    FechaRegistro: new Date(),
                },
            });

            return { message: 'Ubicación creada correctamente' };

        } catch (error) {
            this.logger.error(`Error al crear la ubicación: ${error}`);
            throw new InternalServerErrorException('Error interno al registrar la ubicación.');
        }
    }

    async getLocationById(companyId: number, locationId: number) {
        const location = await this.prismaService.catSites.findUnique({
            where: {
                idSite: locationId,
                idEmpresa: companyId,
            },
        });

        if (!location) throw new NotFoundException('La ubicación especificada no existe.');

        return location;
    }

    async update(companyId: number, locationId: number, dto: UpdateLocationDto) {
        const locationExists = await this.prismaService.catSites.findFirst({
            where: {
                idSite: locationId,
                idEmpresa: companyId,
            },
        });

        if (!locationExists) throw new NotFoundException('La ubicación especificada no existe para esta empresa.');

        try {
            await this.prismaService.catSites.update({
                where: { idSite: locationId },
                data: {
                    Descripcion: dto.descripcion,
                    idTipoUbicacion: dto.idTipoUbicacion,
                    EsPrincipal: dto.esPrincipal === 1,
                    CodigoPostal: dto.codigoPostal,
                    Estado: dto.estado,
                    MunicipioDelegacion: dto.municipio,
                    Colonia: dto.colonia,
                    Calle: dto.calle,
                    NoExterior: dto.noExt,
                    NoInterior: dto.noInt || null,
                    Pais: dto.pais,
                    Latitud: dto.latitud,
                    Longitud: dto.longitud,
                    idRegistroPatronal: dto.idRegistroPatronal || null,
                    ZonaFronteriza: dto.zonaFronteriza === 1,
                },
            });

            return { success: true, message: 'Ubicación actualizada correctamente' };

        } catch (error) {
            this.logger.error(`Error al actualizar la ubicación ${locationId}: ${error.message}`);
            throw new InternalServerErrorException('Error interno al intentar guardar los cambios de la ubicación.');
        }
    }

    async changeStatus(companyId: number, id: number, active: boolean) {

        await this.prismaService.catSites.update({
            where: { idSite: id, idEmpresa: companyId },
            data: {
                Activo: active
            },
        });

        return {
            message: active ? 'Ubicación activada correctamente' : 'Ubicación desactivada correctamente'
        };
    }
}