import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from 'generated/prisma/client';
import { localDateString } from 'src/modules/attendance/utils/timezone.util';
import { zonaValida } from 'src/modules/communications/reminders/zona-reloj';
import { CareerPlanService } from 'src/modules/career-plan/career-plan.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { INSIGNIAS } from './reglas';
import {
    aplicarNuevas,
    ConteosXp,
    diferenciaXp,
    EstadoGamificacion,
    estadisticasDe,
    EstadisticasAnio,
    evaluar,
    FuentesGamificacion,
    fuentesVacias,
    Insignia,
} from './calcular';

const ZONA_DEFAULT = 'America/Mexico_City';

@Injectable()
export class GamificacionService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly careerPlan: CareerPlanService,
    ) {}

    async calcular(
        idEmpresa: number,
        idEmpleado: number,
        ahora = new Date(),
    ): Promise<EstadoGamificacion> {
        return (await this.panorama(idEmpresa, idEmpleado, ahora)).estado;
    }

    async panorama(idEmpresa: number, idEmpleado: number, ahora = new Date()) {
        const fuentes = await this.cargar(idEmpresa, idEmpleado, ahora);
        const estado = evaluar(fuentes);
        const anio = Number(localDateString(ahora, fuentes.zona).slice(0, 4));
        return {
            estado,
            horasAnio: estadisticasDe(fuentes, anio).horas,
            anio,
            fuentes,
        };
    }

    async estadisticas(
        idEmpresa: number,
        idEmpleado: number,
        anio: number | undefined,
        ahora = new Date(),
    ): Promise<EstadisticasAnio> {
        const fuentes = await this.cargar(idEmpresa, idEmpleado, ahora);
        const elegido =
            anio ?? Number(localDateString(ahora, fuentes.zona).slice(0, 4));
        if (!Number.isInteger(elegido) || elegido < 2000 || elegido > 2100) {
            throw new BadRequestException('El año no es válido.');
        }
        return estadisticasDe(fuentes, elegido);
    }

    async sincronizarInsignias(
        idEmpresa: number,
        idEmpleado: number,
        idTenant: number,
        estado: EstadoGamificacion,
        ahora = new Date(),
    ): Promise<Insignia[]> {
        const candidatas = estado.insignias.filter(
            (insignia) =>
                insignia.progreso.actual >= insignia.progreso.meta &&
                !insignia.fechaObtencion,
        );
        const nuevas: Insignia[] = [];
        for (const insignia of candidatas) {
            try {
                await this.prisma.cursoLogrosEmpleado.create({
                    data: {
                        idTenant,
                        idEmpresa,
                        idEmpleado,
                        codigo: insignia.codigo,
                        fechaObtencion: ahora,
                    },
                });
            } catch (error) {
                if (esDuplicado(error)) continue;
                throw error;
            }
            nuevas.push({
                ...insignia,
                ganada: true,
                fechaObtencion: ahora.toISOString(),
                vista: false,
            });
        }
        return nuevas;
    }

    async marcarVistas(
        idEmpresa: number,
        idEmpleado: number,
        codigos: string[],
        ahora = new Date(),
    ) {
        const unicos = [
            ...new Set(codigos.map((codigo) => codigo.trim()).filter(Boolean)),
        ];
        if (!unicos.length) return { actualizados: 0 };
        const resultado = await this.prisma.cursoLogrosEmpleado.updateMany({
            where: { idEmpleado, idEmpresa, codigo: { in: unicos } },
            data: { vistoEn: ahora },
        });
        return { actualizados: resultado.count };
    }

    private async cargar(
        idEmpresa: number,
        idEmpleado: number,
        ahora: Date,
    ): Promise<FuentesGamificacion> {
        const zona = await this.zonaDe(idEmpresa);
        const [participaciones, logros, rutasCompletas] = await Promise.all([
            this.prisma.cursoParticipantes.findMany({
                where: { idEmpleado, CursoSesiones: { idEmpresa } },
                select: {
                    idParticipante: true,
                    estatusAsignacion: true,
                    calificacionFinal: true,
                    CursoSeguimientoParticipante: {
                        select: {
                            fechaConclusion: true,
                            tiempoTotalSegundos: true,
                            fechaUltimaActividad: true,
                        },
                    },
                    CursoSesiones: {
                        select: {
                            modalidad: true,
                            estatus: true,
                            fechaFinPeriodo: true,
                            CursoFechasClase: {
                                select: {
                                    estatus: true,
                                    fechaHoraInicio: true,
                                    fechaHoraFin: true,
                                    CursoAsistencias: {
                                        where: { idEmpleado },
                                        select: { fechaHoraRegistro: true },
                                    },
                                },
                            },
                        },
                    },
                },
            }),
            this.prisma.cursoLogrosEmpleado.findMany({
                where: { idEmpleado, idEmpresa },
                select: { codigo: true, fechaObtencion: true, vistoEn: true },
            }),
            this.careerPlan.contarRutasCompletas(idEmpresa, idEmpleado),
        ]);

        const ids = participaciones.map(
            (participacion) => participacion.idParticipante,
        );
        if (!ids.length) {
            return { ...fuentesVacias(zona, ahora), logros, rutasCompletas };
        }

        const [lecciones, intentos, tiempos, scorm] = await Promise.all([
            this.prisma.cursoLeccionProgresos.findMany({
                where: { idParticipante: { in: ids }, fechaCompletado: { not: null } },
                select: { fechaCompletado: true },
            }),
            this.prisma.cursoIntentosQuiz.findMany({
                where: { idParticipante: { in: ids } },
                select: {
                    idParticipante: true,
                    idLeccion: true,
                    numeroIntento: true,
                    aprobado: true,
                    fechaIntento: true,
                },
            }),
            this.prisma.cursoTiempoDiario.findMany({
                where: { idParticipante: { in: ids } },
                select: { idParticipante: true, fecha: true, segundos: true },
            }),
            this.prisma.cursoScormProgresos.findMany({
                where: {
                    idParticipante: { in: ids },
                    fechaUltimoGuardado: { not: null },
                },
                select: { idParticipante: true, fechaUltimoGuardado: true },
            }),
        ]);

        const diario = new Map<number, { fecha: string; segundos: number }[]>();
        for (const tiempo of tiempos) {
            const lista = diario.get(tiempo.idParticipante) ?? [];
            lista.push({ fecha: fechaSql(tiempo.fecha), segundos: tiempo.segundos });
            diario.set(tiempo.idParticipante, lista);
        }

        return {
            zona,
            ahora,
            rutasCompletas,
            leccionesCompletadas: lecciones
                .map((leccion) => leccion.fechaCompletado)
                .filter((fecha): fecha is Date => !!fecha),
            intentos: intentos.map((intento) => ({
                idParticipante: intento.idParticipante,
                idLeccion: intento.idLeccion,
                numeroIntento: intento.numeroIntento,
                aprobado: intento.aprobado,
                fecha: intento.fechaIntento,
            })),
            commitsScorm: scorm
                .map((fila) => fila.fechaUltimoGuardado)
                .filter((fecha): fecha is Date => !!fecha),
            logros,
            cursos: participaciones.map((participacion) => {
                const sesion = participacion.CursoSesiones;
                const seguimiento = participacion.CursoSeguimientoParticipante;
                return {
                    estatus: participacion.estatusAsignacion,
                    calificacionFinal:
                        participacion.calificacionFinal == null
                            ? null
                            : Number(participacion.calificacionFinal),
                    fechaConclusion: seguimiento?.fechaConclusion ?? null,
                    fechaFin: sesion?.fechaFinPeriodo ?? null,
                    modalidad: sesion?.modalidad ?? 'online_asincrono',
                    estatusSesion: sesion?.estatus ?? 'programado',
                    tiempoTotalSegundos: seguimiento?.tiempoTotalSegundos ?? 0,
                    fechaUltimaActividad: seguimiento?.fechaUltimaActividad ?? null,
                    segundosDiarios: diario.get(participacion.idParticipante) ?? [],
                    clases: (sesion?.CursoFechasClase ?? []).map((clase) => ({
                        estatus: clase.estatus,
                        inicio: new Date(clase.fechaHoraInicio),
                        fin: new Date(clase.fechaHoraFin),
                        asistencias: (clase.CursoAsistencias ?? []).map(
                            (asistencia) => new Date(asistencia.fechaHoraRegistro),
                        ),
                    })),
                };
            }),
        };
    }

    private async zonaDe(idEmpresa: number): Promise<string> {
        const principal = await this.prisma.catSites.findFirst({
            where: { idEmpresa, EsPrincipal: true },
            select: { zonaHoraria: true },
        });
        if (principal?.zonaHoraria) return zonaValida(principal.zonaHoraria);
        const sitio = await this.prisma.catSites.findFirst({
            where: { idEmpresa },
            select: { zonaHoraria: true },
        });
        return zonaValida(sitio?.zonaHoraria || ZONA_DEFAULT);
    }
}

