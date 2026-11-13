import { createHash, randomUUID } from 'crypto';
import { addDays } from 'date-fns';
import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { validateSync, ValidationError } from 'class-validator';
import { Prisma } from 'generated/prisma/client';
import { MediaPathService } from 'src/common/services/media-path.service';
import { AttendanceEngineService } from 'src/modules/attendance/engine/attendance-engine.service';
import { ResultadoCheck } from 'src/modules/attendance/engine/interfaces/canonical-check.interface';
import { TipoChecada } from 'src/modules/attendance/engine/state-machine';
import { AttendanceTrackingConfigService } from 'src/modules/config/attendance-config/attendance-config.service';
import { MIME_SELFIE, TAMANIO_MAX_SELFIE } from 'src/modules/mobile/mobile-attendance/selfie.constants';
import { PrismaService } from 'src/prisma/prisma.service';
import { SesionKiosco } from '../kiosk-auth/kiosco-actual';
import { errorKiosco, MENSAJE_KIOSCO_NO_ACTIVO } from '../kiosk-http';
import { PoliticasKiosco, politicasKioscoDe } from '../kiosk-policies.util';
import {
    ChecadaKioscoDto,
    HeartbeatKioskDto,
    ResultadoChecadaKiosco,
    ResultadoSyncKiosco,
    SyncKioskDto,
} from './dto/kiosk-device.dto';
import { BotonKiosco, botonSugeridoKiosco, mensajeRechazoKiosco, tipoRealKiosco } from './tipo-kiosco';

const CACHE_PADRON_MS = 60_000;
const TX_KIOSCO = { maxWait: 5000, timeout: 15000 } as const;
const MENSAJE_NO_ASIGNADO = 'No estás asignado a esta ubicación.';
const MENSAJE_NO_ENCONTRADO = 'No encontramos un empleado con ese número.';
const MENSAJE_INACTIVO = 'El empleado no está activo.';
const MENSAJE_SIN_ROSTRO = 'No se ve tu cara en la foto. Inténtalo de nuevo.';
const MENSAJE_EVIDENCIA = 'Necesitas tomar una foto para registrar la asistencia.';
const MENSAJE_OFFLINE = 'Este equipo no acepta checadas sin conexión.';
const MENSAJE_INCIDENCIA = 'Registro guardado. RH lo revisará.';
const MENSAJE_NO_REGISTRADA = 'No se registró esta checada.';
const MENSAJES_CHECADA = {
    ENTRADA: 'Entrada registrada',
    SALIDA: 'Salida registrada',
} as const;
const MENSAJE_REGRESO_COMIDA = 'Regreso de comida registrado';

type CodigoResolucion = 'EMPLEADO_NO_ENCONTRADO' | 'EMPLEADO_INACTIVO' | 'EMPLEADO_NO_ASIGNADO';

interface EmpleadoResuelto {
    idEmpleado: number;
    numeroEmpleado: string;
    nombre: string | null;
    primerApellido: string | null;
}

type ResolucionEmpleado =
    | { ok: true; empleado: EmpleadoResuelto }
    | {
        ok: false;
        code: CodigoResolucion;
        status: HttpStatus;
        message: string;
        idEmpleadoCandidato: number | null;
    };

interface EvidenciaKiosco {
    idEvidencia: number;
    rostroDetectado: boolean;
}

export interface EmpleadoPadron {
    idEmpleado: number;
    numeroEmpleado: string;
    nombreCorto: string;
    iniciales: string;
}

interface CachePadron {
    expira: number;
    version: string;
    empleados: EmpleadoPadron[];
}

const EMPLEADO_SELECT = {
    idEmpleado: true,
    numeroEmpleado: true,
    nombre: true,
    primerApellido: true,
} as const;

@Injectable()
export class KioskDeviceService {
    private readonly logger = new Logger(KioskDeviceService.name);
    private readonly cachePadron = new Map<number, CachePadron>();

    constructor(
        private readonly prisma: PrismaService,
        private readonly attendanceConfig: AttendanceTrackingConfigService,
        private readonly engine: AttendanceEngineService,
        private readonly configService: ConfigService,
        private readonly mediaPathService: MediaPathService,
    ) {}

