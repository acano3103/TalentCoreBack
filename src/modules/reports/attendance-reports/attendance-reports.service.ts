import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { ActiveUserDto } from 'src/modules/auth/dto/active-user.dto';
import { DailyAttendanceReportFilterDto } from './dto/daily-attendance-report.dto';
import { ExcelColumn, ExcelExportService } from 'src/common/services/excel-export.service';
import { Prisma } from 'generated/prisma/client';
import { AttendanceTrackingConfigService } from 'src/modules/config/attendance-config/attendance-config.service';
import { EvaluacionEntrada, FilaReporteFaltas, FilaReporteHorasSemanales, ToleranciaConfig } from './interfaces/attendance-report.interface';
import { LegalWorkdayService } from 'src/modules/legal-workday/legal-workday.service';

@Injectable()
export class AttendanceReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly excelExportService: ExcelExportService,
    private readonly attendanceConfigService: AttendanceTrackingConfigService,
    private readonly legalWorkdayService: LegalWorkdayService,
  ) { }

  // Filtra empleados por Empresa, Ubicación (idSite), Área (vía puestos)
  // y búsqueda libre por número de nómina o nombre completo.
  async getFilteredEmployees(
    companyId: number,
    filters: Pick<DailyAttendanceReportFilterDto, 'search' | 'idSite' | 'idArea'>,
  ) {
    const { search, idSite, idArea } = filters;

    let targetPuestoIds: number[] | undefined = undefined;
    if (idArea) {
      const puestosInArea = await this.prisma.catPuestos.findMany({
        where: {
          idEmpresa: companyId,
          idArea: Number(idArea),
          Activo: true,
        },
        select: { idPuesto: true },
      });
      targetPuestoIds = puestosInArea.map((p) => p.idPuesto);

      if (targetPuestoIds.length === 0) {
        return [];
      }
    }

    const where: Prisma.EmpleadosWhereInput = {
      idEmpresa: companyId,
      activo: true,
    };

    if (idSite) {
      where.idSite = Number(idSite);
    }

    if (targetPuestoIds) {
      where.idPuesto = { in: targetPuestoIds };
    }

    if (search && search.trim() !== '') {
      const term = search.trim();
      where.OR = [
        { numeroEmpleado: { contains: term } },
        { nombre: { contains: term } },
        { primerApellido: { contains: term } },
        { segundoApellido: { contains: term } },
      ];
    }

    const [employees, sitesCatalog, puestosCatalog, areasCatalog] = await Promise.all([
      this.prisma.empleados.findMany({
        where,
        select: {
          idEmpleado: true,
          numeroEmpleado: true,
          nombre: true,
          primerApellido: true,
          segundoApellido: true,
          idSite: true,
          idPuesto: true,
          idJefeInmediato: true,
          idModalidad: true,
        },
      }),
      this.prisma.catSites.findMany({
        where: { idEmpresa: companyId },
        select: { idSite: true, Descripcion: true, TipoAsistencia: true },
      }),
      this.prisma.catPuestos.findMany({
        where: { idEmpresa: companyId },
        select: { idPuesto: true, NombrePuesto: true, idArea: true },
      }),
      this.prisma.catAreas.findMany({
        where: { idEmpresa: companyId },
        select: { idArea: true, Descripcion: true },
      }),
    ]);

    // Mapeos en memoria O(1)
    const sitesMap = new Map<number, { descripcion: string; tipoAsistencia: string | null }>(
      sitesCatalog.map((s) => [
        s.idSite,
        { descripcion: s.Descripcion || 'SIN UBICACIÓN', tipoAsistencia: s.TipoAsistencia },
      ]),
    );

    const areasMap = new Map<number, string>(
      areasCatalog.map((a) => [a.idArea, a.Descripcion || 'SIN ÁREA']),
    );

    const puestosMap = new Map<number, { nombre: string; idArea: number | null }>(
      puestosCatalog.map((p) => [
        p.idPuesto,
        { nombre: p.NombrePuesto, idArea: p.idArea },
      ]),
    );

    // Mapeo de Jefes Inmediatos (empleados que tienen jefe asignado)
    const bossIds = Array.from(
      new Set(employees.map((e) => e.idJefeInmediato).filter((id): id is number => !!id)),
    );

    const bossesCatalog =
      bossIds.length > 0
        ? await this.prisma.empleados.findMany({
          where: { idEmpleado: { in: bossIds } },
          select: { idEmpleado: true, nombre: true, primerApellido: true, segundoApellido: true },
        })
        : [];

    const bossesMap = new Map<number, string>(
      bossesCatalog.map((b) => [
        b.idEmpleado,
        `${b.nombre || ''} ${b.primerApellido || ''} ${b.segundoApellido || ''}`.trim(),
      ]),
    );

    // Modalidad label map
    const modalidadMap: Record<number, string> = {
      1: 'Presencial',
      2: 'Remoto',
      3: 'Híbrido',
    };

    return employees.map((emp) => {
      const puestoInfo = emp.idPuesto ? puestosMap.get(emp.idPuesto) : null;
      const siteInfo = emp.idSite ? sitesMap.get(emp.idSite) : null;
      const areaDesc = puestoInfo?.idArea ? areasMap.get(puestoInfo.idArea) || 'SIN ÁREA' : 'SIN ÁREA';
      const fullName = `${emp.nombre || ''} ${emp.primerApellido || ''} ${emp.segundoApellido || ''}`.trim();

      return {
        ...emp,
        nombreCompleto: fullName,
        idArea: puestoInfo?.idArea ?? null,
        areaDescripcion: areaDesc,
        nombrePuesto: puestoInfo?.nombre || 'SIN PUESTO',
        jefeInmediatoNombre: emp.idJefeInmediato ? bossesMap.get(emp.idJefeInmediato) || '—' : '—',
        ubicacionDescripcion: siteInfo?.descripcion || 'SIN UBICACIÓN',
        canalPrincipal: siteInfo?.tipoAsistencia || 'CUALQUIERA',
        modalidadDescripcion: emp.idModalidad ? modalidadMap[emp.idModalidad] || 'Presencial' : 'Presencial',
      };
    });
  }

  // Genera el Excel de Asistencia Diaria utilizando ExcelExportService
  async exportDailyAttendanceExcel(
    user: ActiveUserDto,
    companyId: number,
    filters: DailyAttendanceReportFilterDto,
  ): Promise<Buffer> {
    // 1. Obtener empleados que cumplen con los filtros base
    const employees = await this.getFilteredEmployees(companyId, filters);

    // Obtenemos la configuración de asistencia de la empresa
    const config = await this.attendanceConfigService.getConfiguracionAsistencia(user.idTenant, companyId);

    if (employees.length === 0) {
      // Retorna el buffer vacío con encabezados directamente
      return this.generateAttendanceWorkbook([], new Map(), config);
    }

    const employeeIds = employees.map((e) => e.idEmpleado);
    const empMap = new Map(employees.map((e) => [e.idEmpleado, e]));

    // 2. Filtro de fechas sobre la tabla JornadasEmpleado
    const esFecha = (f?: string) => !!f && /^\d{4}-\d{2}-\d{2}$/.test(f);
    const jornadaWhere: Prisma.JornadasEmpleadoWhereInput = {
      idEmpresa: companyId,
      idEmpleado: { in: employeeIds },
    };

    if (esFecha(filters.dateFrom) || esFecha(filters.dateTo)) {
      jornadaWhere.fecha = {
        ...(esFecha(filters.dateFrom) && { gte: new Date(`${filters.dateFrom}T00:00:00.000Z`) }),
        ...(esFecha(filters.dateTo) && { lte: new Date(`${filters.dateTo}T23:59:59.999Z`) }),
      };
    }

    // 3. Consultar jornadas ordenadas cronológicamente
    const jornadas = await this.prisma.jornadasEmpleado.findMany({
      where: jornadaWhere,
      orderBy: [{ fecha: 'asc' }, { idEmpleado: 'asc' }],
    });

    // Retorna directamente el Buffer que genera ExcelExportService pasando la config
    return this.generateAttendanceWorkbook(jornadas, empMap, config);
  }

  // Mapeo de columnas y generación mediante ExcelExportService
  private async generateAttendanceWorkbook(
    jornadas: any[],
    empMap: Map<number, any>,
    config?: any,
  ): Promise<Buffer> {
    type Row = (typeof jornadas)[number];
    const emp = (j: Row) => empMap.get(j.idEmpleado);

    // Pre-evaluar retardo/puntualidad por jornada usando la configuración dinámica
    const evalMap = new Map<number, EvaluacionEntrada>();
    for (const j of jornadas) {
      evalMap.set(
        j.idJornada,
        calcularRetardoEntrada(j.horaEntradaTeorica, j.horaEntradaReal, config),
      );
    }

    const columns: ExcelColumn<Row>[] = [
      col('fecha', 14, (j) => toDateStr(j.fecha)),
      col('diaSemana', 14, (j) => toDiaSemana(j.fecha)),
      col('idEmpleado', 14, (j) => j.idEmpleado),
      col('numeroEmpleado', 18, (j) => emp(j)?.numeroEmpleado || '—'),
      col('nombreEmpleado', 32, (j) => emp(j)?.nombreCompleto || '—'),
      col('idArea', 10, (j) => emp(j)?.idArea ?? ''),
      col('area', 22, (j) => emp(j)?.areaDescripcion || 'SIN ÁREA'),
      col('idPuesto', 12, (j) => emp(j)?.idPuesto ?? ''),
      col('puesto', 26, (j) => emp(j)?.nombrePuesto || 'SIN PUESTO'),
      col('idJefeInmediato', 16, (j) => emp(j)?.idJefeInmediato ?? ''),
      col('jefeInmediato', 30, (j) => emp(j)?.jefeInmediatoNombre || '—'),
      col('idSite', 10, (j) => emp(j)?.idSite ?? ''),
      col('ubicacion', 24, (j) => emp(j)?.ubicacionDescripcion || 'SIN UBICACIÓN'),
      col('modalidad', 16, (j) => emp(j)?.modalidadDescripcion || 'Presencial'),
      col('canalPrincipal', 18, (j) => emp(j)?.canalPrincipal || 'CUALQUIERA'),
      col('horaEntradaTeorica', 18, (j) => toTimeTeoricoStr(j.horaEntradaTeorica)),
      col('horaSalidaTeorica', 18, (j) => toTimeTeoricoStr(j.horaSalidaTeorica)),
      col('horaEntradaReal', 18, (j) => toTimeRealStr(j.horaEntradaReal)),
      col('horaSalidaReal', 18, (j) => toTimeRealStr(j.horaSalidaReal)),
      col('minutosTrabajados', 18, (j) => j.minutosTrabajados ?? 0),
      col('horasTrabajadas', 16, (j) => toHorasStr(j.minutosTrabajados)),
      col('minutosRetardo', 16, (j) => evalMap.get(j.idJornada)?.minutosRetardo ?? j.minutosRetardo ?? 0),
      col('estatusEntrada', 18, (j) => evalMap.get(j.idJornada)?.estado || 'SIN_CHECK'),
      col('minutosExtraDobles', 18, (j) => j.minutosExtraDobles ?? 0),
      col('minutosExtraTriples', 18, (j) => j.minutosExtraTriples ?? 0),
      col('estatusJornada', 16, (j) => j.estatusJornada || 'ABIERTA'),
      col('revisada', 12, (j) => (j.revisada ? 1 : 0)),
      col('idJornada', 14, (j) => j.idJornada),
    ];

    return this.excelExportService.generate({
      sheetName: 'Asistencia Diaria',
      columns,
      rows: jornadas,
    });
  }

  // Genera el Excel de Reporte de Retardos utilizando ExcelExportService
  async exportLatenessExcel(
    user: ActiveUserDto,
    companyId: number,
    filters: DailyAttendanceReportFilterDto,
  ): Promise<Buffer> {
    // 1. Obtener empleados que cumplen con los filtros base
    const employees = await this.getFilteredEmployees(companyId, filters);

    const config = await this.attendanceConfigService.getConfiguracionAsistencia(
      user.idTenant,
      companyId,
    );

    if (employees.length === 0) {
      return this.generateLatenessWorkbook([], new Map(), config);
    }

    const employeeIds = employees.map((e) => e.idEmpleado);
    const empMap = new Map(employees.map((e) => [e.idEmpleado, e]));

    // 2. Filtro de fechas sobre la tabla JornadasEmpleado
    const esFecha = (f?: string) => !!f && /^\d{4}-\d{2}-\d{2}$/.test(f);
    const jornadaWhere: Prisma.JornadasEmpleadoWhereInput = {
      idEmpresa: companyId,
      idEmpleado: { in: employeeIds },
      // Solo jornadas que tengan registro de entrada
      horaEntradaReal: { not: null },
    };

    if (esFecha(filters.dateFrom) || esFecha(filters.dateTo)) {
      jornadaWhere.fecha = {
        ...(esFecha(filters.dateFrom) && { gte: new Date(`${filters.dateFrom}T00:00:00.000Z`) }),
        ...(esFecha(filters.dateTo) && { lte: new Date(`${filters.dateTo}T23:59:59.999Z`) }),
      };
    }

    // 3. Consultar jornadas ordenadas cronológicamente
    const jornadas = await this.prisma.jornadasEmpleado.findMany({
      where: jornadaWhere,
      orderBy: [{ fecha: 'asc' }, { idEmpleado: 'asc' }],
    });

    // Retornamos el libro filtrando solo los retardos reales
    return this.generateLatenessWorkbook(jornadas, empMap, config);
  }

  // Generador del Libro de Retardos
  private async generateLatenessWorkbook(
    jornadas: any[],
    empMap: Map<number, any>,
    config?: any,
  ): Promise<Buffer> {
    const tolerancia = config?.tolerancia?.minutosToleranciaEntrada ?? 0;

    // Calculamos la evaluación y filtramos solo aquellas jornadas que sean RETARDO o FALTA_RETARDO
    const retardosValidos: Array<{
      jornada: any;
      evaluacion: EvaluacionEntrada;
      clasificacion: 'LEVE' | 'MODERADO' | 'GRAVE';
    }> = [];

    for (const j of jornadas) {
      const evaluacion = calcularRetardoEntrada(
        j.horaEntradaTeorica,
        j.horaEntradaReal,
        config,
      );

      // Solo se incluyen si califican como retardo
      if (evaluacion.esRetardo || evaluacion.esFaltaPorRetardo) {
        let clasificacion: 'LEVE' | 'MODERADO' | 'GRAVE' = 'LEVE';
        if (evaluacion.minutosRetardo > 30) {
          clasificacion = 'GRAVE';
        } else if (evaluacion.minutosRetardo > 15) {
          clasificacion = 'MODERADO';
        }

        retardosValidos.push({
          jornada: j,
          evaluacion,
          clasificacion,
        });
      }
    }

    type Row = (typeof retardosValidos)[number];
    const emp = (r: Row) => empMap.get(r.jornada.idEmpleado);

    const columns: ExcelColumn<Row>[] = [
      col('fecha', 14, (r) => toDateStr(r.jornada.fecha)),
      col('diaSemana', 14, (r) => toDiaSemana(r.jornada.fecha)),
      col('numeroEmpleado', 18, (r) => emp(r)?.numeroEmpleado || '—'),
      col('nombreEmpleado', 32, (r) => emp(r)?.nombreCompleto || '—'),
      col('area', 22, (r) => emp(r)?.areaDescripcion || 'SIN ÁREA'),
      col('puesto', 26, (r) => emp(r)?.nombrePuesto || 'SIN PUESTO'),
      col('jefeInmediato', 30, (r) => emp(r)?.jefeInmediatoNombre || '—'),
      col('ubicacion', 24, (r) => emp(r)?.ubicacionDescripcion || 'SIN UBICACIÓN'),
      col('horaEntradaTeorica', 18, (r) => toTimeTeoricoStr(r.jornada.horaEntradaTeorica)),
      col('horaEntradaReal', 18, (r) => toTimeRealStr(r.jornada.horaEntradaReal)),
      col('minutosTolerancia', 18, () => tolerancia),
      col('minutosRetardo', 16, (r) => r.evaluacion.minutosRetardo),
      col('clasificacion', 16, (r) => r.clasificacion),
      col('canal', 18, (r) => r.jornada.origenChecadaEntrada || emp(r)?.canalPrincipal || 'CUALQUIERA'),
      col('estatusJornada', 16, (r) => r.jornada.estatusJornada || 'CERRADA'),
      col('idJornada', 14, (r) => r.jornada.idJornada),
    ];

    return this.excelExportService.generate({
      sheetName: 'Retardos',
      columns,
      rows: retardosValidos,
    });
  }

  /**
   * Genera el archivo Excel de faltas e inasistencias
   */
  async exportAbsencesExcel(
    user: ActiveUserDto,
    companyId: number,
    filters: DailyAttendanceReportFilterDto,
  ): Promise<Buffer> {
    // 1. Obtener empleados que cumplan con los filtros de búsqueda
    const employees = await this.getFilteredEmployees(companyId, filters);
    if (!employees || employees.length === 0) {
      return this.generateAbsencesWorkbook([]);
    }

    const employeeIds = employees.map((e) => e.idEmpleado);
    const empMap = new Map(employees.map((e) => [e.idEmpleado, e]));

    // 2. Resolver filtros de fecha
    const rawFrom = (filters as any)?.dateFrom || (filters as any)?.fechaInicio;
    const rawTo = (filters as any)?.dateTo || (filters as any)?.fechaFin;
    const esFechaValida = (f?: string) => !!f && /^\d{4}-\d{2}-\d{2}$/.test(f);

    const jornadaWhere: Prisma.JornadasEmpleadoWhereInput = {
      idEmpresa: companyId,
      idEmpleado: { in: employeeIds },
      // Consideramos FALTA e INCOMPLETA (omisión de salida)
      estatusJornada: { in: ['FALTA', 'INCOMPLETA'] },
    };

    if (esFechaValida(rawFrom) || esFechaValida(rawTo)) {
      jornadaWhere.fecha = {
        ...(esFechaValida(rawFrom) && { gte: new Date(`${rawFrom}T00:00:00.000Z`) }),
        ...(esFechaValida(rawTo) && { lte: new Date(`${rawTo}T23:59:59.999Z`) }),
      };
    }

    // 3. Consultar jornadas catalogadas como falta o incompletas
    const jornadasFalta = await this.prisma.jornadasEmpleado.findMany({
      where: jornadaWhere,
      orderBy: [{ fecha: 'asc' }, { idEmpleado: 'asc' }],
    });

    // 4. Mapear filas para el reporte
    const filas: FilaReporteFaltas[] = jornadasFalta.map((j) => {
      const emp = empMap.get(j.idEmpleado);

      // Clasificación del tipo de falta
      let tipoFalta = 'FALTA_SIN_REGISTRO';
      if (j.estatusJornada === 'INCOMPLETA') {
        tipoFalta = 'OMISION_DE_SALIDA';
      }

      return {
        fecha: toDateStr(j.fecha),
        diaSemana: toDiaSemana(j.fecha),
        numeroEmpleado: emp?.numeroEmpleado || '—',
        nombreEmpleado: emp?.nombreCompleto || `${emp?.nombre || ''} ${emp?.primerApellido || ''}`.trim() || '—',
        area: emp?.areaDescripcion || 'SIN ÁREA',
        puesto: emp?.nombrePuesto || 'SIN PUESTO',
        jefeInmediato: emp?.jefeInmediatoNombre || '—',
        ubicacion: emp?.ubicacionDescripcion || 'SIN UBICACIÓN',
        estatusJornada: j.estatusJornada,
        tipoFalta,
        horaEntradaReal: j.horaEntradaReal ? toTimeRealStr(j.horaEntradaReal) : '',
        minutosTrabajados: j.minutosTrabajados ?? 0,
        // Espacios reservados para el futuro módulo de incidencias
        justificada: '',
        idTipoIncidencia: '',
        tipoIncidencia: '',
        folioIncidencia: '',
        revisada: j.revisada ? 1 : 0,
        idJornada: j.idJornada,
      };
    });

    return this.generateAbsencesWorkbook(filas);
  }

  /**
   * Genera el libro Excel con el layout requerido
   */
  private async generateAbsencesWorkbook(rows: FilaReporteFaltas[]): Promise<Buffer> {
    const columns: ExcelColumn<FilaReporteFaltas>[] = [
      col('fecha', 14, (r) => r.fecha),
      col('diaSemana', 14, (r) => r.diaSemana),
      col('numeroEmpleado', 18, (r) => r.numeroEmpleado),
      col('nombreEmpleado', 32, (r) => r.nombreEmpleado),
      col('area', 18, (r) => r.area),
      col('puesto', 24, (r) => r.puesto),
      col('jefeInmediato', 26, (r) => r.jefeInmediato),
      col('ubicacion', 28, (r) => r.ubicacion),
      col('estatusJornada', 16, (r) => r.estatusJornada),
      col('tipoFalta', 24, (r) => r.tipoFalta),
      col('horaEntradaReal', 18, (r) => r.horaEntradaReal),
      col('minutosTrabajados', 18, (r) => r.minutosTrabajados),
      col('justificada', 14, (r) => r.justificada),
      col('idTipoIncidencia', 18, (r) => r.idTipoIncidencia),
      col('tipoIncidencia', 20, (r) => r.tipoIncidencia),
      col('folioIncidencia', 18, (r) => r.folioIncidencia),
      col('revisada', 12, (r) => r.revisada),
      col('idJornada', 14, (r) => r.idJornada),
    ];

    return this.excelExportService.generate({
      sheetName: 'Faltas',
      columns,
      rows,
    });
  }

  // Genera el Excel de Reporte de Horas Trabajadas utilizando ExcelExportService
  async exportWorkHoursExcel(
    user: ActiveUserDto,
    companyId: number,
    filters: any,
  ): Promise<Buffer> {
    // 1. Resolver el rango semanal (Lunes a Domingo)
    // Se contemplan ambos nombres posibles del DTO (dateFrom/dateTo o fechaInicio/fechaFin)
    const rawFrom = filters?.dateFrom || filters?.fechaInicio;
    const rawTo = filters?.dateTo || filters?.fechaFin;

    const esFechaValida = (f?: string) => !!f && /^\d{4}-\d{2}-\d{2}$/.test(f);

    let fechaInicioDate: Date;
    let fechaFinDate: Date;

    if (esFechaValida(rawFrom) && esFechaValida(rawTo)) {
      fechaInicioDate = new Date(`${rawFrom}T00:00:00.000Z`);
      fechaFinDate = new Date(`${rawTo}T23:59:59.999Z`);
    } else {
      // Si no vienen fechas en el filtro, delimitamos a la semana en curso (Lunes a Domingo)
      const ahora = new Date();
      const diaSemana = ahora.getDay(); // 0: Dom, 1: Lun, ...
      const diffLunes = ahora.getDate() - diaSemana + (diaSemana === 0 ? -6 : 1);

      fechaInicioDate = new Date(ahora.getFullYear(), ahora.getMonth(), diffLunes, 0, 0, 0);
      fechaFinDate = new Date(ahora.getFullYear(), ahora.getMonth(), diffLunes + 6, 23, 59, 59, 999);
    }

    const semanaISO = getISOWeekStr(fechaInicioDate);
    const fechaInicioStr = toDateStr(fechaInicioDate);
    const fechaFinStr = toDateStr(fechaFinDate);
    const targetYear = fechaInicioDate.getFullYear();

    // 2. Obtener empleados activos según filtros
    const employees = await this.getFilteredEmployees(companyId, filters);
    if (!employees || employees.length === 0) {
      return this.generateWorkHoursWorkbook([], `Horas_${semanaISO}`);
    }

    const employeeIds = employees.map((e) => e.idEmpleado);

    // 3. Obtener configuraciones dinámicas (Asistencia y Legal)
    const configAsistencia = await this.attendanceConfigService.getConfiguracionAsistencia(
      user.idTenant,
      companyId,
    );
    const legalWorkdayStatus = await this.legalWorkdayService.getStatus(user, companyId);

    // Resolver configuración legal del año (o fallback a default)
    const legalConfig =
      legalWorkdayStatus.config?.find((c: any) => c.anio === targetYear) ??
      legalWorkdayStatus.config?.[0] ?? {
        horasSemana: 48,
        extraSemanalMax: 9,
        factorDentro: 2,
        factorFuera: 3,
        anio: targetYear,
      };

    const limiteLegalHoras = Number(legalConfig.horasSemana) || 48;
    const limiteLegalMinutos = limiteLegalHoras * 60;
    const topeExtraHoras = Number(legalConfig.extraSemanalMax) || 9;
    const topeExtraMinutos = topeExtraHoras * 60;
    const factorPagoDentro = Number(legalConfig.factorDentro) || 2;
    const factorPagoSobre = Number(legalConfig.factorFuera) || 3;

    const acumRetardosParaFalta =
      configAsistencia?.tolerancia?.acumulacionRetardosParaFalta ?? 3;

    // 4. Consultar Jornadas estrictamente dentro del rango de la semana
    const jornadas = await this.prisma.jornadasEmpleado.findMany({
      where: {
        idEmpresa: companyId,
        idEmpleado: { in: employeeIds },
        fecha: {
          gte: fechaInicioDate,
          lte: fechaFinDate,
        },
      },
      orderBy: [{ fecha: 'asc' }, { idEmpleado: 'asc' }],
    });

    // Agrupar jornadas por idEmpleado
    const jornadasPorEmpleado = new Map<number, typeof jornadas>();
    for (const j of jornadas) {
      if (!jornadasPorEmpleado.has(j.idEmpleado)) {
        jornadasPorEmpleado.set(j.idEmpleado, []);
      }
      jornadasPorEmpleado.get(j.idEmpleado)!.push(j);
    }

    // 5. Construir registros consolidados por empleado
    const filas: FilaReporteHorasSemanales[] = [];

    for (const emp of employees) {
      const empJornadas = jornadasPorEmpleado.get(emp.idEmpleado) || [];

      let totalMinutosTrabajados = 0;
      let totalMinutosRetardo = 0;
      let faltasDirectas = 0;
      let conteoRetardos = 0;
      let minutosExtraDoblesBD = 0;
      let minutosExtraTriplesBD = 0;

      // Usar Set para asegurar conteo de fechas únicas laboradas y descansadas
      const fechasLaborablesSet = new Set<string>();
      const fechasDescansoSet = new Set<string>();

      for (const j of empJornadas) {
        const fechaKey = toDateStr(j.fecha);

        if (j.estatusJornada === 'DESCANSO') {
          fechasDescansoSet.add(fechaKey);
          continue;
        }

        fechasLaborablesSet.add(fechaKey);

        // Evaluar retardo usando la configuración dinámica
        const evalEntrada = calcularRetardoEntrada(
          j.horaEntradaTeorica,
          j.horaEntradaReal,
          configAsistencia,
        );

        if (j.estatusJornada === 'FALTA' || evalEntrada.esFaltaPorRetardo) {
          faltasDirectas++;
        }

        if (evalEntrada.esRetardo) {
          conteoRetardos++;
          totalMinutosRetardo += evalEntrada.minutosRetardo;
        }

        // Si la jornada fue un rebote inválido (ej. checó y salió en menos de 5 min)
        const duracionMinutos = j.minutosTrabajados ?? 0;
        if (duracionMinutos > 5) {
          totalMinutosTrabajados += duracionMinutos;
        }

        minutosExtraDoblesBD += j.minutosExtraDobles ?? 0;
        minutosExtraTriplesBD += j.minutosExtraTriples ?? 0;
      }

      // Cálculo de faltas acumuladas por retardo
      const faltasPorRetardo = Math.floor(conteoRetardos / acumRetardosParaFalta);
      const faltasTotales = faltasDirectas + faltasPorRetardo;

      const diasLaborables = fechasLaborablesSet.size;
      // Días de descanso: si están registrados explícitamente se toman,
      // de lo contrario se calculan restando los laborados a la semana estándar de 7 días
      const diasDescanso = fechasDescansoSet.size > 0
        ? fechasDescansoSet.size
        : Math.max(0, 7 - diasLaborables);

      // 6. CÁLCULO DE HORAS ORDINARIAS Y EXTRAS (LFT)
      let minutosOrdinarios = 0;
      let minutosExtra = 0;
      let minutosExtraDobles = 0;
      let minutosExtraTriples = 0;

      const tieneExtrasEnBD = (minutosExtraDoblesBD + minutosExtraTriplesBD) > 0;

      if (tieneExtrasEnBD) {
        // Si el proceso de jornadas ya calculó horas extras diariamente
        minutosExtraDobles = minutosExtraDoblesBD;
        minutosExtraTriples = minutosExtraTriplesBD;
        minutosExtra = minutosExtraDobles + minutosExtraTriples;
        minutosOrdinarios = Math.max(0, totalMinutosTrabajados - minutosExtra);
      } else {
        // Si no vienen calculadas en BD, se calcula por corte semanal:
        if (totalMinutosTrabajados > limiteLegalMinutos) {
          minutosOrdinarios = limiteLegalMinutos;
          const excedenteSemanal = totalMinutosTrabajados - limiteLegalMinutos;
          minutosExtra = excedenteSemanal;

          // Hasta topeExtraMinutos (9 hrs) son Dobles
          minutosExtraDobles = Math.min(excedenteSemanal, topeExtraMinutos);
          // Lo que exceda de las 9 hrs son Triples
          minutosExtraTriples = Math.max(0, excedenteSemanal - topeExtraMinutos);
        } else {
          minutosOrdinarios = totalMinutosTrabajados;
          minutosExtra = 0;
        }
      }

      // Porcentaje de cumplimiento semanal frente a la jornada legal
      const pctSobreLimite = limiteLegalMinutos > 0
        ? Number(((totalMinutosTrabajados / limiteLegalMinutos) * 100).toFixed(1))
        : 0;

      filas.push({
        semanaISO,
        fechaInicio: fechaInicioStr,
        fechaFin: fechaFinStr,
        numeroEmpleado: emp.numeroEmpleado || '—',
        nombreEmpleado: emp.nombreCompleto || `${emp.nombre || ''} ${emp.primerApellido || ''}`.trim(),
        area: emp.areaDescripcion || 'OPERACIONES',
        puesto: emp.nombrePuesto || 'SIN PUESTO',
        jefeInmediato: emp.jefeInmediatoNombre || '—',
        ubicacion: emp.ubicacionDescripcion || 'SIN UBICACIÓN',
        diasLaborables,
        diasDescanso,
        faltas: faltasTotales,
        minutosTrabajados: totalMinutosTrabajados,
        horasTrabajadas: toHorasStr(totalMinutosTrabajados),
        minutosOrdinarios,
        horasOrdinarias: toHorasStr(minutosOrdinarios),
        minutosExtra,
        horasExtra: toHorasStr(minutosExtra),
        minutosExtraDobles,
        minutosExtraTriples,
        factorPagoDentro,
        factorPagoSobre,
        minutosRetardo: totalMinutosRetardo,
        limiteLegalSemana: limiteLegalHoras,
        topeExtraSemana: topeExtraHoras,
        pctSobreLimite,
        excedeLimiteLegal: totalMinutosTrabajados > limiteLegalMinutos ? 'SI' : 'NO',
        excedeTopeExtra: minutosExtra > topeExtraMinutos ? 'SI' : 'NO',
        anioConfiguracionLegal: legalConfig.anio,
      });
    }

    return this.generateWorkHoursWorkbook(filas, `Horas_${semanaISO}`);
  }

  private async generateWorkHoursWorkbook(
    rows: FilaReporteHorasSemanales[],
    sheetName: string,
  ): Promise<Buffer> {
    const columns: ExcelColumn<FilaReporteHorasSemanales>[] = [
      col('semanaISO', 12, (r) => r.semanaISO),
      col('fechaInicio', 12, (r) => r.fechaInicio),
      col('fechaFin', 12, (r) => r.fechaFin),
      col('numeroEmpleado', 16, (r) => r.numeroEmpleado),
      col('nombreEmpleado', 32, (r) => r.nombreEmpleado),
      col('area', 18, (r) => r.area),
      col('puesto', 24, (r) => r.puesto),
      col('jefeInmediato', 26, (r) => r.jefeInmediato),
      col('ubicacion', 30, (r) => r.ubicacion),
      col('diasLaborables', 14, (r) => r.diasLaborables),
      col('diasDescanso', 14, (r) => r.diasDescanso),
      col('faltas', 10, (r) => r.faltas),
      col('minutosTrabajados', 18, (r) => r.minutosTrabajados),
      col('horasTrabajadas', 16, (r) => r.horasTrabajadas),
      col('minutosOrdinarios', 18, (r) => r.minutosOrdinarios),
      col('horasOrdinarias', 16, (r) => r.horasOrdinarias),
      col('minutosExtra', 14, (r) => r.minutosExtra),
      col('horasExtra', 14, (r) => r.horasExtra),
      col('minutosExtraDobles', 18, (r) => r.minutosExtraDobles),
      col('minutosExtraTriples', 18, (r) => r.minutosExtraTriples),
      col('factorPagoDentro', 16, (r) => r.factorPagoDentro),
      col('factorPagoSobre', 16, (r) => r.factorPagoSobre),
      col('minutosRetardo', 14, (r) => r.minutosRetardo),
      col('limiteLegalSemana', 18, (r) => r.limiteLegalSemana),
      col('topeExtraSemana', 16, (r) => r.topeExtraSemana),
      col('pctSobreLimite', 16, (r) => r.pctSobreLimite),
      col('excedeLimiteLegal', 18, (r) => r.excedeLimiteLegal),
      col('excedeTopeExtra', 16, (r) => r.excedeTopeExtra),
      col('anioConfiguracionLegal', 22, (r) => r.anioConfiguracionLegal),
    ];

    return this.excelExportService.generate({
      sheetName,
      columns,
      rows,
    });
  }
}

