import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { ActiveUserDto } from '../auth/dto/active-user.dto';

// Cliente de Prisma dentro de una transacción (mismo tipo que recibe el callback de $transaction)
type TxClient = Parameters<Parameters<PrismaService['$transaction']>[0]>[0];
type Db = PrismaService | TxClient;

type TipoEvento =
    | 'inicio_curso'
    | 'retomo_curso'
    | 'abrir_leccion'
    | 'repaso_leccion'
    | 'intento_quiz'
    | 'completar_leccion'
    | 'fin_curso';

// Reglas de seguimiento (en un solo lugar para ajustarlas si lo piden)
const SEGUNDOS_MAX_POR_LATIDO = 90; // el player avisa cada 60 s; huecos mayores no se cuentan como tiempo activo
const MINUTOS_NUEVA_SESION = 30; // más de 30 min sin actividad = nuevo bloque de estudio
const DIAS_ABANDONO = 3; // 3 días o más sin actividad = lo dejó; al volver, "retomó"
const CALIFICACION_APROBATORIA_DEFAULT = 70;

interface Participante {
    idTenant: number;
    idParticipante: number;
}

// Seguimiento del empleado para reportería: intentos de quiz, bitácora de eventos y resumen por participante.
@Injectable()
export class CourseTrackingService {
    constructor(private readonly prismaService: PrismaService) { }

    private round2(value: number) {
        return Math.round(value * 100) / 100;
    }

    private toNumber(value: unknown): number | null {
        return value == null ? null : Number(value);
    }

    async logEvent(db: Db, p: Participante, tipoEvento: TipoEvento, fecha: Date, idLeccion?: number | null, detalle?: object) {
        await db.cursoBitacoraActividad.create({
            data: {
                idTenant: p.idTenant,
                idParticipante: p.idParticipante,
                idLeccion: idLeccion ?? null,
                tipoEvento,
                detalle: detalle ? JSON.parse(JSON.stringify(detalle)) : undefined,
                fechaEvento: fecha,
            },
        });
    }

    // Registra que el empleado está activo: suma tiempo, detecta nuevos bloques de estudio y si retomó tras dejarlo
    async touchActivity(db: Db, p: Participante, ahora: Date) {
        const seguimiento = await db.cursoSeguimientoParticipante.findUnique({
            where: { idParticipante: p.idParticipante },
        });

        if (!seguimiento || !seguimiento.fechaUltimaActividad) {
            await db.cursoSeguimientoParticipante.upsert({
                where: { idParticipante: p.idParticipante },
                create: {
                    idTenant: p.idTenant,
                    idParticipante: p.idParticipante,
                    fechaPrimerAcceso: ahora,
                    fechaUltimaActividad: ahora,
                    totalSesionesEstudio: 1,
                },
                update: { fechaPrimerAcceso: ahora, fechaUltimaActividad: ahora, totalSesionesEstudio: 1 },
            });
            await this.logEvent(db, p, 'inicio_curso', ahora);
            return;
        }

        const huecoSegundos = Math.max(0, (ahora.getTime() - seguimiento.fechaUltimaActividad.getTime()) / 1000);
        const data: Record<string, unknown> = { fechaUltimaActividad: ahora, actualizadoEn: ahora };

        if (huecoSegundos <= SEGUNDOS_MAX_POR_LATIDO) {
            data.tiempoTotalSegundos = { increment: Math.round(huecoSegundos) };
        }
        if (huecoSegundos > MINUTOS_NUEVA_SESION * 60) {
            data.totalSesionesEstudio = { increment: 1 };
        }
        const diasInactivo = huecoSegundos / 86400;
        if (diasInactivo >= DIAS_ABANDONO) {
            data.vecesRetomado = { increment: 1 };
            await this.logEvent(db, p, 'retomo_curso', ahora, null, {
                ultimaActividad: seguimiento.fechaUltimaActividad,
                diasInactivo: Math.floor(diasInactivo),
            });
        }

        await db.cursoSeguimientoParticipante.update({ where: { idParticipante: p.idParticipante }, data });
    }

