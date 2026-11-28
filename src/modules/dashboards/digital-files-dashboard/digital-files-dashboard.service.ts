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
import { DigitalFileDashboardQueryDto } from './dto/digital-file-dashboard-query.dto';
import { DigitalFileDashboardResponseDto } from './dto/digital-file-dashboard-response.dto';

const FECHA_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const DIA_MS = 24 * 60 * 60 * 1000;
const MAX_DIAS_PERIODO = 3 * 366;

type EstadoVigenciaDoc =
    | 'Vigentes'
    | 'Faltantes'
    | 'Rechazados / Con Observación'
    | 'Vencidos'
    | 'Próximos a vencer'
    | 'En Revisión';

interface Filtros {
    idTenant: number;
    companyId: number;
    desde: string | null;
    hasta: string | null;
    idArea: number | null;
    idSite: number | null;
    idTipoContratacion: number | null;
    estatusExpediente: 'TODOS' | 'COMPLETO' | 'INCOMPLETO' | 'RECHAZO' | 'SIN_EXPEDIENTE';
}

interface ExpedienteEmpleadoRow {
    idEmpleado: number;
    numeroEmpleado: string | null;
    nombreCompleto: string;
    fechaIngreso: Date | string | null;
    puesto: string;
    idArea: number | null;
    nombreArea: string;
    idExpediente: number | null;
    estatusExpediente: string;
    esCompleto: unknown;
    tieneObservaciones: unknown;
    totalContratos: unknown;
    contratosFirmados: unknown;
    estatusContrato: 'Firmado' | 'Pendiente / Sin Contrato';
}

interface DocumentoEmpleadoRow {
    idDocumentoEmpleado: number;
    idEmpleado: number;
    numeroEmpleado: string | null;
    nombreEmpleado: string;
    puesto: string;
    nombreArea: string;
    idDocumento: number;
    tipoDocumento: string;
    esRequeridoBase: unknown;
    requiereVencimiento: unknown;
    estatusDocumento: string;
    fechaVencimiento: Date | string | null;
    estadoVigencia: EstadoVigenciaDoc;
    diasParaVencer: unknown;
}

@Injectable()
export class DigitalFileDashboardService {
    private readonly logger = new Logger(DigitalFileDashboardService.name);

    constructor(private readonly prisma: PrismaService) { }

