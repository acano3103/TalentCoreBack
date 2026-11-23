import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    InternalServerErrorException,
    NotFoundException,
} from '@nestjs/common';
import { Prisma } from 'generated/prisma/client';
import {
    inicioDiaLocal,
    relojLocal,
    zonaValida,
} from 'src/modules/communications/reminders/zona-reloj';
import { ActiveUserDto } from 'src/modules/auth/dto/active-user.dto';
import { extraerClassId } from 'src/modules/courses/attendance/extraer-class-id';
import {
    ventanaAsistencia,
    VentanaAsistencia,
} from 'src/modules/courses/attendance/ventana-asistencia';
import { EncryptionService } from 'src/common/utils/encryption.util';
import { RegisterActivityDto } from 'src/modules/courses/learning/dto/register-activity.dto';
import { SubmitLessonProgressDto } from 'src/modules/courses/learning/dto/submit-lesson-progress.dto';
import { CourseLearningService } from 'src/modules/courses/learning/course-learning.service';
import { getVencimiento } from 'src/modules/courses/learning/vencimiento.util';
import { CommitScormDto } from 'src/modules/courses/scorm/dto/commit-scorm.dto';
import { CourseScormService } from 'src/modules/courses/scorm/course-scorm.service';
import { CareerPlanService } from 'src/modules/career-plan/career-plan.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { ClaseResumen, resumirClases, SesionParaClases } from './clase-resumen';
import { cursoNoAsignado, relanzarSiNoAsignado } from './curso-no-asignado';
import { CursoResumen, ModalidadCurso } from './curso-resumen';
import { FILTROS_CURSO, FiltroCursos } from './dto/filtro-cursos.query';
import { EstadoGamificacion } from './gamificacion/calcular';
import {
    aplicarNuevas,
    gamificacionPantalla,
    GamificacionService,
    respuestaAccion,
} from './gamificacion/gamificacion.service';
import { NIVELES, REGLAS_XP } from './gamificacion/reglas';

const CALIFICACION_APROBATORIA_DEFAULT = 70;
const ASISTENCIA_MINIMA_DEFAULT = 80;
const ZONA_DEFAULT = 'America/Mexico_City';

const incluyeCurso = (idEmpleado: number) => ({
    CursoSesiones: {
        include: {
            CatCursos: {
                select: {
                    idTenant: true,
                    Descripcion: true,
                    calificacionAprobatoria: true,
                },
            },
            CursoContenidos: {
                select: {
                    idTenant: true,
                    activo: true,
                    tipoContenido: true,
                    modoAvance: true,
                    CursoModulos: {
                        select: { CursoLecciones: { select: { idLeccion: true } } },
                    },
                },
            },
            Empleados: {
                select: { nombre: true, primerApellido: true, segundoApellido: true },
            },
            CursoFechasClase: {
                orderBy: { fechaHoraInicio: 'asc' as const },
                include: {
                    CursoAsistencias: {
                        where: { idEmpleado },
                        select: { fechaHoraRegistro: true, metodoRegistro: true },
                    },
                },
            },
        },
    },
    CursoLeccionProgresos: { select: { idLeccion: true, fechaCompletado: true } },
    CursoSeguimientoParticipante: {
        select: { fechaUltimaActividad: true, fechaConclusion: true },
    },
});

