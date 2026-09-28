import { Module } from '@nestjs/common';
import { AttendanceEngineModule } from 'src/modules/attendance/engine/attendance-engine.module';
import { IvrController } from './ivr/ivr.controller';
import { IvrService } from './ivr/ivr.service';
import { ArtemisController } from './artemis/artemis.controller';
import { ArtemisService } from './artemis/artemis.service';

@Module({
  imports: [AttendanceEngineModule],
  controllers: [IvrController, ArtemisController],
  providers: [IvrService, ArtemisService],
})
export class AttendanceModule { }
