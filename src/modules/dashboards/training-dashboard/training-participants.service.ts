import { Injectable } from '@nestjs/common';
import { ActiveUserDto } from 'src/modules/auth/dto/active-user.dto';
import { ExcelColumn, ExcelExportService } from 'src/common/services/excel-export.service';
import { EstatusParticipante, Participacion, TrainingDashboardService } from './training-dashboard.service';
import { TrainingParticipantsFiltersDto, TrainingParticipantsQueryDto } from './dto/training-participants.dto';

export interface ParticipanteReporte {
    idParticipante: number;
    idSesion: number;
    idCurso: number;
    idEmpleado: number;
    empleado: string;
    numeroEmpleado: string | null;
    area: string;
    curso: string;
    modalidad: string;
    inicioSesion: string;
    finSesion: string | null;
    estatus: EstatusParticipante;
    enRiesgo: boolean;
    segundos: number;
    diasEnTerminar: number | null;
    calificacion: number | null;
    primerAcceso: string | null;
    conclusion: string | null;
    ultimaActividad: string | null;
    diasSinActividad: number | null;
}

const DIA_MS = 24 * 60 * 60 * 1000;
const ESTATUS_ORDEN: EstatusParticipante[] = ['vencido', 'no_asistio', 'reprobado', 'sin_iniciar', 'en_progreso', 'aprobado'];
const ESTATUS_TEXTO: Record<EstatusParticipante, string> = {
    aprobado: 'Aprobado',
    reprobado: 'Reprobado',
    en_progreso: 'En progreso',
    sin_iniciar: 'Sin iniciar',
    vencido: 'Vencido',
    no_asistio: 'No asistió',
};
const MODALIDAD_TEXTO: Record<string, string> = { presencial: 'Presencial', online_sincrono: 'En línea en vivo', online_asincrono: 'En línea a su ritmo' };

// "Quién hizo qué": una fila por inscripción, con los mismos filtros y reglas del tablero
@Injectable()
export class TrainingParticipantsService {
    constructor(
        private readonly dashboardService: TrainingDashboardService,
        private readonly excelExportService: ExcelExportService,
    ) { }

    async list(user: ActiveUserDto, companyId: number, q: TrainingParticipantsQueryDto) {
        const { filas, resumen } = await this.filtrar(user, companyId, q);
        const ordenadas = this.ordenar(filas, q.sortBy ?? 'empleado', q.sortDir ?? 'asc');
        const pageSize = q.pageSize ?? 20;
        const totalPages = Math.max(1, Math.ceil(ordenadas.length / pageSize));
        const page = Math.min(q.page ?? 1, totalPages);
        return {
            data: ordenadas.slice((page - 1) * pageSize, page * pageSize),
            meta: { total: ordenadas.length, page, pageSize, totalPages },
            resumen,
        };
    }

    async export(user: ActiveUserDto, companyId: number, q: TrainingParticipantsFiltersDto): Promise<Buffer> {
        const { filas } = await this.filtrar(user, companyId, q);
        const fecha = (v: string | null) => (v ? v.slice(0, 10) : '');
        const columns: ExcelColumn<ParticipanteReporte>[] = [
            { header: 'No. empleado', key: 'numeroEmpleado', width: 14, value: (r) => r.numeroEmpleado ?? '' },
            { header: 'Empleado', key: 'empleado', width: 32 },
            { header: 'Área', key: 'area', width: 22 },
            { header: 'Curso', key: 'curso', width: 40 },
            { header: 'Modalidad', key: 'modalidad', width: 20, value: (r) => MODALIDAD_TEXTO[r.modalidad] ?? r.modalidad },
            { header: 'Inicio de sesión', key: 'inicioSesion', width: 16, value: (r) => fecha(r.inicioSesion) },
            { header: 'Fin de sesión', key: 'finSesion', width: 16, value: (r) => fecha(r.finSesion) },
            { header: 'Estatus', key: 'estatus', width: 14, value: (r) => ESTATUS_TEXTO[r.estatus] },
            { header: 'En riesgo', key: 'enRiesgo', width: 11, value: (r) => (r.enRiesgo ? 'Sí' : 'No') },
            { header: 'Horas dedicadas', key: 'segundos', width: 15, value: (r) => Math.round((r.segundos / 3600) * 10) / 10 },
            { header: 'Días en terminar', key: 'diasEnTerminar', width: 15, value: (r) => r.diasEnTerminar ?? '' },
            { header: 'Calificación (0-100)', key: 'calificacion', width: 18, value: (r) => r.calificacion ?? '' },
            { header: 'Primer acceso', key: 'primerAcceso', width: 15, value: (r) => fecha(r.primerAcceso) },
            { header: 'Conclusión', key: 'conclusion', width: 15, value: (r) => fecha(r.conclusion) },
            { header: 'Días sin actividad', key: 'diasSinActividad', width: 17, value: (r) => r.diasSinActividad ?? '' },
        ];
        const rows = this.ordenar(filas, 'curso', 'asc');
        return this.excelExportService.generate({ sheetName: 'Participantes', columns, rows });
    }

