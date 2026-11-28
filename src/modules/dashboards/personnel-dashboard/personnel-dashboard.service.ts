import {
    BadRequestException,
    Injectable,
    InternalServerErrorException,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import { Prisma } from 'generated/prisma/client';
import { ActiveUserDto } from 'src/modules/auth/dto/active-user.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { PersonnelDashboardQueryDto } from './dto/personnel-dashboard-query.dto';
import { PersonnelDashboardResponseDto } from './dto/personnel-dashboard-response.dto';

const FECHA_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const DIA_MS = 24 * 60 * 60 * 1000;
const MAX_DIAS_PERIODO = 3 * 366;
const CODIGO_BAJA = 'BAJA_PERSONAL';
const ESTATUS_APROBADO = 'APROBADA';
const ESTATUS_PENDIENTE = 'PENDIENTE';

interface Filtros {
    idTenant: number;
    companyId: number;
    desde: string;
    hasta: string;
    idArea: number | null;
    idSite: number | null;
    estatusEmpleado: 'ACTIVO' | 'INACTIVO' | 'TODOS';
}

interface EmpleadoRow {
    idEmpleado: number;
    idArea: number | null;
    area: string;
    activo: number;
    esNuevoIngreso30d: unknown;
    fechaIngreso: Date | string | null;
}

interface MovimientoRow {
    idMovimiento: number;
    idEmpleado: number;
    numeroEmpleado: string | null;
    nombreEmpleado: string;
    codigoMovimiento: string;
    tipoMovimiento: string;
    estatus: string;
    esPendiente: unknown;
    esAprobada: unknown;
    idArea: number | null;
    nombreArea: string;
    puesto: string;
    fechaEfectiva: Date | string | null;
    motivo: string | null;
    causaBaja: string | null;
    diferenciaSalarioBruto: unknown;
}

interface IncidenciaRow {
    idSolicitud: number;
    idEmpleado: number;
    numeroEmpleado: string | null;
    nombreEmpleado: string;
    codigoMovimiento: string;
    tipoMovimiento: string;
    origenSolicitud: string;
    idArea: number | null;
    nombreArea: string;
    estatus: string;
    esPendiente: unknown;
    esAprobada: unknown;
    fechaInicio: Date | string | null;
    fechaFin: Date | string | null;
    totalDiasLaborales: unknown;
}

interface TendenciaRow {
    mesEvento: string;
    tipoEvento: 'Ingresos' | 'Bajas';
    cantidad: unknown;
}

@Injectable()
export class PersonnelDashboardService {
    private readonly logger = new Logger(PersonnelDashboardService.name);

    constructor(private readonly prisma: PrismaService) { }

    async getMetrics(
        user: ActiveUserDto,
        companyId: number,
        q: PersonnelDashboardQueryDto,
    ): Promise<PersonnelDashboardResponseDto> {
        if (!user.idTenant) {
            throw new InternalServerErrorException('El usuario no tiene un tenant asignado.');
        }

        const empresa = await this.prisma.catEmpresas.findFirst({
            where: { idEmpresa: companyId, OR: [{ idTenant: user.idTenant }, { idTenant: null }] },
            select: { idEmpresa: true },
        });
        if (!empresa) {
            throw new NotFoundException('No se encontró la empresa.');
        }

        const { desde, hasta } = this.resolverPeriodo(q.desde, q.hasta);
        const f: Filtros = {
            idTenant: user.idTenant,
            companyId,
            desde,
            hasta,
            idArea: q.idArea ?? null,
            idSite: q.idSite ?? null,
            estatusEmpleado: q.estatusEmpleado ?? 'TODOS',
        };

        try {
            const [empleados, movimientos, incidencias, tendencia, opciones] = await Promise.all([
                this.obtenerEmpleados(f),
                this.obtenerMovimientos(f),
                this.obtenerIncidencias(f),
                this.obtenerTendencia(f),
                this.obtenerOpciones(f),
            ]);

            const activos = empleados.filter((e) => Number(e.activo) === 1).length;
            const inactivos = empleados.filter((e) => Number(e.activo) !== 1).length;
            const nuevosIngresos30d = empleados.reduce((acc, e) => acc + (this.toNumber(e.esNuevoIngreso30d) ?? 0), 0);

            const ingresosPeriodo = empleados.filter((e) => {
                const fechaStr = this.toDateString(e.fechaIngreso);
                return fechaStr !== null && fechaStr >= f.desde && fechaStr <= f.hasta;
            }).length;

            const bajasPeriodo = movimientos.filter(
                (m) => m.codigoMovimiento === CODIGO_BAJA && m.estatus === ESTATUS_APROBADO,
            ).length;

            const movimientosPendientes = movimientos.reduce((acc, m) => acc + (this.toNumber(m.esPendiente) ?? 0), 0);
            const movimientosAprobados = movimientos.reduce((acc, m) => acc + (this.toNumber(m.esAprobada) ?? 0), 0);

            const incidenciasPendientes = incidencias.reduce((acc, i) => acc + (this.toNumber(i.esPendiente) ?? 0), 0);
            const incidenciasAprobadas = incidencias.reduce((acc, i) => acc + (this.toNumber(i.esAprobada) ?? 0), 0);
            const diasLaboralesIncidenciasAprobadas = incidencias
                .filter((i) => i.estatus === ESTATUS_APROBADO)
                .reduce((acc, i) => acc + (this.toNumber(i.totalDiasLaborales) ?? 0), 0);

            return {
                periodo: { desde, hasta },
                kpis: {
                    totalEmpleados: empleados.length,
                    empleadosActivos: activos,
                    empleadosInactivos: inactivos,
                    nuevosIngresos30d,
                    ingresosPeriodo,
                    bajasPeriodo,
                    movimientosPendientes,
                    movimientosAprobados,
                    incidenciasPendientes,
                    incidenciasAprobadas,
                    diasLaboralesIncidenciasAprobadas: this.redondear(diasLaboralesIncidenciasAprobadas, 1),
                },
                desgloseEstatusEmpleado: [
                    { estatus: 'Activo', total: activos },
                    { estatus: 'Inactivo / Baja', total: inactivos },
                ],
                movimientosPorTipo: this.agruparMovimientosPorTipo(movimientos),
                incidenciasPorTipo: this.agruparIncidenciasPorTipo(incidencias),
                porArea: this.calcularPorArea(empleados, movimientos, incidencias),
                tendenciaMensual: this.construirTendenciaMensual(tendencia, desde, hasta),
                movimientosRecientes: movimientos.slice(0, 10).map((m) => ({
                    idMovimiento: m.idMovimiento,
                    idEmpleado: m.idEmpleado,
                    numeroEmpleado: m.numeroEmpleado,
                    nombreEmpleado: m.nombreEmpleado,
                    tipoMovimiento: m.tipoMovimiento,
                    area: m.nombreArea,
                    puesto: m.puesto,
                    estatus: m.estatus,
                    fechaEfectiva: this.toDateString(m.fechaEfectiva),
                    motivo: m.motivo,
                    causaBaja: m.causaBaja,
                    diferenciaSalarioBruto: this.toNumber(m.diferenciaSalarioBruto),
                })),
                incidenciasRecientes: incidencias.slice(0, 10).map((i) => ({
                    idSolicitud: i.idSolicitud,
                    idEmpleado: i.idEmpleado,
                    numeroEmpleado: i.numeroEmpleado,
                    nombreEmpleado: i.nombreEmpleado,
                    tipoMovimiento: i.tipoMovimiento,
                    origenSolicitud: i.origenSolicitud,
                    area: i.nombreArea,
                    estatus: i.estatus,
                    fechaInicio: this.toDateString(i.fechaInicio),
                    fechaFin: this.toDateString(i.fechaFin),
                    totalDiasLaborales: this.toNumber(i.totalDiasLaborales) ?? 0,
                })),
                opciones,
            };
        } catch (err) {
            if (err instanceof BadRequestException || err instanceof NotFoundException) {
                throw err;
            }
            this.logger.error('Error calculando métricas del dashboard de administración de personal', err);
            throw new InternalServerErrorException('No se pudieron calcular las métricas del dashboard.');
        }
    }

    private async obtenerEmpleados(f: Filtros): Promise<EmpleadoRow[]> {
        const condArea = f.idArea ? Prisma.sql`AND p.idArea = ${f.idArea}` : Prisma.empty;
        const condSite = f.idSite ? Prisma.sql`AND e.idSite = ${f.idSite}` : Prisma.empty;
        const condEstatus =
            f.estatusEmpleado === 'ACTIVO'
                ? Prisma.sql`AND e.activo = 1`
                : f.estatusEmpleado === 'INACTIVO'
                    ? Prisma.sql`AND e.activo = 0`
                    : Prisma.empty;

        return this.prisma.$queryRaw<EmpleadoRow[]>(Prisma.sql`
      SELECT
        e.idEmpleado,
        p.idArea,
        COALESCE(a.Descripcion, 'Sin Área') AS area,
        e.activo,
        e.fechaIngreso,
        CASE
          WHEN e.activo = 1 AND e.fechaIngreso >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) THEN 1
          ELSE 0
        END AS esNuevoIngreso30d
      FROM Empleados e
      INNER JOIN CatEmpresas ce ON e.idEmpresa = ce.idEmpresa
      LEFT JOIN CatPuestos p ON e.idPuesto = p.idPuesto
      LEFT JOIN CatAreas a ON p.idArea = a.idArea
      WHERE e.idEmpresa = ${f.companyId}
        AND (e.idTenant = ${f.idTenant} OR e.idTenant IS NULL)
        ${condArea}
        ${condSite}
        ${condEstatus}
    `);
    }

    private async obtenerMovimientos(f: Filtros): Promise<MovimientoRow[]> {
        const condArea = f.idArea
            ? Prisma.sql`AND COALESCE(mi.idAreaNueva, mi.idAreaAnterior, p.idArea) = ${f.idArea}`
            : Prisma.empty;
        const condSite = f.idSite ? Prisma.sql`AND e.idSite = ${f.idSite}` : Prisma.empty;

        return this.prisma.$queryRaw<MovimientoRow[]>(Prisma.sql`
      SELECT
        mi.idMovimiento,
        mi.idEmpleado,
        e.numeroEmpleado,
        TRIM(CONCAT(e.nombre, ' ', e.primerApellido, ' ', COALESCE(e.segundoApellido, ''))) AS nombreEmpleado,
        COALESCE(ctm.codigo, 'MOVIMIENTO') AS codigoMovimiento,
        COALESCE(ctm.nombre, 'Movimiento Interno') AS tipoMovimiento,
        mi.estatus,
        CASE WHEN mi.estatus = ${ESTATUS_PENDIENTE} THEN 1 ELSE 0 END AS esPendiente,
        CASE WHEN mi.estatus = ${ESTATUS_APROBADO} THEN 1 ELSE 0 END AS esAprobada,
        COALESCE(mi.idAreaNueva, mi.idAreaAnterior, p.idArea) AS idArea,
        COALESCE(areaNueva.Descripcion, areaAnt.Descripcion, a.Descripcion, 'Sin Área') AS nombreArea,
        COALESCE(puestoNuevo.NombrePuesto, puestoAnt.NombrePuesto, p.NombrePuesto, 'Sin Puesto') AS puesto,
        mi.fechaEfectiva,
        mi.motivo,
        mi.causaBaja,
        (mi.salarioBrutoNuevo - mi.salarioBrutoAnterior) AS diferenciaSalarioBruto
      FROM MovimientosInternos mi
      INNER JOIN Empleados e ON mi.idEmpleado = e.idEmpleado
      INNER JOIN CatEmpresas ce ON mi.idEmpresa = ce.idEmpresa
      LEFT JOIN CatPuestos p ON e.idPuesto = p.idPuesto
      LEFT JOIN CatAreas a ON p.idArea = a.idArea
      LEFT JOIN CatTipoMovimiento ctm ON mi.idTipoMovimiento = ctm.idTipoMovimiento
      LEFT JOIN CatAreas areaNueva ON mi.idAreaNueva = areaNueva.idArea
      LEFT JOIN CatAreas areaAnt ON mi.idAreaAnterior = areaAnt.idArea
      LEFT JOIN CatPuestos puestoNuevo ON mi.idPuestoNuevo = puestoNuevo.idPuesto
      LEFT JOIN CatPuestos puestoAnt ON mi.idPuestoAnterior = puestoAnt.idPuesto
      WHERE mi.idEmpresa = ${f.companyId}
        AND (mi.idTenant = ${f.idTenant} OR mi.idTenant IS NULL)
        AND DATE(COALESCE(mi.fechaEfectiva, mi.fechaRegistro)) BETWEEN ${f.desde} AND ${f.hasta}
        ${condArea}
        ${condSite}
      ORDER BY COALESCE(mi.fechaEfectiva, mi.fechaRegistro) DESC, mi.idMovimiento DESC
    `);
    }

    private async obtenerIncidencias(f: Filtros): Promise<IncidenciaRow[]> {
        const condArea = f.idArea ? Prisma.sql`AND p.idArea = ${f.idArea}` : Prisma.empty;
        const condSite = f.idSite ? Prisma.sql`AND e.idSite = ${f.idSite}` : Prisma.empty;

        return this.prisma.$queryRaw<IncidenciaRow[]>(Prisma.sql`
      SELECT
        si.idSolicitud,
        si.idEmpleado,
        e.numeroEmpleado,
        TRIM(CONCAT(e.nombre, ' ', e.primerApellido, ' ', COALESCE(e.segundoApellido, ''))) AS nombreEmpleado,
        COALESCE(ctm.codigo, 'SIN_TIPO') AS codigoMovimiento,
        COALESCE(ctm.nombre, 'Sin Tipo') AS tipoMovimiento,
        CASE
          WHEN si.solicitadoPorIdEmpleado = si.idEmpleado THEN 'Autogestión (Empleado)'
          ELSE 'Jefe / Líder'
        END AS origenSolicitud,
        p.idArea,
        COALESCE(a.Descripcion, 'Sin Área') AS nombreArea,
        si.estatus,
        CASE WHEN si.estatus = ${ESTATUS_PENDIENTE} THEN 1 ELSE 0 END AS esPendiente,
        CASE WHEN si.estatus = ${ESTATUS_APROBADO} THEN 1 ELSE 0 END AS esAprobada,
        si.fechaInicio,
        si.fechaFin,
        COALESCE(si.totalDiasLaborales, 0) AS totalDiasLaborales
      FROM SolicitudesIncidencias si
      INNER JOIN Empleados e ON si.idEmpleado = e.idEmpleado
      INNER JOIN CatEmpresas ce ON si.idEmpresa = ce.idEmpresa
      LEFT JOIN CatPuestos p ON e.idPuesto = p.idPuesto
      LEFT JOIN CatAreas a ON p.idArea = a.idArea
      LEFT JOIN CatTipoMovimiento ctm ON si.idTipoMovimiento = ctm.idTipoMovimiento
      WHERE si.idEmpresa = ${f.companyId}
        AND (si.idTenant = ${f.idTenant} OR si.idTenant IS NULL)
        AND DATE(COALESCE(si.fechaInicio, si.fechaRegistro)) <= ${f.hasta}
        AND DATE(COALESCE(si.fechaFin, si.fechaRegistro)) >= ${f.desde}
        ${condArea}
        ${condSite}
      ORDER BY COALESCE(si.fechaInicio, si.fechaRegistro) DESC, si.idSolicitud DESC
    `);
    }

    private async obtenerTendencia(f: Filtros): Promise<TendenciaRow[]> {
        const condAreaEmp = f.idArea ? Prisma.sql`AND p.idArea = ${f.idArea}` : Prisma.empty;
        const condSiteEmp = f.idSite ? Prisma.sql`AND e.idSite = ${f.idSite}` : Prisma.empty;
        const condAreaMov = f.idArea
            ? Prisma.sql`AND COALESCE(mi.idAreaNueva, mi.idAreaAnterior) = ${f.idArea}`
            : Prisma.empty;
        const condSiteMov = f.idSite ? Prisma.sql`AND e.idSite = ${f.idSite}` : Prisma.empty;

        return this.prisma.$queryRaw<TendenciaRow[]>(Prisma.sql`
      SELECT
        DATE_FORMAT(e.fechaIngreso, '%Y-%m-01') AS mesEvento,
        'Ingresos' AS tipoEvento,
        COUNT(*) AS cantidad
      FROM Empleados e
      LEFT JOIN CatPuestos p ON e.idPuesto = p.idPuesto
      WHERE e.idEmpresa = ${f.companyId}
        AND (e.idTenant = ${f.idTenant} OR e.idTenant IS NULL)
        AND e.fechaIngreso IS NOT NULL
        AND DATE(e.fechaIngreso) BETWEEN ${f.desde} AND ${f.hasta}
        ${condAreaEmp}
        ${condSiteEmp}
      GROUP BY DATE_FORMAT(e.fechaIngreso, '%Y-%m-01')

      UNION ALL

      SELECT
        DATE_FORMAT(mi.fechaEfectiva, '%Y-%m-01') AS mesEvento,
        'Bajas' AS tipoEvento,
        COUNT(*) AS cantidad
      FROM MovimientosInternos mi
      LEFT JOIN Empleados e ON mi.idEmpleado = e.idEmpleado
      LEFT JOIN CatTipoMovimiento ctm ON mi.idTipoMovimiento = ctm.idTipoMovimiento
      WHERE mi.idEmpresa = ${f.companyId}
        AND (mi.idTenant = ${f.idTenant} OR mi.idTenant IS NULL)
        AND ctm.codigo = ${CODIGO_BAJA}
        AND mi.estatus = ${ESTATUS_APROBADO}
        AND mi.fechaEfectiva IS NOT NULL
        AND DATE(mi.fechaEfectiva) BETWEEN ${f.desde} AND ${f.hasta}
        ${condAreaMov}
        ${condSiteMov}
      GROUP BY DATE_FORMAT(mi.fechaEfectiva, '%Y-%m-01')
    `);
    }

    private async obtenerOpciones(f: Filtros) {
        const [areas, ubicaciones] = await Promise.all([
            this.prisma.catAreas.findMany({
                where: { Activo: true, OR: [{ idTenant: f.idTenant }] },
                select: { idArea: true, Descripcion: true },
                orderBy: { Descripcion: 'asc' },
            }),
            this.prisma.catSites.findMany({
                where: { Activo: true, OR: [{ idTenant: f.idTenant }] },
                select: { idSite: true, Descripcion: true },
                orderBy: { Descripcion: 'asc' },
            }),
        ]);

        return {
            areas: areas.map((a) => ({ idArea: a.idArea, nombre: a.Descripcion ?? 'Sin Área' })),
            ubicaciones: ubicaciones.map((u) => ({ idSite: u.idSite, nombre: u.Descripcion ?? 'Sin Ubicación' })),
        };
    }

    private agruparMovimientosPorTipo(movimientos: MovimientoRow[]) {
        const mapa = new Map<string, { codigo: string; tipo: string; total: number; pendientes: number; aprobados: number }>();
        for (const m of movimientos) {
            const actual = mapa.get(m.codigoMovimiento) ?? {
                codigo: m.codigoMovimiento,
                tipo: m.tipoMovimiento,
                total: 0,
                pendientes: 0,
                aprobados: 0,
            };
            actual.total += 1;
            actual.pendientes += this.toNumber(m.esPendiente) ?? 0;
            actual.aprobados += this.toNumber(m.esAprobada) ?? 0;
            mapa.set(m.codigoMovimiento, actual);
        }
        return Array.from(mapa.values()).sort((a, b) => b.total - a.total);
    }

    private agruparIncidenciasPorTipo(incidencias: IncidenciaRow[]) {
        const mapa = new Map<
            string,
            { codigo: string; tipo: string; total: number; pendientes: number; aprobadas: number; diasLaborales: number }
        >();
        for (const i of incidencias) {
            const actual = mapa.get(i.codigoMovimiento) ?? {
                codigo: i.codigoMovimiento,
                tipo: i.tipoMovimiento,
                total: 0,
                pendientes: 0,
                aprobadas: 0,
                diasLaborales: 0,
            };
            actual.total += 1;
            actual.pendientes += this.toNumber(i.esPendiente) ?? 0;
            actual.aprobadas += this.toNumber(i.esAprobada) ?? 0;
            actual.diasLaborales += this.toNumber(i.totalDiasLaborales) ?? 0;
            mapa.set(i.codigoMovimiento, actual);
        }
        return Array.from(mapa.values()).sort((a, b) => b.total - a.total);
    }

    private calcularPorArea(empleados: EmpleadoRow[], movimientos: MovimientoRow[], incidencias: IncidenciaRow[]) {
        const mapa = new Map<
            string,
            {
                idArea: number | null;
                area: string;
                activos: number;
                inactivos: number;
                nuevosIngresos30d: number;
                movimientos: number;
                incidencias: number;
            }
        >();

        const getOrCreate = (idArea: number | null, nombre: string) => {
            const key = String(idArea ?? 'sin-area');
            const existing = mapa.get(key);
            if (existing) return existing;
            const created = {
                idArea,
                area: nombre,
                activos: 0,
                inactivos: 0,
                nuevosIngresos30d: 0,
                movimientos: 0,
                incidencias: 0,
            };
            mapa.set(key, created);
            return created;
        };

        for (const e of empleados) {
            const entry = getOrCreate(e.idArea, e.area);
            if (Number(e.activo) === 1) entry.activos += 1;
            else entry.inactivos += 1;
            entry.nuevosIngresos30d += this.toNumber(e.esNuevoIngreso30d) ?? 0;
        }

        for (const m of movimientos) {
            const entry = getOrCreate(m.idArea, m.nombreArea);
            entry.movimientos += 1;
        }

        for (const i of incidencias) {
            const entry = getOrCreate(i.idArea, i.nombreArea);
            entry.incidencias += 1;
        }

        return Array.from(mapa.values()).sort((a, b) => b.activos - a.activos);
    }

    private construirTendenciaMensual(rows: TendenciaRow[], desde: string, hasta: string) {
        const meses = new Map<string, { mes: string; ingresos: number; bajas: number }>();

        const inicio = new Date(`${desde.slice(0, 7)}-01T00:00:00Z`);
        const fin = new Date(`${hasta.slice(0, 7)}-01T00:00:00Z`);
        const cursor = new Date(inicio);

        while (cursor <= fin) {
            const key = cursor.toISOString().slice(0, 7) + '-01';
            meses.set(key, { mes: key, ingresos: 0, bajas: 0 });
            cursor.setUTCMonth(cursor.getUTCMonth() + 1);
        }

        for (const r of rows) {
            const entry = meses.get(r.mesEvento);
            if (!entry) continue;
            const qty = this.toNumber(r.cantidad) ?? 0;
            if (r.tipoEvento === 'Ingresos') entry.ingresos += qty;
            if (r.tipoEvento === 'Bajas') entry.bajas += qty;
        }

        return Array.from(meses.values());
    }

    private resolverPeriodo(desde?: string, hasta?: string): { desde: string; hasta: string } {
        const hoy = new Date().toISOString().slice(0, 10);
        const inicioAnio = `${hoy.slice(0, 4)}-01-01`;
        const d = desde?.trim() || inicioAnio;
        const h = hasta?.trim() || hoy;

        if (!FECHA_REGEX.test(d) || !FECHA_REGEX.test(h)) {
            throw new BadRequestException('Las fechas deben tener el formato YYYY-MM-DD.');
        }
        if (d > h) {
            throw new BadRequestException('La fecha inicial no puede ser posterior a la final.');
        }
        const diffDias = (new Date(`${h}T00:00:00Z`).getTime() - new Date(`${d}T00:00:00Z`).getTime()) / DIA_MS;
        if (diffDias > MAX_DIAS_PERIODO) {
            throw new BadRequestException('El periodo no puede exceder los 3 años.');
        }
        return { desde: d, hasta: h };
    }

    private toDateString(val: Date | string | null | undefined): string | null {
        if (!val) return null;
        if (val instanceof Date) return val.toISOString().slice(0, 10);
        return String(val).slice(0, 10);
    }

    private toNumber(val: unknown): number | null {
        if (val === null || val === undefined) return null;
        if (typeof val === 'bigint') return Number(val);
        const n = Number(val);
        return Number.isFinite(n) ? n : null;
    }

    private redondear(n: number, decimales: number): number {
        const factor = 10 ** decimales;
        return Math.round(n * factor) / factor;
    }
}