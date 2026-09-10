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
import { ArtemisController } from './providers/workforce-management/artemis/artemis.controller';
import { ArtemisService } from './providers/workforce-management/artemis/artemis.service';
import { ArtemisMapper } from './providers/workforce-management/artemis/artemis.mapper';
import { ArtemisProvider } from './providers/workforce-management/artemis/artemis.provider';
import { MediaPathModule } from 'src/common/services/media-path.module';

@Module({
    imports: [HttpModule, MediaPathModule],
    controllers: [IntegrationsController, HumeController, ArtemisController],
    providers: [
        IntegrationsService,
        IntegrationsFactory,
        ZoomProvider,
        OpenAiProvider,
        EncryptionService,
        HumeService,
        ArtemisService,
        ArtemisMapper,
        ArtemisProvider,
        MediaPathModule
    ],
    exports: [IntegrationsService, HumeService, IntegrationsFactory, ArtemisService],
})
export class IntegrationsModule { }