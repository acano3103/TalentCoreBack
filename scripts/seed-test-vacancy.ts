import { PrismaClient } from '../generated/prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import * as dotenv from 'dotenv';
dotenv.config();

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) throw new Error("DATABASE_URL is not set");

const adapter = new PrismaMariaDb(dbUrl);
const prisma = new PrismaClient({ adapter });

async function main() {
    console.log("Checking data...");
    
    const company = await prisma.catEmpresas.findFirst();
    if (!company) throw new Error("No company found");
    console.log("Company:", company.idEmpresa, company.NombreEmpresa);

    const site = await prisma.catSites.findFirst({ where: { idEmpresa: company.idEmpresa } });
    console.log("Site:", site?.idSite, site?.Descripcion);

    // Get any position belonging to company's site areas, activating if needed
    const areas = await prisma.$queryRawUnsafe<any[]>(`SELECT idArea FROM CatAreas WHERE idEmpresa = ${company.idEmpresa} LIMIT 1`);
    console.log("Areas:", JSON.stringify(areas));

    // Find or use any position
    const allPuestos = await prisma.$queryRawUnsafe<any[]>(`SELECT idPuesto, NombrePuesto, Activo, aprobada, idSite, idArea, idEmpresa FROM CatPuestos LIMIT 10`);
    console.log("All puestos (first 10):", JSON.stringify(allPuestos));

    // Find puestos with valid site (site belongs to company)
    const activeCheck = await prisma.$queryRawUnsafe<any[]>(`
        SELECT p.idPuesto, p.NombrePuesto, p.Activo, p.aprobada, p.idSite, s.idEmpresa
        FROM CatPuestos p
        INNER JOIN CatSites s ON s.idSite = p.idSite
        WHERE s.idEmpresa = ${company.idEmpresa}
        LIMIT 5
    `);
    console.log("Puestos via site->empresa:", JSON.stringify(activeCheck));
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
