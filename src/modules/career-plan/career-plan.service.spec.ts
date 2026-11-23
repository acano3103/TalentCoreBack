import { Test, TestingModule } from '@nestjs/testing';
import { CareerPlanService } from './career-plan.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { reiniciarAvisosUmbral } from './career-plan.avance';

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
    },
    empleados: { findMany: jest.fn(), findFirst: jest.fn() },
    catPuestos: { findMany: jest.fn(), findUnique: jest.fn() },
    relPuestoCurso: { findMany: jest.fn() },
    cursoSesiones: { findMany: jest.fn() },
    cursoParticipantes: { findMany: jest.fn() },
    catCursos: { findMany: jest.fn() },
    configuracionEmpresa: { findUnique: jest.fn() },
    historicoMovimientos: { create: jest.fn() },
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
  let mocks: ReturnType<typeof buildMockPrisma>['mocks'];

  beforeEach(async () => {
    reiniciarAvisosUmbral();
    const built = buildMockPrisma();
    mocks = built.mocks;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CareerPlanService,
        { provide: PrismaService, useValue: built.prisma },
      ],
    }).compile();

    service = module.get<CareerPlanService>(CareerPlanService);
  });

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
      mocks.configuracionEmpresa.findUnique.mockResolvedValue(null);
      mocks.catCursos.findMany.mockResolvedValue([]);
    });

    it('devuelve avance 0% sin participantes (umbral default 70)', async () => {
      mocks.cursoParticipantes.findMany.mockResolvedValue([]);

      const [result] = await service.findColaboradores(1);

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

      const [result] = await service.findColaboradores(1);

      expect(result.porcentajeAvance).toBe(50);
      expect(result.cursosAprobados).toBe(1);
      expect(result.estatus).toBe('en_preparacion');
      expect(mocks.planCarreraColaborador.update).not.toHaveBeenCalled();
    });

    it('deriva listo_para_ascenso al 100% y persiste el estatus', async () => {
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

      const [result] = await service.findColaboradores(1);

      expect(result.porcentajeAvance).toBe(100);
      expect(result.estatus).toBe('listo_para_ascenso');
      expect(mocks.planCarreraColaborador.update).toHaveBeenCalledWith({
        where: { idPlanCarrera: 1 },
        data: { estatus: 'listo_para_ascenso' },
      });
    });

    it('respeta el umbral configurado por empresa (calificacion 50 < umbral 90 no cuenta)', async () => {
      mocks.configuracionEmpresa.findUnique.mockResolvedValue({
        idEmpresa: 1,
        clave: 'calificacion_aprobatoria',
        valor: '90',
      });
      mocks.cursoParticipantes.findMany.mockResolvedValue([
        {
          idParticipante: 1,
          idSesion: 1,
          idEmpleado: 10,
          estatusAsignacion: 'completado',
          calificacionFinal: 50,
        },
      ]);

      const [result] = await service.findColaboradores(1);

      expect(result.cursosAprobados).toBe(0);
      expect(result.porcentajeAvance).toBe(0);
    });

    it('sin configurar aprueba desde 70 y no avisa', async () => {
      const warn = jest
        .spyOn(service['logger'], 'warn')
        .mockImplementation(() => undefined);
      mocks.cursoParticipantes.findMany.mockResolvedValue([
        participacionCurso(1, 69),
        participacionCurso(2, 70),
      ]);

      const [result] = await service.findColaboradores(1);

      expect(result.cursosAprobados).toBe(1);
      expect(result.porcentajeAvance).toBe(50);
      expect(warn).not.toHaveBeenCalled();
      warn.mockRestore();
    });

    it('interpreta un 8 configurado como 80 y avisa una sola vez', async () => {
      const warn = jest
        .spyOn(service['logger'], 'warn')
        .mockImplementation(() => undefined);
      mocks.configuracionEmpresa.findUnique.mockResolvedValue({
        idEmpresa: 1,
        clave: 'calificacion_aprobatoria',
        valor: '8',
      });
      mocks.cursoParticipantes.findMany.mockResolvedValue([
        participacionCurso(1, 79),
        participacionCurso(2, 80),
      ]);

      const [primero] = await service.findColaboradores(1);
      const [segundo] = await service.findColaboradores(1);
      const { planes } = await service.findPlanesEmpleado(1, 10);

      expect(primero.cursosAprobados).toBe(1);
      expect(primero.porcentajeAvance).toBe(50);
      expect(segundo.porcentajeAvance).toBe(50);
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
      mocks.configuracionEmpresa.findUnique.mockResolvedValue({
        idEmpresa: 1,
        clave: 'calificacion_aprobatoria',
        valor: '85',
      });
      mocks.cursoParticipantes.findMany.mockResolvedValue([
        participacionCurso(1, 84),
        participacionCurso(2, 85),
      ]);

      const [result] = await service.findColaboradores(1);
      const { planes } = await service.findPlanesEmpleado(1, 10);

      expect(result.cursosAprobados).toBe(1);
      expect(result.porcentajeAvance).toBe(50);
      expect(planes[0].porcentaje).toBe(50);
      expect(planes[0].aprobados).toBe(1);
      expect(warn).not.toHaveBeenCalled();
      warn.mockRestore();
    });

    it('completado sin calificacion cuenta como aprobado', async () => {
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

      const [result] = await service.findColaboradores(1);

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

      const [result] = await service.findColaboradores(1);

      expect(result.estatus).toBe('promovido');
      expect(mocks.planCarreraColaborador.update).not.toHaveBeenCalled();
    });

    it('devuelve [] cuando no hay rutas', async () => {
      mocks.relPuestoRuta.findMany.mockResolvedValue([]);
      await expect(service.findColaboradores(1)).resolves.toEqual([]);
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
      mocks.configuracionEmpresa.findUnique.mockResolvedValue(null);

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
        data: { estatus: 'listo_para_ascenso' },
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
      mocks.configuracionEmpresa.findUnique.mockResolvedValue(null);

      const result = await service.findColaborador(1, 1);

      expect(result.porcentajeAvance).toBe(50);
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
});
