import { PrismaClient } from '../generated/prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import * as dotenv from 'dotenv';
dotenv.config();

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) throw new Error("DATABASE_URL is not set");

const adapter = new PrismaMariaDb(dbUrl);
const prisma = new PrismaClient({ adapter });

async function queryEmployee(employeeId: number) {
  const queryResult = await prisma.$queryRaw<any[]>`
      SELECT 
        ep.idEmpleado,
        ep.nombre,
        ep.primerApellido,
        ep.segundoApellido,
        ep.curp,
        ep.rfc,
        ep.correo,
        ep.telefonoMovil,
        p.idPuesto,
        p.nombrePuesto,
        tp.idTipoPuesto,
        tp.Descripcion as TipoPuesto,
        ns.IdNivelSalario,
        ns.NombreNivel as NivelSalarioNombre,
        ns.Descripcion as NivelSalarioDescripcion, 
        ns.SalarioMinimo as NivelSalarioSalarioMinimo,
        ns.SalarioMaximo as NivelSalarioSalarioMaximo,
        emp.idEmpresa,
        emp.nombre_comercial as Empresa,
        s.idSite,
        s.Descripcion as Ubicacion,
        a.idArea,
        a.Descripcion as Area,
        hs.idHistorialSalario as idSalario,
        hs.salarioBruto,
        hs.salarioNeto,
        hs.fechaInicio as fechaInicioSalario,
        tm.idTipoMoneda,
        tm.codigo as TipoMoneda,
        cpp.idPeriodicidadPago,
        cpp.descripcion as PeriodicidadPago,
        jefe.idEmpleado as idJefeDirecto,
        jefe.nombre as nombreJefeDirecto,
        jefe.primerApellido as primerApellidoJefeDirecto,
        jefe.segundoApellido as segundoApellidoJefeDirecto
      FROM Empleados ep
      JOIN CatPuestos p ON ep.idPuesto = p.idPuesto
      JOIN CatTipoPuesto tp ON tp.idTipoPuesto = p.idTipoPuesto
      JOIN CatNivelesSalario ns ON ns.IdNivelSalario = p.IdNivelSalario
      JOIN CatAreas a ON a.idArea = p.idArea
      JOIN CatEmpresas emp ON emp.idEmpresa = ep.idEmpresa
      JOIN CatSites s ON s.idSite = ep.idSite
      LEFT JOIN Empleados jefe ON ep.idJefeInmediato = jefe.idEmpleado
      LEFT JOIN HistorialSalarios hs ON hs.idEmpleado = ep.idEmpleado AND hs.actual = true
      LEFT JOIN CatTiposMoneda tm ON tm.idTipoMoneda = hs.idTipoMoneda
      LEFT JOIN CatPeriodicidadesPago cpp ON cpp.idPeriodicidadPago = hs.idPeriodicidadPago
      WHERE ep.idEmpleado = ${employeeId}
        AND ep.activo = true;
  `;
  return queryResult[0];
}

async function main() {
  console.log("Finding candidate employees in DB...");
  
  // Find active employees with jefe
  const withJefeList = await prisma.$queryRawUnsafe<any[]>(`
    SELECT idEmpleado, nombre, primerApellido, idJefeInmediato 
    FROM Empleados 
    WHERE idJefeInmediato IS NOT NULL AND activo = 1 
    LIMIT 3
  `);
  console.log("Employees with Jefe in DB:", withJefeList);

  // Find active employees without jefe
  const withoutJefeList = await prisma.$queryRawUnsafe<any[]>(`
    SELECT idEmpleado, nombre, primerApellido, idJefeInmediato 
    FROM Empleados 
    WHERE idJefeInmediato IS NULL AND activo = 1 
    LIMIT 3
  `);
  console.log("Employees without Jefe in DB:", withoutJefeList);

  if (withJefeList.length > 0) {
    const target = withJefeList[0];
    console.log(`\nTesting query for Employee with Jefe (ID: ${target.idEmpleado})...`);
    const result = await queryEmployee(target.idEmpleado);
    console.log("Result:", JSON.stringify(result, null, 2));
  } else {
    console.log("\nNo active employee with jefe found in DB.");
  }

  if (withoutJefeList.length > 0) {
    const target = withoutJefeList[0];
    console.log(`\nTesting query for Employee without Jefe (ID: ${target.idEmpleado})...`);
    const result = await queryEmployee(target.idEmpleado);
    console.log("Result:", JSON.stringify(result, null, 2));
  } else {
    console.log("\nNo active employee without jefe found in DB.");
  }
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
