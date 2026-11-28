import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Cron } from '@nestjs/schedule';
import { Prisma } from 'generated/prisma/client';
import { ExcelExportService } from 'src/common/services/excel-export.service';
import { MediaPathService } from 'src/common/services/media-path.service';
import { COMMS_EVENTO_CURSO, HechoCurso } from 'src/common/events/comms-hechos';
import { contar, hoy as hoyEnZona } from 'src/common/utils/dias-habiles';
import { localDateString } from 'src/modules/attendance/utils/timezone.util';
import { zonaValida } from 'src/modules/communications/reminders/zona-reloj';
import { ConfigurationService } from 'src/modules/configuration/configuration.service';
import { ActiveUserDto } from 'src/modules/auth/dto/active-user.dto';
import { NotificationDispatcher } from 'src/modules/notifications/notification.dispatcher';
import { PrismaService } from 'src/prisma/prisma.service';
import { diaAlmacenado, diaPrisma } from '../engine/impacto';
import { errorRuta } from '../learning-paths.errores';
import { exigirModulo } from '../permiso-modulo';
import { ReglaAlcance } from '../scope/resolver.service';
import {
  CursoResuelto,
  DatosDc3,
  FilaCumplimiento,
  VencimientoPersona,
  agruparVencimientos,
  camposFaltantes,
  celda,
  AVISO_DC4,
  cierreEtapa,
  clasificarVencimiento,
  dentroDeSemana,
  elegirColumnas,
  entraEnAviso,
  horasDe,
  limiteDc3,
  limiteDc4,
  porcentaje,
  resolverCursos,
  rutaAplicaAlSite,
  textoDc3,
} from './cumplimiento';
import { buildDc3Pdf } from './dc3.pdf';
import { PrepararDc4Dto } from './dto/compliance.dto';

const ZONA = 'America/Mexico_City';
const MODULO = 'training-compliance';

interface ConstanciaFila {
  idConstancia: number;
  idTenant: number | null;
  idEmpresa: number;
  idParticipante: number;
  idEmpleado: number;
  idCurso: number;
  fechaTerminoCurso: Date;
  fechaLimiteEntrega: Date;
  estatus: string;
}

interface CursoCargado {
  idAsignacionCurso: number;
  idCurso: number;
  estado: string;
  fechaLimite: Date;
  venceVigencia: Date | null;
  obligatorio: boolean;
  curso: string;
  idEmpleado: number;
  idRuta: number;
  estatusAsignacion: string;
  idSite: number | null;
}

@Injectable()
export class ComplianceService {
  private readonly logger = new Logger(ComplianceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configuracion: ConfigurationService,
    private readonly excel: ExcelExportService,
    private readonly media: MediaPathService,
    private readonly avisos: NotificationDispatcher,
  ) {}

  async tablero(
    user: ActiveUserDto,
    companyId: number,
    query: { soloObligatorios?: boolean; idSite?: number },
  ) {
    await exigirModulo(this.prisma, user, MODULO, 'ver');
    if (query.idSite) await this.exigirSite(companyId, query.idSite);
    const zona = await this.zonaDe(companyId);
    const dia = hoyEnZona(zona);
    const config = await this.configuracion.getTrainingConfig(companyId);
    const [personas, cursos, rutas, conteos, dc3] = await Promise.all([
      this.personas(companyId, query.idSite),
      this.cursos(companyId),
      this.rutasPublicadas(companyId),
      this.prisma.rutaAsignacion.groupBy({
        by: ['idRutaAprendizaje'],
        where: {
          idEmpresa: companyId,
          estatus: { in: ['activa', 'completada'] },
        },
        _count: { _all: true },
      }),
      this.prisma.cursoConstanciaDc3.findMany({
        where: {
          idEmpresa: companyId,
          estatus: { not: 'entregada' },
          ...(query.idSite ? { Empleados: { idSite: query.idSite } } : {}),
        },
        select: { fechaLimiteEntrega: true },
      }),
    ]);
    const idsPersona = new Set(personas.map((fila) => fila.idEmpleado));
    const visibles = query.idSite
      ? cursos.filter((fila) => idsPersona.has(fila.idEmpleado))
      : cursos;
    const resueltos = resolverCursos(
      visibles
        .filter((fila) => fila.estatusAsignacion !== 'por_aprobar')
        .map((fila) => this.filaDe(fila)),
      dia,
      config.vigenciaVentanaDias,
    );
    const obligatorios = resueltos.filter((fila) => fila.obligatorio);
    const paraKpi = query.soloObligatorios === true ? obligatorios : resueltos;
    const asignadosRuta = new Map(
      conteos.map((fila) => [fila.idRutaAprendizaje, fila._count._all]),
    );
    const columnas = elegirColumnas(
      rutas.map((ruta) => ({
        idRuta: ruta.idRutaAprendizaje,
        nombre: ruta.nombre,
        proposito: ruta.proposito,
        asignados: asignadosRuta.get(ruta.idRutaAprendizaje) ?? 0,
      })),
    );
    const porSite = this.contarPersonas(personas);
    const sites = await this.sitesDe(
      companyId,
      [...porSite.keys()],
      query.idSite,
    );
    const alcance = new Map(
      rutas.map((ruta) => [ruta.idRutaAprendizaje, ruta.alcance]),
    );
    return {
      kpis: {
        cumplimiento: porcentaje(
          obligatorios.filter((fila) => fila.cumplido).length,
          obligatorios.length,
        ),
        obligatoriosCompletados: obligatorios.filter((fila) => fila.cumplido)
          .length,
        obligatoriosAsignados: obligatorios.length,
        vencidos: paraKpi.filter((fila) => fila.vencido).length,
        porVencer: paraKpi.filter((fila) => fila.porVencer).length,
        ventanaDias: config.vigenciaVentanaDias,
        dc3: {
          porEntregar: dc3.length,
          vencenEstaSemana: dc3.filter((fila) =>
            dentroDeSemana(diaAlmacenado(fila.fechaLimiteEntrega), dia),
          ).length,
        },
      },
      matriz: {
        columnas: columnas.map((columna) => ({
          idRuta: columna.idRuta,
          nombre: columna.nombre,
          proposito: columna.proposito,
        })),
        filas: sites.map((site) => ({
          idSite: site.idSite,
          site: site.Descripcion?.trim() || `Site ${site.idSite}`,
          personas: porSite.get(site.idSite) ?? 0,
          celdas: columnas.map((columna) =>
            this.celdaDe(
              site.idSite,
              columna.idRuta,
              alcance.get(columna.idRuta) ?? [],
              resueltos,
              query.soloObligatorios === true,
            ),
          ),
        })),
      },
      vencimientos: this.nombrarSites(
        agruparVencimientos(
          this.vencimientosDe(visibles, dia, query.soloObligatorios === true),
          dia,
        ),
        new Map(
          sites.map((site) => [
            site.idSite,
            site.Descripcion?.trim() || `Site ${site.idSite}`,
          ]),
        ),
      ),
    };
  }

