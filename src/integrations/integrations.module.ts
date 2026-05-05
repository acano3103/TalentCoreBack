import { Module } from '@nestjs/common';
import { IntegrationsService } from './integrations.service';
import { IntegrationsController } from './integrations.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { CommunicationFactory } from './providers/factory.service';
import { ZoomProvider } from './providers/communication/zoom.provider';
import { EncryptionService } from 'src/common/utils/encryption.util';
import { HumeController } from './providers/ia/hume.controller';
import { HumeService } from './providers/ia/hume.service';
import { HttpModule } from '@nestjs/axios';

@Module({
    imports: [PrismaModule, HttpModule],
    controllers: [IntegrationsController, HumeController],
    providers: [
        IntegrationsService,
        CommunicationFactory,
        ZoomProvider,
        EncryptionService,
        HumeService
    ],
    exports: [IntegrationsService, HumeService, CommunicationFactory],
})
export class IntegrationsModule { }