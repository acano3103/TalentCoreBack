import { Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from 'src/prisma/prisma.service';
import { MENSAJE_KIOSCO_NO_ACTIVO } from '../../kiosk-http';
import { SesionKiosco } from '../kiosco-actual';

interface KioskJwtPayload {
    tipo?: string;
    idKiosco?: number;
    idTenant?: number;
    idEmpresa?: number;
    jti?: string;
}

@Injectable()
export class KioskJwtStrategy extends PassportStrategy(Strategy, 'kiosk-jwt') {
    constructor(
        configService: ConfigService,
        private readonly prisma: PrismaService,
    ) {
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey: configService.getOrThrow<string>('KIOSK_JWT_SECRET'),
            algorithms: ['HS256'],
        });
    }

    async validate(payload: KioskJwtPayload): Promise<SesionKiosco> {
        if (payload?.tipo !== 'KIOSCO' || payload.jti == null || payload.jti === '') {
            throw new UnauthorizedException('Token de kiosco inválido.');
        }
        if (
            !Number.isInteger(payload.idKiosco) ||
            !Number.isInteger(payload.idTenant) ||
            !Number.isInteger(payload.idEmpresa)
        ) {
            throw new UnauthorizedException('Token de kiosco inválido.');
        }

        const kiosk = await this.prisma.kioscosAsistencia.findUnique({
            where: { idKiosco: payload.idKiosco },
            select: {
                idKiosco: true,
                idTenant: true,
                idEmpresa: true,
                codigo: true,
                nombre: true,
                modalidad: true,
                estatus: true,
                tokenJti: true,
            },
        });

        const vigente =
            kiosk != null &&
            kiosk.estatus === 'ACTIVO' &&
            kiosk.tokenJti === payload.jti &&
            kiosk.idTenant === payload.idTenant &&
            kiosk.idEmpresa === payload.idEmpresa;

        if (!vigente || !kiosk) {
            throw new ForbiddenException({
                code: 'KIOSCO_NO_ACTIVO',
                message: MENSAJE_KIOSCO_NO_ACTIVO,
            });
        }

        return {
            tipo: 'KIOSCO',
            idKiosco: kiosk.idKiosco,
            idTenant: kiosk.idTenant,
            idEmpresa: kiosk.idEmpresa,
            codigo: kiosk.codigo,
            nombre: kiosk.nombre,
            modalidad: kiosk.modalidad,
            jti: payload.jti,
        };
    }
}