    async getMetrics(
        user: ActiveUserDto,
        companyId: number,
        q: DigitalFileDashboardQueryDto,
    ): Promise<DigitalFileDashboardResponseDto> {
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

        const { desde, hasta } = this.resolverPeriodoOpcional(q.desde, q.hasta);
        const f: Filtros = {
            idTenant: user.idTenant,
            companyId,
            desde,
            hasta,
            idArea: q.idArea ?? null,
            idSite: q.idSite ?? null,
            idTipoContratacion: q.idTipoContratacion ?? null,
            estatusExpediente: q.estatusExpediente ?? 'TODOS',
        };

        try {
            const [expedientes, documentos, opciones] = await Promise.all([
                this.obtenerExpedientesEmpleados(f),
                this.obtenerDocumentosEmpleados(f),
                this.obtenerOpciones(f),
            ]);

            const totalColaboradores = expedientes.length;
            const completos = expedientes.reduce((acc, e) => acc + (this.toNumber(e.esCompleto) ?? 0), 0);
            const conObservaciones = expedientes.reduce((acc, e) => acc + (this.toNumber(e.tieneObservaciones) ?? 0), 0);
            const sinExpediente = expedientes.filter((e) => e.estatusExpediente === 'SIN EXPEDIENTE').length;
            const contratosFirmados = expedientes.filter((e) => e.estatusContrato === 'Firmado').length;
            const contratosPendientes = totalColaboradores - contratosFirmados;

            const conteoVigencia: Record<EstadoVigenciaDoc, number> = {
                Vigentes: 0,
                Faltantes: 0,
                'Rechazados / Con Observación': 0,
                Vencidos: 0,
                'Próximos a vencer': 0,
                'En Revisión': 0,
            };

            for (const d of documentos) {
                if (conteoVigencia[d.estadoVigencia] !== undefined) {
                    conteoVigencia[d.estadoVigencia] += 1;
                }
            }

            const alertasDocumentos = documentos
                .filter((d) =>
                    ['Vencidos', 'Próximos a vencer', 'Rechazados / Con Observación', 'Faltantes'].includes(d.estadoVigencia),
                )
                .sort((a, b) => {
                    const prioridad: Record<string, number> = {
                        Vencidos: 1,
                        'Rechazados / Con Observación': 2,
                        'Próximos a vencer': 3,
                        Faltantes: 4,
                    };
                    const diffP = (prioridad[a.estadoVigencia] ?? 9) - (prioridad[b.estadoVigencia] ?? 9);
                    if (diffP !== 0) return diffP;
                    return (this.toNumber(a.diasParaVencer) ?? 9999) - (this.toNumber(b.diasParaVencer) ?? 9999);
                })
                .slice(0, 20)
                .map((d) => ({
                    idDocumentoEmpleado: d.idDocumentoEmpleado,
                    idEmpleado: d.idEmpleado,
                    numeroEmpleado: d.numeroEmpleado,
                    nombreEmpleado: d.nombreEmpleado,
                    area: d.nombreArea,
                    puesto: d.puesto,
                    tipoDocumento: d.tipoDocumento,
                    estadoVigencia: d.estadoVigencia,
                    fechaVencimiento: this.toDateString(d.fechaVencimiento),
                    diasParaVencer: this.toNumber(d.diasParaVencer),
                }));

            const colaboradoresPendientes = expedientes
                .filter((e) => (this.toNumber(e.esCompleto) ?? 0) === 0 || e.estatusContrato !== 'Firmado')
                .slice(0, 20)
                .map((e) => ({
                    idEmpleado: e.idEmpleado,
                    numeroEmpleado: e.numeroEmpleado,
                    nombreCompleto: e.nombreCompleto,
                    area: e.nombreArea,
                    puesto: e.puesto,
                    estatusExpediente: e.estatusExpediente,
                    estatusContrato: e.estatusContrato,
                    fechaIngreso: this.toDateString(e.fechaIngreso),
                }));

            return {
                periodo: { desde, hasta },
                kpis: {
                    totalColaboradoresActivos: totalColaboradores,
                    expedientesCompletos: completos,
                    porcentajeCumplimiento: this.porcentaje(completos, totalColaboradores),
                    expedientesConObservaciones: conObservaciones,
                    sinExpediente,
                    contratosFirmados,
                    contratosPendientes,
                    totalDocumentosEvaluados: documentos.length,
                    documentosVigentes: conteoVigencia.Vigentes,
                    documentosFaltantes: conteoVigencia.Faltantes,
                    documentosRechazados: conteoVigencia['Rechazados / Con Observación'],
                    documentosVencidos: conteoVigencia.Vencidos,
                    documentosProximosVencer: conteoVigencia['Próximos a vencer'],
                    documentosEnRevision: conteoVigencia['En Revisión'],
                },
                estatusExpedientes: this.agruparEstatusExpedientes(expedientes),
                estadoDocumentos: [
                    { estado: 'Vigentes', total: conteoVigencia.Vigentes },
                    { estado: 'En Revisión', total: conteoVigencia['En Revisión'] },
                    { estado: 'Próximos a vencer', total: conteoVigencia['Próximos a vencer'] },
                    { estado: 'Vencidos', total: conteoVigencia.Vencidos },
                    { estado: 'Rechazados / Con Observación', total: conteoVigencia['Rechazados / Con Observación'] },
                    { estado: 'Faltantes', total: conteoVigencia.Faltantes },
                ],
                estatusContratos: [
                    { estatus: 'Firmado', total: contratosFirmados },
                    { estatus: 'Pendiente / Sin Contrato', total: contratosPendientes },
                ],
                documentosPorTipo: this.agruparDocumentosPorTipo(documentos),
                porArea: this.calcularPorArea(expedientes),
                alertasDocumentos,
                colaboradoresPendientes,
                opciones,
            };
        } catch (err) {
            if (err instanceof BadRequestException || err instanceof NotFoundException) {
                throw err;
            }
            this.logger.error('Error calculando métricas del dashboard de expediente digital', err);
            throw new InternalServerErrorException('No se pudieron calcular las métricas del dashboard de expedientes.');
        }
    }

