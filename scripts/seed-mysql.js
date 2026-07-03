const mysql = require('mysql2/promise');

async function seed() {
  console.log("Connecting to database...");
  const connection = await mysql.createConnection({
    host: '10.11.209.19',
    user: 'acano',
    password: 'L1k3Nuuk@AC4n0',
    database: 'fileonlineDemoV2',
    port: 3306
  });

  try {
    // 1. Get company
    const [companies] = await connection.execute('SELECT idEmpresa FROM CatEmpresas LIMIT 1');
    const idEmpresa = companies[0].idEmpresa;

    // 2. Get position
    const [positions] = await connection.execute(`SELECT idPuesto FROM CatPuestos WHERE idEmpresa = ${idEmpresa} LIMIT 1`);
    const idPuesto = positions[0].idPuesto;

    // 3. Get site
    const [sites] = await connection.execute('SELECT idSite FROM CatSites LIMIT 1');
    const idSite = sites.length > 0 ? sites[0].idSite : null;

    // 4. Get user
    const [users] = await connection.execute('SELECT id FROM auth_user LIMIT 1');
    const idUsuario = users.length > 0 ? users[0].id : null;

    // 4.5. Get employee for jefe
    const [empleados] = await connection.execute('SELECT idEmpleado FROM Empleados LIMIT 1');
    const idJefe = empleados.length > 0 ? empleados[0].idEmpleado : 1;

    // 5. Insert Vacancy
    const insertQuery = `
      INSERT INTO Vacantes (idEmpresa, idPuesto, idSite, idJefeInmediato, idEstatusVacante, numeroVacantes, SalarioMinimo, SalarioMaximo, Motivo, idUsuarioCreador, InformacionExtra, comentarios, fechaCreacion, fechaActualizacion)
      VALUES (?, ?, ?, ?, 2, 5, 15000, 25000, 'TEST_VACANTE_GLOBAL', ?, 'Esta es una vacante de prueba creada para validar el diseño de la UI del detalle de la vacante sin restricciones de rol.', 'Vacante global visible para todos los roles.', NOW(), NOW())
    `;
    
    await connection.execute(insertQuery, [idEmpresa, idPuesto, idSite, idJefe, idUsuario]);
    
    console.log("Vacancy created successfully with Motivo = 'TEST_VACANTE_GLOBAL'");
  } catch (err) {
    console.error("Error creating vacancy:", err);
  } finally {
    await connection.end();
  }
}

seed();