    // Abrir una lección: si ya estaba completada cuenta como repaso
    async registerLessonOpen(db: Db, p: Participante, idLeccion: number, yaCompletada: boolean, ahora: Date) {
        await this.touchActivity(db, p, ahora);
        await this.logEvent(db, p, yaCompletada ? 'repaso_leccion' : 'abrir_leccion', ahora, idLeccion);
        if (yaCompletada) {
            await db.cursoSeguimientoParticipante.update({
                where: { idParticipante: p.idParticipante },
                data: { totalRepasos: { increment: 1 } },
            });
        }
    }

    // Guarda un intento de quiz y actualiza contadores (reprobados, mejoras, promedio del primer intento)
    async recordQuizAttempt(
        db: Db,
        p: Participante,
        params: {
            idLeccion: number;
            calificacion: number;
            aprobado: boolean;
            // Índices elegidos (quiz nativo / IA) o preguntas reportadas por un paquete SCORM
            respuestas: unknown[];
            totalPreguntas: number;
            respuestasCorrectas: number;
            yaAprobadaAntes: boolean;
            ahora: Date;
        },
    ) {
        const previos = await db.cursoIntentosQuiz.count({
            where: { idParticipante: p.idParticipante, idLeccion: params.idLeccion },
        });
        const numeroIntento = previos + 1;
        const tipoIntento = previos === 0 ? 'primero' : params.yaAprobadaAntes ? 'mejora' : 'reintento';

        await db.cursoIntentosQuiz.create({
            data: {
                idTenant: p.idTenant,
                idParticipante: p.idParticipante,
                idLeccion: params.idLeccion,
                numeroIntento,
                calificacion: params.calificacion,
                aprobado: params.aprobado,
                totalPreguntas: params.totalPreguntas,
                respuestasCorrectas: params.respuestasCorrectas,
                respuestas: JSON.parse(JSON.stringify(params.respuestas)),
                tipoIntento,
                fechaIntento: params.ahora,
            },
        });

        await this.logEvent(db, p, 'intento_quiz', params.ahora, params.idLeccion, {
            numeroIntento,
            tipoIntento,
            calificacion: params.calificacion,
            aprobado: params.aprobado,
        });

        const primeros = await db.cursoIntentosQuiz.aggregate({
            where: { idParticipante: p.idParticipante, numeroIntento: 1 },
            _avg: { calificacion: true },
        });

        await db.cursoSeguimientoParticipante.update({
            where: { idParticipante: p.idParticipante },
            data: {
                totalIntentosQuiz: { increment: 1 },
                totalQuizReprobados: { increment: params.aprobado ? 0 : 1 },
                totalIntentosMejora: { increment: tipoIntento === 'mejora' ? 1 : 0 },
                calificacionPrimerIntento: this.toNumber(primeros._avg.calificacion),
            },
        });

        return { numeroIntento, tipoIntento };
    }

    // Marca la conclusión del curso (solo la primera vez que termina todas las lecciones)
    async registerCourseEnd(db: Db, p: Participante, ahora: Date, detalle: object) {
        const seguimiento = await db.cursoSeguimientoParticipante.findUnique({
            where: { idParticipante: p.idParticipante },
            select: { fechaConclusion: true },
        });
        if (seguimiento?.fechaConclusion) return;

        await db.cursoSeguimientoParticipante.update({
            where: { idParticipante: p.idParticipante },
            data: { fechaConclusion: ahora },
        });
        await this.logEvent(db, p, 'fin_curso', ahora, null, detalle);
    }

    // ==========================================
    // REPORTE PARA ADMINISTRACIÓN
    // ==========================================

    private getTenantOrThrow(user: ActiveUserDto): number {
        if (!user.idTenant) {
            throw new InternalServerErrorException('El usuario no tiene un tenant asignado.');
        }
        return user.idTenant;
    }