    async bootstrap(kiosco: SesionKiosco) {
        const fila = await this.prisma.kioscosAsistencia.findUnique({
            where: { idKiosco: kiosco.idKiosco },
            select: {
                idKiosco: true,
                idTenant: true,
                idEmpresa: true,
                codigo: true,
                nombre: true,
                modalidad: true,
                politicas: true,
                KioscoSites: {
                    orderBy: { idSite: 'asc' },
                    select: {
                        idSite: true,
                        CatSites: { select: { Descripcion: true, zonaHoraria: true } },
                    },
                },
            },
        });

        if (!fila) {
            throw errorKiosco(HttpStatus.FORBIDDEN, 'KIOSCO_NO_ACTIVO', MENSAJE_KIOSCO_NO_ACTIVO);
        }

        const [empresa, config, padron] = await Promise.all([
            this.prisma.catEmpresas.findUnique({
                where: { idEmpresa: fila.idEmpresa },
                select: { nombre_comercial: true, razon_social: true },
            }),
            this.attendanceConfig.getConfiguracionAsistencia(fila.idTenant, fila.idEmpresa),
            this.padron(kiosco),
        ]);

        return {
            kiosco: {
                idKiosco: fila.idKiosco,
                codigo: fila.codigo,
                nombre: fila.nombre,
                modalidad: fila.modalidad,
            },
            empresa: {
                idEmpresa: fila.idEmpresa,
                nombre: empresa?.nombre_comercial?.trim() || empresa?.razon_social?.trim() || '',
            },
            sites: fila.KioscoSites.map((site) => ({
                idSite: site.idSite,
                nombre: site.CatSites?.Descripcion ?? '',
                zonaHoraria: site.CatSites?.zonaHoraria ?? 'America/Mexico_City',
            })),
            politicas: politicasKioscoDe(fila.politicas),
            parametros: config.kiosco,
            versionMinimaApp: this.versionMinimaApp(),
            padronVersion: padron.version,
            servidor: { fechaHora: new Date().toISOString() },
        };
    }

    async roster(kiosco: SesionKiosco, version?: string) {
        const padron = await this.padron(kiosco);
        if (version && version === padron.version) {
            return { version: padron.version, sinCambios: true as const };
        }
        return {
            version: padron.version,
            sinCambios: false as const,
            empleados: padron.empleados,
        };
    }

    /**
     * La aprobación de una incidencia puede meter al empleado en el padrón.
     * Sin esto, el equipo seguiría viendo la versión en caché hasta un minuto.
     */
    invalidarPadron(idKiosco: number): void {
        this.cachePadron.delete(idKiosco);
    }

    async lookup(kiosco: SesionKiosco, numero: string) {
        const resolucion = await this.resolverEmpleado(kiosco, numero);
        if (!resolucion.ok) {
            throw errorKiosco(resolucion.status, resolucion.code, resolucion.message);
        }

        const empleado = resolucion.empleado;
        const ahora = new Date();
        const ctx = await this.engine.resolveContext(empleado.idEmpleado, ahora, 'KIOSCO');
        const accion = await this.engine.resolveNextType(
            empleado.idEmpleado,
            ctx.fechaJornada,
            ctx.config,
            'SECUENCIA_COMPLETA',
        );

        return {
            idEmpleado: empleado.idEmpleado,
            numeroEmpleado: empleado.numeroEmpleado,
            nombreCorto: nombreCorto(empleado.nombre, empleado.primerApellido),
            iniciales: inicialesDe(empleado.nombre, empleado.primerApellido),
            tipoSugerido: botonSugeridoKiosco(accion.ultimoTipo),
            turnoHoy: {
                fecha: ctx.fechaLocal,
                diaSemana: ctx.diaSemana,
                zonaHoraria: ctx.zonaHoraria,
                entrada: horaDe(ctx.horario?.HoraEntrada),
                salida: horaDe(ctx.horario?.HoraSalida),
            },
        };
    }

