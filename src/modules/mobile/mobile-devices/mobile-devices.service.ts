import {
    BadRequestException,
    ConflictException,
    Injectable,
    InternalServerErrorException,
    Logger,
    NotFoundException,
    UnauthorizedException,
} from '@nestjs/common';
import type { Prisma } from 'generated/prisma/client';
import type { DispositivosAsistencia_estatus } from 'generated/prisma/enums';
import { ActiveUserDto } from 'src/modules/auth/dto/active-user.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { BlockDeviceDto } from './dto/block-device.dto';
import { RegisterDeviceDto } from './dto/register-device.dto';

const MENSAJE_PENDIENTE =
    'Tu dispositivo quedó registrado y está esperando autorización de Recursos Humanos. Te avisaremos en cuanto puedas registrar tu asistencia.';

const MENSAJE_VINCULADO_OTRO =
    'Este dispositivo ya está vinculado a otro colaborador.';

const ESTADOS_DISPOSITIVO: DispositivosAsistencia_estatus[] = [
    'PENDIENTE',
    'APROBADO',
    'BLOQUEADO',
    'BAJA',
];

export type MobileDeviceUser = ActiveUserDto & {
    idEmpleado?: number | null;
    idEmpresa?: number | null;
};

@Injectable()
export class MobileDevicesService {
    private readonly logger = new Logger(MobileDevicesService.name);

    constructor(private readonly prisma: PrismaService) {}

