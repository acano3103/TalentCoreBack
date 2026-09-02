import {
    Injectable,
    InternalServerErrorException,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateLocationDto } from './dto/create-location.dto';
import { UpdateLocationDto } from './dto/update-location.dto';
import { ActiveUserDto } from 'src/modules/auth/dto/active-user.dto';

@Injectable()
export class LocationsService {
    private readonly logger = new Logger(LocationsService.name);

    constructor(private prismaService: PrismaService) { }

    async findAll(
        companyId: number,
        page: number,
        query: string,
        limit: number,
        user: ActiveUserDto,
        operatingUnitId?: number | null
    ) {
         if (!user.idTenant) {          
            throw new InternalServerErrorException('El usuario no tiene un tenant asignado.');
        }
        const pageNumber = Math.max(1, Number(page) || 1);
        const limitNumber = Math.max(1, Number(limit) || 10);
        const skip = (pageNumber - 1) * limitNumber;

        const whereCondition: any = {
            idEmpresa: Number(companyId),
            idTenant: user.idTenant,
            ...(operatingUnitId ? { idUnidadOperativa: Number(operatingUnitId) } : {}),
        };

        if (query) {
            whereCondition.OR = [
                { Descripcion: { contains: query } },
                { Estado: { contains: query } },
                { MunicipioDelegacion: { contains: query } },
                { Colonia: { contains: query } },
                { Calle: { contains: query } },
                { CodigoPostal: { contains: query } },
            ];
        }

        const [sites, total] = await Promise.all([
            this.prismaService.catSites.findMany({
                where: whereCondition,
                skip: skip,
                take: limitNumber,
                orderBy: { idSite: 'desc' },
            }),
            this.prismaService.catSites.count({ where: whereCondition }),
        ]);

        if ((!sites || sites.length === 0) && pageNumber === 1 && !query && !operatingUnitId) {
            return {
                locations: [],
                total: 0,
                currentPage: pageNumber,
                totalPages: 1,
            };
        }

        return {
            locations: sites,
            total,
            currentPage: pageNumber,
            totalPages: Math.ceil(total / limitNumber) || 1,
        };
    }

    async getLocationById(companyId: number, locationId: number, user: ActiveUserDto) {
    if (!user.idTenant) {
        throw new InternalServerErrorException('El usuario no tiene un tenant asignado.');
    }

    const location = await this.prismaService.catSites.findFirst({   
        where: {
            idSite: locationId,
            idEmpresa: companyId,
            idTenant: user.idTenant,
        },
    });

    if (!location) throw new NotFoundException('La ubicación especificada no existe.');

    return location;
}

