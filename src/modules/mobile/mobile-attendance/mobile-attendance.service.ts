import { createHash, randomUUID } from 'crypto';
import { addDays } from 'date-fns';
import {
    BadRequestException,
    ForbiddenException,
    HttpException,
    HttpStatus,
    Injectable,
    NotFoundException,
    PayloadTooLargeException,
    UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { saveFileLocal } from 'src/common/utils/file-storage.util';
import { ActiveUserDto } from 'src/modules/auth/dto/active-user.dto';
import { AttendanceEngineService } from 'src/modules/attendance/engine/attendance-engine.service';
import {
    CanonicalCheck,
    ResultadoCheck,
} from 'src/modules/attendance/engine/interfaces/canonical-check.interface';
import { TipoChecada } from 'src/modules/attendance/engine/state-machine';
import {
    jornadaConMarcajesInclude,
    mapJornadaConMarcajes,
} from 'src/modules/attendance/utils/jornada-response.util';
import {
    addLocalDays,
    formatIsoWithOffset,
    inclusiveLocalDays,
    isoWeekBounds,
    localDateToPrismaDate,
} from 'src/modules/attendance/utils/timezone.util';
import { PrismaService } from 'src/prisma/prisma.service';
import { MobileCheckDto } from './dto/mobile-check.dto';
import { SyncAttendanceDto } from './dto/sync-attendance.dto';

const DIAS_HISTORIAL_DEFAULT = 30;
const DIAS_HISTORIAL_MAXIMO = 90;
const HORAS_SEMANA_DEFAULT = 48;

const MOTIVO_DISPOSITIVO_NO_APROBADO =
    'El dispositivo no está aprobado para registrar asistencia.';
const MOTIVO_SIN_ACCIONES_PERMITIDAS =
    'No hay acciones de checada permitidas para la jornada de hoy.';

const ETIQUETAS: Record<TipoChecada, string> = {
    ENTRADA: 'Registrar entrada',
    INICIO_COMIDA: 'Salida a comida',
    FIN_COMIDA: 'Regreso de comida',
    SALIDA: 'Registrar salida',
};

const MENSAJES_CONFIRMACION: Record<TipoChecada, string> = {
    ENTRADA: 'Entrada registrada correctamente.',
    SALIDA: 'Salida registrada correctamente.',
    INICIO_COMIDA: 'Salida a comida registrada correctamente.',
    FIN_COMIDA: 'Regreso de comida registrado correctamente.',
};

const MIME_SELFIE = ['image/jpeg', 'image/png'];
const TAMANIO_MAX_SELFIE = 3 * 1024 * 1024;

const ORDEN_SEMANA = [
    'Lunes',
    'Martes',
    'Miércoles',
    'Jueves',
    'Viernes',
    'Sábado',
    'Domingo',
];

export type MobileAttendanceUser = ActiveUserDto & {
    idEmpleado?: number | null;
    idEmpresa?: number | null;
};

@Injectable()
export class MobileAttendanceService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly engine: AttendanceEngineService,
        private readonly configService: ConfigService,
    ) {}

    serverTime() {
        return this.reloj(new Date());
    }

    async bootstrap(user: MobileAttendanceUser) {
        const { idEmpleado, idEmpresa, idTenant } = this.identidad(user);
        const empleado = await this.obtenerEmpleado(idEmpleado, idEmpresa, idTenant);
        const ahora = new Date();

        const [dispositivo, geocercas, horarioSemana, ctx, sitioPrincipal] = await Promise.all([
            this.obtenerDispositivo(idEmpleado, idEmpresa, idTenant),
            this.engine.listarGeocercasMovil(idEmpleado),
            this.horarioSemana(idEmpleado),
            this.engine.resolveContext(idEmpleado, ahora),
            this.sitioPrincipal(idEmpleado),
        ]);

        return {
            ...this.reloj(ahora),
            empleado: {
                idEmpleado: empleado.idEmpleado,
                numeroEmpleado: empleado.numeroEmpleado,
                nombreCompleto: nombreCompleto(empleado),
                puesto: empleado.CatPuestos?.NombrePuesto ?? null,
                sitioPrincipal,
            },
            dispositivo: this.mapDispositivo(dispositivo),
            zonaHoraria: ctx.zonaHoraria,
            reglas: this.engine.getParametrosOperativos(ctx.config),
            geocercas,
            horarioSemana,
            versionMinimaApp: this.versionMinimaApp(),
        };
    }

    async today(user: MobileAttendanceUser) {
        const { idEmpleado, idEmpresa, idTenant } = this.identidad(user);
        await this.obtenerEmpleado(idEmpleado, idEmpresa, idTenant);

        const ahora = new Date();
        const ctx = await this.engine.resolveContext(idEmpleado, ahora);

        const [detalle, dispositivo, acumuladoSemana, accion] = await Promise.all([
            this.jornadaDeHoy(idEmpleado, idEmpresa, idTenant, ctx.fechaJornada),
            this.obtenerDispositivo(idEmpleado, idEmpresa, idTenant),
            this.acumuladoSemana(idEmpleado, idEmpresa, idTenant, ctx.fechaLocal),
            this.engine.resolveNextType(
                idEmpleado,
                ctx.fechaJornada,
                ctx.config,
                'SECUENCIA_COMPLETA',
            ),
        ]);

        return {
            fecha: ctx.fechaLocal,
            diaSemana: ctx.diaSemana,
            zonaHoraria: ctx.zonaHoraria,
            jornada: detalle.jornada,
            registros: detalle.registros,
            siguienteAccion: this.armarSiguienteAccion(accion, dispositivo),
            acumuladoSemana,
        };
    }

    async history(user: MobileAttendanceUser, from?: string, to?: string) {
        const { idEmpleado, idEmpresa, idTenant } = this.identidad(user);
        await this.obtenerEmpleado(idEmpleado, idEmpresa, idTenant);
        const rango = await this.resolverRango(idEmpleado, from, to);

        const jornadas = await this.prisma.jornadasEmpleado.findMany({
            where: {
                idEmpleado,
                idTenant,
                idEmpresa,
                fecha: {
                    gte: localDateToPrismaDate(rango.from),
                    lte: localDateToPrismaDate(rango.to),
                },
            },
            include: jornadaConMarcajesInclude,
            orderBy: { fecha: 'desc' },
        });

        return {
            from: rango.from,
            to: rango.to,
            jornadas: jornadas.map((jornada) => mapJornadaConMarcajes(jornada)),
        };
    }

    async uploadEvidence(user: MobileAttendanceUser, file?: Express.Multer.File) {
        const { idEmpleado, idEmpresa, idTenant } = this.identidad(user);
        await this.obtenerEmpleado(idEmpleado, idEmpresa, idTenant);

        if (!file?.buffer) {
            throw new BadRequestException({
                code: 'ARCHIVO_REQUERIDO',
                message: 'Adjunta la selfie en el campo file e intenta de nuevo.',
                detail: {},
            });
        }
        if (!MIME_SELFIE.includes(file.mimetype)) {
            throw new BadRequestException({
                code: 'ARCHIVO_INVALIDO',
                message: 'La selfie debe ser una imagen JPG o PNG.',
                detail: { mimetype: file.mimetype },
            });
        }
        if (file.size > TAMANIO_MAX_SELFIE) {
            throw new PayloadTooLargeException({
                code: 'ARCHIVO_DEMASIADO_GRANDE',
                message: 'La foto no puede pesar más de 3 MB. Toma otra más ligera e intenta de nuevo.',
                detail: { maxBytes: TAMANIO_MAX_SELFIE },
            });
        }

        const ahora = new Date();
        const anio = String(ahora.getUTCFullYear());
        const mes = String(ahora.getUTCMonth() + 1).padStart(2, '0');
        const folder = `attendance/${idEmpresa}/${anio}/${mes}`;
        const fileName = `${randomUUID()}.jpg`;
        const rutaArchivo = await saveFileLocal(file, folder, fileName);
        const hashSha256 = createHash('sha256').update(file.buffer).digest('hex');
        const fechaPurga = addDays(ahora, 365);

        const evidencia = await this.prisma.asistenciaEvidencias.create({
            data: {
                idTenant,
                idEmpresa,
                idEmpleado,
                tipo: 'SELFIE',
                rutaArchivo,
                mimeType: file.mimetype,
                tamanioBytes: file.size,
                hashSha256,
                fechaCaptura: ahora,
                consumida: false,
                fechaPurga,
            },
        });

        return {
            idEvidencia: evidencia.idEvidencia,
            hashSha256,
            tamanioBytes: file.size,
            expiraEn: fechaPurga.toISOString(),
        };
    }

    async check(user: MobileAttendanceUser, dto: MobileCheckDto) {
        const { idEmpleado, idEmpresa, idTenant } = this.identidad(user);
        const dispositivo = await this.resolverDispositivoAprobado(
            idEmpleado,
            idTenant,
            dto.identificadorDispositivo,
        );

        try {
            return this.mapearResultadoCheck(
                await this.engine.registerCheck(
                    this.aCanonicalCheck({ idEmpleado, idEmpresa, idTenant }, dto, dispositivo.idDispositivo),
                ),
            );
        } catch (error) {
            relanzarErrorMotor(error);
        }
    }

    /**
     * D5: sincroniza un lote offline. Ordena por fechaHoraRegistro ASC y procesa
     * en secuencia (cada item es su propia transacción en el motor). Un fallo
     * de negocio no aborta el lote.
     */
    async sync(user: MobileAttendanceUser, dto: SyncAttendanceDto) {
        const { idEmpleado, idEmpresa, idTenant } = this.identidad(user);
        const dispositivo = await this.resolverDispositivoAprobado(
            idEmpleado,
            idTenant,
            dto.items[0].identificadorDispositivo,
        );

        const ordenados = [...dto.items].sort(
            (a, b) =>
                new Date(a.fechaHoraRegistro).getTime() - new Date(b.fechaHoraRegistro).getTime(),
        );

        const resultados: SyncItemResultado[] = [];
        let aceptados = 0;
        let rechazados = 0;
        let duplicados = 0;

        for (const item of ordenados) {
            try {
                const resultado = await this.engine.registerCheck(
                    this.aCanonicalCheck(
                        { idEmpleado, idEmpresa, idTenant },
                        item,
                        dispositivo.idDispositivo,
                    ),
                );

                aceptados += 1;
                if (resultado.duplicado) {
                    duplicados += 1;
                }

                resultados.push({
                    uuidCliente: item.uuidCliente,
                    aceptado: true,
                    idRegistro: resultado.idRegistro,
                    tipo: resultado.tipo,
                    duplicado: resultado.duplicado,
                    advertencias: resultado.advertencias,
                    reintentable: false,
                });
            } catch (error) {
                rechazados += 1;
                resultados.push(mapearErrorSync(item.uuidCliente, error));
            }
        }

        return {
            procesados: ordenados.length,
            aceptados,
            rechazados,
            duplicados,
            resultados,
        };
    }

    private async resolverDispositivoAprobado(
        idEmpleado: number,
        idTenant: number,
        identificadorDispositivo: string,
    ) {
        const dispositivo = await this.prisma.dispositivosAsistencia.findUnique({
            where: {
                idTenant_identificadorDispositivo: {
                    idTenant,
                    identificadorDispositivo,
                },
            },
        });

        if (!dispositivo || dispositivo.estatus !== 'APROBADO' || dispositivo.idEmpleado !== idEmpleado) {
            throw new ForbiddenException({
                code: 'DISPOSITIVO_NO_APROBADO',
                message: mensajeDispositivoNoAprobado(dispositivo?.estatus ?? null),
                detail: { estatus: dispositivo?.estatus ?? null },
            });
        }

        await this.prisma.dispositivosAsistencia.update({
            where: { idDispositivo: dispositivo.idDispositivo },
            data: { ultimoUso: new Date() },
        });

        return dispositivo;
    }

    private aCanonicalCheck(
        identidad: { idEmpleado: number; idEmpresa: number; idTenant: number },
        dto: MobileCheckDto,
        idDispositivo: number,
    ): CanonicalCheck {
        return {
            idTenant: identidad.idTenant,
            idEmpresa: identidad.idEmpresa,
            idEmpleado: identidad.idEmpleado,
            canal: 'APP_MOVIL',
            tipo: dto.tipo,
            modoInferencia: 'EXPLICITO',
            fechaHoraRegistro: new Date(dto.fechaHoraRegistro),
            uuidCliente: dto.uuidCliente,
            ubicacion:
                dto.latitud != null && dto.longitud != null
                    ? {
                          latitud: dto.latitud,
                          longitud: dto.longitud,
                          precisionMetros: dto.precisionMetros,
                          esSimulada: dto.ubicacionSimulada,
                      }
                    : null,
            idEvidencia: dto.idEvidencia ?? null,
            idDispositivo,
            motivoFueraGeocerca: dto.motivoFueraGeocerca ?? null,
            esOffline: dto.esOffline ?? false,
            desfaseRelojSegundos: dto.desfaseRelojSegundos ?? null,
            versionApp: dto.versionApp ?? null,
        };
    }

    private mapearResultadoCheck(resultado: ResultadoCheck) {
        return {
            idRegistro: Number(resultado.idRegistro),
            idJornada: resultado.idJornada,
            tipo: resultado.tipo,
            duplicado: resultado.duplicado,
            resultadoGeocerca: resultado.resultadoGeocerca,
            distanciaGeocercaMetros: resultado.distanciaGeocercaMetros,
            mensaje: resultado.duplicado
                ? 'Esta checada ya estaba registrada. No se volvió a guardar.'
                : (MENSAJES_CONFIRMACION[resultado.tipo] ?? 'Checada registrada correctamente.'),
            advertencias: resultado.advertencias,
            jornada: {
                estatusJornada: resultado.jornada.estatusJornada,
                minutosTrabajados: resultado.jornada.minutosTrabajados,
                minutosRetardo: resultado.jornada.minutosRetardo,
                minutosComida: resultado.jornada.minutosComida,
                siguienteAccion: {
                    sugerido: resultado.jornada.siguienteAccion.sugerido,
                    permitidos: resultado.jornada.siguienteAccion.permitidos,
                    etiqueta: resultado.jornada.siguienteAccion.sugerido
                        ? (ETIQUETAS[resultado.jornada.siguienteAccion.sugerido] ?? null)
                        : null,
                },
            },
        };
    }

    private reloj(ahora: Date) {
        return {
            serverTime: formatIsoWithOffset(ahora),
            epochMs: ahora.getTime(),
        };
    }

    private identidad(user: MobileAttendanceUser) {
        if (user.idEmpleado == null) {
            throw new UnauthorizedException(
                'Tu sesión no incluye el perfil de empleado. Vuelve a iniciar sesión.',
            );
        }
        if (user.idEmpresa == null) {
            throw new UnauthorizedException('Tu sesión no incluye la empresa. Vuelve a iniciar sesión.');
        }
        if (user.idTenant == null) {
            throw new UnauthorizedException('Tu sesión no incluye el tenant. Vuelve a iniciar sesión.');
        }

        return {
            idEmpleado: user.idEmpleado,
            idEmpresa: user.idEmpresa,
            idTenant: user.idTenant,
        };
    }

    private async obtenerEmpleado(idEmpleado: number, idEmpresa: number, idTenant: number) {
        const empleado = await this.prisma.empleados.findFirst({
            where: { idEmpleado, idEmpresa, idTenant, activo: true },
            select: {
                idEmpleado: true,
                numeroEmpleado: true,
                nombre: true,
                primerApellido: true,
                segundoApellido: true,
                CatPuestos: { select: { NombrePuesto: true } },
            },
        });

        if (!empleado) {
            throw new NotFoundException(
                'No tienes un perfil de empleado activo vinculado a esta empresa.',
            );
        }

        return empleado;
    }

    private async sitioPrincipal(idEmpleado: number): Promise<string | null> {
        const principal = await this.prisma.relEmpleadosSites.findFirst({
            where: { idEmpleado, Activo: true, EsPrincipal: true },
            include: { CatSites: { select: { Descripcion: true } } },
        });
        const nombre = principal?.CatSites?.Descripcion?.trim();
        return nombre ? nombre : null;
    }

    private async obtenerDispositivo(idEmpleado: number, idEmpresa: number, idTenant: number) {
        return this.prisma.dispositivosAsistencia.findFirst({
            where: { idEmpleado, idEmpresa, idTenant },
            orderBy: [{ ultimoUso: 'desc' }, { idDispositivo: 'desc' }],
            select: { idDispositivo: true, estatus: true },
        });
    }

    private mapDispositivo(
        device: { idDispositivo: number; estatus: string } | null,
    ) {
        if (!device) return null;
        return {
            idDispositivo: device.idDispositivo,
            estatus: device.estatus,
            puedeRegistrar: device.estatus === 'APROBADO',
        };
    }

    private async horarioSemana(idEmpleado: number) {
        const horarios = await this.prisma.horariosEmpleado.findMany({
            where: { idEmpleado },
            select: {
                DiaSemana: true,
                HoraEntrada: true,
                HoraSalida: true,
                Modalidad: true,
            },
        });

        return [...horarios]
            .sort((a, b) => ordenDia(a.DiaSemana) - ordenDia(b.DiaSemana))
            .map((horario) => ({
                diaSemana: horario.DiaSemana,
                horaEntrada: formatHora(horario.HoraEntrada),
                horaSalida: formatHora(horario.HoraSalida),
                modalidad: horario.Modalidad,
            }));
    }

    private async jornadaDeHoy(
        idEmpleado: number,
        idEmpresa: number,
        idTenant: number,
        fecha: Date,
    ) {
        const jornada = await this.prisma.jornadasEmpleado.findFirst({
            where: { idEmpleado, idEmpresa, idTenant, fecha },
        });

        if (!jornada) {
            return { jornada: null, registros: [] as RegistroHoy[] };
        }

        const registros = await this.prisma.registrosAsistencia.findMany({
            where: { idJornada: jornada.idJornada, idEmpleado },
            orderBy: { fechaHoraRegistro: 'asc' },
            select: {
                idRegistro: true,
                tipo: true,
                canal: true,
                fechaHoraRegistro: true,
                resultadoGeocerca: true,
                urlFoto: true,
                idEvidencia: true,
            },
        });

        return {
            jornada: {
                idJornada: jornada.idJornada,
                estatusJornada: jornada.estatusJornada,
                horaEntradaTeorica: formatHora(jornada.horaEntradaTeorica),
                horaSalidaTeorica: formatHora(jornada.horaSalidaTeorica),
                horaEntradaReal: isoONull(jornada.horaEntradaReal),
                horaSalidaReal: isoONull(jornada.horaSalidaReal),
                horaInicioComidaReal: isoONull(jornada.horaInicioComidaReal),
                horaFinComidaReal: isoONull(jornada.horaFinComidaReal),
                minutosTrabajados: jornada.minutosTrabajados,
                minutosRetardo: jornada.minutosRetardo,
                minutosComida: jornada.minutosComida,
                revisada: jornada.revisada,
            },
            registros: registros.map((registro) => ({
                idRegistro: Number(registro.idRegistro),
                tipo: registro.tipo,
                canal: registro.canal,
                fechaHoraRegistro: registro.fechaHoraRegistro,
                resultadoGeocerca: registro.resultadoGeocerca,
                tieneEvidencia: Boolean(registro.urlFoto) || registro.idEvidencia != null,
            })),
        };
    }

    private async acumuladoSemana(
        idEmpleado: number,
        idEmpresa: number,
        idTenant: number,
        fechaLocal: string,
    ) {
        const { inicio, fin } = isoWeekBounds(fechaLocal);
        const anio = Number(fechaLocal.slice(0, 4));

        const [jornadas, legal] = await Promise.all([
            this.prisma.jornadasEmpleado.findMany({
                where: {
                    idEmpleado,
                    idEmpresa,
                    idTenant,
                    fecha: { gte: inicio, lte: fin },
                },
                select: { minutosTrabajados: true },
            }),
            this.prisma.configuracionJornadaLegal.findFirst({
                where: { idEmpresa, idTenant, anio, activo: true },
                select: { horasSemana: true },
            }),
        ]);

        const minutosTrabajados = jornadas.reduce(
            (suma, jornada) => suma + (jornada.minutosTrabajados || 0),
            0,
        );
        const limiteLegalMinutos = this.limiteLegalMinutos(legal?.horasSemana);

        return {
            minutosTrabajados,
            limiteLegalMinutos,
            porcentaje: porcentajeDe(minutosTrabajados, limiteLegalMinutos),
            excedeLimite: minutosTrabajados > limiteLegalMinutos,
        };
    }

    private limiteLegalMinutos(horasSemana: unknown): number {
        if (horasSemana == null) return HORAS_SEMANA_DEFAULT * 60;
        const horas = Number(horasSemana);
        if (!Number.isFinite(horas)) return HORAS_SEMANA_DEFAULT * 60;
        return Math.round(horas * 60);
    }

    private armarSiguienteAccion(
        accion: { sugerido: TipoChecada | null; permitidos: TipoChecada[] },
        dispositivo: { estatus: string } | null,
    ) {
        const puedeRegistrar = dispositivo?.estatus === 'APROBADO';
        const hayAcciones = accion.permitidos.length > 0;

        let motivoBloqueo: string | null = null;
        if (!puedeRegistrar) {
            motivoBloqueo = MOTIVO_DISPOSITIVO_NO_APROBADO;
        } else if (!hayAcciones) {
            motivoBloqueo = MOTIVO_SIN_ACCIONES_PERMITIDAS;
        }

        return {
            sugerido: accion.sugerido,
            permitidos: accion.permitidos,
            etiqueta: accion.sugerido ? ETIQUETAS[accion.sugerido] ?? null : null,
            habilitado: puedeRegistrar && hayAcciones,
            motivoBloqueo,
        };
    }

    private async resolverRango(idEmpleado: number, from?: string, to?: string) {
        let inicio = from?.trim() || '';
        let fin = to?.trim() || '';

        if (!inicio || !fin) {
            const ctx = await this.engine.resolveContext(idEmpleado, new Date());
            if (!fin) fin = ctx.fechaLocal;
            if (!inicio) inicio = addLocalDays(fin, -(DIAS_HISTORIAL_DEFAULT - 1));
        }

        inicio = validarFecha(inicio);
        fin = validarFecha(fin);

        if (inicio > fin) {
            throw new BadRequestException(
                'La fecha inicial no puede ser posterior a la fecha final.',
            );
        }

        if (inclusiveLocalDays(inicio, fin) > DIAS_HISTORIAL_MAXIMO) {
            throw new BadRequestException(
                'El historial admite como máximo 90 días por consulta.',
            );
        }

        return { from: inicio, to: fin };
    }

    private versionMinimaApp(): string {
        const version = this.configService.get<string>('MOBILE_MIN_APP_VERSION');
        const normalizada = typeof version === 'string' ? version.trim() : '';
        return normalizada || '1.0.0';
    }
}

