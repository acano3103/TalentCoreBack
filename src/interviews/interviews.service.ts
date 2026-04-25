import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateInterviewDto } from './dto/create-interview.dto';
import { CommunicationFactory } from '../integrations/providers/factory.service';
import { NotificationDispatcher } from 'src/notifications/notification.dispatcher';
import { quotePlus } from 'src/common/utils/address.utils';
import { formatDate, formatHour } from 'src/common/utils/time.utils';
import { findAllInterviews } from './queries/interviews.queries';
import { Entrevistas_interview_type } from 'generated/prisma/enums';

@Injectable()
export class InterviewsService {
    constructor(
        private prisma: PrismaService,
        private communicationFactory: CommunicationFactory,
        private readonly notifications: NotificationDispatcher
    ) { }

    private readonly logger = new Logger(InterviewsService.name);

    async findAll(companyId: number, positionId?: number) {
        return await findAllInterviews(companyId, positionId, this.prisma);
    }

    async findAllByMainInterview(mainInterviewId: string) {
        const interviews = await this.prisma.entrevistas.findMany({
            where: { id: mainInterviewId },
            include: { EntrevistasPostulantes: true }
        });
        return interviews;
    }

    async findActivePositions(companyId: number) {
        const activePositions = await this.prisma.catPuestos.findMany({
            where: {
                idEmpresa: companyId,
                aprobada: true
            },
            select: {
                idPuesto: true,
                NombrePuesto: true,
            }
        });
        return activePositions;
    }

    async create(companyId: number, positionId: number, dto: CreateInterviewDto) {
        await this.prisma.entrevistas.create({
            data: {
                company_id: companyId,
                position_id: positionId,
                provider_id: dto.providerId,
                agent_id: dto.agentId || null,
                interview_type: dto.interviewType,
                modality: dto.modality,
                title: dto.title,
                duration: dto.duration,
                interviewer_name: dto.interviewerName,
                location: dto.locationAddress || null,
                comment: dto.comment || null,
                EntrevistasCriterios: {
                    createMany: {
                        data: dto.criteria.map(criterion => ({
                            name: criterion.name,
                            description: criterion.description || null,
                            max_score: criterion.maxScore || 10,
                            weight: criterion.weight || null,
                            order: criterion.order || null,
                        })),
                    },
                }
            }
        });
        return { message: 'Entrevista creada exitosamente' };
    }

    // async create(companyId: number, providerId: number, dto: CreateInterviewDto) {
    //     const totalWeight = dto.criteria.reduce((acc, curr) => acc + curr.weight, 0);
    //     if (totalWeight !== 100) throw new BadRequestException('La suma de los pesos debe ser 100');

    //     let meetingData: any = { id: null, interviewId: null, url: null, metadata: null };
    //     try {
    //         if (dto.modality === 'ONLINE' && dto.interviewType === 'PERSONA') {
    //             const zoomProvider = await this.communicationFactory.getProvider(providerId);
    //             meetingData = await zoomProvider.createMeeting(companyId, providerId, dto);
    //         }

    //         const interview = await this.prisma.entrevistas.create({
    //             data: {
    //                 companyId,
    //                 postulantId: dto.postulantId,
    //                 positionId: dto.positionId,
    //                 interviewType: dto.interviewType as any,
    //                 modality: dto.modality as any,
    //                 title: dto.title,
    //                 scheduledAt: new Date(dto.scheduledAt),
    //                 duration: dto.duration,
    //                 interviewerName: dto.interviewerName,
    //                 locationAddress: dto.locationAddress || null,
    //                 meetingId: meetingData?.id || null,
    //                 meetingUrl: meetingData?.url || null,
    //                 status: 'PROGRAMADO',
    //                 comment: dto.comment || null,
    //                 providerId,
    //                 metadata: meetingData?.metadata || null,
    //                 EntrevistasCriterios: {
    //                     create: dto.criteria.map(criterion => ({
    //                         criteriaName: criterion.criteriaName,
    //                         weight: criterion.weight,
    //                     }))
    //                 },
    //                 EntrevistasResultados: {
    //                     create: {}
    //                 }
    //             },
    //             include: { EntrevistasCriterios: true, EntrevistasResultados: true }
    //         });
    //         meetingData.interviewId = interview.id;

    //         const postulant = await this.prisma.postulaciones.findUnique({ where: { idPostulacion: dto.postulantId } });
    //         if (!postulant) throw new BadRequestException('No se encontró el postulante');

    //         const date = new Date(dto.scheduledAt);
    //         const day = formatDate(date);
    //         const hour = formatHour(date);

    //         let map_link: string | null = null;
    //         let map_img: string | null = null;
    //         let lugar_mostrado = dto.locationAddress;

    //         if (dto.locationAddress && !meetingData?.url) {
    //             const q = quotePlus(dto.locationAddress.trim());
    //             map_link = `https://www.google.com/maps/search/?api=1&query=${q}`;
    //             map_img = `https://staticmap.openstreetmap.de/staticmap.php?center=${q}&zoom=16&size=600x300&markers=${q},red-pushpin`;
    //         }

    //         await this.notifications.notify({
    //             userUuid: postulant.uuid,
    //             notificationTypeCode: 'INTERVIEW_SCHEDULED',
    //             to: postulant.correo,
    //             phone: postulant.telefono,
    //             subject: dto.title,
    //             context: {
    //                 nombre: `${postulant.nombre} ${postulant.primerApellido}`,
    //                 entrevistasNombre: dto.title,
    //                 dia: day,
    //                 hora: hour,
    //                 lugar: lugar_mostrado,
    //                 liga: meetingData?.url,
    //                 map_link: map_link,
    //                 map_img: map_img,
    //                 comentarios: dto.comment,
    //             }
    //         });

    //         return { message: 'Entrevista creada exitosamente' };
    //     } catch (error) {
    //         await this.prisma.entrevistas.deleteMany({ where: { id: meetingData?.interviewId } });
    //         const provider = await this.communicationFactory.getProvider(providerId);
    //         if (provider) await provider.deleteMeeting(companyId, providerId, meetingData?.id);

    //         this.logger.error('Error creating interview', error);
    //         throw new BadRequestException('Error al crear entrevista');
    //     }
    // }

    // async findAllByCandidate(postulantId: number) {
    //     return this.prisma.entrevistas.findMany({
    //         where: { postulantId },
    //         include: { EntrevistasCriterios: true, EntrevistasResultados: true },
    //         orderBy: { scheduledAt: 'desc' }
    //     });
    // }
}