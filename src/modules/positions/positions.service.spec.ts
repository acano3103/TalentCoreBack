jest.mock('src/prisma/prisma.service', () => ({
    PrismaService: class PrismaService {},
}));

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
        catTipoPuesto: tabla(),
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
        tx.catTipoPuesto.findFirst.mockImplementation(async (args: { where: { idTipoPuesto: number } }) => {
            const descripcion: Record<number, string> = {
                2: 'Operativo',
                3: 'Directivo',
                4: 'Administrativo',
                9: 'Supervisor',
            };
            const nombre = descripcion[args.where.idTipoPuesto];
            return nombre ? { Descripcion: nombre, Activo: true } : null;
        });
        tx.catTiposPersonal.findFirst.mockImplementation(async (args: { where: { Codigo?: string } }) => {
            const ids: Record<string, number> = { OPERATIVO: 11, ADMINISTRATIVO: 12, DIRECTIVO: 13 };
            const id = args.where.Codigo ? ids[args.where.Codigo] : undefined;
            return id ? { idTipoPersonal: id } : null;
        });
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

    it('deriva el tipo de personal de la clasificación e ignora el id enviado', async () => {
        const dto = { ...dtoBase(), idTipoPersonal: 5, etiquetas: [2, 2, 3] };

        await expect(service.create(user, 9, dto)).resolves.toEqual({
            message: 'Puesto creado exitosamente',
            id: 44,
        });

        expect(tx.catTipoPuesto.findFirst).toHaveBeenCalledWith({
            where: { idTipoPuesto: 2 },
            select: { Descripcion: true, Activo: true },
        });
        expect(tx.catTiposPersonal.findFirst).toHaveBeenCalledWith({
            where: { idTenant: 8, Codigo: 'OPERATIVO', Activo: true },
            select: { idTipoPersonal: true },
        });
        expect(tx.catPuestos.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({
                idTipoPersonal: 11,
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

    it('no crea el puesto si la clasificación no tiene tipo de personal equivalente', async () => {
        const dto = {
            ...dtoBase(),
            idTipoPersonal: 5,
            generalInfo: { ...dtoBase().generalInfo, idTipoPuesto: '9' },
        };

        await expect(service.create(user, 9, dto)).rejects.toMatchObject({
            response: {
                code: 'CONTENIDO_INVALIDO',
                message: 'La clasificación «Supervisor» no tiene un tipo de personal equivalente. Usa Operativo, Administrativo o Directivo.',
            },
        });
        expect(tx.catPuestos.create).not.toHaveBeenCalled();
    });

    it('al editar, cambiar la clasificación actualiza el tipo de personal e ignora el id enviado', async () => {
        const dto = {
            ...dtoBase(),
            idTipoPersonal: 6,
            etiquetas: [] as number[],
            generalInfo: { ...dtoBase().generalInfo, idTipoPuesto: '3' },
        };

        await expect(service.update(user, 9, 44, dto)).resolves.toEqual({
            message: 'Puesto actualizado exitosamente',
        });

        expect(tx.catPuestos.update).toHaveBeenCalledWith(expect.objectContaining({
            where: { idPuesto: 44 },
            data: expect.objectContaining({ idTipoPersonal: 13, idTipoPuesto: 3 }),
        }));
        expect(tx.relPuestoEtiqueta.deleteMany).toHaveBeenCalledWith({ where: { idPuesto: 44 } });
        expect(tx.relPuestoEtiqueta.createMany).not.toHaveBeenCalled();
    });

    it('al editar sin etiquetas deja el set anterior', async () => {
        await service.update(user, 9, 44, dtoBase());

        expect(tx.relPuestoEtiqueta.deleteMany).not.toHaveBeenCalled();
    });
});
