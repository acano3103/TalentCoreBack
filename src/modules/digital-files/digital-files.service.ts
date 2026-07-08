import { Injectable, ForbiddenException, NotFoundException, UnauthorizedException, InternalServerErrorException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { Logger } from '@nestjs/common';
import { ActiveUserDto } from '../auth/dto/active-user.dto';
import { DigitalFilesQueries } from './queries/digital-files.queries';
import * as path from 'path';
import * as fs from 'fs-extra';
import { DocumentoAceptado, DocumentoRechazado } from './interfaces/digital-files.interface';

@Injectable()
export class DigitalFilesService {
  private readonly logger = new Logger(DigitalFilesService.name);
  private readonly mediaRoot = path.join(process.cwd(), 'media');

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService
  ) { }

  async listExpedientes(companyId: number, page: number, limit: number, search: string) {
    const where = {
      idEmpresa: companyId,
      activo: true,
      ...(search
        ? {
          OR: [
            { nombre: { contains: search } },
            { primerApellido: { contains: search } },
            { segundoApellido: { contains: search } },
            { curp: { contains: search } },
          ],
        }
        : {}),
    };

    const [empleados, total] = await Promise.all([
      this.prisma.empleados.findMany({
        where,
        include: { CatPuestos: { select: { NombrePuesto: true } } },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { nombre: 'asc' },
      }),
      this.prisma.empleados.count({ where }),
    ]);

    const idsEmpleado = empleados.map((e) => e.idEmpleado);
    const expedientes = idsEmpleado.length
      ? await this.prisma.expedientes.findMany({
        where: { idEmpleado: { in: idsEmpleado } },
      })
      : [];
    const expedienteMap = new Map(expedientes.map((e) => [e.idEmpleado, e]));

    const data = empleados.map((e) => {
      const expediente = expedienteMap.get(e.idEmpleado);
      return {
        idEmpleado: e.idEmpleado,
        nombreCompleto: [e.nombre, e.primerApellido, e.segundoApellido].filter(Boolean).join(' '),
        curp: e.curp,
        idPuesto: e.idPuesto,
        puesto: e.CatPuestos?.NombrePuesto ?? null,
        estatusExpediente: expediente?.idEstatus ?? null,
      };
    });

    return {
      data,
      total,
      currentPage: page,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }


  async getExpediente(companyId: number, employeeId: number) {

    const empleado = await this.prisma.empleados.findUnique({
      where: { idEmpleado: employeeId },
    });

    if (!empleado) {
      throw new NotFoundException('Empleado no encontrado');
    }
    if (empleado.idEmpresa !== null && empleado.idEmpresa !== companyId) {
      throw new ForbiddenException('El empleado no pertenece a esta empresa');
    }

    // Puesto y estatus del expediente
    const expediente = await this.prisma.expedientes.findFirst({
      where: { idEmpleado: employeeId },
      select: { idPuesto: true, idEstatus: true },
    });

    const idPuesto = expediente?.idPuesto ?? null;
    const estatusExpediente = expediente?.idEstatus ?? null;

    const [documentosRequeridos, documentosSubidos, infoEmpleado, catalogos] =
      await Promise.all([
        idPuesto ? this.getDocumentsByPosition(idPuesto) : Promise.resolve([]),
        this.getEmployeeDocuments(employeeId),
        this.getEmployeeInfo(empleado),
        this.getCatalogs(),
      ]);

    return {
      success: true,
      documentosRequeridos,
      documentosSubidos,
      infoEmpleado,
      catalogos,
      idPuesto,
      estatusExpediente,
      idCampania: infoEmpleado.personales?.idCampania ?? null,
      idEmpleado: employeeId,
    };
  }


  async getDocumentsByPosition(idPuesto: number) {
    const docsPuesto = await this.prisma.documentosPuesto.findMany({
      where: { idPuesto },
    });
    if (docsPuesto.length === 0) return [];

    const idsDocumento = docsPuesto.map((d) => d.idDocumento);
    const catDocumentos = await this.prisma.catDocumentos.findMany({
      where: { IdDocumento: { in: idsDocumento }, Activo: true },
    });
    const catMap = new Map(catDocumentos.map((c) => [c.IdDocumento, c]));

    return docsPuesto
      .filter((d) => catMap.has(d.idDocumento))
      .map((d) => {
        const cat = catMap.get(d.idDocumento)!;
        return {
          id: cat.IdDocumento,
          nombre: cat.Descripcion,
          obligatorio: !!d.esObligatorio,
        };
      });
  }

  async initExpediente(token: string) {
    let employeeId: number;

    // Desciframos y verificamos el JWT
    try {
      const payload = await this.jwtService.verifyAsync(token);

      employeeId = Number(payload.employee_id);
      if (!employeeId) throw new UnauthorizedException('El token no contiene un ID de empleado válido');
    } catch (error) {
      throw new UnauthorizedException('El enlace no es válido o ya ha expirado.');
    }

    // Buscamos al empleado para extraer su companyId (idEmpresa)
    const empleado = await this.prisma.empleados.findUnique({
      where: { idEmpleado: employeeId },
      select: { idEmpresa: true }
    });

    if (!empleado) throw new NotFoundException('El empleado asociado a este enlace no existe');
    const companyId = Number(empleado.idEmpresa);

    // Obtenemos y retornamos los datos del expediente con el formato esperado
    return await this.getExpediente(companyId, employeeId);
  }

  async getCompanyDocuments(employeeId: number) {
    try {
      const rows = await this.prisma.$queryRaw<any[]>`
        SELECT
          de.idDocumentoEmpresa,
          de.nombre,
          de.rutaOriginal,
          de.rutaFirmado,
          de.fechaEnvio,
          de.fechaFirmado,
          n.codigoValidacion,
          n.hash,
          n.rutaConstancia,
          n.estatus AS estatusNOM151,
          n.claveMensaje,
          n.fechaObtencion
        FROM DocumentosEmpresa de
        LEFT JOIN DocumentosEmpresaNOM151 n ON n.idDocumentoEmpresa = de.idDocumentoEmpresa
        WHERE de.idEmpleado = ${employeeId}
        ORDER BY de.fechaEnvio DESC;
      `;

      // Formatear los registros para mantener la estructura exacta que el front espera
      const documentos = rows.map((row) => {

        // Función auxiliar para normalizar rutas y limpiar prefijos
        const helperBuildUrl = (ruta: string | null): string | null => {
          if (!ruta) return null;
          let cleanPath = ruta.replace(/\\/g, '/');
          cleanPath = cleanPath.replace(/^(\/RR-HH)?\/media\//, '');
          cleanPath = cleanPath.replace(/^\/+/, '');

          return cleanPath;
        };

        const urlOriginal = helperBuildUrl(row.rutaOriginal) || '';
        const urlFirmado = helperBuildUrl(row.rutaFirmado);
        const urlConstancia = helperBuildUrl(row.rutaConstancia);

        // Formateador de fechas nativo de JS
        const formatFecha = (dateInput: any): string | null => {
          if (!dateInput) return null;
          const d = new Date(dateInput);
          if (isNaN(d.getTime())) return '';

          // Formato: YYYY-MM-DD HH:mm
          const pad = (num: number) => String(num).padStart(2, '0');
          return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
        };

        return {
          id: row.idDocumentoEmpresa,
          nombre: row.nombre,
          ruta: urlOriginal,
          requereFirma: true,
          firmado: !!row.rutaFirmado,
          rutaFirmado: urlFirmado,
          fechaEnvio: formatFecha(row.fechaEnvio) || '',
          fechaFirmado: formatFecha(row.fechaFirmado),
          // Bloque anidado NOM-151 
          nom151: {
            certificado: !!row.codigoValidacion,
            codigoValidacion: row.codigoValidacion || null,
            hash: row.hash || null,
            urlConstancia: urlConstancia,
            estatus: row.estatusNOM151 || null,
            claveMensaje: row.claveMensaje || null,
            fechaObtencion: formatFecha(row.fechaObtencion),
          },
        };
      });

      return { documentos };
    } catch (error) {
      this.logger.error(error);
      throw new InternalServerErrorException({ message: error.message || 'Error interno del servidor al obtener documentos' });
    }
  }


  private async getEmployeeDocuments(employeeId: number) {
    const docsEmpleado = await this.prisma.documentosEmpleado.findMany({
      where: { idEmpleado: employeeId },
      orderBy: { fechaCarga: 'desc' },
    });
    if (docsEmpleado.length === 0) return {};

    const idsDocumento = [
      ...new Set(
        docsEmpleado
          .map((d) => d.IdDocumento)
          .filter((id): id is number => id != null),
      ),
    ];
    const catDocumentos = await this.prisma.catDocumentos.findMany({
      where: { IdDocumento: { in: idsDocumento } },
    });
    const catMap = new Map(catDocumentos.map((c) => [c.IdDocumento, c]));

    const documentosSubidos: Record<
      number,
      { archivos: { estatus: number | null; ruta: string; nombre: string }[]; habilitado: boolean }
    > = {};

    for (const doc of docsEmpleado) {
      if (doc.IdDocumento == null) continue;

      if (!documentosSubidos[doc.IdDocumento]) {
        documentosSubidos[doc.IdDocumento] = { archivos: [], habilitado: false };
      }

      documentosSubidos[doc.IdDocumento].archivos.push({
        estatus: doc.idEstatusDocumento,
        ruta: this.normalizarRutaDocumento(doc.rutaArchivo),
        nombre: catMap.get(doc.IdDocumento)?.Descripcion ?? '',
      });

      if (doc.idEstatusDocumento === 1 || doc.idEstatusDocumento === 5) {
        documentosSubidos[doc.IdDocumento].habilitado = true;
      }
    }

    return documentosSubidos;
  }


  private normalizarRutaDocumento(ruta: string | null): string {
    if (!ruta) return '';
    let rutaRelativa = ruta;

    if (/^[A-Z]:[/\\]media/i.test(rutaRelativa)) {
      rutaRelativa = rutaRelativa.replace(/^[A-Z]:[/\\]media/i, '');
    } else {
      rutaRelativa = rutaRelativa.replace(/^(\/RR-HH)?\/media\//, '');
    }

    return rutaRelativa.replace(/\\/g, '/').replace(/^\/+/, '');
  }


  private async getEmployeeInfo(empleado: { idEmpleado: number;[key: string]: any }) {
    const employeeId = empleado.idEmpleado;

    const [campania, genero, estadoCivil, tipoSanguineo, escolaridad, beneficiario, nacimiento, banco] =
      await Promise.all([
        empleado.idCampania
          ? this.prisma.catCampa_a.findUnique({ where: { idCampa_a: empleado.idCampania } })
          : null,
        empleado.idGenero
          ? this.prisma.catGenero.findUnique({ where: { idGenero: empleado.idGenero } })
          : null,
        empleado.idEstadoCivil
          ? this.prisma.catEstadoCivil.findUnique({ where: { idEstadoCivil: empleado.idEstadoCivil } })
          : null,
        empleado.idTipoSanguineo
          ? this.prisma.catTipoSanguineo.findUnique({ where: { idCatTipoSanguineo: empleado.idTipoSanguineo } })
          : null,
        empleado.idNivelEstudios
          ? this.prisma.catEscolaridad.findUnique({ where: { idNivelEstudios: empleado.idNivelEstudios } })
          : null,
        this.prisma.beneficiarios.findFirst({ where: { idEmpleado: employeeId } }),
        this.prisma.lugarNacimiento.findUnique({ where: { idEmpleado: employeeId } }),
        this.prisma.datosBancarios.findUnique({ where: { idEmpleado: employeeId } }),
      ]);

    const domicilioRows = await this.prisma.$queryRaw<
      {
        codigoPostal: string | null;
        calle: string | null;
        numeroExterior: string | null;
        numeroInterior: string | null;
        idColonia: number | null;
        nombreColonia: string | null;
        municipio: string | null;
        estado: string | null;
      }[]
    >`
      SELECT
        d.codigoPostal,
        d.calle,
        d.numeroExterior,
        d.numeroInterior,
        d.colonia AS nombreColonia,
        d.municipio,
        d.estado
      FROM DomicilioEmpleado d
      WHERE d.idEmpleado = ${employeeId}
      LIMIT 1
    `;
    const domicilio = domicilioRows[0] ?? null;

    const personales = {
      nombre: empleado.nombre,
      primerApellido: empleado.primerApellido,
      segundoApellido: empleado.segundoApellido,
      idCampania: empleado.idCampania,
      campania: campania?.descripcion ?? null,
      rfc: empleado.rfc,
      curp: empleado.curp,
      correo: empleado.correo,
      telefonoMovil: empleado.telefonoMovil,
      telefonoLocal: empleado.telefonoLocal,
      fechaNacimiento: empleado.fechaNacimiento
        ? empleado.fechaNacimiento.toISOString().split('T')[0]
        : '',
      idGenero: empleado.idGenero,
      genero: genero?.Descripcion ?? null,
      idEstadoCivil: empleado.idEstadoCivil,
      estadoCivil: estadoCivil?.Descripcion ?? null,
      idTipoSanguineo: empleado.idTipoSanguineo,
      tipoSanguineo: tipoSanguineo?.Descripcion ?? null,
      idNivelEstudios: empleado.idNivelEstudios,
      nivelEstudios: escolaridad?.Descripcion ?? null,
      nss: empleado.numeroSeguroSocial,
      tieneInfonavit: empleado.tieneInfonavit,
      numeroInfonavit: empleado.numeroInfonavit,
      tieneHijos: empleado.tieneHijos,
      numeroHijos: empleado.numeroHijos,
    };

    return {
      personales,
      beneficiario: beneficiario
        ? {
          nombre: beneficiario.nombre,
          primerApellido: beneficiario.primerApellido,
          segundoApellido: beneficiario.segundoApellido,
          fechaNacimiento: beneficiario.fechaNacimiento,
          parentesco: beneficiario.IdParentesco,
        }
        : {},
      nacimiento: nacimiento
        ? {
          lugar: nacimiento.lugar,
          pais: nacimiento.pais,
          nacionalidad: nacimiento.nacionalidad,
          estado: nacimiento.estado,
        }
        : {},
      domicilio: domicilio
        ? {
          codigoPostal: domicilio.codigoPostal,
          calle: domicilio.calle,
          numeroExterior: domicilio.numeroExterior,
          numeroInterior: domicilio.numeroInterior,
          idColonia: domicilio.idColonia,
          colonia: domicilio.nombreColonia,
          municipio: domicilio.municipio,
          estado: domicilio.estado,
        }
        : {},
      banco: banco ? { banco: banco.banco, cuenta: banco.cuentaBancaria } : {},
    };
  }


  private async getCatalogs() {
    const [generos, estadoCivil, tiposSanguineos, escolaridades, parentescos] = await Promise.all([
      this.prisma.catGenero.findMany({ where: { Activo: true } }),
      this.prisma.catEstadoCivil.findMany({ where: { Activo: true } }),
      this.prisma.catTipoSanguineo.findMany({ where: { Activo: true } }),
      this.prisma.catEscolaridad.findMany({ where: { Activo: true } }),
      this.prisma.catParentesco.findMany({ where: { Activo: true } }),
    ]);

    return {
      generos: generos.map((c) => ({ id: c.idGenero, nombre: c.Descripcion })),
      estado_civil: estadoCivil.map((c) => ({ id: c.idEstadoCivil, nombre: c.Descripcion })),
      tipos_sanguineos: tiposSanguineos.map((c) => ({ id: c.idCatTipoSanguineo, nombre: c.Descripcion })),
      escolaridades: escolaridades.map((c) => ({ id: c.idNivelEstudios, nombre: c.Descripcion })),
      parentescos: parentescos.map((c) => ({ id: c.IdParentesco, nombre: c.Descripcion })),
    };
  }

  async insertEmployeeWithFiles(
    empleadoJsonRaw: string,
    documentoMapRaw: string,
    idCampaniaRaw: string,
    files: Array<Express.Multer.File>,
    user?: ActiveUserDto
  ) {

    if (!empleadoJsonRaw) throw new BadRequestException('Falta la información del empleado');

    let empleadoData: any;
    let documentoMap: Record<string, number>;

    try {
      empleadoData = JSON.parse(empleadoJsonRaw);
      documentoMap = documentoMapRaw ? JSON.parse(documentoMapRaw) : {};
    } catch (e) {
      throw new BadRequestException('Formato JSON inválido en empleado_json o documento_map');
    }

    const idCampania = idCampaniaRaw ? parseInt(idCampaniaRaw, 10) : null;
    const usuarioRegistro = user?.username || 'sistema';
    const curp = empleadoData.curp?.toUpperCase().trim();

    if (!curp) throw new BadRequestException('El CURP del empleado es obligatorio');

    // Identificar ID del Empleado utilizando la clase de Queries estática
    const idEmpleado = await DigitalFilesQueries.findIdByCURP(this.prisma, curp);
    if (!idEmpleado) throw new BadRequestException('Empleado no encontrado por el CURP proporcionado');

    // Preparar carpetas y estructuras de control para los archivos
    const contadorPorTipo: Record<string, number> = {};
    const aceptados: DocumentoAceptado[] = [];
    const rechazados: DocumentoRechazado[] = [];

    // Guardaremos temporalmente los metadatos de los archivos aprobados para procesar sus queries dentro de la transacción
    const documentosAProcesar: Array<{ idDocumento: number; rutaRelativa: string }> = [];

    const carpetaTemp = path.join(this.mediaRoot, 'temp', curp);
    const carpetaFinal = path.join(this.mediaRoot, curp);
    await fs.ensureDir(carpetaTemp);
    await fs.ensureDir(carpetaFinal);

    if (files && files.length > 0) {
      for (const file of files) {
        const key = file.fieldname;
        const campoNormalizado = key.replace('[]', '');
        const idDocumento = documentoMap[campoNormalizado];

        if (!idDocumento) continue;

        const ext = path.extname(file.originalname).toLowerCase().replace('.', '');
        contadorPorTipo[key] = (contadorPorTipo[key] || 0) + 1;
        const sufijo = contadorPorTipo[key] === 1 ? '' : String(contadorPorTipo[key]);

        const nombreArchivo = `${campoNormalizado}${sufijo}_${curp}.${ext}`;
        const rutaTemp = path.join(carpetaTemp, nombreArchivo);
        const rutaFinal = path.join(carpetaFinal, nombreArchivo);
        const rutaRelativaBd = `${curp}/${nombreArchivo}`;

        // Guardar archivo en carpeta temporal
        await fs.writeFile(rutaTemp, file.buffer);

        // Validación simulada de Nubarium ---- QUitar cuando se implemente Nubarium
        const resultadoNubarium = { validado: true, error_infraestructura: false, score: 0.95, motivo_rechazo: null, http_status: 200 };

        const esRechazoReal = !resultadoNubarium.validado && !resultadoNubarium.error_infraestructura;

        if (esRechazoReal) {
          try {
            await fs.remove(rutaTemp);
          } catch (err) { }

          rechazados.push({
            campo: campoNormalizado,
            archivo: nombreArchivo,
            motivo: resultadoNubarium.motivo_rechazo,
            http_status: resultadoNubarium.http_status,
          });

          this.logger.warn(`Nubarium rechazó '${nombreArchivo}' para empleado ${idEmpleado} — ${resultadoNubarium.motivo_rechazo}`);
          continue;
        }

        // Mover a la ruta final si pasó con éxito
        await fs.copy(rutaTemp, rutaFinal);

        documentosAProcesar.push({
          idDocumento: Number(idDocumento),
          rutaRelativa: rutaRelativaBd
        });

        const entry: any = {
          campo: campoNormalizado,
          archivo: nombreArchivo,
          score: resultadoNubarium.score,
        };

        if (resultadoNubarium.error_infraestructura) {
          entry.advertencia = resultadoNubarium.motivo_rechazo;
        }

        aceptados.push(entry);
      }
    }

    // Romper el flujo devolviendo un errror si hay documentos inválidos legítimos
    if (rechazados.length > 0) {
      throw new BadRequestException({
        success: false,
        message: `${rechazados.length} documento(s) no pasaron la validación de Nubarium.`,
        id_empleado: idEmpleado,
        aceptados,
        rechazados,
      });
    }

    // Ejecutar la transacción compartiendo el contexto `tx`
    try {
      await this.prisma.$transaction(async (tx) => {

        // Ejecución de la actualización de datos básicos mediante el ORM
        await tx.empleados.update({
          where: { idEmpleado: idEmpleado },
          data: {
            nombre: empleadoData.nombre,
            primerApellido: empleadoData.primerApellido,
            segundoApellido: empleadoData.segundoApellido,
            idGenero: empleadoData.idGenero ? parseInt(empleadoData.idGenero, 10) : undefined,
            numeroSeguroSocial: empleadoData.numeroSeguroSocial,
            idEstadoCivil: empleadoData.idEstadoCivil ? parseInt(empleadoData.idEstadoCivil, 10) : undefined,
            fechaNacimiento: empleadoData.fechaNacimiento ? new Date(empleadoData.fechaNacimiento) : undefined,
            correo: empleadoData.correo,
            telefonoMovil: empleadoData.telefonoMovil,
            telefonoLocal: empleadoData.telefonoLocal,
            idNivelEstudios: empleadoData.idNivelEstudios ? parseInt(empleadoData.idNivelEstudios, 10) : undefined,
            idCampania: idCampania
          }
        });

        // Inyección de queries complejas delegadas de actualización inicial
        await DigitalFilesQueries.upsertLugarNacimiento(tx, idEmpleado, empleadoData);
        await DigitalFilesQueries.upsertDomicilio(tx, idEmpleado, empleadoData);
        await DigitalFilesQueries.upsertDatosBancarios(tx, idEmpleado, empleadoData.banco, empleadoData.cuenta_bancaria);

        // Procesar de forma secuencial la lógica del segundo SP para cada archivo aprobado
        for (const doc of documentosAProcesar) {
          await DigitalFilesQueries.subirDocumentoEmpleado(
            tx,
            idEmpleado,
            doc.idDocumento,
            doc.rutaRelativa,
            usuarioRegistro
          );
        }
      });

      return {
        success: true,
        message: 'Empleado registrado y documentos subidos correctamente',
        id_empleado: idEmpleado,
        aceptados,
      };

    } catch (error) {
      this.logger.error('Error procesando la transacción de base de datos de empleados', error.stack);
      throw new InternalServerErrorException({ success: false, message: error.message || 'Error en transacciones Prisma' });
    }
  }
}