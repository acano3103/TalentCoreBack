jest.mock('src/prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));
jest.mock('src/modules/notifications/gateways/websockets.gateway', () => ({ WebsocketGateway: class WebsocketGateway {} }));

import { HttpStatus } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from 'src/prisma/prisma.service';
import { SesionKiosco } from 'src/modules/kiosks/kiosk-auth/kiosco-actual';
import { CommsAckService } from '../me/comms-ack.service';
import { KioskCommsService } from './kiosk-comms.service';
import { metodoDeChecada } from './metodo-kiosco';

const ahora = new Date('2026-11-14T18:00:00.000Z');
const kiosco: SesionKiosco = {
    tipo: 'KIOSCO',
    idKiosco: 7,
    idTenant: 3,
    idEmpresa: 10,
    codigo: 'K-1',
    nombre: 'Recepción',
    modalidad: 'FIJO',
    jti: 'jti',
};

function fila(id: number, minutos: number, extra: { esCorto?: boolean; estado?: string; canales?: string[]; acuse?: string }) {
    return {
        idComunicado: id,
        Estado: extra.estado ?? 'PENDIENTE',
        CanalesEfectivos: extra.canales ?? ['KIOSCO'],
        ComComunicados: {
            idComunicado: id,
            VersionActual: 1,
            EnviadoEn: new Date(ahora.getTime() - minutos * 60_000),
            AcuseModo: extra.acuse ?? 'LEI_ENTENDI',
            Prioridad: 'NORMAL',
            ComTiposComunicado: { EsCorto: extra.esCorto ?? false, Codigo: 'AVISO', Nombre: 'Aviso' },
        },
    };
}

describe('KioskCommsService', () => {
    const prisma = {
        empleados: { findFirst: jest.fn() },
        comDestinatarios: { findMany: jest.fn() },
        comComunicadoVersiones: { findMany: jest.fn() },
        registrosAsistencia: { findFirst: jest.fn() },
    };
    const ack = { confirmar: jest.fn() };
    let service: KioskCommsService;

    beforeEach(async () => {
        jest.clearAllMocks();
        prisma.empleados.findFirst.mockResolvedValue({ idEmpleado: 5 });
        ack.confirmar.mockResolvedValue({ confirmadoEn: ahora, version: 1, canal: 'KIOSCO' });
        const module = await Test.createTestingModule({
            providers: [
                KioskCommsService,
                { provide: PrismaService, useValue: prisma },
                { provide: CommsAckService, useValue: ack },
            ],
        }).compile();
        service = module.get(KioskCommsService);
        service.ahora = () => ahora;
    });

    it('muestra como máximo 3 avisos con canal KIOSCO, del más reciente al más antiguo', async () => {
        prisma.comDestinatarios.findMany.mockResolvedValue([
            fila(1, 50, { canales: ['APP', 'WEB'] }),
            fila(2, 10, { estado: 'CONFIRMADO', esCorto: false }),
            fila(3, 30, { esCorto: true, estado: 'CONFIRMADO', acuse: 'NINGUNO' }),
            fila(4, 5, {}),
            fila(5, 20, {}),
            fila(6, 40, {}),
        ]);
        prisma.comComunicadoVersiones.findMany.mockImplementation(async ({ where }: { where: { OR: { idComunicado: number }[] } }) =>
            where.OR.map((par) => ({
                idComunicado: par.idComunicado,
                NumVersion: 1,
                Titulo: `T${par.idComunicado}`,
                Resumen: 'r',
                CuerpoHtml: '<p>Aviso</p>',
            })),
        );
        const lista = await service.pendientes(kiosco, 5);
        expect(lista.map((item) => item.id)).toEqual([4, 5, 3]);
        expect(lista[2].esAviso).toBe(true);
        expect(lista[2].cuerpoTexto).toBe('Aviso');
    });

    it('solo acepta el acuse si la checada de ese empleado es de este kiosco y de los últimos 5 minutos', async () => {
        expect(metodoDeChecada('NUMERO')).toBe('KIOSCO_PIN');
        expect(metodoDeChecada('ROSTRO')).toBe('KIOSCO_BIOMETRICO');
        prisma.registrosAsistencia.findFirst.mockResolvedValue({
            idEmpleado: 5,
            idKiosco: 7,
            idEmpresa: 10,
            idTenant: 3,
            fechaHoraRegistro: new Date(ahora.getTime() - 6 * 60_000),
            metodoIdentificacion: 'NUMERO',
            zonaHoraria: 'America/Mexico_City',
        });
        await expect(service.acusar(kiosco, 9, { idEmpleado: 5, idRegistroAsistencia: 100 }, { ip: null, userAgent: null })).rejects.toMatchObject({
            status: HttpStatus.CONFLICT,
        });
        expect(ack.confirmar).not.toHaveBeenCalled();

        prisma.registrosAsistencia.findFirst.mockResolvedValue({
            idEmpleado: 5,
            idKiosco: 8,
            idEmpresa: 10,
            idTenant: 3,
            fechaHoraRegistro: new Date(ahora.getTime() - 60_000),
            metodoIdentificacion: 'NUMERO',
            zonaHoraria: null,
        });
        await expect(service.acusar(kiosco, 9, { idEmpleado: 5, idRegistroAsistencia: 100 }, { ip: null, userAgent: null })).rejects.toMatchObject({
            status: HttpStatus.CONFLICT,
        });

        prisma.registrosAsistencia.findFirst.mockResolvedValue({
            idEmpleado: 5,
            idKiosco: 7,
            idEmpresa: 10,
            idTenant: 3,
            fechaHoraRegistro: new Date(ahora.getTime() - 60_000),
            metodoIdentificacion: 'NUMERO',
            zonaHoraria: 'America/Mexico_City',
        });
        await service.acusar(kiosco, 9, { idEmpleado: 5, idRegistroAsistencia: 100 }, { ip: '10.0.0.3', userAgent: 'kiosco' });
        expect(ack.confirmar).toHaveBeenCalledWith(
            expect.objectContaining({ canal: 'KIOSCO', metodo: 'KIOSCO_PIN', idEmpleado: 5, idComunicado: 9 }),
        );
    });
});