    private async obtenerExpedientesEmpleados(f: Filtros): Promise<ExpedienteEmpleadoRow[]> {
        const condArea = f.idArea ? Prisma.sql`AND p.idArea = ${f.idArea}` : Prisma.empty;
        const condSite = f.idSite ? Prisma.sql`AND e.idSite = ${f.idSite}` : Prisma.empty;
        const condTipoContratacion = f.idTipoContratacion
            ? Prisma.sql`AND p.idTipoContratacion = ${f.idTipoContratacion}`
            : Prisma.empty;
        const condFecha =
            f.desde && f.hasta
                ? Prisma.sql`AND DATE(COALESCE(e.fechaIngreso, e.FechaRegistro)) BETWEEN ${f.desde} AND ${f.hasta}`
                : Prisma.empty;

        const condEstatusExp = this.buildCondicionEstatusExpediente(f.estatusExpediente);

        return this.prisma.$queryRaw<ExpedienteEmpleadoRow[]>(Prisma.sql`
      SELECT
        e.idEmpleado,
        e.numeroEmpleado,
        TRIM(CONCAT(e.nombre, ' ', e.primerApellido, ' ', COALESCE(e.segundoApellido, ''))) AS nombreCompleto,
        e.fechaIngreso,
        COALESCE(p.NombrePuesto, 'Sin Puesto') AS puesto,
        p.idArea,
        COALESCE(a.Descripcion, 'Sin Área') AS nombreArea,
        ex.idExpediente,
        COALESCE(cex.Descripcion, 'SIN EXPEDIENTE') AS estatusExpediente,
        CASE WHEN cex.Descripcion = 'EXPEDIENTE COMPLETO' THEN 1 ELSE 0 END AS esCompleto,
        CASE WHEN cex.Descripcion = 'RECHAZO' THEN 1 ELSE 0 END AS tieneObservaciones,
        COALESCE(ct.totalContratos, 0) AS totalContratos,
        COALESCE(ct.contratosFirmados, 0) AS contratosFirmados,
        CASE WHEN COALESCE(ct.contratosFirmados, 0) > 0 THEN 'Firmado' ELSE 'Pendiente / Sin Contrato' END AS estatusContrato
      FROM Empleados e
      INNER JOIN CatEmpresas ce ON e.idEmpresa = ce.idEmpresa
      LEFT JOIN CatPuestos p ON e.idPuesto = p.idPuesto
      LEFT JOIN CatAreas a ON p.idArea = a.idArea
      LEFT JOIN Expedientes ex ON e.idEmpleado = ex.idEmpleado
      LEFT JOIN CatEstatusExpedientes cex ON ex.idEstatus = cex.IdEstatus
      LEFT JOIN (
        SELECT
          idEmpleado,
          COUNT(*) AS totalContratos,
          SUM(CASE WHEN fechaFirma IS NOT NULL OR archivoPdfFirmadoUrl IS NOT NULL THEN 1 ELSE 0 END) AS contratosFirmados
        FROM Contratos
        GROUP BY idEmpleado
      ) ct ON e.idEmpleado = ct.idEmpleado
      WHERE e.activo = 1
        AND e.idEmpresa = ${f.companyId}
        AND (e.idTenant = ${f.idTenant} OR e.idTenant IS NULL)
        ${condArea}
        ${condSite}
        ${condTipoContratacion}
        ${condFecha}
        ${condEstatusExp}
      ORDER BY nombreCompleto ASC
    `);
    }

