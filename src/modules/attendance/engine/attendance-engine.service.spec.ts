jest.mock('src/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

import { UnprocessableEntityException } from '@nestjs/common';
import { AttendanceEngineService } from './attendance-engine.service';
import { CanonicalCheck } from './interfaces/canonical-check.interface';
import { DEFAULT_ATTENDANCE_CONFIG } from 'src/modules/config/attendance-config/interfaces/attendance-config.interface';
import { AttendanceTrackingConfigService } from 'src/modules/config/attendance-config/attendance-config.service';
import { PrismaService } from 'src/prisma/prisma.service';

const MENSAJE_JORNADA_CERRADA =
  'La jornada de hoy ya está cerrada. Pide a Recursos Humanos un registro manual.';

function enMexico(
  anio: number,
  mes: number,
  dia: number,
  hora: number,
  minuto: number,
  segundo = 0,
): Date {
  return new Date(Date.UTC(anio, mes - 1, dia, hora + 6, minuto, segundo));
}

function horaReloj(hora: number, minuto = 0): Date {
  return new Date(Date.UTC(1970, 0, 1, hora, minuto, 0));
}

function crearMemoria() {
  const registros: any[] = [];
  const jornadas: any[] = [];
  let seqRegistro = 1n;
  let seqJornada = 1;
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
    relacionesMovil: [] as any[],
    legal: null as any,
    evidencias: [] as any[],
  };

  const empleado = {
    idEmpleado: 10,
    idTenant: 1,
    idEmpresa: 2,
    idSite: 7,
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
      if (
        where.idEmpleado != null &&
        registro.idEmpleado !== where.idEmpleado
      ) {
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

  const prisma = {
    empleados: {
      findUnique: jest.fn(async () => empleado),
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
      findMany: jest.fn(async ({ where }: any) => {
        if (!where?.MetodoAsistencia) return [];
        return state.relacionesMovil.filter(
          (rel) => rel.idEmpleado === where.idEmpleado && rel.Activo,
        );
      }),
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
        if (where.idRegistro != null) {
          return (
            registros.find((r) => r.idRegistro === where.idRegistro) ?? null
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
      upsert: jest.fn(async ({ where, create, update }: any) => {
        const { idEmpleado, fecha } = where.idEmpleado_fecha;
        let jornada = jornadas.find(
          (j) =>
            j.idEmpleado === idEmpleado &&
            j.fecha.getTime() === fecha.getTime(),
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
      update: jest.fn(async ({ where, data }: any) => {
        const jornada = jornadas.find((j) => j.idJornada === where.idJornada);
        if (!jornada) throw new Error('jornada no encontrada');
        Object.assign(jornada, data);
        return jornada;
      }),
    },
    configuracionJornadaLegal: {
      findFirst: jest.fn(async () => state.legal),
    },
    asistenciaEvidencias: {
      findUnique: jest.fn(
        async ({ where }: any) =>
          state.evidencias.find((e) => e.idEvidencia === where.idEvidencia) ??
          null,
      ),
      update: jest.fn(async ({ where, data }: any) => {
        const evidencia = state.evidencias.find(
          (e) => e.idEvidencia === where.idEvidencia,
        );
        if (!evidencia) throw new Error('evidencia no encontrada');
        Object.assign(evidencia, data);
        return evidencia;
      }),
    },
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn(prisma),
    ),
  };

  return { prisma, registros, jornadas, state };
}

describe('AttendanceEngineService', () => {
  let memoria: ReturnType<typeof crearMemoria>;
  let service: AttendanceEngineService;
  let config: typeof DEFAULT_ATTENDANCE_CONFIG;

  beforeEach(() => {
    memoria = crearMemoria();
    config = structuredClone(DEFAULT_ATTENDANCE_CONFIG);
    config.movil.selfieObligatoria = false;
    const configService = {
      getConfiguracionAsistencia: jest.fn(async () => config),
    };
    service = new AttendanceEngineService(
      memoria.prisma as unknown as PrismaService,
      configService as unknown as AttendanceTrackingConfigService,
    );
  });

  it('getParametrosOperativos combina la configuración con los umbrales fijos del motor', () => {
    expect(service.getParametrosOperativos(config)).toEqual({
      minutosToleranciaEntrada: config.tolerancia.minutosToleranciaEntrada,
      minutosLimiteRetardo: config.tolerancia.minutosLimiteRetardo,
      tiempoComidaMinutos: config.comida.tiempoComidaMinutos,
      toleranciaComidaMinutos: config.comida.toleranciaComidaMinutos,
      obligatorioChecarComida: config.comida.obligatorioChecarComida,
      toleranciaSalidaAnticipadaMinutos:
        config.salidas.toleranciaSalidaAnticipadaMinutos,
      selfieObligatoria: config.movil.selfieObligatoria,
      permitirFueraGeocercaConJustificacion:
        config.movil.permitirFueraGeocercaConJustificacion,
      precisionGpsMaximaMetros: 100,
      desfaseRelojMaximoSegundos: 300,
      antiguedadOfflineMaximaHoras: 72,
      ventanaProveedorSegundos: config.antirebote.ventanaProveedorSegundos,
      ventanaMismoTipoSegundos: config.antirebote.ventanaMismoTipoSegundos,
    });
  });

  function checada(parcial: Partial<CanonicalCheck> = {}): CanonicalCheck {
    return {
      idTenant: 1,
      idEmpresa: 2,
      idEmpleado: 10,
      canal: 'BIOMETRICO',
      tipo: null,
      modoInferencia: 'ALTERNANTE_SIMPLE',
      fechaHoraRegistro: enMexico(2026, 9, 21, 9, 0),
      uuidCliente: 'uuid-1',
      ...parcial,
    };
  }

  it('en ALTERNANTE_SIMPLE dos checadas cierran la jornada sin descontar comida', async () => {
    config.comida.obligatorioChecarComida = false;

    const entrada = await service.registerCheck(
      checada({
        uuidCliente: 'bio-1',
        idExternoArtemis: 1001n,
        fechaHoraRegistro: enMexico(2026, 9, 21, 9, 0),
      }),
    );
    const salida = await service.registerCheck(
      checada({
        uuidCliente: 'bio-2',
        idExternoArtemis: 1002n,
        fechaHoraRegistro: enMexico(2026, 9, 21, 18, 0),
      }),
    );

    expect(entrada.tipo).toBe('ENTRADA');
    expect(salida.tipo).toBe('SALIDA');
    expect(salida.duplicado).toBe(false);
    expect(salida.rechazado).toBe(false);
    expect(salida.jornada.estatusJornada).toBe('CERRADA');
    expect(salida.jornada.minutosTrabajados).toBe(540);
    expect(salida.jornada.minutosComida).toBe(0);
    expect(memoria.jornadas[0].estatusJornada).toBe('CERRADA');
    expect(memoria.jornadas[0].horaSalidaReal).toEqual(
      enMexico(2026, 9, 21, 18, 0),
    );
  });

  it('la tercera checada simple se rechaza y no reescribe la salida', async () => {
    config.comida.obligatorioChecarComida = false;
    await service.registerCheck(
      checada({
        uuidCliente: 'bio-1',
        fechaHoraRegistro: enMexico(2026, 9, 21, 9, 0),
      }),
    );
    await service.registerCheck(
      checada({
        uuidCliente: 'bio-2',
        fechaHoraRegistro: enMexico(2026, 9, 21, 18, 0),
      }),
    );
    const salidaReal = memoria.jornadas[0].horaSalidaReal;

    await expect(
      service.registerCheck(
        checada({
          uuidCliente: 'bio-3',
          fechaHoraRegistro: enMexico(2026, 9, 21, 19, 0),
        }),
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    expect(memoria.jornadas[0].horaSalidaReal).toEqual(salidaReal);
    expect(memoria.registros).toHaveLength(2);
    expect(memoria.jornadas[0].estatusJornada).toBe('CERRADA');
  });

  it('con rechazoSuave no lanza y asienta el intento como RECHAZADO', async () => {
    config.comida.obligatorioChecarComida = false;
    await service.registerCheck(
      checada({
        uuidCliente: 'bio-1',
        fechaHoraRegistro: enMexico(2026, 9, 21, 9, 0),
      }),
    );
    await service.registerCheck(
      checada({
        uuidCliente: 'bio-2',
        fechaHoraRegistro: enMexico(2026, 9, 21, 18, 0),
      }),
    );
    const salidaReal = memoria.jornadas[0].horaSalidaReal;

    const resultado = await service.registerCheck(
      checada({
        uuidCliente: 'bio-3',
        rechazoSuave: true,
        fechaHoraRegistro: enMexico(2026, 9, 21, 19, 0),
      }),
    );

    expect(resultado.rechazado).toBe(true);
    expect(resultado.codigoRechazo).toBe('JORNADA_CERRADA');
    expect(resultado.motivoRechazo).toBe(MENSAJE_JORNADA_CERRADA);
    expect(memoria.registros[2].estatusProcesamiento).toBe('RECHAZADO');
    expect(memoria.jornadas[0].horaSalidaReal).toEqual(salidaReal);
    expect(memoria.jornadas[0].estatusJornada).toBe('CERRADA');
  });

  it('la secuencia completa descuenta la comida real', async () => {
    config.comida.obligatorioChecarComida = true;
    const marcas: Array<[string, number, number]> = [
      ['ENTRADA', 8, 0],
      ['INICIO_COMIDA', 13, 0],
      ['FIN_COMIDA', 14, 0],
      ['SALIDA', 17, 0],
    ];

    let ultimo: Awaited<
      ReturnType<AttendanceEngineService['registerCheck']>
    > | null = null;
    for (const [tipo, hora, minuto] of marcas) {
      ultimo = await service.registerCheck(
        checada({
          canal: 'APP_MOVIL',
          modoInferencia: 'SECUENCIA_COMPLETA',
          tipo: tipo as CanonicalCheck['tipo'],
          uuidCliente: `comida-${tipo}`,
          fechaHoraRegistro: enMexico(2026, 9, 21, hora, minuto),
          ubicacion: {
            latitud: 19.432608,
            longitud: -99.133209,
            precisionMetros: 10,
          },
        }),
      );
    }

    expect(ultimo?.tipo).toBe('SALIDA');
    expect(ultimo?.jornada.estatusJornada).toBe('CERRADA');
    expect(ultimo?.jornada.minutosComida).toBe(60);
    expect(ultimo?.jornada.minutosTrabajados).toBe(480);
    expect(memoria.jornadas[0].horaInicioComidaReal).toEqual(
      enMexico(2026, 9, 21, 13, 0),
    );
    expect(memoria.jornadas[0].horaFinComidaReal).toEqual(
      enMexico(2026, 9, 21, 14, 0),
    );
  });

  it('la segunda ENTRADA del día responde 422', async () => {
    await service.registerCheck(
      checada({
        modoInferencia: 'EXPLICITO',
        tipo: 'ENTRADA',
        uuidCliente: 'e1',
        fechaHoraRegistro: enMexico(2026, 9, 21, 9, 0),
      }),
    );

    const error = await service
      .registerCheck(
        checada({
          modoInferencia: 'EXPLICITO',
          tipo: 'ENTRADA',
          uuidCliente: 'e2',
          fechaHoraRegistro: enMexico(2026, 9, 21, 11, 0),
        }),
      )
      .catch((causa) => causa);

    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect(error.getStatus()).toBe(422);
    expect(error.getResponse().codigoRechazo).toBe('TRANSICION_INVALIDA');
    expect(memoria.registros).toHaveLength(1);
  });

  it('una checada después de SALIDA responde 422 con la jornada cerrada', async () => {
    config.comida.obligatorioChecarComida = false;
    await service.registerCheck(
      checada({
        uuidCliente: 'bio-1',
        fechaHoraRegistro: enMexico(2026, 9, 21, 9, 0),
      }),
    );
    await service.registerCheck(
      checada({
        uuidCliente: 'bio-2',
        fechaHoraRegistro: enMexico(2026, 9, 21, 18, 0),
      }),
    );

    const error = await service
      .registerCheck(
        checada({
          uuidCliente: 'bio-3',
          fechaHoraRegistro: enMexico(2026, 9, 21, 19, 0),
        }),
      )
      .catch((causa) => causa);

    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect(error.getStatus()).toBe(422);
    expect(error.message).toBe(MENSAJE_JORNADA_CERRADA);
    expect(error.getResponse().codigoRechazo).toBe('JORNADA_CERRADA');
  });

  it('el mismo uuidCliente dos veces devuelve duplicado y un solo registro', async () => {
    const primera = await service.registerCheck(
      checada({ uuidCliente: 'mismo' }),
    );
    const segunda = await service.registerCheck(
      checada({ uuidCliente: 'mismo' }),
    );

    expect(segunda.duplicado).toBe(true);
    expect(segunda.motivoDuplicado).toBe('IDEMPOTENCIA');
    expect(segunda.idRegistro).toBe(primera.idRegistro);
    expect(memoria.registros).toHaveLength(1);
  });

  it('la misma checada a los 30 s queda DUPLICADO sin tocar la jornada', async () => {
    const inicio = enMexico(2026, 9, 21, 9, 0);
    await service.registerCheck(
      checada({
        modoInferencia: 'EXPLICITO',
        tipo: 'ENTRADA',
        uuidCliente: 't0',
        fechaHoraRegistro: inicio,
      }),
    );
    const antes = {
      estatusJornada: memoria.jornadas[0].estatusJornada,
      horaEntradaReal: memoria.jornadas[0].horaEntradaReal,
      horaSalidaReal: memoria.jornadas[0].horaSalidaReal,
      minutosTrabajados: memoria.jornadas[0].minutosTrabajados,
      fechaActualizacion: memoria.jornadas[0].fechaActualizacion?.getTime(),
    };

    const repetida = await service.registerCheck(
      checada({
        modoInferencia: 'EXPLICITO',
        tipo: 'ENTRADA',
        uuidCliente: 't30',
        fechaHoraRegistro: new Date(inicio.getTime() + 30_000),
      }),
    );

    expect(repetida.duplicado).toBe(true);
    expect(memoria.registros[1].estatusProcesamiento).toBe('DUPLICADO');
    expect(memoria.jornadas[0].estatusJornada).toBe(antes.estatusJornada);
    expect(memoria.jornadas[0].horaEntradaReal).toEqual(antes.horaEntradaReal);
    expect(memoria.jornadas[0].horaSalidaReal).toEqual(antes.horaSalidaReal);
    expect(memoria.jornadas[0].minutosTrabajados).toBe(antes.minutosTrabajados);
    expect(memoria.jornadas[0].fechaActualizacion?.getTime()).toBe(
      antes.fechaActualizacion,
    );
  });

  it('en checador, el segundo dedo a los 90 s no cierra la jornada y la salida real sí entra', async () => {
    const entrada = await service.registerCheck(
      checada({
        canal: 'BIOMETRICO',
        modoInferencia: 'ALTERNANTE_SIMPLE',
        uuidCliente: 'fila-entrada',
        fechaHoraRegistro: enMexico(2026, 9, 21, 8, 0, 0),
      }),
    );
    const repetida = await service.registerCheck(
      checada({
        canal: 'BIOMETRICO',
        modoInferencia: 'ALTERNANTE_SIMPLE',
        uuidCliente: 'fila-rebote',
        fechaHoraRegistro: enMexico(2026, 9, 21, 8, 1, 30),
      }),
    );

    expect(entrada.tipo).toBe('ENTRADA');
    expect(entrada.duplicado).toBe(false);
    expect(repetida.duplicado).toBe(true);
    expect(repetida.motivoDuplicado).toBe('ANTIREBOTE');
    expect(repetida.tipo).toBe('ENTRADA');
    expect(memoria.registros).toHaveLength(2);
    expect(memoria.registros[1].estatusProcesamiento).toBe('DUPLICADO');
    expect(memoria.registros[1].tipo).toBe('ENTRADA');
    expect(memoria.jornadas[0].estatusJornada).toBe('ABIERTA');
    expect(memoria.jornadas[0].horaSalidaReal).toBeNull();

    const salida = await service.registerCheck(
      checada({
        canal: 'BIOMETRICO',
        modoInferencia: 'ALTERNANTE_SIMPLE',
        uuidCliente: 'fila-salida',
        fechaHoraRegistro: enMexico(2026, 9, 21, 17, 0, 0),
      }),
    );

    expect(salida.duplicado).toBe(false);
    expect(salida.tipo).toBe('SALIDA');
    expect(salida.jornada.estatusJornada).toBe('CERRADA');
    expect(memoria.jornadas[0].estatusJornada).toBe('CERRADA');
    expect(memoria.jornadas[0].horaSalidaReal).not.toBeNull();
    expect(memoria.registros[2].estatusProcesamiento).toBe('PROCESADO');
  });

  it('un marcaje de proveedor a los 180 s ya no es rebote y se registra como SALIDA', async () => {
    await service.registerCheck(
      checada({
        canal: 'BIOMETRICO',
        modoInferencia: 'ALTERNANTE_SIMPLE',
        uuidCliente: 'ventana-entrada',
        fechaHoraRegistro: enMexico(2026, 9, 21, 8, 0, 0),
      }),
    );
    const salida = await service.registerCheck(
      checada({
        canal: 'BIOMETRICO',
        modoInferencia: 'ALTERNANTE_SIMPLE',
        uuidCliente: 'ventana-salida',
        fechaHoraRegistro: enMexico(2026, 9, 21, 8, 3, 0),
      }),
    );

    expect(salida.duplicado).toBe(false);
    expect(salida.motivoDuplicado).toBeUndefined();
    expect(salida.tipo).toBe('SALIDA');
    expect(memoria.registros).toHaveLength(2);
    expect(memoria.registros[1].estatusProcesamiento).toBe('PROCESADO');
    expect(memoria.jornadas[0].estatusJornada).toBe('CERRADA');
    expect(memoria.jornadas[0].horaSalidaReal).not.toBeNull();
  });

  it('la app móvil registra INICIO_COMIDA 90 s después de la ENTRADA', async () => {
    const inicio = enMexico(2026, 9, 21, 9, 0, 0);
    await service.registerCheck(
      checada({
        canal: 'APP_MOVIL',
        modoInferencia: 'EXPLICITO',
        tipo: 'ENTRADA',
        uuidCliente: 'movil-entrada',
        fechaHoraRegistro: inicio,
        ubicacion: { latitud: 19.43, longitud: -99.13, precisionMetros: 12 },
      }),
    );
    const comida = await service.registerCheck(
      checada({
        canal: 'APP_MOVIL',
        modoInferencia: 'EXPLICITO',
        tipo: 'INICIO_COMIDA',
        uuidCliente: 'movil-comida',
        fechaHoraRegistro: new Date(inicio.getTime() + 90_000),
        ubicacion: { latitud: 19.43, longitud: -99.13, precisionMetros: 12 },
      }),
    );

    expect(comida.duplicado).toBe(false);
    expect(comida.motivoDuplicado).toBeUndefined();
    expect(comida.tipo).toBe('INICIO_COMIDA');
    expect(memoria.registros[1].estatusProcesamiento).toBe('PROCESADO');
    expect(memoria.registros[1].tipo).toBe('INICIO_COMIDA');
    expect(memoria.jornadas[0].estatusJornada).toBe('ABIERTA');
  });

  it('con ventanaProveedorSegundos en 0 el mismo tipo a los 30 s sigue en el antirebote semántico', async () => {
    config.antirebote.ventanaProveedorSegundos = 0;
    const inicio = enMexico(2026, 9, 21, 8, 0, 0);

    await service.registerCheck(
      checada({
        canal: 'BIOMETRICO',
        modoInferencia: 'EXPLICITO',
        tipo: 'ENTRADA',
        uuidCliente: 'cero-entrada',
        fechaHoraRegistro: inicio,
      }),
    );
    const mismoTipo = await service.registerCheck(
      checada({
        canal: 'BIOMETRICO',
        modoInferencia: 'EXPLICITO',
        tipo: 'ENTRADA',
        uuidCliente: 'cero-mismo',
        fechaHoraRegistro: new Date(inicio.getTime() + 30_000),
      }),
    );

    expect(mismoTipo.duplicado).toBe(true);
    expect(mismoTipo.motivoDuplicado).toBe('ANTIREBOTE');
    expect(mismoTipo.tipo).toBe('ENTRADA');
    expect(memoria.registros[1].estatusProcesamiento).toBe('DUPLICADO');
    expect(memoria.jornadas[0].horaSalidaReal).toBeNull();

    const salida = await service.registerCheck(
      checada({
        canal: 'BIOMETRICO',
        modoInferencia: 'EXPLICITO',
        tipo: 'SALIDA',
        uuidCliente: 'cero-salida',
        fechaHoraRegistro: new Date(inicio.getTime() + 45_000),
      }),
    );

    expect(salida.duplicado).toBe(false);
    expect(salida.tipo).toBe('SALIDA');
    expect(memoria.jornadas[0].estatusJornada).toBe('CERRADA');
  });

  it('aplica la tolerancia de entrada: 08:12 con 15 min de tolerancia no es retardo', async () => {
    config.tolerancia.minutosToleranciaEntrada = 15;
    const resultado = await service.registerCheck(
      checada({
        tipo: 'ENTRADA',
        modoInferencia: 'EXPLICITO',
        uuidCliente: 'ret-0',
        fechaHoraRegistro: enMexico(2026, 9, 21, 8, 12),
      }),
    );

    expect(resultado.jornada.minutosRetardo).toBe(0);
  });

  it('aplica la tolerancia de entrada: 08:40 con 15 min de tolerancia son 25 min', async () => {
    config.tolerancia.minutosToleranciaEntrada = 15;
    const resultado = await service.registerCheck(
      checada({
        tipo: 'ENTRADA',
        modoInferencia: 'EXPLICITO',
        uuidCliente: 'ret-25',
        fechaHoraRegistro: enMexico(2026, 9, 21, 8, 40),
      }),
    );

    expect(resultado.jornada.minutosRetardo).toBe(25);
  });

  it('sin horario crea la jornada sin teóricas y sin revisar', async () => {
    memoria.state.horario = null;

    await service.registerCheck(
      checada({
        uuidCliente: 'sin-horario',
        fechaHoraRegistro: enMexico(2026, 9, 21, 9, 0),
      }),
    );

    expect(memoria.jornadas).toHaveLength(1);
    expect(memoria.jornadas[0].horaEntradaTeorica).toBeNull();
    expect(memoria.jornadas[0].horaSalidaTeorica).toBeNull();
    expect(memoria.jornadas[0].revisada).toBe(false);
  });

  it('fuera de geocerca bloqueada guarda RECHAZADO y responde 422', async () => {
    config.movil.permitirFueraGeocercaConJustificacion = false;
    memoria.state.relacionesMovil = [
      {
        idEmpleado: 10,
        idSite: 3,
        Activo: true,
        MetodoAsistencia: 'APP_MOVIL',
        CatSites: {
          CatGeocercas: [
            {
              idGeocerca: 5,
              Activo: true,
              Tipo: 'circle',
              Latitud: 19.432608,
              Longitud: -99.133209,
              Radio: 100,
              RelGeocercaVertices: [],
            },
          ],
        },
      },
    ];

    const error = await service
      .registerCheck(
        checada({
          canal: 'APP_MOVIL',
          modoInferencia: 'EXPLICITO',
          tipo: 'ENTRADA',
          uuidCliente: 'fuera-1',
          fechaHoraRegistro: enMexico(2026, 9, 21, 9, 0),
          ubicacion: {
            latitud: 19.5,
            longitud: -99.133209,
            precisionMetros: 12,
          },
        }),
      )
      .catch((causa) => causa);

    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect(error.getStatus()).toBe(422);
    expect(error.getResponse().codigoRechazo).toBe('FUERA_BLOQUEADA');
    expect(memoria.registros).toHaveLength(1);
    expect(memoria.registros[0].estatusProcesamiento).toBe('RECHAZADO');
    expect(memoria.registros[0].resultadoGeocerca).toBe('FUERA_BLOQUEADA');
    expect(memoria.jornadas).toHaveLength(0);
  });
});
