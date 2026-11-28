import { PrismaService } from 'src/prisma/prisma.service';
import { ConfigurationService } from 'src/modules/configuration/configuration.service';
import { RutaMotorService } from './ruta-motor.service';

describe('RutaMotorService', () => {
  it('la simulación no escribe en la base', async () => {
    const escrituras: string[] = [];
    const prohibir = (nombre: string) => () => {
      escrituras.push(nombre);
      throw new Error(`escritura ${nombre}`);
    };
    const version = {
      idVersion: 2,
      idRutaAprendizaje: 1,
      estado: 'borrador',
      RutaAlcances: [
        {
          modo: 'incluir',
          idUnidadOperativa: null,
          estado: null,
          idSite: null,
          idPuesto: null,
          idArea: null,
        },
      ],
      RutaEtapas: [
        {
          diaInicio: 0,
          diaFin: 10,
          RutaElementos: [{ idCurso: 5, obligatorio: true, vigenciaMeses: 12 }],
        },
      ],
    };
    const lecturas: Record<
      string,
      Record<string, (...args: never[]) => unknown>
    > = {
      rutaVersion: {
        findFirst: jest.fn((args: { where?: { idVersion?: number } }) => {
          if (args?.where?.idVersion === 2) return version;
          return null;
        }),
      },
    };
    const modelo = (nombre: string) =>
      new Proxy(
        {},
        {
          get(_target, prop: string) {
            if (
              [
                'create',
                'createMany',
                'update',
                'updateMany',
                'delete',
                'deleteMany',
                'upsert',
              ].includes(prop)
            ) {
              return prohibir(`${nombre}.${prop}`);
            }
            return lecturas[nombre]?.[prop] ?? jest.fn().mockResolvedValue([]);
          },
        },
      );
    const prisma = new Proxy(
      {},
      {
        get(_target, prop: string) {
          if (
            prop === '$transaction' ||
            prop === '$executeRaw' ||
            prop === '$queryRaw'
          )
            return prohibir(prop);
          return modelo(prop);
        },
      },
    );

    const motor = new RutaMotorService(
      prisma as unknown as PrismaService,
      {} as ConfigurationService,
    );
    await expect(
      motor.simular({ idEmpresa: 1, idRuta: 1, idVersion: 2 }),
    ).resolves.toMatchObject({
      alcanzados: 0,
      yaTienenVigentes: 0,
      recibiranSoloNuevos: 0,
      recibiranCompleta: 0,
      presencialesAProgramar: 0,
      diff: {
        agregados: [
          expect.objectContaining({ idCurso: 5, plazo: 10, vigenciaMeses: 12 }),
        ],
        quitados: [],
        cambiados: [],
        sinCambio: [],
      },
    });
    expect(escrituras).toEqual([]);
  });
});