    async subirEvidencia(kiosco: SesionKiosco, file: Express.Multer.File | undefined, rostroDetectado: boolean) {
        if (!file?.buffer) {
            throw errorKiosco(
                HttpStatus.BAD_REQUEST,
                'ARCHIVO_REQUERIDO',
                'Adjunta la foto en el campo file e intenta de nuevo.',
            );
        }
        if (!MIME_SELFIE.includes(file.mimetype)) {
            throw errorKiosco(
                HttpStatus.BAD_REQUEST,
                'ARCHIVO_INVALIDO',
                'La foto debe ser una imagen JPG o PNG.',
            );
        }
        if (file.size > TAMANIO_MAX_SELFIE) {
            throw errorKiosco(
                HttpStatus.PAYLOAD_TOO_LARGE,
                'ARCHIVO_DEMASIADO_GRANDE',
                'La foto no puede pesar más de 3 MB. Toma otra más ligera e intenta de nuevo.',
            );
        }
        if (file.buffer.length === 0) {
            throw errorKiosco(
                HttpStatus.BAD_REQUEST,
                'ARCHIVO_INVALIDO',
                'La foto llegó vacía. Tómala de nuevo.',
            );
        }

        const ahora = new Date();
        const anio = String(ahora.getUTCFullYear());
        const mes = String(ahora.getUTCMonth() + 1).padStart(2, '0');
        const guardado = await this.mediaPathService.saveFile(file, {
            idTenant: kiosco.idTenant,
            subfolder: `attendance/kiosk/${kiosco.idEmpresa}/${anio}/${mes}`,
            fileName: `${randomUUID()}${extensionSelfie(file.mimetype)}`,
        });
        const hashSha256 = createHash('sha256').update(file.buffer).digest('hex');

        try {
            const evidencia = await this.prisma.asistenciaEvidencias.create({
                data: {
                    idTenant: kiosco.idTenant,
                    idEmpresa: kiosco.idEmpresa,
                    idEmpleado: null,
                    idKiosco: kiosco.idKiosco,
                    rostroDetectado,
                    tipo: 'SELFIE',
                    rutaArchivo: guardado.rutaRelativa,
                    mimeType: file.mimetype,
                    tamanioBytes: file.size,
                    hashSha256,
                    fechaCaptura: ahora,
                    consumida: false,
                    fechaPurga: addDays(ahora, 365),
                },
                select: { idEvidencia: true },
            });

            return { idEvidencia: evidencia.idEvidencia };
        } catch (error) {
            await this.borrarEvidenciaRecienEscrita(guardado.rutaRelativa);
            throw error;
        }
    }

    /**
     * `saveFile()` regresa `/media/<slug>/...` y `deleteFile()` rechaza esa forma
     * porque la considera absoluta. Se le pasa la ruta bajo la raíz de medios.
     */
    private rutaParaBorrar(rutaRelativa: string): string {
        const normalizada = rutaRelativa.replace(/\\/g, '/');
        if (normalizada.startsWith('/media/')) {
            return normalizada.slice('/media/'.length);
        }
        return normalizada.replace(/^\/+/, '');
    }

    private async borrarEvidenciaRecienEscrita(rutaRelativa: string): Promise<void> {
        try {
            await this.mediaPathService.deleteFile(this.rutaParaBorrar(rutaRelativa));
        } catch {
            // La limpieza no debe ocultar el error original de la base de datos.
        }
    }

    check(kiosco: SesionKiosco, dto: ChecadaKioscoDto) {
        return this.registrar(kiosco, dto, false);
    }

    async sync(kiosco: SesionKiosco, dto: SyncKioskDto) {
        const anotados = dto.items.map((raw, index) => this.prepararItem(raw, index));
        const validos = anotados
            .filter((item) => item.dto != null)
            .sort((a, b) => a.fecha - b.fecha || a.index - b.index);

        const resultados: ResultadoSyncKiosco[] = new Array(anotados.length);
        for (const item of anotados) {
            if (item.dto) continue;
            resultados[item.index] = {
                uuidCliente: item.uuidCliente,
                ok: false,
                codigo: 'DATOS_INVALIDOS',
                mensaje: item.mensaje,
                reintentable: false,
            };
        }

        for (const item of validos) {
            const dto = item.dto as ChecadaKioscoDto;
            try {
                const resultado = await this.registrar(kiosco, dto, true);
                resultados[item.index] = {
                    uuidCliente: dto.uuidCliente,
                    ok: true,
                    resultado,
                    reintentable: false,
                };
            } catch (error) {
                resultados[item.index] = this.errorDeSync(dto.uuidCliente, error);
            }
        }

        return { resultados };
    }

    async heartbeat(kiosco: SesionKiosco, dto: HeartbeatKioskDto) {
        await this.prisma.kioscosAsistencia.update({
            where: { idKiosco: kiosco.idKiosco },
            data: {
                ultimoLatido: new Date(),
                pendientesReportados: dto.pendientes,
                versionApp: dto.versionApp.trim().slice(0, 20),
            },
        });

        const padron = await this.padron(kiosco);
        return {
            padronVersion: padron.version,
            versionMinimaApp: this.versionMinimaApp(),
            servidor: { fechaHora: new Date().toISOString() },
        };
    }