    private async obtenerDocumentosEmpleados(f: Filtros): Promise<DocumentoEmpleadoRow[]> {
        const condArea = f.idArea ? Prisma.sql`AND p.idArea = ${f.idArea}` : Prisma.empty;
        const condSite = f.idSite ? Prisma.sql`AND e.idSite = ${f.idSite}` : Prisma.empty;
        const condTipoContratacion = f.idTipoContratacion
            ? Prisma.sql`AND p.idTipoContratacion = ${f.idTipoContratacion}`
            : Prisma.empty;
        const condFecha =
            f.desde && f.hasta
                ? Prisma.sql`AND DATE(COALESCE(de.fechaCarga, e.fechaIngreso, e.FechaRegistro)) BETWEEN ${f.desde} AND ${f.hasta}`
                : Prisma.empty;

        return this.prisma.$queryRaw<DocumentoEmpleadoRow[]>(Prisma.sql`
      SELECT
        de.idDocumentoEmpleado,
        de.idEmpleado,
        e.numeroEmpleado,
        TRIM(CONCAT(e.nombre, ' ', e.primerApellido)) AS nombreEmpleado,
        COALESCE(p.NombrePuesto, 'Sin Puesto') AS puesto,
        COALESCE(a.Descripcion, 'Sin Área') AS nombreArea,
        cd.IdDocumento AS idDocumento,
        cd.Descripcion AS tipoDocumento,
        cd.EsRequeridoBase AS esRequeridoBase,
        cd.requiereVencimiento,
        ced.Descripcion AS estatusDocumento,
        de.fechaVencimiento,
        CASE
          WHEN ced.Descripcion = 'SIN ENTREGAR' OR de.fechaCarga IS NULL THEN 'Faltantes'
          WHEN ced.Descripcion = 'RECHAZADO' THEN 'Rechazados / Con Observación'
          WHEN cd.requiereVencimiento = 1 AND de.fechaVencimiento < CURDATE() THEN 'Vencidos'
          WHEN cd.requiereVencimiento = 1 AND de.fechaVencimiento BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY) THEN 'Próximos a vencer'
          WHEN ced.Descripcion IN ('ENTREGADO', 'EN REVISION') THEN 'En Revisión'
          ELSE 'Vigentes'
        END AS estadoVigencia,
        DATEDIFF(de.fechaVencimiento, CURDATE()) AS diasParaVencer
      FROM DocumentosEmpleado de
      INNER JOIN Empleados e ON de.idEmpleado = e.idEmpleado AND e.activo = 1
      INNER JOIN CatEmpresas ce ON e.idEmpresa = ce.idEmpresa
      INNER JOIN CatDocumentos cd ON de.IdDocumento = cd.IdDocumento AND cd.Activo = 1
      INNER JOIN CatEstatusDocumentos ced ON de.idEstatusDocumento = ced.idEstatusDocumento
      LEFT JOIN CatPuestos p ON e.idPuesto = p.idPuesto
      LEFT JOIN CatAreas a ON p.idArea = a.idArea
      WHERE e.idEmpresa = ${f.companyId}
        AND (e.idTenant = ${f.idTenant} OR e.idTenant IS NULL)
        ${condArea}
        ${condSite}
        ${condTipoContratacion}
        ${condFecha}
    `);
    }

    private async obtenerOpciones(f: Filtros) {
        const [areas, ubicaciones] = await Promise.all([
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
        ]);

        return {
            areas: areas.map((a) => ({ idArea: a.idArea, nombre: a.Descripcion ?? 'Sin Área' })),
            ubicaciones: ubicaciones.map((u) => ({ idSite: u.idSite, nombre: u.Descripcion ?? 'Sin Ubicación' })),
        };
    }

