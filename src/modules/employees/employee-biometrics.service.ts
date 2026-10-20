import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { ActiveUserDto } from '../auth/dto/active-user.dto';
import { IntegrationsFactory } from '../integrations/providers/factory.service';
import { ArtemisProvider } from '../integrations/providers/workforce-management/artemis/artemis.provider';

// Código del catálogo CatIntegracionesProvedores para la integración de biométricos (ZkBio Integration API)
export const BIOMETRIC_PROVIDER_CODE = 'ZKBIO';

// Lógica de biométricos del empleado (alta en el biométrico, rostro y huellas).
// Las llamadas a la API externa viven en ArtemisProvider; aquí solo va la lógica del empleado.
@Injectable()
export class EmployeeBiometricsService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly integrationFactory: IntegrationsFactory,
    ) { }

    private getTenantOrThrow(activeUser: ActiveUserDto): number {
        if (!activeUser?.idTenant) {
            throw new InternalServerErrorException('El usuario no tiene un tenant asignado.');
        }
        return activeUser.idTenant;
    }

    // Busca la integración de biométricos activa de la empresa (del mismo tenant) y regresa su proveedor
    private async getBiometricProvider(activeUser: ActiveUserDto, companyId: number): Promise<ArtemisProvider> {
        const idTenant = this.getTenantOrThrow(activeUser);

        const integracion = await this.prisma.integraciones.findFirst({
            where: {
                idEmpresa: companyId,
                isConnected: true,
                CatEmpresas: { idTenant },
                CatIntegracionesProvedores: {
                    code: BIOMETRIC_PROVIDER_CODE,
                    isActive: true,
                },
            },
        });

        if (!integracion) {
            throw new BadRequestException('La empresa no cuenta con la integración de biométricos activa.');
        }

        return this.integrationFactory.getProvider(integracion.providerId);
    }

    // Catálogo de departamentos del biométrico (obligatorio para dar de alta a una persona)
    async getDepartments(activeUser: ActiveUserDto, companyId: number) {
        const provider = await this.getBiometricProvider(activeUser, companyId);
        return provider.getBiometricDepartments(companyId);
    }

    // Catálogo de niveles de acceso del biométrico (opcional al dar de alta a una persona)
    async getAccessLevels(activeUser: ActiveUserDto, companyId: number) {
        const provider = await this.getBiometricProvider(activeUser, companyId);
        return provider.getBiometricAccessLevels(companyId);
    }
}
