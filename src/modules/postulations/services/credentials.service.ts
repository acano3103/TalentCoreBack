import { BadRequestException } from "@nestjs/common";
import { PrismaClient } from "generated/prisma/client";
import * as fs from "fs";
import * as path from "path";
import { createCandidateWithCredentials } from "../queries/postulations.queries";

export async function generateCredentials(
    data: {
        curp: string;
        nombre: string;
        apellido1: string;
        apellido2: string;
        correo: string;
        idPuesto: number;
        usuario: string;
        idCampania: number | null;
    },
    files: Express.Multer.File[] = [],
    prisma: PrismaClient,
    notify: (payload: any) => Promise<void>
) {

    const { curp, idPuesto } = data;

    const exists = await prisma.candidatos.findFirst({ where: { rfc: curp } });
    if (exists) throw new BadRequestException(`El CURP ${curp} ya existe`);

    const result = await createCandidateWithCredentials(data, prisma);
    const { idCandidato, claveUsuario, password } = result;
    const idCandidatoNumber = Number(idCandidato);

    const documentosRaw = await prisma.$queryRaw<any[]>`
        CALL SpConDocumentosPuesto(${idPuesto});
    `;

    const rows = Array.isArray(documentosRaw[0]) ? documentosRaw[0] : documentosRaw;
    const documentos = rows
        .map(d => Object.values(d)[0] as any[])
        .filter(v => Array.isArray(v) && v[0])
        .map(values => ({
            nombre: values[0],
            obligatorio: Number(values[1]) === 1
        }));

    const docsEmpresaAdjuntos: string[] = [];

    if (files?.length) {
        const folderPath = path.join(
            process.cwd(),
            "src/media",
            "empresa_docs",
            String(idCandidatoNumber)
        );

        await fs.promises.mkdir(folderPath, { recursive: true });

        for (const file of files) {
            const fileName = `${Date.now()}-${file.originalname}`;
            const filePath = path.join(folderPath, fileName);

            await fs.promises.writeFile(filePath, file.buffer);

            const relativePath = `empresa_docs/${idCandidatoNumber}/${fileName}`;

            await prisma.$executeRaw`
                INSERT INTO DocumentosEmpresa (
                    idCandidato, nombre, rutaOriginal, usuarioRegistro
                ) VALUES (
                    ${idCandidatoNumber}, ${fileName}, ${relativePath}, ${data.usuario}
                )
            `;

            docsEmpresaAdjuntos.push(fileName);
        }
    }

    const usuarioDB = await prisma.usuarios.findFirst({ where: { idCandidato: idCandidatoNumber } });
    if (!usuarioDB) throw new BadRequestException('No se encontró el usuario');

    const candidato = await prisma.candidatos.findFirst({ where: { idCandidato: idCandidatoNumber } });
    if (!candidato) throw new BadRequestException('No se encontró el candidato');

    await notify({
        userUuid: usuarioDB.uuid,
        notificationTypeCode: 'CREDENTIALS_CREATED',
        to: candidato.correo,
        phone: candidato.telefonoMovil,
        subject: '📎 Documentación requerida para tu postulación - DataVoice',

        context: {
            nombre: `${candidato.nombre} ${candidato.primerApellido} ${candidato.segundoApellido || ''}`,
            documentos,
            claveusuario: claveUsuario,
            password: password,
            docs_empresa: docsEmpresaAdjuntos
        },

        attachments: files?.map(file => ({
            filename: file.originalname,
            content: file.buffer
        })) || []
    });

    return result;
}