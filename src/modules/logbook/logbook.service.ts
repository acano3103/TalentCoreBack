import { Injectable, Logger } from '@nestjs/common';
import { ActiveUserDto } from '../auth/dto/active-user.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { PaginatedLogbookResponseDto, LogbookItemDto } from './dto/logbook-response.dto';
import { Prisma } from 'generated/prisma/client';

@Injectable()
export class LogbookService {
    private readonly logger = new Logger(LogbookService.name);

    constructor(private readonly prisma: PrismaService) { }

    async findAll(
        user: ActiveUserDto,
        companyId: number,
        page: number,
        limit: number,
        startDate?: string,
        search?: string,
        idSite?: string,
        idUnidadOperativa?: string,
    ): Promise<PaginatedLogbookResponseDto> {
        const skip = (page - 1) * limit;

        // Filtro por ubicación / unidad operativa (idSite gana si vienen ambos)
        let siteFilter: number[] | undefined;

        if (idSite && !isNaN(Number(idSite))) {
            siteFilter = [Number(idSite)];
        } else if (idUnidadOperativa && !isNaN(Number(idUnidadOperativa))) {
            const sites = await this.prisma.catSites.findMany({
                where: {
                    idUnidadOperativa: Number(idUnidadOperativa),
                    ...(user.idTenant && { idTenant: user.idTenant }),
                },
                select: { idSite: true },
            });
            // Si la unidad no tiene ubicaciones, queda [] y no regresa registros
            siteFilter = sites.map((s) => Number(s.idSite));
        }

        // Condiciones sobre el empleado: solo activo y término de búsqueda
        const empleadoWhere: Prisma.EmpleadosWhereInput = {
            activo: true, // Filtro obligatorio: solo empleados activos
        };

        // Filtro de búsqueda (nombre, apellidos o número de empleado)
        if (search && search.trim() !== '') {
            const term = search.trim();
            empleadoWhere.OR = [
                { numeroEmpleado: { contains: term } },
                { nombre: { contains: term } },
                { primerApellido: { contains: term } },
                { segundoApellido: { contains: term } },
            ];
        }

        // Condición base: Tenant/Empresa del tenant actual + condiciones del empleado + SITIO DETECTADO
        const where: Prisma.RegistrosAsistenciaWhereInput = {
            idEmpresa: companyId,
            ...(user.idTenant && { idTenant: user.idTenant }),
            ...(siteFilter && { idSitioDetectado: { in: siteFilter } }), // <--- AQUÍ SE APLICA EL FILTRO DIRECTO AL REGISTRO
            Empleados: { is: empleadoWhere },
        };

        // Filtro por fecha inicial (o rango del día si se envía YYYY-MM-DD)
        if (startDate) {
            const parsedDate = new Date(startDate);
            if (!isNaN(parsedDate.getTime())) {
                where.fechaHoraRegistro = {
                    gte: parsedDate,
                };
            }
        }

        try {
            // Consulta en paralelo para optimizar tiempos de respuesta
            const [total, registros] = await Promise.all([
                this.prisma.registrosAsistencia.count({ where }),
                this.prisma.registrosAsistencia.findMany({
                    where,
                    skip,
                    take: limit,
                    orderBy: {
                        fechaHoraRegistro: 'desc', // Clave: registros más recientes primero
                    },
                    include: {
                        Empleados: {
                            select: {
                                idEmpleado: true,
                                numeroEmpleado: true,
                                nombre: true,
                                primerApellido: true,
                                segundoApellido: true,
                            },
                        },
                    },
                }),
            ]);

            // Obtener los nombres de las sedes a partir de idSitioDetectado
            const siteIds = Array.from(
                new Set(
                    registros
                        .map((r) => r.idSitioDetectado)
                        .filter((id): id is number => id !== null && id !== undefined),
                ),
            );

            const siteMap = new Map<number, string>();
            if (siteIds.length > 0) {
                const sites = await this.prisma.catSites.findMany({
                    where: {
                        idSite: { in: siteIds },
                    },
                    select: {
                        idSite: true,
                        Descripcion: true,
                    },
                });

                sites.forEach((s) => {
                    siteMap.set(s.idSite, s.Descripcion!);
                });
            }

            // Mapeo limpio para el frontend
            const data: LogbookItemDto[] = registros.map((reg) => {
                const emp = reg.Empleados;
                const nombreCompleto = [emp?.nombre, emp?.primerApellido, emp?.segundoApellido]
                    .filter(Boolean)
                    .join(' ');

                // Resolver etiqueta de sincronización según canal y condición offline
                let syncLabel = 'En línea';
                if (reg.esOffline) {
                    syncLabel = 'Offline';
                } else if (reg.idExternoArtemis || reg.idDispositivoArtemis) {
                    syncLabel = 'Artemis';
                } else if (reg.canal === 'WEB_MANUAL') {
                    syncLabel = 'Manual';
                }

                // Resolver el nombre de la ubicación:
                // Prioridad 1: Nombre de la sede obtenida de CatSites (a través de idSitioDetectado)
                // Prioridad 2: Fallback a nombreDispositivo (para registros legacy/previos)
                // Prioridad 3: null
                const nombreUbicacionSede = reg.idSitioDetectado
                    ? (siteMap.get(reg.idSitioDetectado) ?? `Sitio #${reg.idSitioDetectado}`)
                    : (reg.nombreDispositivo ?? null);

                return {
                    idRegistro: reg.idRegistro.toString(), // Conversión de BigInt a String
                    empleado: {
                        idEmpleado: emp?.idEmpleado ?? reg.idEmpleado,
                        numeroEmpleado: emp?.numeroEmpleado ?? null,
                        nombreCompleto,
                    },
                    fechaHoraRegistro: reg.fechaHoraRegistro,
                    tipo: reg.tipo,
                    canal: reg.canal,
                    ubicacionDispositivo: nombreUbicacionSede,
                    geocerca: {
                        resultado: reg.resultadoGeocerca,
                        latitud: reg.latitud ? Number(reg.latitud) : null,
                        longitud: reg.longitud ? Number(reg.longitud) : null,
                    },
                    evidencia: {
                        tieneFoto: Boolean(reg.urlFoto),
                        urlFoto: reg.urlFoto ?? null,
                    },
                    sync: {
                        esOffline: Boolean(reg.esOffline),
                        fechaHoraRecepcion: reg.fechaHoraRecepcion,
                        label: syncLabel,
                    },
                    estatusProcesamiento: reg.estatusProcesamiento,
                };
            });

            const totalPages = Math.ceil(total / limit);

            return {
                data,
                meta: {
                    total,
                    page,
                    limit,
                    totalPages,
                    hasNextPage: page < totalPages,
                    hasPreviousPage: page > 1,
                },
            };
        } catch (error) {
            this.logger.error(`Error al consultar bitácora para empresa ${companyId}`, error);
            throw error;
        }
    }
}