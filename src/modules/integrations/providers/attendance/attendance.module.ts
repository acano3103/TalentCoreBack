import { Module } from '@nestjs/common';
import { IvrController } from './ivr/ivr.controller';
import { IvrService } from './ivr/ivr.service';

@Module({
  controllers: [IvrController],
  providers: [IvrService]
})
export class AttendanceModule { }
