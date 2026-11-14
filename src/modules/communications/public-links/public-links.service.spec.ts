jest.mock('src/prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));
jest.mock('src/modules/notifications/gateways/websockets.gateway', () => ({ WebsocketGateway: class WebsocketGateway {} }));

import { HttpException, HttpStatus } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { PrismaService } from 'src/prisma/prisma.service';
import { CommsStorageService } from '../announcements/comms-storage.service';
import { CommsAckService } from '../me/comms-ack.service';
import { fechasCoinciden } from './fecha-nacimiento';
import { PublicLinksService } from './public-links.service';

const ahora = new Date('2026-11-14T18:00:00.000Z');
const nacimiento = new Date('1990-05-20T00:00:00.000Z');

function grafico(extra: { Intentos?: number; BloqueadoHasta?: Date | null; ExpiraEn?: Date; RequiereIdentidad?: boolean } = {}) {
    return {
        idEnlace: 4,
        ExpiraEn: extra.ExpiraEn ?? new Date('2026-11-20T00:00:00.000Z'),
        Intentos: extra.Intentos ?? 0,
        BloqueadoHasta: extra.BloqueadoHasta ?? null,
        ComDestinatarios: {
            idDestinatario: 20,
            idEmpleado: 5,
            Estado: 'PENDIENTE',
            VersionConfirmada: null,
            Empleados: { idEmpleado: 5, fechaNacimiento: nacimiento, idSite: null },
            ComComunicados: {
                idComunicado: 9,
                idEmpresa: 10,
                idTenant: 3,
                Estado: 'ENVIADO',
                VigenteHasta: null,
                VersionActual: 1,
                RequiereIdentidad: extra.RequiereIdentidad ?? true,
                AcuseModo: 'LEI_ENTENDI',
                Prioridad: 'IMPORTANTE',
                CatEmpresas: { nombre_comercial: 'Acme' },
            },
        },
    };
}

describe('PublicLinksService', () => {
    const estado = { Intentos: 0, BloqueadoHasta: null as Date | null };
    const prisma = {
        comEnlacesSeguros: { findUnique: jest.fn(), update: jest.fn() },
        comComunicadoVersiones: { findUnique: jest.fn() },
        comComunicadoAdjuntos: { findMany: jest.fn() },
        catSites: { findUnique: jest.fn() },
    };
    const jwt = { sign: jest.fn(() => 'jwt-corto'), verify: jest.fn(() => ({ sub: '4' })) };
    const ack = { confirmar: jest.fn() };
    let service: PublicLinksService;

    beforeEach(async () => {
        jest.clearAllMocks();
        estado.Intentos = 0;
        estado.BloqueadoHasta = null;
        prisma.comEnlacesSeguros.findUnique.mockImplementation(async () => grafico(estado));
        prisma.comEnlacesSeguros.update.mockImplementation(async ({ data }: { data: { Intentos?: number; BloqueadoHasta?: Date | null } }) => {
            if (typeof data.Intentos === 'number') estado.Intentos = data.Intentos;
            if ('BloqueadoHasta' in data) estado.BloqueadoHasta = data.BloqueadoHasta ?? null;
            return {};
        });
        prisma.comComunicadoVersiones.findUnique.mockResolvedValue({
            idVersion: 4,
            NumVersion: 1,
            Titulo: 'Política',
            Resumen: 'Léela',
            CuerpoHtml: '<p>Texto</p>',
            PortadaRuta: null,
        });
        prisma.comComunicadoAdjuntos.findMany.mockResolvedValue([]);
        prisma.catSites.findUnique.mockResolvedValue(null);
        ack.confirmar.mockResolvedValue({ confirmadoEn: ahora, version: 1, canal: 'ENLACE' });
        const module = await Test.createTestingModule({
            providers: [
                PublicLinksService,
                { provide: PrismaService, useValue: prisma },
                { provide: JwtService, useValue: jwt },
                { provide: CommsAckService, useValue: ack },
                { provide: CommsStorageService, useValue: { signedUrl: jest.fn(() => '/firmado') } },
            ],
        }).compile();
        service = module.get(PublicLinksService);
        service.ahora = () => ahora;
    });

    it('un token desconocido es inválido y uno vencido expiró', async () => {
        prisma.comEnlacesSeguros.findUnique.mockResolvedValueOnce(null);
        await expect(codigo(service.metadatos('no-existe'))).resolves.toEqual({ status: HttpStatus.NOT_FOUND, code: 'ENLACE_INVALIDO' });

        prisma.comEnlacesSeguros.findUnique.mockResolvedValueOnce(grafico({ ExpiraEn: new Date('2026-11-01T00:00:00.000Z') }));
        await expect(codigo(service.metadatos('viejo'))).resolves.toEqual({ status: HttpStatus.GONE, code: 'ENLACE_EXPIRADO' });
    });

    it('tres fechas incorrectas bloquean el enlace media hora', async () => {
        expect(fechasCoinciden(nacimiento, '1990-05-20')).toBe(true);
        for (let restante = 2; restante >= 0; restante -= 1) {
            await expect(codigo(service.verificar('token', '1990-01-01'))).resolves.toMatchObject({
                status: HttpStatus.BAD_REQUEST,
                code: 'IDENTIDAD_NO_VALIDA',
                detail: { intentosRestantes: restante },
            });
        }
        expect(estado.BloqueadoHasta?.toISOString()).toBe(new Date(ahora.getTime() + 30 * 60 * 1000).toISOString());
        await expect(codigo(service.verificar('token', '1990-05-20'))).resolves.toMatchObject({
            status: HttpStatus.LOCKED,
            code: 'ENLACE_BLOQUEADO',
        });
        expect(jwt.sign).not.toHaveBeenCalled();
    });

    it('la fecha correcta entrega un JWT corto y el contenido lo exige', async () => {
        estado.Intentos = 0;
        estado.BloqueadoHasta = null;
        const acceso = await service.verificar('token', '1990-05-20');
        expect(acceso.token).toBe('jwt-corto');
        expect(jwt.sign).toHaveBeenCalledWith(
            expect.objectContaining({ tipo: 'comms-link', idComunicado: 9 }),
            expect.objectContaining({ audience: 'comms-link', subject: '4', expiresIn: '15m' }),
        );
        await expect(service.contenido('token')).rejects.toBeInstanceOf(HttpException);
        jwt.verify.mockReturnValueOnce({ sub: '99' });
        await expect(codigo(service.contenido('token', 'Bearer otro'))).resolves.toMatchObject({ status: HttpStatus.UNAUTHORIZED });
        const cuerpo = await service.contenido('token', 'Bearer jwt-corto');
        expect(cuerpo.cuerpoTexto).toBe('Texto');
        expect(cuerpo).not.toHaveProperty('fechaNacimiento');
    });

    it('el acuse del enlace usa ENLACE_FECHA_NAC cuando pidió identidad', async () => {
        await service.acusar('token', { ip: '10.0.0.1', userAgent: 'navegador', autorizacion: 'Bearer jwt-corto' });
        expect(ack.confirmar).toHaveBeenCalledWith(expect.objectContaining({ canal: 'ENLACE', metodo: 'ENLACE_FECHA_NAC', idEmpleado: 5 }));
    });
});

async function codigo(promesa: Promise<unknown>): Promise<{ status: number; code: string; detail?: unknown }> {
    try {
        await promesa;
        return { status: 0, code: '' };
    } catch (error) {
        const http = error as HttpException;
        const body = http.getResponse() as { code: string; detail?: unknown };
        return { status: http.getStatus(), code: body.code, detail: body.detail };
    }
}
