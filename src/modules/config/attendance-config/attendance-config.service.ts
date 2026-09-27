import { BadRequestException, Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { ActiveUserDto } from 'src/modules/auth/dto/active-user.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { AttendanceModuleConfig, DEFAULT_ATTENDANCE_CONFIG } from './interfaces/attendance-config.interface';
import { UpdateAttendanceConfigDto } from './dto/update-attendance-config.dto';
import { AssignDeviceSiteDto } from './dto/assign-device-site.dto';

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
                `Configuración de asistencias actualizada exitosamente para tenant ${idTenant}`,
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

    // Obtener todos los dispositivos registrados para la empresa y tenant
    async getDispositivos(idTenant: number, companyId: number) {
        try {
            const dispositivos = await this.prisma.catDispositivos.findMany({
                where: {
                    idTenant,
                    OR: [
                        { idEmpresa: companyId },
                        { idEmpresa: null },
                    ],
                },
                include: {
                    CatSites: {
                        select: {
                            idSite: true,
                            Descripcion: true,
                        },
                    },
                },
                orderBy: {
                    FechaRegistro: 'desc',
                },
            });

            return {
                message: 'Dispositivos obtenidos correctamente',
                data: dispositivos,
            };
        } catch (error) {
            this.logger.error(
                `Error al consultar dispositivos para tenant ${idTenant} y empresa ${companyId}`,
                error?.stack || error,
            );
            throw new InternalServerErrorException('Error al obtener el catálogo de dispositivos.');
        }
    }

    // Asignar o cambiar de sede (Site) a un dispositivo
    async assignDeviceSite(
        idTenant: number,
        companyId: number,
        idDispositivo: number,
        dto: AssignDeviceSiteDto,
    ) {
        try {
            const dispositivo = await this.prisma.catDispositivos.findFirst({
                where: {
                    idDispositivo,
                    idTenant,
                },
            });

            if (!dispositivo) {
                throw new NotFoundException('El dispositivo especificado no existe o no pertenece a este tenant.');
            }

            // Validar si la sede existe y pertenece a la empresa/tenant en caso de enviar idSite
            if (dto.idSite) {
                const site = await this.prisma.catSites.findFirst({
                    where: {
                        idSite: dto.idSite,
                        idTenant,
                    },
                });

                if (!site) {
                    throw new BadRequestException('La sede seleccionada no es válida.');
                }
            }

            const updated = await this.prisma.catDispositivos.update({
                where: { idDispositivo },
                data: {
                    idSite: dto.idSite ?? null,
                    idEmpresa: companyId,
                },
                include: {
                    CatSites: true,
                },
            });

            return {
                message: dto.idSite ? 'Dispositivo asignado a la sede exitosamente.' : 'Dispositivo desvinculado de la sede.',
                data: updated,
            };
        } catch (error) {
            if (error instanceof NotFoundException || error instanceof BadRequestException) {
                throw error;
            }
            this.logger.error(
                `Error al asignar sede al dispositivo ${idDispositivo}`,
                error?.stack || error,
            );
            throw new InternalServerErrorException('Error al actualizar la sede del dispositivo.');
        }
    }
}
