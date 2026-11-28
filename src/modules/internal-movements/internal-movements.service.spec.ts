import { EventEmitter2 } from '@nestjs/event-emitter';
import { CAREER_EVENTO_MOVIMIENTO } from 'src/common/events/career-hechos';
import { ActiveUserDto } from '../auth/dto/active-user.dto';
import { InternalMovementsService } from './internal-movements.service';

const usuario = {
  id: 3,
  first_name: 'Ana',
  last_name: 'López',
} as ActiveUserDto;

function movimiento(idPlanCarrera: number | null) {
  return {
    idMovimiento: 10,
    idEmpleado: 4,
    idTenant: 1,
    idEmpresa: 2,
    idPlanCarrera,
    fechaEfectiva: new Date('2026-12-01T00:00:00.000Z'),
    causaBaja: null,
    idPuestoNuevo: null,
    idJefeNuevo: null,
    idEmpresaNueva: null,
    idSiteNuevo: null,
    salarioBrutoNuevo: null,
    salarioNetoNuevo: null,
  };
}

function armar(idPlanCarrera: number | null, emitAsync = jest.fn()) {
  const tx = {
    movimientosInternos: {
      findUnique: jest.fn().mockResolvedValue(movimiento(idPlanCarrera)),
    },
    empleados: {
      findFirst: jest.fn().mockResolvedValue({ idEmpleado: 4 }),
      update: jest.fn().mockResolvedValue({ idEmpleado: 4 }),
    },
  };
  const prisma = {
    $transaction: jest.fn((fn: (cliente: typeof tx) => Promise<unknown>) =>
      fn(tx),
    ),
  };
  const eventos = { emit: jest.fn(), emitAsync };
  const service = new InternalMovementsService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    eventos as unknown as EventEmitter2,
  );
  return { service, eventos };
}

describe('InternalMovementsService.aplicarMovimientoAEmpleado', () => {
  it('emite APLICADO cuando el movimiento tiene plan de carrera', async () => {
    const emitAsync = jest.fn().mockResolvedValue([]);
    const { service, eventos } = armar(8, emitAsync);

    const respuesta = await service.aplicarMovimientoAEmpleado(10, usuario);

    expect(respuesta.message).toBe(
      'Movimiento aplicado correctamente al empleado.',
    );
    expect(eventos.emitAsync).toHaveBeenCalledWith(
      CAREER_EVENTO_MOVIMIENTO,
      expect.objectContaining({
        tipo: 'APLICADO',
        idEmpresa: 2,
        idPlanCarrera: 8,
        idMovimiento: 10,
        idUsuario: 3,
      }),
    );
  });

  it('no emite el hecho de carrera si el movimiento no tiene plan', async () => {
    const { service, eventos } = armar(null, jest.fn().mockResolvedValue([]));

    await service.aplicarMovimientoAEmpleado(10, usuario);

    expect(eventos.emitAsync).not.toHaveBeenCalled();
  });

  it('un fallo del emisor no cambia la respuesta', async () => {
    const { service } = armar(
      8,
      jest.fn().mockRejectedValue(new Error('evento caído')),
    );

    await expect(
      service.aplicarMovimientoAEmpleado(10, usuario),
    ).resolves.toEqual(
      expect.objectContaining({
        message: 'Movimiento aplicado correctamente al empleado.',
      }),
    );
  });
});
