import { BadRequestException } from '@nestjs/common';
import { PrismaClient } from 'generated/prisma/client';

export async function generateCredentials(
    curp: string,
    nombre: string,
    apellido1: string,
    apellido2: string,
    correo: string,
    idPuesto: number,
    usuario: string,
    idCampania: number | null,
    prisma: PrismaClient
) {
    const userExist = await prisma.candidatos.findFirst({ where: { rfc: curp } });
    if (userExist) throw new BadRequestException(`El CURP ${curp} ya se encuentra registrado`);

    await prisma.$executeRaw`
        CALL SpInsCandidatoSimple(
            ${nombre},
            ${apellido1},
            ${apellido2},
            ${curp},
            ${correo},
            ${idPuesto},
            ${usuario},
            ${idCampania},
            @id_candidato
        );
    `;

    const result: any = await prisma.$queryRaw`
        SELECT @id_candidato as id;
    `;

    const idCandidato = result[0]?.id;

    if (!idCandidato) throw new Error('No se pudo insertar al candidato');

    const credenciales: any = await prisma.$queryRaw`
        SELECT claveUsuario, password 
        FROM usuarios 
        WHERE idCandidato = ${idCandidato}
        LIMIT 1;
    `;

    if (!credenciales.length) throw new Error('No se generaron credenciales');

    // AGREGAR LA LOGICA PARA EL PROCESADO DE LOS DOCUEMNTOS ANEXOS EN LA PETICIÓN

    return {
        idCandidato,
        claveUsuario: credenciales[0].claveUsuario,
        password: credenciales[0].password
    };
}