jest.mock('src/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

import {
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { AttendanceEngineService } from 'src/modules/attendance/engine/attendance-engine.service';
import { ResultadoCheck } from 'src/modules/attendance/engine/interfaces/canonical-check.interface';
import { DEFAULT_ATTENDANCE_CONFIG } from 'src/modules/config/attendance-config/interfaces/attendance-config.interface';
import { AttendanceTrackingConfigService } from 'src/modules/config/attendance-config/attendance-config.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { ArtemisService } from './artemis.service';
import { ArtemisClockInDto } from './dto/artemis-clock-in.dto';

const MENSAJE_MULTI_TENANT =
  'Hay más de un tenant activo y el payload de Artemis no identifica ' +
  'a cuál pertenece la checada. Se requiere el campo idTenant o idEmpresa.';

function dtoBase(parcial: Partial<ArtemisClockInDto> = {}): ArtemisClockInDto {
  return {
    IdAsistencia: 104592,
    ExternalUserId: '10452',
    FechaChecada: '2026-09-21T14:00:00Z',
    FuenteAsistencia: 'BIOMETRICO',
    ...parcial,
  };
}

function resultadoMotor(
  parcial: Partial<ResultadoCheck> = {},
): ResultadoCheck {
  return {
    idRegistro: '11',
    idJornada: 7,
    tipo: 'ENTRADA',
    duplicado: false,
    resultadoGeocerca: 'NO_APLICA',
    distanciaGeocercaMetros: null,
    requiereRevision: false,
    advertencias: [],
    rechazado: false,
    motivoRechazo: null,
    codigoRechazo: null,
    jornada: {
      estatusJornada: 'ABIERTA',
      minutosTrabajados: 0,
      minutosRetardo: 0,
      minutosComida: 0,
      siguienteAccion: { sugerido: 'SALIDA', permitidos: ['SALIDA'] },
    },
    ...parcial,
  };
}

const empleadoActivo = {
  idEmpleado: 10,
  idEmpresa: 2,
  idTenant: 1,
  nombre: 'Ana',
  primerApellido: 'Lopez',
  numeroEmpleado: '10452',
  activo: true,
  idSite: 7,
};

function prismaMapperMock() {
  return {
    catTenants: {
      findMany: jest.fn<Promise<{ idTenant: number }[]>, any[]>(async () => [
        { idTenant: 1 },
      ]),
    },
    empleados: {
      findFirst: jest.fn<Promise<typeof empleadoActivo | null>, any[]>(
        async () => empleadoActivo,
      ),
    },
    registrosAsistencia: {
      findFirst: jest.fn<
        Promise<{ idRegistro: bigint; tipo: string; idJornada: number } | null>,
        any[]
      >(async () => null),
    },
    $transaction: jest.fn(),
  };
}

function horaReloj(hora: number, minuto = 0): Date {
  return new Date(Date.UTC(1970, 0, 1, hora, minuto, 0));
}

function crearMemoriaIntegracion() {
  const registros: any[] = [];
  const jornadas: any[] = [];
  let seqRegistro = 1n;
  let seqJornada = 1;
  const tenants = [{ idTenant: 1, activo: true }];
  const state = {
    horario: {
      idEmpleado: 10,
      DiaSemana: 'Lunes',
      HoraEntrada: horaReloj(8),
      HoraSalida: horaReloj(17),
    } as null | {
      idEmpleado: number;
      DiaSemana: string;
      HoraEntrada: Date | null;
      HoraSalida: Date | null;
    },
  };

  const ordenar = (filas: any[], orderBy?: Record<string, 'asc' | 'desc'>) => {
    if (!orderBy) return [...filas];
    const campo = Object.keys(orderBy)[0];
    const dir = orderBy[campo] === 'desc' ? -1 : 1;
    return [...filas].sort((a, b) => {
      const av = a[campo] instanceof Date ? a[campo].getTime() : a[campo];
      const bv = b[campo] instanceof Date ? b[campo].getTime() : b[campo];
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  };

  const filtrarRegistros = (where: any = {}) =>
    registros.filter((registro) => {
      if (where.idEmpleado != null && registro.idEmpleado !== where.idEmpleado) {
        return false;
      }
      if (where.tipo && registro.tipo !== where.tipo) return false;
      if (
        where.estatusProcesamiento &&
        registro.estatusProcesamiento !== where.estatusProcesamiento
      ) {
        return false;
      }
      if (where.idJornada != null && registro.idJornada !== where.idJornada) {
        return false;
      }
      if (where.idExternoArtemis != null) {
        return registro.idExternoArtemis === where.idExternoArtemis;
      }
      if (where.JornadasEmpleado?.fecha) {
        const jornada = jornadas.find(
          (item) => item.idJornada === registro.idJornada,
        );
        if (
          !jornada ||
          jornada.fecha.getTime() !== where.JornadasEmpleado.fecha.getTime()
        ) {
          return false;
        }
      }
      if (
        where.fechaHoraRegistro?.gte &&
        registro.fechaHoraRegistro < where.fechaHoraRegistro.gte
      ) {
        return false;
      }
      if (
        where.fechaHoraRegistro?.lte &&
        registro.fechaHoraRegistro > where.fechaHoraRegistro.lte
      ) {
        return false;
      }
      return true;
    });

  const prisma: any = {
    catTenants: {
      findMany: jest.fn(async ({ where }: any) =>
        tenants.filter((t) => where?.activo == null || t.activo === where.activo),
      ),
    },
    empleados: {
      findFirst: jest.fn(async ({ where }: any) => {
        if (
          where.numeroEmpleado &&
          where.numeroEmpleado !== empleadoActivo.numeroEmpleado
        ) {
          return null;
        }
        if (where.activo === true && !empleadoActivo.activo) return null;
        if (where.idTenant != null && empleadoActivo.idTenant !== where.idTenant) {
          return null;
        }
        return empleadoActivo;
      }),
      findUnique: jest.fn(async () => empleadoActivo),
    },
    relEmpleadosSites: {
      findFirst: jest.fn(async ({ where }: any) => {
        if (where?.EsPrincipal) {
          return {
            idSite: 3,
            CatSites: { zonaHoraria: 'America/Mexico_City' },
          };
        }
        return null;
      }),
      findMany: jest.fn(async () => []),
    },
    catSites: {
      findUnique: jest.fn(async () => ({ zonaHoraria: 'America/Mexico_City' })),
    },
    horariosEmpleado: {
      findFirst: jest.fn(async ({ where }: any) => {
        if (!state.horario) return null;
        if (where.idEmpleado !== state.horario.idEmpleado) return null;
        if (where.DiaSemana !== state.horario.DiaSemana) return null;
        return state.horario;
      }),
    },
    registrosAsistencia: {
      findUnique: jest.fn(async ({ where }: any) => {
        if (where.uuidCliente) {
          return (
            registros.find((r) => r.uuidCliente === where.uuidCliente) ?? null
          );
        }
        if (where.idExternoArtemis != null) {
          return (
            registros.find(
              (r) => r.idExternoArtemis === where.idExternoArtemis,
            ) ?? null
          );
        }
        return null;
      }),
      findFirst: jest.fn(async ({ where, orderBy }: any) => {
        const filas = ordenar(filtrarRegistros(where), orderBy);
        return filas[0] ?? null;
      }),
      findMany: jest.fn(async ({ where, orderBy }: any) =>
        ordenar(filtrarRegistros(where), orderBy),
      ),
      create: jest.fn(async ({ data }: any) => {
        const registro = {
          idRegistro: seqRegistro++,
          ...data,
        };
        registros.push(registro);
        return registro;
      }),
    },
    jornadasEmpleado: {
      findUnique: jest.fn(async ({ where }: any) => {
        if (where.idJornada != null) {
          return jornadas.find((j) => j.idJornada === where.idJornada) ?? null;
        }
        if (where.idEmpleado_fecha) {
          const { idEmpleado, fecha } = where.idEmpleado_fecha;
          return (
            jornadas.find(
              (j) =>
                j.idEmpleado === idEmpleado &&
                j.fecha.getTime() === fecha.getTime(),
            ) ?? null
          );
        }
        return null;
      }),
      findFirst: jest.fn(async ({ where }: any) => {
        return (
          jornadas.find(
            (j) =>
              j.idEmpleado === where.idEmpleado &&
              j.fecha.getTime() === where.fecha.getTime(),
          ) ?? null
        );
      }),
      upsert: jest.fn(async ({ where, create, update }: any) => {
        const { idEmpleado, fecha } = where.idEmpleado_fecha;
        let jornada = jornadas.find(
          (j) =>
            j.idEmpleado === idEmpleado && j.fecha.getTime() === fecha.getTime(),
        );
        if (!jornada) {
          jornada = {
            idJornada: seqJornada++,
            minutosTrabajados: 0,
            minutosRetardo: 0,
            minutosComida: 0,
            minutosComidaExcedidos: 0,
            minutosExtraDobles: 0,
            minutosExtraTriples: 0,
            horaEntradaReal: null,
            horaSalidaReal: null,
            horaInicioComidaReal: null,
            horaFinComidaReal: null,
            revisada: false,
            estatusJornada: 'ABIERTA',
            ...create,
          };
          jornadas.push(jornada);
        } else {
          Object.assign(jornada, update);
        }
        return jornada;
      }),
      create: jest.fn(async ({ data }: any) => {
        const jornada = {
          idJornada: seqJornada++,
          minutosTrabajados: 0,
          minutosRetardo: 0,
          minutosComida: 0,
          horaEntradaReal: null,
          horaSalidaReal: null,
          estatusJornada: 'ABIERTA',
          ...data,
        };
        jornadas.push(jornada);
        return jornada;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const jornada = jornadas.find((j) => j.idJornada === where.idJornada);
        if (!jornada) throw new Error('jornada no encontrada');
        Object.assign(jornada, data);
        return jornada;
      }),
    },
    configuracionJornadaLegal: {
      findFirst: jest.fn(async () => null),
    },
    asistenciaEvidencias: {
      findUnique: jest.fn(async () => null),
      update: jest.fn(),
    },
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn(prisma),
    ),
  };

  return { prisma, registros, jornadas, tenants };
}

describe('ArtemisService', () => {
  const envOriginal = process.env.ATTENDANCE_ENGINE_ENABLED;

  afterEach(() => {
    if (envOriginal === undefined) {
      delete process.env.ATTENDANCE_ENGINE_ENABLED;
    } else {
      process.env.ATTENDANCE_ENGINE_ENABLED = envOriginal;
    }
  });

  describe('con motor habilitado', () => {
    let prisma: ReturnType<typeof prismaMapperMock>;
    let engine: { registerCheck: jest.Mock };
    let service: ArtemisService;

    beforeEach(() => {
      process.env.ATTENDANCE_ENGINE_ENABLED = 'true';
      prisma = prismaMapperMock();
      engine = { registerCheck: jest.fn() };
      service = new ArtemisService(
        prisma as unknown as PrismaService,
        engine as unknown as AttendanceEngineService,
      );
    });

    it('payload válido llama a engine.registerCheck con ALTERNANTE_SIMPLE y rechazoSuave', async () => {
      engine.registerCheck.mockResolvedValue(resultadoMotor());

      const respuesta = await service.clockIn(dtoBase());

      expect(engine.registerCheck).toHaveBeenCalledTimes(1);
      expect(engine.registerCheck).toHaveBeenCalledWith(
        expect.objectContaining({
          tipo: null,
          modoInferencia: 'ALTERNANTE_SIMPLE',
          rechazoSuave: true,
          canal: 'BIOMETRICO',
          idEmpleado: 10,
          idTenant: 1,
          idEmpresa: 2,
          idExternoArtemis: 104592n,
        }),
      );
      expect(respuesta).toEqual({
        message: 'Checada de entrada registrada exitosamente.',
        idRegistro: 11,
        idJornada: 7,
        tipo: 'ENTRADA',
        empleado: 'Ana Lopez',
        fechaHora: new Date('2026-09-21T14:00:00.000Z'),
      });
      expect(respuesta).not.toHaveProperty('rechazado');
    });

    it('un antirebote del motor responde duplicado e ignoradoPorTolerancia', async () => {
      engine.registerCheck.mockResolvedValue(
        resultadoMotor({
          duplicado: true,
          motivoDuplicado: 'ANTIREBOTE',
          tipo: 'ENTRADA',
        }),
      );

      const respuesta = await service.clockIn(dtoBase());

      expect(respuesta).toEqual(
        expect.objectContaining({
          duplicado: true,
          ignoradoPorTolerancia: true,
          tipo: 'ENTRADA',
        }),
      );
    });

    it('la idempotencia del motor no marca ignoradoPorTolerancia', async () => {
      engine.registerCheck.mockResolvedValue(
        resultadoMotor({
          duplicado: true,
          motivoDuplicado: 'IDEMPOTENCIA',
        }),
      );

      const respuesta = await service.clockIn(dtoBase());

      expect(respuesta).toEqual(expect.objectContaining({ duplicado: true }));
      expect(respuesta).not.toHaveProperty('ignoradoPorTolerancia');
    });

    it('IdAsistencia repetido responde duplicado:true sin volver a llamar al motor', async () => {
      prisma.registrosAsistencia.findFirst.mockResolvedValue({
        idRegistro: 5n,
        tipo: 'ENTRADA',
        idJornada: 3,
      });

      const respuesta = await service.clockIn(dtoBase());

      expect(respuesta).toEqual({
        success: true,
        duplicado: true,
        message: 'Marcaje previamente registrado.',
        idRegistro: 5,
        tipo: 'ENTRADA',
      });
      expect(engine.registerCheck).not.toHaveBeenCalled();
    });

    it('numeroEmpleado inexistente lanza NotFoundException (404)', async () => {
      prisma.empleados.findFirst.mockResolvedValue(null);

      await expect(service.clockIn(dtoBase())).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(service.clockIn(dtoBase())).rejects.toThrow(
        /No se encontró un empleado activo/,
      );
      expect(engine.registerCheck).not.toHaveBeenCalled();
    });

    it('FechaChecada sin offset se interpreta como UTC', async () => {
      engine.registerCheck.mockResolvedValue(resultadoMotor());

      await service.clockIn(
        dtoBase({ FechaChecada: '2026-09-21T14:05:00' }),
      );

      expect(engine.registerCheck).toHaveBeenCalledWith(
        expect.objectContaining({
          fechaHoraRegistro: new Date('2026-09-21T14:05:00.000Z'),
        }),
      );
    });

    it("FuenteAsistencia 'IVR-Sucursal' se normaliza a canal IVR", async () => {
      engine.registerCheck.mockResolvedValue(resultadoMotor());

      await service.clockIn(dtoBase({ FuenteAsistencia: 'IVR-Sucursal' }));

      expect(engine.registerCheck).toHaveBeenCalledWith(
        expect.objectContaining({ canal: 'IVR' }),
      );
    });

    it('más de un tenant activo lanza ConflictException con el mensaje del TODO', async () => {
      prisma.catTenants.findMany.mockResolvedValue([
        { idTenant: 1 },
        { idTenant: 2 },
      ]);

      await expect(service.clockIn(dtoBase())).rejects.toBeInstanceOf(
        ConflictException,
      );
      await expect(service.clockIn(dtoBase())).rejects.toThrow(
        MENSAJE_MULTI_TENANT,
      );
      expect(engine.registerCheck).not.toHaveBeenCalled();
    });
  });

  describe('no regresión biométrico (motor real)', () => {
    let memoria: ReturnType<typeof crearMemoriaIntegracion>;
    let service: ArtemisService;

    beforeEach(() => {
      process.env.ATTENDANCE_ENGINE_ENABLED = 'true';
      memoria = crearMemoriaIntegracion();
      const config = structuredClone(DEFAULT_ATTENDANCE_CONFIG);
      config.comida.obligatorioChecarComida = false;
      const engine = new AttendanceEngineService(
        memoria.prisma as unknown as PrismaService,
        {
          getConfiguracionAsistencia: jest.fn(async () => config),
        } as unknown as AttendanceTrackingConfigService,
      );
      service = new ArtemisService(
        memoria.prisma as unknown as PrismaService,
        engine,
      );
    });

    it('dos checadas consecutivas producen ENTRADA y luego SALIDA con jornada CERRADA', async () => {
      const entrada = await service.clockIn(
        dtoBase({
          IdAsistencia: 1001,
          FechaChecada: '2026-09-21T14:00:00Z',
        }),
      );
      const salida = await service.clockIn(
        dtoBase({
          IdAsistencia: 1002,
          FechaChecada: '2026-09-21T23:00:00Z',
        }),
      );

      expect(entrada.tipo).toBe('ENTRADA');
      expect(entrada).not.toHaveProperty('rechazado');
      expect(salida.tipo).toBe('SALIDA');
      expect(salida).not.toHaveProperty('rechazado');
      expect(memoria.jornadas[0].estatusJornada).toBe('CERRADA');
      expect(memoria.jornadas[0].horaSalidaReal).toEqual(
        new Date('2026-09-21T23:00:00.000Z'),
      );
    });

    it('la tercera checada responde HTTP 200 con rechazado:true y no pisa horaSalidaReal', async () => {
      await service.clockIn(
        dtoBase({
          IdAsistencia: 1001,
          FechaChecada: '2026-09-21T14:00:00Z',
        }),
      );
      await service.clockIn(
        dtoBase({
          IdAsistencia: 1002,
          FechaChecada: '2026-09-21T23:00:00Z',
        }),
      );
      const salidaReal = memoria.jornadas[0].horaSalidaReal;

      const tercera = await service.clockIn(
        dtoBase({
          IdAsistencia: 1003,
          FechaChecada: '2026-09-21T23:30:00Z',
        }),
      );

      expect(tercera).toEqual(
        expect.objectContaining({
          rechazado: true,
          codigo: 'JORNADA_CERRADA',
        }),
      );
      expect(tercera.message).toBeTruthy();
      expect(memoria.jornadas[0].horaSalidaReal).toEqual(salidaReal);
      expect(memoria.jornadas[0].estatusJornada).toBe('CERRADA');
    });
  });

  describe("ATTENDANCE_ENGINE_ENABLED='false'", () => {
    it('usa clockInLegacy y no llama al motor', async () => {
      process.env.ATTENDANCE_ENGINE_ENABLED = 'false';

      const prisma = prismaMapperMock();
      prisma.$transaction.mockImplementation(async (fn: any) =>
        fn({
          horariosEmpleado: { findFirst: jest.fn(async () => null) },
          jornadasEmpleado: {
            findFirst: jest.fn(async () => null),
            create: jest.fn(async () => ({
              idJornada: 1,
              horaEntradaReal: new Date('2026-09-21T14:00:00.000Z'),
            })),
            update: jest.fn(),
          },
          registrosAsistencia: {
            create: jest.fn(async () => ({ idRegistro: 9n })),
          },
        }),
      );

      const engine = { registerCheck: jest.fn() };
      const service = new ArtemisService(
        prisma as unknown as PrismaService,
        engine as unknown as AttendanceEngineService,
      );

      const respuesta = await service.clockIn(dtoBase());

      expect(engine.registerCheck).not.toHaveBeenCalled();
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(respuesta).toEqual({
        message: 'Checada de entrada registrada exitosamente.',
        idRegistro: 9,
        idJornada: 1,
        tipo: 'ENTRADA',
        empleado: 'Ana Lopez',
        fechaHora: new Date('2026-09-21T14:00:00.000Z'),
      });
    });
  });
});
