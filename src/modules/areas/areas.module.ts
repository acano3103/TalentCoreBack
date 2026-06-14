import { Module } from '@nestjs/common';
import { AreasController } from './areas.controller';
import { AreasService } from './areas.service';
import { PrismaService } from 'src/prisma/prisma.service';

@Module({
  controllers: [AreasController],
  providers: [AreasService, PrismaService]
})
export class AreasModule { }
