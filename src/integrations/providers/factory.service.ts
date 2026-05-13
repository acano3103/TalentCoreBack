import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { ICommunicationProvider } from './communication/interfaces/communication.interface';
import { ZoomProvider } from './communication/zoom.provider';

@Injectable()
export class CommunicationFactory {
    constructor(
        private prisma: PrismaService,
        private zoomProvider: ZoomProvider,
    ) { }

    async getProvider(providerId: number): Promise<ICommunicationProvider> {
        const providerCat = await this.prisma.catIntegracionesProvedores.findUnique({
            where: { id: providerId }
        });

        if (!providerCat) throw new BadRequestException('El proveedor de integración no existe');

        switch (providerCat.code.toUpperCase()) {
            case 'ZOOM':
                return this.zoomProvider;
            case 'MEET':
                throw new BadRequestException('Proveedor Meet aún no implementado');
            case 'TEAMS':
                throw new BadRequestException('Proveedor Teams aún no implementado');
            default:
                throw new BadRequestException(`No hay un provider configurado para: ${providerCat.code}`);
        }
    }
}