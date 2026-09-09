import { Injectable, InternalServerErrorException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { ActiveUserDto } from '../auth/dto/active-user.dto';
import { IntegrationsFactory } from '../integrations/providers/factory.service';

@Injectable()
export class RoleplayCallsService {
    private readonly logger = new Logger(RoleplayCallsService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly integrationFactory: IntegrationsFactory,
    ) { }

    // Busca la integración de IA activa de la empresa, y regresa el proveedor correspondiente ya resuelto
    private async getAiProvider(companyId: number) {
        const activeAiIntegration = await this.prisma.integraciones.findFirst({
            where: {
                idEmpresa: companyId,
                isConnected: true,
                CatIntegracionesProvedores: {
                    type: 'ai',
                    isActive: true,
                },
            },
            include: { CatIntegracionesProvedores: true },
        });

        if (!activeAiIntegration) {
            throw new BadRequestException('La empresa no cuenta con una integración de Inteligencia Artificial activa.');
        }

        return this.integrationFactory.getProvider(activeAiIntegration.providerId);
    }

    async startCall(companyId: number, idRolePlay: number, user: ActiveUserDto) {
        if (!user.idTenant) {
            throw new InternalServerErrorException('El usuario no tiene un tenant asignado.');
        }

        const aiProvider = await this.getAiProvider(companyId);
        return aiProvider.startRoleplayCall(companyId, user.idTenant, idRolePlay, user.id);
    }

    async processTurn(companyId: number, idLlamada: number, agentMessage: string, user: ActiveUserDto) {
        if (!user.idTenant) {
            throw new InternalServerErrorException('El usuario no tiene un tenant asignado.');
        }

        const aiProvider = await this.getAiProvider(companyId);
        return aiProvider.processRoleplayTurn(companyId, user.idTenant, idLlamada, agentMessage);
    }

    async finishCall(companyId: number, idLlamada: number, user: ActiveUserDto) {
        if (!user.idTenant) {
            throw new InternalServerErrorException('El usuario no tiene un tenant asignado.');
        }

        const llamada = await this.prisma.rolePlayLlamadas.findFirst({
            where: { idLlamada, idEmpresa: companyId, idTenant: user.idTenant },
        });

        if (!llamada) {
            throw new BadRequestException('La sesión de práctica no existe.');
        }
        if (llamada.Estatus !== 'EN_CURSO') {
            throw new BadRequestException('La sesión de práctica no está en curso.');
        }

        await this.prisma.rolePlayLlamadas.update({
            where: { idLlamada },
            data: { Estatus: 'FINALIZADA', FechaFin: new Date() },
        });

        return { success: true, message: 'Sesión finalizada correctamente.' };
    }

    async evaluate(companyId: number, idLlamada: number, user: ActiveUserDto) {
        if (!user.idTenant) {
            throw new InternalServerErrorException('El usuario no tiene un tenant asignado.');
        }

        const aiProvider = await this.getAiProvider(companyId);
        return aiProvider.evaluateRoleplayCall(companyId, user.idTenant, idLlamada);
    }

    async getEvaluation(companyId: number, idLlamada: number, user: ActiveUserDto) {
        if (!user.idTenant) {
            throw new InternalServerErrorException('El usuario no tiene un tenant asignado.');
        }

        const evaluacion = await this.prisma.rolePlayEvaluaciones.findFirst({
            where: { idLlamada, idTenant: user.idTenant },
            include: {
              RolePlayEvaluacionCriterios: {
                include: { EvaluationCriteria: true },
            },
            },
        });

        if (!evaluacion) {
            throw new BadRequestException('Esta sesión aún no ha sido evaluada.');
        }

        return evaluacion;
    }

    async synthesizeSpeech(companyId: number, text: string, user: ActiveUserDto): Promise<Buffer> {
    if (!user.idTenant) {
        throw new InternalServerErrorException('El usuario no tiene un tenant asignado.');
    }

    const elevenLabsIntegration = await this.prisma.integraciones.findFirst({
        where: {
            idEmpresa: companyId,
            isConnected: true,
            CatIntegracionesProvedores: { code: 'ELEVENLABS' },
        },
    });

    if (!elevenLabsIntegration) {
        throw new BadRequestException('La empresa no cuenta con una integración de voz (ElevenLabs) activa.');
    }

    const elevenLabsProvider = await this.integrationFactory.getProvider(elevenLabsIntegration.providerId);
    const DEFAULT_VOICE_ID = 'EXAVITQu4vr4xnSDxMaL'; // mismo default que usa SimuPro

    return elevenLabsProvider.synthesizeSpeech(companyId, text, DEFAULT_VOICE_ID);
}
}