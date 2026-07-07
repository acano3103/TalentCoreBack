import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class DigitalFilesService {
    private readonly logger = new Logger(DigitalFilesService.name);

    constructor(
        private prisma: PrismaService
    ) { }
}
