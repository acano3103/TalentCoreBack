import { Module } from '@nestjs/common';
import { CoursesService } from './courses.service';
import { CoursesController } from './courses.controller';
import { EncryptionService } from 'src/common/utils/encryption.util';
import { ConfigService } from '@nestjs/config';
import { IntegrationsModule } from '../integrations/integrations.module';
import { CourseContentController } from './course-content.controller';
import { CourseContentService } from './course-content.service';
import { CourseLearningController } from './course-learning.controller';
import { CourseLearningService } from './course-learning.service';
import { CourseTrackingController } from './course-tracking.controller';
import { CourseTrackingService } from './course-tracking.service';
import { CourseNativeContentController } from './course-native-content.controller';
import { CourseNativeContentService } from './course-native-content.service';
import { CourseScormController } from './course-scorm.controller';
import { CourseScormService } from './course-scorm.service';
import { MediaPathModule } from 'src/common/services/media-path.module';

@Module({
  imports: [IntegrationsModule, MediaPathModule],
  controllers: [CoursesController, CourseContentController, CourseLearningController, CourseTrackingController, CourseNativeContentController, CourseScormController],
  providers: [CoursesService, CourseContentService, CourseLearningService, CourseTrackingService, CourseNativeContentService, CourseScormService, ConfigService, EncryptionService],
})
export class CoursesModule { }