    private async registrar(
        kiosco: SesionKiosco,
        dto: ChecadaKioscoDto,
        enSync: boolean,
    ): Promise<ResultadoChecadaKiosco> {
        const ya = await this.resultadoSiYaExiste(dto.uuidCliente);
        if (ya) return ya;

        const politicas = await this.cargarPoliticas(kiosco);
        const evidencia = await this.validarEvidencia(kiosco, politicas, dto.idEvidencia ?? null, enSync);

        if (!enSync && dto.esOffline && !politicas.permitirOffline) {
            throw errorKiosco(HttpStatus.BAD_REQUEST, 'OFFLINE_NO_PERMITIDO', MENSAJE_OFFLINE);
        }

        const resolucion = await this.resolverEmpleado(kiosco, dto.numeroEmpleado);
        if (!resolucion.ok) {
            if (!politicas.aceptarNoIdentificados) {
                throw errorKiosco(resolucion.status, resolucion.code, resolucion.message);
            }
            return this.guardarIncidencia(kiosco, dto, resolucion, evidencia);
        }

        return this.ejecutarCheck(kiosco, dto, resolucion.empleado, politicas, evidencia);
    }

    private prepararItem(raw: unknown, index: number) {
        const uuidCliente = uuidDe(raw);
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
            return {
                index,
                uuidCliente,
                fecha: Number.POSITIVE_INFINITY,
                dto: null as ChecadaKioscoDto | null,
                mensaje: 'La checada no tiene el formato esperado.',
            };
        }

        const dto = plainToInstance(ChecadaKioscoDto, raw);
        const errores = validateSync(dto, { whitelist: true });
        if (errores.length > 0) {
            return {
                index,
                uuidCliente,
                fecha: Number.POSITIVE_INFINITY,
                dto: null as ChecadaKioscoDto | null,
                mensaje: mensajeValidacion(errores),
            };
        }

