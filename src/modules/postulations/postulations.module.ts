import { Module } from '@nestjs/common';
import { PostulationsController } from './postulations.controller';
import { PostulationsService } from './postulations.service';
import { HttpModule } from '@nestjs/axios';
import { IntegrationsModule } from '../integrations/integrations.module';

@Module({
    imports: [HttpModule, IntegrationsModule],
    controllers: [PostulationsController],
    providers: [PostulationsService]
})
export class PostulationsModule { }