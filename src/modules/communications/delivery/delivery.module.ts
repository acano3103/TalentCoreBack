import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { AudiencesModule } from '../audiences/audiences.module';
import { CapabilitiesModule } from '../capabilities/capabilities.module';
import { ChannelsModule } from '../channels/channels.module';
import { AnnouncementDispatchService } from './announcement-dispatch.service';
import { COLA_ENVIO, COLA_ESCALAMIENTO } from './colas';
import { CommsDispatchProcessor } from './comms-dispatch.processor';
import { CommsEscalationProcessor } from './comms-escalation.processor';
import { GupshupStatusController } from './gupshup-status.controller';
import { GupshupStatusService } from './gupshup-status.service';
import { WhatsappUsageModule } from '../whatsapp-usage/whatsapp-usage.module';

@Module({
    imports: [
        ConfigModule,
        CapabilitiesModule,
        AudiencesModule,
        ChannelsModule,
        WhatsappUsageModule,
        BullModule.forRootAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: (config: ConfigService) => {
                const url = config.get<string>('REDIS_URL') || 'redis://127.0.0.1:6379';
                return {
                    createClient: () => new Redis(url, { maxRetriesPerRequest: null, enableReadyCheck: false }),
                };
            },
        }),
        BullModule.registerQueue({ name: COLA_ENVIO }, { name: COLA_ESCALAMIENTO }),
    ],
    controllers: [GupshupStatusController],
    providers: [AnnouncementDispatchService, CommsDispatchProcessor, CommsEscalationProcessor, GupshupStatusService],
    exports: [AnnouncementDispatchService],
})
export class DeliveryModule {}
