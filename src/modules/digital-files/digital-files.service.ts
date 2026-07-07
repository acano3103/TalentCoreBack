import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service'; 

@Injectable()
export class DigitalFilesService {
  constructor(private readonly prisma: PrismaService) {}

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
              { rfc: { contains: search } },
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
        rfc: e.rfc,
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
        idPuesto ? this.getDocumentosPorPuesto(idPuesto) : Promise.resolve([]),
        this.getDocumentosEmpleado(employeeId),
        this.getInfoEmpleado(empleado),
        this.getCatalogos(),
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


  async getDocumentosPorPuesto(idPuesto: number) {
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


  private async getDocumentosEmpleado(employeeId: number) {
    const docsEmpleado = await this.prisma.documentosCandidato.findMany({
      where: { idCandidato: employeeId },
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

  
  private async getInfoEmpleado(empleado: { idEmpleado: number; [key: string]: any }) {
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
        this.prisma.beneficiarios.findFirst({ where: { idCandidato: employeeId } }),
        this.prisma.lugarNacimiento.findUnique({ where: { idCandidato: employeeId } }),
        this.prisma.datosBancarios.findUnique({ where: { idCandidato: employeeId } }),
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
        d.idColonia,
        col.Colonia AS nombreColonia,
        d.municipio,
        d.estado
      FROM DomicilioCandidato d
      LEFT JOIN \`dv-geograficos\`.catcodigopostal col
        ON d.idColonia = col.IdCodigoPostal
      WHERE d.idCandidato = ${employeeId}
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

 
  private async getCatalogos() {
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
}