        return {
            index,
            uuidCliente: dto.uuidCliente,
            fecha: new Date(dto.fechaHoraRegistro).getTime(),
            dto,
            mensaje: '',
        };
    }

    private errorDeSync(uuidCliente: string, error: unknown): ResultadoSyncKiosco {
        if (!(error instanceof HttpException)) {
            this.logger.error(
                `Sync del kiosco falló para ${uuidCliente}: ${error instanceof Error ? error.message : String(error)}`,
            );
            return {
                uuidCliente,
                ok: false,
                codigo: 'ERROR_INTERNO',
                mensaje: 'No se pudo sincronizar este registro. Se reintentará automáticamente.',
                reintentable: true,
            };
        }

        const body = cuerpoDe(error);
        return {
            uuidCliente,
            ok: false,
            codigo: body.code ?? `HTTP_${error.getStatus()}`,
            mensaje: body.message,
            reintentable: error.getStatus() >= 500,
        };
    }

    /**
     * Un uuid ya guardado devuelve el resultado original como DUPLICADO.
     * Uno que quedó RECHAZADO no se presenta como checada registrada.
     */
    private async resultadoSiYaExiste(uuidCliente: string): Promise<ResultadoChecadaKiosco | null> {
        const registro = await this.prisma.registrosAsistencia.findUnique({
            where: { uuidCliente },
            select: {
                idRegistro: true,
                tipo: true,
                estatusProcesamiento: true,
                requiereRevision: true,
                numeroEmpleadoCapturado: true,
                Empleados: {
                    select: { numeroEmpleado: true, nombre: true, primerApellido: true },
                },
            },
        });

        if (registro) {
            if (registro.estatusProcesamiento === 'RECHAZADO') {
                throw errorKiosco(HttpStatus.CONFLICT, 'TRANSICION_INVALIDA', MENSAJE_NO_REGISTRADA);
            }
            const tipo = tipoVisible(registro.tipo);
            const numero = registro.Empleados?.numeroEmpleado?.trim() || registro.numeroEmpleadoCapturado || '';
            return {
                resultado: 'DUPLICADO',
                empleado: {
                    nombreCorto: nombreCorto(registro.Empleados?.nombre ?? null, registro.Empleados?.primerApellido ?? null),
                    numeroEmpleado: numero,
                },
                idRegistro: registro.idRegistro.toString(),
                tipo,
                requiereRevision: registro.requiereRevision,
                advertencias: [],
                mensaje: MENSAJES_CHECADA[tipo],
            };
        }

        const incidencia = await this.prisma.registrosKioscoPorIdentificar.findUnique({
            where: { uuidCliente },
            select: { tipo: true },
        });
        if (!incidencia) return null;

        const tipo = tipoVisible(incidencia.tipo);
        return {
            resultado: 'DUPLICADO',
            empleado: null,
            idRegistro: null,
            tipo,
            requiereRevision: false,
            advertencias: [],
            mensaje: MENSAJE_INCIDENCIA,
        };
    }

    private async cargarPoliticas(kiosco: SesionKiosco): Promise<PoliticasKiosco> {
        const fila = await this.prisma.kioscosAsistencia.findUnique({
            where: { idKiosco: kiosco.idKiosco },
            select: { politicas: true },
        });
        if (!fila) {
            throw errorKiosco(HttpStatus.FORBIDDEN, 'KIOSCO_NO_ACTIVO', MENSAJE_KIOSCO_NO_ACTIVO);
        }
        return politicasKioscoDe(fila.politicas);
    }

    private async validarEvidencia(
        kiosco: SesionKiosco,
        politicas: PoliticasKiosco,
        idEvidencia: number | null,
        enSync: boolean,
    ): Promise<EvidenciaKiosco | null> {
        if (idEvidencia == null) {
            if (politicas.requiereFoto) {
                throw errorKiosco(HttpStatus.BAD_REQUEST, 'EVIDENCIA_REQUERIDA', MENSAJE_EVIDENCIA);
            }
            return null;
        }

        const evidencia = await this.prisma.asistenciaEvidencias.findUnique({
            where: { idEvidencia },
            select: {
                idEvidencia: true,
                idKiosco: true,
                idEmpresa: true,
                consumida: true,
                rostroDetectado: true,
            },
        });

        if (
            !evidencia ||
            evidencia.idKiosco !== kiosco.idKiosco ||
            evidencia.idEmpresa !== kiosco.idEmpresa ||
            evidencia.consumida
        ) {
            throw errorKiosco(HttpStatus.BAD_REQUEST, 'EVIDENCIA_REQUERIDA', MENSAJE_EVIDENCIA);
        }

        if (!enSync && politicas.deteccionRostro && evidencia.rostroDetectado === false) {
            throw errorKiosco(HttpStatus.BAD_REQUEST, 'SIN_ROSTRO', MENSAJE_SIN_ROSTRO);
        }

        return { idEvidencia: evidencia.idEvidencia, rostroDetectado: evidencia.rostroDetectado };
    }

    private async resolverEmpleado(kiosco: SesionKiosco, numero: string): Promise<ResolucionEmpleado> {
        const buscado = numero.trim();
        const empleado = buscado
            ? await this.prisma.empleados.findFirst({
                where: { idTenant: kiosco.idTenant, numeroEmpleado: buscado },
                select: {
                    idEmpleado: true,
                    numeroEmpleado: true,
                    nombre: true,
                    primerApellido: true,
                    activo: true,
                    idSite: true,
                },
            })
            : null;

        if (!empleado) {
            return {
                ok: false,
                code: 'EMPLEADO_NO_ENCONTRADO',
                status: HttpStatus.NOT_FOUND,
                message: MENSAJE_NO_ENCONTRADO,
                idEmpleadoCandidato: null,
            };
        }

        if (!empleado.activo) {
            return {
                ok: false,
                code: 'EMPLEADO_INACTIVO',
                status: HttpStatus.CONFLICT,
                message: MENSAJE_INACTIVO,
                idEmpleadoCandidato: empleado.idEmpleado,
            };
        }

        const siteIds = await this.idsSites(kiosco.idKiosco);
        if (!(await this.estaEnPadron(empleado, siteIds))) {
            return {
                ok: false,
                code: 'EMPLEADO_NO_ASIGNADO',
                status: HttpStatus.CONFLICT,
                message: MENSAJE_NO_ASIGNADO,
                idEmpleadoCandidato: empleado.idEmpleado,
            };
        }

        return {
            ok: true,
            empleado: {
                idEmpleado: empleado.idEmpleado,
                numeroEmpleado: empleado.numeroEmpleado ?? buscado,
                nombre: empleado.nombre,
                primerApellido: empleado.primerApellido,
            },
        };
    }

    private async guardarIncidencia(
        kiosco: SesionKiosco,
        dto: ChecadaKioscoDto,
        fallo: Extract<ResolucionEmpleado, { ok: false }>,
        evidencia: EvidenciaKiosco | null,
    ): Promise<ResultadoChecadaKiosco> {
        const idSite = await this.sitePrincipal(kiosco.idKiosco);
        const tipo = dto.tipo;
        const data = {
            idTenant: kiosco.idTenant,
            idEmpresa: kiosco.idEmpresa,
            idKiosco: kiosco.idKiosco,
            idSite,
            idEmpleadoCandidato: fallo.idEmpleadoCandidato,
            numeroCapturado: dto.numeroEmpleado.trim().slice(0, 20),
            tipo,
            tipoIncidencia: fallo.code,
            fechaHoraRegistro: new Date(dto.fechaHoraRegistro),
            idEvidencia: evidencia?.idEvidencia ?? null,
            uuidCliente: dto.uuidCliente,
            metodoIdentificacion: dto.metodoIdentificacion,
            esOffline: dto.esOffline,
            desfaseRelojSegundos: dto.desfaseRelojSegundos ?? null,
            estatus: 'PENDIENTE' as const,
        };

        try {
            await this.prisma.$transaction(async (tx) => {
                await tx.registrosKioscoPorIdentificar.create({ data });
                if (evidencia) {
                    const marcado = await tx.asistenciaEvidencias.updateMany({
                        where: {
                            idEvidencia: evidencia.idEvidencia,
                            idKiosco: kiosco.idKiosco,
                            consumida: false,
                        },
                        data: { consumida: true },
                    });
                    if (marcado.count !== 1) {
                        throw errorKiosco(HttpStatus.BAD_REQUEST, 'EVIDENCIA_REQUERIDA', MENSAJE_EVIDENCIA);
                    }
                }
            }, TX_KIOSCO);
        } catch (error) {
            if (esP2002(error)) {
                const ya = await this.resultadoSiYaExiste(dto.uuidCliente);
                if (ya) return ya;
            }
            throw error;
        }

        return {
            resultado: 'POR_IDENTIFICAR',
            empleado: null,
            idRegistro: null,
            tipo,
            requiereRevision: false,
            advertencias: [],
            mensaje: MENSAJE_INCIDENCIA,
        };
    }

    private async ejecutarCheck(
        kiosco: SesionKiosco,
        dto: ChecadaKioscoDto,
        empleado: EmpleadoResuelto,
        politicas: PoliticasKiosco,
        evidencia: EvidenciaKiosco | null,
    ): Promise<ResultadoChecadaKiosco> {
        const idSitioKiosco = await this.sitePrincipal(kiosco.idKiosco);
        const boton = dto.tipo;
        const fechaHoraRegistro = new Date(dto.fechaHoraRegistro);
        let ultimoTipo: TipoChecada | null = null;
        let resultado: ResultadoCheck;
        try {
            // La checada offline se traduce con la jornada de su propia fecha, no con la hora del servidor.
            const ctx = await this.engine.resolveContext(empleado.idEmpleado, fechaHoraRegistro, 'KIOSCO');
            const accion = await this.engine.resolveNextType(
                empleado.idEmpleado,
                ctx.fechaJornada,
                ctx.config,
                'SECUENCIA_COMPLETA',
            );
            ultimoTipo = accion.ultimoTipo;
            resultado = await this.engine.registerCheck({
                idTenant: kiosco.idTenant,
                idEmpresa: kiosco.idEmpresa,
                idEmpleado: empleado.idEmpleado,
                canal: 'KIOSCO',
                tipo: tipoRealKiosco(boton, ultimoTipo),
                modoInferencia: 'EXPLICITO',
                fechaHoraRegistro,
                uuidCliente: dto.uuidCliente,
                idKiosco: kiosco.idKiosco,
                idSitioKiosco,
                idEmpleadoRegistra: empleado.idEmpleado,
                numeroEmpleadoCapturado: dto.numeroEmpleado.trim().slice(0, 20),
                metodoIdentificacion: 'NUMERO',
                rostroDetectado: evidencia?.rostroDetectado ?? null,
                deteccionRostroActiva: politicas.deteccionRostro,
                esOffline: dto.esOffline,
                desfaseRelojSegundos: dto.desfaseRelojSegundos ?? null,
                idEvidencia: evidencia?.idEvidencia ?? null,
            });
        } catch (error) {
            if (esP2002(error)) {
                const ya = await this.resultadoSiYaExiste(dto.uuidCliente);
                if (ya) return ya;
            }
            traducirErrorMotor(error, boton, ultimoTipo);
        }
        return this.mapearResultadoMotor(resultado, empleado, boton, ultimoTipo);
    }

    private mapearResultadoMotor(
        resultado: ResultadoCheck,
        empleado: EmpleadoResuelto,
        boton: BotonKiosco,
        ultimoTipo: TipoChecada | null,
    ): ResultadoChecadaKiosco {
        if (resultado.rechazado) {
            const codigo = resultado.codigoRechazo ?? 'TRANSICION_INVALIDA';
            throw errorKiosco(
                HttpStatus.CONFLICT,
                codigo,
                mensajeRechazoKiosco(boton, ultimoTipo, codigo, resultado.motivoRechazo) || MENSAJE_NO_REGISTRADA,
            );
        }

        const tipo = tipoVisible(resultado.tipo);
        return {
            resultado: resultado.duplicado ? 'DUPLICADO' : 'REGISTRADO',
            empleado: {
                nombreCorto: nombreCorto(empleado.nombre, empleado.primerApellido),
                numeroEmpleado: empleado.numeroEmpleado,
            },
            idRegistro: resultado.idRegistro,
            tipo,
            requiereRevision: resultado.requiereRevision,
            advertencias: resultado.advertencias,
            mensaje: resultado.tipo === 'FIN_COMIDA' ? MENSAJE_REGRESO_COMIDA : MENSAJES_CHECADA[tipo],
        };
    }

    private async sitePrincipal(idKiosco: number): Promise<number | null> {
        const fila = await this.prisma.kioscoSites.findFirst({
            where: { idKiosco },
            orderBy: { idSite: 'asc' },
            select: { idSite: true },
        });
        return fila?.idSite ?? null;
    }

    private async padron(kiosco: SesionKiosco): Promise<CachePadron> {
        const ahora = Date.now();
        const cache = this.cachePadron.get(kiosco.idKiosco);
        if (cache && cache.expira > ahora) {
            return cache;
        }

        const siteIds = await this.idsSites(kiosco.idKiosco);
        const { incluidos, excluidos } = await this.cargarEmpleados(kiosco.idTenant, siteIds);
        if (excluidos > 0) {
            const etiqueta = excluidos === 1 ? 'empleado excluido' : 'empleados excluidos';
            this.logger.warn(
                `Kiosco ${kiosco.idKiosco}: ${excluidos} ${etiqueta} del padrón por no tener numeroEmpleado.`,
            );
        }

        const fresco: CachePadron = {
            expira: ahora + CACHE_PADRON_MS,
            version: versionDePadron(incluidos),
            empleados: incluidos,
        };
        this.cachePadron.set(kiosco.idKiosco, fresco);
        return fresco;
    }

    private async idsSites(idKiosco: number): Promise<number[]> {
        const filas = await this.prisma.kioscoSites.findMany({
            where: { idKiosco },
            select: { idSite: true },
        });
        return filas.map((fila) => fila.idSite);
    }

    private async cargarEmpleados(idTenant: number, siteIds: number[]) {
        if (siteIds.length === 0) {
            return { incluidos: [] as EmpleadoPadron[], excluidos: 0 };
        }

        const porSite = await this.prisma.empleados.findMany({
            where: {
                idTenant,
                activo: true,
                idSite: { in: siteIds },
            },
            select: EMPLEADO_SELECT,
        });

        const relaciones = await this.prisma.relEmpleadosSites.findMany({
            where: { Activo: true, idSite: { in: siteIds } },
            select: { idEmpleado: true },
        });

        const idsYa = new Set(porSite.map((fila) => fila.idEmpleado));
        const idsFaltantes = [...new Set(relaciones.map((fila) => fila.idEmpleado))].filter(
            (id) => !idsYa.has(id),
        );

        const porRelacion = idsFaltantes.length
            ? await this.prisma.empleados.findMany({
                where: {
                    idTenant,
                    activo: true,
                    idEmpleado: { in: idsFaltantes },
                },
                select: EMPLEADO_SELECT,
            })
            : [];

        const incluidos: EmpleadoPadron[] = [];
        let excluidos = 0;
        for (const fila of [...porSite, ...porRelacion]) {
            const numero = fila.numeroEmpleado?.trim() ?? '';
            if (!numero) {
                excluidos += 1;
                continue;
            }
            incluidos.push({
                idEmpleado: fila.idEmpleado,
                numeroEmpleado: numero,
                nombreCorto: nombreCorto(fila.nombre, fila.primerApellido),
                iniciales: inicialesDe(fila.nombre, fila.primerApellido),
            });
        }

        incluidos.sort((a, b) => a.idEmpleado - b.idEmpleado);
        return { incluidos, excluidos };
    }

    private async estaEnPadron(
        empleado: { idEmpleado: number; idSite: number | null; numeroEmpleado: string | null },
        siteIds: number[],
    ): Promise<boolean> {
        if (!empleado.numeroEmpleado?.trim() || siteIds.length === 0) {
            return false;
        }
        if (empleado.idSite != null && siteIds.includes(empleado.idSite)) {
            return true;
        }

        const relacion = await this.prisma.relEmpleadosSites.findFirst({
            where: {
                idEmpleado: empleado.idEmpleado,
                idSite: { in: siteIds },
                Activo: true,
            },
            select: { idEmpleadoSite: true },
        });
        return relacion != null;
    }

    private versionMinimaApp(): string {
        const version = this.configService.get<string>('KIOSK_MIN_APP_VERSION');
        const normalizada = typeof version === 'string' ? version.trim() : '';
        return normalizada || '0.1.0';
    }
}

