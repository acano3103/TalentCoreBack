import { Module } from '@nestjs/common';
import { CoursesService } from './courses.service';
import { CoursesController } from './courses.controller';
import { EncryptionService } from 'src/common/utils/encryption.util';
import { ConfigService } from '@nestjs/config';

@Module({
  controllers: [CoursesController],
  providers: [CoursesService, ConfigService, EncryptionService],
})
export class CoursesModule { }
