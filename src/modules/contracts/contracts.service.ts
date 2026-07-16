import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class ContractsService {
  private readonly logger = new Logger(ContractsService.name);

  constructor(private readonly prisma: PrismaService) { }

  async getReadyToHire(companyId: number, page: number, limit: number, search: string) {
    const offset = (page - 1) * limit;

    // Construir la condición de búsqueda para SQL de manera segura
    const searchQuery = search ? `%${search}%` : null;

    // Ejecutar la consulta paginada de datos y el conteo total en paralelo
    const [rawData, totalResult] = await Promise.all([
      this.prisma.$queryRaw<any[]>`
        SELECT 
          e.idEmpleado,
          CONCAT(e.nombre, ' ', e.primerApellido, ' ', IFNULL(e.segundoApellido, '')) AS nombreCompleto,
          p.NombrePuesto AS puesto,
          ex.idEstatus AS idEstatusExpediente,
          IFNULL(c.idEstatusContrato, 1) AS idEstatusContrato,
          IFNULL(cec.descripcion, 'PENDIENTE DE GENERAR') AS estatusContratoDescripcion,
          IFNULL(c.fechaInicioContrato, 'PENDIENTE') AS fechaContratoInicio,
          IFNULL(c.fechaTerminoContrato, 'PENDIENTE') AS fechaContratoTermino,
          IFNULL(hs.salarioBruto, null) AS sueldo,
          c.idContrato
        FROM Empleados e
        INNER JOIN Expedientes ex ON e.idEmpleado = ex.idEmpleado
        INNER JOIN CatPuestos p ON e.idPuesto = p.idPuesto
        LEFT JOIN Contratos c ON e.idEmpleado = c.idEmpleado
        LEFT JOIN CatEstatusContratos cec ON c.idEstatusContrato = cec.idEstatusContrato
        LEFT JOIN HistorialSalarios hs ON hs.idEmpleado = e.idEmpleado
        WHERE e.idEmpresa = ${companyId}
          AND e.activo = 1
          AND ex.idEstatus = 4
          AND (${searchQuery} IS NULL OR 
               e.nombre LIKE ${searchQuery} OR 
               e.primerApellido LIKE ${searchQuery} OR 
               e.segundoApellido LIKE ${searchQuery} OR 
               e.rfc LIKE ${searchQuery})
        ORDER BY e.nombre ASC
        LIMIT ${limit} OFFSET ${offset};
      `,

      this.prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*) as count
        FROM Empleados e
        INNER JOIN Expedientes ex ON e.idEmpleado = ex.idEmpleado
        WHERE e.idEmpresa = ${companyId}
          AND e.activo = 1
          AND ex.idEstatus = 4
          AND (${searchQuery} IS NULL OR 
               e.nombre LIKE ${searchQuery} OR 
               e.primerApellido LIKE ${searchQuery} OR 
               e.segundoApellido LIKE ${searchQuery} OR 
               e.rfc LIKE ${searchQuery});
      `
    ]);

    // Limpiar BigInts del arreglo de datos mapeando valores numéricos
    const data = rawData.map(item => ({
      ...item,
      idEmpleado: item.idEmpleado ? Number(item.idEmpleado) : null,
      idContrato: item.idContrato ? Number(item.idContrato) : null,
      idEstatusContrato: item.idEstatusContrato ? Number(item.idEstatusContrato) : 1,
      idEstatusExpediente: item.idEstatusExpediente ? Number(item.idEstatusExpediente) : null,
    }));

    // Convertir el BigInt del conteo total de forma segura
    const total = totalResult[0]?.count ? Number(totalResult[0].count) : 0;

    // Retornar la estructura estándar de paginación
    return {
      data,
      total,
      currentPage: page,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }
}