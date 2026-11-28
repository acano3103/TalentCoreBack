import { Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { COMMS_EVENTO_CURSO } from 'src/common/events/comms-hechos';
import { ConfigurationService } from 'src/modules/configuration/configuration.service';
import { trainingConfigPorDefecto } from 'src/modules/configuration/training-config';
import { PrismaService } from 'src/prisma/prisma.service';
import { AssignmentEngineService } from './assignment-engine.service';
import { diaAlmacenado } from './impacto';

type Fila = Record<string, unknown>;

describe('AssignmentEngineService', () => {
  const usuario = { uuid: 'rh-1' };

  it('inscribe una sola vez el curso compartido, con el plazo más corto', async () => {
    const { engine, memoria, emit } = motor();
    sembrarEmpresa(memoria, {
      rutas: [ruta(1, 10, 30, { idSite: 3 }), ruta(2, 20, 10, { idSite: 3 })],
      empleados: [empleado(7, 3)],
      cursos: [cursoAsync(10)],
    });

    const primero = await engine.asignar({
      idEmpresa: 1,
      idEmpleados: [7],
      disparador: 'alta',
      fechaBase: '2026-11-26',
    });
    await engine.asignar({
      idEmpresa: 1,
      idEmpleados: [7],
      disparador: 'alta',
      fechaBase: '2026-11-26',
    });

    const participantes = memoria.filas('cursoParticipantes');
    const cursos = memoria.filas('rutaAsignacionCurso');
    expect(primero.alcanzados).toBe(1);
    expect(memoria.filas('rutaAsignacion')).toHaveLength(2);
    expect(cursos).toHaveLength(2);
    expect(participantes).toHaveLength(1);
    expect(diaAlmacenado(participantes[0].fechaLimite as Date)).toBe(
      '2026-12-06',
    );
    expect(cursos.every((fila) => fila.estado === 'inscrito')).toBe(true);
    expect(new Set(cursos.map((fila) => fila.idParticipante)).size).toBe(1);
    expect(emit).toHaveBeenCalledTimes(1);
    const [evento, hecho] = emit.mock.calls[0] as [
      string,
      { tipo: string; idEmpleado: number },
    ];
    expect(evento).toBe(COMMS_EVENTO_CURSO);
    expect(hecho).toMatchObject({
      tipo: 'ASIGNADO',
      idEmpleado: 7,
    });
  });

  it('reconoce un curso aprobado y vigente sin inscribirlo otra vez', async () => {
    const { engine, memoria, emit } = motor();
    sembrarEmpresa(memoria, {
      rutas: [ruta(1, 10, 15, { idSite: 3 })],
      empleados: [empleado(7, 3)],
      cursos: [cursoAsync(10)],
    });
    memoria.tabla('cursoParticipantes').filas.push({
      idParticipante: 5,
      idSesion: 100,
      idEmpleado: 7,
      estatusAsignacion: 'completado',
      calificacionFinal: 90,
      creadoEn: new Date('2026-11-01T18:00:00.000Z'),
    });
    memoria.tabla('cursoSeguimientoParticipante').filas.push({
      idSeguimiento: 1,
      idParticipante: 5,
      fechaConclusion: new Date('2026-11-01T18:00:00.000Z'),
    });

    await engine.asignar({
      idEmpresa: 1,
      idEmpleados: [7],
      disparador: 'alta',
      fechaBase: '2026-11-26',
    });

    expect(memoria.filas('cursoParticipantes')).toHaveLength(1);
    expect(memoria.filas('rutaAsignacionCurso')).toEqual([
      expect.objectContaining({
        estado: 'reconocido',
        reconocidoDeParticipante: 5,
        idParticipante: null,
      }),
    ]);
    expect(emit).not.toHaveBeenCalled();
  });

  it('avisa una sola vez por persona aunque dos rutas le asignen cursos', async () => {
    const despachar = jest
      .fn<Promise<void>, [unknown[]]>()
      .mockResolvedValue(undefined);
    const { engine, memoria } = motor('automatica', { despachar });
    sembrarEmpresa(memoria, {
      rutas: [rutaConCursos(1, 10, 1, [10]), rutaConCursos(2, 20, 1, [11])],
      empleados: [empleado(7, 3)],
      cursos: [cursoAsync(10), cursoAsync(11, 101)],
    });

    await engine.asignar({
      idEmpresa: 1,
      idEmpleados: [7],
      disparador: 'alta',
      fechaBase: '2026-11-26',
    });

    expect(despachar).toHaveBeenCalledTimes(1);
    expect(despachar.mock.calls[0][0]).toEqual([
      expect.objectContaining({
        tipo: 'cursos_nuevos',
        idEmpleado: 7,
        disparador: 'alta',
        cursos: 2,
      }),
    ]);
  });

  it('un aviso que falla no cambia la asignación', async () => {
    const despachar = jest.fn().mockRejectedValue(new Error('push caído'));
    const { engine, memoria } = motor('automatica', { despachar });
    sembrarEmpresa(memoria, {
      rutas: [ruta(1, 10, 15, { idSite: 3 })],
      empleados: [empleado(7, 3)],
      cursos: [cursoAsync(10)],
    });

    await expect(
      engine.asignar({
        idEmpresa: 1,
        idEmpleados: [7],
        disparador: 'alta',
        fechaBase: '2026-11-26',
      }),
    ).resolves.toMatchObject({ alcanzados: 1 });
    expect(memoria.filas('rutaAsignacion')).toHaveLength(1);
  });

  it('deja el curso presencial en por programar', async () => {
    const { engine, memoria, emit } = motor();
    sembrarEmpresa(memoria, {
      rutas: [ruta(1, 10, 15, { idSite: 3 })],
      empleados: [empleado(7, 3)],
      cursos: [cursoPresencial(10)],
    });

    await engine.asignar({
      idEmpresa: 1,
      idEmpleados: [7],
      disparador: 'alta',
      fechaBase: '2026-11-26',
    });

    expect(memoria.filas('cursoParticipantes')).toHaveLength(0);
    expect(memoria.filas('rutaAsignacionCurso')[0]).toMatchObject({
      estado: 'por_programar',
    });
    expect(emit).not.toHaveBeenCalled();
  });

  it('con aprobación crea un lote y no inscribe; aprobar inscribe y rechazar cancela', async () => {
    const aprobar = motor('con_aprobacion');
    sembrarEmpresa(aprobar.memoria, {
      rutas: [ruta(1, 10, 15, { idSite: 3 })],
      empleados: [empleado(7, 3)],
      cursos: [cursoAsync(10)],
    });
    const resumen = await aprobar.engine.asignar({
      idEmpresa: 1,
      idEmpleados: [7],
      disparador: 'alta',
      fechaBase: '2026-11-26',
      creadoPor: usuario.uuid,
    });
    expect(aprobar.memoria.filas('cursoParticipantes')).toHaveLength(0);
    expect(aprobar.memoria.filas('rutaLote')).toEqual([
      expect.objectContaining({
        estatus: 'por_aprobar',
        idLote: resumen.idLote,
      }),
    ]);
    expect(aprobar.memoria.filas('rutaAsignacion')[0]).toMatchObject({
      estatus: 'por_aprobar',
    });
    expect(aprobar.emit).not.toHaveBeenCalled();

    await aprobar.engine.aplicarLote({
      idEmpresa: 1,
      idLote: resumen.idLote ?? 0,
      resueltoPor: usuario.uuid,
    });
    expect(aprobar.memoria.filas('cursoParticipantes')).toHaveLength(1);
    expect(aprobar.memoria.filas('rutaAsignacion')[0]).toMatchObject({
      estatus: 'activa',
    });
    expect(aprobar.memoria.filas('rutaLote')[0]).toMatchObject({
      estatus: 'aplicado',
    });
    expect(aprobar.emit).toHaveBeenCalledTimes(1);

    const rechazar = motor('con_aprobacion');
    sembrarEmpresa(rechazar.memoria, {
      rutas: [ruta(1, 10, 15, { idSite: 3 })],
      empleados: [empleado(7, 3)],
      cursos: [cursoAsync(10)],
    });
    const lote = await rechazar.engine.asignar({
      idEmpresa: 1,
      idEmpleados: [7],
      disparador: 'alta',
      fechaBase: '2026-11-26',
    });
    await rechazar.engine.rechazarLote({
      idEmpresa: 1,
      idLote: lote.idLote ?? 0,
      motivo: 'No corresponde',
      resueltoPor: usuario.uuid,
    });
    expect(rechazar.memoria.filas('cursoParticipantes')).toHaveLength(0);
    expect(rechazar.memoria.filas('rutaAsignacion')[0]).toMatchObject({
      estatus: 'cancelada',
    });
    expect(rechazar.memoria.filas('rutaAsignacionCurso')[0]).toMatchObject({
      estado: 'cancelado',
    });
    expect(rechazar.memoria.filas('rutaLote')[0]).toMatchObject({
      estatus: 'rechazado',
      motivoRechazo: 'No corresponde',
    });
  });

  it('publica la v3 sin tocar a quien va a la mitad, suma el curso nuevo a quien terminó y sustituye a quien no inició', async () => {
    const { engine, memoria } = motor();
    const aLaMitad = 184;
    const completados = 204;
    const sinIniciar = 24;
    const total = aLaMitad + completados + sinIniciar;
    sembrarEmpresa(memoria, {
      rutas: [rutaConCursos(1, 3, 3, [1, 2])],
      empleados: Array.from({ length: total }, (_, i) => empleado(i + 1, 3)),
      cursos: [cursoAsync(1, 201), cursoAsync(2, 202)],
    });
    memoria.tabla('rutaVersion').filas.push({
      idVersion: 2,
      idRutaAprendizaje: 1,
      numero: 2,
      estado: 'retirada',
    });
    memoria.tabla('rutaEtapa').filas.push({
      idEtapa: 20,
      idVersion: 2,
      nombre: 'Anterior',
      diaInicio: 0,
      diaFin: 10,
    });
    memoria.tabla('rutaElemento').filas.push({
      idElemento: 20,
      idEtapa: 20,
      idVersion: 2,
      idCurso: 1,
      obligatorio: true,
      vigenciaMeses: null,
    });
    for (let i = 1; i <= total; i += 1) {
      const completado = i > aLaMitad && i <= aLaMitad + completados;
      const sinEmpezar = i > aLaMitad + completados;
      memoria.tabla('rutaAsignacion').filas.push({
        idAsignacion: i,
        idEmpresa: 1,
        idEmpleado: i,
        idRutaAprendizaje: 1,
        idVersion: 2,
        estatus: completado ? 'completada' : 'activa',
        disparador: 'publicacion',
        fechaBase: new Date('2026-01-01T00:00:00.000Z'),
      });
      memoria.tabla('rutaAsignacionCurso').filas.push({
        idAsignacionCurso: i,
        idAsignacion: i,
        idElemento: 20,
        idCurso: 1,
        estado: completado
          ? 'completado'
          : sinEmpezar
            ? 'por_programar'
            : 'inscrito',
        fechaLimite: new Date('2026-02-01T00:00:00.000Z'),
      });
    }
    memoria.tabla('rutaAsignacion').seq = total + 1;
    memoria.tabla('rutaAsignacionCurso').seq = total + 1;

    const resumen = await engine.asignar({
      idEmpresa: 1,
      idVersion: 3,
      disparador: 'publicacion',
      fechaBase: '2026-11-26',
    });
    await engine.asignar({
      idEmpresa: 1,
      idVersion: 3,
      disparador: 'publicacion',
      fechaBase: '2026-11-26',
    });

    const asignaciones = memoria.filas('rutaAsignacion');
    const anteriores = asignaciones.filter((fila) => fila.idVersion === 2);
    const nuevas = asignaciones.filter((fila) => fila.idVersion === 3);
    const cursos = memoria.filas('rutaAsignacionCurso');
    const cursosDe = (idAsignacion: number) =>
      cursos
        .filter((fila) => fila.idAsignacion === idAsignacion)
        .map((fila) => fila.idCurso)
        .sort();
    expect(resumen.grupos).toEqual({
      vanALaMitad: aLaMitad,
      yaCompletaron: completados,
      aunNoInician: sinIniciar,
    });
    expect(anteriores.filter((fila) => fila.estatus === 'activa')).toHaveLength(
      aLaMitad,
    );
    expect(
      anteriores.filter((fila) => fila.estatus === 'sustituida'),
    ).toHaveLength(sinIniciar);
    expect(nuevas).toHaveLength(completados + sinIniciar);
    expect(
      nuevas.filter(
        (fila) => cursosDe(fila.idAsignacion as number).join() === '2',
      ),
    ).toHaveLength(completados);
    expect(
      nuevas.filter(
        (fila) => cursosDe(fila.idAsignacion as number).join() === '1,2',
      ),
    ).toHaveLength(sinIniciar);
  });

  it('un fallo del motor no sale de la alta', async () => {
    const error = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const engine = new AssignmentEngineService(
      {
        $transaction: jest.fn().mockRejectedValue(new Error('falló el motor')),
      } as unknown as PrismaService,
      {
        getTrainingConfig: jest
          .fn()
          .mockResolvedValue(trainingConfigPorDefecto()),
      } as unknown as ConfigurationService,
      { emit: jest.fn() } as unknown as EventEmitter2,
    );
    await expect(
      engine.onEmpleado({
        tipo: 'ALTA',
        idTenant: 1,
        idEmpresa: 1,
        idEmpleado: 5,
      }),
    ).resolves.toBeUndefined();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});

function motor(
  modo: 'automatica' | 'con_aprobacion' = 'automatica',
  avisos?: { despachar: jest.Mock },
) {
  const memoria = new Memoria();
  const emit = jest.fn();
  const engine = new AssignmentEngineService(
    memoria.cliente() as unknown as PrismaService,
    {
      getTrainingConfig: jest.fn().mockResolvedValue({
        ...trainingConfigPorDefecto(),
        rutasModoAsignacion: modo,
      }),
    } as unknown as ConfigurationService,
    { emit } as unknown as EventEmitter2,
    avisos as never,
  );
  return { engine, memoria, emit };
}

function ruta(
  idRuta: number,
  idVersion: number,
  diaFin: number,
  alcance: { idSite?: number | null },
) {
  return {
    idRuta,
    nombre: `Ruta ${idRuta}`,
    idVersion,
    numero: 1,
    diaFin,
    cursos: [10],
    idSite: alcance.idSite ?? null,
  };
}

function rutaConCursos(
  idRuta: number,
  idVersion: number,
  numero: number,
  cursos: number[],
) {
  return {
    idRuta,
    nombre: `Ruta ${idRuta}`,
    idVersion,
    numero,
    diaFin: 20,
    cursos,
    idSite: null,
  };
}

function empleado(idEmpleado: number, idSite: number): Fila {
  return {
    idEmpleado,
    idEmpresa: 1,
    idTenant: 1,
    activo: true,
    idPuesto: null,
    idSite,
    nombre: 'Ana',
    primerApellido: 'López',
  };
}

function cursoAsync(idCurso: number, idSesion = 100): Fila {
  return {
    idCurso,
    idSesion,
    modalidad: 'online_asincrono',
    esPermanente: true,
    estatus: 'en_curso',
    nombre: `Curso ${idCurso}`,
  };
}

function cursoPresencial(idCurso: number): Fila {
  return {
    idCurso,
    idSesion: 100,
    modalidad: 'presencial',
    esPermanente: false,
    estatus: 'programado',
    nombre: `Curso ${idCurso}`,
  };
}

function sembrarEmpresa(
  memoria: Memoria,
  escena: {
    rutas: ReturnType<typeof ruta>[];
    empleados: Fila[];
    cursos: Fila[];
  },
) {
  for (const fila of escena.rutas) {
    memoria.tabla('rutaAprendizaje').filas.push({
      idRutaAprendizaje: fila.idRuta,
      idEmpresa: 1,
      idTenant: 1,
      nombre: fila.nombre,
      proposito: 'ingreso',
      activo: true,
    });
    memoria.tabla('rutaVersion').filas.push({
      idVersion: fila.idVersion,
      idRutaAprendizaje: fila.idRuta,
      numero: fila.numero,
      estado: 'publicada',
    });
    memoria.tabla('rutaAlcance').filas.push({
      idAlcance: fila.idVersion,
      idVersion: fila.idVersion,
      modo: 'incluir',
      idUnidadOperativa: null,
      estado: null,
      idSite: fila.idSite,
      idPuesto: null,
      idArea: null,
    });
    memoria.tabla('rutaEtapa').filas.push({
      idEtapa: fila.idVersion,
      idVersion: fila.idVersion,
      nombre: 'Etapa',
      diaInicio: 0,
      diaFin: fila.diaFin,
    });
    fila.cursos.forEach((idCurso, indice) => {
      memoria.tabla('rutaElemento').filas.push({
        idElemento: fila.idVersion * 10 + indice,
        idEtapa: fila.idVersion,
        idVersion: fila.idVersion,
        idCurso,
        obligatorio: true,
        vigenciaMeses: 12,
      });
    });
  }
  memoria.tabla('empleados').filas.push(...escena.empleados);
  memoria.tabla('catSites').filas.push({
    idSite: 3,
    idEmpresa: 1,
    Descripcion: 'Planta Monterrey',
    Estado: 'Nuevo León',
    idUnidadOperativa: null,
    EsPrincipal: true,
    zonaHoraria: 'America/Mexico_City',
  });
  for (const curso of escena.cursos) {
    memoria.tabla('catCursos').filas.push({
      idCursos: curso.idCurso,
      idEmpresa: 1,
      Descripcion: curso.nombre,
      esNormativoStps: false,
    });
    memoria.tabla('cursoSesiones').filas.push({
      idSesion: curso.idSesion,
      idCurso: curso.idCurso,
      idEmpresa: 1,
      modalidad: curso.modalidad,
      esPermanente: curso.esPermanente,
      estatus: curso.estatus,
      creadoEn: new Date('2026-11-01T00:00:00.000Z'),
      fechaInicioPeriodo: new Date('2026-11-01T00:00:00.000Z'),
      fechaFinPeriodo: null,
    });
    if (curso.modalidad === 'online_asincrono') {
      memoria.tabla('cursoContenidos').filas.push({
        idContenido: curso.idSesion,
        idSesion: curso.idSesion,
      });
    }
  }
}

class Memoria {
  private tablas = new Map<
    string,
    { pk: string; seq: number; filas: Fila[]; unicos: string[][] }
  >();

  tabla(nombre: string, pk = 'id', unicos: string[][] = []) {
    const actual = this.tablas.get(nombre);
    if (actual) {
      if (unicos.length > 0) actual.unicos = unicos;
      return actual;
    }
    const creada = { pk, seq: 1, filas: [] as Fila[], unicos };
    this.tablas.set(nombre, creada);
    return creada;
  }

  filas(nombre: string): Fila[] {
    return this.tabla(nombre).filas;
  }

  cliente() {
    const modelo = (nombre: string, pk: string, unicos: string[][] = []) => {
      this.tabla(nombre, pk, unicos);
      const tabla = () => this.tabla(nombre, pk, unicos);
      return {
        create: ({ data }: { data: Fila }) => {
          const fila = { ...data };
          if (fila[pk] == null) fila[pk] = tabla().seq++;
          else tabla().seq = Math.max(tabla().seq, Number(fila[pk]) + 1);
          exigirUnico(tabla(), fila);
          tabla().filas.push(fila);
          return { ...fila };
        },
        createMany: ({
          data,
          skipDuplicates,
        }: {
          data: Fila[];
          skipDuplicates?: boolean;
        }) => {
          let count = 0;
          for (const item of data) {
            if (skipDuplicates && duplicado(tabla(), item)) continue;
            const fila = { ...item };
            if (fila[pk] == null) fila[pk] = tabla().seq++;
            exigirUnico(tabla(), fila);
            tabla().filas.push(fila);
            count += 1;
          }
          return { count };
        },
        findMany: (args?: {
          where?: Record<string, unknown>;
          orderBy?: Record<string, 'asc' | 'desc'>;
          select?: Record<string, boolean>;
          distinct?: string[];
        }) => {
          let filas = tabla().filas.filter((fila) =>
            coincide(fila, args?.where),
          );
          if (args?.orderBy) filas = ordenar(filas, args.orderBy);
          if (args?.distinct?.length) {
            const vistas = new Set<unknown>();
            filas = filas.filter((fila) => {
              const clave = args.distinct
                ?.map((campo) => fila[campo])
                .join(':');
              if (vistas.has(clave)) return false;
              vistas.add(clave);
              return true;
            });
          }
          return filas.map((fila) => recortar(fila, args?.select));
        },
        findFirst: (args?: {
          where?: Record<string, unknown>;
          orderBy?: Record<string, 'asc' | 'desc'>;
        }) => {
          const filas = modelo(nombre, pk, unicos).findMany(args);
          return filas[0] ?? null;
        },
        update: ({
          where,
          data,
        }: {
          where: Record<string, unknown>;
          data: Fila;
        }) => {
          const fila = tabla().filas.find((item) => coincide(item, where));
          if (!fila)
            throw new Error(`No está ${nombre} ${JSON.stringify(where)}`);
          Object.assign(fila, data);
          return { ...fila };
        },
        updateMany: ({
          where,
          data,
        }: {
          where: Record<string, unknown>;
          data: Fila;
        }) => {
          let count = 0;
          for (const fila of tabla().filas) {
            if (!coincide(fila, where)) continue;
            Object.assign(fila, data);
            count += 1;
          }
          return { count };
        },
      };
    };
    const prisma = {
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma),
      empleados: modelo('empleados', 'idEmpleado'),
      relEmpleadosSites: modelo('relEmpleadosSites', 'idRel'),
      catPuestos: modelo('catPuestos', 'idPuesto'),
      catSites: modelo('catSites', 'idSite'),
      rutaAprendizaje: modelo('rutaAprendizaje', 'idRutaAprendizaje'),
      rutaVersion: modelo('rutaVersion', 'idVersion'),
      rutaAlcance: modelo('rutaAlcance', 'idAlcance'),
      rutaEtapa: modelo('rutaEtapa', 'idEtapa'),
      rutaElemento: modelo('rutaElemento', 'idElemento'),
      rutaAsignacion: modelo('rutaAsignacion', 'idAsignacion', [
        ['idEmpleado', 'idVersion'],
      ]),
      rutaAsignacionCurso: modelo('rutaAsignacionCurso', 'idAsignacionCurso'),
      rutaLote: modelo('rutaLote', 'idLote'),
      cursoSesiones: modelo('cursoSesiones', 'idSesion'),
      cursoContenidos: modelo('cursoContenidos', 'idContenido'),
      cursoParticipantes: modelo('cursoParticipantes', 'idParticipante', [
        ['idSesion', 'idEmpleado'],
      ]),
      cursoSeguimientoParticipante: modelo(
        'cursoSeguimientoParticipante',
        'idSeguimiento',
      ),
      catCursos: modelo('catCursos', 'idCursos'),
    };
    return prisma;
  }
}

function coincide(fila: Fila, where?: Record<string, unknown>): boolean {
  if (!where) return true;
  for (const [clave, cond] of Object.entries(where)) {
    if (clave === 'OR' && Array.isArray(cond)) {
      if (
        !cond.some((parte) => coincide(fila, parte as Record<string, unknown>))
      )
        return false;
      continue;
    }
    if (clave === 'AND' && Array.isArray(cond)) {
      if (
        !cond.every((parte) => coincide(fila, parte as Record<string, unknown>))
      )
        return false;
      continue;
    }
    const valor = fila[clave];
    if (cond !== null && typeof cond === 'object' && !(cond instanceof Date)) {
      const filtro = cond as Record<string, unknown>;
      if ('in' in filtro && !(filtro.in as unknown[]).includes(valor))
        return false;
      if ('notIn' in filtro && (filtro.notIn as unknown[]).includes(valor))
        return false;
      if ('not' in filtro && valor === filtro.not) return false;
      if ('lt' in filtro && !anterior(valor, filtro.lt)) return false;
      if ('lte' in filtro && !anterior(valor, filtro.lte, true)) return false;
      if ('gt' in filtro && !anterior(filtro.gt, valor)) return false;
      if ('gte' in filtro && !anterior(filtro.gte, valor, true)) return false;
      continue;
    }
    if (valor !== cond) return false;
  }
  return true;
}

function anterior(valor: unknown, limite: unknown, igual = false): boolean {
  const a = instante(valor);
  const b = instante(limite);
  if (a == null || b == null) return false;
  return igual ? a <= b : a < b;
}

function comoTexto(valor: unknown): string {
  if (typeof valor === 'string') return valor;
  if (typeof valor === 'number' || typeof valor === 'boolean')
    return String(valor);
  return '';
}

function instante(valor: unknown): number | null {
  if (valor instanceof Date) return valor.getTime();
  if (typeof valor === 'number') return valor;
  if (typeof valor === 'string') {
    const tiempo = Date.parse(valor);
    return Number.isNaN(tiempo) ? null : tiempo;
  }
  return null;
}

function ordenar(
  filas: Fila[],
  orderBy: Record<string, 'asc' | 'desc'>,
): Fila[] {
  const [clave, direccion] = Object.entries(orderBy)[0];
  return [...filas].sort((a, b) => {
    const va = instante(a[clave]);
    const vb = instante(b[clave]);
    const cmp =
      va != null && vb != null
        ? va - vb
        : comoTexto(a[clave]).localeCompare(comoTexto(b[clave]));
    return direccion === 'desc' ? -cmp : cmp;
  });
}

function recortar(fila: Fila, select?: Record<string, boolean>): Fila {
  if (!select) return { ...fila };
  const copia: Fila = {};
  for (const [clave, incluir] of Object.entries(select)) {
    if (incluir) copia[clave] = fila[clave];
  }
  return copia;
}

function duplicado(
  tabla: { unicos: string[][]; filas: Fila[] },
  fila: Fila,
): boolean {
  return tabla.unicos.some((campos) =>
    tabla.filas.some((actual) =>
      campos.every((campo) => actual[campo] === fila[campo]),
    ),
  );
}

function exigirUnico(tabla: { unicos: string[][]; filas: Fila[] }, fila: Fila) {
  if (duplicado(tabla, fila)) throw new Error('Registro duplicado');
}
