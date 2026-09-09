import { JwtService } from "@nestjs/jwt";
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
                ep.descripcion AS estatus_postulacion,
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
            LEFT JOIN CatEstatusPostulacion ep ON p.idEstatus = ep.idEstatusPostulacion
            WHERE pp.idPostulacion = ${postulationId}
              AND v.idEmpresa = ${companyId};
        `;
  }
}

export async function createEmployee(
  data: {
    jwtService: JwtService;
    frontUrl: string;
    nombre: string;
    apellido1: string;
    apellido2: string;
    curp: string;
    correo: string;
    telefono: string;
    idPuesto: number;
    idUsuario: string;
    idCampania: number | null;
    idEmpresa: number;
    idTenant: number;
    idJefeInmediato: number;
    idSite: number;
  },
  prisma: PrismaClient
) {
   const { jwtService, frontUrl, nombre, apellido1, apellido2, curp, correo, telefono, idPuesto, idUsuario, idCampania, idEmpresa, idTenant, idJefeInmediato, idSite } = data; 

  return await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      INSERT INTO Empleados (
        idEmpresa, idTenant, idPuesto, idJefeInmediato, idSite, nombre, primerApellido, segundoApellido, idCampania,
        curp, correo, telefonoMovil, FechaRegistro, usuarioRegistro
      ) VALUES (
        ${idEmpresa},
        ${idTenant},
        ${idPuesto},
        ${idJefeInmediato},
        ${idSite},
        ${nombre},
        ${apellido1.trim()},
        ${apellido2.trim()},
        ${idCampania},
        ${curp.trim()},
        ${correo},
        ${telefono},
        NOW(),
        ${idUsuario}
      );
    `;

    // Obtener ID empleado
    const resultEmployee = await tx.$queryRaw<{ id: any }[]>`
      SELECT LAST_INSERT_ID() as id;
    `;

    // Convertimos explícitamente el BigInt a un Number de JS
    const idEmpleado = resultEmployee[0]?.id ? Number(resultEmployee[0].id) : null;
    if (!idEmpleado) throw new Error("No se pudo insertar empleado");

    // Insert expediente del empleado
    await tx.$executeRaw`
      INSERT INTO Expedientes (
        idEmpleado, idPuesto, idEstatus, idTenant, fechaRegistro, usuarioRegistro
      ) VALUES (
        ${idEmpleado},
        ${idPuesto},
        1,
        ${idTenant},
        NOW(),
        ${idUsuario}
      );
    `;

    // Obtener ID expediente
    const resultExpediente = await tx.$queryRaw<{ id: number }[]>`
      SELECT LAST_INSERT_ID() as id;
    `;

    const idExpediente = resultExpediente[0]?.id ? Number(resultExpediente[0].id) : null;
    if (!idExpediente) throw new Error("No se pudo insertar el expediente del empleado");

    // Guardamos el historial de cambios del expediente
    await tx.$executeRaw`
      INSERT INTO HistorialExpediente (
        idExpediente,
        idEstatusAnterior,
        idEstatusNuevo,
        idTenant,
        fechaCambio,
        usuario,
        comentario
      ) VALUES (
        ${idExpediente},
        NULL,
        1,
        ${idTenant},
        NOW(),
        ${idUsuario},
        'Creación de link para subida de documentos'
      );
    `;

    // Generamos el token con expiración de un mes
    const token = jwtService.sign(
      { employee_id: idEmpleado },
      { expiresIn: '30d' }
    );

    // Generamos el link que le enviaremos al empleado para que suba su info y documentación
    const uploadLink = `${frontUrl}upload-information/${token}`;

    // Insertamos el link y el token en la info del empleado
    await tx.$executeRaw`
      UPDATE Empleados 
      SET uploadLink = ${uploadLink}, token = ${token}
      WHERE idEmpleado = ${idEmpleado};
    `;

    return { idEmpleado, uploadLink };
  });
}