    private async getSession(companyId: number, sessionId: number, idTenant: number) {
        const session = await this.prismaService.cursoSesiones.findFirst({
            where: { idSesion: sessionId, idEmpresa: companyId },
            include: {
                CatCursos: { select: { idTenant: true, Descripcion: true, calificacionAprobatoria: true } },
                CursoContenidos: {
                    select: {
                        idTenant: true,
                        CursoModulos: { select: { CursoLecciones: { select: { idLeccion: true, titulo: true, quiz: true } } } },
                    },
                },
            },
        });

        const otroTenant = session?.CatCursos?.idTenant != null && session.CatCursos.idTenant !== idTenant;
        if (!session || otroTenant) {
            throw new NotFoundException(`La sesión #${sessionId} no fue encontrada o no pertenece a la empresa actual.`);
        }
        return session;
    }

    // Seguimiento de todos los participantes de una sesión, con resumen general
    async getSessionTracking(companyId: number, sessionId: number, user: ActiveUserDto) {
        const idTenant = this.getTenantOrThrow(user);
        const session = await this.getSession(companyId, sessionId, idTenant);
        const contenido = session.CursoContenidos?.idTenant === idTenant ? session.CursoContenidos : null;
        const lessonIds = contenido ? contenido.CursoModulos.flatMap((m) => m.CursoLecciones.map((l) => l.idLeccion)) : [];
        const aprobatoria = session.CatCursos?.calificacionAprobatoria ?? CALIFICACION_APROBATORIA_DEFAULT;
        const ahora = new Date();

        const participantes = await this.prismaService.cursoParticipantes.findMany({
            where: { idSesion: sessionId },
            include: {
                Empleados: { select: { idEmpleado: true, numeroEmpleado: true, nombre: true, primerApellido: true, segundoApellido: true } },
                CursoSeguimientoParticipante: true,
                CursoLeccionProgresos: { select: { idLeccion: true, fechaCompletado: true } },
            },
            orderBy: { idParticipante: 'asc' },
        });

        const filas = participantes.map((p) => {
            const s = p.CursoSeguimientoParticipante;
            const completadas = p.CursoLeccionProgresos.filter((pr) => pr.fechaCompletado && lessonIds.includes(pr.idLeccion)).length;
            const diasSinActividad =
                s?.fechaUltimaActividad && !s.fechaConclusion
                    ? Math.floor((ahora.getTime() - s.fechaUltimaActividad.getTime()) / 86400000)
                    : null;
            const estado = !s?.fechaPrimerAcceso
                ? 'sin_iniciar'
                : s.fechaConclusion
                    ? 'concluido'
                    : (diasSinActividad ?? 0) >= DIAS_ABANDONO
                        ? 'inactivo'
                        : 'en_progreso';
            const e = p.Empleados;

            return {
                idParticipante: p.idParticipante,
                idEmpleado: p.idEmpleado,
                numeroEmpleado: e?.numeroEmpleado ?? null,
                nombreEmpleado: [e?.nombre, e?.primerApellido, e?.segundoApellido].filter(Boolean).join(' '),
                estado,
                estatusAsignacion: p.estatusAsignacion,
                calificacionFinal: this.toNumber(p.calificacionFinal),
                calificacionPrimerIntento: this.toNumber(s?.calificacionPrimerIntento),
                fechaAsignacion: p.creadoEn,
                fechaInicio: s?.fechaPrimerAcceso ?? null,
                fechaUltimaActividad: s?.fechaUltimaActividad ?? null,
                fechaConclusion: s?.fechaConclusion ?? null,
                diasSinActividad,
                diasParaConcluir:
                    s?.fechaPrimerAcceso && s.fechaConclusion
                        ? this.round2((s.fechaConclusion.getTime() - s.fechaPrimerAcceso.getTime()) / 86400000)
                        : null,
                tiempoTotalMinutos: s ? this.round2(s.tiempoTotalSegundos / 60) : 0,
                totalSesionesEstudio: s?.totalSesionesEstudio ?? 0,
                vecesRetomado: s?.vecesRetomado ?? 0,
                totalRepasos: s?.totalRepasos ?? 0,
                totalIntentosQuiz: s?.totalIntentosQuiz ?? 0,
                totalQuizReprobados: s?.totalQuizReprobados ?? 0,
                totalIntentosMejora: s?.totalIntentosMejora ?? 0,
                leccionesCompletadas: completadas,
                totalLecciones: lessonIds.length,
                porcentajeAvance: lessonIds.length ? Math.round((completadas / lessonIds.length) * 100) : 0,
            };
        });

        const promedio = (vals: (number | null)[]) => {
            const v = vals.filter((x): x is number => x != null);
            return v.length ? this.round2(v.reduce((a, b) => a + b, 0) / v.length) : null;
        };
        const iniciaron = filas.filter((f) => f.estado !== 'sin_iniciar');

        return {
            idSesion: session.idSesion,
            nombreCurso: session.CatCursos?.Descripcion || 'Sin Nombre',
            calificacionAprobatoria: aprobatoria,
            totalLecciones: lessonIds.length,
            resumen: {
                inscritos: filas.length,
                sinIniciar: filas.filter((f) => f.estado === 'sin_iniciar').length,
                enProgreso: filas.filter((f) => f.estado === 'en_progreso').length,
                inactivos: filas.filter((f) => f.estado === 'inactivo').length,
                concluidos: filas.filter((f) => f.estado === 'concluido').length,
                aprobados: filas.filter((f) => f.estatusAsignacion === 'completado').length,
                reprobados: filas.filter((f) => f.estatusAsignacion === 'reprobado').length,
                promedioCalificacionFinal: promedio(filas.map((f) => f.calificacionFinal)),
                promedioPrimerIntento: promedio(filas.map((f) => f.calificacionPrimerIntento)),
                tiempoPromedioMinutos: promedio(iniciaron.map((f) => f.tiempoTotalMinutos)),
            },
            participantes: filas,
        };
    }

