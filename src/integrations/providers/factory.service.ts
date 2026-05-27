import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { ZoomProvider } from './communication/zoom.provider';
import { OpenAiProvider } from './ia/openai.provider';

@Injectable()
export class IntegrationsFactory {
    constructor(
        private prisma: PrismaService,
        private zoomProvider: ZoomProvider,
        private openAiProvider: OpenAiProvider,
    ) { }

    async getProvider(providerId: number): Promise<any> {
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
            case 'OPENAI':
                return this.openAiProvider;
            case 'GEMINI':
                throw new BadRequestException('Proveedor Gemini aún no implementado');

            default:
                throw new BadRequestException(`No hay un provider configurado para: ${providerCat.code}`);
        }
    }
}