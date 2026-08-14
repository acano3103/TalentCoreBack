import { Module } from '@nestjs/common';
import { DigitalFilesController } from './digital-files.controller';
import { DigitalFilesService } from './digital-files.service';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { NubariumService } from './services/nubarium.service';
import { RequiredDocumentsController } from './required-documents/required-documents.controller';
import { RequiredDocumentsService } from './required-documents/required-documents.service';
import { VencimientosDashboardService } from './vencimientos-dashboard.service';
import { VencimientosDashboardController } from './vencimientos-dashboard.controller';

@Module({
  imports: [
    JwtModule.registerAsync({
      useFactory: (config: ConfigService) => ({
        secret: config.get('JWT_SECRET'),
        signOptions: { algorithm: 'HS256' },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [VencimientosDashboardController, DigitalFilesController, RequiredDocumentsController],
  providers: [DigitalFilesService, NubariumService, RequiredDocumentsService, VencimientosDashboardService],
  exports: [NubariumService]
})
export class DigitalFilesModule { }