    async register(user: MobileDeviceUser, dto: RegisterDeviceDto) {
        const { idEmpleado, idEmpresa, idTenant } = this.resolverIdentidadMovil(user);

        const existing = await this.prisma.dispositivosAsistencia.findUnique({
            where: {
                idTenant_identificadorDispositivo: {
                    idTenant,
                    identificadorDispositivo: dto.identificadorDispositivo,
                },
            },
        });

        if (existing) {
            if (existing.idEmpleado !== idEmpleado) {
                throw new ConflictException(MENSAJE_VINCULADO_OTRO);
            }

            const updated = await this.prisma.dispositivosAsistencia.update({
                where: { idDispositivo: existing.idDispositivo },
                data: {
                    modelo: dto.modelo ?? existing.modelo,
                    versionApp: dto.versionApp ?? existing.versionApp,
                    pushToken: dto.pushToken ?? existing.pushToken,
                    ultimoUso: new Date(),
                },
            });

            return this.toRegisterResponse(updated);
        }

        try {
            const created = await this.prisma.dispositivosAsistencia.create({
                data: {
                    idTenant,
                    idEmpresa,
                    idEmpleado,
                    identificadorDispositivo: dto.identificadorDispositivo,
                    plataforma: dto.plataforma,
                    modelo: dto.modelo,
                    versionApp: dto.versionApp,
                    pushToken: dto.pushToken,
                    estatus: 'PENDIENTE',
                    ultimoUso: new Date(),
                },
            });

            return this.toRegisterResponse(created);
        } catch (error) {
            if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
                const raced = await this.prisma.dispositivosAsistencia.findUnique({
                    where: {
                        idTenant_identificadorDispositivo: {
                            idTenant,
                            identificadorDispositivo: dto.identificadorDispositivo,
                        },
                    },
                });

                if (raced && raced.idEmpleado !== idEmpleado) {
                    throw new ConflictException(MENSAJE_VINCULADO_OTRO);
                }
            }

            this.logger.error('Error al registrar dispositivo móvil', error);
            throw new InternalServerErrorException('Error al registrar el dispositivo.');
        }
    }

    async findAll(
        user: ActiveUserDto,
        companyId: number,
        page: number,
        limit: number,
        search?: string,
        estatus?: string,
    ) {
        this.assertTenant(user);

        const pageNumber = Math.max(1, Number(page) || 1);
        const limitNumber = Math.max(1, Number(limit) || 10);
        const skip = (pageNumber - 1) * limitNumber;
        const query = search?.trim() ?? '';
        const estatusFiltro = this.parseEstatus(estatus);

        const whereCondition: Prisma.DispositivosAsistenciaWhereInput = {
            idEmpresa: companyId,
            idTenant: user.idTenant,
            ...(estatusFiltro ? { estatus: estatusFiltro } : {}),
        };

        if (query) {
            whereCondition.OR = [
                { identificadorDispositivo: { contains: query } },
                { modelo: { contains: query } },
                {
                    Empleados: {
                        OR: [
                            { numeroEmpleado: { contains: query } },
                            { nombre: { contains: query } },
                            { primerApellido: { contains: query } },
                            { segundoApellido: { contains: query } },
                        ],
                    },
                },
            ];
        }

        const [devices, total] = await Promise.all([
            this.prisma.dispositivosAsistencia.findMany({
                where: whereCondition,
                skip,
                take: limitNumber,
                orderBy: { idDispositivo: 'desc' },
                include: {
                    Empleados: {
                        select: {
                            numeroEmpleado: true,
                            nombre: true,
                            primerApellido: true,
                            segundoApellido: true,
                            CatPuestos: {
                                select: { NombrePuesto: true },
                            },
                        },
                    },
                },
            }),
            this.prisma.dispositivosAsistencia.count({ where: whereCondition }),
        ]);

        if ((!devices || devices.length === 0) && pageNumber === 1 && !query && !estatusFiltro) {
            return {
                devices: [],
                total: 0,
                currentPage: pageNumber,
                totalPages: 1,
            };
        }

        return {
            devices: devices.map((device) => this.toListItem(device)),
            total,
            currentPage: pageNumber,
            totalPages: Math.ceil(total / limitNumber) || 1,
        };
    }

    async pendingCount(user: ActiveUserDto, companyId: number) {
        this.assertTenant(user);

        const count = await this.prisma.dispositivosAsistencia.count({
            where: {
                idEmpresa: companyId,
                idTenant: user.idTenant,
                estatus: 'PENDIENTE',
                activo: true,
            },
        });

        return { pendingCount: count };
    }

    async approve(user: ActiveUserDto, companyId: number, idDispositivo: number) {
        this.assertTenant(user);

        return this.prisma.$transaction(async (tx) => {
            const device = await this.obtenerDispositivoEmpresa(tx, user.idTenant, companyId, idDispositivo);

            const updated = await tx.dispositivosAsistencia.update({
                where: { idDispositivo: device.idDispositivo },
                data: {
                    estatus: 'APROBADO',
                    fechaAprobacion: new Date(),
                    usuarioAprobacion: this.nombreUsuarioToken(user),
                },
            });

            await this.registrarHistorico(user, companyId, {
                accion: 'APROBAR',
                idRegistro: String(updated.idDispositivo),
                descripcion: `Dispositivo ${updated.idDispositivo} aprobado por ${user.first_name} ${user.last_name}`,
            }, tx);

            return updated;
        });
    }

    async block(user: ActiveUserDto, companyId: number, idDispositivo: number, dto: BlockDeviceDto) {
        this.assertTenant(user);

        return this.prisma.$transaction(async (tx) => {
            const device = await this.obtenerDispositivoEmpresa(tx, user.idTenant, companyId, idDispositivo);

            const updated = await tx.dispositivosAsistencia.update({
                where: { idDispositivo: device.idDispositivo },
                data: {
                    estatus: 'BLOQUEADO',
                },
            });

            await this.registrarHistorico(user, companyId, {
                accion: 'BLOQUEAR',
                idRegistro: String(updated.idDispositivo),
                descripcion: `Dispositivo ${updated.idDispositivo} bloqueado por ${user.first_name} ${user.last_name}. Motivo: ${dto.motivo}`,
                detalles: { motivo: dto.motivo },
            }, tx);

            return updated;
        });
    }

    private resolverIdentidadMovil(user: MobileDeviceUser) {
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

    private assertTenant(user: ActiveUserDto) {
        if (!user.idTenant) {
            throw new InternalServerErrorException('El usuario no tiene un tenant asignado.');
        }
    }

    private parseEstatus(estatus?: string): DispositivosAsistencia_estatus | undefined {
        if (!estatus) {
            return undefined;
        }

        if (!ESTADOS_DISPOSITIVO.includes(estatus as DispositivosAsistencia_estatus)) {
            throw new BadRequestException('Estatus de dispositivo inválido.');
        }

        return estatus as DispositivosAsistencia_estatus;
    }

    private async obtenerDispositivoEmpresa(
        tx: Prisma.TransactionClient,
        idTenant: number,
        companyId: number,
        idDispositivo: number,
    ) {
        const device = await tx.dispositivosAsistencia.findFirst({
            where: {
                idDispositivo,
                idEmpresa: companyId,
                idTenant,
            },
        });

        if (!device) {
            throw new NotFoundException('Dispositivo no encontrado.');
        }

        return device;
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
        tx: Prisma.TransactionClient | PrismaService = this.prisma,
    ) {
        await tx.historicoMovimientos.create({
            data: {
                idUsuario: user.id,
                idEmpresa: companyId,
                accion: payload.accion,
                tablaOrigen: 'DispositivosAsistencia',
                idRegistro: payload.idRegistro,
                descripcion: payload.descripcion,
                detalles_json: payload.detalles,
                fechaCreacion: new Date(),
            },
        });
    }

    private nombreUsuarioToken(user: ActiveUserDto) {
        const nombre = `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim();
        return (nombre || user.username || String(user.id)).slice(0, 100);
    }

    private toRegisterResponse(device: {
        idDispositivo: number;
        estatus: DispositivosAsistencia_estatus;
    }) {
        const requiereAprobacion = device.estatus === 'PENDIENTE';

        return {
            idDispositivo: device.idDispositivo,
            estatus: device.estatus,
            requiereAprobacion,
            mensaje: this.mensajePorEstatus(device.estatus),
        };
    }

    private mensajePorEstatus(estatus: DispositivosAsistencia_estatus) {
        switch (estatus) {
            case 'PENDIENTE':
                return MENSAJE_PENDIENTE;
            case 'APROBADO':
                return 'Tu dispositivo ya está autorizado. Puedes registrar tu asistencia.';
            case 'BLOQUEADO':
                return 'Este dispositivo está bloqueado. Contacta a Recursos Humanos.';
            default:
                return 'El estatus de tu dispositivo no permite registrar asistencia. Contacta a Recursos Humanos.';
        }
    }

    private toListItem(device: {
        idDispositivo: number;
        identificadorDispositivo: string;
        plataforma: string | null;
        modelo: string | null;
        versionApp: string | null;
        estatus: DispositivosAsistencia_estatus;
        fechaRegistro: Date;
        fechaAprobacion: Date | null;
        usuarioAprobacion: string | null;
        ultimoUso: Date | null;
        Empleados: {
            numeroEmpleado: string | null;
            nombre: string | null;
            primerApellido: string | null;
            segundoApellido: string | null;
            CatPuestos: { NombrePuesto: string } | null;
        };
    }) {
        return {
            idDispositivo: device.idDispositivo,
            identificadorDispositivo: device.identificadorDispositivo,
            plataforma: device.plataforma,
            modelo: device.modelo,
            versionApp: device.versionApp,
            estatus: device.estatus,
            fechaRegistro: device.fechaRegistro,
            fechaAprobacion: device.fechaAprobacion,
            usuarioAprobacion: device.usuarioAprobacion,
            ultimoUso: device.ultimoUso,
            empleado: {
                numeroEmpleado: device.Empleados.numeroEmpleado,
                nombreCompleto: [
                    device.Empleados.nombre,
                    device.Empleados.primerApellido,
                    device.Empleados.segundoApellido,
                ]
                    .filter(Boolean)
                    .join(' '),
                puesto: device.Empleados.CatPuestos?.NombrePuesto ?? null,
            },
        };
    }
}
