import { Module } from '@nestjs/common';
import { IntegrationsService } from './integrations.service';
import { IntegrationsController } from './integrations.controller';
import { IntegrationsFactory } from './providers/factory.service';
import { ZoomProvider } from './providers/communication/zoom.provider';
import { EncryptionService } from 'src/common/utils/encryption.util';
import { HumeController } from './providers/ia/hume.controller';
import { HumeService } from './providers/ia/hume.service';
import { HttpModule } from '@nestjs/axios';
import { OpenAiProvider } from './providers/ia/openai.provider';

@Module({
    imports: [HttpModule],
    controllers: [IntegrationsController, HumeController],
    providers: [
        IntegrationsService,
        IntegrationsFactory,
        ZoomProvider,
        OpenAiProvider,
        EncryptionService,
        HumeService
    ],
    exports: [IntegrationsService, HumeService, IntegrationsFactory],
})
export class IntegrationsModule { }