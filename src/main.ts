import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { apiReference } from '@scalar/nestjs-api-reference';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { MOBILE_SUBMODULES, MobileModule } from './modules/mobile/mobile.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api/v2');
  const logger = new Logger(bootstrap.name);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.enableCors();
  app.useGlobalInterceptors(new TransformInterceptor());
  app.useGlobalFilters(new HttpExceptionFilter());

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 3000);

  // 1. Swagger tradicional (General / Web)
  const config = new DocumentBuilder()
    .setTitle('Talent Core API')
    .setDescription('API documentation for the second version of the Talent Core backend in Nest JS')
    .setVersion('2.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  // 2. Documento OpenAPI exclusivo para la App Móvil
  const mobileConfig = new DocumentBuilder()
    .setTitle('Talent Core - API Reference')
    .setDescription('Documentación interactiva de la plataforma')
    .setVersion('2.0')
    .addBearerAuth()
    // Definimos la jerarquía del menú lateral
    .addExtension('x-tagGroups', [
      {
        name: 'Mobile App',
        tags: ['Mobile Auth', 'Mobile Dashboard', 'Mobile Attendance'],
      },
      {
        name: 'Web App',
        tags: ['Web Auth', 'Users', 'Reports', 'Companies'],
      },
    ])
    .build();

  const mobileDocument = SwaggerModule.createDocument(app, mobileConfig, {
    include: [MobileModule, ...MOBILE_SUBMODULES],
  });

  // 3. Montar Scalar para la App Móvil
  app.use(
    '/api/mobile-docs',
    apiReference({
      content: mobileDocument,
      theme: 'purple',
    }),
  );

  await app.listen(port);
  logger.log(`Application is running on: http://localhost:${port}`);
  logger.log(`Swagger documentation is available at: http://localhost:${port}/api/docs`);
  logger.log(`Scalar Mobile documentation is available at: http://localhost:${port}/api/mobile-docs`);
}
bootstrap();