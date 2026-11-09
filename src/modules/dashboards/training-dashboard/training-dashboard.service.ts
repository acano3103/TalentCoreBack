import { BadRequestException, Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from 'generated/prisma/client';
import { ActiveUserDto } from 'src/modules/auth/dto/active-user.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { ModalidadCurso, TrainingDashboardKpis, TrainingDashboardResponseDto } from './dto/training-dashboard-response.dto';

export interface TrainingDashboardFilters {
    desde?: string;
    hasta?: string;
    idCurso?: string;
    idArea?: string;
    modalidad?: string;
}

// Una participación (empleado inscrito en una sesión) tal como sale de la consulta
interface ParticipacionRaw {
    idParticipante: number;
    idEmpleado: number;
    nombre: string | null;
    primerApellido: string | null;
    segundoApellido: string | null;
    numeroEmpleado: string | null;
    estatusAsignacion: string | null;
    calificacionFinal: unknown;
    idSesion: number;
    idCurso: number;
    curso: string | null;
    modalidad: ModalidadCurso;
    fechaInicioPeriodo: Date;
    fechaFinPeriodo: Date | null;
    estatusSesion: string;
    idArea: number | null;
    area: string | null;
    fechaPrimerAcceso: Date | null;
    fechaUltimaActividad: Date | null;
    fechaConclusion: Date | null;
    tiempoTotalSegundos: unknown;
    idScormProgreso: number | null;
    scormTiempoTotal: string | null;
    scormUltimoGuardado: Date | null;
    asistencias: unknown;
    segundosAsistidos: unknown;
    tieneContenido: unknown;
}

// Participación ya normalizada para los cálculos
export interface Participacion {
    idParticipante: number;
    idEmpleado: number;
    empleado: string;
    numeroEmpleado: string | null;
    idSesion: number;
    idCurso: number;
    curso: string;
    modalidad: ModalidadCurso;
    inicio: Date;
    fin: Date | null;
    estatusSesion: string;
    sinContenido: boolean;
    idArea: number | null;
    area: string;
    iniciado: boolean;
    aprobado: boolean;
    reprobado: boolean;
    terminado: boolean;
    noAsistio: boolean;
    calificacion: number | null;
    segundos: number;
    primerAcceso: Date | null;
    ultimaActividad: Date | null;
    conclusion: Date | null;
}

export type EstatusParticipante = 'aprobado' | 'reprobado' | 'en_progreso' | 'sin_iniciar' | 'vencido' | 'no_asistio';

const MODALIDADES: ModalidadCurso[] = ['presencial', 'online_sincrono', 'online_asincrono'];
const FECHA_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const DIA_MS = 24 * 60 * 60 * 1000;
const DIAS_ALERTA_VENCIMIENTO = 7;   // sesiones que terminan en los próximos 7 días
const DIAS_INACTIVIDAD = 14;          // sin actividad en línea por más de 14 días
const CUMPLIMIENTO_BAJO = 50;         // % debajo del cual una sesión por vencer es alerta
const REPROBACION_ALTA = 30;          // % de reprobación que vuelve alerta a un curso
const MIN_TERMINADOS_REPROBACION = 3; // para no alertar por 1 o 2 personas
const MAX_DIAS_PERIODO = 3 * 366;

@Injectable()
export class TrainingDashboardService {
    private readonly logger = new Logger(TrainingDashboardService.name);

    constructor(private readonly prisma: PrismaService) { }

    async getMetrics(user: ActiveUserDto, companyId: number, filtros: TrainingDashboardFilters): Promise<TrainingDashboardResponseDto> {
        if (!user.idTenant) {
            throw new InternalServerErrorException('El usuario no tiene un tenant asignado.');
        }
        const idTenant = user.idTenant;
        const { desde, hasta, anteriorDesde, anteriorHasta } = this.resolverPeriodo(filtros.desde, filtros.hasta);
        const idCurso = this.parseEnteroOpcional(filtros.idCurso, 'idCurso');
        const idArea = this.parseEnteroOpcional(filtros.idArea, 'idArea');
        const modalidad = this.parseModalidad(filtros.modalidad);

        try {
            const [actuales, anteriores, cursosOpcion, areasOpcion] = await Promise.all([
                this.obtenerParticipaciones(companyId, idTenant, desde, hasta, idCurso, idArea, modalidad),
                this.obtenerParticipaciones(companyId, idTenant, anteriorDesde, anteriorHasta, idCurso, idArea, modalidad),
                this.prisma.$queryRaw<{ idCurso: number; nombre: string | null }[]>`
                    SELECT c.idCursos AS idCurso, c.Descripcion AS nombre
                    FROM CatCursos c
                    WHERE c.idEmpresa = ${companyId}
                        AND (c.idTenant = ${idTenant} OR c.idTenant IS NULL)
                    ORDER BY c.Descripcion ASC
                `,
                this.prisma.$queryRaw<{ idArea: number; nombre: string | null }[]>`
                    SELECT a.idArea, a.Descripcion AS nombre
                    FROM CatAreas a
                    WHERE a.idEmpresa = ${companyId}
                        AND (a.idTenant = ${idTenant} OR a.idTenant IS NULL)
                        AND (a.Activo IS NULL OR a.Activo = 1)
                    ORDER BY a.Descripcion ASC
                `,
            ]);

            const ahora = new Date();
            return {
                periodo: { desde, hasta, anteriorDesde, anteriorHasta },
                kpis: this.calcularKpis(actuales, ahora),
                kpisAnterior: this.calcularKpis(anteriores, ahora),
                embudo: {
                    inscritos: actuales.length,
                    iniciaron: actuales.filter((p) => p.iniciado).length,
                    terminaron: actuales.filter((p) => p.terminado).length,
                    aprobaron: actuales.filter((p) => p.aprobado).length,
                },
                tendenciaMensual: this.calcularTendencia(actuales, desde, hasta),
                porModalidad: MODALIDADES.map((m) => {
                    const grupo = actuales.filter((p) => p.modalidad === m);
                    const completados = grupo.filter((p) => p.aprobado).length;
                    return { modalidad: m, inscritos: grupo.length, completados, cumplimiento: this.porcentaje(completados, grupo.length) };
                }),
                porArea: this.calcularPorArea(actuales),
                cursos: this.calcularPorCurso(actuales),
                alertas: this.calcularAlertas(actuales, ahora),
                opciones: {
                    cursos: cursosOpcion.map((c) => ({ idCurso: Number(c.idCurso), nombre: c.nombre || `Curso #${c.idCurso}` })),
                    areas: areasOpcion.map((a) => ({ idArea: Number(a.idArea), nombre: a.nombre || `Área #${a.idArea}` })),
                },
            };
        } catch (error) {
            this.logger.error(`Error procesando métricas del tablero de capacitación para empresa ${companyId}`, error);
            throw error;
        }
    }

    // Participaciones del periodo con los mismos filtros del tablero (para el reporte de participantes)
    async cargarParticipaciones(user: ActiveUserDto, companyId: number, filtros: TrainingDashboardFilters) {
        if (!user.idTenant) {
            throw new InternalServerErrorException('El usuario no tiene un tenant asignado.');
        }
        const { desde, hasta } = this.resolverPeriodo(filtros.desde, filtros.hasta);
        const participaciones = await this.obtenerParticipaciones(
            companyId,
            user.idTenant,
            desde,
            hasta,
            this.parseEnteroOpcional(filtros.idCurso, 'idCurso'),
            this.parseEnteroOpcional(filtros.idArea, 'idArea'),
            this.parseModalidad(filtros.modalidad),
        );
        return { desde, hasta, participaciones };
    }

    // Todas las inscripciones del empleado de esa participación (sin filtro de periodo)
    async historialDeParticipante(user: ActiveUserDto, companyId: number, idParticipante: number) {
        if (!user.idTenant) {
            throw new InternalServerErrorException('El usuario no tiene un tenant asignado.');
        }
        const [dueno] = await this.prisma.$queryRaw<{ idEmpleado: number }[]>`
            SELECT p.idEmpleado
            FROM CursoParticipantes p
            INNER JOIN CursoSesiones s ON s.idSesion = p.idSesion
            INNER JOIN Empleados e ON e.idEmpleado = p.idEmpleado
            WHERE p.idParticipante = ${idParticipante} AND s.idEmpresa = ${companyId} AND e.idTenant = ${user.idTenant}
            LIMIT 1
        `;
        if (!dueno) throw new NotFoundException('No se encontró la inscripción.');
        return this.obtenerParticipaciones(companyId, user.idTenant, '', '', null, null, null, Number(dueno.idEmpleado));
    }

    // Estatus de una inscripción para el reporte (mismas reglas que los indicadores)
    estatusDe(p: Participacion, ahora: Date): EstatusParticipante {
        if (p.aprobado) return 'aprobado';
        if (p.reprobado) return 'reprobado';
        if (p.noAsistio) return 'no_asistio';
        if (this.estaVencido(p, ahora)) return 'vencido';
        return p.iniciado ? 'en_progreso' : 'sin_iniciar';
    }

    // ---------- Filtros ----------

    // Periodo pedido (por defecto: del 1 de enero a hoy) y el periodo anterior de la misma duración
    private resolverPeriodo(desdeIn?: string, hastaIn?: string) {
        const ahora = new Date();
        const hoy = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(ahora.getDate()).padStart(2, '0')}`;
        const desde = desdeIn?.trim() || `${hoy.slice(0, 4)}-01-01`;
        const hasta = hastaIn?.trim() || hoy;
        for (const [nombre, valor] of [['desde', desde], ['hasta', hasta]] as const) {
            if (!FECHA_REGEX.test(valor) || Number.isNaN(Date.parse(`${valor}T00:00:00Z`))) {
                throw new BadRequestException(`El filtro "${nombre}" debe tener el formato AAAA-MM-DD.`);
            }
        }
        const inicio = Date.parse(`${desde}T00:00:00Z`);
        const fin = Date.parse(`${hasta}T00:00:00Z`);
        if (inicio > fin) throw new BadRequestException('La fecha "desde" no puede ser posterior a la fecha "hasta".');
        const dias = Math.round((fin - inicio) / DIA_MS) + 1;
        if (dias > MAX_DIAS_PERIODO) throw new BadRequestException('El periodo no puede ser mayor a 3 años.');

        const anteriorHasta = this.formatearFecha(new Date(inicio - DIA_MS));
        const anteriorDesde = this.formatearFecha(new Date(inicio - dias * DIA_MS));
        return { desde, hasta, anteriorDesde, anteriorHasta };
    }

    private parseEnteroOpcional(valor: string | undefined, nombre: string): number | null {
        if (valor === undefined || valor === null || String(valor).trim() === '') return null;
        const n = Number(valor);
        if (!Number.isInteger(n) || n <= 0) throw new BadRequestException(`El filtro "${nombre}" no es válido.`);
        return n;
    }

    private parseModalidad(valor?: string): ModalidadCurso | null {
        if (!valor || !valor.trim()) return null;
        if (!MODALIDADES.includes(valor as ModalidadCurso)) {
            throw new BadRequestException(`La modalidad debe ser: ${MODALIDADES.join(', ')}.`);
        }
        return valor as ModalidadCurso;
    }

    // ---------- Consulta ----------

    // Participaciones de las sesiones (no canceladas) que inician dentro del periodo, con su seguimiento,
    // avance SCORM y asistencias presenciales. El área es la del empleado (por su puesto).
    private async obtenerParticipaciones(
        companyId: number,
        idTenant: number,
        desde: string,
        hasta: string,
        idCurso: number | null,
        idArea: number | null,
        modalidad: ModalidadCurso | null,
        idEmpleado: number | null = null,
    ): Promise<Participacion[]> {
        const filas = await this.prisma.$queryRaw<ParticipacionRaw[]>`
            SELECT
                p.idParticipante, p.idEmpleado, p.estatusAsignacion, p.calificacionFinal,
                e.nombre, e.primerApellido, e.segundoApellido, e.numeroEmpleado,
                s.idSesion, s.idCurso, c.Descripcion AS curso, s.modalidad,
                s.fechaInicioPeriodo, s.fechaFinPeriodo, s.estatus AS estatusSesion,
                pu.idArea, a.Descripcion AS area,
                sg.fechaPrimerAcceso, sg.fechaUltimaActividad, sg.fechaConclusion, sg.tiempoTotalSegundos,
                sp.idScormProgreso, sp.tiempoTotal AS scormTiempoTotal, sp.fechaUltimoGuardado AS scormUltimoGuardado,
                asis.asistencias, asis.segundosAsistidos,
                EXISTS (
                    SELECT 1 FROM CursoContenidos cc
                    WHERE cc.idSesion = s.idSesion AND cc.activo = 1
                        AND (EXISTS (SELECT 1 FROM CursoModulos m WHERE m.idContenido = cc.idContenido)
                            OR EXISTS (SELECT 1 FROM CursoPaquetesScorm ps WHERE ps.idContenido = cc.idContenido))
                ) AS tieneContenido
            FROM CursoParticipantes p
            INNER JOIN CursoSesiones s ON s.idSesion = p.idSesion
            INNER JOIN CatCursos c ON c.idCursos = s.idCurso
            INNER JOIN Empleados e ON e.idEmpleado = p.idEmpleado
            LEFT JOIN CatPuestos pu ON pu.idPuesto = e.idPuesto
            LEFT JOIN CatAreas a ON a.idArea = pu.idArea
            LEFT JOIN CursoSeguimientoParticipante sg ON sg.idParticipante = p.idParticipante
            LEFT JOIN CursoScormProgresos sp ON sp.idParticipante = p.idParticipante
            LEFT JOIN (
                SELECT ca.idEmpleado, f.idSesion,
                    COUNT(*) AS asistencias,
                    SUM(GREATEST(TIMESTAMPDIFF(SECOND, f.fechaHoraInicio, f.fechaHoraFin), 0)) AS segundosAsistidos
                FROM CursoAsistencias ca
                INNER JOIN CursoFechasClase f ON f.idFechaClase = ca.idFechaClase
                INNER JOIN CursoSesiones sa ON sa.idSesion = f.idSesion AND sa.idEmpresa = ${companyId}
                WHERE f.estatus IS NULL OR f.estatus <> 'cancelada'
                GROUP BY ca.idEmpleado, f.idSesion
            ) asis ON asis.idEmpleado = p.idEmpleado AND asis.idSesion = s.idSesion
            WHERE s.idEmpresa = ${companyId}
                AND e.idTenant = ${idTenant}
                AND s.estatus <> 'cancelado'
                ${idEmpleado ? Prisma.sql`AND p.idEmpleado = ${idEmpleado}` : Prisma.sql`AND s.fechaInicioPeriodo BETWEEN ${`${desde} 00:00:00`} AND ${`${hasta} 23:59:59`}`}
                ${idCurso ? Prisma.sql`AND s.idCurso = ${idCurso}` : Prisma.empty}
                ${idArea ? Prisma.sql`AND pu.idArea = ${idArea}` : Prisma.empty}
                ${modalidad ? Prisma.sql`AND s.modalidad = ${modalidad}` : Prisma.empty}
        `;
        return filas.map((f) => this.normalizar(f));
    }

    private normalizar(f: ParticipacionRaw): Participacion {
        const estatus = f.estatusAsignacion ?? 'inscrito';
        const aprobado = estatus === 'completado';
        const reprobado = estatus === 'reprobado';
        const terminado = aprobado || reprobado;
        const asistencias = this.toNumber(f.asistencias) ?? 0;
        const inicio = new Date(f.fechaInicioPeriodo);
        const fin = f.fechaFinPeriodo ? new Date(f.fechaFinPeriodo) : null;
        // Tiempo de estudio: clases asistidas (presencial / en vivo) + tiempo en línea (seguimiento propio o SCORM)
        const segundosLinea = Math.max(this.toNumber(f.tiempoTotalSegundos) ?? 0, this.segundosScorm(f.scormTiempoTotal));
        const segundos = (this.toNumber(f.segundosAsistidos) ?? 0) + segundosLinea;
        const ultimaActividad = this.maxFecha(f.fechaUltimaActividad, f.scormUltimoGuardado);
        return {
            idParticipante: Number(f.idParticipante),
            idEmpleado: Number(f.idEmpleado),
            empleado: [f.nombre, f.primerApellido, f.segundoApellido].filter((x) => x?.trim()).join(' ') || `Empleado #${f.idEmpleado}`,
            numeroEmpleado: f.numeroEmpleado?.trim() || null,
            idSesion: Number(f.idSesion),
            idCurso: Number(f.idCurso),
            curso: f.curso || `Curso #${f.idCurso}`,
            modalidad: f.modalidad,
            inicio,
            fin,
            estatusSesion: f.estatusSesion,
            // En línea sin módulos ni SCORM: nadie puede avanzar
            sinContenido: f.modalidad === 'online_asincrono' && !Number(f.tieneContenido),
            idArea: f.idArea === null || f.idArea === undefined ? null : Number(f.idArea),
            area: f.area || 'Sin área',
            iniciado: terminado || !!f.fechaPrimerAcceso || !!f.idScormProgreso || asistencias > 0,
            aprobado,
            reprobado,
            terminado,
            noAsistio: estatus === 'no_asistio',
            calificacion: terminado ? this.calificacionSobre100(this.toNumber(f.calificacionFinal), f.modalidad) : null,
            segundos,
            primerAcceso: f.fechaPrimerAcceso ? new Date(f.fechaPrimerAcceso) : null,
            ultimaActividad,
            // Presencial no guarda fecha de conclusión: se toma el fin del periodo de la sesión
            conclusion: f.fechaConclusion ? new Date(f.fechaConclusion) : terminado ? fin ?? inicio : null,
        };
    }

    // ---------- Cálculos ----------

    private calcularKpis(ps: Participacion[], ahora: Date): TrainingDashboardKpis {
        const aprobados = ps.filter((p) => p.aprobado);
        const terminados = ps.filter((p) => p.terminado);
        const calificaciones = terminados.map((p) => p.calificacion).filter((c): c is number => c !== null);
        return {
            inscritos: ps.length,
            personasInscritas: new Set(ps.map((p) => p.idEmpleado)).size,
            personasCapacitadas: new Set(aprobados.map((p) => p.idEmpleado)).size,
            cumplimiento: this.porcentaje(aprobados.length, ps.length),
            aprobacion: this.porcentaje(aprobados.length, terminados.length),
            calificacionPromedio: calificaciones.length ? this.redondear(calificaciones.reduce((a, b) => a + b, 0) / calificaciones.length) : null,
            horasCapacitacion: this.redondear(ps.reduce((a, p) => a + p.segundos, 0) / 3600),
            enRiesgo: ps.filter((p) => this.estaEnRiesgo(p, ahora)).length,
            vencidos: ps.filter((p) => this.estaVencido(p, ahora)).length,
        };
    }

    // En riesgo: no ha terminado, su periodo sigue vigente y
    //  - no ha entrado y la sesión termina en los próximos 7 días, o
    //  - entró pero lleva más de 14 días sin actividad
    estaEnRiesgo(p: Participacion, ahora: Date): boolean {
        if (p.terminado || p.noAsistio) return false;
        if (p.fin && p.fin < ahora) return false; // ya está vencido
        if (!p.iniciado) {
            return !!p.fin && p.fin.getTime() - ahora.getTime() <= DIAS_ALERTA_VENCIMIENTO * DIA_MS;
        }
        return this.estaInactivo(p, ahora);
    }

    private estaInactivo(p: Participacion, ahora: Date): boolean {
        if (p.terminado || p.noAsistio || !p.iniciado || !p.ultimaActividad) return false;
        if (p.fin && p.fin < ahora) return false;
        return ahora.getTime() - p.ultimaActividad.getTime() > DIAS_INACTIVIDAD * DIA_MS;
    }

    // Vencido: el periodo de la sesión ya terminó y no aprobó (incluye "no asistió" y "en proceso")
    private estaVencido(p: Participacion, ahora: Date): boolean {
        return !p.aprobado && !p.reprobado && !!p.fin && p.fin < ahora;
    }

    // Inscritos por mes de inicio de la sesión; completados por mes de conclusión; horas por mes de inicio
    private calcularTendencia(ps: Participacion[], desde: string, hasta: string) {
        const meses = new Map<string, { inscritos: number; completados: number; segundos: number }>();
        let [y, m] = desde.split('-').map(Number);
        const [yFin, mFin] = hasta.split('-').map(Number);
        while (y < yFin || (y === yFin && m <= mFin)) {
            meses.set(`${y}-${String(m).padStart(2, '0')}`, { inscritos: 0, completados: 0, segundos: 0 });
            m++;
            if (m > 12) { m = 1; y++; }
        }
        for (const p of ps) {
            const mesInicio = meses.get(this.claveMes(p.inicio));
            if (mesInicio) {
                mesInicio.inscritos++;
                mesInicio.segundos += p.segundos;
            }
            if (p.aprobado && p.conclusion) {
                const mesConclusion = meses.get(this.claveMes(p.conclusion));
                if (mesConclusion) mesConclusion.completados++;
            }
        }
        return [...meses.entries()].map(([mes, v]) => ({
            mes,
            inscritos: v.inscritos,
            completados: v.completados,
            horas: this.redondear(v.segundos / 3600),
        }));
    }

    private calcularPorArea(ps: Participacion[]) {
        const grupos = new Map<string, { idArea: number | null; area: string; inscritos: number; completados: number }>();
        for (const p of ps) {
            const clave = p.idArea === null ? 'sin-area' : String(p.idArea);
            const g = grupos.get(clave) ?? { idArea: p.idArea, area: p.idArea === null ? 'Sin área' : p.area, inscritos: 0, completados: 0 };
            g.inscritos++;
            if (p.aprobado) g.completados++;
            grupos.set(clave, g);
        }
        return [...grupos.values()]
            .map((g) => ({ ...g, cumplimiento: this.porcentaje(g.completados, g.inscritos) }))
            .sort((a, b) => b.inscritos - a.inscritos || a.area.localeCompare(b.area));
    }

    private calcularPorCurso(ps: Participacion[]) {
        const grupos = new Map<number, Participacion[]>();
        for (const p of ps) grupos.set(p.idCurso, [...(grupos.get(p.idCurso) ?? []), p]);
        return [...grupos.entries()]
            .map(([idCurso, g]) => {
                const completados = g.filter((p) => p.aprobado).length;
                const reprobados = g.filter((p) => p.reprobado).length;
                const calificaciones = g.filter((p) => p.terminado).map((p) => p.calificacion).filter((c): c is number => c !== null);
                return {
                    idCurso,
                    curso: g[0].curso,
                    inscritos: g.length,
                    completados,
                    reprobados,
                    cumplimiento: this.porcentaje(completados, g.length),
                    aprobacion: this.porcentaje(completados, completados + reprobados),
                    calificacionPromedio: calificaciones.length ? this.redondear(calificaciones.reduce((a, b) => a + b, 0) / calificaciones.length) : null,
                    horas: this.redondear(g.reduce((a, p) => a + p.segundos, 0) / 3600),
                };
            })
            .sort((a, b) => b.cumplimiento - a.cumplimiento || b.inscritos - a.inscritos);
    }

    private calcularAlertas(ps: Participacion[], ahora: Date) {
        // Sesiones que terminan en los próximos 7 días con cumplimiento bajo
        const sesiones = new Map<number, Participacion[]>();
        for (const p of ps) {
            if (!p.fin || p.fin < ahora || p.fin.getTime() - ahora.getTime() > DIAS_ALERTA_VENCIMIENTO * DIA_MS) continue;
            if (p.estatusSesion === 'finalizado') continue;
            sesiones.set(p.idSesion, [...(sesiones.get(p.idSesion) ?? []), p]);
        }
        const sesionesPorVencer = [...sesiones.entries()]
            .map(([idSesion, g]) => ({
                idSesion,
                idCurso: g[0].idCurso,
                curso: g[0].curso,
                fechaFin: g[0].fin!.toISOString(),
                inscritos: g.length,
                cumplimiento: this.porcentaje(g.filter((p) => p.aprobado).length, g.length),
                sinContenido: g[0].sinContenido,
            }))
            .filter((s) => s.cumplimiento < CUMPLIMIENTO_BAJO)
            .sort((a, b) => a.fechaFin.localeCompare(b.fechaFin))
            .slice(0, 5);

        const cursosAltaReprobacion = this.calcularPorCurso(ps)
            .map((c) => ({ idCurso: c.idCurso, curso: c.curso, terminados: c.completados + c.reprobados, reprobacion: this.porcentaje(c.reprobados, c.completados + c.reprobados) }))
            .filter((c) => c.terminados >= MIN_TERMINADOS_REPROBACION && c.reprobacion > REPROBACION_ALTA)
            .sort((a, b) => b.reprobacion - a.reprobacion)
            .slice(0, 5);

        return {
            sesionesPorVencer,
            inactivos: ps.filter((p) => this.estaInactivo(p, ahora)).length,
            vencidos: ps.filter((p) => this.estaVencido(p, ahora)).length,
            cursosAltaReprobacion,
        };
    }

    // ---------- Utilidades ----------

    // SCORM 1.2 guarda "HHHH:MM:SS(.ss)"; SCORM 2004, duración ISO 8601 ("PT1H30M5S")
    private segundosScorm(valor: string | null): number {
        if (!valor) return 0;
        const v = valor.trim();
        const hms = /^(\d+):(\d{1,2}):(\d{1,2})(?:\.\d+)?$/.exec(v);
        if (hms) return Number(hms[1]) * 3600 + Number(hms[2]) * 60 + Number(hms[3]);
        const iso = /^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(v);
        if (iso) {
            const [, d, h, m, s] = iso.map((x) => Number(x ?? 0));
            return Math.round(d * 86400 + h * 3600 + m * 60 + s);
        }
        return 0;
    }

    // En línea se califica de 0 a 100; presencial / en vivo de 0 a 10
    private calificacionSobre100(valor: number | null, modalidad: ModalidadCurso): number | null {
        if (valor === null) return null;
        return modalidad !== 'online_asincrono' && valor <= 10 ? valor * 10 : valor;
    }

    private toNumber(v: unknown): number | null {
        if (v === null || v === undefined) return null;
        const n = Number(typeof v === 'object' ? String(v) : v);
        return Number.isFinite(n) ? n : null;
    }

    private maxFecha(a: Date | null, b: Date | null): Date | null {
        if (!a && !b) return null;
        if (!a) return new Date(b!);
        if (!b) return new Date(a);
        return new Date(Math.max(new Date(a).getTime(), new Date(b).getTime()));
    }

    private porcentaje(parte: number, total: number): number {
        return total > 0 ? this.redondear((parte / total) * 100) : 0;
    }

    private redondear(n: number): number {
        return Math.round(n * 10) / 10;
    }

    // Las fechas DATETIME llegan como UTC desde Prisma; se usan tal cual para agrupar por mes
    private claveMes(fecha: Date): string {
        return `${fecha.getUTCFullYear()}-${String(fecha.getUTCMonth() + 1).padStart(2, '0')}`;
    }

    // Las fechas del periodo se manejan como medianoche UTC para que restar días no cambie de fecha por la zona horaria
    private formatearFecha(fecha: Date): string {
        return fecha.toISOString().slice(0, 10);
    }
}
