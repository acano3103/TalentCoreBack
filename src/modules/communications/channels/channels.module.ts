import { Module } from '@nestjs/common';
import { CapabilitiesModule } from '../capabilities/capabilities.module';
import { ChannelsController } from './channels.controller';
import { ChannelsService } from './channels.service';
import { EffectiveChannelService } from './effective-channel.service';

@Module({
    imports: [CapabilitiesModule],
    controllers: [ChannelsController],
    providers: [ChannelsService, EffectiveChannelService],
    exports: [EffectiveChannelService],
})
export class ChannelsModule {}