interface RegistroHoy {
    idRegistro: number;
    tipo: string;
    canal: string;
    fechaHoraRegistro: Date;
    resultadoGeocerca: string;
    tieneEvidencia: boolean;
}

function nombreCompleto(empleado: {
    nombre: string | null;
    primerApellido: string | null;
    segundoApellido: string | null;
}): string {
    return [empleado.nombre, empleado.primerApellido, empleado.segundoApellido]
        .filter((parte): parte is string => typeof parte === 'string' && parte.trim().length > 0)
        .join(' ');
}

function formatHora(time: Date | null | undefined): string | null {
    if (!time) return null;
    const hh = String(time.getUTCHours()).padStart(2, '0');
    const mm = String(time.getUTCMinutes()).padStart(2, '0');
    const ss = String(time.getUTCSeconds()).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
}

function isoONull(value: Date | null | undefined): string | null {
    return value ? value.toISOString() : null;
}

function ordenDia(dia: string | null | undefined): number {
    const index = ORDEN_SEMANA.indexOf(dia ?? '');
    return index === -1 ? ORDEN_SEMANA.length : index;
}

function porcentajeDe(minutos: number, limite: number): number {
    if (limite <= 0) return 0;
    return Math.round((minutos / limite) * 10000) / 100;
}

function mensajeDispositivoNoAprobado(estatus: string | null): string {
    if (estatus === 'PENDIENTE') {
        return 'Tu dispositivo está pendiente de autorización. Espera a que Recursos Humanos lo apruebe e intenta de nuevo.';
    }
    if (estatus === 'BLOQUEADO') {
        return 'Este dispositivo está bloqueado. Contacta a Recursos Humanos para desbloquearlo.';
    }
    if (estatus === 'BAJA') {
        return 'Este dispositivo ya no está activo. Registra uno nuevo o contacta a Recursos Humanos.';
    }
    return 'Este dispositivo no está autorizado para registrar asistencia. Regístralo y espera la aprobación de Recursos Humanos.';
}

