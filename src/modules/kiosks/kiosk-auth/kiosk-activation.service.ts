import { randomUUID } from 'crypto';
import {
    HttpException,
    HttpStatus,
    Injectable,
    InternalServerErrorException,
    Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from 'generated/prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { hashActivationCode, normalizarCodigoActivacion } from '../kiosk-activation-code.util';
import { errorKiosco } from '../kiosk-http';
import { ActivateKioskDto } from './dto/activate-kiosk.dto';
import { KioskActivationRateLimiter } from './kiosk-activation-rate-limiter';

const MENSAJE_INVALIDO = 'El código de activación no es válido.';
const MENSAJE_EXPIRADO = 'Este código ya venció. Pide a RH uno nuevo.';
const MENSAJE_BLOQUEADO = 'Este código se bloqueó por intentos fallidos. Pide a RH uno nuevo.';
const MENSAJE_CUADRILLA = 'La modalidad cuadrilla todavía no está disponible en la app.';
const MENSAJE_EQUIPO = 'Este equipo ya está activado como otro kiosco.';
const LIMITE_INTENTOS = 5;

const FALLOS_DE_CODIGO = new Set(['CODIGO_INVALIDO', 'CODIGO_EXPIRADO', 'CODIGO_BLOQUEADO']);

@Injectable()
export class KioskActivationService {
    private readonly logger = new Logger(KioskActivationService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly jwt: JwtService,
        private readonly limiter: KioskActivationRateLimiter,
    ) {}

    async activate(dto: ActivateKioskDto, ip: string) {
        if (this.limiter.bloqueada(ip)) {
            throw errorKiosco(
                HttpStatus.TOO_MANY_REQUESTS,
                'DEMASIADOS_INTENTOS',
                'Demasiados intentos desde esta red. Espera unos minutos e intenta de nuevo.',
            );
        }

        try {
            return await this.activar(dto);
        } catch (error) {
            if (esFalloDeCodigo(error)) {
                this.limiter.registrarFallo(ip);
            }
            if (error instanceof HttpException) {
                throw error;
            }
            if (esP2002(error) && esDispositivoDuplicado(error)) {
                throw errorKiosco(HttpStatus.CONFLICT, 'EQUIPO_YA_ACTIVADO', MENSAJE_EQUIPO);
            }
            if (esP2002(error)) {
                throw errorKiosco(
                    HttpStatus.CONFLICT,
                    'CONFLICTO_UNICO',
                    'Se produjo un conflicto con un registro único. Intenta nuevamente.',
                );
            }
            this.logger.error(
                'Error al activar el kiosco:',
                error instanceof Error ? error.stack : String(error),
            );
            throw new InternalServerErrorException('Ocurrió un error al activar el kiosco.');
        }
    }

    private async activar(dto: ActivateKioskDto) {
        const normalizado = normalizarCodigoActivacion(dto.codigo ?? '');
        if (!normalizado) {
            throw errorKiosco(HttpStatus.BAD_REQUEST, 'CODIGO_INVALIDO', MENSAJE_INVALIDO);
        }

        const codigo = await this.prisma.kioscoCodigosActivacion.findUnique({
            where: { codigoHash: hashActivationCode(normalizado) },
            select: {
                idCodigo: true,
                expiraEn: true,
                usadoEn: true,
                invalidadoEn: true,
                intentosFallidos: true,
                KioscosAsistencia: {
                    select: {
                        idKiosco: true,
                        idTenant: true,
                        idEmpresa: true,
                        codigo: true,
                        nombre: true,
                        modalidad: true,
                        estatus: true,
                        idEmpleadoResponsable: true,
                    },
                },
            },
        });

        if (!codigo) {
            throw errorKiosco(HttpStatus.BAD_REQUEST, 'CODIGO_INVALIDO', MENSAJE_INVALIDO);
        }

        if (codigo.intentosFallidos >= LIMITE_INTENTOS) {
            throw errorKiosco(HttpStatus.BAD_REQUEST, 'CODIGO_BLOQUEADO', MENSAJE_BLOQUEADO);
        }

        if (codigo.usadoEn || codigo.invalidadoEn) {
            await this.rechazarCodigo(codigo.idCodigo, 'CODIGO_INVALIDO', MENSAJE_INVALIDO);
        }

        if (codigo.expiraEn.getTime() <= Date.now()) {
            await this.rechazarCodigo(codigo.idCodigo, 'CODIGO_EXPIRADO', MENSAJE_EXPIRADO);
        }

        const kiosk = codigo.KioscosAsistencia;
        if (kiosk.modalidad === 'CUADRILLA') {
            throw errorKiosco(HttpStatus.CONFLICT, 'MODALIDAD_NO_DISPONIBLE', MENSAJE_CUADRILLA);
        }

        if (kiosk.estatus !== 'PENDIENTE_ACTIVACION' && kiosk.estatus !== 'BLOQUEADO') {
            await this.rechazarCodigo(codigo.idCodigo, 'CODIGO_INVALIDO', MENSAJE_INVALIDO);
        }

        const identificador = dto.identificadorDispositivo.trim().slice(0, 150);
        const plataforma = dto.plataforma.trim().slice(0, 20);
        const modelo = dto.modelo.trim().slice(0, 120);
        const versionApp = dto.versionApp.trim().slice(0, 20);

        const ocupado = await this.prisma.kioscosAsistencia.findFirst({
            where: {
                identificadorDispositivo: identificador,
                NOT: { idKiosco: kiosk.idKiosco },
            },
            select: { idKiosco: true },
        });
        if (ocupado) {
            throw errorKiosco(HttpStatus.CONFLICT, 'EQUIPO_YA_ACTIVADO', MENSAJE_EQUIPO);
        }

        const ahora = new Date();
        const jti = randomUUID();

        const activado = await this.prisma.$transaction(
            async (tx) => {
                const consumido = await tx.kioscoCodigosActivacion.updateMany({
                    where: {
                        idCodigo: codigo.idCodigo,
                        usadoEn: null,
                        invalidadoEn: null,
                    },
                    data: { usadoEn: ahora },
                });
                if (consumido.count !== 1) {
                    throw errorKiosco(HttpStatus.BAD_REQUEST, 'CODIGO_INVALIDO', MENSAJE_INVALIDO);
                }

                await tx.kioscosAsistencia.update({
                    where: { idKiosco: kiosk.idKiosco },
                    data: {
                        identificadorDispositivo: identificador,
                        plataforma,
                        modelo,
                        versionApp,
                        estatus: 'ACTIVO',
                        fechaActivacion: ahora,
                        tokenJti: jti,
                        fechaActualizacion: ahora,
                    },
                });

                const sites = await tx.kioscoSites.findMany({
                    where: { idKiosco: kiosk.idKiosco },
                    orderBy: { idSite: 'asc' },
                    select: {
                        idSite: true,
                        CatSites: { select: { Descripcion: true, zonaHoraria: true } },
                    },
                });
                const empresa = await tx.catEmpresas.findUnique({
                    where: { idEmpresa: kiosk.idEmpresa },
                    select: { idEmpresa: true, nombre_comercial: true, razon_social: true },
                });
                const idUsuario = await this.idUsuarioAuditoria(
                    tx,
                    kiosk.idEmpleadoResponsable,
                    kiosk.idTenant,
                );

                await tx.historicoMovimientos.create({
                    data: {
                        idUsuario,
                        idEmpresa: kiosk.idEmpresa,
                        accion: 'ACTIVAR',
                        tablaOrigen: 'KioscosAsistencia',
                        idRegistro: String(kiosk.idKiosco),
                        descripcion: `Kiosco ${kiosk.codigo} activado en el equipo`,
                        detalles_json: {
                            estatusAnterior: kiosk.estatus,
                            estatusNuevo: 'ACTIVO',
                            identificadorDispositivo: identificador,
                            plataforma,
                            modelo,
                            versionApp,
                            origen: 'EQUIPO',
                        },
                        fechaCreacion: ahora,
                    },
                });

                return {
                    kiosco: {
                        idKiosco: kiosk.idKiosco,
                        codigo: kiosk.codigo,
                        nombre: kiosk.nombre,
                        modalidad: kiosk.modalidad,
                    },
                    empresa: {
                        idEmpresa: kiosk.idEmpresa,
                        nombre: empresa?.nombre_comercial?.trim() || empresa?.razon_social?.trim() || '',
                    },
                    sites: sites.map((site) => ({
                        idSite: site.idSite,
                        nombre: site.CatSites?.Descripcion ?? '',
                        zonaHoraria: site.CatSites?.zonaHoraria ?? 'America/Mexico_City',
                    })),
                };
            },
            { maxWait: 5000, timeout: 15000 },
        );

        const token = this.jwt.sign(
            {
                tipo: 'KIOSCO',
                idKiosco: kiosk.idKiosco,
                idTenant: kiosk.idTenant,
                idEmpresa: kiosk.idEmpresa,
                jti,
            },
            { expiresIn: '365d' },
        );

        return { token, ...activado };
    }

    private async rechazarCodigo(
        idCodigo: number,
        code: 'CODIGO_INVALIDO' | 'CODIGO_EXPIRADO',
        message: string,
    ): Promise<never> {
        const actualizado = await this.prisma.kioscoCodigosActivacion.update({
            where: { idCodigo },
            data: { intentosFallidos: { increment: 1 } },
            select: { intentosFallidos: true },
        });

        if (actualizado.intentosFallidos >= LIMITE_INTENTOS) {
            throw errorKiosco(HttpStatus.BAD_REQUEST, 'CODIGO_BLOQUEADO', MENSAJE_BLOQUEADO);
        }

        throw errorKiosco(HttpStatus.BAD_REQUEST, code, message);
    }

    private async idUsuarioAuditoria(
        tx: Prisma.TransactionClient,
        idEmpleadoResponsable: number,
        idTenant: number,
    ): Promise<number> {
        const empleado = await tx.empleados.findUnique({
            where: { idEmpleado: idEmpleadoResponsable },
            select: { idUsuario: true },
        });

        if (empleado?.idUsuario) {
            const usuario = await tx.auth_user.findUnique({
                where: { uuid: empleado.idUsuario },
                select: { id: true },
            });
            if (usuario) return usuario.id;
        }

        const cualquiera = await tx.auth_user.findFirst({
            where: { idTenant, is_active: true },
            select: { id: true },
            orderBy: { id: 'asc' },
        });
        if (cualquiera) return cualquiera.id;

        throw new InternalServerErrorException('No se pudo registrar la activación del kiosco.');
    }
}

function esFalloDeCodigo(error: unknown): boolean {
    if (!(error instanceof HttpException)) return false;
    const body = error.getResponse();
    if (typeof body !== 'object' || body === null) return false;
    const code = (body as { code?: string }).code;
    return code != null && FALLOS_DE_CODIGO.has(code);
}

function esP2002(error: unknown): error is Prisma.PrismaClientKnownRequestError {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

function esDispositivoDuplicado(error: Prisma.PrismaClientKnownRequestError): boolean {
    const target = error.meta?.target;
    const texto = Array.isArray(target) ? target.join(' ') : String(target ?? '');
    return texto.toLowerCase().includes('dispositivo');
}
