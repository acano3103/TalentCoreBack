import { Test, TestingModule } from '@nestjs/testing';
import { CareerPlanService } from './career-plan.service';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { reiniciarAvisosUmbral } from './career-plan.avance';
import { ConfigurationService } from '../configuration/configuration.service';
import { InternalMovementsService } from '../internal-movements/internal-movements.service';

jest.mock('../../prisma/prisma.service', () => ({
  __esModule: true,
  PrismaService: jest.fn(),
}));

import { PrismaService } from '../../prisma/prisma.service';

function buildMockPrisma() {
  const mocks = {
    relPuestoRuta: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    planCarreraColaborador: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      groupBy: jest.fn().mockResolvedValue([]),
    },
    empleados: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
      groupBy: jest.fn().mockResolvedValue([]),
    },
    catPuestos: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
    },
    relPuestoCurso: { findMany: jest.fn().mockResolvedValue([]) },
    cursoSesiones: { findMany: jest.fn().mockResolvedValue([]) },
    cursoParticipantes: { findMany: jest.fn().mockResolvedValue([]) },
    cursoSeguimientoParticipante: { findMany: jest.fn().mockResolvedValue([]) },
    catCursos: { findMany: jest.fn().mockResolvedValue([]) },
    catSites: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
    movimientosInternos: { findMany: jest.fn().mockResolvedValue([]) },
    relPuestosUbicaciones: { findMany: jest.fn().mockResolvedValue([]) },
    relUsuarioRol: { findMany: jest.fn().mockResolvedValue([{ idRol: 1 }]) },
    relRolPermisos: { findFirst: jest.fn().mockResolvedValue({ id: 1 }) },
    rutaAprendizaje: {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    rutaVersion: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    rutaElemento: {
      findMany: jest.fn().mockResolvedValue([]),
      groupBy: jest.fn().mockResolvedValue([]),
    },
    rutaAsignacionCurso: { findMany: jest.fn().mockResolvedValue([]) },
    catTipoMovimiento: { findMany: jest.fn().mockResolvedValue([]) },
    configuracionEmpresa: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    catEmpresas: {
      findUnique: jest.fn().mockResolvedValue({ razon_social: 'ACME' }),
    },
    historicoMovimientos: {
      create: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
  return { mocks, prisma: { ...mocks } as unknown as PrismaService };
}

const activeUser = {
  id: 1,
  uuid: 'user-uuid-1',
  username: 'admin',
  first_name: 'Ana',
  last_name: 'Lopez',
};

function participacionCurso(
  idSesion: number,
  calificacionFinal: number | null,
) {
  return {
    idParticipante: idSesion,
    idSesion,
    idEmpleado: 10,
    estatusAsignacion: 'completado',
    calificacionFinal,
  };
}

function postulacion(overrides: Record<string, unknown> = {}) {
  return {
    idPlanCarrera: 1,
    idEmpleado: 10,
    idRuta: 1,
    idPuestoActual: 100,
    idPuestoObjetivo: 200,
    estatus: 'en_preparacion',
    fechaInscripcion: new Date('2026-01-01'),
    fechaPromocion: null,
    usuarioRegistro: 'user-uuid-1',
    ...overrides,
  };
}

describe('CareerPlanService', () => {
  let service: CareerPlanService;
  let configuration: ConfigurationService;
  let movimientosSvc: { createMovementRequest: jest.Mock };
  let mocks: ReturnType<typeof buildMockPrisma>['mocks'];

  beforeEach(async () => {
    reiniciarAvisosUmbral();
    const built = buildMockPrisma();
    mocks = built.mocks;
    movimientosSvc = { createMovementRequest: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CareerPlanService,
        ConfigurationService,
        { provide: PrismaService, useValue: built.prisma },
        {
          provide: InternalMovementsService,
          useValue: movimientosSvc,
        },
      ],
    }).compile();

    service = module.get<CareerPlanService>(CareerPlanService);
    configuration = module.get<ConfigurationService>(ConfigurationService);
  });

  function conRequisitosListos() {
    mocks.empleados.findMany.mockResolvedValue([
      {
        idEmpleado: 10,
        nombre: 'Ana',
        primerApellido: 'Lopez',
        segundoApellido: null,
        idPuesto: 100,
        correo: 'a@x.com',
        idSite: 5,
        fechaIngreso: new Date('2020-01-01'),
        idJefeInmediato: null,
      },
    ]);
    mocks.relPuestosUbicaciones.findMany.mockResolvedValue([
      { idPuesto: 200, idSite: 5, PlazasAutorizadas: 3 },
    ]);
    mocks.empleados.groupBy.mockResolvedValue([
      { idPuesto: 200, idSite: 5, _count: { _all: 1 } },
    ]);
    mocks.catSites.findMany.mockResolvedValue([
      { idSite: 5, Descripcion: 'Planta' },
    ]);
  }

  describe('findColaboradores', () => {
    const malla = [
      { idPuesto: 200, idCurso: 1000, idTipoCurso: 3, activo: true },
      { idPuesto: 200, idCurso: 1001, idTipoCurso: 3, activo: true },
    ];

    beforeEach(() => {
      mocks.relPuestoRuta.findMany.mockResolvedValue([{ idRuta: 1 }]);
      mocks.planCarreraColaborador.findMany.mockResolvedValue([postulacion()]);
      mocks.empleados.findMany.mockResolvedValue([
        {
          idEmpleado: 10,
          nombre: 'Ana',
          primerApellido: 'Lopez',
          segundoApellido: null,
          idPuesto: 100,
          correo: 'a@x.com',
        },
      ]);
      mocks.catPuestos.findMany.mockResolvedValue([
        { idPuesto: 100, NombrePuesto: 'Analista' },
        { idPuesto: 200, NombrePuesto: 'Líder' },
      ]);
      mocks.relPuestoCurso.findMany.mockResolvedValue(malla);
      mocks.cursoSesiones.findMany.mockResolvedValue([
        { idSesion: 1, idCurso: 1000 },
        { idSesion: 2, idCurso: 1001 },
      ]);
      mocks.configuracionEmpresa.findMany.mockResolvedValue([]);
      mocks.catCursos.findMany.mockResolvedValue([]);
    });

    it('devuelve avance 0% sin participantes (umbral default 70)', async () => {
      mocks.cursoParticipantes.findMany.mockResolvedValue([]);

      const {
        colaboradores: [result],
      } = await service.findColaboradores(1);

      expect(result.porcentajeAvance).toBe(0);
      expect(result.totalCursos).toBe(2);
      expect(result.cursosAprobados).toBe(0);
      expect(result.estatus).toBe('en_preparacion');
      expect(result.puestoActual).toBe('Analista');
      expect(result.puestoObjetivo).toBe('Líder');
    });

    it('computa avance parcial 50% y mantiene en_preparacion', async () => {
      mocks.cursoParticipantes.findMany.mockResolvedValue([
        {
          idParticipante: 1,
          idSesion: 1,
          idEmpleado: 10,
          estatusAsignacion: 'completado',
          calificacionFinal: 90,
        },
      ]);

      const {
        colaboradores: [result],
      } = await service.findColaboradores(1);

      expect(result.porcentajeAvance).toBe(25);
      expect(result.cursosAprobados).toBe(1);
      expect(result.estatus).toBe('en_preparacion');
      expect(mocks.planCarreraColaborador.update).not.toHaveBeenCalled();
    });

    it('deriva listo_para_ascenso al 100% y persiste el estatus', async () => {
      conRequisitosListos();
      mocks.cursoParticipantes.findMany.mockResolvedValue([
        {
          idParticipante: 1,
          idSesion: 1,
          idEmpleado: 10,
          estatusAsignacion: 'completado',
          calificacionFinal: 90,
        },
        {
          idParticipante: 2,
          idSesion: 2,
          idEmpleado: 10,
          estatusAsignacion: 'completado',
          calificacionFinal: 95,
        },
      ]);
      mocks.planCarreraColaborador.update.mockResolvedValue({});

      const {
        colaboradores: [result],
      } = await service.findColaboradores(1);

      expect(result.porcentajeAvance).toBe(100);
      expect(result.estatus).toBe('listo_para_ascenso');
      expect(mocks.planCarreraColaborador.update).toHaveBeenCalledWith({
        where: { idPlanCarrera: 1 },
        data: expect.objectContaining({
          estatus: 'listo_para_ascenso',
          fechaListo: expect.any(Date) as Date,
        }) as object,
      });
    });

    it('una calificación 9.5 cumple el requisito cuando el umbral es 70', async () => {
      mocks.cursoParticipantes.findMany.mockResolvedValue([
        participacionCurso(1, 9.5),
      ]);

      const {
        colaboradores: [result],
      } = await service.findColaboradores(1);

      expect(result.cursosAprobados).toBe(1);
      expect(result.porcentajeAvance).toBe(25);
    });

    it('respeta el umbral configurado por empresa (calificacion 50 < umbral 90 no cuenta)', async () => {
      mocks.configuracionEmpresa.findMany.mockResolvedValue([
        {
          idEmpresa: 1,
          clave: 'calificacion_aprobatoria',
          valor: '90',
        },
      ]);
      mocks.cursoParticipantes.findMany.mockResolvedValue([
        {
          idParticipante: 1,
          idSesion: 1,
          idEmpleado: 10,
          estatusAsignacion: 'completado',
          calificacionFinal: 50,
        },
      ]);

      const {
        colaboradores: [result],
      } = await service.findColaboradores(1);

      expect(result.cursosAprobados).toBe(0);
      expect(result.porcentajeAvance).toBe(0);
    });

    it('sin configurar aprueba desde 70 y no avisa', async () => {
      const warn = jest
        .spyOn(configuration['logger'], 'warn')
        .mockImplementation(() => undefined);
      mocks.cursoParticipantes.findMany.mockResolvedValue([
        participacionCurso(1, 69),
        participacionCurso(2, 70),
      ]);

      const {
        colaboradores: [result],
      } = await service.findColaboradores(1);

      expect(result.cursosAprobados).toBe(1);
      expect(result.porcentajeAvance).toBe(25);
      expect(warn).not.toHaveBeenCalled();
      warn.mockRestore();
    });

    it('interpreta un 8 configurado como 80 y avisa una sola vez', async () => {
      const warn = jest
        .spyOn(configuration['logger'], 'warn')
        .mockImplementation(() => undefined);
      mocks.configuracionEmpresa.findMany.mockResolvedValue([
        {
          idEmpresa: 1,
          clave: 'calificacion_aprobatoria',
          valor: '8',
        },
      ]);
      mocks.cursoParticipantes.findMany.mockResolvedValue([
        participacionCurso(1, 79),
        participacionCurso(2, 80),
      ]);

      const {
        colaboradores: [primero],
      } = await service.findColaboradores(1);
      const {
        colaboradores: [segundo],
      } = await service.findColaboradores(1);
      const { planes } = await service.findPlanesEmpleado(1, 10);

      expect(primero.cursosAprobados).toBe(1);
      expect(primero.porcentajeAvance).toBe(25);
      expect(segundo.porcentajeAvance).toBe(25);
      expect(planes[0].porcentaje).toBe(primero.porcentajeAvance);
      expect(planes[0].aprobados).toBe(primero.cursosAprobados);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0][0])).toContain(
        'calificacion_aprobatoria=8',
      );
      warn.mockRestore();
    });

    it('respeta un umbral 85 en escala 0-100', async () => {
      const warn = jest
        .spyOn(service['logger'], 'warn')
        .mockImplementation(() => undefined);
      mocks.configuracionEmpresa.findMany.mockResolvedValue([
        {
          idEmpresa: 1,
          clave: 'calificacion_aprobatoria',
          valor: '85',
        },
      ]);
      mocks.cursoParticipantes.findMany.mockResolvedValue([
        participacionCurso(1, 84),
        participacionCurso(2, 85),
      ]);

      const {
        colaboradores: [result],
      } = await service.findColaboradores(1);
      const { planes } = await service.findPlanesEmpleado(1, 10);

      expect(result.cursosAprobados).toBe(1);
      expect(result.porcentajeAvance).toBe(25);
      expect(planes[0].porcentaje).toBe(25);
      expect(planes[0].aprobados).toBe(1);
      expect(warn).not.toHaveBeenCalled();
      warn.mockRestore();
    });

    it('completado sin calificacion cuenta como aprobado', async () => {
      conRequisitosListos();
      mocks.cursoParticipantes.findMany.mockResolvedValue([
        {
          idParticipante: 1,
          idSesion: 1,
          idEmpleado: 10,
          estatusAsignacion: 'completado',
          calificacionFinal: null,
        },
        {
          idParticipante: 2,
          idSesion: 2,
          idEmpleado: 10,
          estatusAsignacion: 'completado',
          calificacionFinal: null,
        },
      ]);
      mocks.planCarreraColaborador.update.mockResolvedValue({});

      const {
        colaboradores: [result],
      } = await service.findColaboradores(1);

      expect(result.porcentajeAvance).toBe(100);
      expect(result.estatus).toBe('listo_para_ascenso');
    });

    it('no persiste cuando la postulacion ya esta promovida', async () => {
      mocks.planCarreraColaborador.findMany.mockResolvedValue([
        postulacion({ estatus: 'promovido', fechaPromocion: new Date() }),
      ]);
      mocks.cursoParticipantes.findMany.mockResolvedValue([
        {
          idParticipante: 1,
          idSesion: 1,
          idEmpleado: 10,
          estatusAsignacion: 'completado',
          calificacionFinal: 90,
        },
        {
          idParticipante: 2,
          idSesion: 2,
          idEmpleado: 10,
          estatusAsignacion: 'completado',
          calificacionFinal: 90,
        },
      ]);

      const {
        colaboradores: [result],
      } = await service.findColaboradores(1);

      expect(result.estatus).toBe('promovido');
      expect(mocks.planCarreraColaborador.update).not.toHaveBeenCalled();
    });

    it('devuelve [] cuando no hay rutas', async () => {
      mocks.relPuestoRuta.findMany.mockResolvedValue([]);
      await expect(service.findColaboradores(1)).resolves.toEqual({
        colaboradores: [],
        kpis: {
          enPlan: 0,
          listosAhora: 0,
          enRiesgo: 0,
          nominados: 0,
          promovidosEsteAnio: 0,
        },
      });
    });
  });

  describe('findPlanesEmpleado', () => {
    it('devuelve planes vacíos cuando el empleado no tiene plan', async () => {
      mocks.relPuestoRuta.findMany.mockResolvedValue([{ idRuta: 1 }]);
      mocks.planCarreraColaborador.findMany.mockResolvedValue([]);

      await expect(service.findPlanesEmpleado(1, 10)).resolves.toEqual({
        planes: [],
      });
      await expect(service.resumenEmpleado(1, 10)).resolves.toBeNull();
      await expect(service.contarRutasCompletas(1, 10)).resolves.toBe(0);
    });

    it('idSesion apunta a la sesión más reciente del empleado para el curso', async () => {
      conRequisitosListos();
      mocks.relPuestoRuta.findMany.mockResolvedValue([{ idRuta: 1 }]);
      mocks.planCarreraColaborador.findMany.mockResolvedValue([postulacion()]);
      mocks.planCarreraColaborador.update.mockResolvedValue({});
      mocks.catPuestos.findMany.mockResolvedValue([
        { idPuesto: 100, NombrePuesto: 'Analista' },
        { idPuesto: 200, NombrePuesto: 'Líder' },
      ]);
      mocks.relPuestoCurso.findMany.mockResolvedValue([
        { idPuesto: 200, idCurso: 1000, idTipoCurso: 3, activo: true },
      ]);
      mocks.catCursos.findMany.mockResolvedValue([
        { idCursos: 1000, Descripcion: 'Liderazgo' },
      ]);
      mocks.cursoSesiones.findMany.mockResolvedValue([
        {
          idSesion: 9,
          idCurso: 1000,
          fechaInicioPeriodo: new Date('2026-01-01T00:00:00.000Z'),
        },
        {
          idSesion: 2,
          idCurso: 1000,
          fechaInicioPeriodo: new Date('2026-06-01T00:00:00.000Z'),
        },
      ]);
      mocks.cursoParticipantes.findMany.mockResolvedValue([
        {
          idParticipante: 1,
          idSesion: 9,
          idEmpleado: 10,
          estatusAsignacion: 'completado',
          calificacionFinal: 90,
        },
        {
          idParticipante: 2,
          idSesion: 2,
          idEmpleado: 10,
          estatusAsignacion: 'inscrito',
          calificacionFinal: null,
        },
      ]);
      mocks.configuracionEmpresa.findMany.mockResolvedValue([]);

      const { planes } = await service.findPlanesEmpleado(1, 10);

      expect(planes).toHaveLength(1);
      expect(planes[0]).toMatchObject({
        idPlanCarrera: 1,
        estatus: 'listo_para_ascenso',
        puestoActual: 'Analista',
        puestoObjetivo: 'Líder',
        fechaInscripcion: '2026-01-01T00:00:00.000Z',
        fechaPromocion: null,
        porcentaje: 100,
        aprobados: 1,
        total: 1,
      });
      expect(planes[0].cursos[0]).toEqual({
        idCurso: 1000,
        nombre: 'Liderazgo',
        estatus: 'completado',
        calificacion: 90,
        idSesion: 2,
      });
      expect(mocks.planCarreraColaborador.update).toHaveBeenCalledWith({
        where: { idPlanCarrera: 1 },
        data: expect.objectContaining({
          estatus: 'listo_para_ascenso',
          fechaListo: expect.any(Date) as Date,
        }) as object,
      });
      await expect(service.contarRutasCompletas(1, 10)).resolves.toBe(1);
      await expect(service.resumenEmpleado(1, 10)).resolves.toEqual({
        puestoObjetivo: 'Líder',
        porcentaje: 100,
        estatus: 'listo_para_ascenso',
      });
    });
  });

  describe('createPostulacion', () => {
    beforeEach(() => {
      mocks.relPuestoRuta.findFirst.mockResolvedValue({
        idRuta: 1,
        idEmpresa: 1,
        idPuestoOrigen: 100,
        idPuestoDestino: 200,
        activo: true,
      });
      mocks.empleados.findFirst.mockResolvedValue({
        idEmpleado: 10,
        idEmpresa: 1,
        idPuesto: 100,
        activo: true,
      });
      mocks.planCarreraColaborador.findFirst.mockResolvedValue(null);
      mocks.planCarreraColaborador.create.mockResolvedValue(postulacion());
      mocks.historicoMovimientos.create.mockResolvedValue({});
    });

    it('rechaza ruta inexistente o inactiva', async () => {
      mocks.relPuestoRuta.findFirst.mockResolvedValue(null);
      await expect(
        service.createPostulacion(
          1,
          { idEmpleado: 10, idRuta: 1 },
          activeUser as never,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rechaza colaborador sin puesto asignado', async () => {
      mocks.empleados.findFirst.mockResolvedValue({
        idEmpleado: 10,
        idPuesto: null,
      });
      await expect(
        service.createPostulacion(
          1,
          { idEmpleado: 10, idRuta: 1 },
          activeUser as never,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rechaza duplicados (empleado+ruta)', async () => {
      mocks.planCarreraColaborador.findFirst.mockResolvedValue(postulacion());
      await expect(
        service.createPostulacion(
          1,
          { idEmpleado: 10, idRuta: 1 },
          activeUser as never,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('crea con snapshots de puestos y registra historico', async () => {
      const result = await service.createPostulacion(
        1,
        { idEmpleado: 10, idRuta: 1 },
        activeUser as never,
      );

      expect(mocks.planCarreraColaborador.create).toHaveBeenCalledWith({
        data: {
          idEmpleado: 10,
          idRuta: 1,
          idPuestoActual: 100,
          idPuestoObjetivo: 200,
          estatus: 'en_preparacion',
          usuarioRegistro: 'user-uuid-1',
          origen: 'rh',
        },
      });
      expect(mocks.historicoMovimientos.create).toHaveBeenCalled();
      expect(result.idPlanCarrera).toBe(1);
    });
  });

  describe('findColaborador', () => {
    it('lanza NotFound si la postulacion no existe', async () => {
      mocks.planCarreraColaborador.findUnique.mockResolvedValue(null);
      await expect(service.findColaborador(1, 999)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('lanza NotFound si el empleado no pertenece a la empresa', async () => {
      mocks.planCarreraColaborador.findUnique.mockResolvedValue(postulacion());
      mocks.empleados.findFirst.mockResolvedValue(null);
      await expect(service.findColaborador(1, 1)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('desglosa curso por curso con estatus y aprobacion', async () => {
      mocks.planCarreraColaborador.findUnique.mockResolvedValue(postulacion());
      mocks.empleados.findFirst.mockResolvedValue({
        idEmpleado: 10,
        nombre: 'Ana',
        primerApellido: 'Lopez',
        segundoApellido: null,
      });
      mocks.catPuestos.findUnique.mockResolvedValue({ NombrePuesto: 'Líder' });
      mocks.relPuestoCurso.findMany.mockResolvedValue([
        { idCurso: 1000, idPuesto: 200, idTipoCurso: 3, activo: true },
        { idCurso: 1001, idPuesto: 200, idTipoCurso: 3, activo: true },
      ]);
      mocks.catCursos.findMany.mockResolvedValue([
        {
          idCursos: 1000,
          Descripcion: 'Liderazgo',
          CatTipoCurso: { idTipoCurso: 3, Descripcion: 'Upskilling' },
        },
        {
          idCursos: 1001,
          Descripcion: 'Comunicación',
          CatTipoCurso: { idTipoCurso: 3, Descripcion: 'Upskilling' },
        },
      ]);
      mocks.cursoSesiones.findMany.mockResolvedValue([
        { idSesion: 1, idCurso: 1000 },
        { idSesion: 2, idCurso: 1001 },
      ]);
      mocks.cursoParticipantes.findMany.mockResolvedValue([
        {
          idParticipante: 1,
          idSesion: 1,
          idEmpleado: 10,
          estatusAsignacion: 'completado',
          calificacionFinal: 90,
        },
      ]);
      mocks.configuracionEmpresa.findMany.mockResolvedValue([]);

      const result = await service.findColaborador(1, 1);

      expect(result.porcentajeAvance).toBe(25);
      expect(result.estatus).toBe('en_preparacion');
      expect(result.cursos).toHaveLength(2);
      expect(result.cursos[0]).toMatchObject({
        idCurso: 1000,
        descripcion: 'Liderazgo',
        estatus: 'completado',
        calificacion: 90,
        aprobado: true,
      });
      expect(result.cursos[1]).toMatchObject({
        idCurso: 1001,
        estatus: 'pendiente',
        aprobado: false,
      });
    });
  });

  describe('GET routes', () => {
    it('conserva los campos de antes y agrega tipo, antigüedad y ruta', async () => {
      mocks.relPuestoRuta.findMany.mockResolvedValue([
        {
          idRuta: 1,
          idPuestoOrigen: 100,
          idPuestoDestino: 200,
          fechaRegistro: new Date('2026-01-01T00:00:00.000Z'),
          tipo: 'ascenso',
          antiguedadMinimaMeses: 12,
          idRutaAprendizaje: null,
        },
      ]);
      mocks.catPuestos.findMany.mockResolvedValue([
        { idPuesto: 100, NombrePuesto: 'Analista' },
        { idPuesto: 200, NombrePuesto: 'Líder' },
      ]);
      mocks.relPuestoCurso.findMany.mockResolvedValue([
        { idPuesto: 200, idCurso: 1000 },
      ]);
      mocks.catCursos.findMany.mockResolvedValue([
        { idCursos: 1000, Descripcion: 'Liderazgo' },
      ]);
      mocks.planCarreraColaborador.groupBy.mockResolvedValue([
        { idRuta: 1, _count: { _all: 2 } },
      ]);

      const [ruta] = await service.findRoutes(1);

      expect(ruta).toMatchObject({
        idRuta: 1,
        idPuestoOrigen: 100,
        idPuestoDestino: 200,
        puestoOrigen: 'Analista',
        puestoDestino: 'Líder',
        totalColaboradores: 2,
        cursos: [{ idCurso: 1000, descripcion: 'Liderazgo' }],
        tipo: 'ascenso',
        antiguedadMinimaMeses: 12,
        idRutaAprendizaje: null,
        rutaAprendizaje: null,
      });
      expect(ruta.fechaRegistro).toEqual(new Date('2026-01-01T00:00:00.000Z'));
    });
  });

  describe('postular y nominar', () => {
    it('un jefe que no es el jefe del empleado recibe 403', async () => {
      mocks.relPuestoRuta.findFirst.mockResolvedValue({
        idRuta: 1,
        idEmpresa: 1,
        idPuestoOrigen: 100,
        idPuestoDestino: 200,
        activo: true,
      });
      mocks.relUsuarioRol.findMany.mockResolvedValue([]);
      mocks.relRolPermisos.findFirst.mockResolvedValue(null);
      mocks.empleados.findFirst.mockImplementation(
        (args: { where?: { idUsuario?: number } }) => {
          if (args.where?.idUsuario) return Promise.resolve({ idEmpleado: 77 });
          return Promise.resolve({
            idEmpleado: 10,
            idEmpresa: 1,
            idPuesto: 100,
            activo: true,
            idJefeInmediato: 50,
          });
        },
      );

      const error = await service
        .createPostulacion(
          1,
          { idEmpleado: 10, idRuta: 1 },
          activeUser as never,
        )
        .catch((falla: unknown) => falla);

      expect(error).toBeInstanceOf(ForbiddenException);
      expect((error as ForbiddenException).getStatus()).toBe(403);
    });

    it('nominar sin plaza responde 409 SIN_PLAZA', async () => {
      mocks.planCarreraColaborador.findUnique.mockResolvedValue(
        postulacion({ estatus: 'listo_para_ascenso' }),
      );
      mocks.relPuestoRuta.findFirst.mockResolvedValue({
        idRuta: 1,
        idEmpresa: 1,
        idPuestoOrigen: 100,
        idPuestoDestino: 200,
        tipo: 'ascenso',
        activo: true,
      });
      mocks.relPuestoRuta.findMany.mockResolvedValue([
        {
          idRuta: 1,
          idPuestoOrigen: 100,
          idPuestoDestino: 200,
          tipo: 'ascenso',
          antiguedadMinimaMeses: 0,
        },
      ]);
      mocks.empleados.findFirst.mockResolvedValue({
        idEmpleado: 10,
        idEmpresa: 1,
        idPuesto: 100,
        idSite: 5,
        idJefeInmediato: null,
        activo: true,
        fechaIngreso: new Date('2020-01-01'),
      });
      mocks.configuracionEmpresa.findMany.mockResolvedValue([]);

      const error = await service
        .nominate(1, 1, {}, activeUser as never)
        .catch((falla: unknown) => falla);

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getStatus()).toBe(409);
      expect((error as ConflictException).getResponse()).toEqual(
        expect.objectContaining({ code: 'SIN_PLAZA', codigo: 'SIN_PLAZA' }),
      );
      expect(movimientosSvc.createMovementRequest).not.toHaveBeenCalled();
    });
  });

  describe('cierre con el movimiento', () => {
    it('aplicarlo deja el plan en promovido', async () => {
      mocks.planCarreraColaborador.updateMany.mockResolvedValue({ count: 1 });

      await service.onMovimiento({
        tipo: 'APLICADO',
        idEmpresa: 1,
        idPlanCarrera: 4,
        idMovimiento: 9,
        idUsuario: 1,
        fechaEfectiva: null,
      });

      expect(mocks.planCarreraColaborador.updateMany).toHaveBeenCalledWith({
        where: {
          idPlanCarrera: 4,
          estatus: {
            in: [
              'nominado',
              'listo_para_ascenso',
              'en_riesgo',
              'en_preparacion',
            ],
          },
        },
        data: expect.objectContaining({
          estatus: 'promovido',
          idMovimiento: 9,
          fechaPromocion: expect.any(Date) as Date,
        }) as object,
      });
    });

    it('rechazarlo regresa el plan a listo_para_ascenso', async () => {
      mocks.planCarreraColaborador.updateMany.mockResolvedValue({ count: 1 });

      await service.onMovimiento({
        tipo: 'RECHAZADO',
        idEmpresa: 1,
        idPlanCarrera: 4,
        idMovimiento: 9,
        idUsuario: 1,
      });

      expect(mocks.planCarreraColaborador.updateMany).toHaveBeenCalledWith({
        where: { idPlanCarrera: 4, estatus: 'nominado' },
        data: { estatus: 'listo_para_ascenso', idMovimiento: null },
      });
    });
  });

  describe('riesgo de la ruta fijada', () => {
    beforeEach(() => {
      mocks.relPuestoRuta.findMany.mockResolvedValue([
        {
          idRuta: 1,
          idPuestoOrigen: 100,
          idPuestoDestino: 200,
          idRutaAprendizaje: 9,
          antiguedadMinimaMeses: 0,
          tipo: 'ascenso',
        },
      ]);
      mocks.empleados.findMany.mockResolvedValue([
        {
          idEmpleado: 10,
          nombre: 'Ana',
          primerApellido: 'Lopez',
          segundoApellido: null,
          idPuesto: 100,
          correo: 'a@x.com',
          idSite: 5,
          fechaIngreso: new Date('2020-01-01'),
        },
      ]);
      mocks.catPuestos.findMany.mockResolvedValue([
        { idPuesto: 100, NombrePuesto: 'Analista' },
        { idPuesto: 200, NombrePuesto: 'Líder' },
      ]);
      mocks.rutaVersion.findMany.mockResolvedValue([
        {
          idVersion: 30,
          idRutaAprendizaje: 9,
          numero: 1,
          estado: 'publicada',
        },
      ]);
      mocks.rutaElemento.findMany.mockResolvedValue([
        { idVersion: 30, idCurso: 1000, vigenciaMeses: 12 },
      ]);
      mocks.catCursos.findMany.mockResolvedValue([
        { idCursos: 1000, Descripcion: 'Norma' },
      ]);
      mocks.cursoSesiones.findMany.mockResolvedValue([
        { idSesion: 1, idCurso: 1000 },
      ]);
      mocks.cursoParticipantes.findMany.mockResolvedValue([
        {
          idParticipante: 1,
          idSesion: 1,
          idEmpleado: 10,
          estatusAsignacion: 'completado',
          calificacionFinal: 90,
        },
      ]);
      mocks.planCarreraColaborador.update.mockResolvedValue({});
      mocks.configuracionEmpresa.findMany.mockResolvedValue([]);
    });

    it('el plan en riesgo de la app trae la fecha límite y el curso vencido', async () => {
      mocks.planCarreraColaborador.findMany.mockResolvedValue([
        postulacion({
          estatus: 'en_riesgo',
          idVersionRuta: 30,
          fechaLimiteRenovacion: new Date('2099-01-01T00:00:00.000Z'),
        }),
      ]);
      mocks.rutaAsignacionCurso.findMany.mockResolvedValue([
        {
          idCurso: 1000,
          estado: 'vencido',
          venceVigencia: new Date('2020-01-01T00:00:00.000Z'),
          RutaAsignacion: { idEmpleado: 10, idVersion: 30 },
        },
      ]);

      const { planes } = await service.findPlanesEmpleado(1, 10);

      expect(planes[0]).toMatchObject({
        idPlanCarrera: 1,
        estatus: 'en_riesgo',
        puestoActual: 'Analista',
        puestoObjetivo: 'Líder',
        porcentaje: expect.any(Number) as number,
        fechaLimiteRenovacion: '2099-01-01',
        cursoVencido: { idCurso: 1000, nombre: 'Norma', idSesion: 1 },
        nivelPreparacion: expect.any(String) as string,
      });
      expect(planes[0].cursos[0]).toEqual({
        idCurso: 1000,
        nombre: 'Norma',
        estatus: 'completado',
        calificacion: 90,
        idSesion: 1,
      });
      expect(planes[0].requisitos).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            tipo: 'curso',
            titulo: 'Norma',
            estado: 'vencido',
          }),
          expect.objectContaining({
            tipo: 'evaluacion_jefe',
            estado: 'proximamente',
          }),
        ]),
      );
    });

    it('listo_para_ascenso pasa a en_riesgo si el curso obligatorio venció', async () => {
      mocks.planCarreraColaborador.findMany.mockResolvedValue([
        postulacion({ estatus: 'listo_para_ascenso', idVersionRuta: 30 }),
      ]);
      mocks.rutaAsignacionCurso.findMany.mockResolvedValue([
        {
          idCurso: 1000,
          estado: 'vencido',
          venceVigencia: new Date('2020-01-01'),
          RutaAsignacion: { idEmpleado: 10, idVersion: 30 },
        },
      ]);

      const {
        colaboradores: [result],
      } = await service.findColaboradores(1);

      expect(result.estatus).toBe('en_riesgo');
      expect(mocks.planCarreraColaborador.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { idPlanCarrera: 1 },
          data: expect.objectContaining({
            estatus: 'en_riesgo',
            fechaRiesgo: expect.any(Date) as Date,
            fechaLimiteRenovacion: expect.any(Date) as Date,
          }) as object,
        }) as object,
      );
    });

    it('en_riesgo vuelve a listo_para_ascenso al renovar dentro del plazo', async () => {
      mocks.planCarreraColaborador.findMany.mockResolvedValue([
        postulacion({
          estatus: 'en_riesgo',
          idVersionRuta: 30,
          fechaLimiteRenovacion: new Date('2099-01-01'),
        }),
      ]);
      mocks.rutaAsignacionCurso.findMany.mockResolvedValue([
        {
          idCurso: 1000,
          estado: 'completado',
          venceVigencia: new Date('2099-01-01'),
          RutaAsignacion: { idEmpleado: 10, idVersion: 30 },
        },
      ]);

      const {
        colaboradores: [result],
      } = await service.findColaboradores(1);

      expect(result.estatus).toBe('listo_para_ascenso');
    });

    it('en_riesgo regresa a en_preparacion si pasó el límite', async () => {
      mocks.planCarreraColaborador.findMany.mockResolvedValue([
        postulacion({
          estatus: 'en_riesgo',
          idVersionRuta: 30,
          fechaLimiteRenovacion: new Date('2000-01-01'),
        }),
      ]);
      mocks.rutaAsignacionCurso.findMany.mockResolvedValue([
        {
          idCurso: 1000,
          estado: 'vencido',
          venceVigencia: new Date('2000-01-01'),
          RutaAsignacion: { idEmpleado: 10, idVersion: 30 },
        },
      ]);

      const {
        colaboradores: [result],
      } = await service.findColaboradores(1);

      expect(result.estatus).toBe('en_preparacion');
    });
  });
});
