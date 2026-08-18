import { Module } from '@nestjs/common';
import { ApprovalAssignmentsService } from './approval-assignments.service';
import { ApprovalAssignmentsController } from './approval-assignments.controller';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ApprovalAssignmentsController],
  providers: [ApprovalAssignmentsService],
  exports: [ApprovalAssignmentsService],
})
export class ApprovalAssignmentsModule {}
