import { PrismaClient } from "generated/prisma/client";

export async function createCandidateWithCredentials(
  data: {
    nombre: string;
    apellido1: string;
    apellido2: string;
    curp: string;
    correo: string;
    idPuesto: number;
    usuario: string;
    idCampania: number | null;
  },
  prisma: PrismaClient
) {
  const {
    nombre,
    apellido1,
    apellido2,
    curp,
    correo,
    idPuesto,
    usuario,
    idCampania,
  } = data;

  return await prisma.$transaction(async (tx) => {
    // 🔹 1. Insert postulacion
    await tx.$executeRaw`
      INSERT INTO Postulaciones (
        nombre, primerApellido, segundoApellido, idCampaña,
        curp, correo, telefono, fechaRegistro, idVacante
      ) VALUES (
        ${nombre},
        ${apellido1.trim()},
        ${apellido2.trim()},
        ${idCampania},
        ${curp.trim()},
        ${correo},
        '',
        NOW(),
        ${idPuesto}
      );
    `;

    // 🔥 Obtener ID postulacion
    const resultCandidato = await tx.$queryRaw<{ id: number }[]>`
      SELECT LAST_INSERT_ID() as id;
    `;

    const idCandidato = resultCandidato[0]?.id;

    if (!idCandidato) {
      throw new Error("No se pudo insertar candidato");
    }

    // Actualizar idCandidato en la postulacion (para retrocompatibilidad)
    await tx.$executeRaw`
      UPDATE Postulaciones SET idCandidato = ${idCandidato} WHERE idPostulacion = ${idCandidato};
    `;

    // 🔹 2. Insert expediente
    await tx.$executeRaw`
      INSERT INTO expedientes (
        idCandidato, idPuesto, idEstatus, fechaRegistro, usuarioRegistro
      ) VALUES (
        ${idCandidato},
        ${idPuesto},
        1,
        NOW(),
        ${usuario}
      );
    `;

    // 🔥 Obtener ID expediente
    const resultExpediente = await tx.$queryRaw<{ id: number }[]>`
      SELECT LAST_INSERT_ID() as id;
    `;

    const idExpediente = resultExpediente[0]?.id;

    if (!idExpediente) {
      throw new Error("No se pudo insertar expediente");
    }

    // 🔹 3. Historial
    await tx.$executeRaw`
      INSERT INTO HistorialExpediente (
        idExpediente,
        idEstatusAnterior,
        idEstatusNuevo,
        fechaCambio,
        usuario,
        comentario
      ) VALUES (
        ${idExpediente},
        NULL,
        1,
        NOW(),
        ${usuario},
        'Creación de credenciales'
      );
    `;

    // 🔹 4. Generar clave única (igual que SP)
    const base = (nombre[0] + apellido1).toUpperCase();
    let claveFinal = base;
    let i = 1;

    while (true) {
      const exists = await tx.$queryRaw<any[]>`
        SELECT 1 
        FROM usuarios 
        WHERE claveUsuario = ${claveFinal}
        LIMIT 1;
      `;

      if (!exists.length) break;

      claveFinal = `${base}${i}`;
      i++;
    }

    // 🔹 5. Insert usuario
    await tx.$executeRaw`
      INSERT INTO usuarios (
        idCandidato, claveUsuario, password, activo, fechaRegistro
      ) VALUES (
        ${idCandidato},
        ${claveFinal},
        LEFT(${curp}, 10),
        1,
        NOW()
      );
    `;

    // 🔹 6. Obtener credenciales
    const credenciales = await tx.$queryRaw<{
      claveUsuario: string;
      password: string;
    }[]>`
      SELECT claveUsuario, password 
      FROM usuarios 
      WHERE idCandidato = ${idCandidato}
      LIMIT 1;
    `;

    if (!credenciales.length) {
      throw new Error("No se generaron credenciales");
    }

    return {
      idCandidato,
      claveUsuario: credenciales[0].claveUsuario,
      password: credenciales[0].password,
    };
  });
}