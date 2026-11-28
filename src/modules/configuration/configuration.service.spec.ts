import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { reiniciarAvisosUmbral } from '../career-plan/career-plan.avance';
import { ConfigurationService } from './configuration.service';
import { UpdateTrainingSettingsDto } from './dto/update-training-settings.dto';
import {
  TrainingConfig,
  runTrainingConfigCache,
  trainingConfigPorDefecto,
} from './training-config';

jest.mock('../../prisma/prisma.service', () => ({
  __esModule: true,
  PrismaService: jest.fn(),
}));

import { PrismaService } from '../../prisma/prisma.service';

function configEsperada(
  parcial: Partial<TrainingConfig> = {},
  agente = 'ACME SA',
): TrainingConfig {
  return { ...trainingConfigPorDefecto(agente), ...parcial };
}

describe('ConfigurationService', () => {
  let service: ConfigurationService;
  let configuracionEmpresa: {
    findMany: jest.Mock;
    upsert: jest.Mock;
  };
  let catEmpresas: { findUnique: jest.Mock };

  beforeEach(async () => {
    reiniciarAvisosUmbral();
    configuracionEmpresa = {
      findMany: jest.fn().mockResolvedValue([]),
      upsert: jest.fn().mockResolvedValue({}),
    };
    catEmpresas = {
      findUnique: jest.fn().mockResolvedValue({ razon_social: 'ACME SA' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConfigurationService,
        {
          provide: PrismaService,
          useValue: { configuracionEmpresa, catEmpresas },
        },
      ],
    }).compile();

    service = module.get<ConfigurationService>(ConfigurationService);
  });

  describe('getTrainingSettings', () => {
    it('devuelve todas las claves con su default cuando no hay configuración', async () => {
      await expect(service.getTrainingSettings(1)).resolves.toEqual(
        configEsperada(),
      );
      expect(catEmpresas.findUnique).toHaveBeenCalledWith({
        where: { idEmpresa: 1 },
        select: { razon_social: true },
      });
    });

    it('devuelve el umbral configurado y conserva el resto de defaults', async () => {
      configuracionEmpresa.findMany.mockResolvedValue([
        { clave: 'calificacion_aprobatoria', valor: '90' },
      ]);
      await expect(service.getTrainingSettings(1)).resolves.toEqual(
        configEsperada({ calificacionAprobatoria: 90 }),
      );
    });

    it('devuelve 70 ante un valor no numerico', async () => {
      configuracionEmpresa.findMany.mockResolvedValue([
        { clave: 'calificacion_aprobatoria', valor: 'abc' },
      ]);
      await expect(service.getTrainingSettings(1)).resolves.toEqual(
        configEsperada(),
      );
    });

    it('interpreta un 8 guardado como 80 y avisa una sola vez', async () => {
      const warn = jest
        .spyOn(service['logger'], 'warn')
        .mockImplementation(() => undefined);
      configuracionEmpresa.findMany.mockResolvedValue([
        { clave: 'calificacion_aprobatoria', valor: '8' },
      ]);

      await expect(service.getTrainingSettings(1)).resolves.toEqual(
        configEsperada({ calificacionAprobatoria: 80 }),
      );
      await expect(service.getTrainingSettings(1)).resolves.toEqual(
        configEsperada({ calificacionAprobatoria: 80 }),
      );
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0][0])).toContain(
        'calificacion_aprobatoria=8',
      );
      warn.mockRestore();
    });

    it('arma el resto de claves guardadas y no consulta la razón social si el agente ya está', async () => {
      configuracionEmpresa.findMany.mockResolvedValue([
        { clave: 'rutas_modo_asignacion', valor: 'con_aprobacion' },
        { clave: 'rutas_aprobador', valor: 'jefe' },
        { clave: 'vigencia_ventana_dias', valor: '15' },
        { clave: 'vigencia_avisos_dias', valor: '[45,1]' },
        { clave: 'rutas_plazo_primera_publicacion', valor: 'ingreso' },
        { clave: 'dc3_auto_generar', valor: 'false' },
        { clave: 'dc3_aviso_dias_habiles', valor: '2' },
        { clave: 'dc3_agente_capacitador', valor: 'Agente propio' },
        { clave: 'carrera_antiguedad_default_meses', valor: '6' },
        { clave: 'carrera_dias_renovacion', valor: '10' },
        { clave: 'carrera_requiere_plaza', valor: 'false' },
        { clave: 'carrera_autopostulacion', valor: 'true' },
        { clave: 'carrera_nominan', valor: '["jefe"]' },
      ]);

      await expect(service.getTrainingConfig(1)).resolves.toEqual(
        configEsperada(
          {
            rutasModoAsignacion: 'con_aprobacion',
            rutasAprobador: 'jefe',
            vigenciaVentanaDias: 15,
            vigenciaAvisosDias: [45, 1],
            rutasPlazoPrimeraPublicacion: 'ingreso',
            dc3AutoGenerar: false,
            dc3AvisoDiasHabiles: 2,
            dc3AgenteCapacitador: 'Agente propio',
            carreraAntiguedadDefaultMeses: 6,
            carreraDiasRenovacion: 10,
            carreraRequierePlaza: false,
            carreraAutopostulacion: true,
            carreraNominan: ['jefe'],
          },
          '',
        ),
      );
      expect(catEmpresas.findUnique).not.toHaveBeenCalled();
    });

    it('reutiliza la lectura dentro del mismo request y la repite fuera de él', async () => {
      await runTrainingConfigCache(async () => {
        await service.getTrainingConfig(1);
        await service.getTrainingConfig(1);
      });
      expect(configuracionEmpresa.findMany).toHaveBeenCalledTimes(1);

      await service.getTrainingConfig(1);
      await service.getTrainingConfig(1);
      expect(configuracionEmpresa.findMany).toHaveBeenCalledTimes(3);
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
      configuracionEmpresa.findMany.mockResolvedValue([
        { clave: 'calificacion_aprobatoria', valor: '85' },
      ]);

      const result = await service.updateTrainingSettings(
        1,
        { calificacionAprobatoria: 85 },
        activeUser as never,
      );

      expect(configuracionEmpresa.upsert).toHaveBeenCalledTimes(1);
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
      expect(result).toEqual(configEsperada({ calificacionAprobatoria: 85 }));
    });

    it('un parcial no escribe las claves que no se enviaron', async () => {
      configuracionEmpresa.findMany.mockResolvedValue([
        { clave: 'calificacion_aprobatoria', valor: '85' },
        { clave: 'dc3_auto_generar', valor: 'false' },
        { clave: 'vigencia_ventana_dias', valor: '12' },
        { clave: 'carrera_nominan', valor: '["rh"]' },
      ]);

      const result = await service.updateTrainingSettings(
        1,
        { vigenciaVentanaDias: 12, carreraNominan: ['rh'] },
        activeUser as never,
      );

      expect(configuracionEmpresa.upsert).toHaveBeenCalledTimes(2);
      expect(configuracionEmpresa.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            idEmpresa_clave: { idEmpresa: 1, clave: 'vigencia_ventana_dias' },
          },
          update: expect.objectContaining({ valor: '12' }),
        }),
      );
      expect(configuracionEmpresa.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            idEmpresa_clave: { idEmpresa: 1, clave: 'carrera_nominan' },
          },
          update: expect.objectContaining({ valor: '["rh"]' }),
        }),
      );
      expect(result.calificacionAprobatoria).toBe(85);
      expect(result.dc3AutoGenerar).toBe(false);
      expect(result.vigenciaVentanaDias).toBe(12);
      expect(result.carreraNominan).toEqual(['rh']);
      expect(result.rutasModoAsignacion).toBe('automatica');
    });

    it('un cuerpo vacío no borra nada', async () => {
      const result = await service.updateTrainingSettings(
        1,
        {},
        activeUser as never,
      );
      expect(configuracionEmpresa.upsert).not.toHaveBeenCalled();
      expect(result).toEqual(configEsperada());
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

    it('acepta un parcial y rechaza enums o rangos inválidos', async () => {
      await expect(
        pipe.transform(
          {},
          { type: 'body', metatype: UpdateTrainingSettingsDto },
        ),
      ).resolves.toEqual({});
      await expect(
        pipe.transform(
          {
            rutasModoAsignacion: 'con_aprobacion',
            rutasAprobador: 'ambos',
            vigenciaAvisosDias: [30, 7],
            dc3AutoGenerar: false,
            carreraNominan: ['jefe', 'rh'],
          },
          { type: 'body', metatype: UpdateTrainingSettingsDto },
        ),
      ).resolves.toEqual({
        rutasModoAsignacion: 'con_aprobacion',
        rutasAprobador: 'ambos',
        vigenciaAvisosDias: [30, 7],
        dc3AutoGenerar: false,
        carreraNominan: ['jefe', 'rh'],
      });
      await expect(
        pipe.transform(
          { rutasModoAsignacion: 'manual' },
          { type: 'body', metatype: UpdateTrainingSettingsDto },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        pipe.transform(
          { vigenciaVentanaDias: -1 },
          { type: 'body', metatype: UpdateTrainingSettingsDto },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        pipe.transform(
          { carreraNominan: ['empleado'] },
          { type: 'body', metatype: UpdateTrainingSettingsDto },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
