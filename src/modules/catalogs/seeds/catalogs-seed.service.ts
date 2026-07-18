import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class CatalogsSeedService implements OnModuleInit {
    private readonly logger = new Logger(CatalogsSeedService.name);

    constructor(private prisma: PrismaService) { }

    async onModuleInit() {
        this.logger.log('Sembrando catálogos estáticos...');
        try {
            await this.seedIntegrationsProviders(); /** CatIntegracionesProvedores */
            await this.seedNotificationsChannels(); /** CatCanalesNotificaciones */
            await this.seedNotificationsTypes(); /** CatTipoNotificacion */
            await this.seedNotificationTypeChannels(); /** NotificacionTipoCanales */
            await this.seedDocumentsStatus(); /** CatEstatusDocumentos */
            await this.seedInterviewStatus(); /** CatEstatusEntrevista */
            await this.seedRecordStatus(); /** CatEstatusExpedientes */
            await this.seedVacantStatus(); /** CatEstatusVacante */
            await this.seedPostulationStatus(); /** CatEstatusPostulacion */
            await this.seedGender(); /** CatGenero */
            await this.seedLanguages(); /** CatIdiomas */
            await this.seedModalities(); /** CatModalidad */
            await this.seedModules(); /** CatModulos */
            await this.seedLevels(); /** CatNivel */
            await this.seedHiringTypes(); /** CatTipoContratacion */
            await this.seedCourseTypes(); /** CatTipoCurso */
            await this.seedPositionTypes(); /** CatTipoPuesto */
            await this.seedPublicationTypes(); /** CatTiposPublicacion */
            await this.seedEducationLevels(); /** CatEscolaridad */
            await this.seedSalaryLevels(); /** CatNivelesSalario */
            await this.seedTiposUbicacion(); /** CatTiposUbicacion */
            await this.seedRoles(); /** catroles */
            await this.seedRolesPermisos(); /** RelRolPermisos */
            await this.seedEstatusSolicitudPuesto(); /** CatEstatusSolicitudPuesto */
            await this.seedEstatusContratos(); /** CatEstatusContratos */
            await this.seedTiposMoneda(); /** CatTiposMoneda */
            await this.seedPeriodicidadesPago(); /** CatPeriodicidadesPago */
            this.logger.log('Sembrado de catálogos completado.');
        } catch (error) {
            this.logger.error('Error al sembrar catálogos:', error);
        }
    }

    // Seeds initial communication providers into the database.
    private async seedIntegrationsProviders() {
        const medios = [
            { id: 1, code: 'ZOOM', name: 'Zoom', type: 'communication', isActive: true },
            { id: 2, code: 'MEET', name: 'Meet', type: 'communication', isActive: true },
            { id: 3, code: 'TEAMS', name: 'Teams', type: 'communication', isActive: true },
            { id: 4, code: 'OPENAI', name: 'OpenAI', type: 'ai', isActive: true },
            { id: 5, code: 'GEMINI', name: 'Gemini', type: 'ai', isActive: true },
            { id: 6, code: 'CLAUDE', name: 'Claude', type: 'ai', isActive: true },
        ];

        for (const medio of medios) {
            await this.prisma.$queryRaw`
                INSERT INTO CatIntegracionesProvedores (id, code, name, type, isActive)
                VALUES (${medio.id}, ${medio.code}, ${medio.name}, ${medio.type}, ${medio.isActive})
                ON DUPLICATE KEY UPDATE name = VALUES(name), type = VALUES(type), isActive = VALUES(isActive);
            `;
        }
    }

    // Seeds initial notification channels into the database.
    private async seedNotificationsChannels() {
        const channels = [
            { id: 1, code: 'EMAIL', description: 'Notificaciones por correo electrónico', activo: true },
            { id: 2, code: 'WHATSAPP', description: 'Notificaciones por WhatsApp', activo: true },
            { id: 3, code: 'SMS', description: 'Notificaciones por mensaje de texto', activo: true },
            { id: 4, code: 'SOCKETS', description: 'Notificaciones en tiempo real dentro de la plataforma', activo: true },
        ]

        for (const channel of channels) {
            await this.prisma.$queryRaw`
                INSERT INTO CatCanalesNotificaciones (id, code, description, activo)
                VALUES (${channel.id}, ${channel.code}, ${channel.description}, ${channel.activo})
                ON DUPLICATE KEY UPDATE description = VALUES(description), activo = VALUES(activo);
            `;
        }
    }

    // Seeds initial notification types into the database.
    private async seedNotificationsTypes() {
        const notificationsTypes = [
            { id: 1, code: '2FA', description: 'Notificación de verificación de dos pasos', activo: true },
            { id: 2, code: 'POSITION_STATUS_UPDATE', description: 'Notificación de actualización del estado de la posición', activo: true },
            { id: 3, code: 'INTERVIEW_SCHEDULED', description: 'Notificación de programación de entrevista', activo: true },
            { id: 4, code: 'LINK_CREATED', description: 'Notificación de creación de empleado y envio de link', activo: true },
            { id: 5, code: 'POSITION_REQUEST_STATUS_UPDATE', description: 'Notificación de actualización del estado de la solicitud de posición', activo: true },
            { id: 6, code: 'POSITION_REQUEST_CREATED', description: 'Notificación de creación de solicitud de posición', activo: true },
            { id: 7, code: 'REQUISITION_CREATED', description: 'Notificación de creación de requisición', activo: true },
            { id: 8, code: 'REQUISITION_APPROVED_BY_MANAGER', description: 'Notificación de aprobación de requisición por parte del manager', activo: true },
            { id: 9, code: 'REQUISITION_APPROVED_BY_MANAGER_TO_RH', description: 'Notificación de aprobación de requisición por parte del manager a Recursos Humanos', activo: true },
            { id: 10, code: 'REQUISITION_APPROVED_BY_RH', description: 'Notificación de aprobación de requisición por parte de Recursos Humanos', activo: true },
            { id: 11, code: 'INTERVIEW_SCHEDULED_INTERVIEWER', description: 'Notificación de programación de entrevista al entrevistador', activo: true },
            { id: 12, code: 'INTERVIEW_RESCHEDULED', description: 'Notificación de reprogramación de entrevista', activo: true },
            { id: 13, code: 'INTERVIEW_RESCHEDULED_INTERVIEWER', description: 'Notificación de reprogramación de entrevista al entrevistador', activo: true },
            { id: 14, code: 'DOCUMENT_REJECTED', description: 'Notificación de rechazo de documentación', activo: true },
        ]

        for (const notificationType of notificationsTypes) {
            await this.prisma.$queryRaw`
                INSERT INTO CatTipoNotificacion (id, code, description, activo)
                VALUES (${notificationType.id}, ${notificationType.code}, ${notificationType.description}, ${notificationType.activo})
                ON DUPLICATE KEY UPDATE description = VALUES(description), activo = VALUES(activo);
            `;
        }
    }

    // Seeds notification types and channels mapping into the database.
    private async seedNotificationTypeChannels() {
        const typeChannels = [
            // --- 1. 2FA (Verificación de dos pasos) ---
            { id: 1, notification_type_id: 1, channel_id: 1, enabled: true }, // Email
            { id: 2, notification_type_id: 1, channel_id: 2, enabled: true }, // WhatsApp
            { id: 3, notification_type_id: 1, channel_id: 3, enabled: true }, // SMS
            { id: 4, notification_type_id: 1, channel_id: 4, enabled: false }, // Sockets
            // --- 2. POSITION_STATUS_UPDATE (Actualización de vacante) ---
            { id: 5, notification_type_id: 2, channel_id: 1, enabled: true }, // Email
            { id: 6, notification_type_id: 2, channel_id: 2, enabled: true }, // WhatsApp
            { id: 7, notification_type_id: 2, channel_id: 3, enabled: false }, // SMS
            { id: 8, notification_type_id: 2, channel_id: 4, enabled: true }, // Sockets
            // --- 3. INTERVIEW_SCHEDULED (Programación de entrevista) ---
            { id: 9, notification_type_id: 3, channel_id: 1, enabled: true }, // Email
            { id: 10, notification_type_id: 3, channel_id: 2, enabled: true }, // WhatsApp
            { id: 11, notification_type_id: 3, channel_id: 3, enabled: false }, // SMS
            { id: 12, notification_type_id: 3, channel_id: 4, enabled: false }, // Sockets
            // --- 4. CREDENTIALS_CREATED (Creación de cuenta/credenciales) ---
            { id: 13, notification_type_id: 4, channel_id: 1, enabled: true }, // Email
            { id: 14, notification_type_id: 4, channel_id: 2, enabled: true }, // WhatsApp
            { id: 15, notification_type_id: 4, channel_id: 3, enabled: false }, // SMS
            { id: 16, notification_type_id: 4, channel_id: 4, enabled: false }, // Sockets
            // --- 5. POSITION_REQUEST_STATUS_UPDATE (Actualización del estado de la solicitud de posición) ---
            { id: 17, notification_type_id: 5, channel_id: 1, enabled: true }, // Email
            { id: 18, notification_type_id: 5, channel_id: 2, enabled: false }, // WhatsApp
            { id: 19, notification_type_id: 5, channel_id: 3, enabled: false }, // SMS
            { id: 20, notification_type_id: 5, channel_id: 4, enabled: true }, // Sockets
            // --- 6. POSITION_REQUEST_CREATED (Creación de solicitud de posición) ---
            { id: 21, notification_type_id: 6, channel_id: 1, enabled: false }, // Email
            { id: 22, notification_type_id: 6, channel_id: 2, enabled: false }, // WhatsApp
            { id: 23, notification_type_id: 6, channel_id: 3, enabled: false }, // SMS
            { id: 24, notification_type_id: 6, channel_id: 4, enabled: true }, // Sockets
            // --- 7. REQUISITION_CREATED (Creación de requisición) ---
            { id: 25, notification_type_id: 7, channel_id: 1, enabled: true }, // Email
            { id: 26, notification_type_id: 7, channel_id: 2, enabled: false }, // WhatsApp
            { id: 27, notification_type_id: 7, channel_id: 3, enabled: false }, // SMS
            { id: 28, notification_type_id: 7, channel_id: 4, enabled: true }, // Sockets
            // --- 8. REQUISITION_APPROVED_BY_MANAGER (Aprobación de requisición por parte del manager) ---
            { id: 29, notification_type_id: 8, channel_id: 1, enabled: true }, // Email
            { id: 30, notification_type_id: 8, channel_id: 2, enabled: false }, // WhatsApp
            { id: 31, notification_type_id: 8, channel_id: 3, enabled: false }, // SMS
            { id: 32, notification_type_id: 8, channel_id: 4, enabled: true }, // Sockets
            // --- 9. REQUISITION_APPROVED_BY_MANAGER_TO_RH (Aprobación de requisición por parte del manager a Recursos Humanos) ---
            { id: 33, notification_type_id: 9, channel_id: 1, enabled: false }, // Email
            { id: 34, notification_type_id: 9, channel_id: 2, enabled: false }, // WhatsApp
            { id: 35, notification_type_id: 9, channel_id: 3, enabled: false }, // SMS
            { id: 36, notification_type_id: 9, channel_id: 4, enabled: true }, // Sockets
            // --- 10. REQUISITION_APPROVED_BY_RH (Aprobación de requisición por parte de Recursos Humanos) ---
            { id: 37, notification_type_id: 10, channel_id: 1, enabled: true }, // Email
            { id: 38, notification_type_id: 10, channel_id: 2, enabled: false }, // WhatsApp
            { id: 39, notification_type_id: 10, channel_id: 3, enabled: false }, // SMS
            { id: 40, notification_type_id: 10, channel_id: 4, enabled: true }, // Sockets
            // --- 11. INTERVIEW_SCHEDULED_INTERVIEWER (Programación de entrevista al entrevistador) ---
            { id: 41, notification_type_id: 11, channel_id: 1, enabled: true }, // Email
            { id: 42, notification_type_id: 11, channel_id: 2, enabled: true }, // WhatsApp
            { id: 43, notification_type_id: 11, channel_id: 3, enabled: false }, // SMS
            { id: 44, notification_type_id: 11, channel_id: 4, enabled: true }, // Sockets
            // --- 12. INTERVIEW_RESCHEDULED (Reprogramación de entrevista) ---
            { id: 45, notification_type_id: 12, channel_id: 1, enabled: true }, // Email
            { id: 46, notification_type_id: 12, channel_id: 2, enabled: true }, // WhatsApp
            { id: 47, notification_type_id: 12, channel_id: 3, enabled: false }, // SMS
            { id: 48, notification_type_id: 12, channel_id: 4, enabled: false }, // Sockets
            // --- 13. INTERVIEW_RESCHEDULED_INTERVIEWER (Reprogramación de entrevista al entrevistador) ---
            { id: 49, notification_type_id: 13, channel_id: 1, enabled: true }, // Email
            { id: 50, notification_type_id: 13, channel_id: 2, enabled: true }, // WhatsApp
            { id: 51, notification_type_id: 13, channel_id: 3, enabled: false }, // SMS
            { id: 52, notification_type_id: 13, channel_id: 4, enabled: true }, // Sockets
            // --- 14. DOCUMENT_REJECTED (Rechazo de documentación) ---
            { id: 53, notification_type_id: 14, channel_id: 1, enabled: true }, // Email
            { id: 54, notification_type_id: 14, channel_id: 2, enabled: true }, // WhatsApp
            { id: 55, notification_type_id: 14, channel_id: 3, enabled: false }, // SMS
            { id: 56, notification_type_id: 14, channel_id: 4, enabled: false }, // Sockets
        ];

        for (const tc of typeChannels) {
            await this.prisma.$queryRaw`
                INSERT INTO NotificacionTipoCanales (id, notification_type_id, channel_id, enabled)
                VALUES (${tc.id}, ${tc.notification_type_id}, ${tc.channel_id}, ${tc.enabled})
                ON DUPLICATE KEY UPDATE enabled = VALUES(enabled);
            `;
        }
    }

    // Seeds initial documents status into the database.
    private async seedDocumentsStatus() {
        const documentsStatus = [
            { idEstatusDocumento: 1, Descripcion: 'SIN ENTREGAR', Activo: true },
            { idEstatusDocumento: 2, Descripcion: 'ENTREGADO', Activo: true },
            { idEstatusDocumento: 3, Descripcion: 'EN REVISION', Activo: true },
            { idEstatusDocumento: 4, Descripcion: 'APROBADO', Activo: true },
            { idEstatusDocumento: 5, Descripcion: 'RECHAZADO', Activo: true },
        ]

        for (const documentStatus of documentsStatus) {
            await this.prisma.$queryRaw`
                INSERT INTO CatEstatusDocumentos (idEstatusDocumento, Descripcion, Activo)
                VALUES (${documentStatus.idEstatusDocumento}, ${documentStatus.Descripcion}, ${documentStatus.Activo})
                ON DUPLICATE KEY UPDATE Descripcion = VALUES(Descripcion), Activo = VALUES(Activo);
            `;
        }
    }

    // Seeds initial interview status into the database.
    private async seedInterviewStatus() {
        const interviewsStatus = [
            { idEstatusEntrevista: 1, descripcion: 'PROGRAMADA', activo: true },
            { idEstatusEntrevista: 2, descripcion: 'TERMINADA', activo: true },
            { idEstatusEntrevista: 3, descripcion: 'CANCELADA', activo: true },
        ]

        for (const interviewStatus of interviewsStatus) {
            await this.prisma.$queryRaw`
                INSERT INTO CatEstatusEntrevista (idEstatusEntrevista, descripcion, activo)
                VALUES (${interviewStatus.idEstatusEntrevista}, ${interviewStatus.descripcion}, ${interviewStatus.activo})
                ON DUPLICATE KEY UPDATE descripcion = VALUES(descripcion), activo = VALUES(activo);
            `;
        }
    }

    // Seeds initial record status into the database.
    private async seedRecordStatus() {
        const recordsStatus = [
            { idEstatus: 1, Descripcion: 'CREACION DE CREDENCIALES', Activo: true },
            { idEstatus: 2, Descripcion: 'CARGA DE DOCUMENTOS', Activo: true },
            { idEstatus: 3, Descripcion: 'VALIDACION DE RECLUTAMIENTO', Activo: true },
            { idEstatus: 4, Descripcion: 'EXPEDIENTE COMPLETO', Activo: true },
            { idEstatus: 5, Descripcion: 'RECHAZO', Activo: true },
        ]

        for (const recordStatus of recordsStatus) {
            await this.prisma.$queryRaw`
                INSERT INTO CatEstatusExpedientes (idEstatus, Descripcion, Activo)
                VALUES (${recordStatus.idEstatus}, ${recordStatus.Descripcion}, ${recordStatus.Activo})
                ON DUPLICATE KEY UPDATE Descripcion = VALUES(Descripcion), Activo = VALUES(Activo);
            `;
        }
    }

    // Seeds initial vacants status into the database.
    private async seedVacantStatus() {
        const vacantsStatus = [
            { idEstatusvacante: 1, decripcion: 'PENDIENTE MANAGER', activo: true },
            { idEstatusvacante: 2, decripcion: 'APROBADO MANAGER', activo: true },
            { idEstatusvacante: 3, decripcion: 'RECHAZADO MANAGER', activo: true },
            { idEstatusvacante: 4, decripcion: 'PENDIENTE RH', activo: true },
            { idEstatusvacante: 5, decripcion: 'APROBADO RH', activo: true },
            { idEstatusvacante: 6, decripcion: 'RECHAZADO RH', activo: true },
            { idEstatusvacante: 7, decripcion: 'CERRADA', activo: true },
            { idEstatusvacante: 8, decripcion: 'CANCELADA', activo: true },
        ];

        for (const vacantStatus of vacantsStatus) {
            await this.prisma.$queryRaw`
            INSERT INTO CatEstatusVacante (idEstatusvacante, decripcion, activo)
            VALUES (${vacantStatus.idEstatusvacante}, ${vacantStatus.decripcion}, ${vacantStatus.activo})
            ON DUPLICATE KEY UPDATE 
                decripcion = ${vacantStatus.decripcion}, 
                activo = ${vacantStatus.activo};
        `;
        }
    }

    // Seeds initial postulation status into the database.
    private async seedPostulationStatus() {
        const postulationsStatus = [
            { idEstatusPostulacion: 1, descripcion: 'POSTULADO', activo: true },
            { idEstatusPostulacion: 2, descripcion: 'EN ENTREVISTAS', activo: true },
            { idEstatusPostulacion: 3, descripcion: 'EN NEGOCIACION', activo: true },
            { idEstatusPostulacion: 4, descripcion: 'DECLINO LA OFERTA', activo: true },
            { idEstatusPostulacion: 5, descripcion: 'RECHAZADO', activo: true },
            { idEstatusPostulacion: 6, descripcion: 'RECLUTADO', activo: true },
        ]

        for (const postulationStatus of postulationsStatus) {
            await this.prisma.$queryRaw`
                INSERT INTO CatEstatusPostulacion (idEstatusPostulacion, descripcion, activo)
                VALUES (${postulationStatus.idEstatusPostulacion}, ${postulationStatus.descripcion}, ${postulationStatus.activo})
                ON DUPLICATE KEY UPDATE descripcion = VALUES(descripcion), activo = VALUES(activo);
            `;
        }
    }

    // Seeds initial gender into the database.
    private async seedGender() {
        const genders = [
            { idGenero: 1, Descripcion: 'MASCULINO', Activo: true },
            { idGenero: 2, Descripcion: 'FEMENINO', Activo: true },
            { idGenero: 3, Descripcion: 'NO BINARIO', Activo: true },
            { idGenero: 4, Descripcion: 'GENERO FLUIDO', Activo: true },
            { idGenero: 5, Descripcion: 'TRANSGENERO MASCULINO', Activo: true },
            { idGenero: 6, Descripcion: 'TRANSGENERO FEMENINO', Activo: true },
            { idGenero: 7, Descripcion: 'OTRO', Activo: true },
            { idGenero: 8, Descripcion: 'PREFIERO NO ESPECIFICAR', Activo: true },
        ]

        for (const gender of genders) {
            await this.prisma.$queryRaw`
                INSERT INTO CatGenero (idGenero, Descripcion, Activo)
                VALUES (${gender.idGenero}, ${gender.Descripcion}, ${gender.Activo})
                ON DUPLICATE KEY UPDATE Descripcion = VALUES(Descripcion), Activo = VALUES(Activo);
            `;
        }
    }

    // Seeds initial languages into the database.
    private async seedLanguages() {
        const languages = [
            { idIdioma: 1, Descripcion: 'ESPAÑOL', Activo: true },
            { idIdioma: 2, Descripcion: 'INGLES', Activo: true },
            { idIdioma: 3, Descripcion: 'FRANCES', Activo: true },
            { idIdioma: 4, Descripcion: 'ALEMAN', Activo: true },
            { idIdioma: 5, Descripcion: 'JAPONES', Activo: true },
        ]

        for (const language of languages) {
            await this.prisma.$queryRaw`
                INSERT INTO CatIdiomas (idIdioma, Descripcion, Activo)
                VALUES (${language.idIdioma}, ${language.Descripcion}, ${language.Activo})
                ON DUPLICATE KEY UPDATE Descripcion = VALUES(Descripcion), Activo = VALUES(Activo);
            `;
        }
    }

    // Seeds initial modalities into the database.
    private async seedModalities() {
        const modalities = [
            { idModalidad: 1, Descripcion: 'PRESENCIAL', Activo: true },
            { idModalidad: 2, Descripcion: 'REMOTO', Activo: true },
            { idModalidad: 3, Descripcion: 'HIBRIDO', Activo: true },
        ]

        for (const modality of modalities) {
            await this.prisma.$queryRaw`
                INSERT INTO CatModalidad (idModalidad, Descripcion, Activo)
                VALUES (${modality.idModalidad}, ${modality.Descripcion}, ${modality.Activo})
                ON DUPLICATE KEY UPDATE Descripcion = VALUES(Descripcion), Activo = VALUES(Activo);
            `;
        }
    }

    // Seeds initial levels into the database.
    private async seedLevels() {
        const levels = [
            { idNivel: 1, Descripcion: 'ALTO', Activo: true },
            { idNivel: 2, Descripcion: 'MEDIO', Activo: true },
            { idNivel: 3, Descripcion: 'BAJO', Activo: true },
        ]

        for (const level of levels) {
            await this.prisma.$queryRaw`
                INSERT INTO CatNivel (idNivel, Descripcion, Activo)
                VALUES (${level.idNivel}, ${level.Descripcion}, ${level.Activo})
                ON DUPLICATE KEY UPDATE Descripcion = VALUES(Descripcion), Activo = VALUES(Activo);
            `;
        }
    }

    // Seeds initial hiring types into the database.
    private async seedHiringTypes() {
        const hiringTypes = [
            { idTipoContratacion: 1, Descripcion: 'TIEMPO COMPLETO (INDETERMINADO)', Activo: 1 },
            { idTipoContratacion: 2, Descripcion: 'MEDIO TIEMPO (INDETERMINADO)', Activo: 1 },
            { idTipoContratacion: 3, Descripcion: 'TEMPORAL / DETERMINADO', Activo: 1 },
            { idTipoContratacion: 4, Descripcion: 'POR PROYECTO', Activo: 1 },
            { idTipoContratacion: 5, Descripcion: 'HONORARIOS / FREELANCE / CONTRACTOR', Activo: 1 },
            { idTipoContratacion: 6, Descripcion: 'PRÁCTICAS / BECARIO / PASANTÍA', Activo: 1 },
        ];

        for (const hiringType of hiringTypes) {
            await this.prisma.$queryRaw`
            INSERT INTO CatTipoContratacion (idTipoContratacion, Descripcion, Activo)
            VALUES (
                ${hiringType.idTipoContratacion}, 
                ${hiringType.Descripcion}, 
                ${hiringType.Activo}
            )
            ON DUPLICATE KEY UPDATE 
                Descripcion = VALUES(Descripcion), 
                Activo = VALUES(Activo);
        `;
        }
    }

    // Seeds initial course types into the database.
    private async seedCourseTypes() {
        const courseTypes = [
            { idTipoCurso: 1, Descripcion: 'CAPACITACIÓN DE INDUCCIÓN Y ONBOARDING', activo: true },
            { idTipoCurso: 2, Descripcion: 'CAPACITACIÓN ESPECÍFICA (HARD / SOFT SKILLS)', activo: true },
            { idTipoCurso: 3, Descripcion: 'PLAN DE CARRERA Y LIDERAZGO (UPSKILLING)', activo: true },
            { idTipoCurso: 4, Descripcion: 'CAPACITACIÓN NORMATIVA Y DE CUMPLIMIENTO REGULATORIO (COMPLIANCE)', activo: true },
        ];

        for (const courseType of courseTypes) {
            await this.prisma.$queryRaw`
                INSERT INTO CatTipoCurso (idTipoCurso, Descripcion, activo)
                VALUES (${courseType.idTipoCurso}, ${courseType.Descripcion}, ${courseType.activo})
                ON DUPLICATE KEY UPDATE Descripcion = VALUES(Descripcion), activo = VALUES(activo);
            `;
        }
    }

    // Seeds initial position types into the database.
    private async seedPositionTypes() {
        const tiposPuesto = [
            { id: 1, descripcion: 'DIRECTIVO / C-LEVEL', activo: 1 },
            { id: 2, descripcion: 'GERENCIAL', activo: 1 },
            { id: 3, descripcion: 'JEFATURA / SUPERVISOR', activo: 1 },
            { id: 4, descripcion: 'PROFESIONAL / ESPECIALISTA', activo: 1 },
            { id: 5, descripcion: 'ANALISTA / ADMINISTRATIVO', activo: 1 },
            { id: 6, descripcion: 'TÉCNICO', activo: 1 },
            { id: 7, descripcion: 'OPERATIVO', activo: 1 },
            { id: 8, descripcion: 'PASANTE / BECARIO', activo: 1 },
            { id: 9, descripcion: 'OTRO', activo: 1 },
        ];

        for (const tipo of tiposPuesto) {
            await this.prisma.$queryRaw`
            INSERT INTO CatTipoPuesto (idTipoPuesto, Descripcion, Activo)
            VALUES (${tipo.id}, ${tipo.descripcion}, ${tipo.activo})
            ON DUPLICATE KEY UPDATE 
                Descripcion = VALUES(Descripcion),
                Activo = VALUES(Activo);
        `;
        }
    }

    // Seeds initial publication types into the database.
    private async seedPublicationTypes() {
        const publicationTypes = [
            { id: 1, descripcion: 'INTERNA', activo: 1 },
            { id: 2, descripcion: 'EXTERNA', activo: 1 },
            { id: 3, descripcion: 'MIXTA', activo: 1 },
        ];

        for (const tipo of publicationTypes) {
            await this.prisma.$queryRaw`
            INSERT INTO CatTiposPublicacion (idTipoPublicacion, descripcion, activo)
            VALUES (${tipo.id}, ${tipo.descripcion}, ${tipo.activo})
            ON DUPLICATE KEY UPDATE
                descripcion = VALUES(descripcion),
                activo = VALUES(activo);
        `;
        }
    }

    // Seeds initial education levels into the database.
    private async seedEducationLevels() {
        const nivelesEstudio = [
            { id: 1, descripcion: 'EDUCACIÓN BÁSICA (PRIMARIA / SECUNDARIA)', activo: 1 },
            { id: 2, descripcion: 'BACHILLERATO / PREPARATORIA TRUNCA', activo: 1 },
            { id: 3, descripcion: 'BACHILLERATO / PREPARATORIA CONCLUIDA', activo: 1 },
            { id: 4, descripcion: 'CARRERA TÉCNICA / TÉCNICO SUPERIOR', activo: 1 },
            { id: 5, descripcion: 'NIVEL SUPERIOR EN CURSO', activo: 1 },
            { id: 6, descripcion: 'NIVEL SUPERIOR TRUNCA', activo: 1 },
            { id: 7, descripcion: 'NIVEL SUPERIOR CONCLUIDO', activo: 1 },
            { id: 8, descripcion: 'ESPECIALIDAD / DIPLOMADO', activo: 1 },
            { id: 9, descripcion: 'MAESTRÍA', activo: 1 },
            { id: 10, descripcion: 'DOCTORADO', activo: 1 },
        ];

        for (const nivel of nivelesEstudio) {
            await this.prisma.$queryRaw`
            INSERT INTO CatEscolaridad (idNivelEstudios, Descripcion, Activo)
            VALUES (${nivel.id}, ${nivel.descripcion}, ${nivel.activo})
            ON DUPLICATE KEY UPDATE 
                Descripcion = VALUES(Descripcion),
                Activo = VALUES(Activo);
        `;
        }
    }

    // Seeds initial salary levels into the database.
    private async seedSalaryLevels() {
        const nivelesSalario = [
            { id: 1, nombre: 'Nivel 1', descripcion: 'Estructura Operativa / Entry Level (Junior & Semi-Senior)', activo: 1, idEmpresa: 1, minimo: 10000.00, maximo: 25000.00 },
            { id: 2, nombre: 'Nivel 2', descripcion: 'Estructura Profesional Avanzada (Seniors & Especialistas)', activo: 1, idEmpresa: 1, minimo: 25000.00, maximo: 45000.00 },
            { id: 3, nombre: 'Nivel 3', descripcion: 'Liderazgo Táctico / Mandos Medios Iniciales (Team Leaders & Coordinadores)', activo: 1, idEmpresa: 1, minimo: 45000.00, maximo: 70000.00 },
            { id: 4, nombre: 'Nivel 4', descripcion: 'Estructura Estratégica / Mandos Medios Altos (Gerentes & Heads Of)', activo: 1, idEmpresa: 1, minimo: 70000.00, maximo: 95000.00 },
            { id: 5, nombre: 'Nivel 5', descripcion: 'Estructura Ejecutiva / Alta Dirección (Directores, VP & C-Level)', activo: 1, idEmpresa: 1, minimo: 95000.00, maximo: 150000.00 }
        ];

        for (const nivel of nivelesSalario) {
            await this.prisma.$queryRaw`
                INSERT INTO CatNivelesSalario (IdNivelSalario, NombreNivel, Descripcion, Activo, IdEmpresa, SalarioMinimo, SalarioMaximo)
                VALUES (${nivel.id}, ${nivel.nombre}, ${nivel.descripcion}, ${nivel.activo}, ${nivel.idEmpresa}, ${nivel.minimo}, ${nivel.maximo})
                ON DUPLICATE KEY UPDATE 
                    NombreNivel = VALUES(NombreNivel),
                    Descripcion = VALUES(Descripcion),
                    Activo = VALUES(Activo),
                    IdEmpresa = VALUES(IdEmpresa),
                    SalarioMinimo = VALUES(SalarioMinimo),
                    SalarioMaximo = VALUES(SalarioMaximo);
            `;
        }
    }

    // Seeds initial location types into the database.
    private async seedTiposUbicacion() {
        const types = [
            { id: 1, codigo: 'CORP', descripcion: 'Corporativo / Oficina Principal', activo: true },
            { id: 2, codigo: 'SUCR', descripcion: 'Sucursal estándar', activo: true },
            { id: 3, codigo: 'PLANTA', descripcion: 'Planta de Producción / Fábrica', activo: true },
            { id: 4, codigo: 'TIENDA', descripcion: 'Tienda / Punto de Venta', activo: true },
            { id: 5, codigo: 'CEDI', descripcion: 'Centro de Distribución / Almacén', activo: true },
        ];

        for (const type of types) {
            await this.prisma.$queryRaw`
            INSERT INTO CatTiposUbicacion (idTipoUbicacion, Codigo, Descripcion, Activo)
            VALUES (${type.id}, ${type.codigo}, ${type.descripcion}, ${type.activo})
            ON DUPLICATE KEY UPDATE 
                Codigo = VALUES(Codigo),
                Descripcion = VALUES(Descripcion), 
                Activo = VALUES(Activo);
        `;
        }
    }

    // Seeds initial modules into the database.
    private async seedModules() {
        const modules = [
            { idModulo: 1, Descripcion: 'Estructura Organizacional', Codigo: 'organizational-structure', idPadre: null, Activo: true },
            { idModulo: 2, Descripcion: 'Empresas', Codigo: 'companies', idPadre: 1, Activo: true },
            { idModulo: 3, Descripcion: 'Ubicaciones', Codigo: 'locations', idPadre: 1, Activo: true },
            { idModulo: 4, Descripcion: 'Registros Patronales', Codigo: 'patronal-records', idPadre: 1, Activo: true },
            { idModulo: 5, Descripcion: 'Areas Operativas', Codigo: 'areas', idPadre: 1, Activo: true },
            { idModulo: 6, Descripcion: 'Centro de Costos', Codigo: 'cost-center', idPadre: 1, Activo: true },
            { idModulo: 7, Descripcion: 'Puestos', Codigo: 'positions', idPadre: 1, Activo: true },
            { idModulo: 8, Descripcion: 'Niveles de Salario', Codigo: 'salary-levels', idPadre: 1, Activo: true },
            { idModulo: 9, Descripcion: 'Validación de Puestos', Codigo: 'validate-positions', idPadre: 1, Activo: true },
            { idModulo: 10, Descripcion: 'Plazas Operativas', Codigo: 'headcount-ppto', idPadre: 1, Activo: true },
            { idModulo: 11, Descripcion: 'Organigrama Autorizado', Codigo: 'authorized-organizational-chart', idPadre: 1, Activo: true },
            { idModulo: 12, Descripcion: 'Organigrama Nominal', Codigo: 'nominal-organization-chart', idPadre: 1, Activo: true },
            { idModulo: 13, Descripcion: 'Reclutamiento', Codigo: 'recruitment', idPadre: null, Activo: true },
            { idModulo: 14, Descripcion: 'Requisiciones', Codigo: 'requisitions', idPadre: 13, Activo: true },
            { idModulo: 15, Descripcion: 'Bolsa de trabajo', Codigo: 'job-board', idPadre: 13, Activo: true },
            { idModulo: 16, Descripcion: 'Vacantes', Codigo: 'vacancies', idPadre: 13, Activo: true },
            { idModulo: 17, Descripcion: 'Entrevistas', Codigo: 'interviews', idPadre: 13, Activo: true },
            { idModulo: 18, Descripcion: 'Expedientes digitales', Codigo: 'digital-files', idPadre: null, Activo: true },
            { idModulo: 19, Descripcion: 'Documentos requeridos', Codigo: 'required-documents', idPadre: 18, Activo: true },
            { idModulo: 20, Descripcion: 'Expedientes', Codigo: 'case-files', idPadre: 18, Activo: true },
            { idModulo: 21, Descripcion: 'Contratos digitales', Codigo: 'digital-contracts', idPadre: 18, Activo: true },
            { idModulo: 22, Descripcion: 'Mis contratos', Codigo: 'my-contracts', idPadre: 18, Activo: true }
        ]

        for (const module of modules) {
            await this.prisma.$queryRaw`
                INSERT INTO CatModulos (idModulo, Descripcion, Codigo, idPadre, Activo)
                VALUES (${module.idModulo}, ${module.Descripcion}, ${module.Codigo}, ${module.idPadre}, ${module.Activo})
                ON DUPLICATE KEY UPDATE Descripcion = VALUES(Descripcion), Codigo = VALUES(Codigo), idPadre = VALUES(idPadre), Activo = VALUES(Activo);
            `;
        }
    }

    // Seed initial roles
    private async seedRoles() {
        const roles = [
            { idRol: 1, descripcion: 'Admin', activo: true },
            { idRol: 2, descripcion: 'RH', activo: true },
            { idRol: 3, descripcion: 'Finanzas', activo: true },
            { idRol: 4, descripcion: 'Reclutador', activo: true },
            { idRol: 5, descripcion: 'Manager', activo: true },
            { idRol: 6, descripcion: 'Empleado', activo: true }
        ];

        for (const rol of roles) {
            await this.prisma.$queryRaw`
            INSERT INTO CatRoles (idRol, descripcion, activo)
            VALUES (${rol.idRol}, ${rol.descripcion}, ${rol.activo})
            ON DUPLICATE KEY UPDATE 
                descripcion = VALUES(descripcion),
                activo = VALUES(activo);
        `;
        }
    }

    // Seeds initial location types into the database.
    private async seedRolesPermisos() {
        const permisos = [
            // =========================================================================
            // ROL: ADMIN (idRol: 1)
            // =========================================================================
            { idRol: 1, idModulo: 1, puedeVer: true, puedeCrear: true, puedeActualizar: true, puedeEliminar: true, activo: true },  // Estructura Organizacional (Padre)
            { idRol: 1, idModulo: 2, puedeVer: true, puedeCrear: true, puedeActualizar: true, puedeEliminar: true, activo: true },  // Empresas
            { idRol: 1, idModulo: 3, puedeVer: true, puedeCrear: true, puedeActualizar: true, puedeEliminar: true, activo: true },  // Ubicaciones
            { idRol: 1, idModulo: 4, puedeVer: true, puedeCrear: true, puedeActualizar: true, puedeEliminar: true, activo: true },  // Registros Patronales
            { idRol: 1, idModulo: 5, puedeVer: true, puedeCrear: true, puedeActualizar: true, puedeEliminar: true, activo: true },  // Areas Operativas
            { idRol: 1, idModulo: 6, puedeVer: true, puedeCrear: true, puedeActualizar: true, puedeEliminar: true, activo: true },  // Centro de Costos
            { idRol: 1, idModulo: 7, puedeVer: true, puedeCrear: true, puedeActualizar: true, puedeEliminar: true, activo: true },  // Puestos
            { idRol: 1, idModulo: 8, puedeVer: true, puedeCrear: true, puedeActualizar: true, puedeEliminar: true, activo: true },  // Niveles de Salario
            { idRol: 1, idModulo: 9, puedeVer: true, puedeCrear: true, puedeActualizar: true, puedeEliminar: true, activo: true },  // Validación de Puestos
            { idRol: 1, idModulo: 10, puedeVer: true, puedeCrear: true, puedeActualizar: true, puedeEliminar: true, activo: true }, // Plazas Operativas
            { idRol: 1, idModulo: 11, puedeVer: true, puedeCrear: true, puedeActualizar: true, puedeEliminar: true, activo: true }, // Organigrama Autorizado
            { idRol: 1, idModulo: 12, puedeVer: true, puedeCrear: true, puedeActualizar: true, puedeEliminar: true, activo: true }, // Organigrama Nominal
            { idRol: 1, idModulo: 13, puedeVer: true, puedeCrear: true, puedeActualizar: true, puedeEliminar: true, activo: true }, // Reclutamiento (Padre)
            { idRol: 1, idModulo: 14, puedeVer: true, puedeCrear: true, puedeActualizar: true, puedeEliminar: true, activo: true }, // Requisiciones
            { idRol: 1, idModulo: 15, puedeVer: true, puedeCrear: true, puedeActualizar: true, puedeEliminar: true, activo: true }, // Bolsa de trabajo
            { idRol: 1, idModulo: 16, puedeVer: true, puedeCrear: true, puedeActualizar: true, puedeEliminar: true, activo: true }, // Vacantes
            { idRol: 1, idModulo: 17, puedeVer: true, puedeCrear: true, puedeActualizar: true, puedeEliminar: true, activo: true }, // Entrevistas
            { idRol: 1, idModulo: 18, puedeVer: true, puedeCrear: true, puedeActualizar: true, puedeEliminar: true, activo: true }, // Expedientes digitales (Padre)
            { idRol: 1, idModulo: 19, puedeVer: true, puedeCrear: true, puedeActualizar: true, puedeEliminar: true, activo: true }, // Documentos requeridos
            { idRol: 1, idModulo: 20, puedeVer: true, puedeCrear: true, puedeActualizar: true, puedeEliminar: true, activo: true }, // Expedientes
            { idRol: 1, idModulo: 21, puedeVer: true, puedeCrear: true, puedeActualizar: true, puedeEliminar: true, activo: true }, // Contratos digitales
            { idRol: 1, idModulo: 22, puedeVer: true, puedeCrear: true, puedeActualizar: true, puedeEliminar: true, activo: true }, // Mis contratos


            // =========================================================================
            // ROL: RH (idRol: 2)
            // =========================================================================
            { idRol: 2, idModulo: 1, puedeVer: true, puedeCrear: true, puedeActualizar: true, puedeEliminar: false, activo: true },  // Estructura Organizacional (Padre)
            { idRol: 2, idModulo: 2, puedeVer: true, puedeCrear: true, puedeActualizar: true, puedeEliminar: false, activo: true },  // Empresas
            { idRol: 2, idModulo: 3, puedeVer: true, puedeCrear: true, puedeActualizar: true, puedeEliminar: false, activo: true },  // Ubicaciones
            { idRol: 2, idModulo: 4, puedeVer: true, puedeCrear: true, puedeActualizar: true, puedeEliminar: false, activo: true },  // Registros Patronales
            { idRol: 2, idModulo: 5, puedeVer: true, puedeCrear: true, puedeActualizar: true, puedeEliminar: false, activo: true },  // Areas Operativas
            { idRol: 2, idModulo: 6, puedeVer: true, puedeCrear: true, puedeActualizar: true, puedeEliminar: false, activo: true },  // Centro de Costos
            { idRol: 2, idModulo: 7, puedeVer: true, puedeCrear: true, puedeActualizar: true, puedeEliminar: false, activo: true },  // Puestos
            { idRol: 2, idModulo: 8, puedeVer: true, puedeCrear: true, puedeActualizar: true, puedeEliminar: false, activo: true },  // Niveles de Salario
            { idRol: 2, idModulo: 9, puedeVer: true, puedeCrear: true, puedeActualizar: true, puedeEliminar: false, activo: true },  // Validación de Puestos
            { idRol: 2, idModulo: 10, puedeVer: true, puedeCrear: true, puedeActualizar: true, puedeEliminar: false, activo: true }, // Plazas Operativas
            { idRol: 2, idModulo: 11, puedeVer: true, puedeCrear: true, puedeActualizar: true, puedeEliminar: false, activo: true }, // Organigrama Autorizado
            { idRol: 2, idModulo: 12, puedeVer: true, puedeCrear: true, puedeActualizar: true, puedeEliminar: false, activo: true }, // Organigrama Nominal
            { idRol: 2, idModulo: 13, puedeVer: true, puedeCrear: false, puedeActualizar: false, puedeEliminar: false, activo: true }, // Reclutamiento (Padre)
            { idRol: 2, idModulo: 14, puedeVer: true, puedeCrear: true, puedeActualizar: true, puedeEliminar: true, activo: true }, // Requisiciones
            { idRol: 2, idModulo: 15, puedeVer: true, puedeCrear: false, puedeActualizar: false, puedeEliminar: false, activo: true }, // Bolsa de trabajo
            { idRol: 2, idModulo: 16, puedeVer: true, puedeCrear: false, puedeActualizar: false, puedeEliminar: false, activo: true }, // Vacantes
            { idRol: 2, idModulo: 17, puedeVer: true, puedeCrear: false, puedeActualizar: false, puedeEliminar: false, activo: true }, // Entrevistas
            { idRol: 2, idModulo: 18, puedeVer: true, puedeCrear: true, puedeActualizar: true, puedeEliminar: false, activo: true }, // Expedientes digitales (Padre)
            { idRol: 2, idModulo: 19, puedeVer: true, puedeCrear: true, puedeActualizar: true, puedeEliminar: false, activo: true }, // Documentos requeridos
            { idRol: 2, idModulo: 20, puedeVer: true, puedeCrear: true, puedeActualizar: true, puedeEliminar: false, activo: true }, // Expedientes
            { idRol: 2, idModulo: 21, puedeVer: true, puedeCrear: true, puedeActualizar: true, puedeEliminar: false, activo: true }, // Contratos digitales
            { idRol: 2, idModulo: 22, puedeVer: true, puedeCrear: true, puedeActualizar: true, puedeEliminar: false, activo: true }, // Mis contratos

            // =========================================================================
            // ROL: FINANZAS (idRol: 3)
            // =========================================================================
            { idRol: 3, idModulo: 1, puedeVer: true, puedeCrear: false, puedeActualizar: false, puedeEliminar: false, activo: true },  // Estructura Organizacional (Padre)
            { idRol: 3, idModulo: 2, puedeVer: false, puedeCrear: false, puedeActualizar: false, puedeEliminar: false, activo: true }, // Empresas
            { idRol: 3, idModulo: 3, puedeVer: false, puedeCrear: false, puedeActualizar: false, puedeEliminar: false, activo: true }, // Ubicaciones
            { idRol: 3, idModulo: 4, puedeVer: false, puedeCrear: false, puedeActualizar: false, puedeEliminar: false, activo: true }, // Registros Patronales
            { idRol: 3, idModulo: 5, puedeVer: false, puedeCrear: false, puedeActualizar: false, puedeEliminar: false, activo: true }, // Areas Operativas
            { idRol: 3, idModulo: 6, puedeVer: true, puedeCrear: false, puedeActualizar: false, puedeEliminar: false, activo: true },  // Centro de Costos
            { idRol: 3, idModulo: 7, puedeVer: false, puedeCrear: false, puedeActualizar: false, puedeEliminar: false, activo: true }, // Puestos
            { idRol: 3, idModulo: 8, puedeVer: true, puedeCrear: false, puedeActualizar: false, puedeEliminar: false, activo: true },  // Niveles de Salario
            { idRol: 3, idModulo: 9, puedeVer: false, puedeCrear: false, puedeActualizar: false, puedeEliminar: false, activo: true }, // Validación de Puestos
            { idRol: 3, idModulo: 10, puedeVer: true, puedeCrear: false, puedeActualizar: false, puedeEliminar: false, activo: true }, // Plazas Operativas
            { idRol: 3, idModulo: 11, puedeVer: false, puedeCrear: false, puedeActualizar: false, puedeEliminar: false, activo: true }, // Organigrama Autorizado
            { idRol: 3, idModulo: 12, puedeVer: false, puedeCrear: false, puedeActualizar: false, puedeEliminar: false, activo: true }, // Organigrama Nominal
            { idRol: 3, idModulo: 13, puedeVer: false, puedeCrear: false, puedeActualizar: false, puedeEliminar: false, activo: true }, // Reclutamiento (Padre)
            { idRol: 3, idModulo: 14, puedeVer: false, puedeCrear: false, puedeActualizar: false, puedeEliminar: false, activo: true }, // Requisiciones
            { idRol: 3, idModulo: 15, puedeVer: false, puedeCrear: false, puedeActualizar: false, puedeEliminar: false, activo: true }, // Bolsa de trabajo
            { idRol: 3, idModulo: 16, puedeVer: false, puedeCrear: false, puedeActualizar: false, puedeEliminar: false, activo: true }, // Vacantes
            { idRol: 3, idModulo: 17, puedeVer: false, puedeCrear: false, puedeActualizar: false, puedeEliminar: false, activo: true }, // Entrevistas
            { idRol: 3, idModulo: 18, puedeVer: false, puedeCrear: false, puedeActualizar: false, puedeEliminar: false, activo: true }, // Expedientes digitales (Padre)
            { idRol: 3, idModulo: 19, puedeVer: false, puedeCrear: false, puedeActualizar: false, puedeEliminar: false, activo: true }, // Documentos requeridos
            { idRol: 3, idModulo: 20, puedeVer: false, puedeCrear: false, puedeActualizar: false, puedeEliminar: false, activo: true }, // Expedientes
            { idRol: 3, idModulo: 21, puedeVer: true, puedeCrear: false, puedeActualizar: true, puedeEliminar: false, activo: true }, // Contratos digitales
            { idRol: 3, idModulo: 22, puedeVer: true, puedeCrear: false, puedeActualizar: true, puedeEliminar: false, activo: true }, // Mis contratos

            // =========================================================================
            // ROL: RECLUTADOR (idRol: 4)
            // =========================================================================
            { idRol: 4, idModulo: 1, puedeVer: true, puedeCrear: false, puedeActualizar: false, puedeEliminar: false, activo: true },  // Estructura Organizacional (Padre)
            { idRol: 4, idModulo: 2, puedeVer: true, puedeCrear: false, puedeActualizar: false, puedeEliminar: false, activo: true },  // Empresas
            { idRol: 4, idModulo: 3, puedeVer: false, puedeCrear: false, puedeActualizar: false, puedeEliminar: false, activo: true }, // Ubicaciones
            { idRol: 4, idModulo: 4, puedeVer: false, puedeCrear: false, puedeActualizar: false, puedeEliminar: false, activo: true }, // Registros Patronales
            { idRol: 4, idModulo: 5, puedeVer: true, puedeCrear: false, puedeActualizar: false, puedeEliminar: false, activo: true },  // Areas Operativas
            { idRol: 4, idModulo: 6, puedeVer: false, puedeCrear: false, puedeActualizar: false, puedeEliminar: false, activo: true }, // Centro de Costos
            { idRol: 4, idModulo: 7, puedeVer: true, puedeCrear: false, puedeActualizar: false, puedeEliminar: false, activo: true },  // Puestos
            { idRol: 4, idModulo: 8, puedeVer: false, puedeCrear: false, puedeActualizar: false, puedeEliminar: false, activo: true }, // Niveles de Salario
            { idRol: 4, idModulo: 9, puedeVer: false, puedeCrear: false, puedeActualizar: false, puedeEliminar: false, activo: true }, // Validación de Puestos
            { idRol: 4, idModulo: 10, puedeVer: false, puedeCrear: false, puedeActualizar: false, puedeEliminar: false, activo: true }, // Plazas Operativas
            { idRol: 4, idModulo: 11, puedeVer: false, puedeCrear: false, puedeActualizar: false, puedeEliminar: false, activo: true }, // Organigrama Autorizado
            { idRol: 4, idModulo: 12, puedeVer: false, puedeCrear: false, puedeActualizar: false, puedeEliminar: false, activo: true }, // Organigrama Nominal
            { idRol: 4, idModulo: 13, puedeVer: true, puedeCrear: true, puedeActualizar: true, puedeEliminar: true, activo: true },  // Reclutamiento (Padre)
            { idRol: 4, idModulo: 14, puedeVer: true, puedeCrear: true, puedeActualizar: true, puedeEliminar: false, activo: true }, // Requisiciones
            { idRol: 4, idModulo: 15, puedeVer: true, puedeCrear: true, puedeActualizar: true, puedeEliminar: true, activo: true },  // Bolsa de trabajo
            { idRol: 4, idModulo: 16, puedeVer: true, puedeCrear: true, puedeActualizar: true, puedeEliminar: true, activo: true },  // Vacantes
            { idRol: 4, idModulo: 17, puedeVer: true, puedeCrear: true, puedeActualizar: true, puedeEliminar: true, activo: true },  // Entrevistas
            { idRol: 4, idModulo: 18, puedeVer: true, puedeCrear: false, puedeActualizar: false, puedeEliminar: false, activo: true }, // Expedientes digitales (Padre)
            { idRol: 4, idModulo: 19, puedeVer: false, puedeCrear: false, puedeActualizar: false, puedeEliminar: false, activo: true }, // Documentos requeridos
            { idRol: 4, idModulo: 20, puedeVer: true, puedeCrear: false, puedeActualizar: false, puedeEliminar: false, activo: true }, // Expedientes
            { idRol: 4, idModulo: 21, puedeVer: true, puedeCrear: false, puedeActualizar: false, puedeEliminar: false, activo: true }, // Contratos digitales
            { idRol: 4, idModulo: 22, puedeVer: true, puedeCrear: false, puedeActualizar: false, puedeEliminar: false, activo: true }, // Mis contratos

            // =========================================================================
            // ROL: MANAGER (idRol: 5)
            // =========================================================================
            { idRol: 5, idModulo: 1, puedeVer: true, puedeCrear: false, puedeActualizar: false, puedeEliminar: false, activo: true },  // Estructura Organizacional (Padre)
            { idRol: 5, idModulo: 2, puedeVer: false, puedeCrear: false, puedeActualizar: false, puedeEliminar: false, activo: true }, // Empresas
            { idRol: 5, idModulo: 3, puedeVer: false, puedeCrear: false, puedeActualizar: false, puedeEliminar: false, activo: true }, // Ubicaciones
            { idRol: 5, idModulo: 4, puedeVer: false, puedeCrear: false, puedeActualizar: false, puedeEliminar: false, activo: true }, // Registros Patronales
            { idRol: 5, idModulo: 5, puedeVer: false, puedeCrear: false, puedeActualizar: false, puedeEliminar: false, activo: true }, // Areas Operativas
            { idRol: 5, idModulo: 6, puedeVer: false, puedeCrear: false, puedeActualizar: false, puedeEliminar: false, activo: true }, // Centro de Costos
            { idRol: 5, idModulo: 7, puedeVer: true, puedeCrear: false, puedeActualizar: true, puedeEliminar: false, activo: true },  // Puestos
            { idRol: 5, idModulo: 8, puedeVer: false, puedeCrear: false, puedeActualizar: false, puedeEliminar: false, activo: true }, // Niveles de Salario
            { idRol: 5, idModulo: 9, puedeVer: true, puedeCrear: false, puedeActualizar: true, puedeEliminar: false, activo: true },  // Validación de Puestos
            { idRol: 5, idModulo: 10, puedeVer: false, puedeCrear: false, puedeActualizar: false, puedeEliminar: false, activo: true }, // Plazas Operativas
            { idRol: 5, idModulo: 11, puedeVer: true, puedeCrear: false, puedeActualizar: false, puedeEliminar: false, activo: true }, // Organigrama Autorizado
            { idRol: 5, idModulo: 12, puedeVer: true, puedeCrear: false, puedeActualizar: false, puedeEliminar: false, activo: true }, // Organigrama Nominal
            { idRol: 5, idModulo: 13, puedeVer: true, puedeCrear: false, puedeActualizar: false, puedeEliminar: false, activo: true }, // Reclutamiento (Padre)
            { idRol: 5, idModulo: 14, puedeVer: true, puedeCrear: true, puedeActualizar: true, puedeEliminar: true, activo: true },  // Requisiciones
            { idRol: 5, idModulo: 15, puedeVer: false, puedeCrear: false, puedeActualizar: false, puedeEliminar: false, activo: true }, // Bolsa de trabajo
            { idRol: 5, idModulo: 16, puedeVer: false, puedeCrear: false, puedeActualizar: false, puedeEliminar: false, activo: true }, // Vacantes
            { idRol: 5, idModulo: 17, puedeVer: true, puedeCrear: false, puedeActualizar: false, puedeEliminar: false, activo: true }, // Entrevistas
            { idRol: 5, idModulo: 18, puedeVer: true, puedeCrear: false, puedeActualizar: true, puedeEliminar: false, activo: true }, // Expedientes digitales (Padre)
            { idRol: 5, idModulo: 19, puedeVer: false, puedeCrear: false, puedeActualizar: false, puedeEliminar: false, activo: true }, // Documentos requeridos
            { idRol: 5, idModulo: 20, puedeVer: true, puedeCrear: false, puedeActualizar: false, puedeEliminar: false, activo: true }, // Expedientes
            { idRol: 5, idModulo: 21, puedeVer: true, puedeCrear: false, puedeActualizar: true, puedeEliminar: false, activo: true }, // Contratos digitales
            { idRol: 5, idModulo: 22, puedeVer: true, puedeCrear: false, puedeActualizar: true, puedeEliminar: false, activo: true }, // Mis contratos

            // =========================================================================
            // ROL: EMPLEADO (idRol: 6)
            // =========================================================================
            { idRol: 6, idModulo: 1, puedeVer: true, puedeCrear: false, puedeActualizar: false, puedeEliminar: false, activo: true },  // Estructura Organizacional (Padre)
            { idRol: 6, idModulo: 2, puedeVer: false, puedeCrear: false, puedeActualizar: false, puedeEliminar: false, activo: true }, // Empresas
            { idRol: 6, idModulo: 3, puedeVer: false, puedeCrear: false, puedeActualizar: false, puedeEliminar: false, activo: true }, // Ubicaciones
            { idRol: 6, idModulo: 4, puedeVer: false, puedeCrear: false, puedeActualizar: false, puedeEliminar: false, activo: true }, // Registros Patronales
            { idRol: 6, idModulo: 5, puedeVer: false, puedeCrear: false, puedeActualizar: false, puedeEliminar: false, activo: true }, // Areas Operativas
            { idRol: 6, idModulo: 6, puedeVer: false, puedeCrear: false, puedeActualizar: false, puedeEliminar: false, activo: true }, // Centro de Costos
            { idRol: 6, idModulo: 7, puedeVer: false, puedeCrear: false, puedeActualizar: false, puedeEliminar: false, activo: true }, // Puestos
            { idRol: 6, idModulo: 8, puedeVer: false, puedeCrear: false, puedeActualizar: false, puedeEliminar: false, activo: true }, // Niveles de Salario
            { idRol: 6, idModulo: 9, puedeVer: false, puedeCrear: false, puedeActualizar: false, puedeEliminar: false, activo: true }, // Validación de Puestos
            { idRol: 6, idModulo: 10, puedeVer: false, puedeCrear: false, puedeActualizar: false, puedeEliminar: false, activo: true }, // Plazas Operativas
            { idRol: 6, idModulo: 11, puedeVer: false, puedeCrear: false, puedeActualizar: false, puedeEliminar: false, activo: true }, // Organigrama Autorizado
            { idRol: 6, idModulo: 12, puedeVer: true, puedeCrear: false, puedeActualizar: false, puedeEliminar: false, activo: true }, // Organigrama Nominal
            { idRol: 6, idModulo: 13, puedeVer: false, puedeCrear: false, puedeActualizar: false, puedeEliminar: false, activo: true }, // Reclutamiento (Padre)
            { idRol: 6, idModulo: 14, puedeVer: false, puedeCrear: false, puedeActualizar: false, puedeEliminar: false, activo: true }, // Requisiciones
            { idRol: 6, idModulo: 15, puedeVer: true, puedeCrear: false, puedeActualizar: false, puedeEliminar: false, activo: true }, // Bolsa de trabajo
            { idRol: 6, idModulo: 16, puedeVer: false, puedeCrear: false, puedeActualizar: false, puedeEliminar: false, activo: true }, // Vacantes
            { idRol: 6, idModulo: 17, puedeVer: false, puedeCrear: false, puedeActualizar: false, puedeEliminar: false, activo: true }, // Entrevistas
            { idRol: 6, idModulo: 18, puedeVer: true, puedeCrear: false, puedeActualizar: false, puedeEliminar: false, activo: true }, // Expedientes digitales (Padre)
            { idRol: 6, idModulo: 19, puedeVer: false, puedeCrear: false, puedeActualizar: false, puedeEliminar: false, activo: true }, // Documentos requeridos
            { idRol: 6, idModulo: 20, puedeVer: true, puedeCrear: false, puedeActualizar: false, puedeEliminar: false, activo: true }, // Expedientes
            { idRol: 6, idModulo: 21, puedeVer: true, puedeCrear: false, puedeActualizar: true, puedeEliminar: false, activo: true }, // Contratos digitales
            { idRol: 6, idModulo: 22, puedeVer: true, puedeCrear: false, puedeActualizar: true, puedeEliminar: false, activo: true }, // Mis contratos
        ];

        for (const permiso of permisos) {
            await this.prisma.$queryRaw`
                INSERT INTO RelRolPermisos (idRol, idModulo, PuedeVer, PuedeCrear, PuedeActualizar, PuedeEliminar, Activo)
                VALUES (${permiso.idRol}, ${permiso.idModulo}, ${permiso.puedeVer}, ${permiso.puedeCrear}, ${permiso.puedeActualizar}, ${permiso.puedeEliminar}, ${permiso.activo})
                ON DUPLICATE KEY UPDATE 
                    PuedeVer = VALUES(PuedeVer),
                    PuedeCrear = VALUES(PuedeCrear),
                    PuedeActualizar = VALUES(PuedeActualizar),
                    PuedeEliminar = VALUES(PuedeEliminar),
                    Activo = VALUES(Activo);
            `;
        }
    }

    // Seeds initial request position status into the database.
    private async seedEstatusSolicitudPuesto() {
        const types = [
            { id: 1, descripcion: 'PENDIENTE', activo: 1 },
            { id: 2, descripcion: 'RECHAZADO', activo: 1 },
            { id: 3, descripcion: 'APROBADO', activo: 1 },
        ];

        for (const type of types) {
            await this.prisma.$queryRaw`
            INSERT INTO CatEstatusSolicitudPuesto (id, descripcion, activo)
            VALUES (${type.id}, ${type.descripcion}, ${type.activo})
            ON DUPLICATE KEY UPDATE 
                descripcion = VALUES(descripcion), 
                activo = VALUES(activo);
        `;
        }
    }

    // Seeds initial contract status into the database.
    private async seedEstatusContratos() {
        const types = [
            { idEstatusContrato: 1, descripcion: 'PENDIENTE DE GENERAR', activo: 1 },
            { idEstatusContrato: 2, descripcion: 'ENVIADO A FIRMA', activo: 1 },
            { idEstatusContrato: 3, descripcion: 'FIRMADO POR EMPLEADO', activo: 1 },
            { idEstatusContrato: 4, descripcion: 'FINALIZADO (NOM-151)', activo: 1 },
            { idEstatusContrato: 5, descripcion: 'CANCELADO', activo: 1 },
        ];

        for (const type of types) {
            await this.prisma.$queryRaw`
            INSERT INTO CatEstatusContratos (idEstatusContrato, descripcion, activo)
            VALUES (${type.idEstatusContrato}, ${type.descripcion}, ${type.activo})
            ON DUPLICATE KEY UPDATE 
                descripcion = VALUES(descripcion), 
                activo = VALUES(activo);
        `;
        }
    }

    // Seeds initial currency types into the database.
    private async seedTiposMoneda() {
        const types = [
            { idTipoMoneda: 1, codigo: 'MXN', descripcion: 'Peso Mexicano' },
            { idTipoMoneda: 2, codigo: 'USD', descripcion: 'Dólar Americano' },
            { idTipoMoneda: 3, codigo: 'EUR', descripcion: 'Euro' },
        ];

        for (const type of types) {
            await this.prisma.$queryRaw`
            INSERT INTO CatTiposMoneda (idTipoMoneda, codigo, descripcion)
            VALUES (${type.idTipoMoneda}, ${type.codigo}, ${type.descripcion})
            ON DUPLICATE KEY UPDATE 
                descripcion = VALUES(descripcion), 
                activo = VALUES(activo);
        `;
        }
    }

    // Seeds initial payment frequencies into the database.
    private async seedPeriodicidadesPago() {
        const types = [
            { idPeriodicidadPago: 1, descripcion: 'Semanal' },
            { idPeriodicidadPago: 2, descripcion: 'Catorcenal' },
            { idPeriodicidadPago: 3, descripcion: 'Quincenal' },
            { idPeriodicidadPago: 4, descripcion: 'Mensual' },
        ];

        for (const type of types) {
            await this.prisma.$queryRaw`
            INSERT INTO CatPeriodicidadesPago (idPeriodicidadPago, descripcion)
            VALUES (${type.idPeriodicidadPago}, ${type.descripcion})
            ON DUPLICATE KEY UPDATE 
                descripcion = VALUES(descripcion);
        `;
        }
    }

}
