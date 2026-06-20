import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class OrganizationChartQueries {
    static async getCompanyName(prisma: PrismaService, companyId: number): Promise<string> {
        const result = await prisma.$queryRaw<[{ nombre_comercial: string }]>`
          SELECT nombre_comercial FROM CatEmpresas WHERE idEmpresa = ${companyId} LIMIT 1
        `;
        return result[0]?.nombre_comercial || 'Empresa';
    }

    static async getChartData(prisma: PrismaService, companyId: number): Promise<any[]> {
        return prisma.$queryRaw<any[]>`
          SELECT 
              CONCAT(p.idPuesto, '_', seq.seq) AS uid,       
              p.idPuesto,
              p.NombrePuesto,
              p.idJefeInmediato,
              a.idArea,
              a.Descripcion AS Area,
              s.idSite,
              s.Descripcion AS Site,
              e.idEmpresa,
              e.nombre_comercial AS Empresa,
              CASE 
                  WHEN exp.idExpediente IS NOT NULL THEN 'OCUPADO'
                  ELSE 'VACANTE'
              END AS estatus,
              exp.idCandidato,
              exp.idExpediente
          FROM CatEmpresas e
          JOIN CatSites s ON s.idEmpresa = e.idEmpresa
          JOIN RelAreasUbicaciones rau ON rau.idSite = s.idSite AND rau.Activo = 1
          JOIN CatAreas a ON a.idArea = rau.idArea AND a.Activo = 1
          JOIN CatPuestos p ON p.idArea = a.idArea AND p.Activo = 1
          LEFT JOIN (
              SELECT 1 AS seq
          ) seq ON 1 = 1
          LEFT JOIN (
              SELECT 
                  idPuesto, 
                  idExpediente,
                  idCandidato,
                  ROW_NUMBER() OVER (PARTITION BY idPuesto ORDER BY idExpediente) AS rn
              FROM expedientes
              WHERE idEstatus >= 25
          ) exp ON exp.idPuesto = p.idPuesto AND exp.rn = seq.seq
          WHERE e.idEmpresa = ${companyId};
        `;
    }
}