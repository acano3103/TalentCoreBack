jest.mock('src/prisma/prisma.service', () => ({
    PrismaService: class PrismaService {},
}));

jest.mock('fs', () => {
    const actual = jest.requireActual<typeof import('fs')>('fs');
    return {
        ...actual,
        existsSync: jest.fn(() => false),
        statSync: jest.fn(() => ({ size: 4 })),
        createReadStream: jest.fn(() => ({})),
    };
});

import { NotFoundException, StreamableFile } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { existsSync } from 'fs';
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

describe('MediaService fotos de asistencia', () => {
    let service: MediaService;
    let prisma: {
        catEmpresas: { findFirst: jest.Mock };
        catTenants: { findUnique: jest.Mock };
    };
    const res = { set: jest.fn() } as unknown as Response;

    beforeEach(() => {
        prisma = {
            catEmpresas: { findFirst: jest.fn() },
            catTenants: { findUnique: jest.fn() },
        };
        (existsSync as jest.Mock).mockReset();
        (existsSync as jest.Mock).mockReturnValue(false);
        service = new MediaService(
            { get: jest.fn(() => undefined) } as unknown as ConfigService,
            prisma as unknown as PrismaService,
        );
    });

    function tenantAcme() {
        prisma.catTenants.findUnique.mockResolvedValue({ slug: 'acme' });
    }

    it('responde 404 si la foto de kiosco es de otro tenant', async () => {
        tenantAcme();

        await expect(
            service.getPrivateFileGeneric('otro/attendance/kiosk/1/2026/11/foto.jpg', res, user),
        ).rejects.toBeInstanceOf(NotFoundException);

        expect(prisma.catTenants.findUnique).toHaveBeenCalledWith({
            where: { idTenant: 3 },
            select: { slug: true },
        });
        expect(prisma.catEmpresas.findFirst).not.toHaveBeenCalled();
        expect(existsSync).not.toHaveBeenCalled();
    });

    it('responde 404 si la empresa no pertenece al tenant', async () => {
        tenantAcme();
        prisma.catEmpresas.findFirst.mockResolvedValue(null);

        await expect(
            service.getPrivateFileGeneric('acme/attendance/kiosk/9/2026/11/foto.jpg', res, user),
        ).rejects.toBeInstanceOf(NotFoundException);

        expect(prisma.catEmpresas.findFirst).toHaveBeenCalledWith({
            where: { idEmpresa: 9, idTenant: 3 },
            select: { idEmpresa: true },
        });
    });

    it('deja pasar la foto de kiosco del mismo tenant', async () => {
        tenantAcme();
        prisma.catEmpresas.findFirst.mockResolvedValue({ idEmpresa: 1 });
        (existsSync as jest.Mock).mockReturnValue(true);

        const archivo = await service.getPrivateFileGeneric(
            'acme/attendance/kiosk/1/2026/11/foto.jpg',
            res,
            user,
        );

        expect(archivo).toBeInstanceOf(StreamableFile);
        expect(prisma.catEmpresas.findFirst).toHaveBeenCalledWith({
            where: { idEmpresa: 1, idTenant: 3 },
            select: { idEmpresa: true },
        });
    });

    it('exige el tenant acme y la empresa 1 en la app y en el kiosco', async () => {
        tenantAcme();
        prisma.catEmpresas.findFirst.mockResolvedValue({ idEmpresa: 1 });
        (existsSync as jest.Mock).mockReturnValue(true);

        await service.getPrivateFileGeneric('acme/attendance/1/2026/11/a.jpg', res, user);
        await service.getPrivateFileGeneric('acme/attendance/kiosk/1/2026/11/a.jpg', res, user);

        expect(prisma.catTenants.findUnique).toHaveBeenCalledTimes(2);
        expect(prisma.catEmpresas.findFirst).toHaveBeenNthCalledWith(1, {
            where: { idEmpresa: 1, idTenant: 3 },
            select: { idEmpresa: true },
        });
        expect(prisma.catEmpresas.findFirst).toHaveBeenNthCalledWith(2, {
            where: { idEmpresa: 1, idTenant: 3 },
            select: { idEmpresa: true },
        });
    });

    it('no consulta el tenant en rutas que no son de asistencia', async () => {
        await expect(
            service.getPrivateFileGeneric('documents/contrato.pdf', res, user),
        ).rejects.toBeInstanceOf(NotFoundException);

        expect(prisma.catTenants.findUnique).not.toHaveBeenCalled();
        expect(prisma.catEmpresas.findFirst).not.toHaveBeenCalled();
    });

    it('ya no trata como evidencia de asistencia la ruta vieja sin slug', async () => {
        await expect(
            service.getPrivateFileGeneric('attendance/kiosk/9/2026/11/foto.jpg', res, user),
        ).rejects.toBeInstanceOf(NotFoundException);

        expect(prisma.catTenants.findUnique).not.toHaveBeenCalled();
        expect(prisma.catEmpresas.findFirst).not.toHaveBeenCalled();
    });

    it('responde 404 si la ruta del kiosco se sale de la carpeta de la empresa', async () => {
        tenantAcme();
        prisma.catEmpresas.findFirst.mockResolvedValue({ idEmpresa: 9 });

        await expect(
            service.getPrivateFileGeneric('acme/attendance/kiosk/9/../../otra/foto.jpg', res, user),
        ).rejects.toBeInstanceOf(NotFoundException);

        expect(existsSync).not.toHaveBeenCalled();
    });
});