  async constancias(
    user: ActiveUserDto,
    companyId: number,
    estatus?: 'pendiente' | 'generada' | 'entregada',
  ) {
    await exigirModulo(this.prisma, user, MODULO, 'ver');
    const zona = await this.zonaDe(companyId);
    const dia = hoyEnZona(zona);
    const filas = await this.prisma.cursoConstanciaDc3.findMany({
      where: { idEmpresa: companyId, ...(estatus ? { estatus } : {}) },
      orderBy: { fechaLimiteEntrega: 'asc' },
      include: {
        Empleados: {
          select: {
            nombre: true,
            primerApellido: true,
            segundoApellido: true,
            curp: true,
            CatPuestos: { select: { NombrePuesto: true } },
          },
        },
        CatCursos: { select: { Descripcion: true } },
      },
    });
    return {
      items: filas.map((fila) => {
        const limite = diaAlmacenado(fila.fechaLimiteEntrega);
        return {
          idConstancia: fila.idConstancia,
          idEmpleado: fila.idEmpleado,
          nombre: nombreEmpleado(fila.Empleados),
          curp: fila.Empleados.curp,
          puesto: fila.Empleados.CatPuestos?.NombrePuesto ?? null,
          idCurso: fila.idCurso,
          curso: fila.CatCursos.Descripcion?.trim() || `Curso ${fila.idCurso}`,
          fechaTerminoCurso: diaAlmacenado(fila.fechaTerminoCurso),
          fechaLimiteEntrega: limite,
          diasHabilesRestantes: limite < dia ? 0 : contar(dia, limite),
          estatus: fila.estatus,
          fechaGenerada: fila.fechaGenerada,
          fechaEntregada: fila.fechaEntregada,
          archivo: fila.archivo,
        };
      }),
    };
  }

  async generarDc3(user: ActiveUserDto, companyId: number, ids?: number[]) {
    await exigirModulo(this.prisma, user, MODULO, 'editar');
    const pedidas = ids?.length
      ? await this.prisma.cursoConstanciaDc3.findMany({
          where: { idEmpresa: companyId, idConstancia: { in: ids } },
        })
      : await this.prisma.cursoConstanciaDc3.findMany({
          where: { idEmpresa: companyId, estatus: 'pendiente' },
        });
    if (ids?.length && pedidas.length !== new Set(ids).size) {
      throw new NotFoundException(
        'Alguna constancia no existe en esta empresa.',
      );
    }
    const objetivo = pedidas.filter((fila) => fila.estatus !== 'entregada');
    if (objetivo.length === 0) return { generadas: 0, archivos: [] };
    const generadas = await this.materializar(user, companyId, objetivo, true);
    return { generadas: generadas.length, archivos: generadas };
  }

  async entregarDc3(user: ActiveUserDto, companyId: number, id: number) {
    await exigirModulo(this.prisma, user, MODULO, 'editar');
    const fila = await this.exigirConstancia(companyId, id);
    if (fila.estatus === 'entregada') return this.vistaConstancia(fila);
    const actualizada = await this.prisma.cursoConstanciaDc3.update({
      where: { idConstancia: id },
      data: { estatus: 'entregada', fechaEntregada: new Date() },
    });
    await this.bitacora(
      user,
      companyId,
      'CursoConstanciaDc3',
      id,
      'ENTREGAR',
      `marcó como entregada la constancia DC-3 ${id}.`,
    );
    return this.vistaConstancia(actualizada);
  }

  async reportesDc4(user: ActiveUserDto, companyId: number, anio?: number) {
    await exigirModulo(this.prisma, user, MODULO, 'ver');
    const zona = await this.zonaDe(companyId);
    const ciclo = anio ?? Number(hoyEnZona(zona).slice(0, 4));
    const [sites, reportes, constancias] = await Promise.all([
      this.prisma.catSites.findMany({
        where: { idEmpresa: companyId, Activo: true },
        select: { idSite: true, Descripcion: true },
        orderBy: { Descripcion: 'asc' },
      }),
      this.prisma.reporteDc4.findMany({
        where: { idEmpresa: companyId, anio: ciclo },
      }),
      this.prisma.cursoConstanciaDc3.findMany({
        where: {
          idEmpresa: companyId,
          fechaTerminoCurso: {
            gte: diaPrisma(`${ciclo}-01-01`),
            lte: diaPrisma(`${ciclo}-12-31`),
          },
        },
        select: {
          fechaTerminoCurso: true,
          Empleados: { select: { idSite: true } },
        },
      }),
    ]);
    const porSite = new Map(reportes.map((fila) => [fila.idSite, fila]));
    return {
      anio: ciclo,
      items: sites.map((site) => {
        const reporte = porSite.get(site.idSite) ?? null;
        const cierre = reporte
          ? diaAlmacenado(reporte.fechaCierreEtapa)
          : cierreEtapa(ciclo);
        const limite = reporte
          ? diaAlmacenado(reporte.fechaLimite)
          : limiteDc4(cierre);
        const total = constancias.filter(
          (fila) =>
            fila.Empleados.idSite === site.idSite &&
            diaAlmacenado(fila.fechaTerminoCurso) <= cierre,
        ).length;
        return {
          idReporteDc4: reporte?.idReporteDc4 ?? null,
          idSite: site.idSite,
          site: site.Descripcion?.trim() || `Site ${site.idSite}`,
          anio: ciclo,
          fechaCierreEtapa: cierre,
          fechaLimite: limite,
          estatus: reporte?.estatus ?? 'sin_preparar',
          archivo: reporte?.archivo ?? null,
          fechaPresentado: reporte?.fechaPresentado ?? null,
          constancias: total,
        };
      }),
    };
  }

