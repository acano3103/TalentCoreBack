import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { reiniciarAvisosUmbral } from '../career-plan/career-plan.avance';
import { ConfigurationService } from './configuration.service';
import { UpdateTrainingSettingsDto } from './dto/update-training-settings.dto';

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
    reiniciarAvisosUmbral();
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
    it('devuelve umbral default 70 cuando no existe configuracion', async () => {
      configuracionEmpresa.findUnique.mockResolvedValue(null);
      await expect(service.getTrainingSettings(1)).resolves.toEqual({
        calificacionAprobatoria: 70,
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

    it('devuelve 70 ante un valor no numerico', async () => {
      configuracionEmpresa.findUnique.mockResolvedValue({
        idEmpresa: 1,
        clave: 'calificacion_aprobatoria',
        valor: 'abc',
      });
      await expect(service.getTrainingSettings(1)).resolves.toEqual({
        calificacionAprobatoria: 70,
      });
    });

    it('interpreta un 8 guardado como 80 y avisa una sola vez', async () => {
      const warn = jest
        .spyOn(service['logger'], 'warn')
        .mockImplementation(() => undefined);
      configuracionEmpresa.findUnique.mockResolvedValue({
        idEmpresa: 1,
        clave: 'calificacion_aprobatoria',
        valor: '8',
      });

      await expect(service.getTrainingSettings(1)).resolves.toEqual({
        calificacionAprobatoria: 80,
      });
      await expect(service.getTrainingSettings(1)).resolves.toEqual({
        calificacionAprobatoria: 80,
      });
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0][0])).toContain(
        'calificacion_aprobatoria=8',
      );
      warn.mockRestore();
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
        valor: '85',
      });

      const result = await service.updateTrainingSettings(
        1,
        { calificacionAprobatoria: 85 },
        activeUser as never,
      );

      expect(configuracionEmpresa.upsert).toHaveBeenCalledWith({
        where: {
          idEmpresa_clave: { idEmpresa: 1, clave: 'calificacion_aprobatoria' },
        },
        create: expect.objectContaining({
          idEmpresa: 1,
          clave: 'calificacion_aprobatoria',
          valor: '85',
          activo: true,
        }),
        update: expect.objectContaining({ valor: '85' }),
      });
      expect(result.calificacionAprobatoria).toBe(85);
    });
  });

  describe('UpdateTrainingSettingsDto', () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });

    it('acepta de 0 a 100 y rechaza lo que queda fuera', async () => {
      await expect(
        pipe.transform(
          { calificacionAprobatoria: 0 },
          { type: 'body', metatype: UpdateTrainingSettingsDto },
        ),
      ).resolves.toEqual({ calificacionAprobatoria: 0 });
      await expect(
        pipe.transform(
          { calificacionAprobatoria: 70 },
          { type: 'body', metatype: UpdateTrainingSettingsDto },
        ),
      ).resolves.toEqual({ calificacionAprobatoria: 70 });
      await expect(
        pipe.transform(
          { calificacionAprobatoria: 100 },
          { type: 'body', metatype: UpdateTrainingSettingsDto },
        ),
      ).resolves.toEqual({ calificacionAprobatoria: 100 });
      await expect(
        pipe.transform(
          { calificacionAprobatoria: 101 },
          { type: 'body', metatype: UpdateTrainingSettingsDto },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        pipe.transform(
          { calificacionAprobatoria: -1 },
          { type: 'body', metatype: UpdateTrainingSettingsDto },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
