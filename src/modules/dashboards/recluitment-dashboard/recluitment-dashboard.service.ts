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
import { RecruitmentDashboardQueryDto } from './dto/recruitment-dashboard-query.dto';
import { RecruitmentDashboardResponseDto } from './dto/recruitment-dashboard-response.dto';

const FECHA_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const DIA_MS = 24 * 60 * 60 * 1000;
const MAX_DIAS_PERIODO = 3 * 366;

type TipoRegistroVacante =
    | 'Vacante Abierta'
    | 'Requisición en Revisión'
    | 'Cerrada'
    | 'Rechazada por Manager'
    | 'Rechazada por RH'
    | 'Cancelada'
    | 'Otro';

interface Filtros {
    idTenant: number;
    companyId: number;
    desde: string;
    hasta: string;
    idArea: number | null;
    idSite: number | null;
    idPuesto: number | null;
    estatusVacante: 'TODOS' | 'ABIERTA' | 'REQUISICION' | 'CERRADA' | 'RECHAZADA_CANCELADA';
}

interface VacantePostulacionRaw {
    idVacante: number;
    idPostulacion: number | null;
    idSite: number | null;
    servicioUbicacion: string;
    idArea: number | null;
    area: string;
    idPuesto: number | null;
    vacantePuesto: string;
    numeroVacantes: unknown;
    idEstatusVacante: number;
    estatusVacante: string;
    tipoRegistroVacante: TipoRegistroVacante;
    esRequisicionActiva: unknown;
    esPendienteAprobacion: unknown;
    esVacanteAbierta: unknown;
    esRechazada: unknown;
    fechaCreacionVacante: Date | string | null;
    fechaCierreVacante: Date | string | null;
    fechaPostulacion: Date | string | null;
    diasCoberturaOAntiguedad: unknown;
    idEstatusPostulacion: number | null;
    estatusPostulacion: string;
    candidatoEnProceso: unknown;
    entrevistaProgramada: unknown;
    contratado: unknown;
    fuenteCandidato: string;
    totalDocsVacante: unknown;
    docsFirmadosVacante: unknown;
    docsSelladosVacante: unknown;
}

interface VacanteUnica {
    idVacante: number;
    idSite: number | null;
    servicioUbicacion: string;
    idArea: number | null;
    area: string;
    vacantePuesto: string;
    numeroVacantes: number;
    idEstatusVacante: number;
    estatusVacante: string;
    tipoRegistroVacante: TipoRegistroVacante;
    esRequisicionActiva: boolean;
    esPendienteAprobacion: boolean;
    esVacanteAbierta: boolean;
    esRechazada: boolean;
    fechaCreacion: string | null;
    fechaCierre: string | null;
    diasCoberturaOAntiguedad: number;
    totalDocs: number;
    docsFirmados: number;
    docsSellados: number;
    postulaciones: number;
    enProceso: number;
    contratados: number;
}

@Injectable()
export class RecruitmentDashboardService {
    private readonly logger = new Logger(RecruitmentDashboardService.name);

    constructor(private readonly prisma: PrismaService) { }

    async getMetrics(
        user: ActiveUserDto,
        companyId: number,
        q: RecruitmentDashboardQueryDto,
    ): Promise<RecruitmentDashboardResponseDto> {
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
            idPuesto: q.idPuesto ?? null,
            estatusVacante: q.estatusVacante ?? 'TODOS',
        };