export function respuestaAccion(
    antesNumero: number,
    antes: ConteosXp,
    despues: EstadoGamificacion,
    insigniasNuevas: Insignia[],
) {
    return {
        xpGanado: diferenciaXp(antes, despues.conteos),
        nivelAntes: antesNumero,
        nivel: nivelAccion(despues),
        insigniasNuevas,
    };
}

export function gamificacionPantalla(
    estado: EstadoGamificacion,
    insignias = estado.insignias,
) {
    return {
        xp: estado.xp,
        nivel: {
            numero: estado.nivel.numero,
            nombre: estado.nivel.nombre,
            xpDesde: estado.nivel.xpDesde,
            xpSiguiente: estado.nivel.xpSiguiente,
        },
        rachaSemanas: estado.racha.semanas,
        activaEstaSemana: estado.racha.activaEstaSemana,
        insigniasGanadas: insignias.filter((insignia) => insignia.ganada).length,
        insigniasTotal: INSIGNIAS.length,
        insigniasSinVer: insignias.filter(
            (insignia) => insignia.ganada && !insignia.vista,
        ),
    };
}

function nivelAccion(estado: EstadoGamificacion) {
    return {
        numero: estado.nivel.numero,
        nombre: estado.nivel.nombre,
        xp: estado.xp,
        xpDesde: estado.nivel.xpDesde,
        xpSiguiente: estado.nivel.xpSiguiente,
    };
}

function fechaSql(valor: Date): string {
    const anio = valor.getUTCFullYear();
    const mes = String(valor.getUTCMonth() + 1).padStart(2, '0');
    const dia = String(valor.getUTCDate()).padStart(2, '0');
    return `${anio}-${mes}-${dia}`;
}

function esDuplicado(error: unknown): boolean {
    return (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
    );
}

export { aplicarNuevas };
