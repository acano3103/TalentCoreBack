import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AttendanceTrackingConfigService } from 'src/modules/config/attendance-config/attendance-config.service';
import { AttendanceModuleConfig } from 'src/modules/config/attendance-config/interfaces/attendance-config.interface';
import { PrismaService } from 'src/prisma/prisma.service';
import type { Prisma } from 'generated/prisma/client';
import {
  diffMinutes,
  localDateForPrisma,
  localDateString,
  localTimeToInstant,
  localWeekdayName,
} from '../utils/timezone.util';
import {
  distanciaAlPoligono,
  distanciaMetros,
  puntoEnPoligono,
  Punto,
} from '../utils/geofence.util';
import {
  CanonicalCheck,
  ResultadoCheck,
} from './interfaces/canonical-check.interface';
import {
  AccionSiguiente,
  ModoInferencia,
  siguienteAccion,
  TipoChecada,
} from './state-machine';

/**
 * Umbrales operativos que hoy no viven en AttendanceModuleConfig.
 * Conviene moverlos al DTO de configuración cuando se extienda.
 */
const ANTIREBOTE_SEGUNDOS = 60;
const PRECISION_GPS_MAXIMA_METROS = 100;
const DESFASE_RELOJ_MAXIMO_SEGUNDOS = 300;
const ANTIGUEDAD_OFFLINE_MAXIMA_HORAS = 72;
const ZONA_HORARIA_DEFAULT = 'America/Mexico_City';
const TOPE_EXTRA_DIARIO_DEFAULT_MIN = 180;

/** D4: la jornada cerrada no se reabre desde la app; la reapertura la hace RH. */
const MENSAJE_JORNADA_CERRADA =
  'La jornada de hoy ya está cerrada. Pide a Recursos Humanos un registro manual.';

type ClienteDb = Prisma.TransactionClient;

interface GeocercaEval {
  idGeocerca: number;
  idSite: number;
  tipo: string;
  latitud: number;
  longitud: number;
  radio: number | null;
  vertices: Punto[];
  nombre: string;
  nombreSite: string | null;
}

/** Geocerca lista para pintar en la app, con el mismo criterio que resolveContext. */
export interface GeocercaMovil {
  idGeocerca: number;
  nombre: string;
  tipo: string;
  latitud: number;
  longitud: number;
  radio: number | null;
  vertices: Punto[] | null;
  idSite: number;
  nombreSite: string | null;
}

export interface ParametrosOperativos {
  minutosToleranciaEntrada: number;
  minutosLimiteRetardo: number;
  tiempoComidaMinutos: number;
  toleranciaComidaMinutos: number;
  obligatorioChecarComida: boolean;
  toleranciaSalidaAnticipadaMinutos: number;
  selfieObligatoria: boolean;
  permitirFueraGeocercaConJustificacion: boolean;
  precisionGpsMaximaMetros: number;
  desfaseRelojMaximoSegundos: number;
  antiguedadOfflineMaximaHoras: number;
}

export interface ContextoAsistencia {
  zonaHoraria: string;
  fechaJornada: Date;
  fechaLocal: string;
  diaSemana: string;
  horario: {
    HoraEntrada: Date | null;
    HoraSalida: Date | null;
  } | null;
  geocercas: GeocercaEval[];
  config: AttendanceModuleConfig;
  idTenant: number;
  idEmpresa: number;
}

interface DecisionTipo {
  ok: boolean;
  tipo: TipoChecada;
  codigo: string | null;
  motivo: string | null;
  ultimoTipo: TipoChecada | null;
  accion: AccionSiguiente;
}

interface EvaluacionUbicacion {
  resultadoGeocerca: string;
  distanciaGeocercaMetros: number | null;
  idGeocerca: number | null;
  idSitioDetectado: number | null;
  geocercaMasCercana: string | null;
  ubicacionSimulada: boolean;
  requiereRevision: boolean;
  advertencias: string[];
  bloqueada: boolean;
}

