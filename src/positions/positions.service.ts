import {
    Injectable,
    NotFoundException,
    InternalServerErrorException,
    Logger
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { NotificationDispatcher } from 'src/notifications/notification.dispatcher';
import { ValidatePositionDto } from './dto/approve-reject.dto';
import { PositionQueries } from './queries/positions.queries';

@Injectable()
export class PositionsService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly notifications: NotificationDispatcher
    ) { }

    private readonly logger = new Logger(PositionsService.name);

    async approveOrReject(companyId: number, positionId: number, dto: ValidatePositionDto) {
        try {
            const position = await PositionQueries.getPositionInfo(this.prisma, positionId);
            if (!position) throw new NotFoundException('No se encontró el puesto');

            const { positionName, email, phone, userUuid, name } = position;
            const comment = dto.comment || '';
            const action = dto.action;
            const subject = action === 'aprobar' ? '✅ Puesto Aprobado - FileOnline' : '❌ Puesto Rechazado - FileOnline';

            if (action === 'aprobar') {
                await PositionQueries.approvePosition(this.prisma, positionId, comment);
            } else {
                await PositionQueries.rejectPosition(this.prisma, positionId, comment);
            }

            await this.notifications.notify({
                userUuid: userUuid,
                notificationTypeCode: 'POSITION_STATUS_UPDATE',
                to: email,
                phone: phone,
                subject: subject,
                context: {
                    name,
                    positionName,
                    comment,
                    action,
                    isApproved: action === 'aprobar'
                }
            });

            return { message: `Requisición ${action == 'aprobar' ? 'aprobada' : 'rechazada'} correctamente` };

        } catch (error) {
            this.logger.error('Error en aprobar/rechazar puesto:', error);
            throw new InternalServerErrorException(error.message);
        }
    }
}