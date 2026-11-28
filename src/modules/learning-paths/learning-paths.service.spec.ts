import { ActiveUserDto } from 'src/modules/auth/dto/active-user.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { LearningPathsService } from './learning-paths.service';
import { RutaMotorService } from './engine/ruta-motor.service';

const usuario = {
  id: 3,
  uuid: 'usuario-1',
  first_name: 'Ana',
  last_name: 'López',
  idTenant: 1,
} as ActiveUserDto;

describe('LearningPathsService', () => {
  const prisma = {
    rutaVersion: {
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    rutaElemento: {
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
    rutaLote: { create: jest.fn() },
    rutaAsignacion: { create: jest.fn(), createMany: jest.fn() },
    rutaAsignacionCurso: { create: jest.fn(), createMany: jest.fn() },
    historicoMovimientos: { create: jest.fn() },
    $transaction: jest.fn(),
  };
  const motor = { simular: jest.fn(), ejecutar: jest.fn() };
  const service = new LearningPathsService(
    prisma as unknown as PrismaService,
    motor as unknown as RutaMotorService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('la vista previa no escribe en la base', async () => {
    prisma.rutaVersion.findFirst.mockResolvedValue({
      idVersion: 2,
      estado: 'borrador',
      RutaAprendizaje: { nombre: 'Inducción', idTenant: 1 },
    });
    motor.simular.mockResolvedValue({
      alcanzados: 4,
      yaTienenVigentes: 1,
      recibiranSoloNuevos: 1,
      recibiranCompleta: 2,
      presencialesAProgramar: 0,
      diff: { agregados: [], quitados: [], cambiados: [], sinCambio: [] },
    });

    await expect(service.vistaPrevia(1, 4, 2)).resolves.toMatchObject({
      alcanzados: 4,
    });

    expect(motor.simular).toHaveBeenCalledWith({
      idEmpresa: 1,
      idRuta: 4,
      idVersion: 2,
    });
    expect(motor.ejecutar).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.rutaVersion.update).not.toHaveBeenCalled();
    expect(prisma.rutaVersion.updateMany).not.toHaveBeenCalled();
    expect(prisma.rutaLote.create).not.toHaveBeenCalled();
    expect(prisma.rutaAsignacion.create).not.toHaveBeenCalled();
    expect(prisma.rutaAsignacionCurso.create).not.toHaveBeenCalled();
    expect(prisma.historicoMovimientos.create).not.toHaveBeenCalled();
  });

  it('publicar un borrador vacío responde 400 con codigo RUTA_SIN_CURSOS', async () => {
    prisma.rutaVersion.findFirst.mockResolvedValue({
      idVersion: 2,
      numero: 1,
      estado: 'borrador',
      RutaAprendizaje: { nombre: 'Inducción', idTenant: 1 },
    });
    prisma.rutaElemento.count.mockResolvedValue(0);

    await expect(service.publicar(usuario, 1, 4, 2)).rejects.toMatchObject({
      status: 400,
      response: { codigo: 'RUTA_SIN_CURSOS' },
    });
    expect(motor.ejecutar).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