  async prepararDc4(
    user: ActiveUserDto,
    companyId: number,
    dto: PrepararDc4Dto,
  ): Promise<{ buffer: Buffer; nombre: string; idReporteDc4: number }> {
    await exigirModulo(this.prisma, user, MODULO, 'editar');
    const site = await this.exigirSite(companyId, dto.idSite);
    const zona = await this.zonaDe(companyId);
    const anio = dto.anio ?? Number(hoyEnZona(zona).slice(0, 4));
    const cierre = dto.fechaCierreEtapa ?? cierreEtapa(anio);
    if (!cierre.startsWith(`${anio}-`) || cierre < `${anio}-01-01`) {
      throw errorRuta(
        HttpStatus.BAD_REQUEST,
        'CIERRE_FUERA_DE_ANIO',
        'La fecha de cierre tiene que caer en el año de la etapa.',
      );
    }
    const existente = await this.prisma.reporteDc4.findFirst({
      where: { idEmpresa: companyId, idSite: dto.idSite, anio },
    });
    if (existente?.estatus === 'presentado') {
      throw errorRuta(
        HttpStatus.CONFLICT,
        'REPORTE_PRESENTADO',
        'La lista de este establecimiento ya fue presentada.',
      );
    }
    const limite = limiteDc4(cierre);
    const empresa = await this.empresaDe(companyId);
    const reporte = await this.guardarReporte(
      companyId,
      empresa.idTenant,
      dto.idSite,
      anio,
      cierre,
      limite,
      existente?.idReporteDc4 ?? null,
    );
    const constancias = await this.prisma.cursoConstanciaDc3.findMany({
      where: {
        idEmpresa: companyId,
        fechaTerminoCurso: {
          gte: diaPrisma(`${anio}-01-01`),
          lte: diaPrisma(cierre),
        },
        Empleados: { idSite: dto.idSite },
      },
      include: {
        Empleados: {
          select: {
            nombre: true,
            primerApellido: true,
            segundoApellido: true,
            curp: true,
            CatPuestos: { select: { NombrePuesto: true } },
          },
        },
        CatCursos: {
          select: {
            Descripcion: true,
            duracionHoras: true,
            areaTematicaStps: true,
          },
        },
      },
    });
    if (constancias.length > 0) {
      await this.prisma.cursoConstanciaDc3.updateMany({
        where: {
          idConstancia: { in: constancias.map((fila) => fila.idConstancia) },
        },
        data: { idReporteDc4: reporte.idReporteDc4 },
      });
    }
    const config = await this.configuracion.getTrainingConfig(companyId);
    const registro = await this.registroDeSite(companyId, dto.idSite);
    const buffer = await this.excel.generate({
      sheetName: 'DC-4',
      columns: COLUMNAS_DC4,
      rows: constancias.map((fila) => ({
        establecimiento: site.Descripcion?.trim() || `Site ${site.idSite}`,
        anio,
        razonSocial: empresa.razon_social,
        rfc: empresa.rfc ?? '',
        registroPatronal: registro ?? '',
        trabajador: nombreEmpleado(fila.Empleados),
        curp: fila.Empleados.curp ?? '',
        puesto: fila.Empleados.CatPuestos?.NombrePuesto ?? '',
        curso: fila.CatCursos.Descripcion?.trim() || '',
        horas: horasDe(fila.CatCursos.duracionHoras) ?? '',
        termino: diaAlmacenado(fila.fechaTerminoCurso),
        areaTematica: fila.CatCursos.areaTematicaStps ?? '',
        agente: config.dc3AgenteCapacitador,
        folio: `DC3-${fila.idConstancia}`,
        estatus: fila.estatus,
      })),
    });
    const nombre = `DC4_${slug(site.Descripcion || `site-${site.idSite}`)}`;
    if (empresa.idTenant) {
      const guardado = await this.media.saveGeneratedFile(buffer, {
        idTenant: empresa.idTenant,
        subfolder: 'constancias/dc4',
        fileName: `${nombre}_${reporte.idReporteDc4}_${Date.now()}.xlsx`,
        mimeType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      await this.prisma.reporteDc4.update({
        where: { idReporteDc4: reporte.idReporteDc4 },
        data: { archivo: guardado.rutaRelativa },
      });
    }
    await this.bitacora(
      user,
      companyId,
      'ReporteDc4',
      reporte.idReporteDc4,
      'PREPARAR',
      `preparó la lista DC-4 ${anio} de ${site.Descripcion?.trim() || 'el site'}.`,
    );
    return { buffer, nombre, idReporteDc4: reporte.idReporteDc4 };
  }

  async presentarDc4(user: ActiveUserDto, companyId: number, id: number) {
    await exigirModulo(this.prisma, user, MODULO, 'editar');
    const reporte = await this.prisma.reporteDc4.findFirst({
      where: { idReporteDc4: id, idEmpresa: companyId },
    });
    if (!reporte) {
      throw new NotFoundException('La lista DC-4 no existe en esta empresa.');
    }
    if (reporte.estatus === 'presentado') {
      return this.vistaReporte(reporte);
    }
    const actualizado = await this.prisma.reporteDc4.update({
      where: { idReporteDc4: id },
      data: { estatus: 'presentado', fechaPresentado: new Date() },
    });
    await this.bitacora(
      user,
      companyId,
      'ReporteDc4',
      id,
      'PRESENTAR',
      `marcó como presentada la lista DC-4 ${reporte.anio}.`,
    );
    return this.vistaReporte(actualizado);
  }

  @OnEvent(COMMS_EVENTO_CURSO)
  async onCurso(hecho: HechoCurso): Promise<void> {
    try {
      if (hecho?.tipo !== 'APROBADO') return;
      if (!hecho.idEmpresa || !hecho.idEmpleado || !hecho.idSesion) return;
      await this.crearDesdeAprobado(hecho);
    } catch (error) {
      const texto =
        error instanceof Error ? error.message : 'Error desconocido';
      this.logger.error(`DC-3 (aprobado ${hecho?.idEmpleado ?? ''}): ${texto}`);
    }
  }

  @Cron('15 8 * * *', {
    name: 'cumplimiento-avisos-stps',
    timeZone: ZONA,
  })
  async avisarPlazos(ahora?: Date): Promise<void> {
    const instante = ahora instanceof Date ? ahora : new Date();
    const empresas = await this.prisma.catEmpresas.findMany({
      where: { activo: true, idTenant: { not: null } },
      select: { idEmpresa: true, idTenant: true },
    });
    for (const empresa of empresas) {
      if (empresa.idTenant == null) continue;
      try {
        await this.avisarEmpresa(empresa.idEmpresa, empresa.idTenant, instante);
      } catch (error) {
        const texto =
          error instanceof Error ? error.message : 'Error desconocido';
        this.logger.error(
          `Avisos STPS de la empresa ${empresa.idEmpresa}: ${texto}`,
        );
      }
    }
  }

  private async crearDesdeAprobado(hecho: HechoCurso): Promise<void> {
    const participante = await this.prisma.cursoParticipantes.findFirst({
      where: { idSesion: hecho.idSesion, idEmpleado: hecho.idEmpleado },
      include: {
        CursoSeguimientoParticipante: { select: { fechaConclusion: true } },
        CursoSesiones: {
          select: {
            idEmpresa: true,
            CatCursos: { select: { idCursos: true, esNormativoStps: true } },
          },
        },
      },
    });
    const curso = participante?.CursoSesiones.CatCursos;
    if (
      !participante ||
      !curso ||
      participante.CursoSesiones.idEmpresa !== hecho.idEmpresa ||
      !curso.esNormativoStps
    ) {
      return;
    }
    const previa = await this.prisma.cursoConstanciaDc3.findUnique({
      where: { idParticipante: participante.idParticipante },
    });
    if (previa) return;
    const zona = await this.zonaDe(hecho.idEmpresa);
    const conclusion =
      participante.CursoSeguimientoParticipante?.fechaConclusion;
    const termino = conclusion
      ? localDateString(conclusion, zona)
      : hoyEnZona(zona);
    const creada = await this.prisma.cursoConstanciaDc3.create({
      data: {
        idTenant: hecho.idTenant || null,
        idEmpresa: hecho.idEmpresa,
        idParticipante: participante.idParticipante,
        idEmpleado: hecho.idEmpleado,
        idCurso: curso.idCursos,
        fechaTerminoCurso: diaPrisma(termino),
        fechaLimiteEntrega: diaPrisma(limiteDc3(termino)),
        estatus: 'pendiente',
      },
    });
    const config = await this.configuracion.getTrainingConfig(hecho.idEmpresa);
    if (!config.dc3AutoGenerar) return;
    try {
      await this.materializar(null, hecho.idEmpresa, [creada], false);
    } catch (error) {
      const texto =
        error instanceof Error ? error.message : 'Error desconocido';
      this.logger.warn(
        `No se generó sola la DC-3 ${creada.idConstancia}: ${texto}`,
      );
    }
  }

  private async materializar(
    user: ActiveUserDto | null,
    companyId: number,
    filas: ConstanciaFila[],
    estricto: boolean,
  ): Promise<{ idConstancia: number; archivo: string }[]> {
    const fichas = await this.fichasDc3(companyId, filas);
    const faltantes = filas.flatMap((fila) => {
      const ficha = fichas.get(fila.idConstancia);
      if (!ficha) {
        return [
          {
            idConstancia: fila.idConstancia,
            idEmpleado: fila.idEmpleado,
            nombre: `Empleado ${fila.idEmpleado}`,
            campos: ['Constancia'],
          },
        ];
      }
      const campos = camposFaltantes(ficha.datos);
      if (campos.length === 0) return [];
      return [
        {
          idConstancia: fila.idConstancia,
          idEmpleado: fila.idEmpleado,
          nombre: ficha.nombre,
          campos,
        },
      ];
    });
    if (faltantes.length > 0) {
      if (!estricto) {
        this.logger.warn(
          `DC-3 con datos incompletos: ${faltantes.map((fila) => fila.idConstancia).join(', ')}`,
        );
        return [];
      }
      throw new HttpException(
        {
          code: 'DATOS_INCOMPLETOS',
          codigo: 'DATOS_INCOMPLETOS',
          message: 'Faltan datos para generar la constancia DC-3.',
          detail: { faltantes },
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    const empresa = await this.empresaDe(companyId);
    if (!empresa.idTenant) {
      throw errorRuta(
        HttpStatus.BAD_REQUEST,
        'SIN_TENANT',
        'La empresa no tiene tenant para guardar el PDF.',
      );
    }
    const archivos: { idConstancia: number; archivo: string }[] = [];
    for (const fila of filas) {
      const ficha = fichas.get(fila.idConstancia);
      if (!ficha) continue;
      const pdf = await buildDc3Pdf({
        folio: `DC3-${fila.idConstancia}`,
        trabajador: ficha.datos.nombre?.trim() || ficha.nombre,
        curp: ficha.datos.curp ?? '',
        puesto: ficha.datos.puesto ?? '',
        razonSocial: empresa.razon_social,
        rfc: ficha.datos.rfc ?? '',
        registroPatronal: ficha.datos.registroPatronal ?? '',
        curso: ficha.datos.curso ?? '',
        duracionHoras: String(ficha.datos.duracionHoras ?? ''),
        periodoInicio: ficha.datos.periodoInicio ?? '',
        periodoFin: ficha.datos.periodoFin ?? '',
        areaTematica: ficha.datos.areaTematica ?? '',
        agenteCapacitador: ficha.datos.agenteCapacitador ?? '',
      });
      const guardado = await this.media.saveGeneratedFile(Buffer.from(pdf), {
        idTenant: empresa.idTenant,
        subfolder: 'constancias/dc3',
        fileName: `dc3-${fila.idConstancia}-${Date.now()}.pdf`,
        mimeType: 'application/pdf',
      });
      await this.prisma.cursoConstanciaDc3.update({
        where: { idConstancia: fila.idConstancia },
        data: {
          estatus: 'generada',
          fechaGenerada: new Date(),
          archivo: guardado.rutaRelativa,
        },
      });
      archivos.push({
        idConstancia: fila.idConstancia,
        archivo: guardado.rutaRelativa,
      });
    }
    if (user && archivos.length > 0) {
      await this.bitacora(
        user,
        companyId,
        'CursoConstanciaDc3',
        archivos[0].idConstancia,
        'GENERAR',
        `generó ${archivos.length} constancia${archivos.length === 1 ? '' : 's'} DC-3.`,
      );
    }
    return archivos;
  }

  private async fichasDc3(companyId: number, filas: ConstanciaFila[]) {
    const idsEmpleado = [...new Set(filas.map((fila) => fila.idEmpleado))];
    const idsCurso = [...new Set(filas.map((fila) => fila.idCurso))];
    const idsParticipante = [
      ...new Set(filas.map((fila) => fila.idParticipante)),
    ];
    const [empleados, cursos, participantes, empresa, config] =
      await Promise.all([
        this.prisma.empleados.findMany({
          where: { idEmpleado: { in: idsEmpleado } },
          select: {
            idEmpleado: true,
            nombre: true,
            primerApellido: true,
            segundoApellido: true,
            curp: true,
            idSite: true,
            CatPuestos: { select: { NombrePuesto: true } },
          },
        }),
        this.prisma.catCursos.findMany({
          where: { idCursos: { in: idsCurso } },
          select: {
            idCursos: true,
            Descripcion: true,
            duracionHoras: true,
            areaTematicaStps: true,
          },
        }),
        this.prisma.cursoParticipantes.findMany({
          where: { idParticipante: { in: idsParticipante } },
          select: {
            idParticipante: true,
            CursoSesiones: {
              select: {
                fechaInicioPeriodo: true,
                fechaFinPeriodo: true,
              },
            },
          },
        }),
        this.empresaDe(companyId),
        this.configuracion.getTrainingConfig(companyId),
      ]);
    const zona = await this.zonaDe(companyId);
    const registros = await this.registrosPorSite(
      companyId,
      empleados.map((fila) => fila.idSite),
    );
    const empleado = new Map(empleados.map((fila) => [fila.idEmpleado, fila]));
    const curso = new Map(cursos.map((fila) => [fila.idCursos, fila]));
    const sesion = new Map(
      participantes.map((fila) => [fila.idParticipante, fila.CursoSesiones]),
    );
    const fichas = new Map<number, { nombre: string; datos: DatosDc3 }>();
    for (const fila of filas) {
      const persona = empleado.get(fila.idEmpleado);
      const materia = curso.get(fila.idCurso);
      const periodo = sesion.get(fila.idParticipante);
      const fin =
        (periodo?.fechaFinPeriodo
          ? localDateString(periodo.fechaFinPeriodo, zona)
          : null) || diaAlmacenado(fila.fechaTerminoCurso);
      const inicio = periodo?.fechaInicioPeriodo
        ? localDateString(periodo.fechaInicioPeriodo, zona)
        : fin;
      const nombre = persona
        ? nombreEmpleado(persona)
        : `Empleado ${fila.idEmpleado}`;
      fichas.set(fila.idConstancia, {
        nombre,
        datos: {
          nombre,
          curp: textoDc3(persona?.curp),
          puesto: textoDc3(persona?.CatPuestos?.NombrePuesto),
          rfc: textoDc3(empresa.rfc),
          registroPatronal:
            (persona?.idSite != null ? registros.get(persona.idSite) : null) ??
            null,
          curso: textoDc3(materia?.Descripcion),
          duracionHoras: horasDe(materia?.duracionHoras),
          periodoInicio: textoDc3(inicio),
          periodoFin: textoDc3(fin),
          areaTematica: textoDc3(materia?.areaTematicaStps),
          agenteCapacitador: textoDc3(config.dc3AgenteCapacitador),
        },
      });
    }
    return fichas;
  }

  private async avisarEmpresa(
    idEmpresa: number,
    idTenant: number,
    ahora: Date,
  ): Promise<void> {
    const zona = await this.zonaDe(idEmpresa);
    const dia = hoyEnZona(zona, ahora);
    const config = await this.configuracion.getTrainingConfig(idEmpresa);
    const anio = Number(dia.slice(0, 4));
    const [constancias, reportes, personal] = await Promise.all([
      this.prisma.cursoConstanciaDc3.findMany({
        where: { idEmpresa, estatus: { not: 'entregada' } },
        select: {
          idConstancia: true,
          fechaLimiteEntrega: true,
          fechaTerminoCurso: true,
          Empleados: { select: { idSite: true } },
        },
      }),
      this.prisma.reporteDc4.findMany({
        where: { idEmpresa, anio },
        select: { idSite: true, fechaLimite: true, estatus: true },
      }),
      this.personalRh(idEmpresa, idTenant),
    ]);
    const dc3 = constancias.filter((fila) =>
      entraEnAviso(
        dia,
        diaAlmacenado(fila.fechaLimiteEntrega),
        config.dc3AvisoDiasHabiles,
      ),
    );
    const avisadosDc3 = await this.yaAvisados(
      idEmpresa,
      'DC3',
      dc3.map((fila) => `dc3:${fila.idConstancia}`),
    );
    const nuevasDc3 = dc3.filter(
      (fila) => !avisadosDc3.has(`dc3:${fila.idConstancia}`),
    );
    const dc4 = await this.plazosDc4(
      idEmpresa,
      constancias,
      reportes,
      anio,
      dia,
    );
    const avisadosDc4 = await this.yaAvisados(
      idEmpresa,
      'DC4',
      dc4.map((fila) => fila.referencia),
    );
    const nuevasDc4 = dc4.filter((fila) => !avisadosDc4.has(fila.referencia));
    if (nuevasDc3.length === 0 && nuevasDc4.length === 0) return;
    if (personal.length === 0) {
      this.logger.warn(
        `Sin personal de RH para los avisos STPS de la empresa ${idEmpresa}.`,
      );
      return;
    }
    if (nuevasDc3.length > 0) {
      const mensaje = `Hay ${nuevasDc3.length} constancia${nuevasDc3.length === 1 ? '' : 's'} DC-3 por entregar. Quedan ${config.dc3AvisoDiasHabiles} días hábiles o menos.`;
      await this.notificar(personal, {
        idEmpresa,
        idTenant,
        titulo: 'Constancias DC-3 por entregar',
        mensaje,
        origenId: `DC3:${dia}`,
        clave: `dc3:${idEmpresa}:${dia}`,
      });
      await this.registrarAviso(
        idEmpresa,
        'DC3',
        personal.map((persona) => persona.idEmpleado),
        nuevasDc3.map((fila) => `dc3:${fila.idConstancia}`),
      );
    }
    for (const plazo of nuevasDc4) {
      await this.notificar(personal, {
        idEmpresa,
        idTenant,
        titulo: 'Lista DC-4 por presentar',
        mensaje: `La lista DC-4 de ${plazo.site} vence en ${contar(dia, plazo.limite)} días hábiles, el ${plazo.limite}.`,
        origenId: `DC4:${plazo.idSite}:${anio}`.slice(0, 40),
        clave: `dc4:${idEmpresa}:${plazo.idSite}:${anio}`,
      });
      await this.registrarAviso(
        idEmpresa,
        'DC4',
        personal.map((persona) => persona.idEmpleado),
        [plazo.referencia],
      );
    }
  }

  private async plazosDc4(
    idEmpresa: number,
    constancias: {
      fechaTerminoCurso: Date;
      Empleados: { idSite: number | null };
    }[],
    reportes: { idSite: number; fechaLimite: Date; estatus: string }[],
    anio: number,
    dia: string,
  ): Promise<
    { idSite: number; site: string; limite: string; referencia: string }[]
  > {
    const porReporte = new Map(
      reportes.map((fila) => [
        fila.idSite,
        {
          limite: diaAlmacenado(fila.fechaLimite),
          presentado: fila.estatus === 'presentado',
        },
      ]),
    );
    const sites = new Set<number>();
    for (const fila of constancias) {
      if (
        fila.Empleados.idSite != null &&
        diaAlmacenado(fila.fechaTerminoCurso).startsWith(`${anio}-`)
      ) {
        sites.add(fila.Empleados.idSite);
      }
    }
    for (const idSite of porReporte.keys()) sites.add(idSite);
    if (sites.size === 0) return [];
    const nombres = new Map(
      (
        await this.prisma.catSites.findMany({
          where: { idEmpresa, idSite: { in: [...sites] } },
          select: { idSite: true, Descripcion: true },
        })
      ).map((site) => [
        site.idSite,
        site.Descripcion?.trim() || `Site ${site.idSite}`,
      ]),
    );
    const salida: {
      idSite: number;
      site: string;
      limite: string;
      referencia: string;
    }[] = [];
    for (const idSite of sites) {
      const reporte = porReporte.get(idSite);
      if (reporte?.presentado) continue;
      const limite = reporte?.limite ?? limiteDc4(cierreEtapa(anio));
      if (!entraEnAviso(dia, limite, AVISO_DC4)) continue;
      salida.push({
        idSite,
        site: nombres.get(idSite) || `Site ${idSite}`,
        limite,
        referencia: `dc4:${idSite}:${anio}`,
      });
    }
    return salida;
  }

  private nombrarSites<T extends { idSite: number | null; site: string }>(
    grupos: T[],
    nombres: Map<number, string>,
  ): T[] {
    return grupos.map((grupo) => ({
      ...grupo,
      site:
        grupo.idSite == null
          ? grupo.site
          : nombres.get(grupo.idSite) || grupo.site,
    }));
  }

  private async notificar(
    personal: { idEmpleado: number; uuid: string }[],
    aviso: {
      idEmpresa: number;
      idTenant: number;
      titulo: string;
      mensaje: string;
      origenId: string;
      clave: string;
    },
  ): Promise<void> {
    for (const persona of personal) {
      await this.avisos.dispatchComms(
        { userUuid: persona.uuid },
        {
          userUuid: persona.uuid,
          titulo: aviso.titulo,
          mensaje: aviso.mensaje,
          categoria: 'RECORDATORIO',
          prioridad: 'NORMAL',
          deepLink: `/companies/${aviso.idEmpresa}/training/compliance`,
          origenTipo: 'RECORDATORIO',
          origenId: aviso.origenId,
          idTenant: aviso.idTenant,
          idEmpresa: aviso.idEmpresa,
          notificationTypeCode: 'RECORDATORIO',
          claveAgrupacion: aviso.clave,
        },
        [{ codigo: 'SOCKETS', enviarAhora: true }],
      );
    }
  }

  private async yaAvisados(
    idEmpresa: number,
    codigo: string,
    referencias: string[],
  ): Promise<Set<string>> {
    if (referencias.length === 0) return new Set();
    const filas = await this.prisma.comRecordatoriosEnviados.findMany({
      where: { idEmpresa, Codigo: codigo, Referencia: { in: referencias } },
      select: { Referencia: true },
    });
    return new Set(filas.map((fila) => fila.Referencia));
  }

  private async registrarAviso(
    idEmpresa: number,
    codigo: string,
    empleados: number[],
    referencias: string[],
  ): Promise<void> {
    const data = referencias.flatMap((referencia) =>
      empleados.map((idEmpleado) => ({
        idEmpresa,
        Codigo: codigo,
        idEmpleado,
        Referencia: referencia,
        Intento: 1,
      })),
    );
    if (data.length === 0) return;
    await this.prisma.comRecordatoriosEnviados.createMany({ data });
  }

  private async personalRh(idEmpresa: number, idTenant: number) {
    const roles = await this.prisma.catRoles.findMany({
      where: { idTenant, activo: true },
      select: { idRol: true },
    });
    const idsRol = roles.map((rol) => rol.idRol);
    if (idsRol.length === 0) return [];
    const permisos = await this.prisma.relRolPermisos.findMany({
      where: {
        idRol: { in: idsRol },
        activo: true,
        puedeVer: true,
        CatModulos: { Codigo: MODULO },
      },
      select: { idRol: true },
    });
    const conPermiso = [...new Set(permisos.map((fila) => fila.idRol))];
    if (conPermiso.length === 0) return [];
    const vinculos = await this.prisma.relUsuarioRol.findMany({
      where: { idRol: { in: conPermiso }, activo: true },
      select: { idUsuario: true },
    });
    const idsUsuario = [...new Set(vinculos.map((fila) => fila.idUsuario))];
    if (idsUsuario.length === 0) return [];
    const usuarios = await this.prisma.auth_user.findMany({
      where: { id: { in: idsUsuario }, is_active: true },
      select: { uuid: true },
    });
    const uuids = usuarios.map((fila) => fila.uuid);
    if (uuids.length === 0) return [];
    const empleados = await this.prisma.empleados.findMany({
      where: { idEmpresa, activo: true, idUsuario: { in: uuids } },
      select: { idEmpleado: true, idUsuario: true },
    });
    return empleados.flatMap((fila) =>
      fila.idUsuario
        ? [{ idEmpleado: fila.idEmpleado, uuid: fila.idUsuario }]
        : [],
    );
  }

  private celdaDe(
    idSite: number,
    idRuta: number,
    reglas: ReglaAlcance[],
    cursos: CursoResuelto[],
    soloObligatorios: boolean,
  ) {
    const aplica = rutaAplicaAlSite(reglas, idSite);
    const delSite = cursos.filter(
      (fila) =>
        fila.idSite === idSite &&
        fila.idRuta === idRuta &&
        (!soloObligatorios || fila.obligatorio),
    );
    return {
      idRuta,
      porcentaje: celda(
        aplica,
        delSite.filter((fila) => fila.cumplido).length,
        delSite.length,
      ),
    };
  }

  private vencimientosDe(
    cursos: CursoCargado[],
    dia: string,
    soloObligatorios: boolean,
  ): VencimientoPersona[] {
    const porClave = new Map<string, CursoCargado[]>();
    for (const fila of cursos) {
      const clave = `${fila.idEmpleado}:${fila.idCurso}`;
      const lista = porClave.get(clave) ?? [];
      lista.push(fila);
      porClave.set(clave, lista);
    }
    const salida: VencimientoPersona[] = [];
    for (const fila of cursos) {
      if (fila.estatusAsignacion === 'por_aprobar') continue;
      if (fila.estado === 'cancelado' || !fila.venceVigencia) continue;
      if (!['completado', 'reconocido', 'vencido'].includes(fila.estado)) {
        continue;
      }
      if (soloObligatorios && !fila.obligatorio) continue;
      const hermanas =
        porClave
          .get(`${fila.idEmpleado}:${fila.idCurso}`)
          ?.filter(
            (otra) => otra.idAsignacionCurso !== fila.idAsignacionCurso,
          ) ?? [];
      const clase = clasificarVencimiento({
        vence: diaAlmacenado(fila.venceVigencia),
        hoy: dia,
        hayPorAprobar: hermanas.some(
          (otra) =>
            otra.estatusAsignacion === 'por_aprobar' &&
            otra.estado !== 'cancelado',
        ),
        hayReasignacion: hermanas.some(
          (otra) =>
            otra.estatusAsignacion !== 'cancelada' &&
            ['inscrito', 'por_programar', 'completado', 'reconocido'].includes(
              otra.estado,
            ),
        ),
      });
      salida.push({
        idCurso: fila.idCurso,
        curso: fila.curso,
        idSite: fila.idSite,
        site: fila.idSite == null ? 'Sin site' : `Site ${fila.idSite}`,
        idEmpleado: fila.idEmpleado,
        vence: diaAlmacenado(fila.venceVigencia),
        estado: clase.estado,
        dias: clase.dias,
      });
    }
    return salida;
  }

  private filaDe(fila: CursoCargado): FilaCumplimiento {
    return {
      idEmpleado: fila.idEmpleado,
      idRuta: fila.idRuta,
      idCurso: fila.idCurso,
      idSite: fila.idSite,
      obligatorio: fila.obligatorio,
      estado: fila.estado,
      fechaLimite: diaAlmacenado(fila.fechaLimite),
      vence: fila.venceVigencia ? diaAlmacenado(fila.venceVigencia) : null,
    };
  }

  private async cursos(companyId: number): Promise<CursoCargado[]> {
    const filas = await this.prisma.rutaAsignacionCurso.findMany({
      where: {
        RutaAsignacion: {
          idEmpresa: companyId,
          estatus: { in: ['activa', 'completada', 'por_aprobar'] },
        },
      },
      select: {
        idAsignacionCurso: true,
        idCurso: true,
        estado: true,
        fechaLimite: true,
        venceVigencia: true,
        RutaElemento: { select: { obligatorio: true } },
        CatCursos: { select: { Descripcion: true } },
        RutaAsignacion: {
          select: {
            idEmpleado: true,
            idRutaAprendizaje: true,
            estatus: true,
            Empleados: { select: { idSite: true } },
          },
        },
      },
    });
    return filas.map((fila) => ({
      idAsignacionCurso: fila.idAsignacionCurso,
      idCurso: fila.idCurso,
      estado: fila.estado,
      fechaLimite: fila.fechaLimite,
      venceVigencia: fila.venceVigencia,
      obligatorio: fila.RutaElemento.obligatorio,
      curso: fila.CatCursos.Descripcion?.trim() || `Curso ${fila.idCurso}`,
      idEmpleado: fila.RutaAsignacion.idEmpleado,
      idRuta: fila.RutaAsignacion.idRutaAprendizaje,
      estatusAsignacion: fila.RutaAsignacion.estatus,
      idSite: fila.RutaAsignacion.Empleados.idSite,
    }));
  }

  private async rutasPublicadas(companyId: number) {
    const rutas = await this.prisma.rutaAprendizaje.findMany({
      where: {
        idEmpresa: companyId,
        activo: true,
        RutaVersiones: { some: { estado: 'publicada' } },
      },
      select: {
        idRutaAprendizaje: true,
        nombre: true,
        proposito: true,
        RutaVersiones: {
          where: { estado: 'publicada' },
          take: 1,
          select: {
            RutaAlcances: {
              select: {
                modo: true,
                idUnidadOperativa: true,
                estado: true,
                idSite: true,
                idPuesto: true,
                idArea: true,
              },
            },
          },
        },
      },
    });
    return rutas.map((ruta) => ({
      idRutaAprendizaje: ruta.idRutaAprendizaje,
      nombre: ruta.nombre,
      proposito: ruta.proposito,
      alcance: ruta.RutaVersiones[0]?.RutaAlcances ?? [],
    }));
  }

  private async personas(companyId: number, idSite?: number) {
    return this.prisma.empleados.findMany({
      where: {
        idEmpresa: companyId,
        activo: true,
        idSite: idSite ?? { not: null },
      },
      select: { idEmpleado: true, idSite: true },
    });
  }

  private contarPersonas(
    personas: { idEmpleado: number; idSite: number | null }[],
  ): Map<number, number> {
    const conteo = new Map<number, number>();
    for (const persona of personas) {
      if (persona.idSite == null) continue;
      conteo.set(persona.idSite, (conteo.get(persona.idSite) ?? 0) + 1);
    }
    return conteo;
  }

  private async sitesDe(companyId: number, ids: number[], idSite?: number) {
    if (!idSite && ids.length === 0) return [];
    return this.prisma.catSites.findMany({
      where: {
        idEmpresa: companyId,
        idSite: idSite ?? { in: ids },
      },
      select: { idSite: true, Descripcion: true },
      orderBy: { Descripcion: 'asc' },
    });
  }

  private async guardarReporte(
    idEmpresa: number,
    idTenant: number | null,
    idSite: number,
    anio: number,
    cierre: string,
    limite: string,
    idExistente: number | null,
  ) {
    if (idExistente) {
      return this.prisma.reporteDc4.update({
        where: { idReporteDc4: idExistente },
        data: {
          fechaCierreEtapa: diaPrisma(cierre),
          fechaLimite: diaPrisma(limite),
        },
      });
    }
    try {
      return await this.prisma.reporteDc4.create({
        data: {
          idTenant,
          idEmpresa,
          idSite,
          anio,
          fechaCierreEtapa: diaPrisma(cierre),
          fechaLimite: diaPrisma(limite),
          estatus: 'borrador',
        },
      });
    } catch (error) {
      if (!esPrisma(error, 'P2002')) throw error;
      const previa = await this.prisma.reporteDc4.findFirst({
        where: { idEmpresa, idSite, anio },
      });
      if (!previa) throw error;
      return previa;
    }
  }

  private async registrosPorSite(
    companyId: number,
    idsSite: (number | null)[],
  ): Promise<Map<number, string | null>> {
    const ids = [...new Set(idsSite.filter((id): id is number => id != null))];
    const [sites, registros] = await Promise.all([
      ids.length
        ? this.prisma.catSites.findMany({
            where: { idSite: { in: ids } },
            select: { idSite: true, idRegistroPatronal: true },
          })
        : [],
      this.prisma.catRegistrosPatronales.findMany({
        where: { idEmpresa: companyId, Activo: true },
        select: { idRegistroPatronal: true, RegistroPatronal: true },
      }),
    ]);
    const texto = new Map(
      registros.map((fila) => [fila.idRegistroPatronal, fila.RegistroPatronal]),
    );
    const respaldo = registros[0]?.RegistroPatronal ?? null;
    const mapa = new Map<number, string | null>();
    for (const site of sites) {
      mapa.set(
        site.idSite,
        (site.idRegistroPatronal != null
          ? texto.get(site.idRegistroPatronal)
          : null) ?? respaldo,
      );
    }
    return mapa;
  }

  private async registroDeSite(
    companyId: number,
    idSite: number,
  ): Promise<string | null> {
    const mapa = await this.registrosPorSite(companyId, [idSite]);
    return mapa.get(idSite) ?? null;
  }

  private async empresaDe(companyId: number) {
    const empresa = await this.prisma.catEmpresas.findFirst({
      where: { idEmpresa: companyId },
      select: {
        idEmpresa: true,
        idTenant: true,
        razon_social: true,
        rfc: true,
      },
    });
    if (!empresa) throw new NotFoundException('La empresa no existe.');
    return empresa;
  }

  private async exigirSite(companyId: number, idSite: number) {
    const site = await this.prisma.catSites.findFirst({
      where: { idSite, idEmpresa: companyId },
      select: { idSite: true, Descripcion: true },
    });
    if (!site) {
      throw new NotFoundException('El site no existe en esta empresa.');
    }
    return site;
  }

  private async exigirConstancia(companyId: number, id: number) {
    const fila = await this.prisma.cursoConstanciaDc3.findFirst({
      where: { idConstancia: id, idEmpresa: companyId },
    });
    if (!fila) {
      throw new NotFoundException('La constancia no existe en esta empresa.');
    }
    return fila;
  }

  private vistaConstancia(fila: {
    idConstancia: number;
    idEmpleado: number;
    idCurso: number;
    estatus: string;
    fechaTerminoCurso: Date;
    fechaLimiteEntrega: Date;
    fechaGenerada: Date | null;
    fechaEntregada: Date | null;
    archivo: string | null;
  }) {
    return {
      idConstancia: fila.idConstancia,
      idEmpleado: fila.idEmpleado,
      idCurso: fila.idCurso,
      estatus: fila.estatus,
      fechaTerminoCurso: diaAlmacenado(fila.fechaTerminoCurso),
      fechaLimiteEntrega: diaAlmacenado(fila.fechaLimiteEntrega),
      fechaGenerada: fila.fechaGenerada,
      fechaEntregada: fila.fechaEntregada,
      archivo: fila.archivo,
    };
  }

  private vistaReporte(fila: {
    idReporteDc4: number;
    idSite: number;
    anio: number;
    estatus: string;
    fechaCierreEtapa: Date;
    fechaLimite: Date;
    archivo: string | null;
    fechaPresentado: Date | null;
  }) {
    return {
      idReporteDc4: fila.idReporteDc4,
      idSite: fila.idSite,
      anio: fila.anio,
      estatus: fila.estatus,
      fechaCierreEtapa: diaAlmacenado(fila.fechaCierreEtapa),
      fechaLimite: diaAlmacenado(fila.fechaLimite),
      archivo: fila.archivo,
      fechaPresentado: fila.fechaPresentado,
    };
  }

  private async zonaDe(companyId: number): Promise<string> {
    const principal = await this.prisma.catSites.findFirst({
      where: { idEmpresa: companyId, EsPrincipal: true },
      select: { zonaHoraria: true },
    });
    if (principal?.zonaHoraria) return zonaValida(principal.zonaHoraria);
    const sitio = await this.prisma.catSites.findFirst({
      where: { idEmpresa: companyId },
      select: { zonaHoraria: true },
    });
    return zonaValida(sitio?.zonaHoraria || ZONA);
  }

  private async bitacora(
    user: ActiveUserDto,
    companyId: number,
    tabla: string,
    id: number,
    accion: string,
    verbo: string,
  ) {
    await this.prisma.historicoMovimientos.create({
      data: {
        idUsuario: user.id,
        idEmpresa: companyId,
        accion,
        tablaOrigen: tabla,
        idRegistro: String(id),
        descripcion: `${user.first_name} ${user.last_name} ${verbo}`,
        fechaCreacion: new Date(),
      },
    });
  }
}

const COLUMNAS_DC4 = [
  { header: 'Establecimiento', key: 'establecimiento', width: 28 },
  { header: 'Año', key: 'anio', width: 10 },
  { header: 'Razón social', key: 'razonSocial', width: 32 },
  { header: 'RFC', key: 'rfc', width: 16 },
  { header: 'Registro patronal', key: 'registroPatronal', width: 18 },
  { header: 'Trabajador', key: 'trabajador', width: 32 },
  { header: 'CURP', key: 'curp', width: 20 },
  { header: 'Puesto', key: 'puesto', width: 24 },
  { header: 'Curso', key: 'curso', width: 36 },
  { header: 'Duración (horas)', key: 'horas', width: 16 },
  { header: 'Término del curso', key: 'termino', width: 18 },
  { header: 'Área temática', key: 'areaTematica', width: 16 },
  { header: 'Agente capacitador', key: 'agente', width: 28 },
  { header: 'Folio DC-3', key: 'folio', width: 14 },
  { header: 'Estatus DC-3', key: 'estatus', width: 14 },
];

function nombreEmpleado(persona: {
  nombre: string | null;
  primerApellido: string | null;
  segundoApellido: string | null;
}): string {
  return [persona.nombre, persona.primerApellido, persona.segundoApellido]
    .filter((parte) => parte && parte.trim())
    .join(' ');
}

function slug(texto: string): string {
  const limpio = texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return (limpio || 'site').slice(0, 40);
}

function esPrisma(error: unknown, codigo: string): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === codigo
  );
}
