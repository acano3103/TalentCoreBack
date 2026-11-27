import { BadRequestException, Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from 'generated/prisma/client';
import { ActiveUserDto } from 'src/modules/auth/dto/active-user.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { OrganizationalDashboardQueryDto } from './dto/organizational-dashboard.dto';
import { OrganizationalDashboardResponseDto } from './dto/organizational-dashboard-response.dto';

// Los catálogos se identifican por nombre o código, nunca por id
const ESTATUS_REQUISICION = ['PENDIENTE MANAGER', 'APROBADO MANAGER', 'PENDIENTE RH'];
const ESTATUS_VACANTE_ABIERTA = ['APROBADO RH'];
const CODIGO_BAJA = 'BAJA_PERSONAL';
const MOVIMIENTO_APROBADO = 'APROBADA';

const FECHA_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const DIA_MS = 24 * 60 * 60 * 1000;
const MAX_DIAS_PERIODO = 3 * 366;

interface Filtros {
    idTenant: number;
    companyId: number;
    desde: string;
    hasta: string;
    idArea: number | null;
    idSite: number | null;
    nivel: string | null;
}

interface EmpleadoRaw {
    idArea: number | null;
    area: string | null;
    idSite: number | null;
    ubicacion: string | null;
    nivel: string | null;
    contrato: string | null;
}

interface VacanteRaw {
    idArea: number | null;
    area: string | null;
    idSite: number | null;
    ubicacion: string | null;
    estatus: string | null;
    posiciones: unknown;
}

interface PresupuestoRaw {
    idArea: number;
    area: string | null;
    asignado: unknown;
    ejecutado: unknown;
}

@Injectable()
export class OrganizationalDashboardService {
    private readonly logger = new Logger(OrganizationalDashboardService.name);

    constructor(private readonly prisma: PrismaService) { }

    async getMetrics(user: ActiveUserDto, companyId: number, q: OrganizationalDashboardQueryDto): Promise<OrganizationalDashboardResponseDto> {
        if (!user.idTenant) {
            throw new InternalServerErrorException('El usuario no tiene un tenant asignado.');
        }
        const empresa = await this.prisma.catEmpresas.findFirst({
            where: { idEmpresa: companyId, OR: [{ idTenant: user.idTenant }, { idTenant: null }] },
            select: { idEmpresa: true },
        });
        if (!empresa) throw new NotFoundException('No se encontró la empresa.');

        const { desde, hasta } = this.resolverPeriodo(q.desde, q.hasta);
        const f: Filtros = {
            idTenant: user.idTenant,
            companyId,
            desde,
            hasta,
            idArea: q.idArea ?? null,
            idSite: q.idSite ?? null,
            nivel: q.nivel?.trim() || null,
        };

        try {
            const [empleados, vacantes, presupuesto, ingresos, bajas, plantillaInicio, opciones] = await Promise.all([
                this.empleadosActivos(f),
                this.vacantesVigentes(f),
                this.presupuestoPorArea(f),
                this.ingresosDelPeriodo(f),
                this.bajasDelPeriodo(f),
                this.plantillaAlInicio(f),
                this.opciones(f),
            ]);

            const vacantesAbiertas = this.sumaPosiciones(vacantes.filter((v) => this.esVacanteAbierta(v.estatus)));
            const requisiciones = vacantes.filter((v) => this.esRequisicion(v.estatus));
            const posicionesEnRequisicion = this.sumaPosiciones(requisiciones);
            const ocupadas = empleados.length;
            const autorizadas = ocupadas + posicionesEnRequisicion + vacantesAbiertas;
            const plantillaPromedio = (plantillaInicio + ocupadas) / 2;

            return {
                periodo: { desde, hasta },
                kpis: {
                    plantillaActiva: ocupadas,
                    posicionesAutorizadas: autorizadas,
                    vacantesAbiertas,
                    requisicionesEnRevision: requisiciones.length,
                    posicionesEnRequisicion,
                    ocupacion: this.porcentaje(ocupadas, autorizadas),
                    ingresos: ingresos.length,
                    bajas: bajas.length,
                    plantillaInicio,
                    rotacion: this.porcentaje(bajas.length, plantillaPromedio),
                    presupuestoAsignado: this.redondear(presupuesto.reduce((s, p) => s + (this.toNumber(p.asignado) ?? 0), 0), 2),
                    presupuestoEjecutado: this.redondear(presupuesto.reduce((s, p) => s + (this.toNumber(p.ejecutado) ?? 0), 0), 2),
                },
                estadoPosiciones: [
                    { estado: 'ocupada', posiciones: ocupadas },
                    { estado: 'requisicion', posiciones: posicionesEnRequisicion },
                    { estado: 'vacante', posiciones: vacantesAbiertas },
                ],
                porArea: this.calcularPorArea(empleados, vacantes, presupuesto),
                porNivel: this.contarPor(empleados, (e) => e.nivel || 'Sin nivel').map(([nivel, plantilla]) => ({ nivel, plantilla })),
                porContrato: this.contarPor(empleados, (e) => e.contrato || 'Sin tipo de contrato').map(([contrato, plantilla]) => ({ contrato, plantilla })),
                porUbicacion: this.calcularPorUbicacion(empleados, vacantes),
                tendenciaMensual: this.calcularTendencia(ingresos, bajas, desde, hasta),
                opciones,
            };
        } catch (error) {
            this.logger.error(`Error procesando el dashboard de estructura organizacional para empresa ${companyId}`, error);
            throw error;
        }
    }

    // ---------- Consultas ----------

    // Filtros comunes; cada consulta indica de qué columnas sale el área, la ubicación y el nivel
    private filtrosSql(f: Filtros, area: string, site: string, nivel: string | null) {
        return Prisma.sql`
            ${f.idArea ? Prisma.sql`AND ${Prisma.raw(area)} = ${f.idArea}` : Prisma.empty}
            ${f.idSite ? Prisma.sql`AND ${Prisma.raw(site)} = ${f.idSite}` : Prisma.empty}
            ${f.nivel && nivel ? Prisma.sql`AND ${Prisma.raw(nivel)} = ${f.nivel}` : Prisma.empty}
        `;
    }

    private empleadosActivos(f: Filtros) {
        return this.prisma.$queryRaw<EmpleadoRaw[]>`
            SELECT pu.idArea, a.Descripcion AS area, e.idSite, s.Descripcion AS ubicacion,
                tp.Descripcion AS nivel, tc.Descripcion AS contrato
            FROM Empleados e
            LEFT JOIN CatPuestos pu ON pu.idPuesto = e.idPuesto
            LEFT JOIN CatAreas a ON a.idArea = pu.idArea
            LEFT JOIN CatSites s ON s.idSite = e.idSite
            LEFT JOIN CatTipoPuesto tp ON tp.idTipoPuesto = pu.idTipoPuesto
            LEFT JOIN CatTipoContratacion tc ON tc.idTipoContratacion = pu.idTipoContratacion
            WHERE e.idEmpresa = ${f.companyId} AND e.idTenant = ${f.idTenant} AND e.activo = 1
            ${this.filtrosSql(f, 'pu.idArea', 'e.idSite', 'tp.Descripcion')}
        `;
    }

    // Requisiciones en revisión y vacantes abiertas (foto actual, sin periodo)
    private vacantesVigentes(f: Filtros) {
        return this.prisma.$queryRaw<VacanteRaw[]>`
            SELECT pu.idArea, a.Descripcion AS area, v.idSite, s.Descripcion AS ubicacion,
                UPPER(TRIM(ev.decripcion)) AS estatus, v.numeroVacantes AS posiciones
            FROM Vacantes v
            INNER JOIN CatEstatusVacante ev ON ev.idEstatusVacante = v.idEstatusVacante
            LEFT JOIN CatPuestos pu ON pu.idPuesto = v.idPuesto
            LEFT JOIN CatAreas a ON a.idArea = pu.idArea
            LEFT JOIN CatSites s ON s.idSite = v.idSite
            LEFT JOIN CatTipoPuesto tp ON tp.idTipoPuesto = pu.idTipoPuesto
            WHERE v.idEmpresa = ${f.companyId}
                AND (v.idTenant = ${f.idTenant} OR v.idTenant IS NULL)
                AND UPPER(TRIM(ev.decripcion)) IN (${Prisma.join([...ESTATUS_REQUISICION, ...ESTATUS_VACANTE_ABIERTA])})
            ${this.filtrosSql(f, 'pu.idArea', 'v.idSite', 'tp.Descripcion')}
        `;
    }

    // Una fila por área (suma de sus ubicaciones activas); el nivel no aplica al presupuesto
    private presupuestoPorArea(f: Filtros) {
        return this.prisma.$queryRaw<PresupuestoRaw[]>`
            SELECT ra.idArea, a.Descripcion AS area,
                SUM(COALESCE(ra.PresupuestoAsignado, 0)) AS asignado,
                SUM(COALESCE(ra.PresupuestoEjecutado, 0)) AS ejecutado
            FROM RelAreasUbicaciones ra
            INNER JOIN CatAreas a ON a.idArea = ra.idArea
            WHERE a.idEmpresa = ${f.companyId}
                AND (a.idTenant = ${f.idTenant} OR a.idTenant IS NULL)
                AND (ra.Activo IS NULL OR ra.Activo = 1)
            ${this.filtrosSql(f, 'ra.idArea', 'ra.idSite', null)}
            GROUP BY ra.idArea, a.Descripcion
        `;
    }

    private ingresosDelPeriodo(f: Filtros) {
        return this.prisma.$queryRaw<{ fecha: Date }[]>`
            SELECT COALESCE(e.fechaIngreso, DATE(e.FechaRegistro)) AS fecha
            FROM Empleados e
            LEFT JOIN CatPuestos pu ON pu.idPuesto = e.idPuesto
            LEFT JOIN CatTipoPuesto tp ON tp.idTipoPuesto = pu.idTipoPuesto
            WHERE e.idEmpresa = ${f.companyId} AND e.idTenant = ${f.idTenant}
                AND COALESCE(e.fechaIngreso, DATE(e.FechaRegistro)) BETWEEN ${f.desde} AND ${f.hasta}
            ${this.filtrosSql(f, 'pu.idArea', 'e.idSite', 'tp.Descripcion')}
        `;
    }

    // Bajas autorizadas en movimientos internos; área y puesto de antes de la baja
    private bajasDelPeriodo(f: Filtros) {
        return this.prisma.$queryRaw<{ fecha: Date }[]>`
            SELECT mi.fechaEfectiva AS fecha
            FROM MovimientosInternos mi
            INNER JOIN CatTipoMovimiento ctm ON ctm.idTipoMovimiento = mi.idTipoMovimiento
            INNER JOIN Empleados e ON e.idEmpleado = mi.idEmpleado
            LEFT JOIN CatPuestos pu ON pu.idPuesto = COALESCE(mi.idPuestoAnterior, e.idPuesto)
            LEFT JOIN CatTipoPuesto tp ON tp.idTipoPuesto = pu.idTipoPuesto
            WHERE mi.idEmpresa = ${f.companyId} AND e.idTenant = ${f.idTenant}
                AND ctm.codigo = ${CODIGO_BAJA} AND mi.estatus = ${MOVIMIENTO_APROBADO}
                AND DATE(mi.fechaEfectiva) BETWEEN ${f.desde} AND ${f.hasta}
            ${this.filtrosSql(f, 'COALESCE(mi.idAreaAnterior, pu.idArea)', 'e.idSite', 'tp.Descripcion')}
        `;
    }

    // Empleados que ya estaban antes del periodo: activos hoy o dados de baja dentro o después del periodo
    private async plantillaAlInicio(f: Filtros): Promise<number> {
        const [fila] = await this.prisma.$queryRaw<{ total: unknown }[]>`
            SELECT COUNT(*) AS total
            FROM Empleados e
            LEFT JOIN CatPuestos pu ON pu.idPuesto = e.idPuesto
            LEFT JOIN CatTipoPuesto tp ON tp.idTipoPuesto = pu.idTipoPuesto
            WHERE e.idEmpresa = ${f.companyId} AND e.idTenant = ${f.idTenant}
                AND COALESCE(e.fechaIngreso, DATE(e.FechaRegistro)) < ${f.desde}
                AND (e.activo = 1 OR EXISTS (
                    SELECT 1 FROM MovimientosInternos mi
                    INNER JOIN CatTipoMovimiento ctm ON ctm.idTipoMovimiento = mi.idTipoMovimiento
                    WHERE mi.idEmpleado = e.idEmpleado AND ctm.codigo = ${CODIGO_BAJA}
                        AND mi.estatus = ${MOVIMIENTO_APROBADO} AND DATE(mi.fechaEfectiva) >= ${f.desde}
                ))
            ${this.filtrosSql(f, 'pu.idArea', 'e.idSite', 'tp.Descripcion')}
        `;
        return this.toNumber(fila?.total) ?? 0;
    }

    private async opciones(f: Filtros) {
        const [areas, niveles, ubicaciones] = await Promise.all([
            this.prisma.$queryRaw<{ idArea: number; nombre: string | null }[]>`
                SELECT a.idArea, a.Descripcion AS nombre
                FROM CatAreas a
                WHERE a.idEmpresa = ${f.companyId}
                    AND (a.idTenant = ${f.idTenant} OR a.idTenant IS NULL)
                    AND (a.Activo IS NULL OR a.Activo = 1)
                ORDER BY a.Descripcion ASC
            `,
            this.prisma.$queryRaw<{ nombre: string }[]>`
                SELECT tp.Descripcion AS nombre
                FROM CatTipoPuesto tp
                WHERE (tp.Activo IS NULL OR tp.Activo = 1) AND tp.Descripcion IS NOT NULL
                ORDER BY tp.idTipoPuesto ASC
            `,
            this.prisma.$queryRaw<{ idSite: number; nombre: string | null }[]>`
                SELECT s.idSite, s.Descripcion AS nombre
                FROM CatSites s
                WHERE s.idEmpresa = ${f.companyId}
                    AND (s.idTenant = ${f.idTenant} OR s.idTenant = 0)
                    AND (s.Activo IS NULL OR s.Activo = 1)
                ORDER BY s.Descripcion ASC
            `,
        ]);
        return {
            areas: areas.map((a) => ({ idArea: Number(a.idArea), nombre: a.nombre || `Área #${a.idArea}` })),
            niveles: niveles.map((n) => ({ nombre: n.nombre })),
            ubicaciones: ubicaciones.map((s) => ({ idSite: Number(s.idSite), nombre: s.nombre || `Ubicación #${s.idSite}` })),
        };
    }

    // ---------- Cálculos ----------

    private esRequisicion(estatus: string | null) {
        return !!estatus && ESTATUS_REQUISICION.includes(estatus);
    }

    private esVacanteAbierta(estatus: string | null) {
        return !!estatus && ESTATUS_VACANTE_ABIERTA.includes(estatus);
    }

    private sumaPosiciones(vacantes: VacanteRaw[]) {
        return vacantes.reduce((s, v) => s + (this.toNumber(v.posiciones) ?? 0), 0);
    }

    private calcularPorArea(empleados: EmpleadoRaw[], vacantes: VacanteRaw[], presupuesto: PresupuestoRaw[]) {
        const grupos = new Map<string, { idArea: number | null; area: string; plantilla: number; vacantesAbiertas: number; enRequisicion: number; presupuestoAsignado: number }>();
        const grupo = (idArea: number | null, area: string | null) => {
            const id = idArea === null || idArea === undefined ? null : Number(idArea);
            const clave = id === null ? 'sin-area' : String(id);
            if (!grupos.has(clave)) {
                grupos.set(clave, { idArea: id, area: id === null ? 'Sin área' : area || `Área #${id}`, plantilla: 0, vacantesAbiertas: 0, enRequisicion: 0, presupuestoAsignado: 0 });
            }
            return grupos.get(clave)!;
        };
        for (const e of empleados) grupo(e.idArea, e.area).plantilla++;
        for (const v of vacantes) {
            const posiciones = this.toNumber(v.posiciones) ?? 0;
            if (this.esVacanteAbierta(v.estatus)) grupo(v.idArea, v.area).vacantesAbiertas += posiciones;
            else if (this.esRequisicion(v.estatus)) grupo(v.idArea, v.area).enRequisicion += posiciones;
        }
        for (const p of presupuesto) grupo(p.idArea, p.area).presupuestoAsignado += this.toNumber(p.asignado) ?? 0;

        return [...grupos.values()]
            .map((g) => {
                const autorizadas = g.plantilla + g.vacantesAbiertas + g.enRequisicion;
                return { ...g, presupuestoAsignado: this.redondear(g.presupuestoAsignado, 2), autorizadas, ocupacion: this.porcentaje(g.plantilla, autorizadas) };
            })
            .sort((a, b) => b.plantilla - a.plantilla || a.area.localeCompare(b.area, 'es'));
    }

    private calcularPorUbicacion(empleados: EmpleadoRaw[], vacantes: VacanteRaw[]) {
        const grupos = new Map<string, { idSite: number | null; ubicacion: string; plantilla: number; vacantesAbiertas: number }>();
        const grupo = (idSite: number | null, ubicacion: string | null) => {
            const id = idSite === null || idSite === undefined ? null : Number(idSite);
            const clave = id === null ? 'sin-ubicacion' : String(id);
            if (!grupos.has(clave)) {
                grupos.set(clave, { idSite: id, ubicacion: id === null ? 'Sin ubicación' : ubicacion || `Ubicación #${id}`, plantilla: 0, vacantesAbiertas: 0 });
            }
            return grupos.get(clave)!;
        };
        for (const e of empleados) grupo(e.idSite, e.ubicacion).plantilla++;
        for (const v of vacantes) {
            if (this.esVacanteAbierta(v.estatus)) grupo(v.idSite, v.ubicacion).vacantesAbiertas += this.toNumber(v.posiciones) ?? 0;
        }
        return [...grupos.values()].sort((a, b) => b.plantilla - a.plantilla || a.ubicacion.localeCompare(b.ubicacion, 'es'));
    }

    private contarPor<T>(filas: T[], clave: (f: T) => string): [string, number][] {
        const conteo = new Map<string, number>();
        for (const f of filas) conteo.set(clave(f), (conteo.get(clave(f)) ?? 0) + 1);
        return [...conteo.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es'));
    }

    private calcularTendencia(ingresos: { fecha: Date }[], bajas: { fecha: Date }[], desde: string, hasta: string) {
        const meses = new Map<string, { ingresos: number; bajas: number }>();
        let [y, m] = desde.split('-').map(Number);
        const [yFin, mFin] = hasta.split('-').map(Number);
        while (y < yFin || (y === yFin && m <= mFin)) {
            meses.set(`${y}-${String(m).padStart(2, '0')}`, { ingresos: 0, bajas: 0 });
            m++;
            if (m > 12) { m = 1; y++; }
        }
        for (const i of ingresos) {
            const mes = i.fecha ? meses.get(this.claveMes(new Date(i.fecha))) : undefined;
            if (mes) mes.ingresos++;
        }
        for (const b of bajas) {
            const mes = b.fecha ? meses.get(this.claveMes(new Date(b.fecha))) : undefined;
            if (mes) mes.bajas++;
        }
        return [...meses.entries()].map(([mes, v]) => ({ mes, ...v }));
    }

    // ---------- Utilidades ----------

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
        if (Math.round((fin - inicio) / DIA_MS) + 1 > MAX_DIAS_PERIODO) throw new BadRequestException('El periodo no puede ser mayor a 3 años.');
        return { desde, hasta };
    }

    // Las fechas DATE llegan como medianoche UTC desde Prisma
    private claveMes(fecha: Date): string {
        return `${fecha.getUTCFullYear()}-${String(fecha.getUTCMonth() + 1).padStart(2, '0')}`;
    }

    private toNumber(v: unknown): number | null {
        if (v === null || v === undefined) return null;
        const n = Number(typeof v === 'object' ? String(v) : v);
        return Number.isFinite(n) ? n : null;
    }

    private porcentaje(parte: number, total: number): number {
        return total > 0 ? this.redondear((parte / total) * 100) : 0;
    }

    private redondear(n: number, decimales = 1): number {
        const f = 10 ** decimales;
        return Math.round(n * f) / f;
    }
}
