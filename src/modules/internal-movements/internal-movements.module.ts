import { forwardRef, Module } from '@nestjs/common';
import { InternalMovementsService } from './internal-movements.service';
import { InternalMovementsController } from './internal-movements.controller';
import { ApprovalsModule } from '../approvals/approvals.module';
import { MediaPathModule } from 'src/common/services/media-path.module';

@Module({
  imports: [
    MediaPathModule,
    forwardRef(() => ApprovalsModule),
  ],
  controllers: [InternalMovementsController],
  providers: [InternalMovementsService],
  exports: [InternalMovementsService],
})
export class InternalMovementsModule { }