import { BadRequestException, Injectable } from "@nestjs/common";
import { IArtemisProvider } from "./interfaces/artemis.interface";
import { PrismaService } from "src/prisma/prisma.service";
import { EncryptionService } from "src/common/utils/encryption.util";

@Injectable()
export class ArtemisProvider implements IArtemisProvider {
    constructor(
        private prisma: PrismaService,
        private encryptionService: EncryptionService
    ) { }

    async connect(companyId: number, providerId: number, dto: any): Promise<any> {
        const { apiKey } = dto;

        const isConnected = await this.prisma.integraciones.findFirst({
            where: { idEmpresa: companyId, providerId: providerId, isConnected: true }
        });
        if (isConnected) throw new BadRequestException('Artemis ya está conectado');

        await this.prisma.$transaction(async (tx) => {
            await tx.integraciones.create({
                data: {
                    idEmpresa: companyId,
                    providerId: providerId,
                    isConnected: true,
                    metadata: {
                        apiKey: this.encryptionService.encrypt(apiKey),
                    }
                }
            });
        });

        return { message: 'Artemis conectado exitosamente' };
    }

    async disconnect(companyId: number, providerId: number) {
        try {
            await this.prisma.$transaction(async (tx) => {
                await tx.integraciones.delete({
                    where: {
                        idEmpresa_providerId: {
                            idEmpresa: companyId,
                            providerId: providerId
                        }
                    }
                });
            });

            return { message: 'Artemis desconectado exitosamente' };
        } catch (error) {
            throw new BadRequestException('Error al desconectar Artemis');
        }
    }
}