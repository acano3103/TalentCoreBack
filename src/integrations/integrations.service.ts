import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { ConnectIntegrationDto } from './dto/connect-integration.dto';
import { IntegrationsFactory } from './providers/factory.service';

@Injectable()
export class IntegrationsService {
    constructor(
        private prisma: PrismaService,
        private communicationFactory: IntegrationsFactory,
    ) { }

    async getIntegrations(companyId: number) {
        const providers = await this.prisma.catIntegracionesProvedores.findMany({
            where: {
                isActive: true
            },
            include: {
                Integraciones: {
                    where: {
                        idEmpresa: companyId,
                        isConnected: true
                    }
                }
            }
        });

        const formattedData = providers.map(provider => {
            const connection = provider.Integraciones[0];

            return {
                id: provider.id,
                code: provider.code,
                name: provider.name,
                type: provider.type,
                isConnected: connection ? connection.isConnected : false
            };
        });

        return formattedData;
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