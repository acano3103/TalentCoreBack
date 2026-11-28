import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { ActiveUserDto } from '../auth/dto/active-user.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CareerPlanController } from './career-plan.controller';
import { CareerPlanService } from './career-plan.service';

const usuario = {
  id: 7,
  uuid: 'usuario-1',
  idTenant: 1,
  username: 'ana',
  first_name: 'Ana',
  last_name: 'López',
} as ActiveUserDto;

describe('CareerPlanController', () => {
  let app: INestApplication;
  const service = {
    findMap: jest.fn().mockResolvedValue({ nodos: [], caminos: [] }),
    updateRoute: jest.fn().mockResolvedValue({ idRuta: 4 }),
    nominate: jest.fn().mockResolvedValue({ idPlanCarrera: 9 }),
    kpisColaboradores: jest.fn().mockResolvedValue({
      kpis: {
        enPlan: 3,
        listosAhora: 1,
        enRiesgo: 0,
        nominados: 0,
        promovidosEsteAnio: 0,
      },
    }),
    findColaborador: jest.fn().mockResolvedValue({ idPlanCarrera: 9 }),
    findRoutes: jest.fn(),
    createRoute: jest.fn(),
    disableRoute: jest.fn(),
    findRouteCourses: jest.fn(),
    findColaboradores: jest.fn(),
    createPostulacion: jest.fn(),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [CareerPlanController],
      providers: [{ provide: CareerPlanService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: {
          switchToHttp: () => { getRequest: () => { user: ActiveUserDto } };
        }) => {
          context.switchToHttp().getRequest().user = usuario;
          return true;
        },
      })
      .compile();

    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('GET map consulta el mapa con el área', async () => {
    const http = app.getHttpServer() as App;
    const respuesta = await request(http)
      .get('/companies/2/career-plan/map')
      .query({ idArea: 5 })
      .expect(200);

    const cuerpo = respuesta.body as { nodos: unknown[]; caminos: unknown[] };
    expect(cuerpo).toEqual({ nodos: [], caminos: [] });
    expect(service.findMap).toHaveBeenCalledWith(2, 5, usuario);
  });

  it('PATCH routes actualiza antigüedad y ruta de aprendizaje', async () => {
    const http = app.getHttpServer() as App;
    await request(http)
      .patch('/companies/2/career-plan/routes/4')
      .send({ antiguedadMinimaMeses: 12, idRutaAprendizaje: 8 })
      .expect(200);

    expect(service.updateRoute).toHaveBeenCalledWith(
      2,
      4,
      expect.objectContaining({
        antiguedadMinimaMeses: 12,
        idRutaAprendizaje: 8,
      }),
      usuario,
    );
  });

  it('POST nominate delega en el servicio', async () => {
    const http = app.getHttpServer() as App;
    await request(http)
      .post('/companies/2/career-plan/colaboradores/9/nominate')
      .send({ fechaEfectiva: '2026-12-01', motivo: 'Listo' })
      .expect(201);

    expect(service.nominate).toHaveBeenCalledWith(
      2,
      9,
      expect.objectContaining({
        fechaEfectiva: '2026-12-01',
        motivo: 'Listo',
      }),
      usuario,
    );
  });

  it('GET colaboradores/kpis no cae en el parámetro planId', async () => {
    const http = app.getHttpServer() as App;
    const respuesta = await request(http)
      .get('/companies/2/career-plan/colaboradores/kpis')
      .query({ vista: 'mi_equipo' })
      .expect(200);
    const cuerpo = respuesta.body as {
      kpis: { enPlan: number; listosAhora: number };
    };

    expect(cuerpo.kpis).toEqual(
      expect.objectContaining({ enPlan: 3, listosAhora: 1 }),
    );
    expect(service.kpisColaboradores).toHaveBeenCalledWith(
      2,
      expect.objectContaining({ vista: 'mi_equipo' }),
      usuario,
    );
    expect(service.findColaborador).not.toHaveBeenCalled();
  });
});
