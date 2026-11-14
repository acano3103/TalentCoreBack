import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CapabilitiesModule } from '../capabilities/capabilities.module';
import { ChannelsModule } from '../channels/channels.module';
import { AudienceOptionsService } from './audience-options.service';
import { AudiencePreviewStore, crearPreviewStore } from './audience-preview.store';
import { AudienceResolverService } from './audience-resolver.service';
import { AudiencesController } from './audiences.controller';
import { AudiencesService } from './audiences.service';

@Module({
    imports: [CapabilitiesModule, ChannelsModule],
    controllers: [AudiencesController],
    providers: [
        AudienceResolverService,
        AudienceOptionsService,
        AudiencesService,
        {
            provide: AudiencePreviewStore,
            useFactory: (config: ConfigService) => crearPreviewStore(config.get<string>('REDIS_URL')),
            inject: [ConfigService],
        },
    ],
    exports: [AudienceResolverService],
})
export class AudiencesModule {}
