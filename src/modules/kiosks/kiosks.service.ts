import {
    BadRequestException,
    ConflictException,
    Injectable,
    InternalServerErrorException,
    Logger,
    NotFoundException,
    UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'crypto';
import { Prisma } from 'generated/prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { localDateString, localTimeToInstant } from '../attendance/utils/timezone.util';
import { ActiveUserDto } from '../auth/dto/active-user.dto';
import { AttendanceTrackingConfigService } from '../config/attendance-config/attendance-config.service';
import { DEFAULT_ATTENDANCE_CONFIG } from '../config/attendance-config/interfaces/attendance-config.interface';
import { CreateKioskDto } from './dto/create-kiosk.dto';
import { QueryKiosksDto } from './dto/query-kiosks.dto';
import { UpdateKioskDto } from './dto/update-kiosk.dto';

const ZONA_NEGOCIO = 'America/Mexico_City';

const RESPONSABLE_SELECT = {
    idEmpleado: true,
    numeroEmpleado: true,
    nombre: true,
    primerApellido: true,
    segundoApellido: true,
    activo: true,
    CatPuestos: {
        select: {
            idPuesto: true,
            DescripcionPuesto: true,
        },
    },
} as const;

const SITES_SELECT = {
    idSite: true,
    CatSites: {
        select: {
            idSite: true,
            Descripcion: true,
            EsPrincipal: true,
            Activo: true,
            Calle: true,
            Colonia: true,
            MunicipioDelegacion: true,
            Estado: true,
            CodigoPostal: true,
        },
    },
} as const;

const KIOSK_LIST_SELECT = {
    idKiosco: true,
    idTenant: true,
    idEmpresa: true,
    nombre: true,
    codigo: true,
    modalidad: true,
    estatus: true,
    idEmpleadoResponsable: true,
    identificadorDispositivo: true,
    ultimoLatido: true,
    versionApp: true,
    pendientesReportados: true,
    Empleados: { select: RESPONSABLE_SELECT },
    KioscoSites: { select: SITES_SELECT },
} as const;

const KIOSK_DETAIL_SELECT = {
    ...KIOSK_LIST_SELECT,
    politicas: true,
    fechaActivacion: true,
    plataforma: true,
    modelo: true,
} as const;

const KIOSK_OPERACION_SELECT = {
    idKiosco: true,
    codigo: true,
    nombre: true,
    estatus: true,
    modalidad: true,
    idEmpleadoResponsable: true,
    politicas: true,
    tokenJti: true,
    identificadorDispositivo: true,
    KioscoSites: { select: { idSite: true } },
} as const;

type KioskListRow = Prisma.KioscosAsistenciaGetPayload<{ select: typeof KIOSK_LIST_SELECT }>;
type KioskDetailRow = Prisma.KioscosAsistenciaGetPayload<{ select: typeof KIOSK_DETAIL_SELECT }>;
type KioskOperacion = Prisma.KioscosAsistenciaGetPayload<{ select: typeof KIOSK_OPERACION_SELECT }>;

type PoliticasKiosco = {
    requiereFoto: boolean;
    deteccionRostro: boolean;
    permitirOffline: boolean;
    aceptarNoIdentificados: boolean;
};

type ConexionKiosco = 'EN_LINEA' | 'SIN_CONEXION' | 'NUNCA';

@Injectable()
export class KiosksService {

    private readonly logger = new Logger(KiosksService.name);
    // Tiempo de vigencia del código de activación.
    private readonly ACTIVATION_CODE_EXPIRATION_HOURS = 24;

    constructor(
        private readonly prisma: PrismaService,
        private readonly attendanceConfig: AttendanceTrackingConfigService,
        private readonly configService: ConfigService,
    ) { }

    // Obtiene todos los kioscos filtrados y paginados
    async findAll(
        user: ActiveUserDto,
        companyId: number,
        query: QueryKiosksDto,
    ) {
        const idTenant = this.tenantDe(user);
        this.assertEmpresa(companyId);

        const page = Math.max(1, query.page ?? 1);
        const limit = Math.min(100, Math.max(1, query.limit ?? 10));
        const where = this.whereListado(idTenant, companyId, query);
        const minutos = await this.minutosSinLatido(idTenant, companyId);

        if (query.soloAlertas) {
            const kiosks = await this.prisma.kioscosAsistencia.findMany({
                where,
                select: KIOSK_LIST_SELECT,
                orderBy: [{ idKiosco: 'desc' }],
            });
            const versionMinima = this.versionMinimaApp();
            const alertas = kiosks.filter((kiosk) => this.esAlerta(kiosk, minutos, versionMinima));
            const total = alertas.length;
            const pagina = alertas.slice((page - 1) * limit, page * limit);

            return {
                kiosks: pagina.map((kiosk) => this.mapListItem(kiosk, minutos)),
                pagination: this.paginar(page, limit, total),
            };
        }

        const [total, kiosks] = await this.prisma.$transaction([
            this.prisma.kioscosAsistencia.count({ where }),
            this.prisma.kioscosAsistencia.findMany({
                where,
                select: KIOSK_LIST_SELECT,
                orderBy: [{ idKiosco: 'desc' }],
                skip: (page - 1) * limit,
                take: limit,
            }),
        ]);

        return {
            kiosks: kiosks.map((kiosk) => this.mapListItem(kiosk, minutos)),
            pagination: this.paginar(page, limit, total),
        };
    }

    async getSummary(user: ActiveUserDto, companyId: number) {
        const idTenant = this.tenantDe(user);
        this.assertEmpresa(companyId);

        const minutos = await this.minutosSinLatido(idTenant, companyId);
        const umbral = new Date(Date.now() - minutos * 60_000);
        const { inicio, fin } = this.rangoHoy();
        const empresa = { idTenant, idEmpresa: companyId };

        const [
            total,
            activos,
            enLinea,
            sinConexion,
            pendientesActivacion,
            checadasHoy,
            revisiones,
            incidencias,
        ] = await Promise.all([
            this.prisma.kioscosAsistencia.count({ where: empresa }),
            this.prisma.kioscosAsistencia.count({ where: { ...empresa, estatus: 'ACTIVO' } }),
            this.prisma.kioscosAsistencia.count({
                where: {
                    ...empresa,
                    estatus: { not: 'BAJA' },
                    ultimoLatido: { gte: umbral },
                },
            }),
            this.prisma.kioscosAsistencia.count({
                where: {
                    ...empresa,
                    estatus: { not: 'BAJA' },
                    ultimoLatido: { lt: umbral },
                },
            }),
            this.prisma.kioscosAsistencia.count({
                where: { ...empresa, estatus: 'PENDIENTE_ACTIVACION' },
            }),
            this.prisma.registrosAsistencia.count({
                where: {
                    ...empresa,
                    canal: 'KIOSCO',
                    fechaHoraRegistro: { gte: inicio, lte: fin },
                },
            }),
            this.prisma.registrosAsistencia.count({
                where: { ...empresa, canal: 'KIOSCO', requiereRevision: true },
            }),
            this.prisma.registrosKioscoPorIdentificar.count({
                where: { ...empresa, estatus: 'PENDIENTE' },
            }),
        ]);

        return {
            total,
            activos,
            enLinea,
            sinConexion,
            pendientesActivacion,
            checadasHoy,
            porRevisar: revisiones + incidencias,
        };
    }

    async findOne(user: ActiveUserDto, companyId: number, idKiosco: number) {
        const idTenant = this.tenantDe(user);
        this.assertEmpresa(companyId);

        const [kiosk, minutos] = await Promise.all([
            this.prisma.kioscosAsistencia.findFirst({
                where: this.whereEmpresa(idTenant, companyId, idKiosco),
                select: KIOSK_DETAIL_SELECT,
            }),
            this.minutosSinLatido(idTenant, companyId),
        ]);

        if (!kiosk) {
            throw new NotFoundException('Kiosco no encontrado.');
        }

        return this.mapDetail(kiosk, minutos);
    }

    // Crear un nuevo kiosco.
    async createKiosk(
        user: ActiveUserDto,
        companyId: number,
        dto: CreateKioskDto,
    ) {
        const idTenant = this.tenantDe(user);
        this.assertEmpresa(companyId);

        // Validaciones generales del DTO.
        this.validateKioskConfiguration(dto);

        try {
            return await this.prisma.$transaction(
                async (tx) => {

                    // 1. Validar empleado responsable.
                    const responsable = await tx.empleados.findFirst({
                        where: {
                            idEmpleado: dto.idEmpleadoResponsable,
                            idEmpresa: companyId,
                            idTenant,
                            activo: true,
                        },
                        select: {
                            idEmpleado: true,
                            numeroEmpleado: true,
                            nombre: true,
                            primerApellido: true,
                            segundoApellido: true,
                        },
                    });

                    if (!responsable) {
                        throw new NotFoundException(
                            'El empleado responsable no existe, no pertenece a la empresa actual o se encuentra inactivo.',
                        );
                    }

                    // 2. Validar ubicaciones cuando el kiosco es FIJO.
                    let sites: { idSite: number }[] = [];

                    if (dto.modalidad === 'FIJO') {
                        sites = await tx.catSites.findMany({
                            where: {
                                idSite: { in: dto.idSites },
                                idTenant,
                                idEmpresa: companyId,
                                Activo: true,
                            },
                            select: { idSite: true },
                        });

                        // Verificar que todas las ubicaciones existan.
                        if (sites.length !== dto.idSites.length) {
                            throw new BadRequestException(
                                'Una o más ubicaciones no existen, están inactivas o no pertenecen a la empresa actual.',
                            );
                        }
                    }

                    // 3. Generar identificador público del kiosco.
                    const kioskCode = this.generateKioskCode();
                    // 4. Generar código seguro de activación.
                    const activationCode = this.generateActivationCode();
                    // 5. Generar hash SHA-256.
                    const activationCodeHash = this.hashActivationCode(activationCode);
                    // 6. Calcular expiración del código.
                    const expiresAt = this.expiracionCodigo();

                    // 7. Crear registro principal del kiosco.
                    const kiosk = await tx.kioscosAsistencia.create({
                        data: {
                            idTenant,
                            idEmpresa: companyId,
                            // Identificación
                            nombre: dto.nombre.trim(),
                            codigo: kioskCode,
                            // Configuración
                            modalidad: dto.modalidad,
                            idEmpleadoResponsable: dto.idEmpleadoResponsable,
                            politicas: this.politicasJson(dto.politicas),
                            // Estado inicial
                            estatus: 'PENDIENTE_ACTIVACION',
                            identificadorDispositivo: null,
                            tokenJti: null,
                            ultimoLatido: null,
                        },
                        select: {
                            idKiosco: true,
                            nombre: true,
                            codigo: true,
                            modalidad: true,
                            idEmpleadoResponsable: true,
                            estatus: true,
                            politicas: true,
                        },
                    });

                    // 8. Asociar las ubicaciones al kiosco.
                    if (dto.modalidad === 'FIJO' && sites.length > 0) {
                        await tx.kioscoSites.createMany({
                            data: sites.map((site) => ({
                                idKiosco: kiosk.idKiosco,
                                idSite: site.idSite,
                            })),
                        });
                    }

                    // 9. Registrar el código de activación.
                    await tx.kioscoCodigosActivacion.create({
                        data: {
                            idKiosco: kiosk.idKiosco,
                            codigoHash: activationCodeHash,
                            expiraEn: expiresAt,
                            usadoEn: null,
                            intentosFallidos: 0,
                        },
                    });

                    // 10. Respuesta. El código original únicamente se devuelve una vez.
                    return {
                        message: 'Kiosco creado correctamente.',
                        kiosk: {
                            idKiosco: kiosk.idKiosco,
                            nombre: kiosk.nombre,
                            codigo: kiosk.codigo,
                            modalidad: kiosk.modalidad,
                            estatus: kiosk.estatus,
                            politicas: kiosk.politicas,
                            responsable: {
                                idEmpleado: responsable.idEmpleado,
                                numeroEmpleado: responsable.numeroEmpleado,
                                nombre: [
                                    responsable.nombre,
                                    responsable.primerApellido,
                                    responsable.segundoApellido,
                                ].filter(Boolean).join(' '),
                            },
                            idSites: sites.map((site) => site.idSite),
                            activacion: {
                                codigo: activationCode,
                                expiraEn: expiresAt,
                                vigenciaHoras: this.ACTIVATION_CODE_EXPIRATION_HOURS,
                            },
                        },
                    };
                },
                {
                    maxWait: 5000,
                    timeout: 15000,
                },
            );

        } catch (error) {
            if (
                error instanceof BadRequestException ||
                error instanceof NotFoundException ||
                error instanceof UnauthorizedException ||
                error instanceof ConflictException
            ) throw error;

            // Restricciones UNIQUE de MySQL.
            if (
                error instanceof Prisma.PrismaClientKnownRequestError &&
                error.code === 'P2002'
            ) {
                throw new ConflictException(
                    'Se produjo un conflicto con un registro único al crear el kiosco. Intenta nuevamente.',
                );
            }

            this.logger.error('Error al crear kiosco:', error instanceof Error ? error.stack : String(error));
            throw new InternalServerErrorException('Ocurrió un error al crear el kiosco.');
        }
    }

    async updateKiosk(
        user: ActiveUserDto,
        companyId: number,
        idKiosco: number,
        dto: UpdateKioskDto,
    ) {
        const idTenant = this.tenantDe(user);
        this.assertEmpresa(companyId);

        const actualizado = await this.enTransaccion(async (tx) => {
            const kiosk = await this.obtenerKiosco(tx, idTenant, companyId, idKiosco);

            if (kiosk.estatus === 'BAJA') {
                throw new ConflictException('Un kiosco dado de baja no se puede modificar.');
            }

            if (dto.modalidad && dto.modalidad !== kiosk.modalidad) {
                throw new BadRequestException('No se puede cambiar la modalidad del kiosco.');
            }

            const idSitesEfectivos = dto.idSites ?? kiosk.KioscoSites.map((site) => site.idSite);
            const politicas = dto.politicas ?? this.politicasDe(kiosk.politicas);

            this.validateKioskConfiguration({
                nombre: (dto.nombre ?? kiosk.nombre).trim(),
                modalidad: kiosk.modalidad,
                idEmpleadoResponsable: dto.idEmpleadoResponsable ?? kiosk.idEmpleadoResponsable,
                idSites: idSitesEfectivos,
                politicas,
            });

            const cambiaSites = dto.idSites !== undefined && kiosk.modalidad === 'FIJO';
            const hayCambios = dto.nombre !== undefined
                || dto.idEmpleadoResponsable !== undefined
                || cambiaSites
                || dto.politicas !== undefined;

            if (!hayCambios) {
                throw new BadRequestException('No hay datos para actualizar.');
            }

            if (dto.idEmpleadoResponsable !== undefined) {
                const responsable = await tx.empleados.findFirst({
                    where: {
                        idEmpleado: dto.idEmpleadoResponsable,
                        idEmpresa: companyId,
                        idTenant,
                        activo: true,
                    },
                    select: { idEmpleado: true },
                });

                if (!responsable) {
                    throw new NotFoundException(
                        'El empleado responsable no existe, no pertenece a la empresa actual o se encuentra inactivo.',
                    );
                }
            }

            if (cambiaSites && dto.idSites) {
                const sites = await tx.catSites.findMany({
                    where: {
                        idSite: { in: dto.idSites },
                        idTenant,
                        idEmpresa: companyId,
                        Activo: true,
                    },
                    select: { idSite: true },
                });

                if (sites.length !== dto.idSites.length) {
                    throw new BadRequestException(
                        'Una o más ubicaciones no existen, están inactivas o no pertenecen a la empresa actual.',
                    );
                }

                await tx.kioscoSites.deleteMany({ where: { idKiosco: kiosk.idKiosco } });
                await tx.kioscoSites.createMany({
                    data: sites.map((site) => ({
                        idKiosco: kiosk.idKiosco,
                        idSite: site.idSite,
                    })),
                });
            }

            await tx.kioscosAsistencia.update({
                where: { idKiosco: kiosk.idKiosco },
                data: {
                    fechaActualizacion: new Date(),
                    ...(dto.nombre !== undefined ? { nombre: dto.nombre.trim() } : {}),
                    ...(dto.idEmpleadoResponsable !== undefined
                        ? { idEmpleadoResponsable: dto.idEmpleadoResponsable }
                        : {}),
                    ...(dto.politicas ? { politicas: this.politicasJson(dto.politicas) } : {}),
                },
            });

            await this.registrarHistorico(user, companyId, {
                accion: 'ACTUALIZAR',
                idRegistro: String(kiosk.idKiosco),
                descripcion: `Kiosco ${kiosk.codigo} actualizado por ${this.nombreUsuario(user)}`,
                detalles: this.detallesActualizacion(dto),
            }, tx);

            return this.leerDetalle(tx, kiosk.idKiosco);
        }, 'Ocurrió un error al actualizar el kiosco.');

        return {
            message: 'Kiosco actualizado correctamente.',
            kiosk: this.mapDetail(actualizado, await this.minutosSinLatido(idTenant, companyId)),
        };
    }

    async regenerateActivationCode(
        user: ActiveUserDto,
        companyId: number,
        idKiosco: number,
    ) {
        const idTenant = this.tenantDe(user);
        this.assertEmpresa(companyId);

        return this.enTransaccion(async (tx) => {
            const kiosk = await this.obtenerKiosco(tx, idTenant, companyId, idKiosco);

            if (kiosk.estatus !== 'PENDIENTE_ACTIVACION' && kiosk.estatus !== 'BLOQUEADO') {
                throw new ConflictException(
                    'Solo se puede regenerar el código de un kiosco pendiente de activación o bloqueado.',
                );
            }

            const ahora = new Date();
            const codigo = this.generateActivationCode();
            const expiraEn = this.expiracionCodigo(ahora);

            await tx.kioscoCodigosActivacion.updateMany({
                where: {
                    idKiosco: kiosk.idKiosco,
                    usadoEn: null,
                    invalidadoEn: null,
                    expiraEn: { gt: ahora },
                },
                data: { invalidadoEn: ahora },
            });

            await tx.kioscoCodigosActivacion.create({
                data: {
                    idKiosco: kiosk.idKiosco,
                    codigoHash: this.hashActivationCode(codigo),
                    expiraEn,
                    usadoEn: null,
                    intentosFallidos: 0,
                },
            });

            await tx.kioscosAsistencia.update({
                where: { idKiosco: kiosk.idKiosco },
                data: { fechaActualizacion: ahora },
            });

            await this.registrarHistorico(user, companyId, {
                accion: 'REGENERAR_CODIGO',
                idRegistro: String(kiosk.idKiosco),
                descripcion: `Se regeneró el código de activación del kiosco ${kiosk.codigo} por ${this.nombreUsuario(user)}`,
                detalles: { vigenciaHoras: this.ACTIVATION_CODE_EXPIRATION_HOURS },
            }, tx);

            return {
                codigo,
                expiraEn,
                vigenciaHoras: this.ACTIVATION_CODE_EXPIRATION_HOURS,
            };
        }, 'Ocurrió un error al regenerar el código de activación.');
    }

    async blockKiosk(user: ActiveUserDto, companyId: number, idKiosco: number) {
        const idTenant = this.tenantDe(user);
        this.assertEmpresa(companyId);

        const actualizado = await this.enTransaccion(async (tx) => {
            const kiosk = await this.obtenerKiosco(tx, idTenant, companyId, idKiosco);

            if (kiosk.estatus === 'BAJA') {
                throw new ConflictException('Un kiosco dado de baja no se puede bloquear.');
            }

            const actualizado = await tx.kioscosAsistencia.update({
                where: { idKiosco: kiosk.idKiosco },
                data: {
                    estatus: 'BLOQUEADO',
                    tokenJti: null,
                    fechaActualizacion: new Date(),
                },
                select: KIOSK_DETAIL_SELECT,
            });

            await this.registrarHistorico(user, companyId, {
                accion: 'BLOQUEAR',
                idRegistro: String(kiosk.idKiosco),
                descripcion: `Kiosco ${kiosk.codigo} bloqueado por ${this.nombreUsuario(user)}`,
                detalles: {
                    estatusAnterior: kiosk.estatus,
                    estatusNuevo: 'BLOQUEADO',
                },
            }, tx);

            return actualizado;
        }, 'Ocurrió un error al bloquear el kiosco.');

        return {
            message: 'Kiosco bloqueado correctamente.',
            kiosk: this.mapDetail(actualizado, await this.minutosSinLatido(idTenant, companyId)),
        };
    }

    async unblockKiosk(user: ActiveUserDto, companyId: number, idKiosco: number) {
        const idTenant = this.tenantDe(user);
        this.assertEmpresa(companyId);

        const actualizado = await this.enTransaccion(async (tx) => {
            const kiosk = await this.obtenerKiosco(tx, idTenant, companyId, idKiosco);

            if (kiosk.estatus !== 'BLOQUEADO') {
                throw new ConflictException('Solo se puede reactivar un kiosco bloqueado.');
            }

            const actualizado = await tx.kioscosAsistencia.update({
                where: { idKiosco: kiosk.idKiosco },
                data: {
                    estatus: 'PENDIENTE_ACTIVACION',
                    identificadorDispositivo: null,
                    tokenJti: null,
                    fechaActualizacion: new Date(),
                },
                select: KIOSK_DETAIL_SELECT,
            });

            await this.registrarHistorico(user, companyId, {
                accion: 'DESBLOQUEAR',
                idRegistro: String(kiosk.idKiosco),
                descripcion: `Kiosco ${kiosk.codigo} desbloqueado por ${this.nombreUsuario(user)}. Debe activarse de nuevo.`,
                detalles: {
                    estatusAnterior: kiosk.estatus,
                    estatusNuevo: 'PENDIENTE_ACTIVACION',
                    identificadorDispositivoAnterior: kiosk.identificadorDispositivo,
                },
            }, tx);

            return actualizado;
        }, 'Ocurrió un error al desbloquear el kiosco.');

        return {
            message: 'Kiosco desbloqueado correctamente. Hay que activarlo de nuevo en el equipo.',
            kiosk: this.mapDetail(actualizado, await this.minutosSinLatido(idTenant, companyId)),
        };
    }

    async retireKiosk(user: ActiveUserDto, companyId: number, idKiosco: number) {
        const idTenant = this.tenantDe(user);
        this.assertEmpresa(companyId);

        const actualizado = await this.enTransaccion(async (tx) => {
            const kiosk = await this.obtenerKiosco(tx, idTenant, companyId, idKiosco);

            if (kiosk.estatus === 'BAJA') {
                throw new ConflictException('El kiosco ya está dado de baja.');
            }

            const fechaBaja = new Date();
            const actualizado = await tx.kioscosAsistencia.update({
                where: { idKiosco: kiosk.idKiosco },
                data: {
                    estatus: 'BAJA',
                    fechaBaja,
                    tokenJti: null,
                    fechaActualizacion: fechaBaja,
                },
                select: KIOSK_DETAIL_SELECT,
            });

            await this.registrarHistorico(user, companyId, {
                accion: 'BAJA',
                idRegistro: String(kiosk.idKiosco),
                descripcion: `Kiosco ${kiosk.codigo} dado de baja por ${this.nombreUsuario(user)}`,
                detalles: {
                    estatusAnterior: kiosk.estatus,
                    estatusNuevo: 'BAJA',
                    fechaBaja: fechaBaja.toISOString(),
                },
            }, tx);

            return actualizado;
        }, 'Ocurrió un error al dar de baja el kiosco.');

        return {
            message: 'Kiosco dado de baja correctamente.',
            kiosk: this.mapDetail(actualizado, await this.minutosSinLatido(idTenant, companyId)),
        };
    }

    // --------------------------------------------------------------------------
    // Helpers
    // --------------------------------------------------------------------------

    private tenantDe(user: ActiveUserDto): number {
        if (!user.idTenant) {
            throw new UnauthorizedException('El usuario no tiene un tenant asignado.');
        }
        return user.idTenant;
    }

    private assertEmpresa(companyId: number): void {
        if (!companyId || companyId <= 0) {
            throw new BadRequestException('La empresa proporcionada no es válida.');
        }
    }

    private whereEmpresa(
        idTenant: number,
        companyId: number,
        idKiosco: number,
    ): Prisma.KioscosAsistenciaWhereInput {
        return {
            idKiosco,
            idTenant,
            idEmpresa: companyId,
        };
    }

    private whereListado(
        idTenant: number,
        companyId: number,
        query: QueryKiosksDto,
    ): Prisma.KioscosAsistenciaWhereInput {
        const search = query.search?.trim();
        const where: Prisma.KioscosAsistenciaWhereInput = {
            idTenant,
            idEmpresa: companyId,
        };

        if (query.status) {
            where.estatus = query.status;
        }

        if (query.modalidad) {
            where.modalidad = query.modalidad;
        }

        // Un kiosco fijo puede tener varias ubicaciones.
        if (query.idSite) {
            where.KioscoSites = {
                some: { idSite: query.idSite },
            };
        }

        if (search) {
            where.OR = [
                { codigo: { contains: search } },
                { Empleados: { is: { nombre: { contains: search } } } },
                { Empleados: { is: { primerApellido: { contains: search } } } },
                { Empleados: { is: { segundoApellido: { contains: search } } } },
                { Empleados: { is: { numeroEmpleado: { contains: search } } } },
            ];
        }

        return where;
    }

    private async obtenerKiosco(
        db: Prisma.TransactionClient,
        idTenant: number,
        companyId: number,
        idKiosco: number,
    ): Promise<KioskOperacion> {
        const kiosk = await db.kioscosAsistencia.findFirst({
            where: this.whereEmpresa(idTenant, companyId, idKiosco),
            select: KIOSK_OPERACION_SELECT,
        });

        if (!kiosk) {
            throw new NotFoundException('Kiosco no encontrado.');
        }

        return kiosk;
    }

    private async leerDetalle(
        db: Prisma.TransactionClient,
        idKiosco: number,
    ): Promise<KioskDetailRow> {
        const kiosk = await db.kioscosAsistencia.findFirst({
            where: { idKiosco },
            select: KIOSK_DETAIL_SELECT,
        });

        if (!kiosk) {
            throw new NotFoundException('Kiosco no encontrado.');
        }

        return kiosk;
    }

    private async enTransaccion<T>(
        trabajo: (tx: Prisma.TransactionClient) => Promise<T>,
        mensajeError: string,
    ): Promise<T> {
        try {
            return await this.prisma.$transaction(trabajo, {
                maxWait: 5000,
                timeout: 15000,
            });
        } catch (error) {
            this.propagarError(error, mensajeError);
        }
    }

    private propagarError(error: unknown, mensaje: string): never {
        if (
            error instanceof BadRequestException ||
            error instanceof NotFoundException ||
            error instanceof UnauthorizedException ||
            error instanceof ConflictException
        ) {
            throw error;
        }

        if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === 'P2002'
        ) {
            throw new ConflictException(
                'Se produjo un conflicto con un registro único. Intenta nuevamente.',
            );
        }

        this.logger.error(mensaje, error instanceof Error ? error.stack : String(error));
        throw new InternalServerErrorException(mensaje);
    }

    private async minutosSinLatido(idTenant: number, companyId: number): Promise<number> {
        const config = await this.attendanceConfig.getConfiguracionAsistencia(idTenant, companyId);
        const minutos = config.kiosco.minutosSinLatidoParaOffline;
        if (Number.isInteger(minutos) && minutos > 0) {
            return minutos;
        }
        return DEFAULT_ATTENDANCE_CONFIG.kiosco.minutosSinLatidoParaOffline;
    }

    private versionMinimaApp(): string {
        const version = this.configService.get<string>('KIOSK_MIN_APP_VERSION');
        const normalizada = typeof version === 'string' ? version.trim() : '';
        return normalizada || '1.0.0';
    }

    private conexion(ultimoLatido: Date | null, minutos: number): ConexionKiosco {
        if (!ultimoLatido) {
            return 'NUNCA';
        }
        const limite = Date.now() - minutos * 60_000;
        return ultimoLatido.getTime() >= limite ? 'EN_LINEA' : 'SIN_CONEXION';
    }

    private esAlerta(kiosk: KioskListRow, minutos: number, versionMinima: string): boolean {
        if (this.conexion(kiosk.ultimoLatido, minutos) === 'SIN_CONEXION') {
            return true;
        }
        if (kiosk.pendientesReportados > 0) {
            return true;
        }
        return this.versionMenor(kiosk.versionApp, versionMinima);
    }

    private versionMenor(actual: string | null, minima: string): boolean {
        if (!actual?.trim()) {
            return false;
        }

        const partes = (valor: string) => valor.trim().split('.').map((parte) => {
            const numero = Number.parseInt(parte, 10);
            return Number.isFinite(numero) ? numero : 0;
        });
        const izquierda = partes(actual);
        const derecha = partes(minima);
        const largo = Math.max(izquierda.length, derecha.length);

        for (let i = 0; i < largo; i++) {
            const av = izquierda[i] ?? 0;
            const bv = derecha[i] ?? 0;
            if (av < bv) return true;
            if (av > bv) return false;
        }

        return false;
    }

    private rangoHoy(ahora = new Date()): { inicio: Date; fin: Date } {
        const fecha = localDateString(ahora, ZONA_NEGOCIO);
        return {
            inicio: localTimeToInstant(fecha, new Date(Date.UTC(2000, 0, 1, 0, 0, 0)), ZONA_NEGOCIO),
            fin: localTimeToInstant(fecha, new Date(Date.UTC(2000, 0, 1, 23, 59, 59)), ZONA_NEGOCIO),
        };
    }

    private paginar(page: number, limit: number, total: number) {
        return {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
            hasNextPage: page * limit < total,
            hasPreviousPage: page > 1,
        };
    }

    private mapListItem(kiosk: KioskListRow, minutos: number) {
        const sites = kiosk.KioscoSites.map((relation) => ({
            idSite: relation.CatSites.idSite,
            descripcion: relation.CatSites.Descripcion,
            esPrincipal: relation.CatSites.EsPrincipal,
            activo: relation.CatSites.Activo,
            direccion: [
                relation.CatSites.Calle,
                relation.CatSites.Colonia,
                relation.CatSites.MunicipioDelegacion,
                relation.CatSites.Estado,
                relation.CatSites.CodigoPostal,
            ].filter(Boolean).join(', '),
        }));

        const responsable = kiosk.Empleados;
        const nombreCompleto = [
            responsable?.nombre,
            responsable?.primerApellido,
            responsable?.segundoApellido,
        ].filter(Boolean).join(' ');

        return {
            idKiosco: kiosk.idKiosco,
            nombre: kiosk.nombre,
            codigo: kiosk.codigo,
            modalidad: kiosk.modalidad,
            estatus: kiosk.estatus,
            idEmpleadoResponsable: kiosk.idEmpleadoResponsable,
            responsable: responsable
                ? {
                    idEmpleado: responsable.idEmpleado,
                    numeroEmpleado: responsable.numeroEmpleado,
                    nombreCompleto: nombreCompleto || 'Sin nombre',
                    activo: responsable.activo,
                    puesto: responsable.CatPuestos?.DescripcionPuesto ?? null,
                }
                : null,
            dispositivo: {
                vinculado: !!kiosk.identificadorDispositivo,
                identificador: kiosk.identificadorDispositivo,
                ultimoUso: kiosk.ultimoLatido,
            },
            ubicaciones: sites,
            totalUbicaciones: sites.length,
            conexion: this.conexion(kiosk.ultimoLatido, minutos),
            versionApp: kiosk.versionApp,
            pendientesReportados: kiosk.pendientesReportados,
        };
    }

    private mapDetail(kiosk: KioskDetailRow, minutos: number) {
        return {
            ...this.mapListItem(kiosk, minutos),
            politicas: this.politicasDe(kiosk.politicas),
            fechaActivacion: kiosk.fechaActivacion,
            plataforma: kiosk.plataforma,
            modelo: kiosk.modelo,
        };
    }

    private politicasDe(value: Prisma.JsonValue): PoliticasKiosco {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            return {
                requiereFoto: false,
                deteccionRostro: false,
                permitirOffline: false,
                aceptarNoIdentificados: false,
            };
        }

        const raw = value as Record<string, unknown>;
        return {
            requiereFoto: raw.requiereFoto === true,
            deteccionRostro: raw.deteccionRostro === true,
            permitirOffline: raw.permitirOffline === true,
            aceptarNoIdentificados: raw.aceptarNoIdentificados === true,
        };
    }

    private politicasJson(politicas: PoliticasKiosco): Prisma.InputJsonObject {
        return {
            requiereFoto: politicas.requiereFoto,
            deteccionRostro: politicas.deteccionRostro,
            permitirOffline: politicas.permitirOffline,
            aceptarNoIdentificados: politicas.aceptarNoIdentificados,
        };
    }

    private detallesActualizacion(dto: UpdateKioskDto): Prisma.InputJsonObject {
        const detalles: Record<string, Prisma.InputJsonValue> = {};
        if (dto.nombre !== undefined) detalles.nombre = dto.nombre.trim();
        if (dto.idEmpleadoResponsable !== undefined) {
            detalles.idEmpleadoResponsable = dto.idEmpleadoResponsable;
        }
        if (dto.idSites !== undefined) detalles.idSites = dto.idSites;
        if (dto.politicas) detalles.politicas = this.politicasJson(dto.politicas);
        return detalles;
    }

    // Validar las reglas de configuración.
    private validateKioskConfiguration(dto: {
        nombre: string;
        modalidad: 'FIJO' | 'CUADRILLA';
        idEmpleadoResponsable: number;
        idSites?: number[];
        politicas: PoliticasKiosco;
    }): void {
        if (!dto.nombre?.trim() || dto.nombre.trim().length < 3) {
            throw new BadRequestException('El nombre del kiosco debe tener al menos 3 caracteres.');
        }

        if (!dto.politicas) {
            throw new BadRequestException('Debes proporcionar las políticas de configuración del kiosco.');
        }

        if (dto.politicas.deteccionRostro && !dto.politicas.requiereFoto) {
            throw new BadRequestException('La detección de rostro requiere que la captura de fotografía esté habilitada.');
        }

        if (!['FIJO', 'CUADRILLA'].includes(dto.modalidad)) {
            throw new BadRequestException('La modalidad debe ser FIJO o CUADRILLA.');
        }

        if (!Number.isInteger(dto.idEmpleadoResponsable) || dto.idEmpleadoResponsable <= 0) {
            throw new BadRequestException('Debes seleccionar un empleado responsable válido.');
        }

        if (dto.modalidad === 'FIJO') {
            if (!Array.isArray(dto.idSites) || dto.idSites.length === 0) {
                throw new BadRequestException('Un kiosco fijo debe tener al menos una ubicación asociada.');
            }
            if (dto.idSites.some((id) => !Number.isInteger(id) || id <= 0,)) {
                throw new BadRequestException('Una o más ubicaciones tienen identificadores inválidos.');
            }
            if (new Set(dto.idSites).size !== dto.idSites.length) {
                throw new BadRequestException('No puedes asociar dos veces la misma ubicación.');
            }
        }

        if (dto.modalidad === 'CUADRILLA' && dto.idSites?.length) {
            throw new BadRequestException('Los kioscos de cuadrilla no pueden tener ubicaciones asociadas.');
        }
    }

    private async registrarHistorico(
        user: ActiveUserDto,
        companyId: number,
        payload: {
            accion: string;
            idRegistro: string;
            descripcion: string;
            detalles?: Prisma.InputJsonValue;
        },
        tx: Prisma.TransactionClient,
    ) {
        await tx.historicoMovimientos.create({
            data: {
                idUsuario: user.id,
                idEmpresa: companyId,
                accion: payload.accion,
                tablaOrigen: 'KioscosAsistencia',
                idRegistro: payload.idRegistro,
                descripcion: payload.descripcion,
                detalles_json: payload.detalles,
                fechaCreacion: new Date(),
            },
        });
    }

    private nombreUsuario(user: ActiveUserDto): string {
        const nombre = `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim();
        return nombre || user.username || String(user.id);
    }

    private expiracionCodigo(desde = new Date()): Date {
        const expiraEn = new Date(desde.getTime());
        expiraEn.setHours(expiraEn.getHours() + this.ACTIVATION_CODE_EXPIRATION_HOURS);
        return expiraEn;
    }

    // Generar código identificador del kiosco. Ejemplo: KSK-A82F91C4
    private generateKioskCode(): string {
        const randomPart = randomBytes(4)
            .toString('hex')
            .toUpperCase();
        return `KSK-${randomPart}`;
    }

    // Generar código de activación de alta entropía. Ejemplo: 7A92F4B18C23D5E6A1B09C4D8F2E6A10
    private generateActivationCode(): string {
        return randomBytes(16)
            .toString('hex')
            .toUpperCase();
    }

    // Convertir código de activación a SHA-256.
    private hashActivationCode(code: string): string {
        return createHash('sha256')
            .update(code)
            .digest('hex');
    }
}