function extensionSelfie(mime: string): string {
    return mime === 'image/png' ? '.png' : '.jpg';
}

function nombreCorto(nombre: string | null, apellido: string | null): string {
    return [nombre?.trim(), apellido?.trim()].filter(Boolean).join(' ');
}

function inicialesDe(nombre: string | null, apellido: string | null): string {
    const n = nombre?.trim().charAt(0) ?? '';
    const a = apellido?.trim().charAt(0) ?? '';
    return `${n}${a}`.toLocaleUpperCase('es-MX');
}

function horaDe(time: Date | null | undefined): string | null {
    if (!time) return null;
    const hh = String(time.getUTCHours()).padStart(2, '0');
    const mm = String(time.getUTCMinutes()).padStart(2, '0');
    const ss = String(time.getUTCSeconds()).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
}

function versionDePadron(empleados: EmpleadoPadron[]): string {
    const canonico = empleados
        .map((empleado) =>
            [empleado.idEmpleado, empleado.numeroEmpleado, empleado.nombreCorto, empleado.iniciales].join('|'),
        )
        .join('\n');
    return createHash('sha256').update(canonico).digest('hex');
}

function tipoVisible(tipo: string): 'ENTRADA' | 'SALIDA' {
    return tipo === 'SALIDA' ? 'SALIDA' : 'ENTRADA';
}

