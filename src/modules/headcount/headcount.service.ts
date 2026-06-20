import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { HeadcountQueries } from './queries/headcount.queries';

@Injectable()
export class HeadcountService {
    constructor(private prisma: PrismaService) { }

    async findAll(companyId: number, page: number, search: string, limit: number, locationId?: number) {
        const skip = (page - 1) * limit;

        // 1. Ejecutamos en paralelo la consulta base paginada y el conteo total de registros
        const [matrixRecords, totalRecords, globalSummary] = await Promise.all([
            HeadcountQueries.getPaginatedMatrix(this.prisma, companyId, skip, limit, search, locationId),
            HeadcountQueries.countMatrixRecords(this.prisma, companyId, search, locationId),
            HeadcountQueries.getGlobalSummary(this.prisma, companyId, search, locationId),
        ]);

        // 2. Por cada uno de los 10 registros de Área-Ubicación, traemos sus puestos específicos con su estado local
        const dataGrid = await Promise.all(
            matrixRecords.map(async (row) => {
                const puestosRaw = await HeadcountQueries.getPuestosPorAreaSite(this.prisma, row.idArea, row.idSite);

                // Mapeamos los puestos y calculamos de forma dinámica las vacantes
                const puestosAutorizados = puestosRaw.map((p) => {
                    const autorizado = Number(p.autorizado);
                    const ocupado = Number(p.ocupado);
                    return {
                        idPuesto: p.idPuesto,
                        nombrePuesto: p.nombrePuesto,
                        autorizado: autorizado,
                        ocupado: ocupado,
                        vacante: Math.max(0, autorizado - ocupado),
                        nombreNivel: p.nombreNivel,
                        salarioMinimo: Number(p.salarioMinimo),
                        salarioMaximo: Number(p.salarioMaximo)
                    };
                });

                const plazasTotales = Number(row.plazasTotales);
                const plazasOcupadas = Number(row.plazasOcupadas);

                return {
                    idAreaUbicacion: row.idAreaUbicacion,
                    idSite: row.idSite,
                    siteDescripcion: row.siteDescripcion,
                    idArea: row.idArea,
                    areaDescripcion: row.areaDescripcion,
                    presupuestoAsignado: Number(row.PresupuestoAsignado),
                    plazasTotales: plazasTotales,
                    plazasOcupadas: plazasOcupadas,
                    vacantesLibres: Math.max(0, plazasTotales - plazasOcupadas),
                    puestosAutorizados: puestosAutorizados,
                };
            })
        );

        // 3. Retornamos la estructura unificada idéntica a lo que espera consumir tu Front
        return {
            dataGrid,
            total: totalRecords,
            currentPage: page,
            totalPages: Math.ceil(totalRecords / limit) || 1,
            summary: {
                totalAutorizado: globalSummary.totalAutorizado,
                totalEjecutado: 0, // Pausado temporalmente con 0 por negocio
                totalVacantes: 0,  // Pausado temporalmente con 0 por negocio
                totalDisponible: globalSummary.totalAutorizado // Al ser los demás 0, el disponible es igual al autorizado
            }
        };
    }
}