/**
 * Evalúa retardos evitando que las faltas por retardo inflen los minutos acumulados
 */
export function calcularRetardoEntrada(
  horaProgramada?: Date | string | null,
  horaReal?: Date | string | null,
  config?: any,
  timeZone = DEFAULT_TIMEZONE,
): EvaluacionEntrada {
  if (!horaReal || !horaProgramada) {
    return {
      esRetardo: false,
      esFaltaPorRetardo: false,
      minutosRetardo: 0,
      estado: 'SIN_CHECK',
    };
  }

  const tolerancia = config?.tolerancia?.minutosToleranciaEntrada ?? 20;
  const limiteRetardo = config?.tolerancia?.minutosLimiteRetardo ?? 60;

  const horaProgStr = toTimeTeoricoStr(horaProgramada);
  const horaRealStr = toTimeRealStr(horaReal, timeZone);

  if (horaProgStr === '—' || horaRealStr === '—') {
    return {
      esRetardo: false,
      esFaltaPorRetardo: false,
      minutosRetardo: 0,
      estado: 'SIN_CHECK',
    };
  }

  const [hP, mP] = horaProgStr.split(':').map(Number);
  const [hR, mR] = horaRealStr.split(':').map(Number);

  const minutosProg = hP * 60 + mP;
  const minutosCheck = hR * 60 + mR;
  const diferenciaMinutos = minutosCheck - minutosProg;

  // Llegó antes o a tiempo
  if (diferenciaMinutos <= tolerancia) {
    return {
      esRetardo: false,
      esFaltaPorRetardo: false,
      minutosRetardo: 0,
      estado: 'A_TIEMPO',
    };
  }

  // Superó el límite de retardo permitido -> Se clasifica como falta y NO se suman minutos de retardo
  if (diferenciaMinutos > limiteRetardo) {
    return {
      esRetardo: false,
      esFaltaPorRetardo: true,
      minutosRetardo: 0,
      estado: 'FALTA_RETARDO',
    };
  }

  // Retardo admisible
  return {
    esRetardo: true,
    esFaltaPorRetardo: false,
    minutosRetardo: diferenciaMinutos,
    estado: 'RETARDO',
  };
}

