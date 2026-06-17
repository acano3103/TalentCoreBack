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
            await this.seedGender(); /** CatGenero */
            await this.seedLanguages(); /** CatIdiomas */
            await this.seedModalities(); /** CatModalidad */
            await this.seedModules(); /** CatModulos */
            await this.seedLevels(); /** CatNivel */
            await this.seedHiringTypes(); /** CatTipoContratacion */
            await this.seedCourseTypes(); /** CatTipoCurso */
            await this.seedPositionTypes(); /** CatTipoPuesto */
            await this.seedEducationLevels(); /** CatEscolaridad */
            await this.seedSalaryLevels(); /** CatNivelesSalario */
            await this.seedTiposUbicacion(); /** CatTiposUbicacion */
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
            { id: 4, code: 'CREDENTIALS_CREATED', description: 'Notificación de creación de credenciales', activo: true },
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
            { id: 12, notification_type_id: 3, channel_id: 4, enabled: true }, // Sockets
            // --- 4. CREDENTIALS_CREATED (Creación de cuenta/credenciales) ---
            { id: 13, notification_type_id: 4, channel_id: 1, enabled: true }, // Email
            { id: 14, notification_type_id: 4, channel_id: 2, enabled: true }, // WhatsApp
            { id: 15, notification_type_id: 4, channel_id: 3, enabled: false }, // SMS
            { id: 16, notification_type_id: 4, channel_id: 4, enabled: false } // Sockets
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
            { idEstatusvacante: 1, decripcion: 'POSTULADO', activo: true },
            { idEstatusvacante: 2, decripcion: 'EN ENTREVISTAS', activo: true },
            { idEstatusvacante: 3, decripcion: 'EN NEGOCIACION', activo: true },
            { idEstatusvacante: 4, decripcion: 'DECLINO LA OFERTA', activo: true },
            { idEstatusvacante: 5, decripcion: 'RECHAZADO', activo: true },
            { idEstatusvacante: 6, decripcion: 'RECLUTADO', activo: true },
        ]

        for (const vacantStatus of vacantsStatus) {
            await this.prisma.$queryRaw`
                INSERT INTO CatEstatusVacante (idEstatusvacante, decripcion, activo)
                VALUES (${vacantStatus.idEstatusvacante}, ${vacantStatus.decripcion}, ${vacantStatus.activo})
                ON DUPLICATE KEY UPDATE decripcion = VALUES(decripcion), activo = VALUES(activo);
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

    // Seeds initial modules into the database.
    private async seedModules() {
        const modules = [
            { idModulo: 1, Descripcion: 'Administrador', Activo: true },
            { idModulo: 2, Descripcion: 'Expedientes', Activo: true },
            { idModulo: 3, Descripcion: 'Subir Documentos', Activo: true },
            { idModulo: 4, Descripcion: 'Organigrama', Activo: true },
            { idModulo: 5, Descripcion: 'Reportes y estadisticas', Activo: true },
            { idModulo: 6, Descripcion: 'Bolsa de Trabajo', Activo: true },
            { idModulo: 7, Descripcion: 'Validar Requisiciones', Activo: true },
            { idModulo: 8, Descripcion: 'Perfilador de Candidatos', Activo: true },
            { idModulo: 9, Descripcion: 'Requisiciones', Activo: true },
            { idModulo: 10, Descripcion: 'Simupro', Activo: true },
            { idModulo: 11, Descripcion: 'Entrevista IA', Activo: true },
            { idModulo: 12, Descripcion: 'Integraciones', Activo: true },
        ]

        for (const module of modules) {
            await this.prisma.$queryRaw`
                INSERT INTO CatModulos (idModulo, Descripcion, Activo)
                VALUES (${module.idModulo}, ${module.Descripcion}, ${module.Activo})
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

}
