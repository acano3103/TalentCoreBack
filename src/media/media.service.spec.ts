jest.mock('src/prisma/prisma.service', () => ({
    PrismaService: class PrismaService {},
}));

import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { ActiveUserDto } from 'src/modules/auth/dto/active-user.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { MediaService } from './media.service';

const user: ActiveUserDto = {
    id: 1,
    uuid: 'user-uuid',
    idTenant: 3,
    username: 'ana',
    first_name: 'Ana',
    last_name: 'López',
};

describe('MediaService fotos de kiosco', () => {
    let service: MediaService;
    let prisma: { catEmpresas: { findFirst: jest.Mock } };
    const res = { set: jest.fn() } as unknown as Response;

    beforeEach(() => {
        prisma = { catEmpresas: { findFirst: jest.fn() } };
        service = new MediaService(
            { get: jest.fn(() => undefined) } as unknown as ConfigService,
            prisma as unknown as PrismaService,
        );
    });

    it('responde 404 si la empresa de la foto no pertenece al tenant', async () => {
        prisma.catEmpresas.findFirst.mockResolvedValue(null);

        await expect(
            service.getPrivateFileGeneric('attendance/kiosk/9/2026/11/foto.jpg', res, user),
        ).rejects.toBeInstanceOf(NotFoundException);

        expect(prisma.catEmpresas.findFirst).toHaveBeenCalledWith({
            where: { idEmpresa: 9, idTenant: 3 },
            select: { idEmpresa: true },
        });
    });

    it('no consulta la empresa en rutas que no son del kiosco', async () => {
        await expect(
            service.getPrivateFileGeneric('documents/contrato.pdf', res, user),
        ).rejects.toBeInstanceOf(NotFoundException);

        expect(prisma.catEmpresas.findFirst).not.toHaveBeenCalled();
    });

    it('responde 404 si la ruta del kiosco se sale de la carpeta de la empresa', async () => {
        prisma.catEmpresas.findFirst.mockResolvedValue({ idEmpresa: 9 });

        await expect(
            service.getPrivateFileGeneric('attendance/kiosk/9/../../otra/foto.jpg', res, user),
        ).rejects.toBeInstanceOf(NotFoundException);
    });
});
