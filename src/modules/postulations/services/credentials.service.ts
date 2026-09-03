import { BadRequestException } from "@nestjs/common";
import { PrismaClient } from "generated/prisma/client";
import * as fs from "fs";
import * as path from "path";
import { createEmployee } from "../queries/postulations.queries";
import { JwtService } from "@nestjs/jwt";

interface DocumentoPuestoRow {
    Documento: string;
    esObligatorio: number;
    IdDocumento: number;
}

export async function generateEmployeeAndLink(
    data: {
        jwtService: JwtService,
        frontUrl: string,
        nombre: string,
        apellido1: string,
        apellido2: string,
        curp: string,
        correo: string,
        telefono: string,
        idPuesto: number,
        idUsuario: string,
        idCampania: number | null,
        idEmpresa: number,
        idTenant: number,
        idJefeInmediato: number,
        idSite: number,
        schedules?: { dia: string; horaEntrada: string; horaSalida: string }[],
        additionalDocuments?: number[]  
    },
    files: Express.Multer.File[] = [],
    prisma: PrismaClient,
    notify: (payload: any) => Promise<void>
) {

    // Verificamos que el empleado no exista ya en db
    const exists = await prisma.empleados.findFirst({ where: { curp: data.curp } });
    if (exists) throw new BadRequestException(`El CURP ${data.curp} ya esta dado de alta con un empleado`);

    // Creamos al empleado en db y generamos su link para subir sus documentos e información
    const result = await createEmployee(data, prisma);
    const { idEmpleado, uploadLink } = result;

    // ── Guardar el horario del empleado (copiado del puesto, o editado por RH) ──
 if (data.schedules && data.schedules.length > 0) {
        for (const horario of data.schedules) {
            await prisma.$executeRaw`
                INSERT INTO HorariosEmpleado (idEmpleado, DiaSemana, HoraEntrada, HoraSalida)
                VALUES (
                    ${idEmpleado},
                    ${horario.dia},
                    ${horario.horaEntrada + ':00'},
                    ${horario.horaSalida + ':00'}
                );
            `;
        }
    }

     // ── Guardar documentos adicionales marcados por RH para este empleado ──
    if (data.additionalDocuments && data.additionalDocuments.length > 0) {
        for (const idDocumento of data.additionalDocuments) {
            await prisma.$executeRaw`
                INSERT INTO DocumentosAdicionalesEmpleado (idEmpleado, idDocumento, usuarioRegistro, fechaRegistro)
                VALUES (${idEmpleado}, ${idDocumento}, ${data.idUsuario}, NOW());
            `;
        }
    }


    // Obtenemos los documentos que se requieren para el puesto
    const documentosRaw = await prisma.$queryRaw<DocumentoPuestoRow[]>`
        SELECT 
            CD.Descripcion AS Documento,
            DP.esObligatorio,
            CD.IdDocumento 
        FROM DocumentosPuesto DP
        INNER JOIN CatDocumentos CD ON CD.IdDocumento = DP.idDocumento
        WHERE DP.idPuesto = ${data.idPuesto}
          AND CD.Activo = 1;
    `;

    const documentos = documentosRaw.map(row => ({
        nombre: row.Documento,
        obligatorio: Number(row.esObligatorio) === 1
    }));

    const docsEmpresaAdjuntos: string[] = [];

    // Guardamos los documentos del empleado en el servidor
    if (files?.length) {
        const folderPath = path.join(
            process.cwd(),
            "media",
            "empresa_docs",
            String(idEmpleado)
        );

        await fs.promises.mkdir(folderPath, { recursive: true });

        // Guardamos los documentos en la db
        for (const file of files) {
            const fileName = `${Date.now()}-${file.originalname}`;
            const filePath = path.join(folderPath, fileName);

            await fs.promises.writeFile(filePath, file.buffer);

            const relativePath = `/media/empresa_docs/${idEmpleado}/${fileName}`;

            await prisma.$executeRaw`
                INSERT INTO DocumentosEmpresa (
                    idEmpleado, nombre, rutaOriginal, usuarioRegistro
                ) VALUES (
                    ${idEmpleado}, ${fileName}, ${relativePath}, ${data.idUsuario}
                )
            `;

            docsEmpresaAdjuntos.push(fileName);
        }
    }

    // Enviamos la notificación al nuevo empleado para que suba su documentación
    await notify({
        userUuid: String(idEmpleado),
        notificationTypeCode: 'LINK_CREATED',
        to: data.correo || '',
        phone: data.telefono || undefined,
        subject: '📎 Documentación requerida para tu postulación',

        context: {
            nombre: `${data.nombre} ${data.apellido1 || ''} ${data.apellido2 || ''}`,
            documentos,
            link: uploadLink,
            docs_empresa: docsEmpresaAdjuntos
        },

        attachments: files?.map(file => ({
            filename: file.originalname,
            content: file.buffer
        })) || []
    });

    return result;
}