import { PrismaClient } from "generated/prisma/client";
import { PrismaService } from "src/prisma/prisma.service";

export class PostulationsQueries {
  static async getProfileEvaluationDetail(
    prisma: PrismaService,
    companyId: number,
    postulationId: number,
  ): Promise<any[]> {
    return await prisma.$queryRaw`
            SELECT
                p.idPostulacion,
                p.nombre,
                p.primerApellido,
                p.segundoApellido,
                p.fechaRegistro,
                c.NombrePuesto,
                ev.decripcion AS estatus_vacante,
                pp.resumen,
                pp.estado_proceso,
                pp.score_global,
                pp.clasificacion,
                pp.decision,
                pp.indices,
                pp.detalle_por_categoria,
                pp.fortalezas_clave,
                pp.brechas_criticas,
                pp.requisitos_knockout                   
            FROM PerfilPostulante pp
            INNER JOIN Postulaciones p ON p.idPostulacion = pp.idPostulacion
            INNER JOIN Vacantes v ON p.idVacante = v.idVacante
            INNER JOIN CatPuestos c ON v.idPuesto = c.idPuesto
            LEFT JOIN CatEstatusVacante ev ON v.idEstatusVacante = ev.idEstatusVacante
            WHERE pp.idPostulacion = ${postulationId}
              AND v.idEmpresa = ${companyId};
        `;
  }
}

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
    // 🔹 1. Insert candidato
    await tx.$executeRaw`
      INSERT INTO Candidatos (
        nombre, primerApellido, segundoApellido, idCampania,
        rfc, correo, FechaRegistro, usuarioRegistro
      ) VALUES (
        ${nombre},
        ${apellido1.trim()},
        ${apellido2.trim()},
        ${idCampania},
        ${curp.trim()},
        ${correo},
        NOW(),
        ${usuario}
      );
    `;

    // 🔥 Obtener ID candidato
    const resultCandidato = await tx.$queryRaw<{ id: number }[]>`
      SELECT LAST_INSERT_ID() as id;
    `;

    const idCandidato = resultCandidato[0]?.id;

    if (!idCandidato) {
      throw new Error("No se pudo insertar candidato");
    }

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