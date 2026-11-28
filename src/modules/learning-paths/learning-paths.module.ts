import { Module } from '@nestjs/common';
import { ExcelExportModule } from 'src/common/services/excel-export.module';
import { MediaPathModule } from 'src/common/services/media-path.module';
import { CoursesModule } from '../courses/courses.module';
import { ConfigurationModule } from '../configuration/configuration.module';
import { ComplianceController } from './compliance/compliance.controller';
import { ComplianceService } from './compliance/compliance.service';
import { AssignmentEngineService } from './engine/assignment-engine.service';
import { RutaAvisosService } from './engine/ruta-avisos.service';
import { RutaMotorService } from './engine/ruta-motor.service';
import { MiRutaService } from './paths/mi-ruta.service';
import { LearningPathsController } from './learning-paths.controller';
import { LearningPathsService } from './learning-paths.service';
import { PendingController } from './pending/pending.controller';
import { PendingService } from './pending/pending.service';
import { ScopeResolverService } from './scope/resolver.service';

@Module({
  imports: [
    ConfigurationModule,
    CoursesModule,
    ExcelExportModule,
    MediaPathModule,
  ],
  controllers: [
    PendingController,
    ComplianceController,
    LearningPathsController,
  ],
  providers: [
    LearningPathsService,
    RutaMotorService,
    ScopeResolverService,
    AssignmentEngineService,
    RutaAvisosService,
    MiRutaService,
    PendingService,
    ComplianceService,
  ],
  exports: [
    LearningPathsService,
    RutaMotorService,
    ScopeResolverService,
    AssignmentEngineService,
    RutaAvisosService,
    MiRutaService,
  ],
})
export class LearningPathsModule {}
