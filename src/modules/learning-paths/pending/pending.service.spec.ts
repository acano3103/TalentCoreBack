import { PendingService } from './pending.service';
import { CoursesService } from 'src/modules/courses/courses.service';
import { AssignmentEngineService } from '../engine/assignment-engine.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { ActiveUserDto } from 'src/modules/auth/dto/active-user.dto';

describe('PendingService', () => {
  it('programar no saca a nadie de la sesión', async () => {
    const participantes: {
      idParticipante: number;
      idSesion: number;
      idEmpleado: number;
      fechaLimite: Date | null;
    }[] = [
      { idParticipante: 1, idSesion: 50, idEmpleado: 99, fechaLimite: null },
    ];
    const prisma = {
      relUsuarioRol: { findMany: jest.fn().mockResolvedValue([{ idRol: 1 }]) },
      relRolPermisos: { findFirst: jest.fn().mockResolvedValue({ id: 9 }) },
      rutaAsignacionCurso: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            filaPendiente(10, 1, '2026-12-01'),
            filaPendiente(11, 2, '2026-12-15'),
          ]),
        update: jest.fn().mockResolvedValue({}),
      },
      rutaAsignacion: {
        findMany: jest.fn().mockResolvedValue([
          { idAsignacion: 1, idEmpleado: 1 },
          { idAsignacion: 2, idEmpleado: 2 },
        ]),
      },
      empleados: {
        findMany: jest.fn().mockResolvedValue([
          { idEmpleado: 1, idSite: 3 },
          { idEmpleado: 2, idSite: 3 },
        ]),
      },
      relEmpleadosSites: { findMany: jest.fn().mockResolvedValue([]) },
      cursoParticipantes: {
        findMany: jest.fn(
          (args: {
            where?: { idSesion?: number; idEmpleado?: { in: number[] } };
          }) => {
            return participantes.filter((fila) => {
              if (
                args.where?.idSesion != null &&
                fila.idSesion !== args.where.idSesion
              )
                return false;
              if (
                args.where?.idEmpleado?.in &&
                !args.where.idEmpleado.in.includes(fila.idEmpleado)
              )
                return false;
              return true;
            });
          },
        ),
        createMany: jest.fn(
          ({
            data,
            skipDuplicates,
          }: {
            data: typeof participantes;
            skipDuplicates?: boolean;
          }) => {
            for (const row of data) {
              if (
                skipDuplicates &&
                participantes.some(
                  (fila) =>
                    fila.idSesion === row.idSesion &&
                    fila.idEmpleado === row.idEmpleado,
                )
              ) {
                continue;
              }
              participantes.push({
                idParticipante: participantes.length + 1,
                idSesion: row.idSesion,
                idEmpleado: row.idEmpleado,
                fechaLimite: row.fechaLimite,
              });
            }
            return { count: data.length };
          },
        ),
        update: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn(),
      },
      historicoMovimientos: { create: jest.fn().mockResolvedValue({}) },
      catSites: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ zonaHoraria: 'America/Mexico_City' }),
      },
    };
    const cursos = {
      createSession: jest.fn().mockResolvedValue({ idSesion: 50 }),
      assignParticipants: jest.fn(),
    };
    const service = new PendingService(
      prisma as unknown as PrismaService,
      cursos as unknown as CoursesService,
      {} as AssignmentEngineService,
    );

    const resultado = await service.programar(usuario, 1, {
      grupos: [{ idCurso: 8, idSite: 3 }],
      sesion: {
        idCurso: 8,
        modalidad: 'presencial',
        tipoInstructor: 'interno',
        fechaInicioPeriodo: '2026-12-01T09:00:00.000Z',
        fechaFinPeriodo: '2026-12-01T18:00:00.000Z',
        fechasClase: [],
      },
    });

    expect(resultado).toMatchObject({ idSesion: 50, inscritos: 2 });
    expect(cursos.assignParticipants).not.toHaveBeenCalled();
    expect(prisma.cursoParticipantes.deleteMany).not.toHaveBeenCalled();
    expect(prisma.cursoParticipantes.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ skipDuplicates: true }),
    );
    expect(
      participantes.map((fila) => fila.idEmpleado).sort((a, b) => a - b),
    ).toEqual([1, 2, 99]);
  });
});

const usuario = {
  id: 1,
  uuid: 'user-uuid-1',
  username: 'ana',
  first_name: 'Ana',
  last_name: 'Lopez',
  idTenant: 1,
  roles: [],
} as ActiveUserDto;

function filaPendiente(
  idAsignacionCurso: number,
  idAsignacion: number,
  dia: string,
) {
  return {
    idAsignacionCurso,
    idAsignacion,
    idCurso: 8,
    idElemento: 1,
    estado: 'por_programar',
    fechaLimite: new Date(`${dia}T00:00:00.000Z`),
    idParticipante: null,
  };
}
