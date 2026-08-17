import { Test, TestingModule } from '@nestjs/testing';
import { InternalMovementsService } from './internal-movements.service';

jest.mock('../../prisma/prisma.service', () => ({
  __esModule: true,
  PrismaService: jest.fn().mockImplementation(() => ({
    $transaction: jest.fn((cb: (tx: typeof mockTx) => unknown) => cb(mockTx)),
  })),
}));

jest.mock('../notifications/notification.dispatcher', () => ({
  NotificationDispatcher: jest.fn(),
}));

const mockTx = {
  empleados: { update: jest.fn() },
  historialSalarios: {
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  movimientosInternos: { update: jest.fn() },
  planCarreraColaborador: { update: jest.fn() },
  historicoMovimientos: { create: jest.fn() },
};

import { PrismaService } from '../../prisma/prisma.service';
import { NotificationDispatcher } from '../notifications/notification.dispatcher';
import { ActiveUserDto } from '../auth/dto/active-user.dto';

describe('InternalMovementsService', () => {
  let service: InternalMovementsService;
  const activeUser: ActiveUserDto = {
    id: 1,
    uuid: 'user-uuid-1',
    username: 'admin',
    first_name: 'Ana',
    last_name: 'Lopez',
    email: 'ana@empresa.com',
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InternalMovementsService,
        { provide: PrismaService, useValue: { $transaction: jest.fn() } },
        { provide: NotificationDispatcher, useValue: { notify: jest.fn() } },
      ],
    }).compile();

    service = module.get<InternalMovementsService>(InternalMovementsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('evaluateMovement - promotion hook (Plan de Carrera)', () => {
    const baseMovement = {
      idMovimiento: 1,
      idEmpleado: 10,
      idPuestoAnterior: 100,
      idPuestoNuevo: 200,
      idJefeAnterior: null,
      idJefeNuevo: null,
      idEmpresaAnterior: null,
      idEmpresaNueva: null,
      idSiteAnterior: null,
      idSiteNuevo: null,
      salarioBrutoAnterior: null,
      salarioBrutoNuevo: null,
      salarioNetoAnterior: null,
      salarioNetoNuevo: null,
      fechaEfectiva: null,
      idEstatusMovimiento: 5,
      idPlanCarrera: 42,
      motivo: null,
    };

    it('marca la postulación como promovida al aprobar (estatus 6) cuando idPlanCarrera existe', async () => {
      jest.spyOn(service, 'findMovementById').mockResolvedValue({
        movement: baseMovement as never,
        permissions: {
          canApproveOrReject: true,
          userContextRole: 'DIRECCION_GENERAL',
        },
      } as never);

      mockTx.empleados.update.mockResolvedValue({});
      mockTx.historialSalarios.findFirst.mockResolvedValue(null);
      mockTx.movimientosInternos.update.mockResolvedValue({});
      mockTx.planCarreraColaborador.update.mockResolvedValue({});
      mockTx.historicoMovimientos.create.mockResolvedValue({});

      const prisma = service['prisma'];
      jest
        .spyOn(prisma, '$transaction')
        .mockImplementation(((cb: (tx: typeof mockTx) => unknown) =>
          cb(mockTx)) as never);

      await service.evaluateMovement(1, 1, 'aprobar', activeUser);

      expect(mockTx.planCarreraColaborador.update).toHaveBeenCalledWith({
        where: { idPlanCarrera: 42 },
        data: expect.objectContaining({ estatus: 'promovido' }),
      });
    });

    it('no toca la postulación cuando idPlanCarrera es null', async () => {
      jest.spyOn(service, 'findMovementById').mockResolvedValue({
        movement: { ...baseMovement, idPlanCarrera: null } as never,
        permissions: {
          canApproveOrReject: true,
          userContextRole: 'DIRECCION_GENERAL',
        },
      } as never);

      mockTx.empleados.update.mockResolvedValue({});
      mockTx.historialSalarios.findFirst.mockResolvedValue(null);
      mockTx.movimientosInternos.update.mockResolvedValue({});
      mockTx.historicoMovimientos.create.mockResolvedValue({});

      jest
        .spyOn(service['prisma'], '$transaction')
        .mockImplementation(((cb: (tx: typeof mockTx) => unknown) =>
          cb(mockTx)) as never);

      await service.evaluateMovement(1, 1, 'aprobar', activeUser);

      expect(mockTx.planCarreraColaborador.update).not.toHaveBeenCalled();
    });

    it('rechaza sin invocar el hook de promoción', async () => {
      jest.spyOn(service, 'findMovementById').mockResolvedValue({
        movement: baseMovement as never,
        permissions: {
          canApproveOrReject: true,
          userContextRole: 'DIRECCION_GENERAL',
        },
      } as never);

      const prisma = service['prisma'] as unknown as {
        movimientosInternos: { update: jest.Mock };
        historicoMovimientos: { create: jest.Mock };
      };
      prisma.movimientosInternos = { update: jest.fn().mockResolvedValue({}) };
      prisma.historicoMovimientos = { create: jest.fn().mockResolvedValue({}) };

      await service.evaluateMovement(1, 1, 'rechazar', activeUser);

      expect(prisma.movimientosInternos.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { idEstatusMovimiento: 7 } }),
      );
      expect(mockTx.planCarreraColaborador.update).not.toHaveBeenCalled();
    });
  });
});
