jest.mock('src/prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));
jest.mock('src/modules/notifications/gateways/websockets.gateway', () => ({ WebsocketGateway: class WebsocketGateway {} }));

import { HttpException, HttpStatus } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from 'generated/prisma/client';
import { WebsocketGateway } from 'src/modules/notifications/gateways/websockets.gateway';
import { PrismaService } from 'src/prisma/prisma.service';
import { CommsAckService } from './comms-ack.service';

const ahora = new Date('2026-11-14T18:00:00.000Z');

function comunicado(extra: Record<string, unknown> = {}) {
    return {
        idComunicado: 9,
        idEmpresa: 10,
        idTenant: 3,
        Estado: 'ENVIADO',
        AcuseModo: 'LEI_ENTENDI',
        VigenteHasta: null,
        VersionActual: 1,
        CreadoPor: 'publicador',
        TotalDestinatarios: 4,
        ...extra,
    };
}

function destinatario(estado = 'PENDIENTE', extra: Record<string, unknown> = {}) {
    return {
        idDestinatario: 20,
        idComunicado: 9,
        idEmpleado: 5,
        Estado: estado,
        ConfirmadoEn: estado === 'CONFIRMADO' ? ahora : null,
        VersionConfirmada: estado === 'CONFIRMADO' ? 1 : null,
        ComComunicados: comunicado(),
        ...extra,
    };
}

describe('CommsAckService', () => {
    const prisma = {
        $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma)),
        comDestinatarios: { findFirst: jest.fn(), update: jest.fn(), count: jest.fn() },
        comComunicadoVersiones: { findUnique: jest.fn() },
        comAcuses: { findFirst: jest.fn(), create: jest.fn() },
    };
    const gateway = { sendNotificationToUser: jest.fn() };
    let service: CommsAckService;

    beforeEach(async () => {
        jest.clearAllMocks();
        prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma));
        prisma.comComunicadoVersiones.findUnique.mockResolvedValue({ idVersion: 4, NumVersion: 1 });
        prisma.comAcuses.findFirst.mockResolvedValue(null);
        prisma.comAcuses.create.mockResolvedValue({ FechaUtc: ahora, Canal: 'WEB' });
        prisma.comDestinatarios.update.mockResolvedValue({});
        prisma.comDestinatarios.count.mockResolvedValue(2);
        const module = await Test.createTestingModule({
            providers: [
                CommsAckService,
                { provide: PrismaService, useValue: prisma },
                { provide: WebsocketGateway, useValue: gateway },
            ],
        }).compile();
        service = module.get(CommsAckService);
        service.ahora = () => ahora;
    });

    const entrada = {
        companyId: 10,
        idTenant: 3,
        idComunicado: 9,
        idEmpleado: 5,
        canal: 'WEB' as const,
        metodo: 'SESION',
        ip: '10.0.0.4',
        userAgent: 'jest',
        dispositivo: null,
        zonaHoraria: 'America/Mexico_City',
    };

    it('confirma la versión vigente, actualiza al destinatario y avisa al publicador', async () => {
        prisma.comDestinatarios.findFirst.mockResolvedValue(destinatario());
        const resultado = await service.confirmar(entrada);
        expect(resultado).toEqual({ confirmadoEn: ahora, version: 1, canal: 'WEB' });
        expect(prisma.comAcuses.create).toHaveBeenCalledWith({
            data: expect.objectContaining({ idVersion: 4, idDestinatario: 20, Canal: 'WEB', Metodo: 'SESION' }),
        });
        expect(prisma.comDestinatarios.update).toHaveBeenCalledWith({
            where: { idDestinatario: 20 },
            data: { Estado: 'CONFIRMADO', ConfirmadoEn: ahora, VersionConfirmada: 1 },
        });
        expect(gateway.sendNotificationToUser).toHaveBeenCalledWith('publicador', 'comms:ack', {
            idComunicado: 9,
            confirmados: 2,
            total: 4,
            version: 1,
        });
    });

    it('un segundo acuse de la misma versión no crea otra evidencia ni vuelve a emitir', async () => {
        prisma.comDestinatarios.findFirst.mockResolvedValue(destinatario('CONFIRMADO'));
        prisma.comAcuses.findFirst.mockResolvedValue({ FechaUtc: ahora, Canal: 'APP' });
        const resultado = await service.confirmar({ ...entrada, canal: 'WEB' });
        expect(resultado).toEqual({ confirmadoEn: ahora, version: 1, canal: 'APP' });
        expect(prisma.comAcuses.create).not.toHaveBeenCalled();
        expect(prisma.comDestinatarios.update).not.toHaveBeenCalled();
        expect(gateway.sendNotificationToUser).not.toHaveBeenCalled();
    });

    it('si dos confirmaciones chocan, responde la que ya quedó guardada', async () => {
        prisma.comDestinatarios.findFirst.mockResolvedValue(destinatario());
        prisma.comAcuses.create.mockRejectedValue(
            new Prisma.PrismaClientKnownRequestError('Unique', { code: 'P2002', clientVersion: 'test' }),
        );
        prisma.comAcuses.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ FechaUtc: ahora, Canal: 'KIOSCO' });
        await expect(service.confirmar(entrada)).resolves.toEqual({ confirmadoEn: ahora, version: 1, canal: 'KIOSCO' });
        expect(gateway.sendNotificationToUser).not.toHaveBeenCalled();
    });

    it('no confirma si no hay destinatario, si no pide acuse o si la versión no es la vigente', async () => {
        prisma.comDestinatarios.findFirst.mockResolvedValue(null);
        await expect(service.confirmar(entrada)).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });

        prisma.comDestinatarios.findFirst.mockResolvedValue(destinatario('PENDIENTE', { ComComunicados: comunicado({ AcuseModo: 'NINGUNO' }) }));
        await expect(codigo(service.confirmar(entrada))).resolves.toBe('ACUSE_NO_REQUERIDO');

        prisma.comDestinatarios.findFirst.mockResolvedValue(destinatario('PENDIENTE', { ComComunicados: comunicado({ Estado: 'ARCHIVADO' }) }));
        await expect(codigo(service.confirmar(entrada))).resolves.toBe('ESTADO_INVALIDO');

        prisma.comDestinatarios.findFirst.mockResolvedValue(destinatario());
        prisma.comComunicadoVersiones.findUnique.mockResolvedValue({ idVersion: 8, NumVersion: 1 });
        prisma.comDestinatarios.findFirst.mockResolvedValue(destinatario('PENDIENTE', { ComComunicados: comunicado({ VersionActual: 2 }) }));
        await expect(codigo(service.confirmar(entrada))).resolves.toBe('ESTADO_INVALIDO');
        expect(prisma.comAcuses.create).not.toHaveBeenCalled();
    });
});

async function codigo(promesa: Promise<unknown>): Promise<string> {
    try {
        await promesa;
        return '';
    } catch (error) {
        return (error as HttpException).getResponse()['code'] as string;
    }
}
