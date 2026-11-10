import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { OrganizationChartQueries } from './queries/organization-chart.queries';
import { ActiveUserDto } from 'src/modules/auth/dto/active-user.dto';

@Injectable()
export class OrganizationChartService {
    constructor(private readonly prisma: PrismaService) { }

    async getAuthorizedChart(activeUser: ActiveUserDto, companyId: number, siteId?: number, areaId?: number) {
        const [companyName, chartData] = await Promise.all([
            OrganizationChartQueries.getCompanyName(this.prisma, activeUser.idTenant, companyId),
            OrganizationChartQueries.getAuthorizedChartData(this.prisma, activeUser.idTenant, companyId, siteId, areaId),
        ]);

        // 1. Paleta de colores dinámicos
        const paletaColores = [
            '#2563eb', // Blue
            '#7c3aed', // Purple
            '#db2777', // Pink
            '#059669', // Emerald
            '#ea580c', // Orange
            '#0d9488', // Teal
            '#475569', // Slate
            '#b45309', // Amber
        ];

        // Mapas para el control dinámico de la data
        const plazasPorPuestoSite: Record<string, number> = {};
        const mapaColoresAreas: Record<number, string> = {}; // Guarda idArea -> colorHex
        let contadorAreasUnicas = 0;

        // 2. Primer recorrido: Calculamos plazas máximas e identificamos áreas únicas sobre la marcha
        chartData.forEach((r) => {
            const partes = r.uid.split('_');
            const secuencia = Number(partes[2] || 1);
            const llave = `${r.idPuesto}_${r.idSite}`;

            if (!plazasPorPuestoSite[llave] || secuencia > plazasPorPuestoSite[llave]) {
                plazasPorPuestoSite[llave] = secuencia;
            }

            // Si el idArea no ha sido registrado en esta consulta, le asignamos su color dinámico
            if (r.idArea !== undefined && r.idArea !== null && !mapaColoresAreas[r.idArea]) {
                // Aritmética circular: si el contador supera la paleta, se reinicia de forma limpia
                const indexColor = contadorAreasUnicas % paletaColores.length;
                mapaColoresAreas[r.idArea] = paletaColores[indexColor];
                contadorAreasUnicas++;
            }
        });

        // 3. Segundo recorrido: Construimos el nodeDataArray inyectando el color correspondiente
        const nodeDataArray = chartData.map((r) => {
            const partes = r.uid.split('_');
            const miSecuencia = Number(partes[2] || 1);

            let parentKey = '';

            if (r.idJefeInmediato !== null && r.idJefeInmediato !== undefined) {
                const llaveJefe = `${r.idJefeInmediato}_${r.idSite}`;
                const totalPlazasJefe = plazasPorPuestoSite[llaveJefe] || 1;

                const secuenciaJefeAsignada = ((miSecuencia - 1) % totalPlazasJefe) + 1;
                parentKey = `${r.idJefeInmediato}_${r.idSite}_${secuenciaJefeAsignada}`;
            }

            // Extraemos el color dinámico asignado a esta área
            const colorAsignado = mapaColoresAreas[r.idArea] || '#64748b';

            return {
                key: r.uid,
                name: r.NombrePuesto,
                title: r.estatus === 'OCUPADO' ? 'PLAZA ASIGNADA' : 'PLAZA VACANTE',
                dept: `${r.Area}`,
                parent: parentKey,
                status: r.estatus,
                color: colorAsignado, // <-- GoJS recibirá esta propiedad para pintar la tarjeta de forma única por área
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

    async getRealChart(activeUser: ActiveUserDto, companyId: number, siteId?: number, areaId?: number) {
        // Convertimos los undefined en null para pasarlos de forma segura a $queryRaw
        const filterSiteId = siteId ?? null;
        const filterAreaId = areaId ?? null;

        const [companyName, employees, vacancies] = await Promise.all([
            OrganizationChartQueries.getCompanyName(this.prisma, activeUser.idTenant, companyId),
            OrganizationChartQueries.getRealEmployeesData(this.prisma, activeUser.idTenant, companyId, filterSiteId, filterAreaId),
            OrganizationChartQueries.getRealVacanciesData(this.prisma, activeUser.idTenant, companyId, filterSiteId, filterAreaId),
        ]);

        const paletaColores = [
            '#2563eb', '#7c3aed', '#db2777', '#059669',
            '#ea580c', '#0d9488', '#475569', '#b45309',
        ];

        const mapaColoresAreas: Record<number, string> = {};
        let contadorAreasUnicas = 0;

        const asignarColorArea = (idArea: number) => {
            if (idArea !== undefined && idArea !== null && !mapaColoresAreas[idArea]) {
                const indexColor = contadorAreasUnicas % paletaColores.length;
                mapaColoresAreas[idArea] = paletaColores[indexColor];
                contadorAreasUnicas++;
            }
        };

        employees.forEach(emp => asignarColorArea(emp.idArea));
        vacancies.forEach(vac => asignarColorArea(vac.idArea));

        const nodosEmpleados = employees.map((emp) => ({
            key: emp.uid,
            name: emp.nombreCompleto.toUpperCase(),
            title: emp.NombrePuesto,
            dept: `${emp.Area}`,
            parent: emp.parentUid || '',
            status: 'OCUPADO',
            color: mapaColoresAreas[emp.idArea] || '#64748b',
            EMAIL: false,
            PHONE: false,
        }));

        const nodosVacantes = vacancies.map((vac) => ({
            key: vac.uid,
            name: 'VACANTE',
            title: vac.NombrePuesto,
            dept: `${vac.Area}`,
            parent: vac.parentUid,
            status: 'VACANTE',
            color: mapaColoresAreas[vac.idArea] || '#64748b',
            EMAIL: false,
            PHONE: false,
        }));

        const nodeDataArray = [...nodosEmpleados, ...nodosVacantes];

        return {
            organigrama: {
                class: 'go.TreeModel',
                nodeDataArray: nodeDataArray,
            },
            nombre_empresa: companyName,
        };
    }
}