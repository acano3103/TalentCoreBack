import { forwardRef, Module } from '@nestjs/common';
import { IncapacitiesService } from './incapacities.service';
import { IncapacitiesController } from './incapacities.controller';
import { MediaPathModule } from 'src/common/services/media-path.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { ApprovalsModule } from 'src/modules/approvals/approvals.module';

@Module({
  controllers: [IncapacitiesController],
  providers: [IncapacitiesService],
  imports: [MediaPathModule, PermissionsModule, forwardRef(() => ApprovalsModule),]
})
export class IncapacitiesModule { }
