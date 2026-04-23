import { Module } from '@nestjs/common';
import { IntegrationsService } from './integrations.service';
import { IntegrationsController } from './integrations.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { CommunicationFactory } from './providers/factory.service';
import { ZoomProvider } from './providers/communication/zoom.provider';

@Module({
    imports: [PrismaModule],
    controllers: [IntegrationsController],
    providers: [
        IntegrationsService,
        CommunicationFactory,
        ZoomProvider
    ],
    exports: [IntegrationsService],
})
export class IntegrationsModule { }