import { Module } from '@nestjs/common';
import { CoursesService } from './courses.service';
import { CoursesController } from './courses.controller';
import { EncryptionService } from 'src/common/utils/encryption.util';
import { ConfigService } from '@nestjs/config';
import { IntegrationsModule } from '../integrations/integrations.module';
import { CourseContentController } from './content/course-content.controller';
import { CourseContentService } from './content/course-content.service';
import { CourseLearningController } from './learning/course-learning.controller';
import { CourseLearningService } from './learning/course-learning.service';
import { CourseTrackingController } from './tracking/course-tracking.controller';
import { CourseTrackingService } from './tracking/course-tracking.service';
import { CourseNativeContentController } from './content/course-native-content.controller';
import { CourseNativeContentService } from './content/course-native-content.service';
import { CourseScormController } from './scorm/course-scorm.controller';
import { CourseScormService } from './scorm/course-scorm.service';
import { MediaPathModule } from 'src/common/services/media-path.module';

@Module({
  imports: [IntegrationsModule, MediaPathModule],
  controllers: [CoursesController, CourseContentController, CourseLearningController, CourseTrackingController, CourseNativeContentController, CourseScormController],
  providers: [CoursesService, CourseContentService, CourseLearningService, CourseTrackingService, CourseNativeContentService, CourseScormService, ConfigService, EncryptionService],
})
export class CoursesModule { }
