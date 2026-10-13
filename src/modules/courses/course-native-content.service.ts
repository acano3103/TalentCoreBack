import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { ActiveUserDto } from '../auth/dto/active-user.dto';
import { CourseContentService } from './course-content.service';
import { SaveNativeContentDto } from './dto/save-native-content.dto';
import { GeneratedCourse } from './interfaces/course-content.interface';

// Contenido "nativo": el admin arma a mano módulos, lecciones, texto, puntos clave y quiz.
// También sirve para corregir a mano un contenido generado con IA. Las slides se arman igual que con IA.
@Injectable()
export class CourseNativeContentService {
    private readonly logger = new Logger(CourseNativeContentService.name);

    constructor(
        private readonly prismaService: PrismaService,
        private readonly courseContentService: CourseContentService,
    ) { }

    private clean(value?: string | null) {
        return (value ?? '').trim();
    }

    // El correctIndex debe apuntar a una opción que exista; se avisa en qué pregunta está el error
    private validateQuiz(dto: SaveNativeContentDto) {
        dto.modulos.forEach((modulo, mi) =>
            modulo.lecciones.forEach((leccion, li) =>
                (leccion.quiz ?? []).forEach((q, qi) => {
                    if (q.correctIndex >= q.options.length) {
                        throw new BadRequestException(
                            `Módulo ${mi + 1}, lección ${li + 1}, pregunta ${qi + 1}: marca cuál es la respuesta correcta.`,
                        );
                    }
                }),
            ),
        );
    }

    async saveNative(companyId: number, sessionId: number, dto: SaveNativeContentDto, user: ActiveUserDto) {
        const idTenant = this.courseContentService.getTenantOrThrow(user);
        const session = await this.courseContentService.getAsyncSession(companyId, sessionId, idTenant);
        const nombreCurso = session.CatCursos?.Descripcion || 'Curso';

        this.validateQuiz(dto);

        const existing = await this.prismaService.cursoContenidos.findFirst({
            where: { idSesion: sessionId, idTenant },
        });

        if (existing?.tipoContenido === 'scorm') {
            throw new BadRequestException('La sesión tiene un paquete SCORM; no se puede editar como contenido nativo.');
        }

        if (existing) {
            // Reemplazar módulos borra lecciones; si ya hay avance se perdería el progreso de los participantes
            const avances = await this.prismaService.cursoLeccionProgresos.count({
                where: { idTenant, CursoLecciones: { CursoModulos: { idContenido: existing.idContenido } } },
            });
            if (avances > 0) {
                throw new BadRequestException(
                    'No es posible modificar el contenido porque ya hay participantes con avance en este curso.',
                );
            }
        }

        const anterior = (existing?.estructuraIa ?? {}) as Partial<GeneratedCourse>;
        const estructura: GeneratedCourse = {
            title: nombreCurso,
            description: this.clean(dto.descripcion),
            targetAudience: this.clean(dto.audiencia),
            level: anterior.level ?? '',
            modules: dto.modulos.map((m) => ({
                title: this.clean(m.titulo),
                objective: this.clean(m.objetivo),
                lessons: m.lecciones.map((l) => ({
                    title: this.clean(l.titulo),
                    objective: this.clean(l.objetivo),
                    content: this.clean(l.contenido),
                    keyPoints: (l.puntosClave ?? []).map((kp) => kp.trim()).filter(Boolean),
                    quiz: (l.quiz ?? []).map((q) => ({
                        question: this.clean(q.question),
                        options: q.options.map((o) => o.trim()),
                        correctIndex: q.correctIndex,
                        explanation: this.clean(q.explanation),
                    })),
                })),
            })),
        };
        const toJson = (v: unknown) => JSON.parse(JSON.stringify(v));

        const idContenido = await this.prismaService.$transaction(
            async (tx) => {
                const contenido = existing
                    ? await tx.cursoContenidos.update({
                        where: { idContenido: existing.idContenido },
                        data: { estructuraIa: toJson(estructura) },
                    })
                    : await tx.cursoContenidos.create({
                        data: {
                            idTenant,
                            idEmpresa: companyId,
                            idSesion: sessionId,
                            tipoContenido: 'nativo',
                            estatusVideo: 'no_aplica',
                            estructuraIa: toJson(estructura),
                        },
                    });

                if (existing) {
                    await tx.cursoModulos.deleteMany({ where: { idContenido: contenido.idContenido } });
                }

                for (let mi = 0; mi < estructura.modules.length; mi++) {
                    const mod = estructura.modules[mi];
                    await tx.cursoModulos.create({
                        data: {
                            idTenant,
                            idContenido: contenido.idContenido,
                            titulo: mod.title.slice(0, 255),
                            objetivo: mod.objective || null,
                            orden: mi,
                            CursoLecciones: {
                                create: mod.lessons.map((lesson, li) => ({
                                    idTenant,
                                    titulo: lesson.title.slice(0, 255),
                                    objetivo: lesson.objective || null,
                                    contenido: lesson.content,
                                    puntosClave: toJson(lesson.keyPoints),
                                    slides: toJson(this.courseContentService.buildSlides(lesson)),
                                    quiz: toJson(lesson.quiz),
                                    estatusVideo: 'no_aplica',
                                    orden: li,
                                })),
                            },
                        },
                    });
                }

                await tx.historicoMovimientos.create({
                    data: {
                        idUsuario: user.id,
                        idEmpresa: companyId,
                        accion: existing ? 'UPDATE' : 'CREATE',
                        tablaOrigen: 'CursoContenidos',
                        idRegistro: String(contenido.idContenido),
                        descripcion: `Contenido ${existing ? 'editado' : 'creado'} manualmente para la sesión #${sessionId} del curso "${nombreCurso}" por ${user.first_name} ${user.last_name}`,
                        fechaCreacion: new Date(),
                    },
                });

                return contenido.idContenido;
            },
            { timeout: 20000 },
        );

        this.logger.log(`Contenido #${idContenido} ${existing ? 'editado' : 'creado'} manualmente para la sesión #${sessionId}`);

        const totalLecciones = estructura.modules.reduce((acc, m) => acc + m.lessons.length, 0);
        const detalle = await this.courseContentService.findContent(companyId, sessionId, user);
        return {
            message: `Contenido guardado: ${estructura.modules.length} módulos y ${totalLecciones} lecciones`,
            ...detalle,
        };
    }
}