    // Detalle de un participante: todos sus intentos y su bitácora de actividad
    async getParticipantTracking(companyId: number, sessionId: number, idParticipante: number, user: ActiveUserDto) {
        const idTenant = this.getTenantOrThrow(user);
        const session = await this.getSession(companyId, sessionId, idTenant);
        const titulos = new Map(
            (session.CursoContenidos?.CursoModulos ?? []).flatMap((m) => m.CursoLecciones.map((l) => [l.idLeccion, l.titulo] as const)),
        );

        const participante = await this.prismaService.cursoParticipantes.findFirst({
            where: { idParticipante, idSesion: sessionId },
            include: {
                CursoSeguimientoParticipante: true,
                CursoIntentosQuiz: { where: { idTenant }, orderBy: { fechaIntento: 'asc' } },
                CursoBitacoraActividad: { where: { idTenant }, orderBy: { fechaEvento: 'asc' } },
            },
        });
        if (!participante) {
            throw new NotFoundException(`El participante #${idParticipante} no pertenece a la sesión #${sessionId}.`);
        }

        return {
            idParticipante,
            idEmpleado: participante.idEmpleado,
            estatusAsignacion: participante.estatusAsignacion,
            calificacionFinal: this.toNumber(participante.calificacionFinal),
            seguimiento: participante.CursoSeguimientoParticipante,
            intentos: participante.CursoIntentosQuiz.map((i) => ({
                idIntento: i.idIntento,
                idLeccion: i.idLeccion,
                leccion: titulos.get(i.idLeccion) ?? null,
                numeroIntento: i.numeroIntento,
                tipoIntento: i.tipoIntento,
                calificacion: this.toNumber(i.calificacion),
                aprobado: i.aprobado,
                respuestasCorrectas: i.respuestasCorrectas,
                totalPreguntas: i.totalPreguntas,
                fechaIntento: i.fechaIntento,
            })),
            bitacora: participante.CursoBitacoraActividad.map((b) => ({
                idActividad: Number(b.idActividad),
                tipoEvento: b.tipoEvento,
                idLeccion: b.idLeccion,
                leccion: b.idLeccion ? titulos.get(b.idLeccion) ?? null : null,
                detalle: b.detalle,
                fechaEvento: b.fechaEvento,
            })),
        };
    }
}
