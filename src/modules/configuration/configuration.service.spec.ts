import { Test, TestingModule } from '@nestjs/testing';
import { ConfigurationService } from './configuration.service';

jest.mock('../../prisma/prisma.service', () => ({
  __esModule: true,
  PrismaService: jest.fn(),
}));

import { PrismaService } from '../../prisma/prisma.service';

describe('ConfigurationService', () => {
  let service: ConfigurationService;
  let configuracionEmpresa: {
    findUnique: jest.Mock;
    upsert: jest.Mock;
  };

  beforeEach(async () => {
    configuracionEmpresa = {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConfigurationService,
        { provide: PrismaService, useValue: { configuracionEmpresa } },
      ],
    }).compile();

    service = module.get<ConfigurationService>(ConfigurationService);
  });

  describe('getTrainingSettings', () => {
    it('devuelve umbral default 8 cuando no existe configuracion', async () => {
      configuracionEmpresa.findUnique.mockResolvedValue(null);
      await expect(service.getTrainingSettings(1)).resolves.toEqual({
        calificacionAprobatoria: 8,
      });
    });

    it('devuelve el umbral configurado', async () => {
      configuracionEmpresa.findUnique.mockResolvedValue({
        idEmpresa: 1,
        clave: 'calificacion_aprobatoria',
        valor: '90',
      });
      await expect(service.getTrainingSettings(1)).resolves.toEqual({
        calificacionAprobatoria: 90,
      });
    });

    it('devuelve 8 ante un valor no numerico', async () => {
      configuracionEmpresa.findUnique.mockResolvedValue({
        idEmpresa: 1,
        clave: 'calificacion_aprobatoria',
        valor: 'abc',
      });
      await expect(service.getTrainingSettings(1)).resolves.toEqual({
        calificacionAprobatoria: 8,
      });
    });
  });

  describe('updateTrainingSettings', () => {
    const activeUser = {
      id: 1,
      uuid: 'user-uuid-1',
      username: 'admin',
      first_name: 'Ana',
      last_name: 'Lopez',
    };

    it('persiste via upsert y devuelve el nuevo valor', async () => {
      configuracionEmpresa.upsert.mockResolvedValue({});
      configuracionEmpresa.findUnique.mockResolvedValue({
        idEmpresa: 1,
        clave: 'calificacion_aprobatoria',
        valor: '9',
      });

      const result = await service.updateTrainingSettings(
        1,
        { calificacionAprobatoria: 9 },
        activeUser as never,
      );

      expect(configuracionEmpresa.upsert).toHaveBeenCalledWith({
        where: {
          idEmpresa_clave: { idEmpresa: 1, clave: 'calificacion_aprobatoria' },
        },
        create: expect.objectContaining({
          idEmpresa: 1,
          clave: 'calificacion_aprobatoria',
          valor: '9',
          activo: true,
        }),
        update: expect.objectContaining({ valor: '9' }),
      });
      expect(result.calificacionAprobatoria).toBe(9);
    });
  });
});
