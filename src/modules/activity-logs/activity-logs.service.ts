import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class ActivityLogsService {
    constructor(
        private readonly prisma: PrismaService,
    ) { }

    async getActivityLogs(originTable: string, recordId: number) {
        // @ts-ignore
        const activityLogs = await this.prisma.historicoMovimientos.findMany({
            where: {
                tablaOrigen: originTable,
                idRegistro: recordId,
            },
            include: {
                auth_user: {
                    select: {
                        id: true,
                        first_name: true,
                        last_name: true,
                        username: true,
                        phone: true,
                        email: true,
                    },
                },
            },
            orderBy: {
                fechaCreacion: 'desc',
            },
        });
        return activityLogs;
    }
}
