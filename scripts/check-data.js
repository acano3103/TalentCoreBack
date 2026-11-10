const { PrismaClient } = require('../generated/prisma/client');
const { PrismaMariaDb } = require('@prisma/adapter-mariadb');
const adapter = new PrismaMariaDb('mysql://acano:L1k3Nuuk%40AC4n0@10.11.209.19:3306/fileonlineDemoV2');
const prisma = new PrismaClient({ adapter });

async function main() {
  const vacantes = await prisma.$queryRawUnsafe('SELECT idVacante, idPuesto, idSite, idEstatusVacante FROM Vacantes ORDER BY idVacante DESC LIMIT 5');
  console.log('VACANTES:', JSON.stringify(vacantes, null, 2));
  
  const puestos = await prisma.$queryRawUnsafe('SELECT idPuesto, NombrePuesto, Activo, aprobada, idSite, idEmpresa FROM CatPuestos ORDER BY idPuesto DESC LIMIT 5');
  console.log('PUESTOS:', JSON.stringify(puestos, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
