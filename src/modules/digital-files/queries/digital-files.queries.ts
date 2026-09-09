import { PrismaService } from "src/prisma/prisma.service";

export class DigitalFilesQueries {
    // Busca el ID del empleado con base en su CURP
    static async findIdByCURP(prisma: PrismaService, curp: string): Promise<number | null> {
        const res = await prisma.$queryRaw`
      SELECT idEmpleado FROM Empleados 
      WHERE TRIM(curp) = TRIM(${curp}) 
      ORDER BY idEmpleado DESC 
      LIMIT 1;
    ` as any[];

        return res[0]?.idEmpleado ? parseInt(res[0].idEmpleado, 10) : null;
    }

    // Inserta o actualiza el Lugar de Nacimiento
    static async upsertLugarNacimiento(prisma: any, idEmpleado: number, data: any): Promise<void> {
        await prisma.$executeRaw`
      INSERT INTO LugarNacimiento (idEmpleado, lugar, pais, nacionalidad, estado)
      VALUES (${idEmpleado}, ${data.lugarNacimiento}, ${data.paisNacimiento}, ${data.nacionalidad}, ${data.estadoNacimiento})
      ON DUPLICATE KEY UPDATE
        lugar = VALUES(lugar),
        pais = VALUES(pais),
        nacionalidad = VALUES(nacionalidad),
        estado = VALUES(estado);
    `;
    }

    // Inserta o actualiza el Domicilio
   static async upsertDomicilio(prisma: any, idEmpleado: number, data: any): Promise<void> {
    await prisma.$executeRaw`
      INSERT INTO DomicilioEmpleado (idEmpleado, codigoPostal, calle, numeroExterior, numeroInterior, colonia, municipio, estado)
      VALUES (${idEmpleado}, ${data.codigo_postal}, ${data.calle}, ${data.numero_exterior}, ${data.numero_interior}, ${data.colonia}, ${data.municipio}, ${data.estado})
      ON DUPLICATE KEY UPDATE
        codigoPostal = VALUES(codigoPostal),
        calle = VALUES(calle),
        numeroExterior = VALUES(numeroExterior),
        numeroInterior = VALUES(numeroInterior),
        colonia = VALUES(colonia),
        municipio = VALUES(municipio),
        estado = VALUES(estado);
    `;
}

    // Inserta o actualiza los Datos Bancarios
    static async upsertDatosBancarios(prisma: any, idEmpleado: number, banco: string, cuentaBancaria: string): Promise<void> {
        await prisma.$executeRaw`
      INSERT INTO DatosBancarios (idEmpleado, banco, cuentaBancaria)
      VALUES (${idEmpleado}, ${banco}, ${cuentaBancaria})
      ON DUPLICATE KEY UPDATE
        banco = VALUES(banco),
        cuentaBancaria = VALUES(cuentaBancaria);
    `;
    }

