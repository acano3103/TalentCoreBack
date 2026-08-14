import { Test, TestingModule } from '@nestjs/testing';
import { CareerPlanService } from './career-plan.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

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
    });

    it('devuelve avance 0% sin participantes (umbral default 8)', async () => {
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
          calificacionFinal: 9,
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
          calificacionFinal: 9,
        },
        {
          idParticipante: 2,
          idSesion: 2,
          idEmpleado: 10,
          estatusAsignacion: 'completado',
          calificacionFinal: 9.5,
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
          calificacionFinal: 9,
        },
        {
          idParticipante: 2,
          idSesion: 2,
          idEmpleado: 10,
          estatusAsignacion: 'completado',
          calificacionFinal: 9,
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
          calificacionFinal: 9,
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
        calificacion: 9,
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
