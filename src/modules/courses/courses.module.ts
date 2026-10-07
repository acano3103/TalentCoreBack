import { Module } from '@nestjs/common';
import { CoursesService } from './courses.service';
import { CoursesController } from './courses.controller';
import { EncryptionService } from 'src/common/utils/encryption.util';
import { ConfigService } from '@nestjs/config';
import { IntegrationsModule } from '../integrations/integrations.module';
import { CourseContentController } from './course-content.controller';
import { CourseContentService } from './course-content.service';

@Module({
  imports: [IntegrationsModule],
  controllers: [CoursesController, CourseContentController],
  providers: [CoursesService, CourseContentService, ConfigService, EncryptionService],
})
export class CoursesModule { }
