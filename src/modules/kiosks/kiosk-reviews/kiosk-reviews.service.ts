import { HttpException, HttpStatus, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { Prisma } from 'generated/prisma/client';
import { RegistrosAsistencia_estatusProcesamiento } from 'generated/prisma/enums';
import { AttendanceEngineService } from 'src/modules/attendance/engine/attendance-engine.service';
import { ResultadoCheck } from 'src/modules/attendance/engine/interfaces/canonical-check.interface';
import { TipoChecada } from 'src/modules/attendance/engine/state-machine';
import { urlEvidencia } from 'src/modules/attendance/utils/evidencia-url.util';
import { localTimeToInstant } from 'src/modules/attendance/utils/timezone.util';
import { PrismaService } from 'src/prisma/prisma.service';
import { ActiveUserDto } from '../../auth/dto/active-user.dto';
import { KioskDeviceService } from '../kiosk-device/kiosk-device.service';
import { BotonKiosco, mensajeRechazoKiosco, tipoRealKiosco } from '../kiosk-device/tipo-kiosco';
import { errorKiosco } from '../kiosk-http';
import {
    ApproveIncidenciaDto,
    CorrectIncidenciaDto,
    RejectIncidenciaDto,
    RejectRegistroDto,
    ReassignRegistroDto,
    ValidateRegistroDto,
} from './dto/kiosk-review-actions.dto';
import {
    FuenteRevisionKiosco,
    QueryKioskReviewCountsDto,
    QueryKioskReviewsDto,
} from './dto/query-kiosk-reviews.dto';

const ZONA_NEGOCIO = 'America/Mexico_City';
const TX_KIOSCO = { maxWait: 5000, timeout: 15000 } as const;

const EMPLEADO_CORTO = {
    idEmpleado: true,
    numeroEmpleado: true,
    nombre: true,
    primerApellido: true,
} as const;

type EmpleadoCorto = {
    idEmpleado: number;
    numeroEmpleado: string | null;
    nombre: string | null;
    primerApellido: string | null;
};

type RangoFechas = { gte?: Date; lte?: Date };

type FiltroBandeja = {
    idKiosco?: number;
    idSite?: number;
    from?: string;
    to?: string;
};

export interface ItemRevisionKiosco {
    fuente: 'registros' | 'incidencias';
    id: string;
    empleado: { idEmpleado: number; numeroEmpleado: string | null; nombreCorto: string } | null;
    numeroCapturado: string | null;
    candidato: { idEmpleado: number; numeroEmpleado: string | null; nombreCorto: string } | null;
    tipo: string;
    fechaHoraRegistro: string;
    kiosco: { codigo: string; nombre: string };
    banderas: string[] | null;
    tipoIncidencia: string | null;
    rutaEvidencia: string | null;
    urlEvidencia: string | null;
}

@Injectable()
export class KioskReviewsService {
    private readonly logger = new Logger(KioskReviewsService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly engine: AttendanceEngineService,
        private readonly device: KioskDeviceService,
    ) {}

    async list(user: ActiveUserDto, companyId: number, query: QueryKioskReviewsDto) {
        const idTenant = this.tenantDe(user);
        this.assertEmpresa(companyId);

        const page = Math.max(1, query.page ?? 1);
        const limit = Math.min(100, Math.max(1, query.limit ?? 10));
        const rango = this.rango(query.from, query.to);

        if (query.fuente === FuenteRevisionKiosco.registros) {
            return this.listarRegistros(idTenant, companyId, query, rango, page, limit);
        }
        return this.listarIncidencias(idTenant, companyId, query, rango, page, limit);
    }

    async counts(user: ActiveUserDto, companyId: number, query: QueryKioskReviewCountsDto) {
        const idTenant = this.tenantDe(user);
        this.assertEmpresa(companyId);
        const rango = this.rango(query.from, query.to);
        const comun = this.filtroComun(idTenant, companyId, query, rango);

        const [registros, grupos] = await Promise.all([
            this.prisma.registrosAsistencia.count({
                where: {
                    ...comun.registros,
                    canal: 'KIOSCO',
                    requiereRevision: true,
                    estatusProcesamiento: { not: 'ANULADO' },
                },
            }),
            this.prisma.registrosKioscoPorIdentificar.groupBy({
                by: ['tipoIncidencia'],
                where: { ...comun.incidencias, estatus: 'PENDIENTE' },
                _count: { idPorIdentificar: true },
            }),
        ]);

        const incidencias = {
            EMPLEADO_NO_ENCONTRADO: 0,
            EMPLEADO_INACTIVO: 0,
            EMPLEADO_NO_ASIGNADO: 0,
        };
        for (const grupo of grupos) {
            if (grupo.tipoIncidencia in incidencias) {
                incidencias[grupo.tipoIncidencia] = grupo._count.idPorIdentificar;
            }
        }

        return { registros, incidencias };
    }

    async validate(
        user: ActiveUserDto,
        companyId: number,
        idRegistro: string,
        dto: ValidateRegistroDto = {},
    ) {
        const idTenant = this.tenantDe(user);
        this.assertEmpresa(companyId);
        const id = this.aId(idRegistro, 'REGISTRO_NO_ENCONTRADO', 'No encontramos ese registro.');
        const registro = await this.buscarRegistro(id, idTenant, companyId);
        const revisor = await this.revisorDe(user, idTenant);

        await this.prisma.$transaction(async (tx) => {
            const tomada = await tx.registrosAsistencia.updateMany({
                where: this.wherePendiente(id, idTenant, companyId),
                data: { requiereRevision: false },
            });
            if (tomada.count !== 1) {
                throw await this.falloRegistro(id, idTenant, companyId);
            }
            await tx.revisionesRegistroAsistencia.create({
                data: {
                    idTenant,
                    idEmpresa: companyId,
                    idRegistro: id,
                    idKiosco: registro.idKiosco,
                    accion: 'VALIDAR',
                    banderas: banderasDe(registro.banderasRevision),
                    motivo: motivoLimpio(dto.motivo),
                    idEmpleadoRevisor: revisor,
                    datosNuevos: conUsuario(null, revisor, user.uuid),
                },
            });
        }, TX_KIOSCO);

        return {
            ok: true,
            accion: 'VALIDAR' as const,
            idRegistro: id.toString(),
            requiereRevision: false,
        };
    }

    async reject(
        user: ActiveUserDto,
        companyId: number,
        idRegistro: string,
        dto: RejectRegistroDto,
    ) {
        const idTenant = this.tenantDe(user);
        this.assertEmpresa(companyId);
        const id = this.aId(idRegistro, 'REGISTRO_NO_ENCONTRADO', 'No encontramos ese registro.');
        const registro = await this.buscarRegistro(id, idTenant, companyId);
        const motivo = this.motivoObligatorio(dto.motivo, 'Escribe el motivo del rechazo.');
        const revisor = await this.revisorDe(user, idTenant);
        const banderas = banderasDe(registro.banderasRevision);

        const tomada = await this.prisma.registrosAsistencia.updateMany({
            where: this.wherePendiente(id, idTenant, companyId),
            data: { requiereRevision: false },
        });
        if (tomada.count !== 1) {
            throw await this.falloRegistro(id, idTenant, companyId);
        }

        try {
            await this.engine.anularRegistro(id, motivo, this.usuarioDe(user));
        } catch (error) {
            await this.restaurarRevision(id);
            this.traducirMotor(error);
        }

        await this.prisma.revisionesRegistroAsistencia.create({
            data: {
                idTenant,
                idEmpresa: companyId,
                idRegistro: id,
                idKiosco: registro.idKiosco,
                accion: 'RECHAZAR',
                banderas,
                motivo,
                idEmpleadoRevisor: revisor,
                datosNuevos: conUsuario(
                    { estatusProcesamiento: 'ANULADO' },
                    revisor,
                    user.uuid,
                ),
            },
        });

        return {
            ok: true,
            accion: 'RECHAZAR' as const,
            idRegistro: id.toString(),
            requiereRevision: false,
        };
    }

    async reassign(
        user: ActiveUserDto,
        companyId: number,
        idRegistro: string,
        dto: ReassignRegistroDto,
    ) {
        const idTenant = this.tenantDe(user);
        this.assertEmpresa(companyId);
        const id = this.aId(idRegistro, 'REGISTRO_NO_ENCONTRADO', 'No encontramos ese registro.');
        const registro = await this.buscarRegistro(id, idTenant, companyId);
        const motivo = this.motivoObligatorio(dto.motivo, 'Escribe el motivo de la reasignación.');

        if (registro.idEmpleado === dto.idEmpleado) {
            throw errorKiosco(
                HttpStatus.CONFLICT,
                'EMPLEADO_IGUAL',
                'El registro ya pertenece a ese empleado.',
            );
        }

        const destino = await this.empleadoDeEmpresa(dto.idEmpleado, idTenant, companyId);
        const revisor = await this.revisorDe(user, idTenant);
        const usuario = this.usuarioDe(user);
        const estatusPrevio = registro.estatusProcesamiento;
        const datosAnteriores = {
            idRegistro: id.toString(),
            idEmpleado: registro.idEmpleado,
            idJornada: registro.idJornada,
            tipo: registro.tipo,
            estatusProcesamiento: registro.estatusProcesamiento,
            fechaHoraRegistro: registro.fechaHoraRegistro.toISOString(),
        };

        const tomada = await this.prisma.registrosAsistencia.updateMany({
            where: this.wherePendiente(id, idTenant, companyId),
            data: { requiereRevision: false },
        });
        if (tomada.count !== 1) {
            throw await this.falloRegistro(id, idTenant, companyId);
        }

        try {
            await this.engine.anularRegistro(id, motivo, usuario);
        } catch (error) {
            await this.restaurarRevision(id);
            this.traducirMotor(error);
        }

        let nuevo: ResultadoCheck;
        try {
            nuevo = await this.engine.registrarDesdeOrigen(id, destino.idEmpleado, usuario);
        } catch (error) {
            await this.compensarAnulacion(id, estatusPrevio, registro.idJornada);
            this.traducirMotor(error);
        }

        await this.prisma.revisionesRegistroAsistencia.create({
            data: {
                idTenant,
                idEmpresa: companyId,
                idRegistro: id,
                idKiosco: registro.idKiosco,
                accion: 'REASIGNAR',
                banderas: banderasDe(registro.banderasRevision),
                datosAnteriores,
                datosNuevos: conUsuario(
                    {
                        idRegistro: nuevo.idRegistro,
                        idEmpleado: destino.idEmpleado,
                        idJornada: nuevo.idJornada,
                    },
                    revisor,
                    user.uuid,
                ),
                idEmpleadoNuevo: destino.idEmpleado,
                motivo,
                idEmpleadoRevisor: revisor,
            },
        });

        return {
            ok: true,
            accion: 'REASIGNAR' as const,
            idRegistro: id.toString(),
            idRegistroNuevo: nuevo.idRegistro,
            requiereRevision: false,
        };
    }

    async bulkValidate(user: ActiveUserDto, companyId: number, ids: string[]) {
        const resultados: Array<{
            idRegistro: string;
            ok: boolean;
            codigo?: string;
            mensaje?: string;
        }> = [];

        for (const idRegistro of ids) {
            try {
                await this.validate(user, companyId, idRegistro, {});
                resultados.push({ idRegistro, ok: true });
            } catch (error) {
                if (!(error instanceof HttpException)) throw error;
                const cuerpo = cuerpoDe(error);
                resultados.push({
                    idRegistro,
                    ok: false,
                    codigo: cuerpo.code ?? `HTTP_${error.getStatus()}`,
                    mensaje: cuerpo.message,
                });
            }
        }

        return { resultados };
    }

    async approve(
        user: ActiveUserDto,
        companyId: number,
        idIncidencia: string,
        dto: ApproveIncidenciaDto = {},
    ) {
        return this.resolverIncidencia(user, companyId, idIncidencia, {
            accion: 'VALIDAR',
            estatus: 'APROBADA',
            idEmpleado: null,
            motivo: null,
            agregarEmpleadoSite: dto.agregarEmpleadoSite === true,
        });
    }

    async correct(
        user: ActiveUserDto,
        companyId: number,
        idIncidencia: string,
        dto: CorrectIncidenciaDto,
    ) {
        return this.resolverIncidencia(user, companyId, idIncidencia, {
            accion: 'CORREGIR',
            estatus: 'CORREGIDA',
            idEmpleado: dto.idEmpleado,
            motivo: this.motivoObligatorio(dto.motivo, 'Escribe el motivo de la corrección.'),
            agregarEmpleadoSite: dto.agregarEmpleadoSite === true,
        });
    }

    async rejectIncidencia(
        user: ActiveUserDto,
        companyId: number,
        idIncidencia: string,
        dto: RejectIncidenciaDto,
    ) {
        const idTenant = this.tenantDe(user);
        this.assertEmpresa(companyId);
        const id = this.aId(idIncidencia, 'INCIDENCIA_NO_ENCONTRADA', 'No encontramos esa incidencia.');
        const incidencia = await this.buscarIncidencia(id, idTenant, companyId);
        const motivo = this.motivoObligatorio(dto.motivo, 'Escribe el motivo del rechazo.');
        const revisor = await this.revisorDe(user, idTenant);

        await this.prisma.$transaction(async (tx) => {
            const tomada = await tx.registrosKioscoPorIdentificar.updateMany({
                where: {
                    idPorIdentificar: id,
                    idTenant,
                    idEmpresa: companyId,
                    estatus: 'PENDIENTE',
                },
                data: {
                    estatus: 'RECHAZADA',
                    motivo,
                    idEmpleadoRevisor: revisor,
                    fechaResolucion: new Date(),
                },
            });
            if (tomada.count !== 1) {
                throw await this.falloIncidencia(id, idTenant, companyId);
            }
            await tx.revisionesRegistroAsistencia.create({
                data: this.datosRevisionIncidencia({
                    idTenant,
                    companyId,
                    id,
                    idKiosco: incidencia.idKiosco,
                    accion: 'RECHAZAR',
                    motivo,
                    revisor,
                    uuid: user.uuid,
                    datosAnteriores: this.anteriorIncidencia(incidencia),
                    datosNuevos: { estatus: 'RECHAZADA' },
                    idEmpleadoNuevo: null,
                    idRegistro: null,
                }),
            });
        }, TX_KIOSCO);

        return {
            ok: true,
            accion: 'RECHAZAR' as const,
            id: id.toString(),
            estatus: 'RECHAZADA' as const,
        };
    }

    private async resolverIncidencia(
        user: ActiveUserDto,
        companyId: number,
        idIncidencia: string,
        decision: {
            accion: 'VALIDAR' | 'CORREGIR';
            estatus: 'APROBADA' | 'CORREGIDA';
            idEmpleado: number | null;
            motivo: string | null;
            agregarEmpleadoSite: boolean;
        },
    ) {
        const idTenant = this.tenantDe(user);
        this.assertEmpresa(companyId);
        const id = this.aId(idIncidencia, 'INCIDENCIA_NO_ENCONTRADA', 'No encontramos esa incidencia.');
        const incidencia = await this.buscarIncidencia(id, idTenant, companyId);

        const idEmpleado = decision.idEmpleado ?? incidencia.idEmpleadoCandidato;
        if (idEmpleado == null) {
            throw errorKiosco(
                HttpStatus.CONFLICT,
                'SIN_CANDIDATO',
                'Esta incidencia no tiene un empleado candidato. Corrígelo indicando a la persona.',
            );
        }

        const empleado = await this.empleadoDeEmpresa(idEmpleado, idTenant, companyId);
        if (decision.agregarEmpleadoSite) {
            await this.exigirSite(incidencia.idSite, idTenant, companyId);
        }

        const evidencia = await this.liberarEvidencia(incidencia.idEvidencia, incidencia.idKiosco, companyId);
        const boton = botonDeIncidencia(incidencia.tipo);
        let ultimoTipo: TipoChecada | null = null;
        let resultado: ResultadoCheck;
        try {
            const ctx = await this.engine.resolveContext(
                empleado.idEmpleado,
                incidencia.fechaHoraRegistro,
                'KIOSCO',
            );
            const accion = await this.engine.resolveNextType(
                empleado.idEmpleado,
                ctx.fechaJornada,
                ctx.config,
                'SECUENCIA_COMPLETA',
            );
            ultimoTipo = accion.ultimoTipo;
            resultado = await this.engine.registerCheck({
                idTenant,
                idEmpresa: companyId,
                idEmpleado: empleado.idEmpleado,
                canal: 'KIOSCO',
                tipo: tipoRealKiosco(boton, ultimoTipo),
                modoInferencia: 'EXPLICITO',
                fechaHoraRegistro: incidencia.fechaHoraRegistro,
                uuidCliente: incidencia.uuidCliente,
                idKiosco: incidencia.idKiosco,
                idSitioKiosco: incidencia.idSite,
                idEmpleadoRegistra: empleado.idEmpleado,
                numeroEmpleadoCapturado: incidencia.numeroCapturado,
                metodoIdentificacion: incidencia.metodoIdentificacion ?? 'NUMERO',
                rostroDetectado: evidencia?.rostroDetectado ?? null,
                deteccionRostroActiva: false,
                esOffline: incidencia.esOffline,
                desfaseRelojSegundos: incidencia.desfaseRelojSegundos,
                idEvidencia: evidencia?.idEvidencia ?? null,
                idUsuarioRegistro: user.uuid,
                ubicacion: coordenadasDe(incidencia.latitud, incidencia.longitud),
            });
        } catch (error) {
            await this.restaurarEvidencia(evidencia);
            this.traducirMotor(error, boton, ultimoTipo);
        }

        if (resultado.rechazado) {
            await this.restaurarEvidencia(evidencia);
            const codigo = resultado.codigoRechazo ?? 'TRANSICION_INVALIDA';
            throw errorKiosco(
                HttpStatus.CONFLICT,
                codigo,
                mensajeRechazoKiosco(boton, ultimoTipo, codigo, resultado.motivoRechazo)
                    || 'No se pudo crear el registro.',
            );
        }

        const revisor = await this.revisorDe(user, idTenant);
        const idRegistro = BigInt(resultado.idRegistro);

        await this.prisma.$transaction(async (tx) => {
            const tomada = await tx.registrosKioscoPorIdentificar.updateMany({
                where: {
                    idPorIdentificar: id,
                    idTenant,
                    idEmpresa: companyId,
                    estatus: 'PENDIENTE',
                },
                data: {
                    estatus: decision.estatus,
                    idEmpleadoAsignado: empleado.idEmpleado,
                    idRegistroGenerado: idRegistro,
                    agregarEmpleadoSite: decision.agregarEmpleadoSite,
                    motivo: decision.motivo,
                    idEmpleadoRevisor: revisor,
                    fechaResolucion: new Date(),
                },
            });
            if (tomada.count !== 1) {
                throw await this.falloIncidencia(id, idTenant, companyId);
            }
            if (decision.agregarEmpleadoSite && incidencia.idSite != null) {
                await this.asegurarSite(tx, {
                    idTenant,
                    idEmpresa: companyId,
                    idEmpleado: empleado.idEmpleado,
                    idSite: incidencia.idSite,
                });
            }
            await tx.revisionesRegistroAsistencia.create({
                data: this.datosRevisionIncidencia({
                    idTenant,
                    companyId,
                    id,
                    idKiosco: incidencia.idKiosco,
                    accion: decision.accion,
                    motivo: decision.motivo,
                    revisor,
                    uuid: user.uuid,
                    datosAnteriores: this.anteriorIncidencia(incidencia),
                    datosNuevos: {
                        estatus: decision.estatus,
                        idEmpleadoAsignado: empleado.idEmpleado,
                        idRegistroGenerado: resultado.idRegistro,
                        agregarEmpleadoSite: decision.agregarEmpleadoSite,
                    },
                    idEmpleadoNuevo: empleado.idEmpleado,
                    idRegistro,
                }),
            });
        }, TX_KIOSCO);

        if (decision.agregarEmpleadoSite) {
            this.device.invalidarPadron(incidencia.idKiosco);
        }

        return {
            ok: true,
            accion: decision.accion,
            id: id.toString(),
            estatus: decision.estatus,
            idRegistro: resultado.idRegistro,
            idEmpleado: empleado.idEmpleado,
        };
    }

    private async listarRegistros(
        idTenant: number,
        companyId: number,
        query: QueryKioskReviewsDto,
        rango: RangoFechas | undefined,
        page: number,
        limit: number,
    ) {
        const where: Prisma.RegistrosAsistenciaWhereInput = {
            ...this.filtroComun(idTenant, companyId, query, rango).registros,
            canal: 'KIOSCO',
            requiereRevision: true,
            estatusProcesamiento: { not: 'ANULADO' },
            ...(query.bandera ? { banderasRevision: { array_contains: query.bandera } } : {}),
        };

        const [total, filas] = await this.prisma.$transaction([
            this.prisma.registrosAsistencia.count({ where }),
            this.prisma.registrosAsistencia.findMany({
                where,
                orderBy: [{ fechaHoraRegistro: 'desc' }, { idRegistro: 'desc' }],
                skip: (page - 1) * limit,
                take: limit,
                include: {
                    Empleados: { select: EMPLEADO_CORTO },
                    KioscosAsistencia: { select: { codigo: true, nombre: true } },
                },
            }),
        ]);

        const zonas = await this.zonasDe(filas.map((fila) => fila.idSitioDetectado));
        const rutas = await this.rutasDe(filas.map((fila) => fila.idEvidencia));

        const items: ItemRevisionKiosco[] = filas.map((fila) => {
            const rutaEvidencia = fila.idEvidencia != null ? rutas.get(fila.idEvidencia) ?? null : null;
            return {
                fuente: 'registros',
                id: fila.idRegistro.toString(),
                empleado: empleadoDe(fila.Empleados),
                numeroCapturado: fila.numeroEmpleadoCapturado,
                candidato: null,
                tipo: fila.tipo,
                fechaHoraRegistro: fechaHoraEnZona(
                    fila.fechaHoraRegistro,
                    zonas.get(fila.idSitioDetectado ?? 0) ?? ZONA_NEGOCIO,
                ),
                kiosco: {
                    codigo: fila.KioscosAsistencia?.codigo ?? '',
                    nombre: fila.KioscosAsistencia?.nombre ?? '',
                },
                banderas: banderasDe(fila.banderasRevision),
                tipoIncidencia: null,
                rutaEvidencia,
                urlEvidencia: urlEvidencia(rutaEvidencia),
            };
        });

        return { items, pagination: paginar(page, limit, total) };
    }

    private async listarIncidencias(
        idTenant: number,
        companyId: number,
        query: QueryKioskReviewsDto,
        rango: RangoFechas | undefined,
        page: number,
        limit: number,
    ) {
        const where: Prisma.RegistrosKioscoPorIdentificarWhereInput = {
            ...this.filtroComun(idTenant, companyId, query, rango).incidencias,
            estatus: 'PENDIENTE',
            ...(query.tipoIncidencia ? { tipoIncidencia: query.tipoIncidencia } : {}),
        };

        const [total, filas] = await this.prisma.$transaction([
            this.prisma.registrosKioscoPorIdentificar.count({ where }),
            this.prisma.registrosKioscoPorIdentificar.findMany({
                where,
                orderBy: [{ fechaHoraRegistro: 'desc' }, { idPorIdentificar: 'desc' }],
                skip: (page - 1) * limit,
                take: limit,
                include: {
                    Empleados_RegistrosKioscoPorIdentificar_idEmpleadoCandidatoToEmpleados: {
                        select: EMPLEADO_CORTO,
                    },
                    KioscosAsistencia: { select: { codigo: true, nombre: true } },
                    AsistenciaEvidencias: { select: { rutaArchivo: true } },
                    CatSites: { select: { zonaHoraria: true } },
                },
            }),
        ]);

        const items: ItemRevisionKiosco[] = filas.map((fila) => {
            const candidato = empleadoDe(
                fila.Empleados_RegistrosKioscoPorIdentificar_idEmpleadoCandidatoToEmpleados,
            );
            const rutaEvidencia = fila.AsistenciaEvidencias?.rutaArchivo ?? null;
            return {
                fuente: 'incidencias',
                id: fila.idPorIdentificar.toString(),
                empleado: null,
                numeroCapturado: fila.numeroCapturado,
                candidato,
                tipo: fila.tipo,
                fechaHoraRegistro: fechaHoraEnZona(
                    fila.fechaHoraRegistro,
                    fila.CatSites?.zonaHoraria ?? ZONA_NEGOCIO,
                ),
                kiosco: {
                    codigo: fila.KioscosAsistencia?.codigo ?? '',
                    nombre: fila.KioscosAsistencia?.nombre ?? '',
                },
                banderas: null,
                tipoIncidencia: fila.tipoIncidencia,
                rutaEvidencia,
                urlEvidencia: urlEvidencia(rutaEvidencia),
            };
        });

        return { items, pagination: paginar(page, limit, total) };
    }

    private filtroComun(
        idTenant: number,
        companyId: number,
        query: FiltroBandeja,
        rango: RangoFechas | undefined,
    ) {
        const fechas = rango ? { fechaHoraRegistro: rango } : {};
        return {
            registros: {
                idTenant,
                idEmpresa: companyId,
                ...fechas,
                ...(query.idKiosco ? { idKiosco: query.idKiosco } : {}),
                ...(query.idSite ? { idSitioDetectado: query.idSite } : {}),
            } satisfies Prisma.RegistrosAsistenciaWhereInput,
            incidencias: {
                idTenant,
                idEmpresa: companyId,
                ...fechas,
                ...(query.idKiosco ? { idKiosco: query.idKiosco } : {}),
                ...(query.idSite ? { idSite: query.idSite } : {}),
            } satisfies Prisma.RegistrosKioscoPorIdentificarWhereInput,
        };
    }

    private wherePendiente(id: bigint, idTenant: number, companyId: number): Prisma.RegistrosAsistenciaWhereInput {
        return {
            idRegistro: id,
            idTenant,
            idEmpresa: companyId,
            canal: 'KIOSCO',
            requiereRevision: true,
            estatusProcesamiento: { not: 'ANULADO' },
        };
    }

    private async buscarRegistro(id: bigint, idTenant: number, companyId: number) {
        const registro = await this.prisma.registrosAsistencia.findFirst({
            where: { idRegistro: id, idTenant, idEmpresa: companyId, canal: 'KIOSCO' },
        });
        if (!registro) {
            throw errorKiosco(HttpStatus.NOT_FOUND, 'REGISTRO_NO_ENCONTRADO', 'No encontramos ese registro.');
        }
        if (registro.idKiosco == null) {
            throw errorKiosco(
                HttpStatus.CONFLICT,
                'KIOSCO_SIN_EQUIPO',
                'Este registro no está ligado a un kiosco.',
            );
        }
        return { ...registro, idKiosco: registro.idKiosco };
    }

    private async buscarIncidencia(id: bigint, idTenant: number, companyId: number) {
        const incidencia = await this.prisma.registrosKioscoPorIdentificar.findFirst({
            where: { idPorIdentificar: id, idTenant, idEmpresa: companyId },
        });
        if (!incidencia) {
            throw errorKiosco(HttpStatus.NOT_FOUND, 'INCIDENCIA_NO_ENCONTRADA', 'No encontramos esa incidencia.');
        }
        if (incidencia.estatus !== 'PENDIENTE') {
            throw errorKiosco(
                HttpStatus.CONFLICT,
                'YA_RESUELTO',
                'Esta incidencia ya fue resuelta.',
                { estatus: incidencia.estatus },
            );
        }
        return incidencia;
    }

    private async falloRegistro(id: bigint, idTenant: number, companyId: number): Promise<never> {
        const registro = await this.prisma.registrosAsistencia.findFirst({
            where: { idRegistro: id, idTenant, idEmpresa: companyId, canal: 'KIOSCO' },
            select: { estatusProcesamiento: true },
        });
        if (!registro) {
            throw errorKiosco(HttpStatus.NOT_FOUND, 'REGISTRO_NO_ENCONTRADO', 'No encontramos ese registro.');
        }
        throw errorKiosco(
            HttpStatus.CONFLICT,
            'YA_RESUELTO',
            'Este registro ya fue revisado.',
            { estatusProcesamiento: registro.estatusProcesamiento },
        );
    }

    private async falloIncidencia(id: bigint, idTenant: number, companyId: number): Promise<never> {
        const incidencia = await this.prisma.registrosKioscoPorIdentificar.findFirst({
            where: { idPorIdentificar: id, idTenant, idEmpresa: companyId },
            select: { estatus: true },
        });
        if (!incidencia) {
            throw errorKiosco(HttpStatus.NOT_FOUND, 'INCIDENCIA_NO_ENCONTRADA', 'No encontramos esa incidencia.');
        }
        throw errorKiosco(
            HttpStatus.CONFLICT,
            'YA_RESUELTO',
            'Esta incidencia ya fue resuelta.',
            { estatus: incidencia.estatus },
        );
    }

    private async empleadoDeEmpresa(idEmpleado: number, idTenant: number, companyId: number) {
        const empleado = await this.prisma.empleados.findFirst({
            where: { idEmpleado, idTenant, idEmpresa: companyId },
            select: EMPLEADO_CORTO,
        });
        if (!empleado) {
            throw errorKiosco(
                HttpStatus.NOT_FOUND,
                'EMPLEADO_NO_ENCONTRADO',
                'No encontramos a ese empleado en la empresa.',
            );
        }
        return empleado;
    }

    private async exigirSite(idSite: number | null, idTenant: number, companyId: number) {
        if (idSite == null) {
            throw errorKiosco(
                HttpStatus.CONFLICT,
                'SITE_REQUERIDO',
                'Esta incidencia no tiene ubicación para asignar al empleado.',
            );
        }
        const site = await this.prisma.catSites.findFirst({
            where: { idSite, idTenant, idEmpresa: companyId },
            select: { idSite: true },
        });
        if (!site) {
            throw errorKiosco(
                HttpStatus.NOT_FOUND,
                'SITE_NO_ENCONTRADO',
                'No encontramos la ubicación de esta incidencia.',
            );
        }
        return site.idSite;
    }

    private async asegurarSite(
        tx: Prisma.TransactionClient,
        data: { idTenant: number; idEmpresa: number; idEmpleado: number; idSite: number },
    ) {
        const existente = await tx.relEmpleadosSites.findFirst({
            where: { idEmpleado: data.idEmpleado, idSite: data.idSite },
            select: { idEmpleadoSite: true, Activo: true },
        });
        if (!existente) {
            await tx.relEmpleadosSites.create({
                data: {
                    idTenant: data.idTenant,
                    idEmpresa: data.idEmpresa,
                    idEmpleado: data.idEmpleado,
                    idSite: data.idSite,
                    Activo: true,
                    EsPrincipal: false,
                },
            });
            return;
        }
        if (!existente.Activo) {
            await tx.relEmpleadosSites.update({
                where: { idEmpleadoSite: existente.idEmpleadoSite },
                data: { Activo: true },
            });
        }
    }

    private async liberarEvidencia(idEvidencia: number | null, idKiosco: number, companyId: number) {
        if (idEvidencia == null) return null;
        const evidencia = await this.prisma.asistenciaEvidencias.findUnique({
            where: { idEvidencia },
        });
        if (!evidencia || evidencia.idEmpresa !== companyId || evidencia.idKiosco !== idKiosco) {
            throw errorKiosco(
                HttpStatus.BAD_REQUEST,
                'EVIDENCIA_REQUERIDA',
                'La foto de esta incidencia ya no está disponible.',
            );
        }
        if (evidencia.consumida) {
            await this.prisma.asistenciaEvidencias.update({
                where: { idEvidencia },
                data: { consumida: false },
            });
            return { ...evidencia, consumida: false, liberada: true };
        }
        return { ...evidencia, liberada: false };
    }

    private async restaurarEvidencia(
        evidencia: { idEvidencia: number; liberada: boolean } | null,
    ) {
        if (!evidencia?.liberada) return;
        await this.prisma.asistenciaEvidencias.update({
            where: { idEvidencia: evidencia.idEvidencia },
            data: { consumida: true },
        });
    }

    private async restaurarRevision(id: bigint) {
        await this.prisma.registrosAsistencia.update({
            where: { idRegistro: id },
            data: { requiereRevision: true },
        });
    }

    private async compensarAnulacion(
        id: bigint,
        estatusPrevio: RegistrosAsistencia_estatusProcesamiento,
        idJornada: number | null,
    ) {
        this.logger.warn(`Se revierte la anulación del registro ${id.toString()} porque no se pudo reasignar.`);
        await this.prisma.registrosAsistencia.update({
            where: { idRegistro: id },
            data: {
                estatusProcesamiento: estatusPrevio,
                requiereRevision: true,
            },
        });
        if (idJornada != null) {
            await this.engine.recalcJornada(idJornada);
        }
    }

    /**
     * idEmpleadoRevisor apunta a Empleados. Si el usuario de la sesión no tiene
     * un empleado ligado por idUsuario, queda null y el uuid se guarda en
     * datosNuevos.usuario. Reportado para decidir si la columna debe cambiar.
     */
    private async revisorDe(user: ActiveUserDto, idTenant: number): Promise<number | null> {
        if (!user.uuid) return null;
        const empleado = await this.prisma.empleados.findFirst({
            where: { idUsuario: user.uuid, idTenant },
            select: { idEmpleado: true },
        });
        return empleado?.idEmpleado ?? null;
    }

    private usuarioDe(user: ActiveUserDto): string {
        const uuid = user.uuid?.trim();
        return uuid || String(user.id);
    }

    private anteriorIncidencia(incidencia: {
        estatus: string;
        tipoIncidencia: string;
        numeroCapturado: string;
        idEmpleadoCandidato: number | null;
    }) {
        return {
            estatus: incidencia.estatus,
            tipoIncidencia: incidencia.tipoIncidencia,
            numeroCapturado: incidencia.numeroCapturado,
            idEmpleadoCandidato: incidencia.idEmpleadoCandidato,
        };
    }

    private datosRevisionIncidencia(input: {
        idTenant: number;
        companyId: number;
        id: bigint;
        idKiosco: number;
        accion: 'VALIDAR' | 'RECHAZAR' | 'CORREGIR';
        motivo: string | null;
        revisor: number | null;
        uuid: string;
        datosAnteriores: Record<string, Prisma.InputJsonValue | null>;
        datosNuevos: Record<string, Prisma.InputJsonValue>;
        idEmpleadoNuevo: number | null;
        idRegistro: bigint | null;
    }): Prisma.RevisionesRegistroAsistenciaUncheckedCreateInput {
        return {
            idTenant: input.idTenant,
            idEmpresa: input.companyId,
            idPorIdentificar: input.id,
            idKiosco: input.idKiosco,
            accion: input.accion,
            motivo: input.motivo,
            idEmpleadoRevisor: input.revisor,
            idEmpleadoNuevo: input.idEmpleadoNuevo,
            idRegistro: input.idRegistro,
            datosAnteriores: input.datosAnteriores as Prisma.InputJsonObject,
            datosNuevos: conUsuario(input.datosNuevos, input.revisor, input.uuid),
        };
    }

    private async zonasDe(ids: Array<number | null>) {
        const unicos = [...new Set(ids.filter((id): id is number => id != null))];
        const mapa = new Map<number, string>();
        if (unicos.length === 0) return mapa;
        const sites = await this.prisma.catSites.findMany({
            where: { idSite: { in: unicos } },
            select: { idSite: true, zonaHoraria: true },
        });
        for (const site of sites) mapa.set(site.idSite, site.zonaHoraria);
        return mapa;
    }

    private async rutasDe(ids: Array<number | null>) {
        const unicos = [...new Set(ids.filter((id): id is number => id != null))];
        const mapa = new Map<number, string | null>();
        if (unicos.length === 0) return mapa;
        const evidencias = await this.prisma.asistenciaEvidencias.findMany({
            where: { idEvidencia: { in: unicos } },
            select: { idEvidencia: true, rutaArchivo: true },
        });
        for (const evidencia of evidencias) mapa.set(evidencia.idEvidencia, evidencia.rutaArchivo);
        return mapa;
    }

    private rango(from?: string, to?: string): RangoFechas | undefined {
        if (!from?.trim() && !to?.trim()) return undefined;
        const gte = from?.trim() ? limiteDe(from, false) : undefined;
        const lte = to?.trim() ? limiteDe(to, true) : undefined;
        if (gte && lte && gte.getTime() > lte.getTime()) {
            throw errorKiosco(
                HttpStatus.BAD_REQUEST,
                'RANGO_INVALIDO',
                'La fecha inicial no puede ser posterior a la final.',
            );
        }
        return { ...(gte ? { gte } : {}), ...(lte ? { lte } : {}) };
    }

    private motivoObligatorio(motivo: string | null | undefined, message: string): string {
        const texto = motivoLimpio(motivo);
        if (!texto) {
            throw errorKiosco(HttpStatus.BAD_REQUEST, 'MOTIVO_REQUERIDO', message);
        }
        return texto;
    }

    private aId(valor: string, code: string, message: string): bigint {
        if (!/^\d+$/.test(valor ?? '')) {
            throw errorKiosco(HttpStatus.BAD_REQUEST, code, message);
        }
        return BigInt(valor);
    }

    private tenantDe(user: ActiveUserDto): number {
        if (!user.idTenant) {
            throw new UnauthorizedException('El usuario no tiene un tenant asignado.');
        }
        return user.idTenant;
    }

    private assertEmpresa(companyId: number): void {
        if (!companyId || companyId <= 0) {
            throw errorKiosco(
                HttpStatus.BAD_REQUEST,
                'EMPRESA_INVALIDA',
                'La empresa proporcionada no es válida.',
            );
        }
    }

    private traducirMotor(
        error: unknown,
        boton?: BotonKiosco,
        ultimoTipo?: TipoChecada | null,
    ): never {
        if (!(error instanceof HttpException)) throw error;
        const cuerpo = cuerpoDe(error);
        const status = error.getStatus() === HttpStatus.UNPROCESSABLE_ENTITY
            ? HttpStatus.CONFLICT
            : error.getStatus();
        const code = cuerpo.code
            ?? (status === HttpStatus.CONFLICT ? 'TRANSICION_INVALIDA' : `HTTP_${error.getStatus()}`);
        const message = boton
            ? mensajeRechazoKiosco(boton, ultimoTipo ?? null, code, cuerpo.message) || cuerpo.message
            : cuerpo.message;
        throw errorKiosco(status, code, message, cuerpo.detail);
    }
}

function botonDeIncidencia(tipo: string): BotonKiosco {
    return tipo === 'SALIDA' ? 'SALIDA' : 'ENTRADA';
}

function paginar(page: number, limit: number, total: number) {
    return {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page * limit < total,
        hasPreviousPage: page > 1,
    };
}

function motivoLimpio(motivo?: string | null): string | null {
    const texto = motivo?.trim() ?? '';
    return texto ? texto.slice(0, 500) : null;
}

function banderasDe(valor: Prisma.JsonValue | null | undefined): string[] {
    if (!Array.isArray(valor)) return [];
    return valor.filter((item): item is string => typeof item === 'string');
}

function empleadoDe(empleado: EmpleadoCorto | null | undefined) {
    if (!empleado) return null;
    return {
        idEmpleado: empleado.idEmpleado,
        numeroEmpleado: empleado.numeroEmpleado,
        nombreCorto: [empleado.nombre?.trim(), empleado.primerApellido?.trim()].filter(Boolean).join(' '),
    };
}

function conUsuario(
    base: Record<string, Prisma.InputJsonValue> | null,
    revisor: number | null,
    uuid: string,
): Prisma.InputJsonValue | typeof Prisma.JsonNull {
    const datos: Record<string, Prisma.InputJsonValue> = { ...(base ?? {}) };
    if (revisor == null && uuid) datos.usuario = uuid;
    return Object.keys(datos).length > 0 ? (datos as Prisma.InputJsonObject) : Prisma.JsonNull;
}

function coordenadasDe(latitud: Prisma.Decimal | null, longitud: Prisma.Decimal | null) {
    if (latitud == null || longitud == null) return null;
    const lat = Number(latitud);
    const lng = Number(longitud);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { latitud: lat, longitud: lng };
}

function limiteDe(valor: string, fin: boolean): Date {
    const fechaSolo = /^(\d{4}-\d{2}-\d{2})$/.exec(valor.trim());
    if (fechaSolo) {
        const hora = fin
            ? new Date(Date.UTC(2000, 0, 1, 23, 59, 59))
            : new Date(Date.UTC(2000, 0, 1, 0, 0, 0));
        return localTimeToInstant(fechaSolo[1], hora, ZONA_NEGOCIO);
    }
    const instante = new Date(valor);
    if (Number.isNaN(instante.getTime())) {
        throw errorKiosco(HttpStatus.BAD_REQUEST, 'RANGO_INVALIDO', 'La fecha del filtro no es válida.');
    }
    return instante;
}

function fechaHoraEnZona(instant: Date, timeZone: string): string {
    const tz = timeZone?.trim() || ZONA_NEGOCIO;
    let zona = tz;
    try {
        new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format();
    } catch {
        zona = ZONA_NEGOCIO;
    }
    const partes = new Intl.DateTimeFormat('en-CA', {
        timeZone: zona,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
        timeZoneName: 'longOffset',
    }).formatToParts(instant);
    const valor = (tipo: Intl.DateTimeFormatPartTypes) =>
        partes.find((parte) => parte.type === tipo)?.value ?? '';
    let hour = valor('hour');
    if (hour === '24') hour = '00';
    return `${valor('year')}-${valor('month')}-${valor('day')}T${hour}:${valor('minute')}:${valor('second')}${offsetDe(valor('timeZoneName'))}`;
}

function offsetDe(nombre: string): string {
    const limpio = nombre.replace('GMT', '').replace('UTC', '').replace(/\u2212/g, '-').trim();
    if (!limpio) return 'Z';
    const match = limpio.match(/^([+-])(\d{1,2})(?::?(\d{2}))?$/);
    if (!match) return 'Z';
    return `${match[1]}${match[2].padStart(2, '0')}:${match[3] ?? '00'}`;
}

function cuerpoDe(error: HttpException): { code: string | null; message: string; detail?: unknown } {
    const payload = error.getResponse();
    if (typeof payload === 'string') return { code: null, message: payload };
    if (typeof payload !== 'object' || payload === null) return { code: null, message: error.message };
    const body = payload as { code?: unknown; message?: unknown; detail?: unknown };
    const message = typeof body.message === 'string'
        ? body.message
        : Array.isArray(body.message)
            ? body.message.map(String).join(' ')
            : error.message;
    return {
        code: typeof body.code === 'string' ? body.code : null,
        message,
        detail: body.detail,
    };
}

