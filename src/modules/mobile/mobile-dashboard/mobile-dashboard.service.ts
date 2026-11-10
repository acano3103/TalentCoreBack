import { Injectable, Logger } from '@nestjs/common';
import { ActiveUserDto } from 'src/modules/auth/dto/active-user.dto';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class MobileDashboardService {
    private readonly logger = new Logger(MobileDashboardService.name);

    constructor(private readonly prisma: PrismaService) { }

    async getSummary(activeUser: ActiveUserDto, companyId: number) {
        // 1. Ejemplo de desestructuración del usuario autenticado
        const { id: userId, uuid, email, phone, username, first_name, last_name, idTenant, } = activeUser;

        this.logger.log(`Consultando dashboard para el usuario ID: ${userId} (${email || username})`);

        // 2. Consulta de ejemplo a la base de datos con Prisma
        // (Ajusta la tabla según tu esquema, por ejemplo consultar datos básicos del usuario o asistencias)
        const userDb = await this.prisma.auth_user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                first_name: true,
                last_name: true,
                email: true,
                is_active: true,
            },
        });

        return {
            message: 'Dashboard data retrieved successfully',
            user: {
                id: userId,
                fullName: `${userDb?.first_name ?? ''} ${userDb?.last_name ?? ''}`.trim(),
                email: userDb?.email ?? email,
            },
            dashboard: {
                // Aquí agregarán la lógica real de asistencias
                todayAttendance: {
                    hasCheckedIn: false,
                    checkInTime: null,
                    checkOutTime: null,
                },
                notificationsCount: 0,
            },
        };
    }
}
