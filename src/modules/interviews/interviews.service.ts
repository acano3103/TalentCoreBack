import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateInterviewDto } from './dto/create-interview.dto';
import { IntegrationsFactory } from '../integrations/providers/factory.service';
import { NotificationDispatcher } from 'src/modules/notifications/notification.dispatcher';
import { quotePlus } from 'src/common/utils/address.utils';
import { formatDate, formatHour } from 'src/common/utils/time.utils';
import { findAllInterviews, countInterviews, findAllInterviewsByPostulant, findInterviewDetail, findProgrammedInterviews } from './queries/interviews.queries';
import { ProgramInterviewDto } from './dto/program-interview.dto';
import { calculateFinalScore } from './utils/calculate-final-score';
import { UpdateMeetingDto } from './dto/update-interview.dto';
import { UpdateInterviewDto, RescheduleInterviewDto } from './dto/update-interview-base.dto';
import { ConfigService } from '@nestjs/config';
import { ActiveUserDto } from '../auth/dto/active-user.dto';

@Injectable()
export class InterviewsService {
    constructor(
        private readonly configService: ConfigService,
        private prisma: PrismaService,
        private integrationsFactory: IntegrationsFactory,
        private readonly notifications: NotificationDispatcher
    ) { }

    private readonly logger = new Logger(InterviewsService.name);

    async findAll(
        companyId: number,
        vacancyId: number | undefined,
        page: number,
        search: string,
        limit: number
    ) {
        const skip = (page - 1) * limit;

        const data = await findAllInterviews(companyId, vacancyId, search, skip, limit, this.prisma);
        const total = await countInterviews(companyId, vacancyId, search, this.prisma);

        return {
            data,
            total,
            currentPage: page,
            totalPages: Math.ceil(total / limit)
        };
    }

    async findActiveVacancies(companyId: number) {
        const activeVacancies = await this.prisma.vacantes.findMany({
            where: {
                idEmpresa: companyId,
                idEstatusVacante: 5,
            },
            select: {
                idVacante: true,
                CatPuestos: {
                    select: { NombrePuesto: true }
                }
            }
        });
        return activeVacancies.map(v => ({
            idVacante: v.idVacante,
            nombrePuesto: v.CatPuestos.NombrePuesto,
        }));
    }

    async findProgrammedInterviews(companyId: number, mainInterviewId: string) {
        return await findProgrammedInterviews(companyId, mainInterviewId, this.prisma);
    }

