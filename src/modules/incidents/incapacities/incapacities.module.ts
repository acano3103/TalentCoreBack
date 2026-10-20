import { Module } from '@nestjs/common';
import { IncapacitiesService } from './incapacities.service';
import { IncapacitiesController } from './incapacities.controller';
import { MediaPathModule } from 'src/common/services/media-path.module';
import { PermissionsModule } from '../permissions/permissions.module';

@Module({
  controllers: [IncapacitiesController],
  providers: [IncapacitiesService],
  imports: [MediaPathModule, PermissionsModule]
})
export class IncapacitiesModule { }
