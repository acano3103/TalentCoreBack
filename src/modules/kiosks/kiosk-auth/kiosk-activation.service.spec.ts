jest.mock('src/prisma/prisma.service', () => ({
    PrismaService: class PrismaService {},
}));

import { createHash } from 'crypto';
import { HttpException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from 'generated/prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { KioskAuthController } from './kiosk-auth.controller';
import { KioskActivationService } from './kiosk-activation.service';
import { KioskActivationRateLimiter } from './kiosk-activation-rate-limiter';
import { ActivateKioskDto } from './dto/activate-kiosk.dto';

const CODIGO = '7A92F4B18C23D5E6A1B09C4D8F2E6A10';
const HASH = createHash('sha256').update(CODIGO).digest('hex');

function dto(parcial: Partial<ActivateKioskDto> = {}): ActivateKioskDto {
    return {
        codigo: `7a92 f4b1-8c23d5e6a1b09c4d8f2e6a10`,
        identificadorDispositivo: 'tablet-1',
        plataforma: 'android',
        modelo: 'Tab A',
        versionApp: '0.1.0',
        ...parcial,
    };
}

function codigoFila(parcial: Record<string, unknown> = {}) {
    return {
        idCodigo: 4,
        expiraEn: new Date(Date.now() + 60 * 60 * 1000),
        usadoEn: null,
        invalidadoEn: null,
        intentosFallidos: 0,
        KioscosAsistencia: {
            idKiosco: 5,
            idTenant: 3,
            idEmpresa: 9,
            codigo: 'KSK-A82F91C4',
            nombre: 'Recepción',
            modalidad: 'FIJO',
            estatus: 'PENDIENTE_ACTIVACION',
            idEmpleadoResponsable: 8,
        },
        ...parcial,
    };
}

function cuerpo(error: unknown): { status: number; body: Record<string, unknown> } {
    expect(error).toBeInstanceOf(HttpException);
    const http = error as HttpException;
    return { status: http.getStatus(), body: http.getResponse() as Record<string, unknown> };
}

describe('KioskActivationService', () => {
    let service: KioskActivationService;
    let limiter: KioskActivationRateLimiter;
    let jwt: { sign: jest.Mock };
    let prisma: {
        kioscoCodigosActivacion: { findUnique: jest.Mock; update: jest.Mock };
        kioscosAsistencia: { findFirst: jest.Mock };
        $transaction: jest.Mock;
    };
    let tx: {
        kioscoCodigosActivacion: { updateMany: jest.Mock };
        kioscosAsistencia: { update: jest.Mock };
        kioscoSites: { findMany: jest.Mock };
        catEmpresas: { findUnique: jest.Mock };
        empleados: { findUnique: jest.Mock };
        auth_user: { findUnique: jest.Mock; findFirst: jest.Mock };
        historicoMovimientos: { create: jest.Mock };
    };

    beforeEach(() => {
        tx = {
            kioscoCodigosActivacion: { updateMany: jest.fn(async () => ({ count: 1 })) },
            kioscosAsistencia: { update: jest.fn(async () => ({})) },
            kioscoSites: {
                findMany: jest.fn(async () => [
                    {
                        idSite: 10,
                        CatSites: { Descripcion: 'Planta', zonaHoraria: 'America/Mexico_City' },
                    },
                ]),
            },
            catEmpresas: {
                findUnique: jest.fn(async () => ({
                    idEmpresa: 9,
                    nombre_comercial: 'DataVoice',
                    razon_social: 'DataVoice SA',
                })),
            },
            empleados: { findUnique: jest.fn(async () => ({ idUsuario: 'uuid-resp' })) },
            auth_user: {
                findUnique: jest.fn(async () => ({ id: 15 })),
                findFirst: jest.fn(),
            },
            historicoMovimientos: { create: jest.fn(async () => ({})) },
        };

        prisma = {
            kioscoCodigosActivacion: {
                findUnique: jest.fn(async () => codigoFila()),
                update: jest.fn(),
            },
            kioscosAsistencia: { findFirst: jest.fn(async () => null) },
            $transaction: jest.fn(async (trabajo: (cliente: typeof tx) => Promise<unknown>) => trabajo(tx)),
        };

        jwt = { sign: jest.fn(() => 'token-kiosco') };
        limiter = new KioskActivationRateLimiter();
        service = new KioskActivationService(
            prisma as unknown as PrismaService,
            jwt as unknown as JwtService,
            limiter,
        );
    });

    it('activa un kiosco fijo y devuelve el token sin guardar el código en claro', async () => {
        const result = await service.activate(dto(), '10.0.0.1');

        expect(prisma.kioscoCodigosActivacion.findUnique).toHaveBeenCalledWith(
            expect.objectContaining({ where: { codigoHash: HASH } }),
        );
        expect(tx.kioscoCodigosActivacion.updateMany).toHaveBeenCalledWith({
            where: { idCodigo: 4, usadoEn: null, invalidadoEn: null },
            data: { usadoEn: expect.any(Date) },
        });
        expect(tx.kioscosAsistencia.update).toHaveBeenCalledWith({
            where: { idKiosco: 5 },
            data: expect.objectContaining({
                identificadorDispositivo: 'tablet-1',
                plataforma: 'android',
                modelo: 'Tab A',
                versionApp: '0.1.0',
                estatus: 'ACTIVO',
                fechaActivacion: expect.any(Date),
                tokenJti: expect.any(String),
            }),
        });

        const firmado = jwt.sign.mock.calls[0][0];
        expect(firmado).toEqual(expect.objectContaining({
            tipo: 'KIOSCO',
            idKiosco: 5,
            idTenant: 3,
            idEmpresa: 9,
        }));
        expect(jwt.sign.mock.calls[0][1]).toEqual(expect.objectContaining({ expiresIn: '365d' }));
        expect(tx.kioscosAsistencia.update.mock.calls[0][0].data.tokenJti).toBe(firmado.jti);
        expect(tx.historicoMovimientos.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                accion: 'ACTIVAR',
                tablaOrigen: 'KioscosAsistencia',
                idRegistro: '5',
                idEmpresa: 9,
                idUsuario: 15,
            }),
        });
        expect(JSON.stringify(tx.historicoMovimientos.create.mock.calls[0][0])).not.toContain(CODIGO);

        expect(result).toEqual({
            token: 'token-kiosco',
            kiosco: {
                idKiosco: 5,
                codigo: 'KSK-A82F91C4',
                nombre: 'Recepción',
                modalidad: 'FIJO',
            },
            empresa: { idEmpresa: 9, nombre: 'DataVoice' },
            sites: [{ idSite: 10, nombre: 'Planta', zonaHoraria: 'America/Mexico_City' }],
        });
    });

    it('rechaza un código vencido sin consumirlo', async () => {
        prisma.kioscoCodigosActivacion.findUnique.mockResolvedValue(codigoFila({
            expiraEn: new Date(Date.now() - 1000),
        }));
        prisma.kioscoCodigosActivacion.update.mockResolvedValue({ intentosFallidos: 1 });

        const error = await service.activate(dto(), '10.0.0.2').catch((e) => e);
        const respuesta = cuerpo(error);

        expect(respuesta.status).toBe(400);
        expect(respuesta.body.code).toBe('CODIGO_EXPIRADO');
        expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rechaza un código ya usado', async () => {
        prisma.kioscoCodigosActivacion.findUnique.mockResolvedValue(codigoFila({
            usadoEn: new Date(),
        }));
        prisma.kioscoCodigosActivacion.update.mockResolvedValue({ intentosFallidos: 1 });

        const error = await service.activate(dto(), '10.0.0.3').catch((e) => e);

        expect(cuerpo(error).body.code).toBe('CODIGO_INVALIDO');
        expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rechaza un código invalidado por regeneración', async () => {
        prisma.kioscoCodigosActivacion.findUnique.mockResolvedValue(codigoFila({
            invalidadoEn: new Date(),
        }));
        prisma.kioscoCodigosActivacion.update.mockResolvedValue({ intentosFallidos: 1 });

        const error = await service.activate(dto(), '10.0.0.4').catch((e) => e);

        expect(cuerpo(error).body.code).toBe('CODIGO_INVALIDO');
        expect(tx.kioscoCodigosActivacion.updateMany).not.toHaveBeenCalled();
    });

    it('bloquea el código al quinto fallo y no lo consume', async () => {
        let intentos = 0;
        prisma.kioscoCodigosActivacion.findUnique.mockImplementation(async () => codigoFila({
            expiraEn: new Date(Date.now() - 1000),
            intentosFallidos: intentos,
        }));
        prisma.kioscoCodigosActivacion.update.mockImplementation(async () => {
            intentos += 1;
            return { intentosFallidos: intentos };
        });

        for (let i = 0; i < 4; i++) {
            const error = await service.activate(dto(), '10.0.0.5').catch((e) => e);
            expect(cuerpo(error).body.code).toBe('CODIGO_EXPIRADO');
        }

        const quinto = await service.activate(dto(), '10.0.0.5').catch((e) => e);
        expect(cuerpo(quinto)).toMatchObject({
            status: 400,
            body: { code: 'CODIGO_BLOQUEADO' },
        });
        expect(intentos).toBe(5);
        expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('responde 429 al undécimo fallo de la misma IP', async () => {
        prisma.kioscoCodigosActivacion.findUnique.mockResolvedValue(null);
        const cuerpoDto = dto({ codigo: 'FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF' });

        for (let i = 0; i < 10; i++) {
            const error = await service.activate(cuerpoDto, '10.8.8.8').catch((e) => e);
            expect(cuerpo(error).body.code).toBe('CODIGO_INVALIDO');
        }

        expect(prisma.kioscoCodigosActivacion.findUnique).toHaveBeenCalledTimes(10);
        const bloqueo = await service.activate(cuerpoDto, '10.8.8.8').catch((e) => e);
        expect(cuerpo(bloqueo).status).toBe(429);
        expect(prisma.kioscoCodigosActivacion.findUnique).toHaveBeenCalledTimes(10);

        const otraRed = await service.activate(cuerpoDto, '10.9.9.9').catch((e) => e);
        expect(cuerpo(otraRed).body.code).toBe('CODIGO_INVALIDO');
    });

    it('no consume el código si la modalidad es cuadrilla', async () => {
        prisma.kioscoCodigosActivacion.findUnique.mockResolvedValue(codigoFila({
            KioscosAsistencia: {
                ...codigoFila().KioscosAsistencia,
                modalidad: 'CUADRILLA',
            },
        }));

        const error = await service.activate(dto(), '10.0.0.6').catch((e) => e);

        expect(cuerpo(error)).toEqual({
            status: 409,
            body: {
                code: 'MODALIDAD_NO_DISPONIBLE',
                message: 'La modalidad cuadrilla todavía no está disponible en la app.',
            },
        });
        expect(prisma.kioscoCodigosActivacion.update).not.toHaveBeenCalled();
        expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rechaza un equipo que ya está activado como otro kiosco', async () => {
        prisma.kioscosAsistencia.findFirst.mockResolvedValue({ idKiosco: 99 });

        const error = await service.activate(dto(), '10.0.0.7').catch((e) => e);

        expect(cuerpo(error)).toEqual({
            status: 409,
            body: {
                code: 'EQUIPO_YA_ACTIVADO',
                message: 'Este equipo ya está activado como otro kiosco.',
            },
        });
        expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('traduce el conflicto único del identificador al mismo mensaje', async () => {
        prisma.$transaction.mockRejectedValue(new Prisma.PrismaClientKnownRequestError(
            'Unique',
            { code: 'P2002', clientVersion: 'test', meta: { target: ['identificadorDispositivo'] } },
        ));

        const error = await service.activate(dto(), '10.0.0.8').catch((e) => e);

        expect(cuerpo(error).body).toEqual({
            code: 'EQUIPO_YA_ACTIVADO',
            message: 'Este equipo ya está activado como otro kiosco.',
        });
    });
});

describe('KioskAuthController', () => {
    it('deja la activación sin guard de usuario', () => {
        expect(Reflect.getMetadata(GUARDS_METADATA, KioskAuthController) ?? []).toEqual([]);
        expect(Reflect.getMetadata(GUARDS_METADATA, KioskAuthController.prototype.activate) ?? []).toEqual([]);
    });
});