    // Función para crear una entrevista como catalogo
    async create(companyId: number, dto: CreateInterviewDto) {
        const interviews = await Promise.all(
            dto.vacancyIds.map(vacancyId =>
                this.prisma.entrevistas.create({
                    data: {
                        company_id: companyId,
                        area_id: dto.areaId,
                        idVacante: vacancyId,
                        provider_id: dto.providerId,
                        agent_id: dto.agentId || null,
                        description: dto.description || null,
                        interview_type: dto.interviewType,
                        modality: dto.modality,
                        title: dto.title,
                        duration: dto.duration,
                        interviewer_id: dto.interviewerId,
                        location: dto.locationAddress || null,
                        comment: dto.comment || null,
                        EntrevistasCriterios: {
                            create: dto.criteria.map((criterion, index) => ({
                                name: criterion.name,
                                description: criterion.description || '',
                                max_score: criterion.weight || 0,
                                weight: criterion.weight || 1,
                                order: criterion.order || index + 1,
                                CriterioPreguntas: criterion.questions?.length
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

    // Función para programar una entrevista ya creada como catalogo
    async programInterview(companyId: number, interviewId: string, dto: ProgramInterviewDto, user: ActiveUserDto) {
        const mainInterview = await this.prisma.entrevistas.findFirst({
            where: { id: interviewId },
            include: { EntrevistasCriterios: true }
        });
        if (!mainInterview) throw new BadRequestException('No se encontró la entrevista principal');

        const postulant = await this.prisma.postulaciones.findFirst({ where: { idPostulacion: dto.postulantId } });
        if (!postulant) throw new BadRequestException('No se encontró el postulante');

        // Constantes para el correo y log de actividades
        const date = new Date(dto.scheduledAt);
        const day = formatDate(date);
        const hour = formatHour(date);

        let meetingData: any = { id: null, interviewId: null, url: null, metadata: null };

        try {
            dto.duration = mainInterview.duration || 60;
            dto.title = mainInterview.title || 'Entrevista';

            // Resolver reuniones ONLINE externas (Ej. Zoom)
            if (mainInterview.interview_type === 'PERSONA' && mainInterview.modality === 'ONLINE') {
                const zoomProvider = await this.integrationsFactory.getProvider(mainInterview.provider_id);
                meetingData = await zoomProvider.createMeeting(companyId, mainInterview.provider_id, dto);
            }

            const interview = await this.prisma.$transaction(async (tx) => {
                // Creamos la entrevista programada (Enlace para que el postulante acuda)
                const newInterview = await tx.entrevistasPostulantes.create({
                    data: {
                        candidate_uuid: postulant.uuid,
                        interview_id: mainInterview.id,
                        scheduled_at: date,
                        duration: dto.duration,
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

                // Si es IA, actualizamos su propia URL usando el ID recién creado
                if (mainInterview.interview_type === 'IA') {
                    meetingData.url = `${this.configService.get<string>('FRONT_URL')}/entrevista/${newInterview.id}`;
                    meetingData.id = newInterview.id;

                    await tx.entrevistasPostulantes.update({
                        where: { id: newInterview.id },
                        data: { meeting_url: meetingData.url, meeting_id: newInterview.id }
                    });
                }

                // Actualizar estatus del postulante
                await tx.postulaciones.update({
                    where: { idPostulacion: dto.postulantId },
                    data: { idEstatus: 2 }
                });

                // Registrar movimiento en el histórico de forma segura
                await tx.historicoMovimientos.create({
                    data: {
                        idUsuario: user.id,
                        idEmpresa: companyId,
                        accion: 'EDITAR',
                        tablaOrigen: 'Postulaciones',
                        idRegistro: dto.postulantId,
                        descripcion: `Se programó una entrevista con fecha y hora ${day} - ${hour} para ${postulant.nombre} ${postulant.primerApellido} ${postulant.segundoApellido}`,
                        fechaCreacion: new Date()
                    }
                });

                return newInterview;
            });

            meetingData.interviewId = interview.id;

            // Construcción de enlaces de mapa para la notificación
            let map_link: string | null = null;
            let map_img: string | null = null;
            let lugar_mostrado = mainInterview.location;

            if (mainInterview.location && !meetingData?.url) {
                const q = quotePlus(mainInterview.location.trim());
                map_link = `http://googleusercontent.com/maps.google.com/?q=${q}`;
                map_img = `https://staticmap.openstreetmap.de/staticmap.php?center=${q}&zoom=16&size=600x300&markers=${q},red-pushpin`;
            }

            // Envío de Notificaciones asíncronas externas a la DB
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

            if (mainInterview.interview_type === 'PERSONA' && mainInterview.interviewer_id && mainInterview.interviewer_id !== 0) {
                const interviewer = await this.prisma.empleados.findFirst({
                    where: { idEmpleado: mainInterview.interviewer_id },
                    include: { auth_user: true }
                });

                await this.notifications.notify({
                    userUuid: interviewer?.auth_user?.uuid || '',
                    notificationTypeCode: 'INTERVIEW_SCHEDULED_INTERVIEWER',
                    to: interviewer?.auth_user?.email || '',
                    phone: interviewer?.auth_user?.phone || '',
                    subject: mainInterview.title || '',
                    context: {
                        nombre: `${interviewer?.nombre} ${interviewer?.primerApellido}`,
                        entrevistasNombre: mainInterview.title || '',
                        postulant: `${postulant.nombre} ${postulant.primerApellido}`,
                        dia: day,
                        hora: hour,
                        lugar: lugar_mostrado,
                        liga: meetingData?.url,
                        map_link: map_link,
                        map_img: map_img,
                        comentarios: mainInterview.comment,
                    }
                });
            }

            return { message: 'Entrevista creada exitosamente' };

        } catch (error) {
            this.logger.error('Error creating interview', error);

            // Si falló algo y se llegó a crear una reunión en Zoom, la borramos para no dejar basura
            if (meetingData?.id && mainInterview.interview_type === 'PERSONA') {
                const provider = await this.integrationsFactory.getProvider(mainInterview.provider_id);
                if (provider) await provider.deleteMeeting(companyId, mainInterview.provider_id, meetingData.id);
            }

            throw new BadRequestException(error instanceof Error ? error.message : 'Error al crear entrevista');
        }
    }

    // Método para obtener todas las entrevistas de un postulante
    async findAllByPostulant(companyId: number, postulantId: number) {
        const postulant = await this.prisma.postulaciones.findFirst({
            where: { idPostulacion: postulantId }
        })
        if (!postulant) throw new BadRequestException('No se encontró el postulante');

        return await findAllInterviewsByPostulant(postulant.uuid, this.prisma);
    }

    // Metodo para obtener detalles de una entrevista especifica
    async getMeetingDetail(companyId: number, interviewId: string) {
        return await findInterviewDetail(interviewId, this.prisma);
    }

    // Metodo para actualizar detalles de una entrevista programada
    async updateMeeting(companyId: number, meetingId: string, dto: UpdateMeetingDto) {
        const interviewPostulant = await this.prisma.entrevistasPostulantes.findFirst({
            where: { id: meetingId },
            include: {
                EntrevistasResultados: true,
                EntrevistaCriteriosEvaluacion: {
                    include: {
                        EntrevistasCriterios: true
                    }
                },
            }
        })
        if (!interviewPostulant) throw new BadRequestException('No se encontró la entrevista');

        let finalScore: number | null = null;
        if (dto.statusId === 2) {
            finalScore = calculateFinalScore(
                interviewPostulant.EntrevistaCriteriosEvaluacion
            );
        }

        await this.prisma.entrevistasPostulantes.update({
            where: { id: meetingId },
            data: {
                status_id: dto.statusId,
                EntrevistasResultados: {
                    update: {
                        final_score: finalScore,
                        general_report: dto.generalReport,
                        strengths: dto.strengths,
                        improvement_areas: dto.improvementAreas,
                        recommendations: dto.recomendations,
                    }
                },
                EntrevistaCriteriosEvaluacion: {
                    update: dto.criteria?.map((criterio: any) => ({
                        where: { id: criterio.criterionId },
                        data: {
                            score: criterio.score,
                            comment: criterio.comments,
                        }
                    }))
                }
            }
        })
        return { message: 'Entrevista actualizada exitosamente' };
    }

    async findOne(companyId: number, interviewId: string) {
        const interview = await this.prisma.entrevistas.findFirst({
            where: {
                id: interviewId,
                company_id: companyId,
                active: true
            },
            include: {
                EntrevistasCriterios: {
                    include: {
                        CriterioPreguntas: true
                    }
                }
            }
        });

        if (!interview) throw new BadRequestException('No se encontró la entrevista');
        return interview;
    }

    async updateInterview(companyId: number, interviewId: string, dto: UpdateInterviewDto) {
        const interview = await this.prisma.entrevistas.findFirst({
            where: { id: interviewId, company_id: companyId, active: true }
        });

        if (!interview) throw new BadRequestException('No se encontró la entrevista');
        await this.prisma.entrevistas.update({
            where: { id: interviewId },
            data: {
                title: dto.title,
                description: dto.description ?? null,
                interview_type: dto.interviewType as any,
                modality: dto.modality as any,
                duration: dto.duration,
                interviewer_id: dto.interviewerId,
                location: dto.locationAddress ?? null,
                comment: dto.comment ?? null,
                area_id: dto.areaId,
                idVacante: dto.vacancyId,
            }
        });

        return { message: 'Entrevista actualizada exitosamente' };
    }

    async rescheduleInterview(companyId: number, meetingId: string, dto: RescheduleInterviewDto) {
        const meeting = await this.prisma.entrevistasPostulantes.findFirst({
            where: { id: meetingId }
        });

        if (!meeting) throw new BadRequestException('No se encontró el meeting');

        await this.prisma.entrevistasPostulantes.update({
            where: { id: meetingId },
            data: {
                scheduled_at: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
                duration: dto.duration ?? undefined,
            }
        });

        return { message: 'Entrevista reprogramada exitosamente' };
    }



    async deleteInterview(companyId: number, interviewId: string) {
        const interview = await this.prisma.entrevistas.findFirst({
            where: { id: interviewId, company_id: companyId }
        });

        if (!interview) throw new BadRequestException('No se encontró la entrevista');

        await this.prisma.entrevistas.delete({
            where: { id: interviewId }
        });

        return { message: 'Entrevista eliminada exitosamente' };
    }

    async getStatus(companyId: number) {
        const status = await this.prisma.catEstatusEntrevista.findMany({
            where: { activo: true },
            select: {
                idEstatusEntrevista: true,
                descripcion: true
            }
        });

        return status.map(s => ({
            id: s.idEstatusEntrevista,
            description: s.descripcion
        }));
    }

    async deleteMeeting(companyId: number, meetingId: string) {
        const meeting = await this.prisma.entrevistasPostulantes.findFirst({
            where: { id: meetingId }
        });

        if (!meeting) throw new BadRequestException('No se encontró el meeting');

        await this.prisma.entrevistasPostulantes.delete({
            where: { id: meetingId }
        });

        return { message: 'Meeting eliminado exitosamente' };
    }

}



