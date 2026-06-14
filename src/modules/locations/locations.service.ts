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
                {
                    DomicilioSite: {
                        OR: [
                            { estado: { contains: query } },
                            { municipio: { contains: query } },
                            { colonia: { contains: query } },
                            { calle: { contains: query } },
                            { codigo_postal: { contains: query } }
                        ]
                    }
                }
            ];
        }

        const [sites, total] = await Promise.all([
            this.prismaService.catSites.findMany({
                where: whereCondition,
                include: {
                    DomicilioSite: true
                },
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

        const flattenedLocations = sites.map((site) => {
            const { DomicilioSite, ...siteData } = site;
            return {
                ...siteData,
                idDomicilioSite: DomicilioSite?.idDomicilioSite || null,
                codigo_postal: DomicilioSite?.codigo_postal || '—',
                colonia: DomicilioSite?.colonia || '—',
                municipio: DomicilioSite?.municipio || '—',
                estado: DomicilioSite?.estado || '—',
                calle: DomicilioSite?.calle || '—',
                numero_exterior: DomicilioSite?.numero_exterior || '—',
                numero_interior: DomicilioSite?.numero_interior || '—',
            };
        });

        return {
            locations: flattenedLocations,
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
            const result = await this.prismaService.$transaction(async (tx) => {
                const nuevoSite = await tx.catSites.create({
                    data: {
                        idEmpresa: companyId,
                        Descripcion: dto.descripcion,
                        Activo: true,
                    },
                });

                const nuevoDomicilio = await tx.domicilioSite.create({
                    data: {
                        idSite: nuevoSite.idSite,
                        codigo_postal: dto.codigoPostal,
                        colonia: dto.colonia,
                        municipio: dto.municipio,
                        estado: dto.estado,
                        calle: dto.calle,
                        numero_exterior: dto.noExt,
                        numero_interior: dto.noInt,
                        activo: true,
                        fecha_registro: new Date(),
                    },
                });

                return { nuevoSite, nuevoDomicilio };
            });
            return {
                success: true,
                message: 'Ubicación creada correctamente desde el ORM',
                data: {
                    idSite: result.nuevoSite.idSite
                }
            };
        }
        catch (error) {
            this.logger.error(`Error al crear la ubicación en Prisma: ${error.message}`);
            throw new InternalServerErrorException('Error interno al registrar la ubicación y su domicilio.');
        }
    }

    async getLocationById(companyId: number, locationId: number) {
        const location = await this.prismaService.catSites.findUnique({
            where: {
                idSite: locationId,
                idEmpresa: companyId,
            },
            include: {
                DomicilioSite: true,
            },
        });

        if (!location) throw new NotFoundException('La ubicación especificada no existe.');

        const { DomicilioSite, ...locationData } = location;
        return {
            ...locationData,
            idDomicilioSite: DomicilioSite?.idDomicilioSite || null,
            codigo_postal: DomicilioSite?.codigo_postal || '—',
            colonia: DomicilioSite?.colonia || null,
            municipio: DomicilioSite?.municipio || null,
            estado: DomicilioSite?.estado || null,
            calle: DomicilioSite?.calle || '—',
            numero_exterior: DomicilioSite?.numero_exterior || '',
            numero_interior: DomicilioSite?.numero_interior || '',
        };
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
            await this.prismaService.$transaction(async (tx) => {
                await tx.catSites.update({
                    where: { idSite: locationId },
                    data: {
                        Descripcion: dto.descripcion,
                        DomicilioSite: {
                            upsert: {
                                create: {
                                    codigo_postal: dto.codigo_postal,
                                    estado: dto.estado,
                                    municipio: dto.municipio,
                                    colonia: dto.colonia,
                                    calle: dto.calle,
                                    numero_exterior: dto.numero_exterior,
                                    numero_interior: dto.numero_interior,
                                    activo: true,
                                },
                                update: {
                                    codigo_postal: dto.codigo_postal,
                                    estado: dto.estado,
                                    municipio: dto.municipio,
                                    colonia: dto.colonia,
                                    calle: dto.calle,
                                    numero_exterior: dto.numero_exterior,
                                    numero_interior: dto.numero_interior,
                                },
                            },
                        },
                    },
                });
            });

            return { message: 'Ubicación y domicilio actualizados correctamente' };
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