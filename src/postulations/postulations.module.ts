// postulations.module.ts
import { Module } from '@nestjs/common';
import { PostulationsController } from './postulations.controller';
import { PostulationsService } from './postulations.service';
import { PrismaService } from '../prisma/prisma.service';

@Module({
    controllers: [PostulationsController],
    providers: [PostulationsService, PrismaService]
})
export class PostulationsModule { }