import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateInterviewDto } from './dto/create-interview.dto';
import { CommunicationFactory } from '../integrations/providers/factory.service';
import { NotificationDispatcher } from 'src/notifications/notification.dispatcher';
import { quotePlus } from 'src/common/utils/address.utils';
import { formatDate, formatHour } from 'src/common/utils/time.utils';
import { findAllInterviews, findAllInterviewsByPostulant, findInterviewDetail } from './queries/interviews.queries';
import { ProgramInterviewDto } from './dto/program-interview.dto';

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

    async create(companyId: number, dto: CreateInterviewDto) {
        const interviews = await Promise.all(
            dto.positionIds.map(positionId =>
                this.prisma.entrevistas.create({
                    data: {
                        company_id: companyId,
                        area_id: dto.areaId,
                        position_id: positionId,
                        provider_id: dto.providerId,
                        agent_id: dto.agentId || null,
                        description: dto.description || null,
                        interview_type: dto.interviewType,
                        modality: dto.modality,
                        title: dto.title,
                        duration: dto.duration,
                        interviewer_name: dto.interviewerName,
                        location: dto.locationAddress || null,
                        comment: dto.comment || null,
                        EntrevistasCriterios: {
                            create: dto.criteria.map(criterion => ({
                                name: criterion.name,
                                description: criterion.description || null,
                                max_score: criterion.maxScore || 10,
                                weight: criterion.weight || null,
                                order: criterion.order || null,
                                preguntas: criterion.questions?.length
                                    ? {
                                        create: criterion.questions.map(q => ({
                                            question: q.question,
                                            expected_answer: q.expectedAnswer || null,
                                            order: q.order || null,
                                        })),
                                    }
                                    : undefined,
                            })),
                        },
                    },
                })
            )
        );

        return { message: 'Entrevistas creadas exitosamente', total: interviews.length };
    }

    async programInterview(companyId: number, interviewId: string, dto: ProgramInterviewDto) {
        const mainInterview = await this.prisma.entrevistas.findFirst({
            where: { id: interviewId },
            include: { EntrevistasCriterios: true }
        })
        if (!mainInterview) throw new BadRequestException('No se encontró la entrevista principal')

        const postulant = await this.prisma.postulaciones.findFirst({ where: { idPostulacion: dto.postulantId } })
        if (!postulant) throw new BadRequestException('No se encontró el postulante')

        let meetingData: any = { id: null, interviewId: null, url: null, metadata: null };
        try {
            dto.duration = mainInterview.duration || 60;
            dto.title = mainInterview.title || 'Entrevista'
            if (mainInterview.interview_type === 'PERSONA' && mainInterview.modality === 'ONLINE') {
                const zoomProvider = await this.communicationFactory.getProvider(mainInterview.provider_id);
                meetingData = await zoomProvider.createMeeting(companyId, mainInterview.provider_id, dto);
            }

            const interview = await this.prisma.entrevistasPostulantes.create({
                data: {
                    candidate_uuid: postulant.uuid,
                    interview_id: mainInterview.id,
                    scheduled_at: new Date(dto.scheduledAt),
                    duration: dto.duration,
                    status: 'PROGRAMADO',
                    meeting_id: meetingData?.id || null,
                    meeting_url: meetingData?.url || null,
                    location: mainInterview.location || null,
                    metadata: meetingData?.metadata || null,
                    EntrevistaCriteriosEvaluacion: {
                        create: mainInterview.EntrevistasCriterios.map((criterio) => ({
                            criterio_id: criterio.id
                        }))
                    },
                    EntrevistasResultados: {
                        create: {}
                    }
                }
            });
            meetingData.interviewId = interview.id;

            const date = new Date(dto.scheduledAt);
            const day = formatDate(date);
            const hour = formatHour(date);

            let map_link: string | null = null;
            let map_img: string | null = null;
            let lugar_mostrado = mainInterview.location;

            if (mainInterview.location && !meetingData?.url) {
                const q = quotePlus(mainInterview.location.trim());
                map_link = `https://www.google.com/maps/search/?api=1&query=${q}`;
                map_img = `https://staticmap.openstreetmap.de/staticmap.php?center=${q}&zoom=16&size=600x300&markers=${q},red-pushpin`;
            }

            await this.notifications.notify({
                userUuid: postulant.uuid,
                notificationTypeCode: 'INTERVIEW_SCHEDULED',
                to: postulant.correo,
                phone: postulant.telefono,
                subject: mainInterview.title || '',
                context: {
                    nombre: `${postulant.nombre} ${postulant.primerApellido}`,
                    entrevistasNombre: mainInterview.title || '',
                    dia: day,
                    hora: hour,
                    lugar: lugar_mostrado,
                    liga: meetingData?.url,
                    map_link: map_link,
                    map_img: map_img,
                    comentarios: mainInterview.comment,
                }
            });

            return { message: 'Entrevista creada exitosamente' };
        } catch (error) {
            await this.prisma.entrevistasPostulantes.deleteMany({ where: { id: meetingData.interviewId } });
            const provider = await this.communicationFactory.getProvider(mainInterview.provider_id);
            if (provider) await provider.deleteMeeting(companyId, mainInterview.provider_id, meetingData?.id);

            this.logger.error('Error creating interview', error);
            throw new BadRequestException('Error al crear entrevista');
        }

    }

    async findAllByPostulant(postulantId: number) {
        const postulant = await this.prisma.postulaciones.findFirst({
            where: { idPostulacion: postulantId }
        })
        if (!postulant) throw new BadRequestException('No se encontró el postulante');

        return await findAllInterviewsByPostulant(postulant.uuid, this.prisma);
    }

    async getMeetingDetail(interviewId: string) {
        return await findInterviewDetail(interviewId, this.prisma);
    }
}