@Injectable()
export class MobileTrainingService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly learning: CourseLearningService,
        private readonly crypto: EncryptionService,
        private readonly gamificacion: GamificacionService,
        private readonly scorm: CourseScormService,
        private readonly careerPlan: CareerPlanService,
    ) {}

    async listar(
        companyId: number,
        user: ActiveUserDto,
        filtro: FiltroCursos = 'todos',
        ahora = new Date(),
    ): Promise<CursoResumen[]> {
        if (!FILTROS_CURSO.includes(filtro))
            throw new BadRequestException('El filtro no es válido.');
        const idTenant = this.tenant(user);
        const idEmpleado = await this.empleado(companyId, user, idTenant);
        const zona = await this.zonaDe(companyId);
        const filas = await this.cargarFilas(companyId, idEmpleado);

        return filas
            .map((fila) => this.aResumen(fila, idTenant, ahora, zona))
            .filter(
                (curso): curso is CursoResumen => !!curso && coincide(curso, filtro),
            )
            .sort(comparar);
    }

    async detalle(
        companyId: number,
        sessionId: number,
        user: ActiveUserDto,
        ahora = new Date(),
    ) {
        const idTenant = this.tenant(user);
        const idEmpleado = await this.empleado(companyId, user, idTenant);
        const zona = await this.zonaDe(companyId);
        const fila = await this.prisma.cursoParticipantes.findFirst({
            where: {
                idSesion: sessionId,
                idEmpleado,
                CursoSesiones: { idEmpresa: companyId, estatus: { not: 'cancelado' } },
            },
            include: incluyeCurso(idEmpleado),
        });
        const resumen = fila ? this.aResumen(fila, idTenant, ahora, zona) : null;
        if (!fila || !resumen) cursoNoAsignado();

        if (resumen.modalidad !== 'online_asincrono') {
            return {
                ...resumen,
                descripcion:
                    resumen.nombreCurso === 'Sin Nombre' ? null : resumen.nombreCurso,
                duracionEstimadaMin: null,
                contenido: null,
                clases: resumirClases(fila.CursoSesiones, ahora),
            };
        }

        const curso = await this.learning
            .findMyCourse(companyId, sessionId, user)
            .catch((error: unknown) => relanzarSiNoAsignado(error));
        const duracion = curso.contenido
            ? await this.duracion(sessionId, idTenant)
            : 0;
        const narrativa =
            typeof curso.contenido?.descripcion === 'string'
                ? curso.contenido.descripcion.trim()
                : '';
        return {
            ...curso,
            modalidad: 'online_asincrono' as const,
            descripcion:
                narrativa ||
                (resumen.nombreCurso === 'Sin Nombre' ? null : resumen.nombreCurso),
            duracionEstimadaMin: duracion,
            vencimiento: resumen.vencimiento,
            fechaInicioPeriodo: resumen.fechaInicioPeriodo,
            fechaFinPeriodo: resumen.fechaFinPeriodo,
            disponible: resumen.disponible,
            motivoNoDisponible: resumen.motivoNoDisponible,
            contenido: enriquecer(curso.contenido, companyId, sessionId),
        };
    }

    async guardarAvance(
        companyId: number,
        sessionId: number,
        lessonId: number,
        dto: SubmitLessonProgressDto,
        user: ActiveUserDto,
    ) {
        const idTenant = this.tenant(user);
        const idEmpleado = await this.empleado(companyId, user, idTenant);
        const antes = await this.gamificacion.calcular(companyId, idEmpleado);
        try {
            const resultado = await this.learning.submitLessonProgress(
                companyId,
                sessionId,
                lessonId,
                dto,
                user,
            );
            return await this.adjuntar(
                companyId,
                idEmpleado,
                idTenant,
                antes,
                resultado,
            );
        } catch (error) {
            relanzarSiNoAsignado(error);
        }
    }

    async commitScorm(
        companyId: number,
        sessionId: number,
        dto: CommitScormDto,
        user: ActiveUserDto,
    ) {
        const idTenant = this.tenant(user);
        const idEmpleado = await this.empleado(companyId, user, idTenant);
        const previo = await this.prisma.cursoParticipantes.findFirst({
            where: {
                idSesion: sessionId,
                idEmpleado,
                CursoSesiones: { idEmpresa: companyId },
            },
            select: { estatusAsignacion: true },
        });
        const antes = await this.gamificacion.calcular(companyId, idEmpleado);
        try {
            const resultado = await this.scorm.commit(
                companyId,
                sessionId,
                dto,
                user,
            );
            const estatus = resultado.guardado && resultado.curso
                ? resultado.curso.estatusAsignacion
                : previo?.estatusAsignacion;
            if (!resultado.guardado || estatus === previo?.estatusAsignacion)
                return resultado;
            return await this.adjuntar(
                companyId,
                idEmpleado,
                idTenant,
                antes,
                resultado,
            );
        } catch (error) {
            relanzarSiNoAsignado(error);
        }
    }

    async resumen(companyId: number, user: ActiveUserDto, ahora = new Date()) {
        const idTenant = this.tenant(user);
        const idEmpleado = await this.empleado(companyId, user, idTenant);
        const zona = await this.zonaDe(companyId);
        const filas = await this.cargarFilas(companyId, idEmpleado);
        const cursos = this.resumenes(filas, idTenant, ahora, zona);
        const panorama = await this.gamificacion.panorama(
            companyId,
            idEmpleado,
            ahora,
        );
        const nuevas = await this.gamificacion.sincronizarInsignias(
            companyId,
            idEmpleado,
            idTenant,
            panorama.estado,
            ahora,
        );
        const insignias = aplicarNuevas(panorama.estado.insignias, nuevas);
        const continuar = await this.continuar(cursos, filas, idTenant);
        const planCarrera = await this.careerPlan.resumenEmpleado(
            companyId,
            idEmpleado,
        );
        return {
            gamificacion: gamificacionPantalla(panorama.estado, insignias),
            conteos: conteosDe(cursos),
            porVencer:
                cursos.find(
                    (curso) =>
                        curso.vencimiento.estado === 'por_vencer' && curso.disponible,
                ) ?? null,
            continuar,
            proximaClase: proximaClase(filas, idTenant, ahora),
            horasAnio: panorama.horasAnio,
            planCarrera,
            cursosRecientes: cursos.slice(0, 3),
        };
    }

    async planCarrera(companyId: number, user: ActiveUserDto) {
        const idTenant = this.tenant(user);
        const idEmpleado = await this.empleado(companyId, user, idTenant);
        return this.careerPlan.findPlanesEmpleado(companyId, idEmpleado);
    }

    async logros(companyId: number, user: ActiveUserDto, ahora = new Date()) {
        const idTenant = this.tenant(user);
        const idEmpleado = await this.empleado(companyId, user, idTenant);
        const estado = await this.gamificacion.calcular(
            companyId,
            idEmpleado,
            ahora,
        );
        const nuevas = await this.gamificacion.sincronizarInsignias(
            companyId,
            idEmpleado,
            idTenant,
            estado,
            ahora,
        );
        const insignias = aplicarNuevas(estado.insignias, nuevas);
        return {
            xp: estado.xp,
            nivel: {
                numero: estado.nivel.numero,
                nombre: estado.nivel.nombre,
                xpDesde: estado.nivel.xpDesde,
                xpSiguiente: estado.nivel.xpSiguiente,
            },
            niveles: NIVELES.map((nivel) => ({
                numero: nivel.numero,
                nombre: nivel.nombre,
                xpDesde: nivel.xpDesde,
            })),
            racha: estado.racha,
            insignias,
            reglasXp: REGLAS_XP.map((regla) => ({
                concepto: regla.concepto,
                xp: regla.xp,
            })),
        };
    }

    async marcarVistos(
        companyId: number,
        user: ActiveUserDto,
        codigos: string[],
    ) {
        const idTenant = this.tenant(user);
        const idEmpleado = await this.empleado(companyId, user, idTenant);
        return this.gamificacion.marcarVistas(companyId, idEmpleado, codigos);
    }

    async estadisticas(companyId: number, user: ActiveUserDto, anio?: number) {
        const idTenant = this.tenant(user);
        const idEmpleado = await this.empleado(companyId, user, idTenant);
        return this.gamificacion.estadisticas(companyId, idEmpleado, anio);
    }

    async historial(
        companyId: number,
        user: ActiveUserDto,
        pagina = 1,
        porPagina = 20,
        ahora = new Date(),
    ) {
        const idTenant = this.tenant(user);
        const idEmpleado = await this.empleado(companyId, user, idTenant);
        const zona = await this.zonaDe(companyId);
        const filas = await this.cargarFilas(companyId, idEmpleado);
        const items = filas
            .map((fila) => {
                const resumen = this.aResumen(fila, idTenant, ahora, zona);
                if (!resumen) return null;
                const resultado = resultadoCerrado(resumen);
                if (!resultado) return null;
                return {
                    idSesion: resumen.idSesion,
                    nombreCurso: resumen.nombreCurso,
                    modalidad: resumen.modalidad,
                    tipoContenido: resumen.tipoContenido,
                    resultado,
                    calificacionFinal: resumen.calificacionFinal,
                    fecha: fechaCierre(fila, resultado, resumen),
                };
            })
            .filter((item): item is NonNullable<typeof item> => !!item)
            .sort(
                (a, b) =>
                    fechaMs(b.fecha) - fechaMs(a.fecha) || b.idSesion - a.idSesion,
            );
        const inicio = (pagina - 1) * porPagina;
        return {
            items: items.slice(inicio, inicio + porPagina),
            total: items.length,
        };
    }

    async listarClases(
        companyId: number,
        user: ActiveUserDto,
        desde?: string,
        hasta?: string,
        ahora = new Date(),
    ): Promise<ClaseResumen[]> {
        const idTenant = this.tenant(user);
        const idEmpleado = await this.empleado(companyId, user, idTenant);
        const zona = await this.zonaDe(companyId);
        const rango = rangoClases(desde, hasta, ahora, zona);
        const filas = await this.prisma.cursoParticipantes.findMany({
            where: {
                idEmpleado,
                CursoSesiones: {
                    idEmpresa: companyId,
                    modalidad: { in: ['presencial', 'online_sincrono'] },
                },
            },
            include: incluyeCurso(idEmpleado),
        });

        return filas
            .flatMap((fila) => {
                const sesion = fila.CursoSesiones;
                if (!sesion) return [];
                if (
                    sesion.CatCursos?.idTenant != null &&
                    sesion.CatCursos.idTenant !== idTenant
                )
                    return [];
                return resumirClases(sesion, ahora);
            })
            .filter((clase) => {
                const inicio = Date.parse(clase.fechaHoraInicio);
                return (
                    inicio >= rango.desde.getTime() && inicio <= rango.hasta.getTime()
                );
            })
            .sort((a, b) => {
                const diferencia =
                    Date.parse(a.fechaHoraInicio) - Date.parse(b.fechaHoraInicio);
                if (diferencia !== 0) return diferencia;
                return a.idFechaClase - b.idFechaClase;
            });
    }

    async registrarAsistenciaQr(
        companyId: number,
        codigo: string,
        ip: string | null,
        user: ActiveUserDto,
        ahora = new Date(),
    ) {
        const idTenant = this.tenant(user);
        const idEmpleado = await this.empleado(companyId, user, idTenant);
        const idFechaClase = idDeQr(this.crypto, codigo);
        if (idFechaClase == null) qrNoValido();

        const clase = await this.prisma.cursoFechasClase.findUnique({
            where: { idFechaClase },
            include: {
                CursoSesiones: {
                    include: {
                        CatCursos: { select: { idTenant: true, Descripcion: true } },
                        Empleados: {
                            select: {
                                nombre: true,
                                primerApellido: true,
                                segundoApellido: true,
                            },
                        },
                        CursoParticipantes: {
                            where: { idEmpleado },
                            select: { idEmpleado: true },
                            take: 1,
                        },
                        CursoFechasClase: {
                            orderBy: { fechaHoraInicio: 'asc' },
                            include: {
                                CursoAsistencias: {
                                    where: { idEmpleado },
                                    select: { fechaHoraRegistro: true, metodoRegistro: true },
                                },
                            },
                        },
                    },
                },
            },
        });

        const sesion = clase?.CursoSesiones;
        if (!clase || !sesion || sesion.idEmpresa !== companyId) qrNoValido();
        if (
            sesion.CatCursos?.idTenant != null &&
            sesion.CatCursos.idTenant !== idTenant
        )
            qrNoValido();
        if (clase.estatus === 'cancelada') claseCancelada();
        if (!sesion.CursoParticipantes.length) noInscrito();

        const ventana = ventanaAsistencia({
            fechaHoraInicio: clase.fechaHoraInicio,
            fechaHoraFin: clase.fechaHoraFin,
            minutosToleranciaQr: sesion.minutosToleranciaQr,
            ahora,
        });
        if (ventana.estado !== 'abierta') fueraDeVentana(ventana);

        const previa = asistenciaDe(sesion, idFechaClase);
        if (previa?.fechaHoraRegistro) {
            return respuestaAsistencia(
                sesion,
                idFechaClase,
                previa.fechaHoraRegistro,
                true,
                ahora,
            );
        }

        const antes = await this.gamificacion.calcular(companyId, idEmpleado);
        try {
            await this.prisma.cursoAsistencias.create({
                data: {
                    idFechaClase,
                    idEmpleado,
                    fechaHoraRegistro: ahora,
                    metodoRegistro: 'app_movil',
                    ipRegistro: ip || null,
                },
            });
        } catch (error) {
            if (!esDuplicado(error)) throw error;
            const ya = await this.prisma.cursoAsistencias.findUnique({
                where: { idFechaClase_idEmpleado: { idFechaClase, idEmpleado } },
                select: { fechaHoraRegistro: true },
            });
            return respuestaAsistencia(
                sesion,
                idFechaClase,
                ya?.fechaHoraRegistro ?? ahora,
                true,
                ahora,
            );
        }

        const respuesta = respuestaAsistencia(
            sesion,
            idFechaClase,
            ahora,
            false,
            ahora,
        );
        return this.adjuntar(companyId, idEmpleado, idTenant, antes, respuesta);
    }

    async registrarActividad(
        companyId: number,
        sessionId: number,
        dto: RegisterActivityDto,
        user: ActiveUserDto,
    ) {
        try {
            return await this.learning.registerActivity(
                companyId,
                sessionId,
                dto,
                user,
            );
        } catch (error) {
            relanzarSiNoAsignado(error);
        }
    }

    private tenant(user: ActiveUserDto): number {
        if (!user.idTenant)
            throw new InternalServerErrorException(
                'El usuario no tiene un tenant asignado.',
            );
        return user.idTenant;
    }

    private async empleado(
        companyId: number,
        user: ActiveUserDto,
        idTenant: number,
    ): Promise<number> {
        const authUser = await this.prisma.auth_user.findUnique({
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
        if (!idEmpleado)
            throw new NotFoundException(
                'El usuario no tiene un empleado asociado en esta empresa.',
            );
        return idEmpleado;
    }

    private async zonaDe(companyId: number): Promise<string> {
        const principal = await this.prisma.catSites.findFirst({
            where: { idEmpresa: companyId, EsPrincipal: true },
            select: { zonaHoraria: true },
        });
        if (principal?.zonaHoraria) return zonaValida(principal.zonaHoraria);
        const sitio = await this.prisma.catSites.findFirst({
            where: { idEmpresa: companyId },
            select: { zonaHoraria: true },
        });
        return zonaValida(sitio?.zonaHoraria || ZONA_DEFAULT);
    }

    private cargarFilas(companyId: number, idEmpleado: number) {
        return this.prisma.cursoParticipantes.findMany({
            where: {
                idEmpleado,
                CursoSesiones: { idEmpresa: companyId, estatus: { not: 'cancelado' } },
            },
            include: incluyeCurso(idEmpleado),
        });
    }

    private resumenes(
        filas: any[],
        idTenant: number,
        ahora: Date,
        zona: string,
    ): CursoResumen[] {
        return filas
            .map((fila) => this.aResumen(fila, idTenant, ahora, zona))
            .filter((curso): curso is CursoResumen => !!curso)
            .sort(comparar);
    }

    private async continuar(
        cursos: CursoResumen[],
        filas: any[],
        idTenant: number,
    ) {
        const elegido = cursos
            .filter(
                (curso) =>
                    curso.modalidad === 'online_asincrono' &&
                    curso.disponible &&
                    curso.estatusAsignacion !== 'completado' &&
                    curso.ultimaActividad,
            )
            .sort(
                (a, b) =>
                    fechaMs(b.ultimaActividad) - fechaMs(a.ultimaActividad) ||
                    a.idSesion - b.idSesion,
            )[0];
        if (!elegido) return null;
        const fila = filas.find(
            (item) => item.CursoSesiones?.idSesion === elegido.idSesion,
        );
        const leccionActual = fila
            ? await this.leccionActual(
                    elegido.idSesion,
                    idTenant,
                    fila.CursoLeccionProgresos ?? [],
                )
            : null;
        return { ...elegido, leccionActual };
    }

    private async leccionActual(
        idSesion: number,
        idTenant: number,
        progresos: Array<{ idLeccion: number; fechaCompletado: Date | null }>,
    ) {
        const contenido = await this.prisma.cursoContenidos.findFirst({
            where: { idSesion, idTenant, activo: true },
            select: {
                CursoModulos: {
                    orderBy: [{ orden: 'asc' }, { idCursoModulo: 'asc' }],
                    select: {
                        CursoLecciones: {
                            orderBy: [{ orden: 'asc' }, { idLeccion: 'asc' }],
                            select: { idLeccion: true, titulo: true },
                        },
                    },
                },
            },
        });
        if (!contenido) return null;
        const hechas = new Set(
            progresos
                .filter((progreso) => progreso.fechaCompletado)
                .map((progreso) => progreso.idLeccion),
        );
        let numeroModulo = 0;
        for (const modulo of contenido.CursoModulos) {
            numeroModulo += 1;
            let numeroLeccion = 0;
            for (const leccion of modulo.CursoLecciones) {
                numeroLeccion += 1;
                if (!hechas.has(leccion.idLeccion)) {
                    return {
                        idLeccion: leccion.idLeccion,
                        numero: `${numeroModulo}.${numeroLeccion}`,
                        titulo: leccion.titulo,
                    };
                }
            }
        }
        return null;
    }

    private async adjuntar<T extends object>(
        companyId: number,
        idEmpleado: number,
        idTenant: number,
        antes: EstadoGamificacion,
        resultado: T,
        ahora = new Date(),
    ) {
        const despues = await this.gamificacion.calcular(
            companyId,
            idEmpleado,
            ahora,
        );
        const insigniasNuevas = await this.gamificacion.sincronizarInsignias(
            companyId,
            idEmpleado,
            idTenant,
            despues,
            ahora,
        );
        return {
            ...resultado,
            gamificacion: respuestaAccion(
                antes.nivel.numero,
                antes.conteos,
                despues,
                insigniasNuevas,
            ),
        };
    }

    private async duracion(sessionId: number, idTenant: number): Promise<number> {
        const lecciones = await this.prisma.cursoLecciones.findMany({
            where: {
                idTenant,
                CursoModulos: {
                    CursoContenidos: { idSesion: sessionId, idTenant, activo: true },
                },
            },
            select: { slides: true, quiz: true },
        });
        const minutos = lecciones.reduce((acc, leccion) => {
            const slides = Array.isArray(leccion.slides) ? leccion.slides.length : 0;
            const preguntas = Array.isArray(leccion.quiz) ? leccion.quiz.length : 0;
            return acc + slides + preguntas * 0.5;
        }, 0);
        return Math.round(minutos);
    }

    private aResumen(
        fila: any,
        idTenant: number,
        ahora: Date,
        zona: string,
    ): CursoResumen | null {
        const sesion = fila.CursoSesiones;
        if (!sesion || sesion.estatus === 'cancelado') return null;
        if (
            sesion.CatCursos?.idTenant != null &&
            sesion.CatCursos.idTenant !== idTenant
        )
            return null;

        const modalidad = sesion.modalidad as ModalidadCurso;
        const asyncrono = modalidad === 'online_asincrono';
        const contenido = contenidoDelTenant(sesion.CursoContenidos, idTenant);
        const { disponible, motivo } = this.learning.getAvailability(
            {
                estatus: sesion.estatus,
                fechaInicioPeriodo: new Date(sesion.fechaInicioPeriodo),
                fechaFinPeriodo: sesion.fechaFinPeriodo
                    ? new Date(sesion.fechaFinPeriodo)
                    : null,
            },
            ahora,
        );

        const avance = asyncrono
            ? avanceLecciones(contenido, fila.CursoLeccionProgresos ?? [])
            : avanceClases(sesion.CursoFechasClase ?? []);
        const asistencias = (sesion.CursoFechasClase ?? []).flatMap(
            (clase: any) => clase.CursoAsistencias ?? [],
        );
        const calificacion = sesion.CatCursos?.calificacionAprobatoria;

        return {
            idSesion: sesion.idSesion,
            idParticipante: fila.idParticipante,
            nombreCurso: sesion.CatCursos?.Descripcion || 'Sin Nombre',
            modalidad,
            tipoContenido: asyncrono && contenido ? contenido.tipoContenido : null,
            modoAvance: asyncrono && contenido ? contenido.modoAvance : null,
            fechaInicioPeriodo: new Date(sesion.fechaInicioPeriodo).toISOString(),
            fechaFinPeriodo: sesion.fechaFinPeriodo
                ? new Date(sesion.fechaFinPeriodo).toISOString()
                : null,
            estatusSesion: sesion.estatus,
            disponible: asyncrono
                ? disponible && !!contenido
                : sesion.estatus !== 'finalizado',
            motivoNoDisponible: asyncrono
                ? contenido
                    ? motivo
                    : 'El curso aún no tiene contenido.'
                : sesion.estatus === 'finalizado'
                    ? 'La sesión ya finalizó.'
                    : null,
            estatusAsignacion: fila.estatusAsignacion ?? null,
            calificacionFinal:
                fila.calificacionFinal == null ? null : Number(fila.calificacionFinal),
            calificacionAprobatoria:
                calificacion == null
                    ? CALIFICACION_APROBATORIA_DEFAULT
                    : Number(calificacion),
            leccionesCompletadas: avance.leccionesCompletadas,
            totalLecciones: avance.totalLecciones,
            porcentajeAvance: avance.porcentajeAvance,
            vencimiento: getVencimiento(
                {
                    estatusAsignacion: fila.estatusAsignacion ?? null,
                    estatusSesion: sesion.estatus,
                    fechaFinPeriodo: sesion.fechaFinPeriodo ?? null,
                },
                ahora,
                zona,
            ),
            ultimaActividad: masReciente([
                fila.CursoSeguimientoParticipante?.fechaUltimaActividad,
                ...asistencias.map((asistencia: any) => asistencia.fechaHoraRegistro),
            ]),
            asistencia: asyncrono
                ? null
                : {
                        asistidas: avance.leccionesCompletadas,
                        total: avance.totalLecciones,
                        porcentajeMinimo: minimoAsistencia(
                            sesion.porcentajeAsistenciaMinimo,
                        ),
                    },
        };
    }
}

function contenidoDelTenant(contenido: any, idTenant: number) {
    if (!contenido || !contenido.activo || contenido.idTenant !== idTenant)
        return null;
    return contenido;
}

function avanceLecciones(
    contenido: any,
    progresos: Array<{ idLeccion: number; fechaCompletado: Date | null }>,
) {
    const ids: number[] = contenido
        ? contenido.CursoModulos.flatMap((modulo: any) =>
                modulo.CursoLecciones.map((leccion: any) => leccion.idLeccion),
            )
        : [];
    const hechas = new Set(
        progresos
            .filter((progreso) => progreso.fechaCompletado)
            .map((progreso) => progreso.idLeccion),
    );
    const completadas = ids.filter((id) => hechas.has(id)).length;
    return {
        leccionesCompletadas: completadas,
        totalLecciones: ids.length,
        porcentajeAvance:
            ids.length > 0 ? Math.round((completadas / ids.length) * 100) : 0,
    };
}

function avanceClases(clases: any[]) {
    const vigentes = clases.filter((clase) => clase.estatus !== 'cancelada');
    const asistidas = vigentes.filter(
        (clase) =>
            Array.isArray(clase.CursoAsistencias) &&
            clase.CursoAsistencias.length > 0,
    ).length;
    return {
        leccionesCompletadas: asistidas,
        totalLecciones: vigentes.length,
        porcentajeAvance:
            vigentes.length > 0 ? Math.round((asistidas / vigentes.length) * 100) : 0,
    };
}

function minimoAsistencia(valor: unknown): number {
    if (valor == null) return ASISTENCIA_MINIMA_DEFAULT;
    const numero = Number(valor);
    return Number.isFinite(numero) ? numero : ASISTENCIA_MINIMA_DEFAULT;
}

function masReciente(
    fechas: Array<Date | string | null | undefined>,
): string | null {
    let mejor: number | null = null;
    for (const fecha of fechas) {
        if (!fecha) continue;
        const tiempo = new Date(fecha).getTime();
        if (Number.isNaN(tiempo)) continue;
        if (mejor == null || tiempo > mejor) mejor = tiempo;
    }
    return mejor == null ? null : new Date(mejor).toISOString();
}

function conteosDe(cursos: CursoResumen[]) {
    return {
        pendientes: cursos.filter((curso) => coincide(curso, 'pendientes')).length,
        enProgreso: cursos.filter((curso) => coincide(curso, 'en_progreso')).length,
        porVencer: cursos.filter((curso) => coincide(curso, 'por_vencer')).length,
        completados: cursos.filter((curso) => coincide(curso, 'completados'))
            .length,
        noRealizados: cursos.filter((curso) => coincide(curso, 'no_realizados'))
            .length,
    };
}

function proximaClase(
    filas: any[],
    idTenant: number,
    ahora: Date,
): ClaseResumen | null {
    let mejor: { inicio: number; clase: ClaseResumen } | null = null;
    for (const fila of filas) {
        const sesion = fila.CursoSesiones;
        if (!sesion || sesion.estatus === 'cancelado') continue;
        if (
            sesion.CatCursos?.idTenant != null &&
            sesion.CatCursos.idTenant !== idTenant
        )
            continue;
        for (const clase of resumirClases(sesion, ahora)) {
            if (clase.estatus === 'cancelada' || clase.estatus === 'completada')
                continue;
            if (Date.parse(clase.fechaHoraFin) <= ahora.getTime()) continue;
            const inicio = Date.parse(clase.fechaHoraInicio);
            if (
                !mejor ||
                inicio < mejor.inicio ||
                (inicio === mejor.inicio &&
                    clase.idFechaClase < mejor.clase.idFechaClase)
            ) {
                mejor = { inicio, clase };
            }
        }
    }
    return mejor?.clase ?? null;
}

function resultadoCerrado(
    curso: CursoResumen,
): 'aprobado' | 'no_aprobado' | 'no_realizado' | null {
    if (curso.estatusAsignacion === 'completado') return 'aprobado';
    if (curso.estatusAsignacion === 'reprobado') return 'no_aprobado';
    if (curso.estatusAsignacion === 'no_asistio') return 'no_realizado';
    if (curso.vencimiento.estado === 'vencido') return 'no_realizado';
    return null;
}

function fechaCierre(
    fila: any,
    resultado: 'aprobado' | 'no_aprobado' | 'no_realizado',
    resumen: CursoResumen,
): string {
    const conclusion = fila.CursoSeguimientoParticipante?.fechaConclusion;
    if (resultado !== 'no_realizado' && conclusion)
        return new Date(conclusion).toISOString();
    return (
        resumen.fechaFinPeriodo ??
        resumen.ultimaActividad ??
        resumen.fechaInicioPeriodo
    );
}

function esPendiente(curso: CursoResumen): boolean {
    return (
        curso.estatusAsignacion !== 'completado' &&
        curso.vencimiento.estado !== 'vencido'
    );
}

function coincide(curso: CursoResumen, filtro: FiltroCursos): boolean {
    switch (filtro) {
        case 'todos':
            return true;
        case 'pendientes':
            return esPendiente(curso);
        case 'en_progreso':
            return esPendiente(curso) && curso.porcentajeAvance > 0;
        case 'por_vencer':
            return curso.vencimiento.estado === 'por_vencer' && curso.disponible;
        case 'completados':
            return curso.estatusAsignacion === 'completado';
        case 'no_realizados':
            return (
                curso.vencimiento.estado === 'vencido' &&
                curso.estatusAsignacion !== 'reprobado'
            );
        default:
            return true;
    }
}

// 0 por vencer, 1 en progreso, 2 pendientes, 3 completados, 4 no realizados, 5 reprobado ya vencido
function grupo(curso: CursoResumen): number {
    if (curso.vencimiento.estado === 'por_vencer') return 0;
    if (curso.estatusAsignacion === 'completado') return 3;
    if (curso.vencimiento.estado === 'vencido')
        return curso.estatusAsignacion === 'reprobado' ? 5 : 4;
    if (curso.porcentajeAvance > 0) return 1;
    return 2;
}

function comparar(a: CursoResumen, b: CursoResumen): number {
    const diferencia = grupo(a) - grupo(b);
    if (diferencia !== 0) return diferencia;
    if (grupo(a) === 0) {
        const dias = (a.vencimiento.dias ?? 999) - (b.vencimiento.dias ?? 999);
        if (dias !== 0) return dias;
    }
    const actividad = compararActividad(a, b);
    if (actividad !== 0) return actividad;
    return a.idSesion - b.idSesion;
}

function compararActividad(a: CursoResumen, b: CursoResumen): number {
    const recienteA = fechaMs(a.ultimaActividad);
    const recienteB = fechaMs(b.ultimaActividad);
    if (recienteA === recienteB) return 0;
    return recienteB - recienteA;
}

function fechaMs(valor: string | null): number {
    if (!valor) return Number.NEGATIVE_INFINITY;
    const tiempo = Date.parse(valor);
    return Number.isNaN(tiempo) ? Number.NEGATIVE_INFINITY : tiempo;
}

function idDeQr(
    crypto: { decrypt(texto: string): string },
    codigo: string,
): number | null {
    const token = extraerClassId(codigo);
    if (!token) return null;
    try {
        const plano = crypto.decrypt(token);
        if (!/^\d+$/.test(plano)) return null;
        return Number(plano);
    } catch {
        return null;
    }
}

function asistenciaDe(
    sesion: {
        CursoFechasClase?: Array<{
            idFechaClase: number;
            CursoAsistencias?: Array<{ fechaHoraRegistro?: Date | string | null }>;
        }>;
    },
    idFechaClase: number,
) {
    return sesion.CursoFechasClase?.find(
        (clase) => clase.idFechaClase === idFechaClase,
    )?.CursoAsistencias?.[0];
}

function respuestaAsistencia(
    sesion: SesionParaClases,
    idFechaClase: number,
    fecha: Date | string,
    duplicada: boolean,
    ahora: Date,
) {
    const clases = (sesion.CursoFechasClase ?? []).map((clase) => {
        if (clase.idFechaClase !== idFechaClase || clase.CursoAsistencias?.length)
            return clase;
        return {
            ...clase,
            CursoAsistencias: [
                { fechaHoraRegistro: fecha, metodoRegistro: 'app_movil' },
            ],
        };
    });
    const resumenes = resumirClases(
        { ...sesion, CursoFechasClase: clases },
        ahora,
    );
    const actual = resumenes.find((clase) => clase.idFechaClase === idFechaClase);
    const vigentes = resumenes.filter((clase) => clase.estatus !== 'cancelada');
    const asistidas = vigentes.filter(
        (clase) => clase.asistencia.registrada,
    ).length;
    const total = vigentes.length;
    return {
        registrada: true,
        duplicada,
        idFechaClase,
        idSesion: sesion.idSesion,
        nombreCurso: actual?.nombreCurso || 'Sin Nombre',
        numeroClase: actual?.numero ?? 0,
        totalClases: actual?.totalClases ?? total,
        fechaHoraRegistro: new Date(fecha).toISOString(),
        asistencia: {
            asistidas,
            total,
            porcentaje: total > 0 ? Math.round((asistidas / total) * 100) : 0,
        },
    };
}

function rangoClases(
    desde: string | undefined,
    hasta: string | undefined,
    ahora: Date,
    zona: string,
) {
    const defecto = rangoPorDefecto(ahora, zona);
    const inicio = desde
        ? parsearInstante(desde, 'La fecha desde no es válida.')
        : defecto.desde;
    const fin = hasta
        ? parsearInstante(hasta, 'La fecha hasta no es válida.')
        : defecto.hasta;
    if (inicio.getTime() > fin.getTime()) {
        throw new BadRequestException(
            'La fecha inicial no puede ser posterior a la final.',
        );
    }
    return { desde: inicio, hasta: fin };
}

function rangoPorDefecto(ahora: Date, zona: string) {
    const hoy = relojLocal(ahora, zona).fecha;
    const desde = inicioDiaLocal(sumarDiasCalendario(hoy, -30), zona);
    const siguiente = inicioDiaLocal(sumarDiasCalendario(hoy, 61), zona);
    return { desde, hasta: new Date(siguiente.getTime() - 1) };
}

function sumarDiasCalendario(fecha: string, dias: number): string {
    const [anio, mes, dia] = fecha.split('-').map(Number);
    const utc = new Date(Date.UTC(anio, mes - 1, dia));
    utc.setUTCDate(utc.getUTCDate() + dias);
    const y = utc.getUTCFullYear();
    const m = String(utc.getUTCMonth() + 1).padStart(2, '0');
    const d = String(utc.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function parsearInstante(valor: string, mensaje: string): Date {
    const fecha = new Date(valor);
    if (Number.isNaN(fecha.getTime())) throw new BadRequestException(mensaje);
    return fecha;
}

function qrNoValido(): never {
    throw new NotFoundException({
        code: 'QR_NO_VALIDO',
        message: 'Este código no corresponde a una clase de Talent Core.',
    });
}

function claseCancelada(): never {
    throw new ConflictException({
        code: 'CLASE_CANCELADA',
        message: 'Esta clase fue cancelada.',
    });
}

function noInscrito(): never {
    throw new ForbiddenException({
        code: 'NO_INSCRITO',
        message: 'No estás inscrito en este curso. Avisa a tu instructor.',
    });
}

function fueraDeVentana(ventana: VentanaAsistencia): never {
    throw new ConflictException({
        code: 'FUERA_DE_VENTANA',
        message: ventana.mensaje,
        ventana: {
            estado: ventana.estado,
            desde: ventana.desde.toISOString(),
            hasta: ventana.hasta.toISOString(),
        },
    });
}

function esDuplicado(error: unknown): boolean {
    return (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
    );
}

function enriquecer(contenido: any, companyId: number, sessionId: number) {
    if (!contenido) return null;
    return {
        ...contenido,
        modulos: (contenido.modulos ?? []).map(
            (modulo: any, indiceModulo: number) => ({
                ...modulo,
                lecciones: (modulo.lecciones ?? []).map(
                    (leccion: any, indiceLeccion: number) => ({
                        ...leccion,
                        numero: `${indiceModulo + 1}.${indiceLeccion + 1}`,
                        materiales: Array.isArray(leccion.materiales)
                            ? leccion.materiales
                            : [],
                        quiz: Array.isArray(leccion.quiz)
                            ? leccion.quiz.map((pregunta: any) => ({
                                    question: pregunta.question,
                                    options: pregunta.options,
                                }))
                            : [],
                        urlVideo: urlVideoMovil(
                            leccion.urlVideo ?? null,
                            companyId,
                            sessionId,
                        ),
                        requiereVideo: leccion.requiereVideo === true,
                    }),
                ),
            }),
        ),
    };
}

// El player web entrega la ruta de materiales de my-courses. La app usa la suya, con el mismo archivo.
function urlVideoMovil(
    url: string | null,
    companyId: number,
    sessionId: number,
): string | null {
    if (!url) return null;
    const marca = `/my-courses/${sessionId}/materials/`;
    const indice = url.indexOf(marca);
    if (indice === -1) return url;
    const archivo = url.slice(indice + marca.length);
    return `mobile/companies/${companyId}/training/courses/${sessionId}/materials/${archivo}`;
}
