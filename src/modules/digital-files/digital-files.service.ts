import { Injectable, ForbiddenException, NotFoundException, UnauthorizedException, InternalServerErrorException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { ActiveUserDto } from '../auth/dto/active-user.dto';
import { DigitalFilesQueries } from './queries/digital-files.queries';
import * as path from 'path';
import * as fs from 'fs-extra';
import { DocumentoAceptado, DocumentoRechazado } from './interfaces/digital-files.interface';
import { NubariumService } from './services/nubarium.service';
import { NotificationDispatcher } from 'src/modules/notifications/notification.dispatcher';
import { Cron } from '@nestjs/schedule';
import { generateEmployeeAndLink } from '../postulations/services/credentials.service';
import JSZip = require('jszip');

@Injectable()
export class DigitalFilesService {
  private readonly logger = new Logger(DigitalFilesService.name);
  private readonly mediaRoot = path.join(process.cwd(), 'media');

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly nubariumService: NubariumService,
    private readonly configService: ConfigService,
    private readonly notifications: NotificationDispatcher,
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
      include: { CatPuestos: { select: { NombrePuesto: true } } },
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
    const [documentosRequeridos, documentosSubidos, infoEmpleado, catalogos, horarioEmpleado] =
      await Promise.all([
        idPuesto ? this.getDocumentsByPosition(idPuesto, employeeId) : Promise.resolve([]),
        this.getEmployeeDocuments(employeeId),
        this.getEmployeeInfo(empleado),
        this.getCatalogs(),
        this.getEmployeeSchedule(employeeId),
      ]);

    return {
      success: true,
      documentosRequeridos,
      documentosSubidos,
      infoEmpleado,
      catalogos,
      horarioEmpleado,
      idPuesto,
      puesto: empleado.CatPuestos?.NombrePuesto ?? null,
      estatusExpediente,
      idCampania: infoEmpleado.personales?.idCampania ?? null,
      idEmpleado: employeeId,
    };
  }


  async getDocumentsByPosition(idPuesto: number, idEmpleado?: number) {
    const docsPuesto = await this.prisma.documentosPuesto.findMany({
      where: { idPuesto },
    });

    // Documentos adicionales marcados específicamente para este empleado
    const docsAdicionales = idEmpleado
      ? await this.prisma.$queryRaw<{ idDocumento: number }[]>`
          SELECT idDocumento FROM DocumentosAdicionalesEmpleado WHERE idEmpleado = ${idEmpleado};
        `
      : [];

    const idsDocumento = [
      ...new Set([
        ...docsPuesto.map((d) => d.idDocumento),
        ...docsAdicionales.map((d) => d.idDocumento),
      ]),
    ];

    if (idsDocumento.length === 0) return [];

    const catDocumentos = await this.prisma.catDocumentos.findMany({
      where: { IdDocumento: { in: idsDocumento }, Activo: true },
    });
    const catMap = new Map(catDocumentos.map((c) => [c.IdDocumento, c]));

    const idsObligatorios = new Set(docsPuesto.filter((d) => d.esObligatorio).map((d) => d.idDocumento));
    const idsAdicionales = new Set(docsAdicionales.map((d) => d.idDocumento));

    return idsDocumento
      .filter((id) => catMap.has(id))
      .map((id) => {
        const cat = catMap.get(id)!;
        return {
          id: cat.IdDocumento,
          nombre: cat.Descripcion,
          // Obligatorio si el puesto lo marca así, o si es un adicional (siempre se pide como obligatorio para ese empleado)
          obligatorio: idsObligatorios.has(id) || idsAdicionales.has(id),
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
      throw new UnauthorizedException('El enlace no es válido o ya ha expirado. Por favor contacte al reclutador para obtener un nuevo enlace.');
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

      // Función auxiliar para normalizar rutas y limpiar prefijos
      const helperBuildUrl = (ruta: string | null): string | null => {
        if (!ruta) return null;
        let cleanPath = ruta.replace(/\\/g, '/');
        cleanPath = cleanPath.replace(/^((\/RR-HH)?\/)?media\//, '');
        cleanPath = cleanPath.replace(/^\/+/, '');
        return cleanPath;
      };

      // Formateador de fechas nativo de JS
      const formatFecha = (dateInput: any): string | null => {
        if (!dateInput) return null;
        const d = new Date(dateInput);
        if (isNaN(d.getTime())) return '';
        const pad = (num: number) => String(num).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
      };

      // Formatear los registros de DocumentosEmpresa
      const documentos = rows.map((row) => {
        const urlOriginal = helperBuildUrl(row.rutaOriginal) || '';
        const urlFirmado = helperBuildUrl(row.rutaFirmado);
        const urlConstancia = helperBuildUrl(row.rutaConstancia);

        return {
          id: row.idDocumentoEmpresa,
          nombre: row.nombre,
          ruta: urlOriginal,
          requereFirma: true,
          firmado: !!row.rutaFirmado,
          rutaFirmado: urlFirmado,
          fechaEnvio: formatFecha(row.fechaEnvio) || '',
          fechaFirmado: formatFecha(row.fechaFirmado),
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

      // Consultar el contrato más reciente del empleado
      const contratoRows = await this.prisma.$queryRaw<any[]>`
        SELECT
          c.idContrato,
          dg.id AS idDocumentoGenerado,
          dg.archivoGenerado AS rutaOriginal,
          dg.firmado,
          dg.fechaGeneracion,
          dg.codigoValidacionNOM151 AS codigoValidacion,
          dg.hashNOM151 AS hash,
          dg.archivoNom151 AS rutaConstancia,
          dg.fechaSellado AS fechaObtencion
        FROM Contratos c
        INNER JOIN DocumentosGenerados dg ON dg.idContrato = c.idContrato
        WHERE c.idEmpleado = ${employeeId}
          AND dg.archivoGenerado IS NOT NULL
        ORDER BY dg.fechaGeneracion DESC
        LIMIT 1
      `;

      if (contratoRows.length > 0) {
        const row = contratoRows[0];
        const urlOriginal = helperBuildUrl(row.rutaOriginal) || '';

        let rutaConstancia = row.rutaConstancia;
        if (rutaConstancia && rutaConstancia.endsWith('.cer')) {
          rutaConstancia = rutaConstancia.replace(/\.cer$/, '_constancia.pdf');
        }
        const urlConstancia = helperBuildUrl(rutaConstancia);

        const contratoDocumento = {
          id: -(row.idContrato),
          nombre: 'Contrato Laboral',
          ruta: urlOriginal,
          requereFirma: true,
          firmado: !!row.firmado,
          rutaFirmado: null,
          fechaEnvio: formatFecha(row.fechaGeneracion) || '',
          fechaFirmado: null,
          nom151: {
            certificado: !!row.codigoValidacion,
            codigoValidacion: row.codigoValidacion || null,
            hash: row.hash || null,
            urlConstancia: urlConstancia,
            estatus: row.codigoValidacion ? 'COMPLETADO' : null,
            claveMensaje: null,
            fechaObtencion: formatFecha(row.fechaObtencion),
          },
        };

        documentos.unshift(contratoDocumento);
      }

      return { documentos };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Error interno del servidor al obtener documentos';
      this.logger.error(message);
      throw new InternalServerErrorException({ message });
    }
  }

  private async getEmployeeSchedule(employeeId: number) {
    const horarios = await this.prisma.$queryRaw<
      { DiaSemana: string | null; HoraEntrada: Date | null; HoraSalida: Date | null }[]
    >`
      SELECT DiaSemana, HoraEntrada, HoraSalida
      FROM HorariosEmpleado
      WHERE idEmpleado = ${employeeId};
    `;

    const formatearHora = (fecha: Date | null): string => {
      if (!fecha) return '';
      const d = new Date(fecha);
      const horas = String(d.getUTCHours()).padStart(2, '0');
      const minutos = String(d.getUTCMinutes()).padStart(2, '0');
      return `${horas}:${minutos}`;
    };

    return horarios.map((h) => ({
      dia: h.DiaSemana ?? '',
      horaEntrada: formatearHora(h.HoraEntrada),
      horaSalida: formatearHora(h.HoraSalida),
    }));
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
      { archivos: { idDocumentoEmpleado: number; estatus: number | null; ruta: string; nombre: string; fecha: string; fechaEmision: string | null; fechaVencimiento: string | null; estatusVigencia: 'sin_vigencia' | 'vigente' | 'por_vencer' | 'vencido' }[]; habilitado: boolean }
    > = {};

    for (const doc of docsEmpleado) {
      if (doc.IdDocumento == null) continue;

      if (!documentosSubidos[doc.IdDocumento]) {
        documentosSubidos[doc.IdDocumento] = { archivos: [], habilitado: false };
      }

      const catDoc = catMap.get(doc.IdDocumento);

      documentosSubidos[doc.IdDocumento].archivos.push({
        idDocumentoEmpleado: doc.idDocumentoEmpleado,
        estatus: doc.idEstatusDocumento,
        ruta: this.normalizarRutaDocumento(doc.rutaArchivo),
        nombre: catDoc?.Descripcion ?? '',
        fecha: doc.fechaCarga ? doc.fechaCarga.toISOString().slice(0, 16).replace('T', ' ') : '',
        fechaEmision: doc.fechaEmision ? doc.fechaEmision.toISOString().slice(0, 10) : null,
        fechaVencimiento: doc.fechaVencimiento ? doc.fechaVencimiento.toISOString().slice(0, 10) : null,
        estatusVigencia: DigitalFilesQueries.calcularEstatusVigencia(
          doc.fechaVencimiento,
          catDoc?.diasAlertaPrevio ?? null,
        ),
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

    rutaRelativa = rutaRelativa.replace(/\\/g, '/').replace(/^\/+/, '');
    return `/media/${rutaRelativa}`;
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

  // ─────────────────────────────────────────────────────────────
  // Lógica compartida de guardado: recibe el idEmpleado YA resuelto
  // (por CURP en el flujo privado, o por token en el flujo público)
  // y hace todo el trabajo pesado: guardar archivos, validar con
  // Nubarium, y correr la transacción de Prisma.
  // ─────────────────────────────────────────────────────────────
  private async processEmployeeDocuments(
    idEmpleado: number,
    empleadoData: any,
    documentoMap: Record<string, number>,
    idCampania: number | null,
    files: Array<Express.Multer.File>,
    usuarioRegistro: string,
  ) {
    const curp = empleadoData.curp?.toUpperCase().trim();
    if (!curp) throw new BadRequestException('El CURP del empleado es obligatorio');
    // Validar el CURP contra RENAPO antes de continuar
    const resultadoCurp = await this.nubariumService.consultarCurpRenapo(curp);
    if (!resultadoCurp.success) {
      throw new BadRequestException(
        `El CURP ${curp} no es válido según RENAPO: ${resultadoCurp.error || 'No se pudo verificar'}`
      );
    }

    // Validar el RFC contra el SAT antes de continuar (solo si el empleado lo capturó)
    const rfc = empleadoData.rfc?.toUpperCase().trim();
    if (rfc) {
      const resultadoRfc = await this.nubariumService.consultarRfcSat(rfc);
      if (!resultadoRfc.success) {
        throw new BadRequestException(
          `El RFC ${rfc} no es válido según el SAT: ${resultadoRfc.error || 'No se pudo verificar'}`
        );
      }
    }
    // Preparar carpetas y estructuras de control para los archivos
    const contadorPorTipo: Record<string, number> = {};
    const aceptados: DocumentoAceptado[] = [];
    const rechazados: DocumentoRechazado[] = [];
    const documentosAProcesar: Array<{
      idDocumento: number;
      rutaRelativa: string;
      fechaEmision: Date | null;
      fechaVencimiento: Date | null;
    }> = [];

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

        // Obtener configuración de vigencia del catálogo de documentos
        const catDocumento = await this.prisma.catDocumentos.findUnique({
          where: { IdDocumento: Number(idDocumento) },
          select: { requiereVencimiento: true, diasVigenciaDefault: true },
        });

        const ext = path.extname(file.originalname).toLowerCase().replace('.', '');
        contadorPorTipo[key] = (contadorPorTipo[key] || 0) + 1;
        const sufijo = contadorPorTipo[key] === 1 ? '' : String(contadorPorTipo[key]);

        const nombreArchivo = `${campoNormalizado}${sufijo}_${curp}.${ext}`;
        const rutaTemp = path.join(carpetaTemp, nombreArchivo);
        const rutaFinal = path.join(carpetaFinal, nombreArchivo);
        const rutaRelativaBd = `${curp}/${nombreArchivo}`;

        await fs.writeFile(rutaTemp, file.buffer);

        const resultadoNubarium = await this.nubariumService.validarDocumentoNubarium(
          this.prisma,
          file.buffer,
          campoNormalizado,
          idEmpleado,
          idDocumento,
          nombreArchivo,
          rutaRelativaBd,
          usuarioRegistro,
          curp,
          empleadoData.numeroSeguroSocial,
          empleadoData.calle,
          catDocumento?.diasVigenciaDefault,
        );

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

        // Si el tipo de documento requiere vencimiento pero no se pudo determinar
        // una fecha (ni por Nubarium ni por el cálculo genérico), se rechaza —
        // criterio de aceptación: la fecha de vencimiento es obligatoria en ese caso.
        if (catDocumento?.requiereVencimiento && !resultadoNubarium.vigencia?.fechaVencimiento) {
          try {
            await fs.remove(rutaTemp);
          } catch (err) { }

          rechazados.push({
            campo: campoNormalizado,
            archivo: nombreArchivo,
            motivo: 'No se pudo determinar la fecha de vencimiento requerida para este documento.',
            http_status: resultadoNubarium.http_status,
          });

          this.logger.warn(`Documento '${nombreArchivo}' requiere vencimiento pero no se pudo calcular la fecha.`);
          continue;
        }

        await fs.copy(rutaTemp, rutaFinal);

        documentosAProcesar.push({
          idDocumento: Number(idDocumento),
          rutaRelativa: rutaRelativaBd,
          fechaEmision: resultadoNubarium.vigencia?.fechaEmision ?? null,
          fechaVencimiento: resultadoNubarium.vigencia?.fechaVencimiento ?? null,
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

    if (rechazados.length > 0) {
      throw new BadRequestException({
        success: false,
        message: `${rechazados.length} documento(s) no pasaron la validación de Nubarium.`,
        id_empleado: idEmpleado,
        aceptados,
        rechazados,
      });
    }

    try {
      await this.prisma.$transaction(async (tx) => {
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
            rfc: empleadoData.rfc,
            telefonoMovil: empleadoData.telefonoMovil,
            telefonoLocal: empleadoData.telefonoLocal,
            idNivelEstudios: empleadoData.idNivelEstudios ? parseInt(empleadoData.idNivelEstudios, 10) : undefined,
            idCampania: idCampania
          }
        });

        await DigitalFilesQueries.upsertLugarNacimiento(tx, idEmpleado, empleadoData);
        await DigitalFilesQueries.upsertDomicilio(tx, idEmpleado, empleadoData);
        await DigitalFilesQueries.upsertDatosBancarios(tx, idEmpleado, empleadoData.banco, empleadoData.cuenta_bancaria);

        for (const doc of documentosAProcesar) {
          await DigitalFilesQueries.subirDocumentoEmpleado(
            tx,
            idEmpleado,
            doc.idDocumento,
            doc.rutaRelativa,
            usuarioRegistro,
            '',
            doc.fechaEmision,
            doc.fechaVencimiento,
          );
        }

        // ── Actualizar horario del empleado (si se envió) ──
        if (empleadoData.schedules && Array.isArray(empleadoData.schedules) && empleadoData.schedules.length > 0) {
          await tx.$executeRaw`DELETE FROM HorariosEmpleado WHERE idEmpleado = ${idEmpleado};`;

          for (const horario of empleadoData.schedules) {
            await tx.$executeRaw`
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
      }, {
        maxWait: 5000,
        timeout: 25000
      });

      return {
        success: true,
        message: 'Empleado registrado y documentos subidos correctamente',
        id_empleado: idEmpleado,
        aceptados,
      };

    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Error en transacciones Prisma';
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error('Error procesando la transacción de base de datos de empleados', stack);
      throw new InternalServerErrorException({ success: false, message });
    }
  }

  // ─────────────────────────────────────────────────────────────
  // POST .../digital-files/employee
  // Flujo PRIVADO (RH logueado): resuelve el idEmpleado por CURP
  // ─────────────────────────────────────────────────────────────
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

    const idEmpleado = await DigitalFilesQueries.findIdByCURP(this.prisma, curp);
    if (!idEmpleado) throw new BadRequestException('Empleado no encontrado por el CURP proporcionado');

    return this.processEmployeeDocuments(idEmpleado, empleadoData, documentoMap, idCampania, files, usuarioRegistro);
  }




  // ─────────────────────────────────────────────────────────────
  // POST .../digital-files/:token/public
  // Flujo PÚBLICO (candidato sin sesión): resuelve el idEmpleado
  // verificando el JWT del token, igual que initExpediente.
  // ─────────────────────────────────────────────────────────────
  async insertEmployeeWithFilesPublic(
    token: string,
    empleadoJsonRaw: string,
    documentoMapRaw: string,
    idCampaniaRaw: string,
    files: Array<Express.Multer.File>,
  ) {
    let employeeId: number;
    try {
      const payload = await this.jwtService.verifyAsync(token);
      employeeId = Number(payload.employee_id);
      if (!employeeId) throw new UnauthorizedException('El token no contiene un ID de empleado válido');
    } catch (error) {
      throw new UnauthorizedException('El enlace no es válido o ya ha expirado.');
    }

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

    return this.processEmployeeDocuments(employeeId, empleadoData, documentoMap, idCampania, files, 'candidato');
  }

  // ─────────────────────────────────────────────────────────────
  // GET .../digital-files/:employeeId/status-history
  // Estatus actual + catálogo + historial de cambios
  // ─────────────────────────────────────────────────────────────
  async getStatusHistory(employeeId: number) {
    const expediente = await this.prisma.expedientes.findFirst({
      where: { idEmpleado: employeeId },
      orderBy: { idExpediente: 'desc' },
    });

    if (!expediente) {
      throw new NotFoundException('Expediente no encontrado.');
    }

    const [estatusActualCat, catalogo, historialRaw] = await Promise.all([
      expediente.idEstatus
        ? this.prisma.catEstatusExpedientes.findUnique({ where: { IdEstatus: expediente.idEstatus } })
        : null,
      this.prisma.catEstatusExpedientes.findMany({ where: { Activo: true } }),
      this.prisma.historialExpediente.findMany({
        where: { idExpediente: expediente.idExpediente },
        orderBy: { fechaCambio: 'desc' },
      }),
    ]);

    // Resolver nombres de estatus anterior/nuevo para cada fila del historial
    const idsEstatus = [
      ...new Set(
        historialRaw.flatMap((h) => [h.idEstatusAnterior, h.idEstatusNuevo]).filter((id): id is number => id != null),
      ),
    ];
    const estatusMap = new Map(
      (await this.prisma.catEstatusExpedientes.findMany({ where: { IdEstatus: { in: idsEstatus } } })).map((e) => [
        e.IdEstatus,
        e.Descripcion,
      ]),
    );

    const historial = historialRaw.map((h) => ({
      fecha: h.fechaCambio,
      estatusAnterior: h.idEstatusAnterior != null ? estatusMap.get(h.idEstatusAnterior) || 'N/A' : 'N/A',
      estatusNuevo: h.idEstatusNuevo != null ? estatusMap.get(h.idEstatusNuevo) || 'N/A' : 'N/A',
      comentario: h.comentario || '',
      usuario: h.usuario || '',
    }));

    return {
      success: true,
      estatusActual: estatusActualCat?.Descripcion ?? null,
      idEstatusActual: expediente.idEstatus,
      estatusCatalogo: catalogo.map((c) => ({ id: c.IdEstatus, descripcion: c.Descripcion })),
      historial,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // POST .../digital-files/:employeeId/status
  // Cambiar estatus del expediente + registrar en historial
  // ─────────────────────────────────────────────────────────────
  async updateExpedienteStatus(employeeId: number, nuevoEstatus: number, comentario: string, usuario: string) {
    const expediente = await this.prisma.expedientes.findFirst({
      where: { idEmpleado: employeeId },
      orderBy: { idExpediente: 'desc' },
    });

    if (!expediente) {
      throw new NotFoundException('Expediente no encontrado.');
    }

    const idEstatusAnterior = expediente.idEstatus;

    await this.prisma.$transaction([
      this.prisma.expedientes.update({
        where: { idExpediente: expediente.idExpediente },
        data: {
          idEstatus: nuevoEstatus,
          fechaActualizacion: new Date(),
          usuarioActualizacion: usuario,
        },
      }),
      this.prisma.historialExpediente.create({
        data: {
          idExpediente: expediente.idExpediente,
          idEstatusAnterior,
          idEstatusNuevo: nuevoEstatus,
          fechaCambio: new Date(),
          usuario,
          comentario,
        },
      }),
    ]);

    return { success: true, message: 'Estatus del expediente actualizado correctamente.' };
  }


  // ─────────────────────────────────────────────────────────────
  // GET .../digital-files/document-status-catalog
  // ─────────────────────────────────────────────────────────────
  async getDocumentStatusCatalog() {
    const estatuses = await this.prisma.catEstatusDocumentos.findMany();
    return estatuses.map((e) => ({ id: e.idEstatusDocumento, descripcion: e.Descripcion }));
  }

  // ─────────────────────────────────────────────────────────────
  // POST .../digital-files/documents/:idDocumentoEmpleado/status
  // Actualiza el estatus de UN documento específico + historial.
  // Si el nuevo estatus es Rechazado (5), notifica por correo al
  // empleado con la lista de documentos rechazados/pendientes.
  // Si todos los documentos del empleado quedan en estatus 4 (Aceptado),
  // marca el expediente completo automáticamente (igual que el sistema antiguo).
  // ─────────────────────────────────────────────────────────────
  async updateDocumentStatus(
    idDocumentoEmpleado: number,
    nuevoEstatus: number,
    comentario: string,
    usuario: string,
  ) {
    const doc = await this.prisma.documentosEmpleado.findUnique({ where: { idDocumentoEmpleado } });
    if (!doc) throw new NotFoundException('Documento no encontrado.');

    const estatusAnterior = doc.idEstatusDocumento;

    await this.prisma.documentosEmpleado.update({
      where: { idDocumentoEmpleado },
      data: { idEstatusDocumento: nuevoEstatus },
    });

    await this.prisma.$executeRaw`
      INSERT INTO HistorialDocumentosCandidato (idDocumentoCandidato, rutaArchivo, usuario, comentario, estatusAnterior, estatusActual)
      VALUES (${idDocumentoEmpleado}, ${doc.rutaArchivo}, ${usuario}, ${comentario}, ${estatusAnterior}, ${nuevoEstatus});
    `;

    if (doc.idEmpleado) {
      const pendientes = await this.prisma.documentosEmpleado.count({
        where: { idEmpleado: doc.idEmpleado, idEstatusDocumento: { not: 4 } },
      });

      if (pendientes === 0) {
        const expediente = await this.prisma.expedientes.findFirst({
          where: { idEmpleado: doc.idEmpleado },
          orderBy: { idExpediente: 'desc' },
        });

        if (expediente && expediente.idEstatus !== 4) {
          await this.prisma.$transaction([
            this.prisma.expedientes.update({
              where: { idExpediente: expediente.idExpediente },
              data: { idEstatus: 4, fechaActualizacion: new Date(), usuarioActualizacion: usuario },
            }),
            this.prisma.historialExpediente.create({
              data: {
                idExpediente: expediente.idExpediente,
                idEstatusAnterior: expediente.idEstatus,
                idEstatusNuevo: 4,
                fechaCambio: new Date(),
                usuario,
                comentario: 'Cambio automático: todos los documentos fueron aceptados',
              },
            }),
          ]);
        }
      }
    }

    return { success: true, message: 'Estatus del documento actualizado correctamente.' };
  }

  // ─────────────────────────────────────────────────────────────
  // POST .../digital-files/:employeeId/notify-rejected
  // Envía un solo correo al empleado con la lista completa de
  // documentos actualmente rechazados. Se dispara manualmente
  // desde el botón "Notificar Rechazados" en el front.
  // ─────────────────────────────────────────────────────────────
  async notifyRejectedDocuments(employeeId: number) {
    const empleado = await this.prisma.empleados.findUnique({
      where: { idEmpleado: employeeId },
      select: { nombre: true, primerApellido: true, segundoApellido: true, correo: true, telefonoMovil: true },
    });

    if (!empleado) throw new NotFoundException('Empleado no encontrado.');
    if (!empleado.correo) throw new BadRequestException('El empleado no tiene un correo registrado.');

    const documentosRechazados = await this.prisma.$queryRaw<{ nombre: string }[]>`
      SELECT CD.Descripcion AS nombre
      FROM DocumentosEmpleado DE
      INNER JOIN CatDocumentos CD ON CD.IdDocumento = DE.IdDocumento
      WHERE DE.idEmpleado = ${employeeId} AND DE.idEstatusDocumento = 5;
    `;

    if (documentosRechazados.length === 0) {
      throw new BadRequestException('Este empleado no tiene documentos rechazados actualmente.');
    }

    // Generamos un token fresco (por si el original ya expiró o ya se usó)
    const frontUrl = this.configService.get<string>('FRONT_URL') || '';
    const token = this.jwtService.sign({ employee_id: employeeId }, { expiresIn: '30d' });
    const uploadLink = `${frontUrl}upload-information/${token}`;

    await this.prisma.$executeRaw`
      UPDATE Empleados
      SET uploadLink = ${uploadLink}, token = ${token}
      WHERE idEmpleado = ${employeeId};
    `;

    await this.notifications.notify({
      userUuid: String(employeeId),
      notificationTypeCode: 'DOCUMENT_REJECTED',
      to: empleado.correo,
      phone: empleado.telefonoMovil || undefined,
      subject: 'Documentación Rechazada o Pendiente',
      context: {
        nombre_completo: [empleado.nombre, empleado.primerApellido, empleado.segundoApellido]
          .filter(Boolean)
          .join(' '),
        documentos: documentosRechazados.map((d) => d.nombre),
        liga: uploadLink,
      },
    });

    return { success: true, message: 'Notificación enviada correctamente.' };
  }

  // ─────────────────────────────────────────────────────────────
  // POST .../digital-files/:employeeId/notify-expiring
  // Envía un solo correo al empleado con la lista de documentos
  // próximos a vencer o ya vencidos. Se dispara manualmente desde
  // el botón "Notificar Vencimientos" en el front, o de forma
  // automática desde el cron semanal.
  // ─────────────────────────────────────────────────────────────
  async notifyExpiringDocuments(employeeId: number) {
    const empleado = await this.prisma.empleados.findUnique({
      where: { idEmpleado: employeeId },
      select: { nombre: true, primerApellido: true, segundoApellido: true, correo: true, telefonoMovil: true },
    });

    if (!empleado) throw new NotFoundException('Empleado no encontrado.');
    if (!empleado.correo) throw new BadRequestException('El empleado no tiene un correo registrado.');

    const documentosConVigencia = await this.prisma.$queryRaw <
      { nombre: string; fechaVencimiento: Date; diasAlertaPrevio: number }[]
    >`

      SELECT CD.Descripcion AS nombre, DE.fechaVencimiento, CD.diasAlertaPrevio
      FROM DocumentosEmpleado DE
      INNER JOIN CatDocumentos CD ON CD.IdDocumento = DE.IdDocumento
      WHERE DE.idEmpleado = ${employeeId}
        AND CD.requiereVencimiento = 1
        AND DE.fechaVencimiento IS NOT NULL;
    `;


    // Reutilizamos el mismo cálculo de semáforo que ya usa el expediente,
    // para no duplicar la lógica de "por_vencer"/"vencido" en dos lugares.
    const documentosPorNotificar = documentosConVigencia
      .map((doc) => ({
        nombre: doc.nombre,
        fechaVencimiento: doc.fechaVencimiento,
        estatusVigencia: DigitalFilesQueries.calcularEstatusVigencia(doc.fechaVencimiento, doc.diasAlertaPrevio),
      }))
      .filter((doc) => doc.estatusVigencia === 'por_vencer' || doc.estatusVigencia === 'vencido');

    if (documentosPorNotificar.length === 0) {
      throw new BadRequestException('Este empleado no tiene documentos por vencer o vencidos actualmente.');
    }

    const frontUrl = this.configService.get<string>('FRONT_URL') || '';
    const token = this.jwtService.sign({ employee_id: employeeId }, { expiresIn: '30d' });
    const uploadLink = `${frontUrl}upload-information/${token}`;

    await this.prisma.$executeRaw`
      UPDATE Empleados
      SET uploadLink = ${uploadLink}, token = ${token}
      WHERE idEmpleado = ${employeeId};
    `;

    await this.notifications.notify({
      userUuid: String(employeeId),
      notificationTypeCode: 'DOCUMENT_EXPIRING',
      to: empleado.correo,
      phone: empleado.telefonoMovil || undefined,
      subject: 'Documentos próximos a vencer',
      context: {
        nombre_completo: [empleado.nombre, empleado.primerApellido, empleado.segundoApellido]
          .filter(Boolean)
          .join(' '),
        documentos: documentosPorNotificar.map(
          (d) => `${d.nombre} (vence: ${d.fechaVencimiento.toISOString().split('T')[0]})`,
        ),
        liga: uploadLink,
      },
    });

    return { success: true, message: 'Notificación de vencimiento enviada correctamente.' };
  }

  @Cron('0 7 * * *') // todos los días a las 7:00 am
  async cronNotificarVencimientos() {
    this.logger.log('Iniciando revisión diaria de documentos por vencer...');

    const documentosConVigencia = await this.prisma.$queryRaw<
      { idEmpleado: number; fechaVencimiento: Date; diasAlertaPrevio: number }[]
    >`
    SELECT DE.idEmpleado, DE.fechaVencimiento, CD.diasAlertaPrevio
    FROM DocumentosEmpleado DE
    INNER JOIN CatDocumentos CD ON CD.IdDocumento = DE.IdDocumento
    WHERE CD.requiereVencimiento = 1
      AND DE.fechaVencimiento IS NOT NULL
      AND DE.idEmpleado IS NOT NULL
      AND (
        DE.fechaUltimaNotificacionVencimiento IS NULL
        OR DE.fechaUltimaNotificacionVencimiento < DATE_SUB(NOW(), INTERVAL 7 DAY)
      );
  `;

    const idsEmpleadoANotificar = [
      ...new Set(
        documentosConVigencia
          .filter((doc) => {
            const estatus = DigitalFilesQueries.calcularEstatusVigencia(doc.fechaVencimiento, doc.diasAlertaPrevio);
            return estatus === 'por_vencer' || estatus === 'vencido';
          })
          .map((doc) => doc.idEmpleado),
      ),
    ];

    this.logger.log(`Se encontraron ${idsEmpleadoANotificar.length} empleado(s) con documentos por vencer/vencidos.`);

    for (const idEmpleado of idsEmpleadoANotificar) {
      try {
        await this.notifyExpiringDocuments(idEmpleado);

        // Marcamos la fecha de notificación SOLO en los documentos de
        // este empleado que sí calificaron (con vigencia, sin notificar
        // recientemente), para no resetear el contador de otros documentos
        // suyos que no aplicaban todavía.
        await this.prisma.$executeRaw`
        UPDATE DocumentosEmpleado DE
        INNER JOIN CatDocumentos CD ON CD.IdDocumento = DE.IdDocumento
        SET DE.fechaUltimaNotificacionVencimiento = NOW()
        WHERE DE.idEmpleado = ${idEmpleado}
          AND CD.requiereVencimiento = 1
          AND DE.fechaVencimiento IS NOT NULL;
      `;

        this.logger.log(`Notificación de vencimiento enviada al empleado ${idEmpleado}.`);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Error desconocido';
        this.logger.warn(`No se pudo notificar al empleado ${idEmpleado}: ${message}`);
      }
    }

    this.logger.log('Revisión diaria de documentos por vencer finalizada.');
  }

  async getVencimientosDashboard(
    companyId: number,
    filtros: {
      estado?: 'vigente' | 'por_vencer' | 'vencido';
      idArea?: number;
      idSite?: number;
      idPuesto?: number;
      fechaDesde?: string;
      fechaHasta?: string;
    },
  ) {
    const rows = await this.prisma.$queryRaw<any[]>`
    SELECT
      DE.idDocumentoEmpleado,
      E.idEmpleado,
      E.nombre, E.primerApellido, E.segundoApellido,
      E.idPuesto, P.NombrePuesto,
      P.idArea, A.Descripcion AS areaNombre,
      E.idSite, S.Descripcion AS siteNombre,
      CD.IdDocumento, CD.Descripcion AS documentoNombre,
      DE.fechaVencimiento, DE.fechaEmision,
      CD.diasAlertaPrevio
    FROM DocumentosEmpleado DE
    INNER JOIN Empleados E ON E.idEmpleado = DE.idEmpleado
    INNER JOIN CatDocumentos CD ON CD.IdDocumento = DE.IdDocumento
    LEFT JOIN CatPuestos P ON P.idPuesto = E.idPuesto
    LEFT JOIN CatAreas A ON A.idArea = P.idArea
    LEFT JOIN CatSites S ON S.idSite = E.idSite
    WHERE E.idEmpresa = ${companyId}
      AND E.activo = 1
      AND CD.requiereVencimiento = 1
      AND DE.fechaVencimiento IS NOT NULL
  `;

    let resultado = rows.map((r) => ({
      idDocumentoEmpleado: r.idDocumentoEmpleado,
      idEmpleado: r.idEmpleado,
      nombreCompleto: [r.nombre, r.primerApellido, r.segundoApellido].filter(Boolean).join(' '),
      puesto: r.NombrePuesto,
      idPuesto: r.idPuesto,
      area: r.areaNombre,
      idArea: r.idArea,
      site: r.siteNombre,
      idSite: r.idSite,
      documento: r.documentoNombre,
      fechaVencimiento: r.fechaVencimiento,
      fechaEmision: r.fechaEmision,
      estatusVigencia: DigitalFilesQueries.calcularEstatusVigencia(r.fechaVencimiento, r.diasAlertaPrevio),
    }));

    if (filtros.idArea) {
      resultado = resultado.filter((d) => d.idArea === filtros.idArea);
    }
    if (filtros.idSite) {
      resultado = resultado.filter((d) => d.idSite === filtros.idSite);
    }
    if (filtros.idPuesto) {
      resultado = resultado.filter((d) => d.idPuesto === filtros.idPuesto);
    }
    if (filtros.fechaDesde) {
      resultado = resultado.filter((d) => d.fechaVencimiento && new Date(d.fechaVencimiento) >= new Date(filtros.fechaDesde!));
    }
    if (filtros.fechaHasta) {
      resultado = resultado.filter((d) => d.fechaVencimiento && new Date(d.fechaVencimiento) <= new Date(filtros.fechaHasta!));
    }

    // KPIs sobre el resultado ya filtrado (área/site/puesto/fecha), pero antes del filtro de estado
    const kpis = {
      vigente: resultado.filter((d) => d.estatusVigencia === 'vigente').length,
      por_vencer: resultado.filter((d) => d.estatusVigencia === 'por_vencer').length,
      vencido: resultado.filter((d) => d.estatusVigencia === 'vencido').length,
    };

    if (filtros.estado) {
      resultado = resultado.filter((d) => d.estatusVigencia === filtros.estado);
    }

    return { data: resultado, kpis };
  }


  // ─────────────────────────────────────────────────────────────
  // GET .../digital-files/:employeeId/download-history
  // ─────────────────────────────────────────────────────────────
  async getDownloadHistory(employeeId: number) {
    const historial = await this.prisma.$queryRaw <
      { idDescarga: number; usuario: string; motivo: string; fecha: Date }[]
    >`
      SELECT idDescarga, usuarioRegistro AS usuario, motivo, fechaDescarga AS fecha
      FROM HistorialDescargasExpediente
      WHERE idCandidato = ${employeeId}
      ORDER BY fechaDescarga DESC;
    `;

    return {
      success: true,
      historial: historial.map((h) => ({
        idDescarga: h.idDescarga,
        usuario: h.usuario,
        motivo: h.motivo,
        fecha: h.fecha ? h.fecha.toISOString().slice(0, 16).replace('T', ' ') : '',
      })),
    };
  }

  // ─────────────────────────────────────────────────────────────
  // POST .../digital-files/:employeeId/download-zip
  // Genera y regresa el ZIP con todos los documentos del empleado.
  // Solo permitido si el expediente está completo (idEstatus = 4).
  // ─────────────────────────────────────────────────────────────
  async downloadExpedienteZip(employeeId: number, motivo: string, usuario: string): Promise<Buffer> {
    if (!motivo || !motivo.trim()) {
      throw new BadRequestException('Debes ingresar un motivo de descarga.');
    }

    const expediente = await this.prisma.expedientes.findFirst({
      where: { idEmpleado: employeeId },
      orderBy: { idExpediente: 'desc' },
    });

    if (!expediente || expediente.idEstatus !== 4) {
      throw new ForbiddenException('El expediente no está completo, no se puede descargar todavía.');
    }

    await this.prisma.$executeRaw`
      INSERT INTO HistorialDescargasExpediente (idCandidato, usuarioRegistro, motivo)
      VALUES (${employeeId}, ${usuario}, ${motivo});
    `;

    const documentos = await this.prisma.documentosEmpleado.findMany({
      where: { idEmpleado: employeeId },
      select: { rutaArchivo: true },
    });

    if (documentos.length === 0) {
      throw new NotFoundException('No hay documentos para este empleado.');
    }

    const zip = new JSZip();
    for (const doc of documentos) {
      if (!doc.rutaArchivo) continue;
      const rutaRelativa = doc.rutaArchivo.replace('/media/', '').replace(/\\/g, '/');
      const rutaAbsoluta = path.join(this.mediaRoot, rutaRelativa);
      if (fs.existsSync(rutaAbsoluta)) {
        zip.file(path.basename(rutaAbsoluta), fs.readFileSync(rutaAbsoluta));
      }
    }

    return zip.generateAsync({ type: 'nodebuffer' });
  }

  // ─────────────────────────────────────────────────────────────
  // POST .../digital-files/employee-link
  // Da de alta un nuevo empleado directamente (sin pasar por
  // postulación/vacante) y le envía el link para subir su
  // documentación e información.
  // ─────────────────────────────────────────────────────────────
  async createExpedienteAndLink(
    expedienteJsonRaw: string,
    files: Array<Express.Multer.File>,
    activeUser: ActiveUserDto,
    companyId: number,
  ) {
    if (!expedienteJsonRaw) throw new BadRequestException('Faltan los datos del expediente');

    let data: any;
    try {
      data = JSON.parse(expedienteJsonRaw);
    } catch (e) {
      throw new BadRequestException('Formato JSON inválido en expediente_json');
    }

    const requiredFields = [
      'nombre', 'apellido1', 'curp', 'correo', 'telefono',
      'idPuesto', 'idJefeInmediato', 'idSite',
    ];
    const faltantes = requiredFields.filter((f) => data[f] === undefined || data[f] === null || data[f] === '');
    if (faltantes.length > 0) {
      throw new BadRequestException(`Faltan los siguientes campos: ${faltantes.join(', ')}`);
    }

    
    const result = await generateEmployeeAndLink(
      {
        jwtService: this.jwtService,
        frontUrl: this.configService.get<string>('FRONT_URL') || '',
        nombre: data.nombre,
        apellido1: data.apellido1,
        apellido2: data.apellido2 || '',
        curp: data.curp.toUpperCase().trim(),
        correo: data.correo,
        telefono: data.telefono,
        idPuesto: Number(data.idPuesto),
        idUsuario: activeUser.uuid,
        idCampania: data.idCampania ? Number(data.idCampania) : null,
        idEmpresa: companyId,
        idJefeInmediato: Number(data.idJefeInmediato),
        idSite: Number(data.idSite),
        schedules: data.schedules ?? [],
        additionalDocuments: data.additionalDocuments ?? [],
      },
      files ?? [],
      this.prisma,
      this.notifications.notify.bind(this.notifications),
    );

    return {
      success: true,
      message: 'Expediente creado correctamente. Se envió el enlace de documentación al empleado.',
      ...result,
    };


  }

  // ─────────────────────────────────────────────────────────────
// POST .../digital-files/:employeeId/resend-credentials
// Regenera el link de acceso (JWT nuevo de 30 días) y reenvía
// el correo de documentación al empleado. Se usa cuando el link
// original ya expiró y el empleado no puede volver a entrar.
// ─────────────────────────────────────────────────────────────
async resendCredentials(employeeId: number) {
  const empleado = await this.prisma.empleados.findUnique({
    where: { idEmpleado: employeeId },
    select: { nombre: true, primerApellido: true, segundoApellido: true, correo: true, telefonoMovil: true },
  });

  if (!empleado) throw new NotFoundException('Empleado no encontrado.');
  if (!empleado.correo) throw new BadRequestException('El empleado no tiene un correo registrado.');

  // Traemos el puesto del empleado para saber qué documentos le corresponden
  const expediente = await this.prisma.expedientes.findFirst({
    where: { idEmpleado: employeeId },
    select: { idPuesto: true },
  });

  const documentos = expediente?.idPuesto
    ? await this.getDocumentsByPosition(expediente.idPuesto, employeeId)
    : [];

  const frontUrl = this.configService.get<string>('FRONT_URL') || '';
  const token = this.jwtService.sign({ employee_id: employeeId }, { expiresIn: '30d' });
  const uploadLink = `${frontUrl}upload-information/${token}`;

  await this.prisma.$executeRaw`
    UPDATE Empleados
    SET uploadLink = ${uploadLink}, token = ${token}
    WHERE idEmpleado = ${employeeId};
  `;

  await this.notifications.notify({
    userUuid: String(employeeId),
    notificationTypeCode: 'LINK_CREATED',
    to: empleado.correo,
    phone: empleado.telefonoMovil || undefined,
    subject: '📎 Documentación requerida para tu postulación',
    context: {
      nombre: [empleado.nombre, empleado.primerApellido, empleado.segundoApellido].filter(Boolean).join(' '),
      documentos,
      link: uploadLink,
      docs_empresa: [],
    },
  });

  return { success: true, message: 'Link de acceso regenerado y correo reenviado correctamente.' };
}

}