interface SyncItemResultado {
    uuidCliente: string;
    aceptado: boolean;
    idRegistro?: string;
    tipo?: string;
    duplicado?: boolean;
    advertencias?: string[];
    error?: { code: string; message: string };
    reintentable: boolean;
}

function normalizarErrorMotor(error: HttpException): {
    code: string | null;
    message: string;
    detail: Record<string, unknown>;
    status: number;
} {
    const payload = error.getResponse();
    if (typeof payload !== 'object' || payload === null) {
        return {
            code: null,
            message: error.message,
            detail: {},
            status: error.getStatus(),
        };
    }

    const body = payload as Record<string, unknown>;
    const rawCode =
        typeof body.code === 'string'
            ? body.code
            : typeof body.codigoRechazo === 'string'
              ? body.codigoRechazo
              : null;
    const code = rawCode === 'FUERA_BLOQUEADA' ? 'GEOCERCA_BLOQUEADA' : rawCode;
    const message = typeof body.message === 'string' ? body.message : error.message;
    const detail =
        body.detail && typeof body.detail === 'object'
            ? { ...(body.detail as Record<string, unknown>) }
            : {};

    if (code === 'GEOCERCA_BLOQUEADA' && body.idRegistro != null && detail.idRegistro == null) {
        detail.idRegistro = body.idRegistro;
    }

    const status =
        code === 'TRANSICION_INVALIDA' ? HttpStatus.CONFLICT : error.getStatus();

    return { code, message, detail, status };
}

