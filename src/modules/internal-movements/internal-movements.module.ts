import { Module } from '@nestjs/common';
import { InternalMovementsService } from './internal-movements.service';
import { InternalMovementsController } from './internal-movements.controller';

@Module({
  controllers: [InternalMovementsController],
  providers: [InternalMovementsService],
})
export class InternalMovementsModule {}
