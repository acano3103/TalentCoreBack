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
    ): Promise<PaginatedLogbookResponseDto> {
        const skip = (page - 1) * limit;

        // Condición base: Tenant/Empresa del tenant actual y Empleado activo = true (1)
        const where: Prisma.RegistrosAsistenciaWhereInput = {
            idEmpresa: companyId,
            ...(user.idTenant && { idTenant: user.idTenant }),
            Empleados: {
                activo: true, // Filtro obligatorio: solo empleados activos
            },
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

        // Filtro de búsqueda (nombre, apellidos o número de empleado)
        if (search && search.trim() !== '') {
            const term = search.trim();

            where.Empleados = {
                is: {
                    activo: true,
                    OR: [
                        { numeroEmpleado: { contains: term } },
                        { nombre: { contains: term } },
                        { primerApellido: { contains: term } },
                        { segundoApellido: { contains: term } },
                    ],
                },
            };
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
                    ubicacionDispositivo: reg.nombreDispositivo ?? (reg.idSitioDetectado ? `Sitio #${reg.idSitioDetectado}` : null),
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