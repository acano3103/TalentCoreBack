import { Module } from '@nestjs/common';
import { PostulationsController } from './postulations.controller';
import { PostulationsService } from './postulations.service';
import { HttpModule } from '@nestjs/axios';
import { PrismaService } from '../../prisma/prisma.service';

@Module({
    imports: [HttpModule],
    controllers: [PostulationsController],
    providers: [PostulationsService, PrismaService]
})
export class PostulationsModule { }