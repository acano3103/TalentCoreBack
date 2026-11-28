import { EventEmitter2 } from '@nestjs/event-emitter';
import { CAREER_EVENTO_MOVIMIENTO } from 'src/common/events/career-hechos';
import { ActiveUserDto } from '../auth/dto/active-user.dto';
import {
  AccionAprobacionEnum,
  ModuloOrigenEnum,
} from './enums/approval-origin.enum';
import { ApprovalsService } from './approvals.service';

const usuario = {
  id: 3,
  uuid: 'usuario-1',
  idTenant: 1,
  first_name: 'Ana',
  last_name: 'López',
} as ActiveUserDto;

function solicitud(idPlanCarrera: number | null) {
  return {
    idMovimiento: 10,
    idEmpresa: 2,
    idTenant: 1,
    idEmpleado: 4,
    idTipoMovimiento: 5,
    estatus: 'PENDIENTE',
    pasoActual: 1,
    idPlanCarrera,
    fechaEfectiva: new Date('2026-12-01T00:00:00.000Z'),
  };
}

function armar(idPlanCarrera: number | null, emitAsync = jest.fn()) {
  const prisma = {
    empleados: {
      findFirst: jest.fn().mockResolvedValue({ idEmpleado: 9 }),
    },
    movimientosInternos: {
      findFirst: jest.fn().mockResolvedValue(solicitud(idPlanCarrera)),
    },
    $transaction: jest.fn((fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        pasosAprobacionMovimientoInterno: { create: jest.fn() },
        movimientosInternos: { update: jest.fn() },
      }),
    ),
  };
  const personal = {
    obtenerFlujoPorTipoMovimiento: jest.fn().mockResolvedValue({
      totalPasos: 2,
      pasos: [{ paso: 1, tipoAprobador: 'ROL', idRolAprobador: 1 }],
    }),
  };
  const eventos = { emit: jest.fn(), emitAsync };
  const service = new ApprovalsService(
    prisma as never,
    personal as never,
    {} as never,
    {} as never,
    eventos as unknown as EventEmitter2,
  );
  return { service, eventos };
}

function rechazar() {
  return {
    origenModulo: ModuloOrigenEnum.MOVIMIENTO_INTERNO,
    idOrigen: 10,
    accion: AccionAprobacionEnum.RECHAZAR,
    comentarios: 'No procede',
  };
}

describe('ApprovalsService rechazo de movimiento interno', () => {
  it('emite RECHAZADO cuando el movimiento tiene plan de carrera', async () => {
    const emitAsync = jest.fn().mockResolvedValue([]);
    const { service } = armar(8, emitAsync);

    const respuesta = await service.processApprovalAction(
      usuario,
      2,
      rechazar(),
    );

    expect(respuesta).toEqual({
      message: 'Solicitud rechazada exitosamente',
    });
    expect(emitAsync).toHaveBeenCalledWith(
      CAREER_EVENTO_MOVIMIENTO,
      expect.objectContaining({
        tipo: 'RECHAZADO',
        idEmpresa: 2,
        idPlanCarrera: 8,
        idMovimiento: 10,
        idUsuario: 3,
      }),
    );
  });

  it('no emite el hecho de carrera si el movimiento no tiene plan', async () => {
    const emitAsync = jest.fn().mockResolvedValue([]);
    const { service } = armar(null, emitAsync);

    await service.processApprovalAction(usuario, 2, rechazar());

    expect(emitAsync).not.toHaveBeenCalled();
  });

  it('un fallo del emisor no cambia la respuesta', async () => {
    const { service } = armar(
      8,
      jest.fn().mockRejectedValue(new Error('evento caído')),
    );

    await expect(
      service.processApprovalAction(usuario, 2, rechazar()),
    ).resolves.toEqual({ message: 'Solicitud rechazada exitosamente' });
  });
});
