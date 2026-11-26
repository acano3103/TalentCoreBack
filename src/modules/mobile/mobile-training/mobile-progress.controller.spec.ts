import {
  BadRequestException,
  RequestMethod,
  ValidationPipe,
} from '@nestjs/common';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { CompanyTenantGuard } from 'src/modules/auth/guards/company-tenant.guard';
import { MobileJwtAuthGuard } from '../mobile-auth/guards/mobile-jwt-auth.guard';
import { AnioStatsQuery } from './dto/anio-stats.query';
import { HistorialQuery } from './dto/historial.query';
import { MarcarLogrosVistosDto } from './dto/marcar-logros.dto';
import { MobileProgressController } from './mobile-progress.controller';

describe('MobileProgressController', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  it('publica resumen, logros, vistas, progreso e historial', () => {
    expect(Reflect.getMetadata(PATH_METADATA, MobileProgressController)).toBe(
      'mobile/companies/:companyId/training',
    );
    expect(
      Reflect.getMetadata(GUARDS_METADATA, MobileProgressController),
    ).toEqual(expect.arrayContaining([MobileJwtAuthGuard, CompanyTenantGuard]));
    const proto = MobileProgressController.prototype;
    expect(Reflect.getMetadata(PATH_METADATA, proto.resumen)).toBe('summary');
    expect(Reflect.getMetadata(PATH_METADATA, proto.ruta)).toBe(
      'learning-path',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, proto.ruta)).toBe(
      RequestMethod.GET,
    );
    expect(Reflect.getMetadata(METHOD_METADATA, proto.resumen)).toBe(
      RequestMethod.GET,
    );
    expect(Reflect.getMetadata(PATH_METADATA, proto.planCarrera)).toBe(
      'career-plan',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, proto.planCarrera)).toBe(
      RequestMethod.GET,
    );
    expect(Reflect.getMetadata(PATH_METADATA, proto.logros)).toBe(
      'achievements',
    );
    expect(Reflect.getMetadata(PATH_METADATA, proto.vistos)).toBe(
      'achievements/seen',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, proto.vistos)).toBe(
      RequestMethod.POST,
    );
    expect(Reflect.getMetadata(PATH_METADATA, proto.stats)).toBe('stats');
    expect(Reflect.getMetadata(PATH_METADATA, proto.historial)).toBe('history');
  });

  it('valida el año, la página y los códigos', async () => {
    await expect(
      pipe.transform(
        { anio: 'no' },
        { type: 'query', metatype: AnioStatsQuery, data: undefined },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      pipe.transform(
        { pagina: 0 },
        { type: 'query', metatype: HistorialQuery, data: undefined },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      pipe.transform(
        {},
        { type: 'body', metatype: MarcarLogrosVistosDto, data: undefined },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      pipe.transform(
        { anio: '2026' },
        { type: 'query', metatype: AnioStatsQuery, data: undefined },
      ),
    ).resolves.toEqual({
      anio: 2026,
    });
  });
});