    private buildCondicionEstatusExpediente(estatus: Filtros['estatusExpediente']) {
        switch (estatus) {
            case 'COMPLETO':
                return Prisma.sql`AND cex.Descripcion = 'EXPEDIENTE COMPLETO'`;
            case 'RECHAZO':
                return Prisma.sql`AND cex.Descripcion = 'RECHAZO'`;
            case 'SIN_EXPEDIENTE':
                return Prisma.sql`AND ex.idExpediente IS NULL`;
            case 'INCOMPLETO':
                return Prisma.sql`AND (ex.idExpediente IS NOT NULL AND cex.Descripcion <> 'EXPEDIENTE COMPLETO')`;
            default:
                return Prisma.empty;
        }
    }

    private agruparEstatusExpedientes(expedientes: ExpedienteEmpleadoRow[]) {
        const mapa = new Map<string, number>();
        for (const e of expedientes) {
            mapa.set(e.estatusExpediente, (mapa.get(e.estatusExpediente) ?? 0) + 1);
        }
        return Array.from(mapa.entries())
            .map(([estatus, total]) => ({ estatus, total }))
            .sort((a, b) => b.total - a.total);
    }

    private agruparDocumentosPorTipo(documentos: DocumentoEmpleadoRow[]) {
        const mapa = new Map<
            number,
            {
                idDocumento: number;
                tipoDocumento: string;
                esRequeridoBase: boolean;
                vigentes: number;
                faltantes: number;
                rechazados: number;
                vencidos: number;
                proximosVencer: number;
                enRevision: number;
                total: number;
            }
        >();

        for (const d of documentos) {
            const actual = mapa.get(d.idDocumento) ?? {
                idDocumento: d.idDocumento,
                tipoDocumento: d.tipoDocumento,
                esRequeridoBase: Number(d.esRequeridoBase) === 1,
                vigentes: 0,
                faltantes: 0,
                rechazados: 0,
                vencidos: 0,
                proximosVencer: 0,
                enRevision: 0,
                total: 0,
            };
            actual.total += 1;
            if (d.estadoVigencia === 'Vigentes') actual.vigentes += 1;
            else if (d.estadoVigencia === 'Faltantes') actual.faltantes += 1;
            else if (d.estadoVigencia === 'Rechazados / Con Observación') actual.rechazados += 1;
            else if (d.estadoVigencia === 'Vencidos') actual.vencidos += 1;
            else if (d.estadoVigencia === 'Próximos a vencer') actual.proximosVencer += 1;
            else if (d.estadoVigencia === 'En Revisión') actual.enRevision += 1;

            mapa.set(d.idDocumento, actual);
        }

        return Array.from(mapa.values()).sort((a, b) => b.total - a.total);
    }

    private calcularPorArea(expedientes: ExpedienteEmpleadoRow[]) {
        const mapa = new Map<
            string,
            {
                idArea: number | null;
                area: string;
                totalColaboradores: number;
                completos: number;
                conObservaciones: number;
                contratosFirmados: number;
            }
        >();

        for (const e of expedientes) {
            const key = String(e.idArea ?? 'sin-area');
            const actual = mapa.get(key) ?? {
                idArea: e.idArea,
                area: e.nombreArea,
                totalColaboradores: 0,
                completos: 0,
                conObservaciones: 0,
                contratosFirmados: 0,
            };
            actual.totalColaboradores += 1;
            actual.completos += this.toNumber(e.esCompleto) ?? 0;
            actual.conObservaciones += this.toNumber(e.tieneObservaciones) ?? 0;
            if (e.estatusContrato === 'Firmado') actual.contratosFirmados += 1;
            mapa.set(key, actual);
        }

        return Array.from(mapa.values())
            .map((a) => ({
                ...a,
                porcentajeCumplimiento: this.porcentaje(a.completos, a.totalColaboradores),
            }))
            .sort((a, b) => b.totalColaboradores - a.totalColaboradores);
    }

    private resolverPeriodoOpcional(desde?: string, hasta?: string): { desde: string | null; hasta: string | null } {
        const d = desde?.trim() || null;
        const h = hasta?.trim() || null;
        if (!d && !h) return { desde: null, hasta: null };
        if (!d || !h) {
            throw new BadRequestException('Debes enviar tanto la fecha inicial como la final.');
        }
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
}