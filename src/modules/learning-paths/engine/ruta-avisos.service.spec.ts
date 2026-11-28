import { ConfigurationService } from 'src/modules/configuration/configuration.service';
import { trainingConfigPorDefecto } from 'src/modules/configuration/training-config';
import { NotificationDispatcher } from 'src/modules/notifications/notification.dispatcher';
import { PrismaService } from 'src/prisma/prisma.service';
import { avisosDeAsignacion, umbralAviso } from './ruta-avisos';
import { RutaAvisosService } from './ruta-avisos.service';

describe('avisos de rutas', () => {
  it('agrupa por persona y, con aprobación, solo avisa el lote', () => {
    const filas = [
      { idEmpleado: 7, idTenant: 1, idCurso: 10, estado: 'inscrito' },
      { idEmpleado: 7, idTenant: 1, idCurso: 11, estado: 'por_programar' },
      { idEmpleado: 7, idTenant: 1, idCurso: 10, estado: 'inscrito' },
      { idEmpleado: 8, idTenant: 1, idCurso: 12, estado: 'reconocido' },
    ];
    expect(
      avisosDeAsignacion({
        idEmpresa: 1,
        idTenant: 1,
        disparador: 'alta',
        modo: 'automatica',
        filas,
      }),
    ).toEqual([
      {
        tipo: 'cursos_nuevos',
        idEmpresa: 1,
        idTenant: 1,
        idEmpleado: 7,
        disparador: 'alta',
        cursos: 2,
      },
      { tipo: 'por_programar', idEmpresa: 1, idTenant: 1 },
    ]);
    expect(
      avisosDeAsignacion({
        idEmpresa: 1,
        idTenant: 1,
        disparador: 'publicacion',
        modo: 'con_aprobacion',
        filas,
      }),
    ).toEqual([{ tipo: 'por_aprobar', idEmpresa: 1, idTenant: 1 }]);
  });

  it('la ventana 30 y 7 avisa una vez en cada tramo', () => {
    expect(umbralAviso(30, [30, 7])).toBe(30);
    expect(umbralAviso(15, [30, 7])).toBe(30);
    expect(umbralAviso(7, [30, 7])).toBe(7);
    expect(umbralAviso(1, [30, 7])).toBe(7);
    expect(umbralAviso(0, [30, 7])).toBeNull();
    expect(umbralAviso(31, [30, 7])).toBeNull();
  });

  it('un curso nuevo sale a MI_RUTA y el aviso a RH no se repite el mismo día', async () => {
    type AvisoPush = {
      destino?: { tipo?: string };
      titulo?: string;
      push?: { title?: string };
      mensaje?: string;
      deepLink?: string;
    };
    const dispatchComms = jest
      .fn<Promise<{ entregas: unknown[] }>, [unknown, AvisoPush, unknown]>()
      .mockResolvedValue({ entregas: [] });
    const recordados: { Codigo: string; Referencia: string }[] = [];
    const prisma = {
      empleados: {
        findFirst: jest.fn().mockResolvedValue({
          idUsuario: 'uuid-7',
          idTenant: 1,
        }),
        findMany: jest
          .fn()
          .mockResolvedValue([{ idEmpleado: 3, idUsuario: 'uuid-rh' }]),
      },
      catEmpresas: {
        findUnique: jest.fn().mockResolvedValue({ idTenant: 1 }),
      },
      catSites: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ zonaHoraria: 'America/Mexico_City' }),
      },
      catRoles: { findMany: jest.fn().mockResolvedValue([{ idRol: 1 }]) },
      relRolPermisos: {
        findMany: jest.fn().mockResolvedValue([{ idRol: 1 }]),
      },
      relUsuarioRol: {
        findMany: jest.fn().mockResolvedValue([{ idUsuario: 9 }]),
      },
      auth_user: {
        findMany: jest.fn().mockResolvedValue([{ uuid: 'uuid-rh' }]),
      },
      rutaAsignacion: {
        count: jest.fn().mockResolvedValue(4),
      },
      comRecordatoriosEnviados: {
        findMany: jest.fn(() => Promise.resolve(recordados)),
        createMany: jest.fn(
          (args: { data: { Codigo: string; Referencia: string }[] }) => {
            recordados.push(...args.data);
            return Promise.resolve({ count: args.data.length });
          },
        ),
      },
    };
    const servicio = new RutaAvisosService(
      prisma as unknown as PrismaService,
      {
        getTrainingConfig: jest
          .fn()
          .mockResolvedValue(trainingConfigPorDefecto()),
      } as unknown as ConfigurationService,
      { dispatchComms } as unknown as NotificationDispatcher,
    );

    await servicio.despachar([
      {
        tipo: 'cursos_nuevos',
        idEmpresa: 1,
        idTenant: 1,
        idEmpleado: 7,
        disparador: 'alta',
        cursos: 2,
      },
      { tipo: 'por_aprobar', idEmpresa: 1, idTenant: 1 },
    ]);
    await servicio.despachar([
      { tipo: 'por_aprobar', idEmpresa: 1, idTenant: 1 },
    ]);

    const alEmpleado = dispatchComms.mock.calls.find(
      (llamada) => llamada[1].destino?.tipo === 'MI_RUTA',
    );
    expect(alEmpleado?.[0]).toEqual({ userUuid: 'uuid-7' });
    expect(alEmpleado?.[1]).toMatchObject({
      titulo: 'Tienes cursos nuevos en tu ruta',
      destino: { tipo: 'MI_RUTA' },
      push: { title: 'Tienes cursos nuevos en tu ruta' },
    });
    expect(alEmpleado?.[2]).toEqual([
      { codigo: 'PUSH', enviarAhora: true },
      { codigo: 'SOCKETS', enviarAhora: true },
    ]);
    const aRh = dispatchComms.mock.calls.filter((llamada) =>
      String(llamada[1].titulo).includes('por aprobar'),
    );
    expect(aRh).toHaveLength(1);
    expect(aRh[0][1]).toMatchObject({
      mensaje: 'Hay 4 asignaciones por aprobar.',
      deepLink: '/companies/1/training/pending',
    });
  });

  it('un fallo al avisar no se propaga', async () => {
    const servicio = new RutaAvisosService(
      {
        empleados: {
          findFirst: jest.fn().mockRejectedValue(new Error('caído')),
        },
      } as unknown as PrismaService,
      {} as ConfigurationService,
      { dispatchComms: jest.fn() } as unknown as NotificationDispatcher,
    );
    await expect(
      servicio.enRiesgo({ idEmpresa: 1, idEmpleado: 7, puesto: 'Líder' }),
    ).resolves.toBeUndefined();
  });
});
