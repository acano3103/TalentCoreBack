import { BadRequestException, Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { ActiveUserDto } from '../auth/dto/active-user.dto';
import { IntegrationsFactory } from '../integrations/providers/factory.service';
import { GenerateAiContentDto } from './dto/generate-ai-content.dto';
import { UpdateContentConfigDto } from './dto/update-content-config.dto';
import { GeneratedCourse, GeneratedLesson, QuizQuestion, Slide } from './interfaces/course-content.interface';

// Calificación mínima que se usa cuando el curso no tiene calificacionAprobatoria configurada (mismo default de SimuPro)
const CALIFICACION_APROBATORIA_DEFAULT = 70;

@Injectable()
export class CourseContentService {
    private readonly logger = new Logger(CourseContentService.name);

    constructor(
        private readonly prismaService: PrismaService,
        private readonly integrationFactory: IntegrationsFactory,
    ) { }

    // ==========================================
    // HELPERS PRIVADOS
    // ==========================================

    // Regresa el tenant del usuario o truena si no tiene (mismo criterio que Roleplays)
    private getTenantOrThrow(user: ActiveUserDto): number {
        if (!user.idTenant) {
            throw new InternalServerErrorException('El usuario no tiene un tenant asignado.');
        }
        return user.idTenant;
    }

    // Busca la integración de IA activa de la empresa y regresa el proveedor ya resuelto (mismo patrón que Roleplays)
    private async getAiProvider(companyId: number) {
        const activeAiIntegration = await this.prismaService.integraciones.findFirst({
            where: {
                idEmpresa: companyId,
                isConnected: true,
                CatIntegracionesProvedores: {
                    type: 'ai',
                    isActive: true,
                },
            },
            include: { CatIntegracionesProvedores: true },
        });

        if (!activeAiIntegration) {
            throw new BadRequestException('La empresa no cuenta con una integración de Inteligencia Artificial activa.');
        }

        return this.integrationFactory.getProvider(activeAiIntegration.providerId);
    }

    // Valida que la sesión exista, sea de la empresa y del tenant del usuario, y que sea Online Asíncrono
    private async getAsyncSession(companyId: number, sessionId: number, idTenant: number) {
        const session = await this.prismaService.cursoSesiones.findFirst({
            where: {
                idSesion: sessionId,
                idEmpresa: companyId,
            },
            include: {
                CatCursos: {
                    select: {
                        idCursos: true,
                        idTenant: true,
                        Descripcion: true,
                        calificacionAprobatoria: true,
                    },
                },
            },
        });

        // CursoSesiones no tiene idTenant: el tenant se valida a través del curso base (CatCursos.idTenant)
        const otroTenant = session?.CatCursos?.idTenant != null && session.CatCursos.idTenant !== idTenant;

        if (!session || otroTenant) {
            throw new NotFoundException(
                `La sesión #${sessionId} no fue encontrada o no pertenece a la empresa actual.`,
            );
        }

        if (session.modalidad !== 'online_asincrono') {
            throw new BadRequestException(
                'Solo las sesiones con modalidad Online Asíncrono pueden tener contenido.',
            );
        }

        return session;
    }

    // Convierte cualquier estructura a JSON plano para guardarla en una columna JSON de Prisma
    private toJson(value: unknown) {
        return JSON.parse(JSON.stringify(value));
    }

    private asText(value: unknown, fallback = ''): string {
        return typeof value === 'string' && value.trim() !== '' ? value.trim() : fallback;
    }

    // Valida y limpia lo que regresó la IA para no guardar estructuras rotas
    private normalizeStructure(raw: any, tituloCurso: string): GeneratedCourse {
        const rawModules = Array.isArray(raw?.modules) ? raw.modules : [];

        const modules = rawModules
            .map((mod: any, mi: number) => {
                const rawLessons = Array.isArray(mod?.lessons) ? mod.lessons : [];

                const lessons: GeneratedLesson[] = rawLessons
                    .map((lesson: any, li: number) => {
                        const rawQuiz = Array.isArray(lesson?.quiz) ? lesson.quiz : [];

                        // Solo se conservan preguntas completas y con un correctIndex que sí exista entre las opciones
                        const quiz: QuizQuestion[] = rawQuiz
                            .map((q: any) => {
                                const options = Array.isArray(q?.options)
                                    ? q.options.filter((o: unknown) => typeof o === 'string' && o.trim() !== '')
                                    : [];
                                return {
                                    question: this.asText(q?.question),
                                    options,
                                    correctIndex: Number(q?.correctIndex),
                                    explanation: this.asText(q?.explanation),
                                };
                            })
                            .filter(
                                (q: QuizQuestion) =>
                                    q.question !== '' &&
                                    q.options.length >= 2 &&
                                    Number.isInteger(q.correctIndex) &&
                                    q.correctIndex >= 0 &&
                                    q.correctIndex < q.options.length,
                            );

                        return {
                            title: this.asText(lesson?.title, `Lección ${li + 1}`),
                            objective: this.asText(lesson?.objective),
                            content: this.asText(lesson?.content),
                            keyPoints: Array.isArray(lesson?.keyPoints)
                                ? lesson.keyPoints.filter((kp: unknown) => typeof kp === 'string' && kp.trim() !== '')
                                : [],
                            quiz,
                        };
                    })
                    .filter((lesson: GeneratedLesson) => lesson.content !== '');

                return {
                    title: this.asText(mod?.title, `Módulo ${mi + 1}`),
                    objective: this.asText(mod?.objective),
                    lessons,
                };
            })
            .filter((mod: { lessons: GeneratedLesson[] }) => mod.lessons.length > 0);

        if (modules.length === 0) {
            throw new BadRequestException(
                'La IA no regresó una estructura de curso válida. Intenta generar de nuevo.',
            );
        }

        return {
            title: this.asText(raw?.title, tituloCurso),
            description: this.asText(raw?.description),
            targetAudience: this.asText(raw?.targetAudience),
            level: this.asText(raw?.level),
            modules,
        };
    }

    // Arma las slides de una lección: 1 de introducción, hasta 3 de contenido, 1 por punto clave y 1 de resumen
    private buildSlides(lesson: GeneratedLesson): Slide[] {
        const slides: Slide[] = [];
        let index = 0;

        slides.push({ index: index++, type: 'intro', title: lesson.title, body: lesson.objective });

        const paragraphs = lesson.content
            .split('\n')
            .map((p) => p.trim())
            .filter((p) => p.length > 20)
            .slice(0, 3);

        for (const paragraph of paragraphs) {
            slides.push({ index: index++, type: 'content', title: lesson.title, body: paragraph });
        }

        for (const keyPoint of lesson.keyPoints) {
            slides.push({ index: index++, type: 'keypoint', title: 'Punto clave', body: keyPoint });
        }

        const resumenPuntos =
            lesson.keyPoints.length > 0
                ? ` Los puntos clave son: ${lesson.keyPoints.slice(0, 2).join(', ')}.`
                : '';

        slides.push({
            index: index++,
            type: 'summary',
            title: 'Resumen',
            body: `En esta lección aprendiste sobre ${lesson.title.toLowerCase()}.${resumenPuntos}`,
        });

        return slides;
    }

    // ==========================================
    // GENERAR CONTENIDO CON IA
    // ==========================================

    // Genera (o regenera) con IA el contenido de una sesión Online Asíncrono y lo guarda como módulos y lecciones
    async generateWithAi(companyId: number, sessionId: number, dto: GenerateAiContentDto, user: ActiveUserDto) {
        const idTenant = this.getTenantOrThrow(user);
        const session = await this.getAsyncSession(companyId, sessionId, idTenant);
        const nombreCurso = session.CatCursos?.Descripcion || 'Curso';

        // 1. Si la sesión ya tiene contenido, solo se puede regenerar si es de IA y nadie ha avanzado
        const existing = await this.prismaService.cursoContenidos.findFirst({
            where: { idSesion: sessionId, idTenant },
        });

        if (existing && existing.tipoContenido !== 'ia') {
            throw new BadRequestException(
                `La sesión ya tiene contenido de tipo "${existing.tipoContenido}". No es posible generarlo con IA.`,
            );
        }

        if (existing) {
            // Regenerar borra las lecciones; si ya hay avance, se perdería el progreso de los participantes
            const avances = await this.prismaService.cursoLeccionProgresos.count({
                where: {
                    idTenant,
                    CursoLecciones: { CursoModulos: { idContenido: existing.idContenido } },
                },
            });

            if (avances > 0) {
                throw new BadRequestException(
                    'No es posible regenerar el contenido porque ya hay participantes con avance en este curso.',
                );
            }
        }

        // 2. Pedir la estructura a la IA de la empresa
        const aiProvider = await this.getAiProvider(companyId);

        if (typeof aiProvider.generateCourseStructure !== 'function') {
            throw new BadRequestException(
                'El proveedor de Inteligencia Artificial conectado no soporta la generación de cursos.',
            );
        }

        const rawStructure = await aiProvider.generateCourseStructure(companyId, {
            titulo: nombreCurso,
            prompt: dto.prompt,
            numModulos: dto.numModulos,
            nivel: dto.nivel,
            idioma: dto.idioma,
        });

        const structure = this.normalizeStructure(rawStructure, nombreCurso);

        // 3. Guardar contenido, módulos y lecciones en una sola transacción
        const idContenido = await this.prismaService.$transaction(
            async (tx) => {
                // A. Crear o actualizar el contenido de la sesión
                const contenido = existing
                    ? await tx.cursoContenidos.update({
                        where: { idContenido: existing.idContenido },
                        data: {
                            estructuraIa: this.toJson(structure),
                            estatusVideo: 'pendiente',
                        },
                    })
                    : await tx.cursoContenidos.create({
                        data: {
                            idTenant,
                            idEmpresa: companyId,
                            idSesion: sessionId,
                            tipoContenido: 'ia',
                            estructuraIa: this.toJson(structure),
                        },
                    });

                // B. Si es regeneración, limpiar los módulos anteriores (las lecciones se van en cascada)
                if (existing) {
                    await tx.cursoModulos.deleteMany({
                        where: { idContenido: contenido.idContenido },
                    });
                }

                // C. Crear cada módulo con sus lecciones
                for (let mi = 0; mi < structure.modules.length; mi++) {
                    const mod = structure.modules[mi];

                    await tx.cursoModulos.create({
                        data: {
                            idTenant,
                            idContenido: contenido.idContenido,
                            titulo: mod.title.slice(0, 255),
                            objetivo: mod.objective,
                            orden: mi,
                            CursoLecciones: {
                                create: mod.lessons.map((lesson, li) => ({
                                    idTenant,
                                    titulo: lesson.title.slice(0, 255),
                                    objetivo: lesson.objective,
                                    contenido: lesson.content,
                                    puntosClave: this.toJson(lesson.keyPoints),
                                    slides: this.toJson(this.buildSlides(lesson)),
                                    quiz: this.toJson(lesson.quiz),
                                    orden: li,
                                })),
                            },
                        },
                    });
                }

                // D. Registrar el movimiento en el histórico
                await tx.historicoMovimientos.create({
                    data: {
                        idUsuario: user.id,
                        idEmpresa: companyId,
                        accion: existing ? 'UPDATE' : 'CREATE',
                        tablaOrigen: 'CursoContenidos',
                        idRegistro: String(contenido.idContenido),
                        descripcion: `Contenido con IA ${existing ? 'regenerado' : 'generado'} para la sesión #${sessionId} del curso "${nombreCurso}" por ${user.first_name} ${user.last_name}`,
                        fechaCreacion: new Date(),
                    },
                });

                return contenido.idContenido;
            },
            { timeout: 20000 },
        );

        this.logger.log(`Contenido #${idContenido} ${existing ? 'regenerado' : 'generado'} con IA para la sesión #${sessionId}`);

        const totalLecciones = structure.modules.reduce((acc, mod) => acc + mod.lessons.length, 0);
        const detalle = await this.findContent(companyId, sessionId, user);

        return {
            message: `Curso generado con ${structure.modules.length} módulos y ${totalLecciones} lecciones`,
            ...detalle,
        };
    }

    // ==========================================
    // CONSULTAR CONTENIDO (VISTA DE ADMINISTRACIÓN)
    // ==========================================

    // Regresa el contenido completo de la sesión con módulos y lecciones.
    // OJO: incluye las respuestas correctas del quiz; es para quien administra el curso, no para el reproductor.
    async findContent(companyId: number, sessionId: number, user: ActiveUserDto) {
        const idTenant = this.getTenantOrThrow(user);
        const session = await this.getAsyncSession(companyId, sessionId, idTenant);

        const contenido = await this.prismaService.cursoContenidos.findFirst({
            where: { idSesion: sessionId, idTenant },
            include: {
                CursoModulos: {
                    orderBy: { orden: 'asc' },
                    include: {
                        CursoLecciones: { orderBy: { orden: 'asc' } },
                    },
                },
                CursoPaquetesScorm: true,
            },
        });

        const base = {
            idSesion: session.idSesion,
            idCurso: session.idCurso,
            nombreCurso: session.CatCursos?.Descripcion || 'Sin Nombre',
            calificacionAprobatoria: session.CatCursos?.calificacionAprobatoria ?? CALIFICACION_APROBATORIA_DEFAULT,
        };

        if (!contenido) {
            return { ...base, contenido: null };
        }

        const { CursoModulos, CursoPaquetesScorm, estructuraIa, ...contenidoData } = contenido;
        const estructura = (estructuraIa ?? {}) as any;

        const modulos = CursoModulos.map(({ CursoLecciones, ...moduloData }) => ({
            ...moduloData,
            lecciones: CursoLecciones,
        }));

        return {
            ...base,
            contenido: {
                ...contenidoData,
                descripcionGenerada: estructura.description || '',
                audiencia: estructura.targetAudience || '',
                nivel: estructura.level || '',
                totalModulos: modulos.length,
                totalLecciones: modulos.reduce((acc, mod) => acc + mod.lecciones.length, 0),
                paqueteScorm: CursoPaquetesScorm,
                modulos,
            },
        };
    }

    // ==========================================
    // CONFIGURACIÓN DE AVANCE
    // ==========================================

    // Cambia el modo de avance del contenido (libre, video completo, aprobar quiz, video y quiz)
    async updateConfig(companyId: number, sessionId: number, dto: UpdateContentConfigDto, user: ActiveUserDto) {
        const idTenant = this.getTenantOrThrow(user);
        await this.getAsyncSession(companyId, sessionId, idTenant);

        const contenido = await this.prismaService.cursoContenidos.findFirst({
            where: { idSesion: sessionId, idTenant },
        });

        if (!contenido) {
            throw new NotFoundException(`La sesión #${sessionId} aún no tiene contenido.`);
        }

        const updated = await this.prismaService.cursoContenidos.update({
            where: { idContenido: contenido.idContenido },
            data: { modoAvance: dto.modoAvance },
            select: { idContenido: true, idSesion: true, tipoContenido: true, modoAvance: true },
        });

        await this.prismaService.historicoMovimientos.create({
            data: {
                idUsuario: user.id,
                idEmpresa: companyId,
                accion: 'UPDATE',
                tablaOrigen: 'CursoContenidos',
                idRegistro: String(contenido.idContenido),
                descripcion: `Modo de avance de la sesión #${sessionId} cambiado a "${dto.modoAvance}" por ${user.first_name} ${user.last_name}`,
                fechaCreacion: new Date(),
            },
        });

        return updated;
    }
}
