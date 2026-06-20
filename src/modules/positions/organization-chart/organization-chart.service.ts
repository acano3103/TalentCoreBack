import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { OrganizationChartQueries } from './queries/organization-chart.queries';

@Injectable()
export class OrganizationChartService {
    constructor(private readonly prisma: PrismaService) { }

    async getOrganizationChart(companyId: number) {
        const [companyName, chartData] = await Promise.all([
            OrganizationChartQueries.getCompanyName(this.prisma, companyId),
            OrganizationChartQueries.getChartData(this.prisma, companyId),
        ]);

        // Mapeo y transformación de la data al formato de GoJS
        const nodeDataArray = chartData.map((r) => {
            const parentKey = r.idJefeInmediato !== null && r.idJefeInmediato !== undefined
                ? `${r.idJefeInmediato}_1`
                : '';

            return {
                key: r.uid,
                name: r.NombrePuesto,
                title: r.estatus,
                dept: r.Area,
                parent: parentKey,
                EMAIL: false,
                PHONE: false,
            };
        });

        return {
            organigrama: {
                class: 'go.TreeModel',
                nodeDataArray: nodeDataArray,
            },
            nombre_empresa: companyName,
        };
    }
}