    async create(companyId: number, dto: CreateLocationDto, user: ActiveUserDto) {
    if (!user.idTenant) {
        throw new InternalServerErrorException('El usuario no tiene un tenant asignado.');
    }
    const idTenant = user.idTenant;

    const companyExists = await this.prismaService.catEmpresas.findUnique({
        where: { idEmpresa: companyId },
    });
    if (!companyExists) throw new NotFoundException('La empresa especificada no existe.');
    if (companyExists.idTenant !== idTenant) {
        throw new NotFoundException('La empresa especificada no existe.');
    }

    // Si enviaron unidad operativa, validamos que exista y pertenezca a la empresa
    if (dto.idUnidadOperativa) {
        const operatingUnitExists = await this.prismaService.catUnidadesOperativas.findFirst({
            where: {
                idUnidadOperativa: dto.idUnidadOperativa,
                idEmpresa: companyId,
            },
        });
        if (!operatingUnitExists) {
            throw new NotFoundException('La unidad operativa especificada no existe para esta empresa.');
        }
    }

    try {
        const newSite = await this.prismaService.$transaction(async (tx: any) => {
            const site = await tx.catSites.create({
                data: {
                    idEmpresa: companyId,
                    idTenant,   // <-- nuevo
                    idTipoUbicacion: dto.idTipoUbicacion,
                    idUnidadOperativa: dto.idUnidadOperativa || null,
                    Descripcion: dto.descripcion,
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

            const userFullName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || `Usuario #${user.id}`;
            const historyModel = tx.historicoMovimientos || tx.HistoricoMovimientos;

            if (historyModel) {
                await historyModel.create({
                    data: {
                        idUsuario: user.id,
                        idEmpresa: companyId,
                        accion: 'CREAR',
                        tablaOrigen: 'CatSites',
                        idRegistro: String(site.idSite),
                        descripcion: `Ubicación "${site.Descripcion}" creada por ${userFullName}`,
                        fechaCreacion: new Date(),
                    },
                });
            }

            return site;
        });

        return {
            success: true,
            message: 'Ubicación creada correctamente',
            data: newSite,
        };
    } catch (error) {
        this.logger.error(`Error al crear la ubicación: ${error.message}`, error.stack);
        throw new InternalServerErrorException('Error interno al registrar la ubicación.');
    }
}

   async update(companyId: number, locationId: number, dto: UpdateLocationDto, user: ActiveUserDto) {
        if (!user.idTenant) {          // <-- nuevo
            throw new InternalServerErrorException('El usuario no tiene un tenant asignado.');
        }
        const idTenant = user.idTenant;   // <-- nuevo

        const locationExists = await this.prismaService.catSites.findFirst({
            where: {
                idSite: locationId,
                idEmpresa: companyId,
                idTenant,   // <-- nuevo
            },
        });

        if (!locationExists) {
            throw new NotFoundException('La ubicación especificada no existe para esta empresa.');
        }

        if (dto.idUnidadOperativa) {
            const operatingUnitExists = await this.prismaService.catUnidadesOperativas.findFirst({
                where: {
                    idUnidadOperativa: dto.idUnidadOperativa,
                    idEmpresa: companyId,
                },
            });
            if (!operatingUnitExists) {
                throw new NotFoundException('La unidad operativa especificada no existe para esta empresa.');
            }
        }
        try {
            const updatedSite = await this.prismaService.$transaction(async (tx: any) => {
                const site = await tx.catSites.update({
                    where: { idSite: locationId },
                    data: {
                        Descripcion: dto.descripcion,
                        idTipoUbicacion: dto.idTipoUbicacion,
                        idUnidadOperativa: dto.idUnidadOperativa !== undefined ? (dto.idUnidadOperativa || null) : undefined,
                        EsPrincipal: dto.esPrincipal !== undefined ? dto.esPrincipal === 1 : undefined,
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
                        idRegistroPatronal: dto.idRegistroPatronal !== undefined ? (dto.idRegistroPatronal || null) : undefined,
                        ZonaFronteriza: dto.zonaFronteriza !== undefined ? dto.zonaFronteriza === 1 : undefined,
                    },
                });

                const userFullName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || `Usuario #${user.id}`;
                const historyModel = tx.historicoMovimientos || tx.HistoricoMovimientos;

                if (historyModel) {
                    await historyModel.create({
                        data: {
                            idUsuario: user.id,
                            idEmpresa: companyId,
                            accion: 'EDITAR',
                            tablaOrigen: 'CatSites',
                            idRegistro: String(locationId),
                            descripcion: `Ubicación "${site.Descripcion}" actualizada por ${userFullName}`,
                            fechaCreacion: new Date(),
                        },
                    });
                }

                return site;
            });

            return {
                success: true,
                message: 'Ubicación actualizada correctamente',
                data: updatedSite,
            };
        } catch (error) {
            this.logger.error(`Error al actualizar la ubicación ${locationId}: ${error.message}`, error.stack);
            throw new InternalServerErrorException('Error interno al intentar guardar los cambios de la ubicación.');
        }
    }

     async changeStatus(companyId: number, id: number, active: boolean, user: ActiveUserDto) {
        if (!user.idTenant) {          // <-- nuevo
            throw new InternalServerErrorException('El usuario no tiene un tenant asignado.');
        }
        const idTenant = user.idTenant;   // <-- nuevo

        const locationExists = await this.prismaService.catSites.findFirst({
            where: {
                idSite: id,
                idEmpresa: companyId,
                idTenant,   // <-- nuevo
            },
        });

        if (!locationExists) {
            throw new NotFoundException('La ubicación especificada no existe para esta empresa.');
        }

        try {
            await this.prismaService.$transaction(async (tx: any) => {
                await tx.catSites.update({
                    where: { idSite: id, idEmpresa: companyId },   // idTenant ya validado en el findFirst de arriba
                    data: {
                        Activo: active,
                    },
                });

                const userFullName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || `Usuario #${user.id}`;
                const historyModel = tx.historicoMovimientos || tx.HistoricoMovimientos;

                if (historyModel) {
                    await historyModel.create({
                        data: {
                            idUsuario: user.id,
                            idEmpresa: companyId,
                            accion: active ? 'REACTIVAR' : 'DESACTIVAR',
                            tablaOrigen: 'CatSites',
                            idRegistro: String(id),
                            descripcion: `Ubicación "${locationExists.Descripcion}" ${active ? 'reactivada' : 'desactivada'} por ${userFullName}`,
                            fechaCreacion: new Date(),
                        },
                    });
                }
            });

            return {
                success: true,
                message: active ? 'Ubicación activada correctamente' : 'Ubicación desactivada correctamente',
            };
        } catch (error) {
            this.logger.error(`Error al cambiar estatus de la ubicación ${id}: ${error.message}`, error.stack);
            throw new InternalServerErrorException('Error al actualizar el estatus de la ubicación');
        }
    }
}