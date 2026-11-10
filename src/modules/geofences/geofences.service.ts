import { Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { CreateGeofenceDto, GeofenceType } from './dto/create-geofence.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { ActiveUserDto } from '../auth/dto/active-user.dto';
import { Prisma } from 'generated/prisma/client';

@Injectable()
export class GeofencesService {
    private readonly logger = new Logger(GeofencesService.name);

    constructor(private prisma: PrismaService) { }

    // Obtiene todas las geocercas activas de una empresa
    async findAll(user: ActiveUserDto, companyId: number) {
        try {
            // Obtener todas las geocercas activas
            const geofences = await this.prisma.catGeocercas.findMany({
                where: {
                    idEmpresa: companyId,
                    idTenant: user.idTenant,
                    Activo: true,
                },
                include: {
                    CatSites: {
                        select: {
                            idSite: true,
                            Descripcion: true,
                            MunicipioDelegacion: true,
                            Estado: true,
                        },
                    },
                },
                orderBy: {
                    idGeocerca: 'desc',
                },
            });

            // Si no hay geocercas, retornamos arreglo vacío de inmediato
            if (!geofences.length) return [];

            // 2. Extraer los IDs únicos de los sitios (descartando nulos)
            const siteIds = [
                ...new Set(
                    geofences
                        .map((geo) => geo.idSite)
                        .filter((id): id is number => id !== null && id !== undefined),
                ),
            ];

            // UNA SOLA query agregada para contar empleados activos por cada idSite
            const employeeCounts = siteIds.length > 0
                ? await this.prisma.empleados.groupBy({
                    by: ['idSite'],
                    where: {
                        idSite: { in: siteIds },
                        idEmpresa: companyId,
                        idTenant: user.idTenant,
                        activo: true,
                    },
                    _count: {
                        idEmpleado: true,
                    },
                })
                : [];

            // Crear un mapa en memoria O(1) idSite -> totalEmpleados
            const countsMap = new Map<number, number>(
                employeeCounts.map((item) => [item.idSite as number, item._count.idEmpleado]),
            );

            // Mapear la respuesta agregando la propiedad totalEmpleados
            return geofences.map((geo) => ({
                idGeocerca: geo.idGeocerca,
                idSite: geo.idSite,
                nombre: geo.Nombre,
                tipo: geo.Tipo,
                latitud: Number(geo.Latitud),
                longitud: Number(geo.Longitud),
                radio: geo.Radio !== null ? Number(geo.Radio) : null,
                poligonoGeoJSON: geo.PoligonoGeoJSON ?? null,
                activo: Boolean(geo.Activo),
                totalEmpleados: geo.idSite ? (countsMap.get(geo.idSite) ?? 0) : 0,
                site: geo.CatSites
                    ? {
                        idSite: geo.CatSites.idSite,
                        descripcion: geo.CatSites.Descripcion,
                        municipio: geo.CatSites.MunicipioDelegacion,
                        estado: geo.CatSites.Estado,
                    }
                    : null,
            }));
        } catch (error) {
            console.error('Error al obtener geocercas:', error);
            throw new InternalServerErrorException('Error al consultar las geocercas');
        }
    }

    // Crea una nueva geocerca
    async create(user: ActiveUserDto, companyId: number, dto: CreateGeofenceDto) {
        try {
            return await this.prisma.$transaction(async (tx) => {
                // Guardar la geocerca principal
                const poligonoData = dto.tipo === GeofenceType.POLYGON && dto.puntos
                    ? (dto.puntos as unknown as Prisma.InputJsonValue)
                    : Prisma.JsonNull;

                const newGeofence = await tx.catGeocercas.create({
                    data: {
                        idTenant: user.idTenant,
                        idEmpresa: companyId,
                        idSite: dto.idSite,
                        Nombre: dto.nombre,
                        Tipo: dto.tipo,
                        Latitud: dto.latitud,
                        Longitud: dto.longitud,
                        Radio: dto.tipo === GeofenceType.CIRCLE ? dto.radio : null,
                        PoligonoGeoJSON: poligonoData,
                        Activo: true,
                    },
                });

                // 2. Si es polígono, guardar sus vértices normalizados
                if (dto.tipo === GeofenceType.POLYGON && dto.puntos && dto.puntos.length > 0) {
                    const verticesData = dto.puntos.map((punto, index) => ({
                        idGeocerca: newGeofence.idGeocerca,
                        Orden: index,
                        Latitud: punto.lat,
                        Longitud: punto.lng,
                    }));

                    await tx.relGeocercaVertices.createMany({
                        data: verticesData,
                    });
                }

                await tx.historicoMovimientos.create({
                    data: {
                        idUsuario: user.id,
                        idEmpresa: companyId,
                        accion: 'CREAR',
                        tablaOrigen: 'CatGeocercas',
                        idRegistro: String(newGeofence.idGeocerca),
                        descripcion: `Geocerca "${newGeofence.Nombre}" creada por ${user.first_name} ${user.last_name}`,
                        fechaCreacion: new Date(),
                    },
                });

                return newGeofence;
            });
        } catch (error) {
            this.logger.error('Error al crear geocerca:', error);
            throw new InternalServerErrorException('Error al guardar la geocerca en la base de datos');
        }
    }

    // Actualiza una geocerca
    async update(
        user: ActiveUserDto,
        companyId: number,
        geofenceId: number,
        dto: CreateGeofenceDto,
    ) {
        try {
            return await this.prisma.$transaction(
                async (tx) => {
                    // 1. Buscar la geocerca
                    const existingGeofence =
                        await tx.catGeocercas.findFirst({
                            where: {
                                idGeocerca: geofenceId,
                                idEmpresa: companyId,
                                idTenant: user.idTenant,
                            },
                        });

                    if (!existingGeofence) {
                        throw new NotFoundException(
                            'La geocerca no existe o no pertenece a esta empresa.',
                        );
                    }

                    // 2. Preparar PoligonoGeoJSON
                    const poligonoData =
                        dto.tipo ===
                            GeofenceType.POLYGON &&
                            dto.puntos
                            ? (dto.puntos as unknown as Prisma.InputJsonValue)
                            : Prisma.JsonNull;

                    // 3. Actualizar geocerca principal
                    const updatedGeofence =
                        await tx.catGeocercas.update({
                            where: {
                                idGeocerca: geofenceId,
                            },
                            data: {
                                idSite: dto.idSite,
                                Nombre: dto.nombre,
                                Tipo: dto.tipo,
                                Latitud: dto.latitud,
                                Longitud: dto.longitud,
                                // El radio solamente aplica para geocercas circulares.
                                Radio: dto.tipo === GeofenceType.CIRCLE ? dto.radio : null,
                                // El polígono solamente aplica para geocercas tipo polygon.
                                PoligonoGeoJSON: poligonoData,
                            },
                        });

                    // 4. Eliminar vértices anteriores
                    await tx.relGeocercaVertices.deleteMany({
                        where: {
                            idGeocerca: geofenceId,
                        },
                    });

                    // 5. Crear nuevamente los vértices si la geocerca es un polígono
                    if (dto.tipo === GeofenceType.POLYGON && dto.puntos && dto.puntos.length > 0) {
                        const verticesData = dto.puntos.map(
                            (punto, index) => ({
                                idGeocerca: geofenceId,
                                Orden: index,
                                Latitud: punto.lat,
                                Longitud: punto.lng,
                            }),
                        );

                        await tx.relGeocercaVertices.createMany(
                            {
                                data: verticesData,
                            },
                        );
                    }

                    // 6. Registrar modificación en histórico
                    await tx.historicoMovimientos.create(
                        {
                            data: {
                                idUsuario: user.id,
                                idEmpresa: companyId,
                                accion: 'ACTUALIZAR',
                                tablaOrigen: 'CatGeocercas',
                                idRegistro: String(geofenceId),
                                descripcion: `Geocerca "${updatedGeofence.Nombre}" actualizada por ${user.first_name} ${user.last_name}`,
                                fechaCreacion: new Date(),
                            },
                        },
                    );

                    // 7. Regresar la geocerca actualizada
                    return updatedGeofence;
                },
            );

        } catch (error) {
            if (error instanceof NotFoundException) throw error;
            this.logger.error(`Error al actualizar la geocerca ${geofenceId}:`, error);
            throw new InternalServerErrorException('Error al actualizar la geocerca en la base de datos.');
        }
    }

    // Elimina una geocerca
    async delete(user: ActiveUserDto, companyId: number, geofenceId: number) {
        try {
            return await this.prisma.$transaction(async (tx) => {
                // 1. Buscar la geocerca y validar empresa y tenant.
                const geofence = await tx.catGeocercas.findFirst({
                    where: {
                        idGeocerca: geofenceId,
                        idEmpresa: companyId,
                        idTenant: user.idTenant,
                    },
                });

                if (!geofence) {
                    throw new NotFoundException(
                        'La geocerca no existe o no pertenece a esta empresa.',
                    );
                }

                // 2. Eliminar físicamente los vértices asociados.
                await tx.relGeocercaVertices.deleteMany({
                    where: {
                        idGeocerca: geofenceId,
                    },
                });

                // 3. Registrar la eliminación en el histórico.
                await tx.historicoMovimientos.create({
                    data: {
                        idUsuario: user.id,
                        idEmpresa: companyId,
                        accion: 'ELIMINAR',
                        tablaOrigen: 'CatGeocercas',
                        idRegistro: String(geofence.idGeocerca),
                        descripcion: `Geocerca "${geofence.Nombre}" eliminada permanentemente por ${user.first_name} ${user.last_name}`,
                        fechaCreacion: new Date(),
                    },
                });

                // 4. Eliminar físicamente la geocerca.
                await tx.catGeocercas.delete({
                    where: {
                        idGeocerca: geofenceId,
                    },
                });

                return {
                    message: 'Geocerca eliminada permanentemente.',
                    idGeocerca: geofenceId,
                };
            });
        } catch (error) {
            // Conservar las excepciones HTTP que lanzamos explícitamente.
            if (error instanceof NotFoundException) throw error;
            this.logger.error(`Error al eliminar la geocerca ${geofenceId}:`, error);
            throw new InternalServerErrorException('Error al eliminar la geocerca de la base de datos.');
        }
    }

}