import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdatePostulationStatusDto } from './dto/update-status.dto';
import { generateCredentials } from './services/credentials.service';
import { ALLOWED_STATUS_TRANSITIONS } from './utils/allowed-transitions';
import { userFullInfo } from 'src/common/interfaces/user.interface';
import { NotificationDispatcher } from 'src/notifications/notification.dispatcher';

@Injectable()
export class PostulationsService {
    constructor(
        private prisma: PrismaService,
        private readonly notifications: NotificationDispatcher
    ) { }

    async getStatus() {
        const statuses = await this.prisma.catEstatusVacante.findMany({ where: { activo: true } });
        return statuses.map(s => ({
            id: s.idEstatusVacante,
            description: s.decripcion
        }));
    }

    async updateStatus(companyId: number, postulationId: number, dto: UpdatePostulationStatusDto, user: userFullInfo, files: Express.Multer.File[]) {
        try {
            const postulation = await this.prisma.postulaciones.findFirst({
                where: { idPostulacion: postulationId }
            });
            if (!postulation) throw new NotFoundException('Postulación no encontrada');
            if (!postulation.curp) throw new Error('Los datos del postulante no estan completos');

            const statuses = await this.prisma.catEstatusVacante.findMany({ where: { activo: true } });
            const statusMap = new Map(statuses.map(s => [s.idEstatusVacante, s.decripcion]));

            const currentStatus = postulation.idEstatus || 1;
            const nextStatus = dto.statusId;
            const allowedTransitions = ALLOWED_STATUS_TRANSITIONS[currentStatus] || [];
            if (!allowedTransitions.includes(nextStatus)) {
                const currentStatusName = statusMap.get(currentStatus) || 'DESCONOCIDO';
                const nextStatusName = statusMap.get(nextStatus) || 'DESCONOCIDO';
                const allowedNames = allowedTransitions.map(id => statusMap.get(id));
                throw new BadRequestException(`No se puede cambiar de ${currentStatusName} a ${nextStatusName}. Estado actual: ${currentStatusName}, Estados permitidos: ${allowedNames.join(', ')}`);
            }

            if (dto.statusId === 6) {
                await generateCredentials(
                    {
                        curp: postulation.curp,
                        nombre: postulation.nombre,
                        apellido1: postulation.primerApellido,
                        apellido2: postulation.segundoApellido || '',
                        correo: postulation.correo,
                        idPuesto: postulation.idPuesto ?? 0,
                        usuario: user.username || 'sistema',
                        idCampania: dto.campaignId || null,
                    },
                    files ?? [],
                    this.prisma,
                    this.notifications.notify.bind(this.notifications)
                );
            }

            return await this.prisma.postulaciones.update({
                where: { idPostulacion: postulationId },
                data: { idEstatus: dto.statusId }
            });
        }
        catch (error) { throw error; }
    }
}