        try {
            const [filas, opciones] = await Promise.all([
                this.obtenerVacantesYPostulaciones(f),
                this.obtenerOpciones(f),
            ]);

            // 1. Consolidar vacantes únicas y conteos por postulación
            const vacantesMap = new Map<number, VacanteUnica>();
            const postulacionesUnicas = new Map<number, VacantePostulacionRaw>();

            for (const row of filas) {
                let vac = vacantesMap.get(row.idVacante);
                if (!vac) {
                    vac = {
                        idVacante: row.idVacante,
                        idSite: row.idSite,
                        servicioUbicacion: row.servicioUbicacion,
                        idArea: row.idArea,
                        area: row.area,
                        vacantePuesto: row.vacantePuesto,
                        numeroVacantes: this.toNumber(row.numeroVacantes) ?? 0,
                        idEstatusVacante: row.idEstatusVacante,
                        estatusVacante: row.estatusVacante,
                        tipoRegistroVacante: row.tipoRegistroVacante,
                        esRequisicionActiva: (this.toNumber(row.esRequisicionActiva) ?? 0) === 1,
                        esPendienteAprobacion: (this.toNumber(row.esPendienteAprobacion) ?? 0) === 1,
                        esVacanteAbierta: (this.toNumber(row.esVacanteAbierta) ?? 0) === 1,
                        esRechazada: (this.toNumber(row.esRechazada) ?? 0) === 1,
                        fechaCreacion: this.toDateString(row.fechaCreacionVacante),
                        fechaCierre: this.toDateString(row.fechaCierreVacante),
                        diasCoberturaOAntiguedad: Math.max(0, this.toNumber(row.diasCoberturaOAntiguedad) ?? 0),
                        totalDocs: this.toNumber(row.totalDocsVacante) ?? 0,
                        docsFirmados: this.toNumber(row.docsFirmadosVacante) ?? 0,
                        docsSellados: this.toNumber(row.docsSelladosVacante) ?? 0,
                        postulaciones: 0,
                        enProceso: 0,
                        contratados: 0,
                    };
                    vacantesMap.set(row.idVacante, vac);
                }

                if (row.idPostulacion !== null && !postulacionesUnicas.has(row.idPostulacion)) {
                    postulacionesUnicas.set(row.idPostulacion, row);
                    vac.postulaciones += 1;
                    vac.enProceso += this.toNumber(row.candidatoEnProceso) ?? 0;
                    vac.contratados += this.toNumber(row.contratado) ?? 0;
                }
            }

            const vacantes = Array.from(vacantesMap.values());
            const postulaciones = Array.from(postulacionesUnicas.values());

            // 2. KPIs principales
            const vacantesAbiertasList = vacantes.filter((v) => v.esVacanteAbierta);
            const vacantesAbiertas = vacantesAbiertasList.length;
            const posicionesAbiertas = vacantesAbiertasList.reduce((acc, v) => acc + v.numeroVacantes, 0);
            const requisicionesActivas = vacantes.filter((v) => v.esRequisicionActiva).length;
            const pendientesAprobacion = vacantes.filter((v) => v.esPendienteAprobacion).length;
            const vacantesCerradasList = vacantes.filter((v) => v.idEstatusVacante === 7);
            const vacantesCerradas = vacantesCerradasList.length;
            const vacantesRechazadas = vacantes.filter((v) => v.esRechazada).length;

            const totalPostulaciones = postulaciones.length;
            const candidatosEnProceso = postulaciones.reduce(
                (acc, p) => acc + (this.toNumber(p.candidatoEnProceso) ?? 0),
                0,
            );
            const entrevistasProgramadas = postulaciones.reduce(
                (acc, p) => acc + (this.toNumber(p.entrevistaProgramada) ?? 0),
                0,
            );
            const contratados = postulaciones.reduce((acc, p) => acc + (this.toNumber(p.contratado) ?? 0), 0);

            const baseDias = vacantesCerradasList.length > 0 ? vacantesCerradasList : vacantes;
            const diasPromedioCobertura =
                baseDias.length > 0
                    ? this.redondear(
                        baseDias.reduce((acc, v) => acc + v.diasCoberturaOAntiguedad, 0) / baseDias.length,
                        1,
                    )
                    : 0;

            const totalDocsGenerados = vacantes.reduce((acc, v) => acc + v.totalDocs, 0);
            const docsFirmados = vacantes.reduce((acc, v) => acc + v.docsFirmados, 0);
            const docsSellados = vacantes.reduce((acc, v) => acc + v.docsSellados, 0);

            return {
                periodo: { desde, hasta },
                kpis: {
                    vacantesAbiertas,
                    posicionesAbiertas,
                    requisicionesActivas,
                    pendientesAprobacion,
                    vacantesCerradas,
                    vacantesRechazadas,
                    totalPostulaciones,
                    candidatosEnProceso,
                    entrevistasProgramadas,
                    contratados,
                    tasaConversionContratacion: this.porcentaje(contratados, totalPostulaciones),
                    diasPromedioCobertura,
                    totalDocsGenerados,
                    docsFirmados,
                    docsSellados,
                },
                vacantesPorTipoRegistro: this.agruparPorTipoRegistro(vacantes),
                embudoPostulaciones: this.agruparEmbudoPostulaciones(postulaciones),
                fuentesCandidatos: this.agruparFuentes(postulaciones),
                porArea: this.calcularPorArea(vacantes),
                porUbicacion: this.calcularPorUbicacion(vacantes),
                tendenciaMensual: this.construirTendenciaMensual(vacantes, postulaciones, desde, hasta),
                vacantesRecientes: [...vacantes]
                    .sort((a, b) => (b.fechaCreacion ?? '').localeCompare(a.fechaCreacion ?? '') || b.idVacante - a.idVacante)
                    .slice(0, 15)
                    .map((v) => ({
                        idVacante: v.idVacante,
                        puesto: v.vacantePuesto,
                        area: v.area,
                        ubicacion: v.servicioUbicacion,
                        numeroVacantes: v.numeroVacantes,
                        estatusVacante: v.estatusVacante,
                        tipoRegistro: v.tipoRegistroVacante,
                        postulaciones: v.postulaciones,
                        enProceso: v.enProceso,
                        contratados: v.contratados,
                        diasAntiguedad: v.diasCoberturaOAntiguedad,
                        fechaCreacion: v.fechaCreacion,
                        docsFirmados: v.docsFirmados,
                        totalDocs: v.totalDocs,
                    })),
                opciones,
            };
        } catch (err) {
            if (err instanceof BadRequestException || err instanceof NotFoundException) {
                throw err;
            }
            this.logger.error('Error calculando métricas del dashboard de reclutamiento', err);
            throw new InternalServerErrorException('No se pudieron calcular las métricas del dashboard de reclutamiento.');
        }
    }

    private async obtenerVacantesYPostulaciones(f: Filtros): Promise<VacantePostulacionRaw[]> {
        const condArea = f.idArea ? Prisma.sql`AND pu.idArea = ${f.idArea}` : Prisma.empty;
        const condSite = f.idSite ? Prisma.sql`AND v.idSite = ${f.idSite}` : Prisma.empty;
        const condPuesto = f.idPuesto ? Prisma.sql`AND v.idPuesto = ${f.idPuesto}` : Prisma.empty;
        const condEstatus = this.buildCondicionEstatusVacante(f.estatusVacante);

        return this.prisma.$queryRaw<VacantePostulacionRaw[]>(Prisma.sql`
      WITH DocsPorVacante AS (
        SELECT
          idVacante,
          COUNT(id) AS total_docs,
          SUM(CASE WHEN firmado = 1 THEN 1 ELSE 0 END) AS docs_firmados,
          SUM(CASE WHEN estatus = 'sellado' THEN 1 ELSE 0 END) AS docs_sellados
        FROM DocumentosGenerados
        WHERE idVacante IS NOT NULL
        GROUP BY idVacante
      )
      SELECT
        v.idVacante AS idVacante,
        p.idPostulacion AS idPostulacion,
        v.idSite AS idSite,
        COALESCE(s.Descripcion, 'Sin Servicio/Ubicación') AS servicioUbicacion,
        pu.idArea AS idArea,
        COALESCE(a.Descripcion, 'Sin Área') AS area,
        v.idPuesto AS idPuesto,
        COALESCE(pu.NombrePuesto, 'Sin Puesto') AS vacantePuesto,
        COALESCE(v.numeroVacantes, 0) AS numeroVacantes,
        v.idEstatusVacante AS idEstatusVacante,
        COALESCE(ev.decripcion, 'Sin Estatus') AS estatusVacante,
        CASE
          WHEN v.idEstatusVacante IN (1, 2, 4) THEN 'Requisición en Revisión'
          WHEN v.idEstatusVacante = 3 THEN 'Rechazada por Manager'
          WHEN v.idEstatusVacante = 5 THEN 'Vacante Abierta'
          WHEN v.idEstatusVacante = 6 THEN 'Rechazada por RH'
          WHEN v.idEstatusVacante = 7 THEN 'Cerrada'
          WHEN v.idEstatusVacante = 8 THEN 'Cancelada'
          ELSE 'Otro'
        END AS tipoRegistroVacante,
        CASE WHEN v.idEstatusVacante IN (1, 2, 4) THEN 1 ELSE 0 END AS esRequisicionActiva,
        CASE WHEN v.idEstatusVacante IN (1, 4) THEN 1 ELSE 0 END AS esPendienteAprobacion,
        CASE WHEN v.idEstatusVacante = 5 THEN 1 ELSE 0 END AS esVacanteAbierta,
        CASE WHEN v.idEstatusVacante IN (3, 6) THEN 1 ELSE 0 END AS esRechazada,
        v.fechaCreacion AS fechaCreacionVacante,
        v.fechaCierre AS fechaCierreVacante,
        p.fechaRegistro AS fechaPostulacion,
        CASE
          WHEN v.fechaCierre IS NOT NULL THEN DATEDIFF(v.fechaCierre, v.fechaCreacion)
          ELSE DATEDIFF(CURRENT_DATE(), v.fechaCreacion)
        END AS diasCoberturaOAntiguedad,
        p.idEstatus AS idEstatusPostulacion,
        COALESCE(ep.descripcion, 'Sin Postulación') AS estatusPostulacion,
        CASE WHEN p.idPostulacion IS NOT NULL AND (p.idEstatus IS NULL OR p.idEstatus NOT IN (4, 5, 6)) THEN 1 ELSE 0 END AS candidatoEnProceso,
        CASE WHEN p.idEstatus = 2 THEN 1 ELSE 0 END AS entrevistaProgramada,
        CASE WHEN p.idEstatus = 6 THEN 1 ELSE 0 END AS contratado,
        CASE
          WHEN p.utmSource IS NULL OR TRIM(p.utmSource) = '' THEN 'Bolsa de Trabajo'
          WHEN LOWER(p.utmSource) LIKE '%bolsa%' THEN 'Bolsa de Trabajo'
          WHEN LOWER(p.utmSource) LIKE '%referid%' THEN 'Referidos'
          WHEN LOWER(p.utmSource) LIKE '%linkedin%' THEN 'LinkedIn'
          WHEN LOWER(p.utmSource) LIKE '%extern%' THEN 'Portales externos'
          ELSE p.utmSource
        END AS fuenteCandidato,
        COALESCE(dv.total_docs, 0) AS totalDocsVacante,
        COALESCE(dv.docs_firmados, 0) AS docsFirmadosVacante,
        COALESCE(dv.docs_sellados, 0) AS docsSelladosVacante
      FROM Vacantes v
      INNER JOIN CatEmpresas e ON v.idEmpresa = e.idEmpresa
      LEFT JOIN Postulaciones p ON v.idVacante = p.idVacante
      LEFT JOIN CatEstatusPostulacion ep ON p.idEstatus = ep.idEstatusPostulacion
      LEFT JOIN CatEstatusVacante ev ON v.idEstatusVacante = ev.idEstatusVacante
      LEFT JOIN CatSites s ON v.idSite = s.idSite
      LEFT JOIN CatPuestos pu ON v.idPuesto = pu.idPuesto
      LEFT JOIN CatAreas a ON pu.idArea = a.idArea
      LEFT JOIN DocsPorVacante dv ON v.idVacante = dv.idVacante
      WHERE v.idEmpresa = ${f.companyId}
        AND (e.idTenant = ${f.idTenant} OR e.idTenant IS NULL)
        AND (e.activo = 1 OR e.activo IS NULL)
        AND DATE(v.fechaCreacion) BETWEEN ${f.desde} AND ${f.hasta}
        ${condArea}
        ${condSite}
        ${condPuesto}
        ${condEstatus}
    `);
    }

    private async obtenerOpciones(f: Filtros) {
        const [areas, ubicaciones, puestos] = await Promise.all([
            this.prisma.catAreas.findMany({
                where: { Activo: true, OR: [{ idTenant: f.idTenant }, { idTenant: null }] },
                select: { idArea: true, Descripcion: true },
                orderBy: { Descripcion: 'asc' },
            }),
            this.prisma.catSites.findMany({
                where: { Activo: true, OR: [{ idTenant: f.idTenant }] },
                select: { idSite: true, Descripcion: true },
                orderBy: { Descripcion: 'asc' },
            }),
            this.prisma.catPuestos.findMany({
                where: { Activo: true, OR: [{ idTenant: f.idTenant }, { idTenant: null }] },
                select: { idPuesto: true, NombrePuesto: true },
                orderBy: { NombrePuesto: 'asc' },
            }),
        ]);

        return {
            areas: areas.map((a) => ({ idArea: a.idArea, nombre: a.Descripcion ?? 'Sin Área' })),
            ubicaciones: ubicaciones.map((u) => ({ idSite: u.idSite, nombre: u.Descripcion ?? 'Sin Ubicación' })),
            puestos: puestos.map((p) => ({ idPuesto: p.idPuesto, nombre: p.NombrePuesto ?? 'Sin Puesto' })),
        };
    }

    private buildCondicionEstatusVacante(estatus: Filtros['estatusVacante']) {
        switch (estatus) {
            case 'ABIERTA':
                return Prisma.sql`AND v.idEstatusVacante = 5`;
            case 'REQUISICION':
                return Prisma.sql`AND v.idEstatusVacante IN (1, 2, 4)`;
            case 'CERRADA':
                return Prisma.sql`AND v.idEstatusVacante = 7`;
            case 'RECHAZADA_CANCELADA':
                return Prisma.sql`AND v.idEstatusVacante IN (3, 6, 8)`;
            default:
                return Prisma.empty;
        }
    }

    private agruparPorTipoRegistro(vacantes: VacanteUnica[]) {
        const orden: TipoRegistroVacante[] = [
            'Vacante Abierta',
            'Requisición en Revisión',
            'Cerrada',
            'Rechazada por Manager',
            'Rechazada por RH',
            'Cancelada',
            'Otro',
        ];
        const mapa = new Map<TipoRegistroVacante, { tipo: TipoRegistroVacante; vacantes: number; posiciones: number }>();
        for (const v of vacantes) {
            const actual = mapa.get(v.tipoRegistroVacante) ?? {
                tipo: v.tipoRegistroVacante,
                vacantes: 0,
                posiciones: 0,
            };
            actual.vacantes += 1;
            actual.posiciones += v.numeroVacantes;
            mapa.set(v.tipoRegistroVacante, actual);
        }
        return orden.map((t) => mapa.get(t)).filter((x): x is NonNullable<typeof x> => !!x && x.vacantes > 0);
    }

    private agruparEmbudoPostulaciones(postulaciones: VacantePostulacionRaw[]) {
        const mapa = new Map<string, number>();
        for (const p of postulaciones) {
            const etapa = p.estatusPostulacion || 'Sin Estatus';
            mapa.set(etapa, (mapa.get(etapa) ?? 0) + 1);
        }
        return Array.from(mapa.entries())
            .map(([etapa, total]) => ({ etapa, total }))
            .sort((a, b) => b.total - a.total);
    }

    private agruparFuentes(postulaciones: VacantePostulacionRaw[]) {
        const mapa = new Map<string, { fuente: string; postulaciones: number; contratados: number }>();
        for (const p of postulaciones) {
            const fuente = p.fuenteCandidato || 'Bolsa de Trabajo';
            const actual = mapa.get(fuente) ?? { fuente, postulaciones: 0, contratados: 0 };
            actual.postulaciones += 1;
            actual.contratados += this.toNumber(p.contratado) ?? 0;
            mapa.set(fuente, actual);
        }
        return Array.from(mapa.values()).sort((a, b) => b.postulaciones - a.postulaciones);
    }

    private calcularPorArea(vacantes: VacanteUnica[]) {
        const mapa = new Map<
            string,
            {
                idArea: number | null;
                area: string;
                vacantesAbiertas: number;
                posicionesAbiertas: number;
                requisicionesActivas: number;
                cerradas: number;
                postulaciones: number;
                contratados: number;
            }
        >();

        for (const v of vacantes) {
            const key = String(v.idArea ?? 'sin-area');
            const actual = mapa.get(key) ?? {
                idArea: v.idArea,
                area: v.area,
                vacantesAbiertas: 0,
                posicionesAbiertas: 0,
                requisicionesActivas: 0,
                cerradas: 0,
                postulaciones: 0,
                contratados: 0,
            };
            if (v.esVacanteAbierta) {
                actual.vacantesAbiertas += 1;
                actual.posicionesAbiertas += v.numeroVacantes;
            }
            if (v.esRequisicionActiva) actual.requisicionesActivas += 1;
            if (v.idEstatusVacante === 7) actual.cerradas += 1;
            actual.postulaciones += v.postulaciones;
            actual.contratados += v.contratados;
            mapa.set(key, actual);
        }

        return Array.from(mapa.values()).sort(
            (a, b) => b.posicionesAbiertas - a.posicionesAbiertas || b.postulaciones - a.postulaciones,
        );
    }

    private calcularPorUbicacion(vacantes: VacanteUnica[]) {
        const mapa = new Map<
            string,
            {
                idSite: number | null;
                ubicacion: string;
                vacantesAbiertas: number;
                posicionesAbiertas: number;
                postulaciones: number;
                contratados: number;
            }
        >();

        for (const v of vacantes) {
            const key = String(v.idSite ?? 'sin-ubicacion');
            const actual = mapa.get(key) ?? {
                idSite: v.idSite,
                ubicacion: v.servicioUbicacion,
                vacantesAbiertas: 0,
                posicionesAbiertas: 0,
                postulaciones: 0,
                contratados: 0,
            };
            if (v.esVacanteAbierta) {
                actual.vacantesAbiertas += 1;
                actual.posicionesAbiertas += v.numeroVacantes;
            }
            actual.postulaciones += v.postulaciones;
            actual.contratados += v.contratados;
            mapa.set(key, actual);
        }

        return Array.from(mapa.values()).sort(
            (a, b) => b.posicionesAbiertas - a.posicionesAbiertas || b.postulaciones - a.postulaciones,
        );
    }

    private construirTendenciaMensual(
        vacantes: VacanteUnica[],
        postulaciones: VacantePostulacionRaw[],
        desde: string,
        hasta: string,
    ) {
        const meses = new Map<string, { mes: string; vacantesCreadas: number; postulaciones: number; contratados: number }>();
        const inicio = new Date(`${desde.slice(0, 7)}-01T00:00:00Z`);
        const fin = new Date(`${hasta.slice(0, 7)}-01T00:00:00Z`);
        const cursor = new Date(inicio);

        while (cursor <= fin) {
            const key = `${cursor.toISOString().slice(0, 7)}-01`;
            meses.set(key, { mes: key, vacantesCreadas: 0, postulaciones: 0, contratados: 0 });
            cursor.setUTCMonth(cursor.getUTCMonth() + 1);
        }

        for (const v of vacantes) {
            if (!v.fechaCreacion) continue;
            const key = `${v.fechaCreacion.slice(0, 7)}-01`;
            const entry = meses.get(key);
            if (entry) entry.vacantesCreadas += 1;
        }

        for (const p of postulaciones) {
            const fechaPost = this.toDateString(p.fechaPostulacion);
            if (!fechaPost) continue;
            const key = `${fechaPost.slice(0, 7)}-01`;
            const entry = meses.get(key);
            if (entry) {
                entry.postulaciones += 1;
                entry.contratados += this.toNumber(p.contratado) ?? 0;
            }
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

    private porcentaje(parte: number, total: number): number {
        if (!total) return 0;
        return Math.round((parte / total) * 1000) / 10;
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