import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
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

        if (startDate) {
            const parsedDate = new Date(startDate);
            if (!isNaN(parsedDate.getTime())) {
                where.fechaHoraRegistro = {
                    gte: parsedDate,
                };
            }
        }

        try {
            const [total, registros] = await Promise.all([
                this.prisma.registrosAsistencia.count({ where }),
                this.prisma.registrosAsistencia.findMany({
                    where,
                    skip,
                    take: limit,
                    orderBy: {
                        fechaHoraRegistro: 'desc',
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

            // 1. Extraer los IDs únicos de sitio detectados en esta página
            const siteIds = Array.from(
                new Set(
                    registros
                        .map((r) => r.idSitioDetectado)
                        .filter((id): id is number => id !== null && id !== undefined)
                )
            );

            // 2. Consultar en lote los nombres (Descripcion) desde CatSites
            let sitesMap = new Map<number, string>();
            if (siteIds.length > 0) {
                // Nota: Cambia 'catSites' por el nombre del modelo exacto en tu schema.prisma (e.g. catSites o CatSites)
                const sites = await this.prisma.catSites.findMany({
                    where: {
                        idSite: { in: siteIds },
                    },
                    select: {
                        idSite: true,
                        Descripcion: true,
                    },
                });

                sitesMap = new Map(
                    sites.map((s) => [s.idSite, s.Descripcion ?? `Sitio #${s.idSite}`])
                );
            }

            // 3. Mapeo limpio para el frontend integrando la resolución
            const data: LogbookItemDto[] = registros.map((reg) => {
                const emp = reg.Empleados;
                const nombreCompleto = [emp?.nombre, emp?.primerApellido, emp?.segundoApellido]
                    .filter(Boolean)
                    .join(' ');

                // Prioridad: 
                // 0) Coordenadas
                // 1) Nombre del sitio si idSitioDetectado existe y se encuentra en CatSites
                // 2) Fallback a 'Sitio #ID' si idSitioDetectado existe pero no se encontró en la BD
                // 3) Nombre del dispositivo
                // 4) null
                const tieneCoordenadas =
                    reg.latitud !== null &&
                    reg.latitud !== undefined &&
                    reg.longitud !== null &&
                    reg.longitud !== undefined;

                const ubicacionDispositivo = tieneCoordenadas
                    ? `${reg.latitud}, ${reg.longitud}`
                    : reg.idSitioDetectado
                        ? (sitesMap.get(reg.idSitioDetectado) ?? `Sitio #${reg.idSitioDetectado}`)
                        : (reg.nombreDispositivo ?? null);

                // si ubicacionDispositivo sigue null regresamos la latitud y longitud si aplica 

                return {
                    idRegistro: reg.idRegistro.toString(),
                    empleado: {
                        idEmpleado: emp?.idEmpleado ?? reg.idEmpleado,
                        numeroEmpleado: emp?.numeroEmpleado ?? null,
                        nombreCompleto,
                    },
                    fechaHoraRegistro: reg.fechaHoraRegistro,
                    tipo: reg.tipo,
                    canal: reg.canal,
                    ubicacionDispositivo,
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

    async findOne(
        user: ActiveUserDto,
        companyId: number,
        logbookId: number,
    ) {
        if (!user.idTenant) {
            throw new BadRequestException(
                'El usuario no tiene un tenant asignado.',
            );
        }

        try {
            // Aplicamos las mismas validaciones base que en findAll:
            // empresa, tenant y empleado activo.
            const where = await this.buildWhere(
                user,
                companyId,
            );

            // Buscar el registro específico de asistencia.
            const registro = await this.prisma.registrosAsistencia.findFirst({
                where: {
                    ...where,
                    idRegistro: logbookId,
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
            });

            if (!registro) {
                throw new NotFoundException(
                    'El registro de asistencia no existe o no pertenece a esta empresa.',
                );
            }

            const emp = registro.Empleados;

            const nombreCompleto = [
                emp?.nombre,
                emp?.primerApellido,
                emp?.segundoApellido,
            ]
                .filter(Boolean)
                .join(' ');

            // Verificamos si la asistencia tiene coordenadas propias.
            const tieneCoordenadasPersonalizadas =
                registro.latitud !== null &&
                registro.latitud !== undefined &&
                registro.longitud !== null &&
                registro.longitud !== undefined;

            let ubicacionDetalle: {
                tipo: 'PERSONALIZADA' | 'SUCURSAL' | 'SIN_UBICACION';
                mensaje: string;
                latitud: number | null;
                longitud: number | null;
                idSite: number | null;
                nombre: string | null;
                direccion: string | null;
            };

            let ubicacionDispositivo: string | null = null;

            // --------------------------------------------------
            // CASO 1: LA ASISTENCIA TIENE COORDENADAS PROPIAS
            // --------------------------------------------------
            if (tieneCoordenadasPersonalizadas) {
                const latitud = Number(registro.latitud);
                const longitud = Number(registro.longitud);

                ubicacionDetalle = {
                    tipo: 'PERSONALIZADA',
                    mensaje: 'Ubicación personalizada obtenida del dispositivo.',
                    latitud,
                    longitud,
                    idSite: null,
                    nombre: null,
                    direccion: null,
                };

                ubicacionDispositivo = `${latitud}, ${longitud}`;
            }

            // --------------------------------------------------
            // CASO 2: NO TIENE COORDENADAS, PERO TIENE UN SITE
            // --------------------------------------------------
            else if (registro.idSitioDetectado) {
                const site = await this.prisma.catSites.findFirst({
                    where: {
                        idSite: registro.idSitioDetectado,
                        idEmpresa: companyId,
                        idTenant: user.idTenant,
                    },
                    select: {
                        idSite: true,
                        Descripcion: true,
                        Calle: true,
                        NoExterior: true,
                        NoInterior: true,
                        Colonia: true,
                        MunicipioDelegacion: true,
                        Estado: true,
                        CodigoPostal: true,
                        Pais: true,
                        Latitud: true,
                        Longitud: true,
                    },
                });

                if (site) {
                    const direccion = [
                        site.Calle,
                        site.NoExterior ? `No. ${site.NoExterior}` : null,
                        site.NoInterior ? `Int. ${site.NoInterior}` : null,
                        site.Colonia,
                        site.CodigoPostal,
                        site.MunicipioDelegacion,
                        site.Estado,
                        site.Pais,
                    ]
                        .filter(Boolean)
                        .join(', ');

                    const tieneCoordenadasSite =
                        site.Latitud !== null &&
                        site.Latitud !== undefined &&
                        site.Longitud !== null &&
                        site.Longitud !== undefined;

                    ubicacionDetalle = {
                        tipo: 'SUCURSAL',
                        mensaje: tieneCoordenadasSite
                            ? 'Se devuelve la ubicación geográfica de la sucursal donde se registró la asistencia.'
                            : 'La asistencia está relacionada con una sucursal, pero esta no tiene coordenadas registradas.',
                        latitud: tieneCoordenadasSite
                            ? Number(site.Latitud)
                            : null,
                        longitud: tieneCoordenadasSite
                            ? Number(site.Longitud)
                            : null,
                        idSite: site.idSite,
                        nombre: site.Descripcion,
                        direccion: direccion || null,
                    };

                    ubicacionDispositivo =
                        site.Descripcion ?? `Sitio #${site.idSite}`;
                } else {
                    // El registro tiene un ID de sitio, pero no encontramos
                    // ese sitio dentro de la empresa y tenant actuales.
                    ubicacionDetalle = {
                        tipo: 'SUCURSAL',
                        mensaje: 'El registro está relacionado con una sucursal, pero no fue posible encontrar sus datos.',
                        latitud: null,
                        longitud: null,
                        idSite: registro.idSitioDetectado,
                        nombre: null,
                        direccion: null,
                    };

                    ubicacionDispositivo =
                        `Sitio #${registro.idSitioDetectado}`;
                }
            }

            // --------------------------------------------------
            // CASO 3: NO TIENE COORDENADAS NI SITE
            // --------------------------------------------------
            else {
                ubicacionDetalle = {
                    tipo: 'SIN_UBICACION',
                    mensaje: 'No existe una ubicación geográfica personalizada ni una sucursal relacionada con este registro.',
                    latitud: null,
                    longitud: null,
                    idSite: null,
                    nombre: registro.nombreDispositivo ?? null,
                    direccion: null,
                };

                ubicacionDispositivo =
                    registro.nombreDispositivo ?? null;
            }

            // --------------------------------------------------
            // RESPUESTA FINAL
            // Conservamos la estructura del findAll y agregamos
            // ubicacionDetalle para el modal de información.
            // --------------------------------------------------
            return {
                idRegistro: registro.idRegistro.toString(),

                empleado: {
                    idEmpleado: emp?.idEmpleado ?? registro.idEmpleado,
                    numeroEmpleado: emp?.numeroEmpleado ?? null,
                    nombreCompleto,
                },

                fechaHoraRegistro: registro.fechaHoraRegistro,
                tipo: registro.tipo,
                canal: registro.canal,

                ubicacionDispositivo,

                // Información resuelta para mostrar el mapa y el mensaje.
                ubicacionDetalle,

                // Se conservan las coordenadas originales de la asistencia.
                geocerca: {
                    resultado: registro.resultadoGeocerca,
                    latitud:
                        registro.latitud !== null &&
                            registro.latitud !== undefined
                            ? Number(registro.latitud)
                            : null,
                    longitud:
                        registro.longitud !== null &&
                            registro.longitud !== undefined
                            ? Number(registro.longitud)
                            : null,
                },

                evidencia: {
                    tieneFoto: Boolean(registro.urlFoto),
                    urlFoto: registro.urlFoto ?? null,
                },

                sync: {
                    esOffline: Boolean(registro.esOffline),
                    fechaHoraRecepcion: registro.fechaHoraRecepcion,
                    label: this.resolveSyncLabel(registro),
                },

                estatusProcesamiento: registro.estatusProcesamiento,
            };

        } catch (error) {
            if (
                error instanceof NotFoundException ||
                error instanceof BadRequestException
            ) {
                throw error;
            }

            this.logger.error(
                `Error al consultar el registro de bitácora ${logbookId} de la empresa ${companyId}`,
                error,
            );

            throw error;
        }
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