
import {
    BadRequestException,
    ConflictException,
    Injectable,
    InternalServerErrorException,
    Logger,
    NotFoundException,
    UnauthorizedException,
} from '@nestjs/common';
import { randomBytes, createHash } from 'crypto';
import { PrismaService } from 'src/prisma/prisma.service';
import { ActiveUserDto } from '../auth/dto/active-user.dto';
import { CreateKioskDto } from './dto/create-kiosk.dto';
import { Prisma } from 'generated/prisma/client';
import { QueryKiosksDto } from './dto/query-kiosks.dto';

@Injectable()
export class KiosksService {

    private readonly logger = new Logger(KiosksService.name);
    // Tiempo de vigencia del código de activación.
    private readonly ACTIVATION_CODE_EXPIRATION_HOURS = 24;

    constructor(
        private readonly prisma: PrismaService,
    ) { }

    // Obtiene todos los kioscos filtrados y paginados 
    async findAll(
        user: ActiveUserDto,
        companyId: number,
        query: QueryKiosksDto,
    ) {

        if (!user.idTenant) {
            throw new UnauthorizedException('El usuario no tiene un tenant asignado.');
        }

        if (!companyId || companyId <= 0) {
            throw new BadRequestException('La empresa proporcionada no es válida.');
        }

        const page = Math.max(1, query.page ?? 1);
        const limit = Math.min(100, Math.max(1, query.limit ?? 10));
        const search = query.search?.trim();

        const where: Prisma.KioscosAsistenciaWhereInput = {
            idTenant: user.idTenant,
            idEmpresa: companyId,
        };

        // Filtro por estatus.
        if (query.status) {
            where.estatus = query.status as any;
        }

        // Filtro por modalidad.
        if (query.modalidad) {
            where.modalidad = query.modalidad as any;
        }

        // Filtro por ubicación.
        // Un kiosco fijo puede tener varias ubicaciones.
        if (query.idSite) {
            where.KioscoSites = {
                some: {
                    idSite: query.idSite,
                },
            };
        }

        // Búsqueda por código del kiosco y responsable.
        if (search) {
            where.OR = [
                {
                    codigo: {
                        contains: search,
                    },
                },
                {
                    Empleados: {
                        is: {
                            nombre: {
                                contains: search,
                            },
                        },
                    },
                },
                {
                    Empleados: {
                        is: {
                            primerApellido: {
                                contains: search,
                            },
                        },
                    },
                },
                {
                    Empleados: {
                        is: {
                            segundoApellido: {
                                contains: search,
                            },
                        },
                    },
                },
                {
                    Empleados: {
                        is: {
                            numeroEmpleado: {
                                contains: search,
                            },
                        },
                    },
                },
            ];
        }

        const [total, kiosks] = await this.prisma.$transaction([
            this.prisma.kioscosAsistencia.count({
                where,
            }),

            this.prisma.kioscosAsistencia.findMany({
                where,

                select: {
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
                    // Responsable del kiosco.
                    Empleados: {
                        select: {
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
                        },
                    },
                    // Ubicaciones asociadas.
                    KioscoSites: {
                        select: {
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
                        },
                    },
                },

                orderBy: [
                    {
                        idKiosco: 'desc',
                    },
                ],

                skip: (page - 1) * limit,
                take: limit,
            }),
        ]);

        // Adaptar la información para el frontend.
        const requests = kiosks.map((kiosk) => {

            const responsable = kiosk.Empleados;

            const nombreCompleto = [
                responsable?.nombre,
                responsable?.primerApellido,
                responsable?.segundoApellido,
            ]
                .filter(Boolean)
                .join(' ');

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
                ]
                    .filter(Boolean)
                    .join(', '),
            }));

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

                // Datos de la tablet vinculada.
                dispositivo: {
                    vinculado: !!kiosk.identificadorDispositivo,
                    identificador: kiosk.identificadorDispositivo,
                    ultimoUso: kiosk.ultimoLatido,
                },

                // En cuadrilla será un arreglo vacío.
                ubicaciones: sites,
                totalUbicaciones: sites.length,
            };
        });

        return {
            kiosks: requests,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
                hasNextPage: page * limit < total,
                hasPreviousPage: page > 1,
            },
        };
    }

    // Crear un nuevo kiosco.
    async createKiosk(
        user: ActiveUserDto,
        companyId: number,
        dto: CreateKioskDto,
    ) {

        if (!user.idTenant) {
            throw new UnauthorizedException('El usuario no tiene un tenant asignado.');
        }

        if (!companyId || companyId <= 0) {
            throw new BadRequestException('La empresa proporcionada no es válida.');
        }

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
                            idTenant: user.idTenant,
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
                                idTenant: user.idTenant,
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
                    const expiresAt = new Date();

                    expiresAt.setHours(expiresAt.getHours() + this.ACTIVATION_CODE_EXPIRATION_HOURS);

                    // 7. Crear registro principal del kiosco.
                    const kiosk = await tx.kioscosAsistencia.create({
                        data: {
                            idTenant: user.idTenant,
                            idEmpresa: companyId,
                            // Identificación
                            nombre: dto.nombre.trim(),
                            codigo: kioskCode,
                            // Configuración
                            modalidad: dto.modalidad,
                            idEmpleadoResponsable: dto.idEmpleadoResponsable,
                            politicas: {
                                requiereFoto: dto.politicas.requiereFoto,
                                deteccionRostro: dto.politicas.deteccionRostro,
                                permitirOffline: dto.politicas.permitirOffline,
                                aceptarNoIdentificados: dto.politicas.aceptarNoIdentificados,
                            } satisfies Prisma.InputJsonObject,
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

    // --------------------------------------------------------------------------
    // Helpers
    // --------------------------------------------------------------------------

    // Validar las reglas de configuración.
    private validateKioskConfiguration(
        dto: CreateKioskDto,
    ): void {
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