    // Busca el último expediente asociado al empleado
    static async findLatestExpediente(prisma: any, idEmpleado: number): Promise<number | null> {
        const res = await prisma.$queryRaw`
      SELECT idExpediente FROM Expedientes 
      WHERE idEmpleado = ${idEmpleado} 
      ORDER BY idExpediente DESC 
      LIMIT 1;
    ` as any[];

        return res[0]?.idExpediente ? parseInt(res[0].idExpediente, 10) : null;
    }

// Guardar documento del empleado
static async subirDocumentoEmpleado(
    prisma: any,
    idEmpleado: number,
    idDocumento: number,
    rutaArchivo: string,
    usuario: string,
    comentario: string = '',
    fechaEmision: Date | null = null,
    fechaVencimiento: Date | null = null,
): Promise<void> {

    // Resolvemos el idTenant desde el propio empleado, ya que este método
    // se llama tanto desde flujo privado (RH) como público (candidato por token),
    // y no siempre hay un ActiveUserDto disponible.
    const empleadoRows = await prisma.$queryRaw`
        SELECT idTenant FROM Empleados WHERE idEmpleado = ${idEmpleado} LIMIT 1;
    ` as any[];
    const idTenant = empleadoRows[0]?.idTenant ? parseInt(empleadoRows[0].idTenant, 10) : null;

    if (!idTenant) {
        throw new Error('No se pudo determinar el tenant del empleado.');
    }

    // Buscar si ya existe el registro del documento del empleado en estatus 1 o 5
    const docsExistentes = await prisma.$queryRaw`
        SELECT idDocumentoEmpleado, idEstatusDocumento 
        FROM DocumentosEmpleado
        WHERE idEmpleado = ${idEmpleado}
            AND idDocumento = ${idDocumento}
            AND idTenant = ${idTenant}
            AND idEstatusDocumento IN (1, 5)
        ORDER BY fechaCarga DESC
        LIMIT 1;
    ` as any[];

    let idDocumentoEmpleado: number;
    let estatusAnterior: number;

    if (docsExistentes.length > 0) {
        idDocumentoEmpleado = parseInt(docsExistentes[0].idDocumentoEmpleado, 10);
        estatusAnterior = parseInt(docsExistentes[0].idEstatusDocumento, 10);

        // Actualizar el documento existente al estatus 2
        await prisma.$executeRaw`
            UPDATE DocumentosEmpleado
            SET rutaArchivo = ${rutaArchivo},
                fechaCarga = NOW(),
                idEstatusDocumento = 2,
                fechaEmision = ${fechaEmision},
                fechaVencimiento = ${fechaVencimiento}
            WHERE idDocumentoEmpleado = ${idDocumentoEmpleado};
        `;
    } else {
        // Si no existe, insertar un nuevo registro de documento
        await prisma.$executeRaw`
            INSERT INTO DocumentosEmpleado (idEmpleado, idDocumento, idEstatusDocumento, idTenant, rutaArchivo, fechaCarga, fechaEmision, fechaVencimiento)
            VALUES (${idEmpleado}, ${idDocumento}, 2, ${idTenant}, ${rutaArchivo}, NOW(), ${fechaEmision}, ${fechaVencimiento});
        `;

        // Obtener el ID autogenerado del documento insertado (LAST_INSERT_ID)
        const resLastId = await prisma.$queryRaw`SELECT LAST_INSERT_ID() AS id;` as any[];
        idDocumentoEmpleado = parseInt(resLastId[0]?.id, 10) || 0;
        estatusAnterior = 1;
    }

    // 2. Insertar historial del documento cargado (HistorialDocumentosCandidato: fuera de nuestro alcance, sin idTenant)
    await prisma.$executeRaw`
        INSERT INTO HistorialDocumentosCandidato (idDocumentoCandidato, rutaArchivo, usuario, comentario, estatusAnterior, estatusActual)
        VALUES (${idDocumentoEmpleado}, ${rutaArchivo}, ${usuario}, ${comentario}, ${estatusAnterior}, 2);
    `;

   // 3. Obtener el último expediente asociado al empleado para gestionar su flujo de estados
    const expedientes = await prisma.$queryRaw`
        SELECT idExpediente, idEstatus 
        FROM Expedientes
        WHERE idEmpleado = ${idEmpleado} AND idTenant = ${idTenant}
        ORDER BY idExpediente DESC
        LIMIT 1;
    ` as any[];

    if (expedientes.length > 0) {
        const idExpediente = parseInt(expedientes[0].idExpediente, 10);
        const estatusExpedienteAnterior = expedientes[0].idEstatus ? parseInt(expedientes[0].idEstatus, 10) : null;

        // Si el expediente no está en estatus 3, lo cambiamos a 3 y registramos el cambio en el historial
        if (estatusExpedienteAnterior !== null && estatusExpedienteAnterior !== 3) {
            await prisma.$executeRaw`
                INSERT INTO HistorialExpediente (idExpediente, idEstatusAnterior, idEstatusNuevo, idTenant, fechaCambio, usuario, comentario)
                VALUES (${idExpediente}, ${estatusExpedienteAnterior}, 3, ${idTenant}, NOW(), ${usuario}, 'Cambio automático por carga de documento');
            `;

            await prisma.$executeRaw`
                UPDATE Expedientes
                SET idEstatus = 3,
                    fechaActualizacion = NOW(),
                    usuarioActualizacion = ${usuario}
                WHERE idExpediente = ${idExpediente};
            `;
        }
    }
}

    /**
     * Calcula el estatus de vigencia de un documento comparando su
     * fechaVencimiento contra hoy + diasAlertaPrevio.
     * Es una función pura (sin acceso a base de datos), reutilizable
     * tanto en el expediente actual como en el futuro módulo de
     * control de vencimientos.
     */
    static calcularEstatusVigencia(
        fechaVencimiento: Date | null,
        diasAlertaPrevio: number | null,
    ): 'sin_vigencia' | 'vigente' | 'por_vencer' | 'vencido' {
        if (!fechaVencimiento) return 'sin_vigencia';

        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);

        const vencimiento = new Date(fechaVencimiento);
        vencimiento.setHours(0, 0, 0, 0);

        if (hoy > vencimiento) return 'vencido';

        const diasAlerta = diasAlertaPrevio ?? 30;
        const inicioAlerta = new Date(vencimiento);
        inicioAlerta.setDate(inicioAlerta.getDate() - diasAlerta);

        if (hoy >= inicioAlerta) return 'por_vencer';

        return 'vigente';
    }
}