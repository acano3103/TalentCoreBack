import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class PatronalRecordsService {
    constructor(private readonly prisma: PrismaService) { }

    async findAll(idEmpresa: number, page: number, limit: number, query: string) {
        const offset = (page - 1) * limit;
        const searchPattern = `%${query}%`;

        const patronalRecords = await this.prisma.$queryRaw<any[]>`
        SELECT 
            rp.idRegistroPatronal,
            rp.idEmpresa,
            rp.RegistroPatronal,
            rp.RazonSocial,
            rp.ClaseRiesgo,
            rp.PrimaRiesgo,
            rp.Activo,
            COUNT(s.idSite) AS totalSites
        FROM CatRegistrosPatronales rp
        LEFT JOIN CatSites s ON rp.idRegistroPatronal = s.idRegistroPatronal AND s.Activo = 1
        WHERE rp.idEmpresa = ${idEmpresa} 
          AND (${query} = '' OR rp.RegistroPatronal LIKE ${searchPattern} OR rp.RazonSocial LIKE ${searchPattern})
        GROUP BY rp.idRegistroPatronal
        ORDER BY rp.idRegistroPatronal DESC
        LIMIT ${limit} OFFSET ${offset};
    `;

        const countResult = await this.prisma.$queryRaw<any[]>`
        SELECT COUNT(*) AS total
        FROM CatRegistrosPatronales rp
        WHERE rp.idEmpresa = ${idEmpresa} 
          AND (${query} = '' OR rp.RegistroPatronal LIKE ${searchPattern} OR rp.RazonSocial LIKE ${searchPattern});
    `;
        const total = countResult[0]?.total ? Number(countResult[0].total) : 0;
        if ((!patronalRecords || patronalRecords.length === 0) && page === 1 && !query) {
            return {
                patronalRecords: [],
                total: 0,
                currentPage: page,
                totalPages: 1,
            };
        }

        const formattedRecords = patronalRecords.map(record => ({
            ...record,
            idRegistroPatronal: Number(record.idRegistroPatronal),
            idEmpresa: Number(record.idEmpresa),
            PrimaRiesgo: parseFloat(record.PrimaRiesgo),
            totalSites: Number(record.totalSites)
        }));

        return {
            patronalRecords: formattedRecords,
            total,
            currentPage: page,
            totalPages: Math.ceil(total / limit) || 1,
        };
    }

    async create(idEmpresa: number, data: {
        registroPatronal: string;
        razonSocial: string;
        claseRiesgo: string;
        primaRiesgo: number;
    }) {
        return this.prisma.catRegistrosPatronales.create({
            data: {
                idEmpresa,
                RegistroPatronal: data.registroPatronal.toUpperCase(),
                RazonSocial: data.razonSocial.toUpperCase(),
                ClaseRiesgo: data.claseRiesgo,
                PrimaRiesgo: data.primaRiesgo,
                Activo: true
            },
        });
    }

    async update(idRegistroPatronal: number, data: {
        registroPatronal?: string;
        razonSocial?: string;
        claseRiesgo?: string;
        primaRiesgo?: number;
    }) {
        return this.prisma.catRegistrosPatronales.update({
            where: { idRegistroPatronal },
            data: {
                ...(data.registroPatronal && { RegistroPatronal: data.registroPatronal.toUpperCase() }),
                ...(data.razonSocial && { RazonSocial: data.razonSocial.toUpperCase() }),
                ...(data.claseRiesgo && { ClaseRiesgo: data.claseRiesgo }),
                ...(data.primaRiesgo !== undefined && { PrimaRiesgo: data.primaRiesgo }),
            },
        });
    }

    async changeStatus(companyId: number, id: number, active: boolean) {

        await this.prisma.catRegistrosPatronales.update({
            where: { idRegistroPatronal: id, idEmpresa: companyId },
            data: {
                Activo: active
            },
        });

        return {
            message: active ? 'Registro patronal activado correctamente' : 'Registro patronal desactivado correctamente'
        };
    }
}