    private async filtrar(user: ActiveUserDto, companyId: number, q: TrainingParticipantsFiltersDto) {
        const { participaciones } = await this.dashboardService.cargarParticipaciones(user, companyId, q);
        const ahora = new Date();
        const busqueda = this.normalizarTexto(q.search ?? '');
        const base = participaciones
            .map((p) => this.aFila(p, ahora))
            .filter((r) => !busqueda || this.normalizarTexto(`${r.empleado} ${r.numeroEmpleado ?? ''}`).includes(busqueda));

        // Conteos para los chips (antes de filtrar por estatus)
        const resumen = { total: base.length, en_riesgo: base.filter((r) => r.enRiesgo).length } as Record<string, number>;
        for (const e of ESTATUS_ORDEN) resumen[e] = base.filter((r) => r.estatus === e).length;

        const filas = !q.estatus ? base : q.estatus === 'en_riesgo' ? base.filter((r) => r.enRiesgo) : base.filter((r) => r.estatus === q.estatus);
        return { filas, resumen };
    }

    private aFila(p: Participacion, ahora: Date): ParticipanteReporte {
        const inicioConteo = p.primerAcceso ?? p.inicio;
        return {
            idParticipante: p.idParticipante,
            idSesion: p.idSesion,
            idCurso: p.idCurso,
            idEmpleado: p.idEmpleado,
            empleado: p.empleado,
            numeroEmpleado: p.numeroEmpleado,
            area: p.idArea === null ? 'Sin área' : p.area,
            curso: p.curso,
            modalidad: p.modalidad,
            inicioSesion: p.inicio.toISOString(),
            finSesion: p.fin?.toISOString() ?? null,
            estatus: this.dashboardService.estatusDe(p, ahora),
            enRiesgo: this.dashboardService.estaEnRiesgo(p, ahora),
            segundos: p.segundos,
            diasEnTerminar: p.terminado && p.conclusion ? Math.max(0, Math.round((p.conclusion.getTime() - inicioConteo.getTime()) / DIA_MS)) : null,
            calificacion: p.calificacion,
            primerAcceso: p.primerAcceso?.toISOString() ?? null,
            conclusion: p.terminado && p.conclusion ? p.conclusion.toISOString() : null,
            ultimaActividad: p.ultimaActividad?.toISOString() ?? null,
            diasSinActividad: !p.terminado && p.ultimaActividad ? Math.floor((ahora.getTime() - p.ultimaActividad.getTime()) / DIA_MS) : null,
        };
    }

    // Los vacíos siempre al final, sin importar la dirección
    private ordenar(filas: ParticipanteReporte[], campo: TrainingParticipantsQueryDto['sortBy'], dir: 'asc' | 'desc') {
        const valor = (r: ParticipanteReporte): string | number | null => {
            switch (campo) {
                case 'curso': return r.curso;
                case 'area': return r.area;
                case 'estatus': return ESTATUS_ORDEN.indexOf(r.estatus);
                case 'inicio': return r.inicioSesion;
                case 'tiempo': return r.segundos;
                case 'calificacion': return r.calificacion;
                case 'conclusion': return r.conclusion;
                case 'inactividad': return r.diasSinActividad;
                default: return r.empleado;
            }
        };
        const signo = dir === 'desc' ? -1 : 1;
        return [...filas].sort((a, b) => {
            const va = valor(a);
            const vb = valor(b);
            if (va === null && vb === null) return a.empleado.localeCompare(b.empleado, 'es');
            if (va === null) return 1;
            if (vb === null) return -1;
            const c = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'es', { sensitivity: 'base' });
            return c !== 0 ? c * signo : a.empleado.localeCompare(b.empleado, 'es') || a.idParticipante - b.idParticipante;
        });
    }

    private normalizarTexto(t: string) {
        return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
    }
}