@Injectable()
export class AttendanceEngineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly attendanceConfigService: AttendanceTrackingConfigService,
  ) {}

  getParametrosOperativos(config: AttendanceModuleConfig): ParametrosOperativos {
    return {
      minutosToleranciaEntrada: config.tolerancia.minutosToleranciaEntrada,
      minutosLimiteRetardo: config.tolerancia.minutosLimiteRetardo,
      tiempoComidaMinutos: config.comida.tiempoComidaMinutos,
      toleranciaComidaMinutos: config.comida.toleranciaComidaMinutos,
      obligatorioChecarComida: config.comida.obligatorioChecarComida,
      toleranciaSalidaAnticipadaMinutos:
        config.salidas.toleranciaSalidaAnticipadaMinutos,
      selfieObligatoria: config.movil.selfieObligatoria,
      permitirFueraGeocercaConJustificacion:
        config.movil.permitirFueraGeocercaConJustificacion,
      precisionGpsMaximaMetros: PRECISION_GPS_MAXIMA_METROS,
      desfaseRelojMaximoSegundos: DESFASE_RELOJ_MAXIMO_SEGUNDOS,
      antiguedadOfflineMaximaHoras: ANTIGUEDAD_OFFLINE_MAXIMA_HORAS,
    };
  }

  async resolveContext(
    idEmpleado: number,
    instant: Date,
    canal?: CanonicalCheck['canal'],
  ): Promise<ContextoAsistencia> {
    const empleado = await this.prisma.empleados.findUnique({
      where: { idEmpleado },
      select: {
        idEmpleado: true,
        idSite: true,
        idTenant: true,
        idEmpresa: true,
      },
    });

    if (!empleado) {
      throw new NotFoundException(`No se encontró el empleado ${idEmpleado}.`);
    }
    if (empleado.idTenant == null || empleado.idEmpresa == null) {
      throw new BadRequestException(
        'El empleado no tiene tenant o empresa asignados.',
      );
    }

    const principal = await this.prisma.relEmpleadosSites.findFirst({
      where: { idEmpleado, Activo: true, EsPrincipal: true },
      include: { CatSites: { select: { zonaHoraria: true } } },
    });

    let zonaHoraria = principal?.CatSites?.zonaHoraria?.trim() ?? '';
    if (!zonaHoraria && empleado.idSite) {
      const site = await this.prisma.catSites.findUnique({
        where: { idSite: empleado.idSite },
        select: { zonaHoraria: true },
      });
      zonaHoraria = site?.zonaHoraria?.trim() ?? '';
    }
    if (!zonaHoraria) {
      zonaHoraria = ZONA_HORARIA_DEFAULT;
    }

    const fechaLocal = localDateString(instant, zonaHoraria);
    const fechaJornada = localDateForPrisma(instant, zonaHoraria);
    const diaSemana = localWeekdayName(instant, zonaHoraria);

    // D8: la ausencia de horario no impide checar; las teóricas quedan en null.
    const horario = await this.prisma.horariosEmpleado.findFirst({
      where: { idEmpleado, DiaSemana: diaSemana },
    });

    const geocercas =
      canal === 'APP_MOVIL' ? await this.cargarGeocercas(idEmpleado) : [];

    const config =
      await this.attendanceConfigService.getConfiguracionAsistencia(
        empleado.idTenant,
        empleado.idEmpresa,
      );

    return {
      zonaHoraria,
      fechaJornada,
      fechaLocal,
      diaSemana,
      horario: horario
        ? {
            HoraEntrada: horario.HoraEntrada,
            HoraSalida: horario.HoraSalida,
          }
        : null,
      geocercas,
      config,
      idTenant: empleado.idTenant,
      idEmpresa: empleado.idEmpresa,
    };
  }

  async resolveNextType(
    idEmpleado: number,
    fechaJornada: Date,
    config: AttendanceModuleConfig,
    modo: ModoInferencia,
  ): Promise<AccionSiguiente & { ultimoTipo: TipoChecada | null }> {
    const ultimo = await this.prisma.registrosAsistencia.findFirst({
      where: {
        idEmpleado,
        estatusProcesamiento: 'PROCESADO',
        JornadasEmpleado: { fecha: fechaJornada },
      },
      orderBy: { fechaHoraRegistro: 'desc' },
    });

    const ultimoTipo = (ultimo?.tipo as TipoChecada | undefined) ?? null;
    return {
      ...siguienteAccion(
        ultimoTipo,
        modo,
        config.comida.obligatorioChecarComida,
      ),
      ultimoTipo,
    };
  }

  async registerCheck(input: CanonicalCheck): Promise<ResultadoCheck> {
    if (!input.uuidCliente && input.idExternoArtemis == null) {
      throw new BadRequestException(
        'La checada requiere uuidCliente o idExternoArtemis.',
      );
    }

    const yaRegistrada = await this.buscarIdempotente(input);
    if (yaRegistrada) {
      return this.resultadoDesdeRegistro(yaRegistrada, input, true);
    }

    const ctx = await this.resolveContext(
      input.idEmpleado,
      input.fechaHoraRegistro,
      input.canal,
    );
    const accion = await this.resolveNextType(
      input.idEmpleado,
      ctx.fechaJornada,
      ctx.config,
      input.modoInferencia,
    );
    const decision = this.resolverTipo(input, accion);

    // El antirebote va antes del rechazo de transición: un doble toque del
    // mismo tipo en menos de 60 s queda como DUPLICADO y no mueve la jornada.
    // Pasada la ventana, la segunda ENTRADA del día sí es transición inválida.
    if (
      await this.hayReboteSemantico(
        input.idEmpleado,
        decision.tipo,
        input.fechaHoraRegistro,
      )
    ) {
      return this.registrarDuplicadoSemantico(input, ctx, decision.tipo);
    }

    if (!decision.ok) {
      return this.aplicarRechazoTransicion(input, ctx, decision);
    }

    const ubicacion = this.evaluarUbicacion(input, ctx);
    if (
      ubicacion.resultadoGeocerca === 'FUERA_PERMITIDA' &&
      !input.motivoFueraGeocerca?.trim()
    ) {
      throw new BadRequestException({
        code: 'MOTIVO_REQUERIDO',
        message:
          'Estás fuera de tu área asignada. Escribe el motivo e intenta de nuevo.',
        detail: {},
      });
    }

    if (ubicacion.bloqueada) {
      const jornadaExistente = await this.prisma.jornadasEmpleado.findUnique({
        where: {
          idEmpleado_fecha: {
            idEmpleado: input.idEmpleado,
            fecha: ctx.fechaJornada,
          },
        },
      });
      const registro = await this.prisma.registrosAsistencia.create({
        data: this.datosRegistro(input, ctx, {
          tipo: decision.tipo,
          estatusProcesamiento: 'RECHAZADO',
          idJornada: jornadaExistente?.idJornada ?? null,
          ubicacion,
          urlFoto: input.urlFoto ?? null,
        }),
      });
      const metros = Math.round(ubicacion.distanciaGeocercaMetros ?? 0);
      const lugar = ubicacion.geocercaMasCercana ?? 'tu área asignada';
      throw new UnprocessableEntityException({
        message: `Estás a ${metros} m de ${lugar}. Acércate al área asignada e intenta de nuevo.`,
        codigoRechazo: 'FUERA_BLOQUEADA',
        code: 'GEOCERCA_BLOQUEADA',
        detail: {
          distanciaGeocercaMetros: ubicacion.distanciaGeocercaMetros,
          geocercaMasCercana: ubicacion.geocercaMasCercana,
          idRegistro: registro.idRegistro.toString(),
        },
        rechazado: true,
        idRegistro: registro.idRegistro.toString(),
      });
    }

    const { requiereRevision, advertencias } = this.evaluarOffline(
      input,
      ubicacion,
    );

    const escrito = await this.prisma.$transaction(async (tx) => {
      const urlFoto = await this.consumirSelfieSiAplica(tx, input, ctx.config);
      const jornada = await tx.jornadasEmpleado.upsert({
        where: {
          idEmpleado_fecha: {
            idEmpleado: input.idEmpleado,
            fecha: ctx.fechaJornada,
          },
        },
        create: {
          idTenant: input.idTenant,
          idEmpresa: input.idEmpresa,
          idEmpleado: input.idEmpleado,
          fecha: ctx.fechaJornada,
          horaEntradaTeorica: ctx.horario?.HoraEntrada ?? null,
          horaSalidaTeorica: ctx.horario?.HoraSalida ?? null,
          estatusJornada: 'ABIERTA',
          revisada: false,
        },
        update: { fechaActualizacion: new Date() },
      });

      const registro = await tx.registrosAsistencia.create({
        data: this.datosRegistro(input, ctx, {
          tipo: decision.tipo,
          estatusProcesamiento: 'PROCESADO',
          idJornada: jornada.idJornada,
          ubicacion,
          urlFoto,
        }),
      });

      await this.recalcJornada(jornada.idJornada, tx, {
        requiereRevision,
        advertencias,
      });

      const actualizada = await tx.jornadasEmpleado.findUnique({
        where: { idJornada: jornada.idJornada },
      });

      return { registro, jornada: actualizada ?? jornada };
    });

    const siguiente = await this.resolveNextType(
      input.idEmpleado,
      ctx.fechaJornada,
      ctx.config,
      input.modoInferencia,
    );

    return this.armarResultado({
      registro: escrito.registro,
      jornada: escrito.jornada,
      tipo: decision.tipo,
      duplicado: false,
      resultadoGeocerca: ubicacion.resultadoGeocerca,
      distanciaGeocercaMetros: ubicacion.distanciaGeocercaMetros,
      requiereRevision,
      advertencias,
      rechazado: false,
      motivoRechazo: null,
      codigoRechazo: null,
      siguiente,
    });
  }

  async recalcJornada(
    idJornada: number,
    tx?: ClienteDb,
    opciones?: { requiereRevision?: boolean; advertencias?: string[] },
  ): Promise<void> {
    const client = (tx ?? this.prisma) as ClienteDb;
    const jornada = await client.jornadasEmpleado.findUnique({
      where: { idJornada },
    });
    if (!jornada) {
      throw new NotFoundException(`No se encontró la jornada ${idJornada}.`);
    }

    const registros = await client.registrosAsistencia.findMany({
      where: { idJornada, estatusProcesamiento: 'PROCESADO' },
      orderBy: { fechaHoraRegistro: 'asc' },
    });

    const config =
      await this.attendanceConfigService.getConfiguracionAsistencia(
        jornada.idTenant,
        jornada.idEmpresa,
      );

    const entrada = registros.find((r) => r.tipo === 'ENTRADA');
    const inicioComida = registros.find((r) => r.tipo === 'INICIO_COMIDA');
    const finComida = inicioComida
      ? registros.find(
          (r) =>
            r.tipo === 'FIN_COMIDA' &&
            r.fechaHoraRegistro.getTime() >
              inicioComida.fechaHoraRegistro.getTime(),
        )
      : undefined;
    const salidas = registros.filter((r) => r.tipo === 'SALIDA');
    const salida = salidas.length ? salidas[salidas.length - 1] : undefined;

    // Cierre automático: no hay SALIDA en registros; minutos usan horaSalidaReal
    // que el job asentó en la teórica. FALTA/DESCANSO no recalculan salida.
    const cierreAutomatico = jornada.estatusJornada === 'CIERRE_AUTOMATICO';
    const horaSalidaEfectiva =
      salida?.fechaHoraRegistro ??
      (cierreAutomatico ? jornada.horaSalidaReal : null);

    const zonaHoraria =
      registros.find((r) => r.zonaHoraria)?.zonaHoraria || ZONA_HORARIA_DEFAULT;
    const fechaLocal = jornada.fecha.toISOString().slice(0, 10);

    let minutosComida = 0;
    if (inicioComida && finComida) {
      minutosComida = diffMinutes(
        inicioComida.fechaHoraRegistro,
        finComida.fechaHoraRegistro,
      );
    } else if (
      entrada &&
      horaSalidaEfectiva &&
      config.comida.obligatorioChecarComida
    ) {
      minutosComida = config.comida.tiempoComidaMinutos;
    }

    const minutosComidaExcedidos = Math.max(
      0,
      minutosComida -
        (config.comida.tiempoComidaMinutos +
          config.comida.toleranciaComidaMinutos),
    );

    const minutosTrabajados =
      entrada && horaSalidaEfectiva
        ? Math.max(
            0,
            diffMinutes(entrada.fechaHoraRegistro, horaSalidaEfectiva) -
              minutosComida,
          )
        : 0;

    let minutosRetardo = 0;
    if (entrada && jornada.horaEntradaTeorica) {
      const teoricaInstant = localTimeToInstant(
        fechaLocal,
        jornada.horaEntradaTeorica,
        zonaHoraria,
      );
      minutosRetardo = Math.max(
        0,
        diffMinutes(teoricaInstant, entrada.fechaHoraRegistro) -
          config.tolerancia.minutosToleranciaEntrada,
      );
    }

    let jornadaOrdinariaMin: number | null = null;
    if (jornada.horaEntradaTeorica && jornada.horaSalidaTeorica) {
      const entradaTeorica = localTimeToInstant(
        fechaLocal,
        jornada.horaEntradaTeorica,
        zonaHoraria,
      );
      const salidaTeorica = localTimeToInstant(
        fechaLocal,
        jornada.horaSalidaTeorica,
        zonaHoraria,
      );
      jornadaOrdinariaMin =
        diffMinutes(entradaTeorica, salidaTeorica) -
        config.comida.tiempoComidaMinutos;
    }

    let minutosExtraDobles = 0;
    let minutosExtraTriples = 0;
    if (jornadaOrdinariaMin != null) {
      const bruto = Math.max(0, minutosTrabajados - jornadaOrdinariaMin);
      if (bruto >= config.horasExtra.minutosMinimosParaHoraExtra) {
        const anio = Number(fechaLocal.slice(0, 4));
        const legal = await client.configuracionJornadaLegal.findFirst({
          where: { idEmpresa: jornada.idEmpresa, anio, activo: true },
        });
        const topeDiario = legal
          ? Math.round(Number(legal.extraDiarioMax) * 60)
          : TOPE_EXTRA_DIARIO_DEFAULT_MIN;
        minutosExtraDobles = Math.min(bruto, topeDiario);
        minutosExtraTriples = Math.max(0, bruto - topeDiario);
      }
    }

    // FALTA, CIERRE_AUTOMATICO y DESCANSO los pone el job nocturno, no este método.
    // Un retardo por encima de minutosLimiteRetardo no se convierte en FALTA:
    // esa decisión es de RH con la evidencia a la vista. Si el cliente lo pide,
    // el cambio es una línea aquí: estatusJornada = 'FALTA'.
    const estatusDeJob = new Set([
      'FALTA',
      'CIERRE_AUTOMATICO',
      'DESCANSO',
    ]);
    let estatusJornada: string = jornada.estatusJornada;
    if (salida) {
      // Marcaje real de salida prevalece sobre un cierre automático previo.
      estatusJornada = 'CERRADA';
    } else if (!estatusDeJob.has(jornada.estatusJornada)) {
      estatusJornada = entrada && horaSalidaEfectiva ? 'CERRADA' : 'ABIERTA';
    }

    const retardoExcesivo =
      minutosRetardo > config.tolerancia.minutosLimiteRetardo;
    let revisada = jornada.revisada;
    if (opciones?.requiereRevision || retardoExcesivo) {
      revisada = false;
    }
    if (retardoExcesivo) {
      opciones?.advertencias?.push(
        `El retardo (${minutosRetardo} min) supera el límite de ${config.tolerancia.minutosLimiteRetardo} min. Queda pendiente de revisión y no se marca como falta.`,
      );
    }

    await client.jornadasEmpleado.update({
      where: { idJornada },
      data: {
        horaEntradaReal: entrada?.fechaHoraRegistro ?? null,
        horaSalidaReal: horaSalidaEfectiva,
        horaInicioComidaReal: inicioComida?.fechaHoraRegistro ?? null,
        horaFinComidaReal: finComida?.fechaHoraRegistro ?? null,
        minutosTrabajados,
        minutosRetardo,
        minutosComida,
        minutosComidaExcedidos,
        minutosExtraDobles,
        minutosExtraTriples,
        estatusJornada: estatusJornada as typeof jornada.estatusJornada,
        revisada,
        fechaActualizacion: new Date(),
      },
    });
  }

  private async buscarIdempotente(input: CanonicalCheck) {
    if (input.uuidCliente) {
      const porUuid = await this.prisma.registrosAsistencia.findUnique({
        where: { uuidCliente: input.uuidCliente },
      });
      if (porUuid) return porUuid;
    }
    if (input.idExternoArtemis != null) {
      return this.prisma.registrosAsistencia.findUnique({
        where: { idExternoArtemis: input.idExternoArtemis },
      });
    }
    return null;
  }

  private resolverTipo(
    input: CanonicalCheck,
    accion: AccionSiguiente & { ultimoTipo: TipoChecada | null },
  ): DecisionTipo {
    if (
      input.modoInferencia === 'ALTERNANTE_SIMPLE' &&
      (input.tipo === 'INICIO_COMIDA' || input.tipo === 'FIN_COMIDA')
    ) {
      return {
        ok: false,
        tipo: input.tipo,
        codigo: 'COMIDA_NO_SOPORTADA',
        motivo: 'Este canal no captura marcajes de comida.',
        ultimoTipo: accion.ultimoTipo,
        accion,
      };
    }

    if (
      accion.permitidos.length === 0 ||
      (input.tipo == null && accion.sugerido == null)
    ) {
      return {
        ok: false,
        tipo: input.tipo ?? 'SALIDA',
        codigo: 'JORNADA_CERRADA',
        motivo: MENSAJE_JORNADA_CERRADA,
        ultimoTipo: accion.ultimoTipo,
        accion,
      };
    }

    const tipo = input.tipo ?? accion.sugerido;
    if (!tipo || !accion.permitidos.includes(tipo)) {
      const permitidos = accion.permitidos.length
        ? accion.permitidos.join(', ')
        : 'ninguna';
      return {
        ok: false,
        tipo: tipo ?? 'ENTRADA',
        codigo: 'TRANSICION_INVALIDA',
        motivo: `No puedes registrar ${tipo ?? 'esa acción'} ahora. Las acciones permitidas son: ${permitidos}.`,
        ultimoTipo: accion.ultimoTipo,
        accion,
      };
    }

    return {
      ok: true,
      tipo,
      codigo: null,
      motivo: null,
      ultimoTipo: accion.ultimoTipo,
      accion,
    };
  }

  /**
   * TODO: confirmar qué hace Artemis cuando el clock-in responde un código
   * de error. Si reintenta indefinidamente, un 422 lo deja en bucle. Con
   * rechazoSuave el intento queda en la bitácora y el caller responde
   * HTTP 200 para que la cola avance.
   */
  private async aplicarRechazoTransicion(
    input: CanonicalCheck,
    ctx: ContextoAsistencia,
    decision: DecisionTipo,
  ): Promise<ResultadoCheck> {
    if (!input.rechazoSuave) {
      throw new UnprocessableEntityException({
        message: decision.motivo,
        codigoRechazo: decision.codigo,
        code: decision.codigo,
        detail: {
          estadoActual: decision.ultimoTipo ?? 'NINGUNO',
          permitidos: decision.accion.permitidos,
        },
        rechazado: true,
      });
    }

    const jornada = await this.prisma.jornadasEmpleado.findUnique({
      where: {
        idEmpleado_fecha: {
          idEmpleado: input.idEmpleado,
          fecha: ctx.fechaJornada,
        },
      },
    });

    const registro = await this.prisma.registrosAsistencia.create({
      data: this.datosRegistro(input, ctx, {
        tipo: decision.tipo,
        estatusProcesamiento: 'RECHAZADO',
        idJornada: jornada?.idJornada ?? null,
        ubicacion: this.ubicacionNoAplica(),
        urlFoto: input.urlFoto ?? null,
      }),
    });

    const siguiente = siguienteAccion(
      decision.ultimoTipo,
      input.modoInferencia,
      ctx.config.comida.obligatorioChecarComida,
    );

    return this.armarResultado({
      registro,
      jornada,
      tipo: decision.tipo,
      duplicado: false,
      resultadoGeocerca: 'NO_APLICA',
      distanciaGeocercaMetros: null,
      requiereRevision: false,
      advertencias: [],
      rechazado: true,
      motivoRechazo: decision.motivo,
      codigoRechazo: decision.codigo,
      siguiente,
    });
  }

  private async hayReboteSemantico(
    idEmpleado: number,
    tipo: TipoChecada,
    instante: Date,
  ): Promise<boolean> {
    const ventanaMs = ANTIREBOTE_SEGUNDOS * 1000;
    const cercano = await this.prisma.registrosAsistencia.findFirst({
      where: {
        idEmpleado,
        tipo,
        estatusProcesamiento: 'PROCESADO',
        fechaHoraRegistro: {
          gte: new Date(instante.getTime() - ventanaMs),
          lte: new Date(instante.getTime() + ventanaMs),
        },
      },
      orderBy: { fechaHoraRegistro: 'desc' },
    });
    if (!cercano) return false;
    return (
      Math.abs(instante.getTime() - cercano.fechaHoraRegistro.getTime()) <
      ventanaMs
    );
  }

  private async registrarDuplicadoSemantico(
    input: CanonicalCheck,
    ctx: ContextoAsistencia,
    tipo: TipoChecada,
  ): Promise<ResultadoCheck> {
    const jornada = await this.prisma.jornadasEmpleado.findUnique({
      where: {
        idEmpleado_fecha: {
          idEmpleado: input.idEmpleado,
          fecha: ctx.fechaJornada,
        },
      },
    });

    const registro = await this.prisma.registrosAsistencia.create({
      data: this.datosRegistro(input, ctx, {
        tipo,
        estatusProcesamiento: 'DUPLICADO',
        idJornada: jornada?.idJornada ?? null,
        ubicacion: this.ubicacionNoAplica(),
        urlFoto: input.urlFoto ?? null,
      }),
    });

    const siguiente = await this.resolveNextType(
      input.idEmpleado,
      ctx.fechaJornada,
      ctx.config,
      input.modoInferencia,
    );

    return this.armarResultado({
      registro,
      jornada,
      tipo,
      duplicado: true,
      resultadoGeocerca: 'NO_APLICA',
      distanciaGeocercaMetros: null,
      requiereRevision: false,
      advertencias: [],
      rechazado: false,
      motivoRechazo: null,
      codigoRechazo: null,
      siguiente,
    });
  }

  private evaluarUbicacion(
    input: CanonicalCheck,
    ctx: ContextoAsistencia,
  ): EvaluacionUbicacion {
    if (input.canal !== 'APP_MOVIL') {
      return this.ubicacionNoAplica();
    }

    const punto = input.ubicacion;
    if (
      !punto ||
      !Number.isFinite(punto.latitud) ||
      !Number.isFinite(punto.longitud)
    ) {
      return {
        ...this.ubicacionNoAplica(),
        resultadoGeocerca: 'SIN_UBICACION',
        geocercaMasCercana: null,
        requiereRevision: true,
        advertencias: [
          'No se recibió ubicación. La checada queda pendiente de revisión.',
        ],
      };
    }

    const simulada = punto.esSimulada === true;
    const advertencias: string[] = [];
    let requiereRevision = false;
    if (simulada) {
      requiereRevision = true;
      advertencias.push(
        'La ubicación fue reportada como simulada y queda pendiente de revisión.',
      );
    }

    if (
      punto.precisionMetros != null &&
      punto.precisionMetros > PRECISION_GPS_MAXIMA_METROS
    ) {
      return {
        resultadoGeocerca: 'PRECISION_INSUFICIENTE',
        distanciaGeocercaMetros: null,
        idGeocerca: null,
        idSitioDetectado: null,
        geocercaMasCercana: null,
        ubicacionSimulada: simulada,
        requiereRevision: true,
        bloqueada: false,
        advertencias: [
          ...advertencias,
          'La precisión del GPS es insuficiente. La checada se acepta y queda pendiente de revisión.',
        ],
      };
    }

    if (ctx.geocercas.length === 0) {
      return {
        resultadoGeocerca: 'NO_APLICA',
        distanciaGeocercaMetros: null,
        idGeocerca: null,
        idSitioDetectado: null,
        geocercaMasCercana: null,
        ubicacionSimulada: simulada,
        requiereRevision,
        bloqueada: false,
        advertencias,
      };
    }

    const mejor = this.geocercaMasCercana(
      { lat: punto.latitud, lng: punto.longitud },
      ctx.geocercas,
    );
    const nombreCercana = nombreVisibleGeocerca(
      ctx.geocercas.find((item) => item.idGeocerca === mejor.idGeocerca),
    );

    if (mejor.dentro) {
      return {
        resultadoGeocerca: 'DENTRO',
        distanciaGeocercaMetros: mejor.distanciaMetros,
        idGeocerca: mejor.idGeocerca,
        idSitioDetectado: mejor.idSite,
        geocercaMasCercana: nombreCercana,
        ubicacionSimulada: simulada,
        requiereRevision,
        bloqueada: false,
        advertencias,
      };
    }

    if (ctx.config.movil.permitirFueraGeocercaConJustificacion) {
      return {
        resultadoGeocerca: 'FUERA_PERMITIDA',
        distanciaGeocercaMetros: mejor.distanciaMetros,
        idGeocerca: mejor.idGeocerca,
        idSitioDetectado: mejor.idSite,
        geocercaMasCercana: nombreCercana,
        ubicacionSimulada: simulada,
        requiereRevision: true,
        bloqueada: false,
        advertencias: [
          ...advertencias,
          'Checada fuera de geocerca con justificación. Queda pendiente de revisión.',
        ],
      };
    }

    return {
      resultadoGeocerca: 'FUERA_BLOQUEADA',
      distanciaGeocercaMetros: mejor.distanciaMetros,
      idGeocerca: mejor.idGeocerca,
      idSitioDetectado: mejor.idSite,
      geocercaMasCercana: nombreCercana,
      ubicacionSimulada: simulada,
      requiereRevision: true,
      bloqueada: true,
      advertencias,
    };
  }

  private geocercaMasCercana(
    punto: Punto,
    geocercas: GeocercaEval[],
  ): {
    idGeocerca: number;
    idSite: number;
    dentro: boolean;
    distanciaMetros: number;
  } {
    let mejor: {
      idGeocerca: number;
      idSite: number;
      dentro: boolean;
      distanciaBorde: number;
      distanciaReferencia: number;
    } | null = null;

    for (const geocerca of geocercas) {
      const evaluada = this.evaluarUnaGeocerca(punto, geocerca);
      if (!evaluada) continue;
      if (
        !mejor ||
        (evaluada.dentro && !mejor.dentro) ||
        (evaluada.dentro === mejor.dentro &&
          evaluada.distanciaBorde < mejor.distanciaBorde) ||
        (evaluada.dentro === mejor.dentro &&
          evaluada.distanciaBorde === mejor.distanciaBorde &&
          evaluada.distanciaReferencia < mejor.distanciaReferencia)
      ) {
        mejor = {
          idGeocerca: geocerca.idGeocerca,
          idSite: geocerca.idSite,
          dentro: evaluada.dentro,
          distanciaBorde: evaluada.distanciaBorde,
          distanciaReferencia: evaluada.distanciaReferencia,
        };
      }
    }

    if (!mejor) {
      return {
        idGeocerca: geocercas[0].idGeocerca,
        idSite: geocercas[0].idSite,
        dentro: false,
        distanciaMetros: 0,
      };
    }

    return {
      idGeocerca: mejor.idGeocerca,
      idSite: mejor.idSite,
      dentro: mejor.dentro,
      distanciaMetros: Number(mejor.distanciaBorde.toFixed(2)),
    };
  }

  private evaluarUnaGeocerca(
    punto: Punto,
    geocerca: GeocercaEval,
  ): {
    dentro: boolean;
    distanciaBorde: number;
    distanciaReferencia: number;
  } | null {
    if (geocerca.tipo === 'circle') {
      if (geocerca.radio == null) return null;
      const alCentro = distanciaMetros(punto, {
        lat: geocerca.latitud,
        lng: geocerca.longitud,
      });
      const dentro = alCentro <= geocerca.radio;
      return {
        dentro,
        distanciaBorde: dentro ? 0 : alCentro - geocerca.radio,
        distanciaReferencia: alCentro,
      };
    }

    if (geocerca.tipo === 'polygon' && geocerca.vertices.length >= 3) {
      const dentro = puntoEnPoligono(punto, geocerca.vertices);
      const alBorde = distanciaAlPoligono(punto, geocerca.vertices);
      return {
        dentro,
        distanciaBorde: dentro ? 0 : alBorde,
        distanciaReferencia: alBorde,
      };
    }

    return null;
  }

  private evaluarOffline(
    input: CanonicalCheck,
    ubicacion: EvaluacionUbicacion,
  ): { requiereRevision: boolean; advertencias: string[] } {
    const advertencias = [...ubicacion.advertencias];
    let requiereRevision = ubicacion.requiereRevision;

    if (input.esOffline) {
      const horas =
        (Date.now() - input.fechaHoraRegistro.getTime()) / 3_600_000;
      if (horas > ANTIGUEDAD_OFFLINE_MAXIMA_HORAS) {
        requiereRevision = true;
        advertencias.push(
          'La checada offline supera 72 horas de antigüedad y queda pendiente de revisión.',
        );
      }
      if (
        input.desfaseRelojSegundos != null &&
        Math.abs(input.desfaseRelojSegundos) > DESFASE_RELOJ_MAXIMO_SEGUNDOS
      ) {
        requiereRevision = true;
        advertencias.push(
          'El reloj del dispositivo difiere más de 5 minutos y queda pendiente de revisión.',
        );
      }
    }

    return { requiereRevision, advertencias };
  }

  private async consumirSelfieSiAplica(
    tx: ClienteDb,
    input: CanonicalCheck,
    config: AttendanceModuleConfig,
  ): Promise<string | null> {
    const exigeSelfie =
      input.canal === 'APP_MOVIL' && config.movil.selfieObligatoria;

    if (!exigeSelfie) {
      return input.urlFoto ?? null;
    }
    if (!input.idEvidencia) {
      throw new BadRequestException({
        code: 'EVIDENCIA_REQUERIDA',
        message: 'Necesitas tomar una selfie para registrar tu asistencia.',
        detail: {},
      });
    }

    const evidencia = await tx.asistenciaEvidencias.findUnique({
      where: { idEvidencia: input.idEvidencia },
    });
    if (!evidencia || evidencia.idEmpleado !== input.idEmpleado) {
      throw new BadRequestException({
        code: 'EVIDENCIA_AJENA',
        message:
          'Esa selfie no corresponde a tu usuario. Toma una nueva e intenta de nuevo.',
        detail: {},
      });
    }
    if (evidencia.consumida) {
      throw new BadRequestException({
        code: 'EVIDENCIA_CONSUMIDA',
        message: 'Esa selfie ya se usó. Toma una nueva e intenta de nuevo.',
        detail: {},
      });
    }

    await tx.asistenciaEvidencias.update({
      where: { idEvidencia: input.idEvidencia },
      data: { consumida: true },
    });

    return evidencia.rutaArchivo ?? input.urlFoto ?? null;
  }

  async listarGeocercasMovil(idEmpleado: number): Promise<GeocercaMovil[]> {
    const relaciones = await this.prisma.relEmpleadosSites.findMany({
      where: {
        idEmpleado,
        Activo: true,
        MetodoAsistencia: { in: ['APP_MOVIL', 'CUALQUIERA'] },
      },
      include: {
        CatSites: {
          include: {
            CatGeocercas: {
              where: { Activo: true },
              include: {
                RelGeocercaVertices: { orderBy: { Orden: 'asc' } },
              },
            },
          },
        },
      },
    });

    const geocercas: GeocercaMovil[] = [];
    for (const rel of relaciones) {
      for (const geocerca of rel.CatSites?.CatGeocercas ?? []) {
        const vertices = (geocerca.RelGeocercaVertices ?? []).map((vertice) => ({
          lat: Number(vertice.Latitud),
          lng: Number(vertice.Longitud),
        }));
        geocercas.push({
          idGeocerca: geocerca.idGeocerca,
          nombre: geocerca.Nombre ?? '',
          tipo: geocerca.Tipo,
          latitud: Number(geocerca.Latitud),
          longitud: Number(geocerca.Longitud),
          radio: geocerca.Radio == null ? null : Number(geocerca.Radio),
          vertices: vertices.length > 0 ? vertices : null,
          idSite: rel.idSite,
          nombreSite: rel.CatSites?.Descripcion ?? null,
        });
      }
    }
    return geocercas;
  }

  private async cargarGeocercas(idEmpleado: number): Promise<GeocercaEval[]> {
    const geocercas = await this.listarGeocercasMovil(idEmpleado);
    return geocercas.map((geocerca) => ({
      idGeocerca: geocerca.idGeocerca,
      idSite: geocerca.idSite,
      tipo: geocerca.tipo,
      latitud: geocerca.latitud,
      longitud: geocerca.longitud,
      radio: geocerca.radio,
      vertices: geocerca.vertices ?? [],
      nombre: geocerca.nombre,
      nombreSite: geocerca.nombreSite,
    }));
  }

  private async resultadoDesdeRegistro(
    registro: {
      idRegistro: bigint;
      idJornada: number | null;
      idEmpleado: number;
      tipo: string;
      resultadoGeocerca: string;
      distanciaGeocercaMetros: unknown;
      estatusProcesamiento: string;
    },
    input: CanonicalCheck,
    duplicado: boolean,
  ): Promise<ResultadoCheck> {
    const jornada = registro.idJornada
      ? await this.prisma.jornadasEmpleado.findUnique({
          where: { idJornada: registro.idJornada },
        })
      : null;
    const config =
      await this.attendanceConfigService.getConfiguracionAsistencia(
        input.idTenant,
        input.idEmpresa,
      );
    const siguiente = jornada
      ? await this.resolveNextType(
          registro.idEmpleado,
          jornada.fecha,
          config,
          input.modoInferencia,
        )
      : siguienteAccion(
          null,
          input.modoInferencia,
          config.comida.obligatorioChecarComida,
        );

    return this.armarResultado({
      registro,
      jornada,
      tipo: registro.tipo as TipoChecada,
      duplicado,
      resultadoGeocerca: registro.resultadoGeocerca,
      distanciaGeocercaMetros: numeroONull(registro.distanciaGeocercaMetros),
      requiereRevision: false,
      advertencias: [],
      rechazado: registro.estatusProcesamiento === 'RECHAZADO',
      motivoRechazo: null,
      codigoRechazo: null,
      siguiente,
    });
  }

  private armarResultado(params: {
    registro: { idRegistro: bigint };
    jornada: {
      idJornada: number;
      estatusJornada: string;
      minutosTrabajados: number;
      minutosRetardo: number;
      minutosComida: number;
    } | null;
    tipo: TipoChecada;
    duplicado: boolean;
    resultadoGeocerca: string;
    distanciaGeocercaMetros: number | null;
    requiereRevision: boolean;
    advertencias: string[];
    rechazado: boolean;
    motivoRechazo: string | null;
    codigoRechazo: string | null;
    siguiente: AccionSiguiente;
  }): ResultadoCheck {
    const retardoExcesivo = params.advertencias.some((mensaje) =>
      mensaje.startsWith('El retardo'),
    );
    return {
      idRegistro: params.registro.idRegistro.toString(),
      idJornada: params.jornada?.idJornada ?? 0,
      tipo: params.tipo,
      duplicado: params.duplicado,
      resultadoGeocerca: params.resultadoGeocerca,
      distanciaGeocercaMetros: params.distanciaGeocercaMetros,
      requiereRevision: params.requiereRevision || retardoExcesivo,
      advertencias: params.advertencias,
      rechazado: params.rechazado,
      motivoRechazo: params.motivoRechazo,
      codigoRechazo: params.codigoRechazo,
      jornada: {
        estatusJornada: params.jornada?.estatusJornada ?? 'ABIERTA',
        minutosTrabajados: params.jornada?.minutosTrabajados ?? 0,
        minutosRetardo: params.jornada?.minutosRetardo ?? 0,
        minutosComida: params.jornada?.minutosComida ?? 0,
        siguienteAccion: {
          sugerido: params.siguiente.sugerido,
          permitidos: params.siguiente.permitidos,
        },
      },
    };
  }

  private datosRegistro(
    input: CanonicalCheck,
    ctx: ContextoAsistencia,
    extra: {
      tipo: TipoChecada;
      estatusProcesamiento: 'PROCESADO' | 'DUPLICADO' | 'RECHAZADO';
      idJornada: number | null;
      ubicacion: EvaluacionUbicacion;
      urlFoto: string | null;
    },
  ) {
    return {
      idTenant: input.idTenant,
      idEmpresa: input.idEmpresa,
      idEmpleado: input.idEmpleado,
      idJornada: extra.idJornada,
      canal: input.canal,
      tipo: extra.tipo,
      fechaHoraRegistro: input.fechaHoraRegistro,
      esOffline: input.esOffline ?? false,
      latitud: input.ubicacion?.latitud ?? null,
      longitud: input.ubicacion?.longitud ?? null,
      resultadoGeocerca: extra.ubicacion.resultadoGeocerca as
        | 'DENTRO'
        | 'FUERA_PERMITIDA'
        | 'FUERA_BLOQUEADA'
        | 'NO_APLICA'
        | 'SIN_UBICACION'
        | 'PRECISION_INSUFICIENTE',
      idSitioDetectado: extra.ubicacion.idSitioDetectado,
      idExternoArtemis: input.idExternoArtemis ?? null,
      idDispositivoArtemis: input.idDispositivoArtemis ?? null,
      nombreDispositivo: input.nombreDispositivo ?? null,
      urlFoto: extra.urlFoto,
      uuidCliente: input.uuidCliente ?? null,
      estatusProcesamiento: extra.estatusProcesamiento,
      idDispositivo: input.idDispositivo ?? null,
      idEvidencia: input.idEvidencia ?? null,
      idGeocerca: extra.ubicacion.idGeocerca,
      precisionMetros: input.ubicacion?.precisionMetros ?? null,
      distanciaGeocercaMetros: extra.ubicacion.distanciaGeocercaMetros,
      ubicacionSimulada: extra.ubicacion.ubicacionSimulada,
      desfaseRelojSegundos: input.desfaseRelojSegundos ?? null,
      motivoFueraGeocerca: input.motivoFueraGeocerca ?? null,
      versionApp: input.versionApp ?? null,
      zonaHoraria: ctx.zonaHoraria,
    };
  }

  private ubicacionNoAplica(): EvaluacionUbicacion {
    return {
      resultadoGeocerca: 'NO_APLICA',
      distanciaGeocercaMetros: null,
      idGeocerca: null,
      idSitioDetectado: null,
      geocercaMasCercana: null,
      ubicacionSimulada: false,
      requiereRevision: false,
      advertencias: [],
      bloqueada: false,
    };
  }
}

function numeroONull(value: unknown): number | null {
  if (value == null) return null;
  const numero = Number(value);
  return Number.isFinite(numero) ? numero : null;
}

function nombreVisibleGeocerca(
  geocerca: Pick<GeocercaEval, 'nombre' | 'nombreSite'> | undefined,
): string | null {
  const site = geocerca?.nombreSite?.trim();
  if (site) return site;
  const nombre = geocerca?.nombre?.trim();
  return nombre || null;
}
