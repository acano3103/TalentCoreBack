import { Module } from '@nestjs/common';
import { DigitalFilesController } from './digital-files.controller';
import { DigitalFilesService } from './digital-files.service';

@Module({
  controllers: [DigitalFilesController],
  providers: [DigitalFilesService]
})
export class DigitalFilesModule { }
