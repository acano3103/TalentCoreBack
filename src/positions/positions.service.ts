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
import * as fs from 'fs';
import * as path from 'path';
import { calculatePercentage, getScoreTrafficLight } from './utils/formatters.util';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PositionsService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly notifications: NotificationDispatcher,
        private readonly configService: ConfigService,
    ) { }

    private readonly logger = new Logger(PositionsService.name);

    async findAllPositions(companyId: number, status?: string) {
        try {
            const rows = await PositionQueries.getActivePositions(this.prisma, Number(companyId)) as any[];

            const puestos = rows.map((p) => {
                return {
                    idPuesto: typeof p.idPuesto === 'bigint' ? Number(p.idPuesto) : p.idPuesto,
                    NombrePuesto: p.NombrePuesto,
                    DescripcionPuesto: p.DescripcionPuesto,
                    SalarioMinimo: p.SalarioMinimo ? String(p.SalarioMinimo) : null,
                    SalarioMaximo: p.SalarioMaximo ? String(p.SalarioMaximo) : null,
                    Vacantes: p.Vacantes ? Number(p.Vacantes) : 0,
                    Edad: p.Edad ? String(p.Edad) : null,
                    Area: p.Area,
                    TipoPuesto: p.TipoPuesto,
                    TipoContratacion: p.TipoContratacion,
                    Modalidad: p.Modalidad,
                    Escolaridad: p.Escolaridad,
                    Site: p.Site,
                    TotalCVs: p.TotalCVs ? Number(p.TotalCVs) : 0,
                    TotalAprobados: p.TotalAprobados ? Number(p.TotalAprobados) : 0,
                    TotalRechazados: p.TotalRechazados ? Number(p.TotalRechazados) : 0,
                };
            });

            return puestos;

        } catch (error) {
            console.error('Error al obtener posiciones activas con métricas:', error);
            throw new InternalServerErrorException('Error al procesar las vacantes');
        }
    }

    async findPositionById(companyId: number, positionId: number) {
        return this.prisma.catPuestos.findFirst({
            where: {
                idPuesto: positionId,
                Activo: true
            }
        })
    }

    async getPostulantsSummary(idPuesto: number) {
        const CV_DEFAULT = "https://fileonline.datavoice.com.mx/RR-HH/media/GRUS990820HDFVRC07/documento_1_GRUS990820HDFVRC07.pdf";
        const mediaPrefixRaw = this.configService.get<string>('MEDIA_PATH_PREFIX') || 'media';
        const mediaPrefix = mediaPrefixRaw.replace(/^\/+|\/+$/g, '');

        try {
            const rows = await PositionQueries.getPostulantsSummary(this.prisma, Number(idPuesto)) as any[];

            const postulantes = rows.map((p) => {
                let indices = p.indices ? (typeof p.indices === 'string' ? JSON.parse(p.indices) : p.indices) : {};
                if (indices && Object.keys(indices).length > 0) {
                    indices['indice_ajuste_tecnico'] = calculatePercentage(indices['indice_ajuste_tecnico']);
                    indices['indice_ajuste_competencial'] = calculatePercentage(indices['indice_ajuste_competencial']);
                }

                let categorias = p.detalle_por_categoria
                    ? (typeof p.detalle_por_categoria === 'string' ? JSON.parse(p.detalle_por_categoria) : p.detalle_por_categoria)
                    : [];

                if (Array.isArray(categorias)) {
                    categorias = categorias.map((c: any) => {
                        const { peso, justificacion, score_ponderado, ...rest } = c;
                        return {
                            ...rest,
                            porcentaje_cumplimiento: calculatePercentage(c.porcentaje_cumplimiento),
                        };
                    });
                }

                let finalRutaCV = CV_DEFAULT;
                if (p.rutaCV) {
                    const rootPath = path.join(process.cwd(), 'media');
                    const rutaFisica = path.join(rootPath, p.rutaCV);
                    if (fs.existsSync(rutaFisica)) {
                        finalRutaCV = p.rutaCV.startsWith('http') ? p.rutaCV : `/${mediaPrefix}/${p.rutaCV}`;
                    }
                }

                return {
                    ...p,
                    idPostulacion: typeof p.idPostulacion === 'bigint' ? Number(p.idPostulacion) : p.idPostulacion,
                    indices,
                    detalle_por_categoria: categorias,
                    rutaCV: finalRutaCV,
                    semaforo_global: getScoreTrafficLight(Number(p.score_global)),
                };
            });

            return { postulantes };

        } catch (error) {
            console.error('Error en servicio:', error);
            throw new InternalServerErrorException('Error al procesar postulantes');
        }
    }

    async approveOrReject(companyId: number, positionId: number, dto: ValidatePositionDto) {
        try {
            const position = await PositionQueries.getPositionInfo(this.prisma, positionId);
            if (!position) throw new NotFoundException('No se encontró el puesto');

            const { positionName, email, phone, userUuid, name } = position;
            const comment = dto.comment || '';
            const action = dto.action;
            const subject = action === 'aprobar' ? '✅ Puesto Aprobado - TalentCore' : '❌ Puesto Rechazado - TalentCore';

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