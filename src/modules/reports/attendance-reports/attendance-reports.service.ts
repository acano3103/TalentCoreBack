import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { ActiveUserDto } from 'src/modules/auth/dto/active-user.dto';
import { DailyAttendanceReportFilterDto } from './dto/daily-attendance-report.dto';
import { ExcelColumn, ExcelExportService } from 'src/common/services/excel-export.service';
import { Prisma } from 'generated/prisma/client';
import { AttendanceTrackingConfigService } from 'src/modules/config/attendance-config/attendance-config.service';
import { EvaluacionEntrada, ToleranciaConfig } from './interfaces/attendance-report.interface';

@Injectable()
export class AttendanceReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly excelExportService: ExcelExportService,
    private readonly attendanceConfigService: AttendanceTrackingConfigService,
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
}

/**
 * Evalúa la hora de entrada real contra la hora programada y la tolerancia configurada.
 *
 * @param horaProgramada Hora de entrada del turno (ej. '09:00' o Date)
 * @param horaReal Primer marcaje/checada de entrada (ej. '09:25' o Date)
 * @param config Configuración de tolerancia de la empresa
 */
export function calcularRetardoEntrada(
  horaProgramada?: Date | string | null,
  horaReal?: Date | string | null,
  config?: { tolerancia?: Partial<ToleranciaConfig> } | null,
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

  const tolerancia = config?.tolerancia?.minutosToleranciaEntrada ?? 0;
  const limiteRetardo = config?.tolerancia?.minutosLimiteRetardo ?? 60;

  // Hora programada: literal (sin desfase)
  const horaProgStr = toTimeTeoricoStr(horaProgramada);
  // Hora real: convertida a hora local
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

  // Si llegó antes o a tiempo
  if (diferenciaMinutos <= 0) {
    return {
      esRetardo: false,
      esFaltaPorRetardo: false,
      minutosRetardo: 0,
      estado: 'A_TIEMPO',
    };
  }

  // Dentro de tolerancia
  if (diferenciaMinutos <= tolerancia) {
    return {
      esRetardo: false,
      esFaltaPorRetardo: false,
      minutosRetardo: 0,
      estado: 'A_TIEMPO',
    };
  }

  // Superó el límite admisible de retardo -> Falta
  if (diferenciaMinutos > limiteRetardo) {
    return {
      esRetardo: false,
      esFaltaPorRetardo: true,
      minutosRetardo: diferenciaMinutos,
      estado: 'FALTA_RETARDO',
    };
  }

  // Retardo válido
  return {
    esRetardo: true,
    esFaltaPorRetardo: false,
    minutosRetardo: diferenciaMinutos,
    estado: 'RETARDO',
  };
}

const DEFAULT_TIMEZONE = 'America/Mexico_City';

// --- Helpers de formateo reutilizables fuera de la clase ---
const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

/**
 * Formatea fechas a DD/MM/YYYY en hora local.
 */
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

/**
 * Para HORAS TEÓRICAS (hora de entrada / salida pactada del turno).
 * NO aplica conversión de zona horaria: extrae la hora y minuto literal (tal como se guardó).
 */
const toTimeTeoricoStr = (d: Date | string | null) => {
  if (!d) return '—';

  // Si viene como string: "08:00", "08:00:00" o "1970-01-01T08:00:00.000Z"
  if (typeof d === 'string') {
    if (d.includes('T')) {
      return d.split('T')[1].substring(0, 5);
    }
    if (d.includes(' ')) {
      return d.split(' ')[1].substring(0, 5);
    }
    return d.trim().substring(0, 5);
  }

  // Si Prisma lo devuelve como Date, los campos tipo TIME de PostgreSQL se almacenan
  // con los valores de hora/minuto en UTC (ej. 08:00 UTC = 08:00 nominal).
  if (d instanceof Date) {
    const h = String(d.getUTCHours()).padStart(2, '0');
    const m = String(d.getUTCMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  }

  return '—';
};

/**
 * Para HORAS REALES (checada de huella, biométrico, app, etc. en UTC).
 * SÍ aplica la conversión a la zona horaria local de México.
 */
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