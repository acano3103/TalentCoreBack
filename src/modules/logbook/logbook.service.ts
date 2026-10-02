import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ActiveUserDto } from '../auth/dto/active-user.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { PaginatedLogbookResponseDto, LogbookItemDto } from './dto/logbook-response.dto';
import { Prisma } from 'generated/prisma/client';
import { ExcelColumn, ExcelExportService } from 'src/common/services/excel-export.service';

// Zona horaria del negocio (CDMX, sin horario de verano desde 2022)
const TZ_NEGOCIO = 'America/Mexico_City';
const OFFSET_NEGOCIO = '-06:00';
const CANAL_LABELS: Record<string, string> = {
    BIOMETRICO: 'Biométrico',
    NFC: 'NFC',
    IVR: 'IVR',
    APP_MOVIL: 'App móvil',
    WEB_MANUAL: 'Web manual',
};

@Injectable()
export class LogbookService {
    private readonly logger = new Logger(LogbookService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly excelExportService: ExcelExportService,
    ) { }

    /**
     * Construye el where común (tenant, empresa, unidad/ubicación, empleado activo y búsqueda).
     * Lo usan la tabla paginada y la exportación, para que ambas filtren igual.
     */
    private async buildWhere(
        user: ActiveUserDto,
        companyId: number,
        search?: string,
        idSite?: string,
        idUnidadOperativa?: string,
    ): Promise<Prisma.RegistrosAsistenciaWhereInput> {
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

        // Condiciones sobre el empleado: activo + ubicación + búsqueda (combinadas)
        const empleadoWhere: Prisma.EmpleadosWhereInput = {
            activo: true, // Filtro obligatorio: solo empleados activos
            ...(siteFilter && { idSite: { in: siteFilter } }),
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

        return {
            idEmpresa: companyId,
            ...(user.idTenant && { idTenant: user.idTenant }),
            Empleados: { is: empleadoWhere },
        };
    }

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

        const where = await this.buildWhere(user, companyId, search, idSite, idUnidadOperativa);

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

            // Mapeo limpio para el frontend
            const data: LogbookItemDto[] = registros.map((reg) => {
                const emp = reg.Empleados;
                const nombreCompleto = [emp?.nombre, emp?.primerApellido, emp?.segundoApellido]
                    .filter(Boolean)
                    .join(' ');

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
                    ubicacionDispositivo: this.resolveUbicacion(reg),
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
                        label: this.resolveSyncLabel(reg),
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

    /**
     * Exporta a Excel TODOS los registros que cumplan los filtros (sin paginar).
     * Las fechas del filtro se interpretan en hora de México (días completos).
     */
    async exportLogbook(
        user: ActiveUserDto,
        companyId: number,
        filters: { search?: string; idSite?: string; idUnidadOperativa?: string; fechaDesde?: string; fechaHasta?: string },
    ): Promise<Buffer> {
        if (!user.idTenant) {
            throw new BadRequestException('El usuario no tiene un tenant asignado');
        }

        const where = await this.buildWhere(user, companyId, filters.search, filters.idSite, filters.idUnidadOperativa);

        const esFecha = (f?: string) => !!f && /^\d{4}-\d{2}-\d{2}$/.test(f);
        if (esFecha(filters.fechaDesde) || esFecha(filters.fechaHasta)) {
            where.fechaHoraRegistro = {
                ...(esFecha(filters.fechaDesde) && { gte: new Date(`${filters.fechaDesde}T00:00:00.000${OFFSET_NEGOCIO}`) }),
                ...(esFecha(filters.fechaHasta) && { lte: new Date(`${filters.fechaHasta}T23:59:59.999${OFFSET_NEGOCIO}`) }),
            };
        }

        const registros = await this.prisma.registrosAsistencia.findMany({
            where,
            orderBy: { fechaHoraRegistro: 'desc' },
            include: {
                Empleados: {
                    select: {
                        numeroEmpleado: true,
                        nombre: true,
                        primerApellido: true,
                        segundoApellido: true,
                    },
                },
            },
        });

        type RegistroExport = (typeof registros)[number];

        const formatFecha = (d: Date | null) =>
            d ? d.toLocaleDateString('es-MX', { timeZone: TZ_NEGOCIO, day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
        const formatHora = (d: Date | null) =>
            d ? d.toLocaleTimeString('es-MX', { timeZone: TZ_NEGOCIO, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }) : '';

        const columns: ExcelColumn<RegistroExport>[] = [
            {
                header: 'Empleado', key: 'empleado', width: 34,
                value: (r) => [r.Empleados?.nombre, r.Empleados?.primerApellido, r.Empleados?.segundoApellido].filter(Boolean).join(' '),
            },
            { header: 'Número', key: 'numero', width: 12, value: (r) => r.Empleados?.numeroEmpleado },
            { header: 'Fecha', key: 'fecha', width: 14, value: (r) => formatFecha(r.fechaHoraRegistro) },
            { header: 'Hora', key: 'hora', width: 14, value: (r) => formatHora(r.fechaHoraRegistro) },
            { header: 'Tipo', key: 'tipo', width: 12, value: (r) => this.humanize(r.tipo) },
                       { header: 'Canal', key: 'canal', width: 16, value: (r) => (r.canal ? CANAL_LABELS[r.canal] ?? this.humanize(r.canal) : '') },
            { header: 'Ubicación', key: 'ubicacion', width: 28, value: (r) => this.resolveUbicacion(r) },
            { header: 'Geocerca', key: 'geocerca', width: 16, value: (r) => this.humanize(r.resultadoGeocerca) },
            { header: 'Evidencia', key: 'evidencia', width: 12, value: (r) => (r.urlFoto ? 'Sí' : 'No') },
            { header: 'Sync', key: 'sync', width: 12, value: (r) => this.resolveSyncLabel(r) },
            { header: 'Estatus', key: 'estatus', width: 16, value: (r) => this.humanize(r.estatusProcesamiento) },
        ];

        return this.excelExportService.generate({
            sheetName: 'Bitácora',
            columns,
            rows: registros,
        });
    }

    // --- Helpers compartidos entre tabla y exportación ---

    private resolveUbicacion(reg: { nombreDispositivo?: string | null; idSitioDetectado?: number | null }): string | null {
        return reg.nombreDispositivo ?? (reg.idSitioDetectado ? `Sitio #${reg.idSitioDetectado}` : null);
    }

    // Resolver etiqueta de sincronización según canal y condición offline
    private resolveSyncLabel(reg: {
        esOffline?: boolean | null;
        idExternoArtemis?: unknown;
        idDispositivoArtemis?: unknown;
        canal?: string | null;
    }): string {
        if (reg.esOffline) return 'Offline';
        if (reg.idExternoArtemis || reg.idDispositivoArtemis) return 'Artemis';
        if (reg.canal === 'WEB_MANUAL') return 'Manual';
        return 'En línea';
    }

    // ENTRADA -> Entrada, NO_APLICA -> No aplica, BIOMETRICO -> Biometrico
    private humanize(value?: string | null): string {
        if (!value) return '';
        const text = value.replace(/_/g, ' ').toLowerCase();
        return text.charAt(0).toUpperCase() + text.slice(1);
    }
}