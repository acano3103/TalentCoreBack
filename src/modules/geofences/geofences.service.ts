import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { CreateGeofenceDto, GeofenceType } from './dto/create-geofence.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { ActiveUserDto } from '../auth/dto/active-user.dto';
import { Prisma } from 'generated/prisma/client';

@Injectable()
export class GeofencesService {
    private readonly logger = new Logger(GeofencesService.name);

    constructor(private prisma: PrismaService) { }

    async findAll(user: ActiveUserDto, companyId: number) {
        try {
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

            // Mapeo para formatear los tipos Decimal a number y entregar una estructura limpia al Front
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
                site: geo.CatSites ? {
                    idSite: geo.CatSites.idSite,
                    descripcion: geo.CatSites.Descripcion,
                    municipio: geo.CatSites.MunicipioDelegacion,
                    estado: geo.CatSites.Estado,
                } : null,
            }));
        } catch (error) {
            console.error('Error al obtener geocercas:', error);
            throw new InternalServerErrorException('Error al consultar las geocercas');
        }
    }

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

}
