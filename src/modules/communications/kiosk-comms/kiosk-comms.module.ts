import { Module } from '@nestjs/common';
import { KioskAuthModule } from 'src/modules/kiosks/kiosk-auth/kiosk-auth.module';
import { MeModule } from '../me/me.module';
import { KioskCommsController } from './kiosk-comms.controller';
import { KioskCommsService } from './kiosk-comms.service';

@Module({
    imports: [MeModule, KioskAuthModule],
    controllers: [KioskCommsController],
    providers: [KioskCommsService],
})
export class KioskCommsModule {}
