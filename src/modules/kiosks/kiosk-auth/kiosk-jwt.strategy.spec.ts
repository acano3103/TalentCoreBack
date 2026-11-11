jest.mock('src/prisma/prisma.service', () => ({
    PrismaService: class PrismaService {},
}));
jest.mock('src/modules/users/users.service', () => ({
    UsersService: class UsersService {},
}));

import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { PrismaService } from 'src/prisma/prisma.service';
import { UsersService } from 'src/modules/users/users.service';
import { JwtStrategy } from 'src/modules/auth/strategies/jwt.strategy';
import { MobileJwtStrategy } from 'src/modules/mobile/mobile-auth/strategies/mobile-jwt.strategy';
import { KioskJwtStrategy } from './strategies/kiosk-jwt.strategy';
import { kioskJwtOptions } from './kiosk-jwt.options';

const SECRETO_WEB = 'secreto-web';
const SECRETO_KIOSCO = 'secreto-kiosco';

function config(): ConfigService {
    const secretos: Record<string, string> = {
        JWT_SECRET: SECRETO_WEB,
        KIOSK_JWT_SECRET: SECRETO_KIOSCO,
    };
    return {
        getOrThrow: jest.fn((key: string) => {
            const valor = secretos[key];
            if (!valor) throw new Error(`falta ${key}`);
            return valor;
        }),
        get: jest.fn((key: string, defecto?: string) => secretos[key] ?? defecto ?? 'true'),
    } as unknown as ConfigService;
}

describe('KioskJwtStrategy', () => {
    let strategy: KioskJwtStrategy;
    let prisma: { kioscosAsistencia: { findUnique: jest.Mock } };

    const payload = {
        tipo: 'KIOSCO' as const,
        idKiosco: 5,
        idTenant: 3,
        idEmpresa: 9,
        jti: 'jti-vigente',
    };

    beforeEach(() => {
        prisma = {
            kioscosAsistencia: {
                findUnique: jest.fn(async () => ({
                    idKiosco: 5,
                    idTenant: 3,
                    idEmpresa: 9,
                    codigo: 'KSK-A82F91C4',
                    nombre: 'Recepción',
                    modalidad: 'FIJO',
                    estatus: 'ACTIVO',
                    tokenJti: 'jti-vigente',
                })),
            },
        };
        strategy = new KioskJwtStrategy(config(), prisma as unknown as PrismaService);
    });

    it('deja pasar un kiosco activo con el jti vigente', async () => {
        await expect(strategy.validate(payload)).resolves.toEqual(expect.objectContaining({
            tipo: 'KIOSCO',
            idKiosco: 5,
            jti: 'jti-vigente',
        }));
    });

    it('responde 403 si el kiosco está bloqueado', async () => {
        prisma.kioscosAsistencia.findUnique.mockResolvedValue({
            idKiosco: 5,
            idTenant: 3,
            idEmpresa: 9,
            codigo: 'KSK-A82F91C4',
            nombre: 'Recepción',
            modalidad: 'FIJO',
            estatus: 'BLOQUEADO',
            tokenJti: 'jti-vigente',
        });

        const error = await strategy.validate(payload).catch((e) => e);

        expect(error).toBeInstanceOf(ForbiddenException);
        expect(error.getStatus()).toBe(403);
        expect(error.getResponse()).toEqual({
            code: 'KIOSCO_NO_ACTIVO',
            message: 'Este equipo fue desactivado. Pide a RH un código nuevo.',
        });
    });

    it('responde 403 si el jti ya no es el del equipo', async () => {
        prisma.kioscosAsistencia.findUnique.mockResolvedValue({
            idKiosco: 5,
            idTenant: 3,
            idEmpresa: 9,
            codigo: 'KSK-A82F91C4',
            nombre: 'Recepción',
            modalidad: 'FIJO',
            estatus: 'ACTIVO',
            tokenJti: 'jti-nuevo',
        });

        const error = await strategy.validate(payload).catch((e) => e);

        expect(error.getStatus()).toBe(403);
        expect(error.getResponse()).toEqual(expect.objectContaining({ code: 'KIOSCO_NO_ACTIVO' }));
    });

    it('responde 401 ante un token móvil', async () => {
        const error = await strategy.validate({ user_id: 9, idEmpleado: 4 } as never).catch((e) => e);

        expect(error).toBeInstanceOf(UnauthorizedException);
        expect(error.getStatus()).toBe(401);
        expect(prisma.kioscosAsistencia.findUnique).not.toHaveBeenCalled();
    });
});

describe('tokens cruzados de kiosco, web y móvil', () => {
    const cfg = config();
    const prisma = { kioscosAsistencia: { findUnique: jest.fn() }, usuarioslogin: { findFirst: jest.fn() } };
    const usuarios = {} as UsersService;

    const web = new JwtStrategy(cfg, usuarios, prisma as unknown as PrismaService);
    const movil = new MobileJwtStrategy(cfg, usuarios, prisma as unknown as PrismaService);
    const kiosco = new KioskJwtStrategy(cfg, prisma as unknown as PrismaService);

    const tokenKiosco = jwt.sign(
        { tipo: 'KIOSCO', idKiosco: 5, idTenant: 3, idEmpresa: 9, jti: 'abc' },
        SECRETO_KIOSCO,
    );
    const tokenMovil = jwt.sign(
        { user_id: 9, idEmpleado: 4, idEmpresa: 9, idTenant: 3 },
        SECRETO_WEB,
    );

    it('firma el kiosco con KIOSK_JWT_SECRET y no con JWT_SECRET', () => {
        expect(kioskJwtOptions(cfg).secret).toBe(SECRETO_KIOSCO);
        expect(kioskJwtOptions(cfg).signOptions).toEqual(expect.objectContaining({ expiresIn: '365d' }));
        expect(cfg.getOrThrow).toHaveBeenCalledWith('KIOSK_JWT_SECRET');
        expect(cfg.getOrThrow).toHaveBeenCalledWith('JWT_SECRET');
        expect(() => jwt.verify(tokenKiosco, SECRETO_WEB)).toThrow();
        expect(() => jwt.verify(tokenMovil, SECRETO_KIOSCO)).toThrow();
    });

    it('un payload de kiosco no pasa las estrategias web ni móvil', async () => {
        const payload = jwt.decode(tokenKiosco) as { tipo: string; idKiosco: number; jti: string };
        await expect(web.validate(payload)).rejects.toBeInstanceOf(UnauthorizedException);
        await expect(movil.validate(payload as never)).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('un payload móvil no pasa la estrategia del kiosco', async () => {
        const payload = jwt.decode(tokenMovil);
        await expect(kiosco.validate(payload as never)).rejects.toBeInstanceOf(UnauthorizedException);
    });
});
