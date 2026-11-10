import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { DigitalFilesQueries } from './queries/digital-files.queries';

@Injectable()
export class VencimientosDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getVencimientosDashboard(
    companyId: number,
    filtros: {
      idArea?: number;
      idSite?: number;
      idPuesto?: number;
      estado?: 'vigente' | 'por_vencer' | 'vencido';
      fechaDesde?: string;
      fechaHasta?: string;
    },
  ) {
    const rows = await this.prisma.$queryRaw<any[]>`
      SELECT
        DE.idDocumentoEmpleado,
        E.idEmpleado,
        E.nombre, E.primerApellido, E.segundoApellido,
        E.idPuesto, P.NombrePuesto,
        P.idArea, A.Descripcion AS areaNombre,
        E.idSite, S.Descripcion AS siteNombre,
        CD.IdDocumento, CD.Descripcion AS documentoNombre,
        DE.fechaVencimiento, DE.fechaEmision,
        CD.diasAlertaPrevio
      FROM DocumentosEmpleado DE
      INNER JOIN Empleados E ON E.idEmpleado = DE.idEmpleado
      INNER JOIN CatDocumentos CD ON CD.IdDocumento = DE.IdDocumento
      LEFT JOIN CatPuestos P ON P.idPuesto = E.idPuesto
      LEFT JOIN CatAreas A ON A.idArea = P.idArea
      LEFT JOIN CatSites S ON S.idSite = E.idSite
      WHERE E.idEmpresa = ${companyId}
        AND E.activo = 1
        AND CD.requiereVencimiento = 1
        AND DE.fechaVencimiento IS NOT NULL
    `;

    let documentos = rows.map((r) => ({
      idDocumentoEmpleado: r.idDocumentoEmpleado,
      idEmpleado: r.idEmpleado,
      nombreCompleto: [r.nombre, r.primerApellido, r.segundoApellido].filter(Boolean).join(' '),
      puesto: r.NombrePuesto,
      idPuesto: r.idPuesto,
      area: r.areaNombre,
      idArea: r.idArea,
      site: r.siteNombre,
      idSite: r.idSite,
      documento: r.documentoNombre,
      fechaVencimiento: r.fechaVencimiento,
      fechaEmision: r.fechaEmision,
      estatusVigencia: DigitalFilesQueries.calcularEstatusVigencia(r.fechaVencimiento, r.diasAlertaPrevio),
    }));

    // Filtros por área/site/puesto/fecha (aplican a nivel documento)
    if (filtros.idArea) {
      documentos = documentos.filter((d) => d.idArea === filtros.idArea);
    }
    if (filtros.idSite) {
      documentos = documentos.filter((d) => d.idSite === filtros.idSite);
    }
    if (filtros.idPuesto) {
      documentos = documentos.filter((d) => d.idPuesto === filtros.idPuesto);
    }
    if (filtros.fechaDesde) {
      documentos = documentos.filter((d) => d.fechaVencimiento && new Date(d.fechaVencimiento) >= new Date(filtros.fechaDesde!));
    }
    if (filtros.fechaHasta) {
      documentos = documentos.filter((d) => d.fechaVencimiento && new Date(d.fechaVencimiento) <= new Date(filtros.fechaHasta!));
    }

    // KPIs globales (sobre documentos filtrados por área/site/puesto/fecha, antes del filtro de estado)
    const kpis = {
      vigente: documentos.filter((d) => d.estatusVigencia === 'vigente').length,
      por_vencer: documentos.filter((d) => d.estatusVigencia === 'por_vencer').length,
      vencido: documentos.filter((d) => d.estatusVigencia === 'vencido').length,
    };

    // Filtro de estado (aplica a nivel documento, antes de agrupar)
    if (filtros.estado) {
      documentos = documentos.filter((d) => d.estatusVigencia === filtros.estado);
    }

    // ── Agrupar por empleado ──
    const empleadosMap = new Map<number, any>();
    for (const doc of documentos) {
      if (!empleadosMap.has(doc.idEmpleado)) {
        empleadosMap.set(doc.idEmpleado, {
          idEmpleado: doc.idEmpleado,
          nombreCompleto: doc.nombreCompleto,
          puesto: doc.puesto,
          idPuesto: doc.idPuesto,
          area: doc.area,
          idArea: doc.idArea,
          site: doc.site,
          idSite: doc.idSite,
          documentos: [] as any[],
          resumen: { vigente: 0, por_vencer: 0, vencido: 0 },
        });
      }
      const empleado = empleadosMap.get(doc.idEmpleado);
      empleado.documentos.push({
        idDocumentoEmpleado: doc.idDocumentoEmpleado,
        documento: doc.documento,
        fechaVencimiento: doc.fechaVencimiento,
        fechaEmision: doc.fechaEmision,
        estatusVigencia: doc.estatusVigencia,
      });
      empleado.resumen[doc.estatusVigencia]++;
    }

    return { data: Array.from(empleadosMap.values()), kpis };
  }
}