function uuidDe(raw: unknown): string {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return '';
    const uuid = (raw as { uuidCliente?: unknown }).uuidCliente;
    return typeof uuid === 'string' ? uuid : '';
}

function mensajeValidacion(errores: ValidationError[]): string {
    const textos: string[] = [];
    const visitar = (lista: ValidationError[]) => {
        for (const error of lista) {
            if (error.constraints) textos.push(...Object.values(error.constraints));
            if (error.children?.length) visitar(error.children);
        }
    };
    visitar(errores);
    return textos[0] ?? 'La checada no tiene el formato esperado.';
}

function cuerpoDe(error: HttpException): { code: string | null; message: string } {
    const payload = error.getResponse();
    if (typeof payload === 'string') return { code: null, message: payload };
    if (typeof payload !== 'object' || payload === null) return { code: null, message: error.message };
    const body = payload as { code?: unknown; message?: unknown };
    const message = typeof body.message === 'string'
        ? body.message
        : Array.isArray(body.message)
            ? body.message.map(String).join(' ')
            : error.message;
    return { code: typeof body.code === 'string' ? body.code : null, message };
}

function traducirErrorMotor(error: unknown, boton: BotonKiosco, ultimoTipo: TipoChecada | null): never {
    if (!(error instanceof HttpException)) {
        throw error;
    }
    const body = cuerpoDe(error);
    const code = body.code ?? (error.getStatus() === HttpStatus.CONFLICT ? 'TRANSICION_INVALIDA' : `HTTP_${error.getStatus()}`);
    const status = code === 'TRANSICION_INVALIDA' ? HttpStatus.CONFLICT : error.getStatus();
    const payload = error.getResponse();
    const detail = typeof payload === 'object' && payload !== null && 'detail' in payload
        ? (payload as { detail?: unknown }).detail
        : undefined;
    throw errorKiosco(
        status,
        code,
        mensajeRechazoKiosco(boton, ultimoTipo, code, body.message) || body.message,
        detail,
    );
}

function esP2002(error: unknown): error is Prisma.PrismaClientKnownRequestError {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}
