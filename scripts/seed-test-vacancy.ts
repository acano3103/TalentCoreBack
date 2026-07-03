import { PrismaClient } from '../generated/prisma/client';
const prisma = new PrismaClient();

async function main() {
    console.log("Creating test vacancy...");
    
    const company = await prisma.catEmpresas.findFirst();
    if (!company) throw new Error("No company found");

    const position = await prisma.catPuestos.findFirst({ where: { idEmpresa: company.idEmpresa } });
    if (!position) throw new Error("No position found");

    const site = await prisma.catSites.findFirst();
    const user = await prisma.auth_user.findFirst();
    
    const idSite = site?.idSite || 'NULL';
    const idUsuario = user?.id || 'NULL';
    
    await prisma.$executeRawUnsafe(`
        INSERT INTO Vacantes (idEmpresa, idPuesto, idSite, idEstatusVacante, idEstatus, numeroVacantes, SalarioMinimo, SalarioMaximo, Motivo, idUsuarioCreador, InformacionExtra, comentarios, fechaCreacion, fechaActualizacion)
        VALUES (${company.idEmpresa}, ${position.idPuesto}, ${idSite}, 2, 2, 5, 15000, 25000, 'TEST_VACANTE_GLOBAL', ${idUsuario}, 'Esta es una vacante de prueba creada para validar el diseño de la UI del detalle de la vacante sin restricciones de rol.', 'Vacante global visible para todos los roles.', NOW(), NOW())
    `);

    console.log("Test vacancy created successfully!");
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
