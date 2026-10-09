import { BadRequestException, Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { ActiveUserDto } from '../auth/dto/active-user.dto';
import { SubmitLessonProgressDto } from './dto/submit-lesson-progress.dto';
import { QuizQuestion, Slide } from './interfaces/course-content.interface';

// Calificación mínima cuando el curso no tiene calificacionAprobatoria configurada (mismo default que CourseContentService)
const CALIFICACION_APROBATORIA_DEFAULT = 70;

type ModoAvance = 'libre' | 'video_completo' | 'aprobar_quiz' | 'video_y_quiz';

interface ProgresoLeccion {
    idLeccion: number;
    calificacionQuiz: unknown;
    fechaCompletado: Date | null;
}

// Lógica del lado del empleado (el "player"): ver sus cursos asignados, tomarlos y guardar su avance.
// Regla de seguridad: el quiz se califica aquí; las respuestas correctas nunca se mandan al abrir una lección.
@Injectable()
export class CourseLearningService {
    private readonly logger = new Logger(CourseLearningService.name);

    constructor(private readonly prismaService: PrismaService) { }

    // ==========================================
    // HELPERS PRIVADOS
    // ==========================================

    private getTenantOrThrow(user: ActiveUserDto): number {
        if (!user.idTenant) {
            throw new InternalServerErrorException('El usuario no tiene un tenant asignado.');
        }
        return user.idTenant;
    }

    // Empleado ligado al usuario logueado dentro de la empresa (mismo patrón que work-shifts findMine)
    private async getEmployeeId(companyId: number, user: ActiveUserDto, idTenant: number): Promise<number> {
        const authUser = await this.prismaService.auth_user.findUnique({
            where: { id: user.id },
            include: {
                Empleados: {
                    where: { idEmpresa: companyId, idTenant },
                    select: { idEmpleado: true },
                    take: 1,
                },
            },
        });

        const idEmpleado = authUser?.Empleados?.[0]?.idEmpleado;
        if (!idEmpleado) {
            throw new NotFoundException('El usuario no tiene un empleado asociado en esta empresa.');
        }
        return idEmpleado;
    }

    // CursoSesiones no tiene idTenant: se valida con el curso base (CatCursos.idTenant), igual que en CourseContentService
    private isSameTenant(cursoTenant: number | null | undefined, idTenant: number): boolean {
        return cursoTenant == null || cursoTenant === idTenant;
    }

    // Inscripción del empleado a una sesión Online Asíncrono de su empresa y tenant
    private async getParticipation(companyId: number, sessionId: number, user: ActiveUserDto) {
        const idTenant = this.getTenantOrThrow(user);
        const idEmpleado = await this.getEmployeeId(companyId, user, idTenant);

        const participacion = await this.prismaService.cursoParticipantes.findFirst({
            where: {
                idSesion: sessionId,
                idEmpleado,
                CursoSesiones: { idEmpresa: companyId, modalidad: 'online_asincrono' },
            },
            include: {
                CursoSesiones: {
                    include: {
                        CatCursos: {
                            select: { idTenant: true, Descripcion: true, calificacionAprobatoria: true },
                        },
                    },
                },
            },
        });

        if (!participacion || !this.isSameTenant(participacion.CursoSesiones.CatCursos?.idTenant, idTenant)) {
            throw new NotFoundException(`No tienes asignado el curso de la sesión #${sessionId}.`);
        }

        return { participacion, idTenant, idEmpleado };
    }

    private async getContent(sessionId: number, idTenant: number) {
        return this.prismaService.cursoContenidos.findFirst({
            where: { idSesion: sessionId, idTenant, activo: true },
            include: {
                CursoModulos: {
                    orderBy: { orden: 'asc' },
                    include: { CursoLecciones: { orderBy: { orden: 'asc' } } },
                },
            },
        });
    }

    // El curso solo se puede tomar dentro del periodo y si la sesión no está cancelada ni finalizada
    // fechaFinPeriodo en null = periodo indeterminado: el curso no vence
    private getAvailability(session: { estatus: string; fechaInicioPeriodo: Date; fechaFinPeriodo: Date | null }) {
        const ahora = new Date();
        const fecha = (d: Date) => d.toISOString().slice(0, 10);

        if (session.estatus === 'cancelado') return { disponible: false, motivo: 'La sesión fue cancelada.' };
        if (session.estatus === 'finalizado') return { disponible: false, motivo: 'La sesión ya finalizó.' };
        if (ahora < session.fechaInicioPeriodo) {
            return { disponible: false, motivo: `El curso estará disponible a partir del ${fecha(session.fechaInicioPeriodo)}.` };
        }
        if (session.fechaFinPeriodo && ahora > session.fechaFinPeriodo) {
            return { disponible: false, motivo: `El periodo del curso terminó el ${fecha(session.fechaFinPeriodo)}.` };
        }
        return { disponible: true, motivo: null };
    }

    // libre: cualquier orden. Los demás modos: en orden, una lección se desbloquea al completar la anterior.
    private isSequential(modo: ModoAvance) {
        return modo !== 'libre';
    }

    // Modos con quiz: la lección solo cuenta como completada si se aprueba su quiz
    private requiresPassing(modo: ModoAvance) {
        return modo === 'aprobar_quiz' || modo === 'video_y_quiz';
    }

    private asQuiz(value: unknown): QuizQuestion[] {
        return Array.isArray(value) ? (value as QuizQuestion[]) : [];
    }

    private asSlides(value: unknown): Slide[] {
        return Array.isArray(value) ? (value as Slide[]) : [];
    }

    private toNumber(value: unknown): number | null {
        return value == null ? null : Number(value);
    }

    private round2(value: number) {
        return Math.round(value * 100) / 100;
    }

    // Lecciones en orden de curso (módulo por módulo) para saber cuál sigue y cuáles están bloqueadas
    private flattenLessons(contenido: NonNullable<Awaited<ReturnType<CourseLearningService['getContent']>>>) {
        return contenido.CursoModulos.flatMap((m) => m.CursoLecciones);
    }

    private getLockedIds(lessonIds: number[], progressMap: Map<number, ProgresoLeccion>, modo: ModoAvance) {
        const bloqueadas = new Set<number>();
        if (!this.isSequential(modo)) return bloqueadas;

        let anteriorCompletada = true;
        for (const idLeccion of lessonIds) {
            if (!anteriorCompletada) bloqueadas.add(idLeccion);
            anteriorCompletada = anteriorCompletada && !!progressMap.get(idLeccion)?.fechaCompletado;
        }
        return bloqueadas;
    }

    private buildProgressSummary(lessonIds: number[], progressMap: Map<number, ProgresoLeccion>) {
        const completadas = lessonIds.filter((id) => !!progressMap.get(id)?.fechaCompletado).length;
        const total = lessonIds.length;
        return {
            leccionesCompletadas: completadas,
            totalLecciones: total,
            porcentajeAvance: total > 0 ? Math.round((completadas / total) * 100) : 0,
        };
    }

    // ==========================================
    // MIS CURSOS
    // ==========================================

    // Cursos Online Asíncrono asignados al empleado logueado, con su avance
    async findMyCourses(companyId: number, user: ActiveUserDto) {
        const idTenant = this.getTenantOrThrow(user);
        const idEmpleado = await this.getEmployeeId(companyId, user, idTenant);

        const participaciones = await this.prismaService.cursoParticipantes.findMany({
            where: {
                idEmpleado,
                CursoSesiones: {
                    idEmpresa: companyId,
                    modalidad: 'online_asincrono',
                    estatus: { not: 'cancelado' },
                },
            },
            include: {
                CursoSesiones: {
                    include: {
                        CatCursos: { select: { idTenant: true, Descripcion: true, calificacionAprobatoria: true } },
                        CursoContenidos: {
                            select: {
                                idTenant: true,
                                activo: true,
                                CursoModulos: { select: { CursoLecciones: { select: { idLeccion: true } } } },
                            },
                        },
                    },
                },
                CursoLeccionProgresos: { select: { idLeccion: true, calificacionQuiz: true, fechaCompletado: true } },
            },
            orderBy: { CursoSesiones: { fechaInicioPeriodo: 'desc' } },
        });

        return participaciones
            .filter((p) => this.isSameTenant(p.CursoSesiones.CatCursos?.idTenant, idTenant))
            .map((p) => {
                const sesion = p.CursoSesiones;
                const contenido =
                    sesion.CursoContenidos && sesion.CursoContenidos.idTenant === idTenant && sesion.CursoContenidos.activo
                        ? sesion.CursoContenidos
                        : null;
                const lessonIds = contenido ? contenido.CursoModulos.flatMap((m) => m.CursoLecciones.map((l) => l.idLeccion)) : [];
                const progressMap = new Map(p.CursoLeccionProgresos.map((pr) => [pr.idLeccion, pr]));
                const { disponible, motivo } = this.getAvailability(sesion);

                return {
                    idSesion: sesion.idSesion,
                    idParticipante: p.idParticipante,
                    nombreCurso: sesion.CatCursos?.Descripcion || 'Sin Nombre',
                    fechaInicioPeriodo: sesion.fechaInicioPeriodo,
                    fechaFinPeriodo: sesion.fechaFinPeriodo,
                    estatusSesion: sesion.estatus,
                    disponible: disponible && !!contenido,
                    motivoNoDisponible: contenido ? motivo : 'El curso aún no tiene contenido.',
                    estatusAsignacion: p.estatusAsignacion,
                    calificacionFinal: this.toNumber(p.calificacionFinal),
                    calificacionAprobatoria: sesion.CatCursos?.calificacionAprobatoria ?? CALIFICACION_APROBATORIA_DEFAULT,
                    ...this.buildProgressSummary(lessonIds, progressMap),
                };
            });
    }

    // ==========================================
    // TOMAR UN CURSO
    // ==========================================

    // Curso completo para el player. El quiz va SIN correctIndex ni explicación; las lecciones bloqueadas van sin contenido.
    async findMyCourse(companyId: number, sessionId: number, user: ActiveUserDto) {
        const { participacion, idTenant } = await this.getParticipation(companyId, sessionId, user);
        const sesion = participacion.CursoSesiones;
        const contenido = await this.getContent(sessionId, idTenant);
        const { disponible, motivo } = this.getAvailability(sesion);

        const base = {
            idSesion: sesion.idSesion,
            idParticipante: participacion.idParticipante,
            nombreCurso: sesion.CatCursos?.Descripcion || 'Sin Nombre',
            fechaInicioPeriodo: sesion.fechaInicioPeriodo,
            fechaFinPeriodo: sesion.fechaFinPeriodo,
            disponible: disponible && !!contenido,
            motivoNoDisponible: contenido ? motivo : 'El curso aún no tiene contenido.',
            calificacionAprobatoria: sesion.CatCursos?.calificacionAprobatoria ?? CALIFICACION_APROBATORIA_DEFAULT,
            estatusAsignacion: participacion.estatusAsignacion,
            calificacionFinal: this.toNumber(participacion.calificacionFinal),
        };

        if (!contenido) {
            return { ...base, modoAvance: null, leccionesCompletadas: 0, totalLecciones: 0, porcentajeAvance: 0, contenido: null };
        }

        const modo = contenido.modoAvance as ModoAvance;
        const progresos = await this.prismaService.cursoLeccionProgresos.findMany({
            where: { idParticipante: participacion.idParticipante, idTenant },
            select: { idLeccion: true, calificacionQuiz: true, fechaCompletado: true },
        });
        const progressMap = new Map(progresos.map((p) => [p.idLeccion, p]));
        const lessonIds = this.flattenLessons(contenido).map((l) => l.idLeccion);
        const bloqueadas = this.getLockedIds(lessonIds, progressMap, modo);
        const estructura = (contenido.estructuraIa ?? {}) as any;

        return {
            ...base,
            modoAvance: modo,
            ...this.buildProgressSummary(lessonIds, progressMap),
            contenido: {
                descripcion: estructura.description || '',
                audiencia: estructura.targetAudience || '',
                nivel: estructura.level || '',
                modulos: contenido.CursoModulos.map((modulo) => ({
                    idCursoModulo: modulo.idCursoModulo,
                    titulo: modulo.titulo,
                    objetivo: modulo.objetivo,
                    orden: modulo.orden,
                    lecciones: modulo.CursoLecciones.map((leccion) => {
                        const bloqueada = bloqueadas.has(leccion.idLeccion);
                        const quiz = this.asQuiz(leccion.quiz);
                        const progreso = progressMap.get(leccion.idLeccion);
                        return {
                            idLeccion: leccion.idLeccion,
                            titulo: leccion.titulo,
                            objetivo: leccion.objetivo,
                            orden: leccion.orden,
                            bloqueada,
                            totalPreguntas: quiz.length,
                            slides: bloqueada ? [] : this.asSlides(leccion.slides),
                            // Solo pregunta y opciones: la respuesta correcta se queda en el servidor
                            quiz: bloqueada ? [] : quiz.map((q) => ({ question: q.question, options: q.options })),
                            progreso: {
                                completada: !!progreso?.fechaCompletado,
                                calificacionQuiz: this.toNumber(progreso?.calificacionQuiz),
                                fechaCompletado: progreso?.fechaCompletado ?? null,
                            },
                        };
                    }),
                })),
            },
        };
    }

    // ==========================================
    // GUARDAR AVANCE DE UNA LECCIÓN
    // ==========================================

    // Califica el quiz en el servidor, guarda el avance (se conserva la mejor calificación) y, si ya terminó
    // todas las lecciones, cierra la participación con calificacionFinal y estatus completado / reprobado.
    async submitLessonProgress(
        companyId: number,
        sessionId: number,
        lessonId: number,
        dto: SubmitLessonProgressDto,
        user: ActiveUserDto,
    ) {
        const { participacion, idTenant } = await this.getParticipation(companyId, sessionId, user);
        const sesion = participacion.CursoSesiones;

        const { disponible, motivo } = this.getAvailability(sesion);
        if (!disponible) throw new BadRequestException(motivo);

        const contenido = await this.getContent(sessionId, idTenant);
        if (!contenido) throw new BadRequestException('El curso aún no tiene contenido.');

        const lecciones = this.flattenLessons(contenido);
        const posicion = lecciones.findIndex((l) => l.idLeccion === lessonId);
        if (posicion === -1) {
            throw new NotFoundException(`La lección #${lessonId} no pertenece a este curso.`);
        }
        const leccion = lecciones[posicion];
        const lessonIds = lecciones.map((l) => l.idLeccion);
        const modo = contenido.modoAvance as ModoAvance;
        const aprobatoria = sesion.CatCursos?.calificacionAprobatoria ?? CALIFICACION_APROBATORIA_DEFAULT;

        const progresos = await this.prismaService.cursoLeccionProgresos.findMany({
            where: { idParticipante: participacion.idParticipante, idTenant },
            select: { idProgreso: true, idLeccion: true, calificacionQuiz: true, fechaCompletado: true },
        });
        const progressMap = new Map(progresos.map((p) => [p.idLeccion, p]));

        if (this.getLockedIds(lessonIds, progressMap, modo).has(lessonId)) {
            throw new BadRequestException('Primero completa la lección anterior para desbloquear esta.');
        }

        // 1. Calificar el quiz (si la lección tiene)
        const quiz = this.asQuiz(leccion.quiz);
        const answers = dto.answers ?? [];
        let calificacion: number | null = null;
        let correctas: boolean[] = [];

        if (quiz.length > 0) {
            if (answers.length !== quiz.length) {
                throw new BadRequestException(`Debes responder las ${quiz.length} preguntas del quiz.`);
            }
            answers.forEach((respuesta, i) => {
                if (respuesta >= quiz[i].options.length) {
                    throw new BadRequestException(`La respuesta de la pregunta ${i + 1} no es una opción válida.`);
                }
            });
            correctas = quiz.map((q, i) => answers[i] === q.correctIndex);
            calificacion = this.round2((correctas.filter(Boolean).length / quiz.length) * 100);
        }

        const anterior = progressMap.get(lessonId);
        const calificacionAnterior = this.toNumber(anterior?.calificacionQuiz);
        const mejorCalificacion =
            calificacion == null ? null : Math.max(calificacion, calificacionAnterior ?? 0);
        const aprobada = calificacion == null || calificacion >= aprobatoria;
        const completada =
            !!anterior?.fechaCompletado ||
            calificacion == null ||
            !this.requiresPassing(modo) ||
            (mejorCalificacion ?? 0) >= aprobatoria;
        const ahora = new Date();

        // 2. Guardar el avance y recalcular la participación en una sola transacción
        const resultadoCurso = await this.prismaService.$transaction(async (tx) => {
            const guardado = await tx.cursoLeccionProgresos.upsert({
                where: {
                    idParticipante_idLeccion: { idParticipante: participacion.idParticipante, idLeccion: lessonId },
                },
                create: {
                    idTenant,
                    idParticipante: participacion.idParticipante,
                    idLeccion: lessonId,
                    calificacionQuiz: mejorCalificacion,
                    fechaCompletado: completada ? ahora : null,
                },
                update: {
                    calificacionQuiz: mejorCalificacion,
                    fechaCompletado: anterior?.fechaCompletado ?? (completada ? ahora : null),
                    actualizadoEn: ahora,
                },
                select: { idLeccion: true, calificacionQuiz: true, fechaCompletado: true },
            });
            progressMap.set(lessonId, { ...guardado, idProgreso: anterior?.idProgreso ?? 0 });

            const resumen = this.buildProgressSummary(lessonIds, progressMap);
            let estatusAsignacion = participacion.estatusAsignacion;
            let calificacionFinal = this.toNumber(participacion.calificacionFinal);
            let cambioEstatus = false;
            const terminado = resumen.leccionesCompletadas === resumen.totalLecciones && resumen.totalLecciones > 0;

            if (terminado) {
                // Promedio de la mejor calificación de cada lección con quiz (si ninguna tiene quiz, 100)
                const conQuiz = lecciones.filter((l) => this.asQuiz(l.quiz).length > 0);
                const suma = conQuiz.reduce((acc, l) => acc + (this.toNumber(progressMap.get(l.idLeccion)?.calificacionQuiz) ?? 0), 0);
                const nuevaFinal = conQuiz.length > 0 ? this.round2(suma / conQuiz.length) : 100;
                const nuevoEstatus = nuevaFinal >= aprobatoria ? 'completado' : 'reprobado';

                if (nuevaFinal !== calificacionFinal || nuevoEstatus !== estatusAsignacion) {
                    await tx.cursoParticipantes.update({
                        where: { idParticipante: participacion.idParticipante },
                        data: { calificacionFinal: nuevaFinal, estatusAsignacion: nuevoEstatus },
                    });

                    if (nuevoEstatus !== estatusAsignacion) {
                        await tx.historicoMovimientos.create({
                            data: {
                                idUsuario: user.id,
                                idEmpresa: companyId,
                                accion: 'UPDATE',
                                tablaOrigen: 'CursoParticipantes',
                                idRegistro: String(participacion.idParticipante),
                                descripcion: `${user.first_name} ${user.last_name} terminó el curso "${sesion.CatCursos?.Descripcion || ''}" (sesión #${sessionId}) con ${nuevaFinal}: ${nuevoEstatus}`,
                                fechaCreacion: ahora,
                            },
                        });
                    }
                    cambioEstatus = nuevoEstatus !== estatusAsignacion;
                    calificacionFinal = nuevaFinal;
                    estatusAsignacion = nuevoEstatus;
                }
            }

            return { ...resumen, terminado, estatusAsignacion, calificacionFinal, cambioEstatus };
        });

        const { cambioEstatus, ...curso } = resultadoCurso;
        if (cambioEstatus) {
            this.logger.log(`Participante #${participacion.idParticipante} terminó la sesión #${sessionId}: ${curso.estatusAsignacion}`);
        }

        const siguiente = lecciones[posicion + 1] ?? null;

        return {
            idLeccion: lessonId,
            calificacion,
            mejorCalificacion,
            calificacionAprobatoria: aprobatoria,
            aprobada,
            leccionCompletada: completada,
            // La respuesta correcta y la explicación solo se revelan si aprobó este intento (para no regalar el reintento)
            resultados: quiz.map((q, i) => ({
                correcta: correctas[i],
                ...(aprobada ? { correctIndex: q.correctIndex, explanation: q.explanation } : {}),
            })),
            siguienteLeccion: completada && siguiente ? { idLeccion: siguiente.idLeccion, titulo: siguiente.titulo } : null,
            curso,
        };
    }
}
