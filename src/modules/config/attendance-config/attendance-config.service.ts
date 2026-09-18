import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ActiveUserDto } from 'src/modules/auth/dto/active-user.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { AttendanceModuleConfig, DEFAULT_ATTENDANCE_CONFIG } from './interfaces/attendance-config.interface';
import { UpdateAttendanceConfigDto } from './dto/update-attendance-config.dto';

@Injectable()
export class AttendanceTrackingConfigService {
    private readonly logger = new Logger(AttendanceTrackingConfigService.name);

    constructor(
        private readonly prisma: PrismaService
    ) { }

    async getConfiguracionAsistencia(idTenant: number, companyId: number): Promise<AttendanceModuleConfig> {
        const registro = await this.prisma.tenantConfiguracionesModulos.findUnique({
            where: {
                idTenant_moduloCodigo: {
                    idTenant: idTenant,
                    moduloCodigo: 'attendance-tracking',
                },
            },
        });

        if (!registro || !registro.configuracion) {
            return DEFAULT_ATTENDANCE_CONFIG;
        }

        // Merge profundo con defaults por si el cliente no ha seteado llaves nuevas
        const configGuardada = registro.configuracion as Partial<AttendanceModuleConfig>;
        return {
            ...DEFAULT_ATTENDANCE_CONFIG,
            ...configGuardada,
            tolerancia: { ...DEFAULT_ATTENDANCE_CONFIG.tolerancia, ...configGuardada.tolerancia },
            comida: { ...DEFAULT_ATTENDANCE_CONFIG.comida, ...configGuardada.comida },
            salidas: { ...DEFAULT_ATTENDANCE_CONFIG.salidas, ...configGuardada.salidas },
            horasExtra: { ...DEFAULT_ATTENDANCE_CONFIG.horasExtra, ...configGuardada.horasExtra },
            movil: { ...DEFAULT_ATTENDANCE_CONFIG.movil, ...configGuardada.movil },
        };
    }

    // Esta función actualiza la configuración del módulo de asistencia
    async updateConfiguracionAsistencia(
        idTenant: number,
        companyId: number,
        dto: UpdateAttendanceConfigDto,
    ) {
        try {
            const registro = await this.prisma.tenantConfiguracionesModulos.upsert({
                where: {
                    idTenant_moduloCodigo: {
                        idTenant,
                        moduloCodigo: 'attendance-tracking',
                    },
                },
                create: {
                    idTenant,
                    moduloCodigo: 'attendance-tracking',
                    configuracion: dto as any,
                    activo: true,
                },
                update: {
                    configuracion: dto as any,
                    activo: true,
                },
            });

            this.logger.log(
                `Configuración de asistencias actualizada exitosamente para tenant ${idTenant} (Empresa: ${companyId})`,
            );

            return {
                message: 'Configuración actualizada exitosamente',
                data: registro.configuracion,
            };
        } catch (error) {
            this.logger.error(
                `Error al guardar configuración de asistencia para tenant ${idTenant}`,
                error?.stack || error,
            );
            throw new InternalServerErrorException(
                'Ocurrió un error al intentar guardar la configuración del módulo.',
            );
        }
    }
}
