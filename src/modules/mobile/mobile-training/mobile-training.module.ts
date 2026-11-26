import { Module } from '@nestjs/common';
import { CareerPlanModule } from 'src/modules/career-plan/career-plan.module';
import { LearningPathsModule } from 'src/modules/learning-paths/learning-paths.module';
import { CoursesModule } from 'src/modules/courses/courses.module';
import { MobileAuthModule } from '../mobile-auth/mobile-auth.module';
import { MobileClassesController } from './mobile-classes.controller';
import { MobileProgressController } from './mobile-progress.controller';
import { MobileScormPlayController } from './mobile-scorm-play.controller';
import { MobileTrainingController } from './mobile-training.controller';
import { GamificacionService } from './gamificacion/gamificacion.service';
import { MobileTrainingService } from './mobile-training.service';
import { MobileScormPlayService } from './scorm/mobile-scorm-play.service';

@Module({
  imports: [
    MobileAuthModule,
    CoursesModule,
    CareerPlanModule,
    LearningPathsModule,
  ],
  controllers: [
    MobileTrainingController,
    MobileClassesController,
    MobileScormPlayController,
    MobileProgressController,
  ],
  providers: [
    MobileTrainingService,
    MobileScormPlayService,
    GamificacionService,
  ],
})
export class MobileTrainingModule {}