function relanzarErrorMotor(error: unknown): never {
    if (!(error instanceof HttpException)) {
        throw error;
    }

    const normalizado = normalizarErrorMotor(error);
    if (!normalizado.code) {
        throw error;
    }

    throw new HttpException(
        { code: normalizado.code, message: normalizado.message, detail: normalizado.detail },
        normalizado.status,
    );
}

function mapearErrorSync(uuidCliente: string, error: unknown): SyncItemResultado {
    if (!(error instanceof HttpException)) {
        return {
            uuidCliente,
            aceptado: false,
            error: {
                code: 'ERROR_INTERNO',
                message: 'No se pudo sincronizar este registro. Se reintentará automáticamente.',
            },
            reintentable: true,
        };
    }

    const normalizado = normalizarErrorMotor(error);
    const code = normalizado.code ?? `HTTP_${normalizado.status}`;

    return {
        uuidCliente,
        aceptado: false,
        error: { code, message: normalizado.message },
        // 4xx = rechazo de negocio (no reintentar). 5xx = transitorio.
        reintentable: normalizado.status >= 500,
    };
}

function validarFecha(value: string): string {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        throw new BadRequestException('La fecha debe tener el formato YYYY-MM-DD.');
    }

    const [year, month, day] = value.split('-').map(Number);
    const utc = new Date(Date.UTC(year, month - 1, day));
    if (
        utc.getUTCFullYear() !== year ||
        utc.getUTCMonth() !== month - 1 ||
        utc.getUTCDate() !== day
    ) {
        throw new BadRequestException('La fecha no es válida.');
    }

    return value;
}
