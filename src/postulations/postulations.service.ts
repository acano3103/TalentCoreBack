import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdatePostulationStatusDto } from './dto/update-status.dto';
import { generateCredentials } from './utils/generate-credentials';
import { ALLOWED_STATUS_TRANSITIONS } from './utils/allowed-transitions';
import { userFullInfo } from 'src/common/interfaces/user.interface';

@Injectable()
export class PostulationsService {
    constructor(private prisma: PrismaService) { }

    async getStatus() {
        const statuses = await this.prisma.catEstatusVacante.findMany({ where: { activo: true } });
        return statuses.map(s => ({
            id: s.idEstatusVacante,
            description: s.decripcion
        }));
    }

    async updateStatus(companyId: number, postulationId: number, dto: UpdatePostulationStatusDto, user: userFullInfo) {
        try {
            const postulation = await this.prisma.postulaciones.findFirst({
                where: { idPostulacion: postulationId }
            });
            if (!postulation) throw new NotFoundException('Postulación no encontrada');
            if (!postulation.curp) throw new Error('Los datos del postulante no estan completos');

            const statuses = await this.prisma.catEstatusVacante.findMany({ where: { activo: true } });
            const statusMap = new Map(statuses.map(s => [s.idEstatusVacante, s.decripcion]));

            const currentStatus = postulation.idEstatus || 1;
            const nextStatus = dto.status_id;
            const allowedTransitions = ALLOWED_STATUS_TRANSITIONS[currentStatus] || [];
            if (!allowedTransitions.includes(nextStatus)) {
                const currentStatusName = statusMap.get(currentStatus) || 'DESCONOCIDO';
                const nextStatusName = statusMap.get(nextStatus) || 'DESCONOCIDO';
                const allowedNames = allowedTransitions.map(id => statusMap.get(id));
                throw new BadRequestException(`No se puede cambiar de ${currentStatusName} a ${nextStatusName}. Estado actual: ${currentStatusName}, Estados permitidos: ${allowedNames.join(', ')}`);
            }

            if (dto.status_id === 6) {
                await generateCredentials(
                    postulation.curp,
                    postulation.nombre,
                    postulation.primerApellido,
                    postulation.segundoApellido || '',
                    postulation.correo,
                    postulation.idPuesto ?? 0,
                    user.username || 'sistema',
                    dto.campaign_id || null,
                    this.prisma
                );
            }
            return await this.prisma.postulaciones.update({
                where: { idPostulacion: postulationId },
                data: { idEstatus: dto.status_id }
            });
        }
        catch (error) { throw error; }
    }
}