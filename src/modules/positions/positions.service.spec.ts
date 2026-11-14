jest.mock('src/prisma/prisma.service', () => ({
    PrismaService: class PrismaService {},
}));

import { HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { ExcelExportService } from 'src/common/services/excel-export.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { ActiveUserDto } from '../auth/dto/active-user.dto';
import { IntegrationsFactory } from '../integrations/providers/factory.service';
import { NotificationDispatcher } from '../notifications/notification.dispatcher';
import { CreatePositionDto } from './dto/create-position.dto';
import { PositionsService } from './positions.service';

describe('PositionsService clasificación', () => {
    const user = {
        id: 1,
        idTenant: 8,
        uuid: 'uuid',
        username: 'ana',
        first_name: 'Ana',
        last_name: 'Lopez',
    } as ActiveUserDto;

    const dtoBase = (): CreatePositionDto => ({
        idTipoPersonal: 5,
        generalInfo: {
            nombrePuesto: ' Cajero ',
            idArea: '1',
            idTipoPuesto: '2',
            idModalidad: '3',
            idNivelEstudios: '4',
            idNivelSalario: '6',
            idTipoContratacion: '7',
        },
        languages: {
            description: 'Atiende caja',
            idJefeInmediato: '',
        },
    });

    function tabla() {
        return {
            findFirst: jest.fn(),
            findMany: jest.fn().mockResolvedValue([]),
            create: jest.fn().mockResolvedValue({}),
            createMany: jest.fn().mockResolvedValue({ count: 0 }),
            update: jest.fn().mockResolvedValue({}),
            deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        };
    }

    const tx = {
        catPuestos: tabla(),
        catTiposPersonal: tabla(),
        catEtiquetasPuesto: tabla(),
        relPuestoEtiqueta: tabla(),
        idiomasPuesto: tabla(),
        horariosPuesto: tabla(),
        documentosPuesto: tabla(),
        funcionesPuesto: tabla(),
        competenciasPuesto: tabla(),
        habilidadesPuesto: tabla(),
        relPuestoCurso: tabla(),
        historicoMovimientos: tabla(),
    };

    const prisma = {
        auth_user: { findFirst: jest.fn() },
        $transaction: jest.fn(async (fn: (cliente: typeof tx) => Promise<unknown>) => fn(tx)),
    };

    let service: PositionsService;

    beforeEach(async () => {
        jest.clearAllMocks();
        prisma.auth_user.findFirst.mockResolvedValue({ uuid: 'user-uuid' });
        prisma.$transaction.mockImplementation(async (fn: (cliente: typeof tx) => Promise<unknown>) => fn(tx));
        tx.catPuestos.create.mockResolvedValue({ idPuesto: 44 });
        tx.catPuestos.findFirst.mockResolvedValue({ idPuesto: 44 });
        tx.catTiposPersonal.findFirst.mockResolvedValue({ idTipoPersonal: 5 });
        tx.catEtiquetasPuesto.findMany.mockResolvedValue([{ idEtiqueta: 2 }, { idEtiqueta: 3 }]);

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                PositionsService,
                { provide: PrismaService, useValue: prisma },
                { provide: NotificationDispatcher, useValue: {} },
                { provide: ConfigService, useValue: { get: jest.fn() } },
                { provide: IntegrationsFactory, useValue: {} },
                { provide: ExcelExportService, useValue: {} },
            ],
        }).compile();
        service = module.get(PositionsService);
    });

    it('guarda el tipo de personal y reemplaza las etiquetas al crear', async () => {
        const dto = { ...dtoBase(), etiquetas: [2, 2, 3] };

        await expect(service.create(user, 9, dto)).resolves.toEqual({
            message: 'Puesto creado exitosamente',
            id: 44,
        });

        expect(tx.catPuestos.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({
                idTipoPersonal: 5,
                NombrePuesto: 'Cajero',
            }),
        }));
        expect(tx.relPuestoEtiqueta.deleteMany).toHaveBeenCalledWith({ where: { idPuesto: 44 } });
        expect(tx.relPuestoEtiqueta.createMany).toHaveBeenCalledWith({
            data: [
                { idPuesto: 44, idEtiqueta: 2 },
                { idPuesto: 44, idEtiqueta: 3 },
            ],
        });
        expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { maxWait: 5000, timeout: 25000 });
    });

    it('no toca las etiquetas si el front no las manda', async () => {
        await service.create(user, 9, dtoBase());

        expect(tx.relPuestoEtiqueta.deleteMany).not.toHaveBeenCalled();
        expect(tx.relPuestoEtiqueta.createMany).not.toHaveBeenCalled();
    });

    it('no crea el puesto si el tipo de personal no es del tenant', async () => {
        tx.catTiposPersonal.findFirst.mockResolvedValue(null);

        await expect(service.create(user, 9, dtoBase())).rejects.toBeInstanceOf(HttpException);
        expect(tx.catPuestos.create).not.toHaveBeenCalled();
    });

    it('al editar reemplaza el set y conserva el tipo en el mismo puesto', async () => {
        const dto = { ...dtoBase(), idTipoPersonal: 6, etiquetas: [] };
        tx.catTiposPersonal.findFirst.mockResolvedValue({ idTipoPersonal: 6 });

        await expect(service.update(user, 9, 44, dto)).resolves.toEqual({
            message: 'Puesto actualizado exitosamente',
        });

        expect(tx.catPuestos.update).toHaveBeenCalledWith(expect.objectContaining({
            where: { idPuesto: 44 },
            data: expect.objectContaining({ idTipoPersonal: 6 }),
        }));
        expect(tx.relPuestoEtiqueta.deleteMany).toHaveBeenCalledWith({ where: { idPuesto: 44 } });
        expect(tx.relPuestoEtiqueta.createMany).not.toHaveBeenCalled();
    });

    it('al editar sin etiquetas deja el set anterior', async () => {
        await service.update(user, 9, 44, dtoBase());

        expect(tx.relPuestoEtiqueta.deleteMany).not.toHaveBeenCalled();
    });
});
