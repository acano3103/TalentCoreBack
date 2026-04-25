import { PrismaClient } from "generated/prisma/client";

export async function findAllInterviews(companyId: number, positionId: number | undefined, prisma: PrismaClient) {
    if (positionId !== undefined) {
        return prisma.$queryRaw`
            SELECT 
                e.id,
                e.title,
                e.modality,
                e.duration,
                e.interviewer_name,
                p.idPuesto AS position_id,
                p.NombrePuesto AS position_name
            FROM Entrevistas e
            INNER JOIN CatPuestos p 
                ON e.position_id = p.idPuesto
            WHERE p.aprobada = true
            AND p.idEmpresa = ${companyId}
            AND e.position_id = ${positionId}
        `;
    }

    return prisma.$queryRaw`
        SELECT 
            e.id,
            e.title,
            e.modality,
            e.duration,
            e.interviewer_name,
            p.idPuesto AS position_id,
            p.NombrePuesto AS position_name
        FROM Entrevistas e
        INNER JOIN CatPuestos p 
            ON e.position_id = p.idPuesto
        WHERE p.aprobada = true
        AND p.idEmpresa = ${companyId}
    `;
}