// --- Helpers de Formato y Fechas ---

function getISOWeekStr(d: Date): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

const toDateStr = (d: Date | string | null, timeZone = DEFAULT_TIMEZONE) => {
  if (!d) return '';
  const dateObj = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(dateObj.getTime())) return '';

  return new Intl.DateTimeFormat('es-MX', {
    timeZone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(dateObj);
};

const toTimeTeoricoStr = (d: Date | string | null) => {
  if (!d) return '—';
  if (typeof d === 'string') {
    if (d.includes('T')) return d.split('T')[1].substring(0, 5);
    if (d.includes(' ')) return d.split(' ')[1].substring(0, 5);
    return d.trim().substring(0, 5);
  }
  if (d instanceof Date) {
    const h = String(d.getUTCHours()).padStart(2, '0');
    const m = String(d.getUTCMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  }
  return '—';
};

const toTimeRealStr = (d: Date | string | null, timeZone = DEFAULT_TIMEZONE) => {
  if (!d) return '—';
  const dateObj = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(dateObj.getTime())) return '—';

  return new Intl.DateTimeFormat('es-MX', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(dateObj);
};

const toHorasStr = (minutos: number) => {
  if (!minutos || minutos <= 0) return '00:00';
  const h = String(Math.floor(minutos / 60)).padStart(2, '0');
  const m = String(minutos % 60).padStart(2, '0');
  return `${h}:${m}`;
};

const col = <T>(header: string, width: number, value: (row: T) => any): ExcelColumn<T> => ({
  header,
  key: header,
  width,
  value,
});


const DEFAULT_TIMEZONE = 'America/Mexico_City';

// --- Helpers de formateo reutilizables fuera de la clase ---
const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

/**
 * Obtiene el día de la semana respetando la zona horaria local.
 */
const toDiaSemana = (d: Date | string | null, timeZone = DEFAULT_TIMEZONE) => {
  if (!d) return '';
  const dateObj = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(dateObj.getTime())) return '';

  const dia = new Intl.DateTimeFormat('es-MX', {
    timeZone,
    weekday: 'long',
  }).format(dateObj);

  return dia.charAt(0).toUpperCase() + dia.slice(1);
};