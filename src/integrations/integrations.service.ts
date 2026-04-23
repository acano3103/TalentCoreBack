import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { ConnectIntegrationDto } from './dto/connect-integration.dto';
import { CommunicationFactory } from './providers/factory.service';

@Injectable()
export class IntegrationsService {
    constructor(
        private prisma: PrismaService,
        private communicationFactory: CommunicationFactory,
    ) { }

    async getIntegrations(companyId: number) {
        const integrations = await this.prisma.catIntegracionesProvedores.findMany({
            where: { isActive: true },
        });

        return integrations;
    }

    async connect(companyId: number, providerId: number, dto: ConnectIntegrationDto) {
        const provider = await this.communicationFactory.getProvider(providerId);
        return provider.connect(companyId, providerId, dto);
    }

    async disconnect(companyId: number, providerId: number) {
        const provider = await this.communicationFactory.getProvider(providerId);
        return provider.disconnect(companyId, providerId);
    }
}