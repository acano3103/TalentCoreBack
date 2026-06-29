import { Module } from '@nestjs/common';
import { PostulationsController } from './postulations.controller';
import { PostulationsService } from './postulations.service';
import { HttpModule } from '@nestjs/axios';

@Module({
    imports: [HttpModule],
    controllers: [PostulationsController],
    providers: [PostulationsService]
})
export class PostulationsModule { }