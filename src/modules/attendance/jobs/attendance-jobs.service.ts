import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { unlink } from 'fs/promises';
import { join } from 'path';
import { PrismaService } from 'src/prisma/prisma.service';
import { AttendanceEngineService } from '../engine/attendance-engine.service';
import {
  addLocalDays,
  isoWeekBounds,
  localDateString,
  localDateToPrismaDate,
  localTimeToInstant,
  localWeekdayName,
} from '../utils/timezone.util';

/**
 * Minutos tras la horaSalidaTeorica antes de cerrar una jornada ABIERTA.
 * TODO: mover a ConfiguracionAsistencia / TenantConfig cuando sea configurable.
 */
const CIERRE_AUTOMATICO_MINUTOS = 60;

const CANALES_CIERRE_AUTOMATICO = new Set(['APP_MOVIL', 'IVR']);
const LOTE_EMPLEADOS = 500;
const ZONA_HORARIA_DEFAULT = 'America/Mexico_City';

@Injectable()
export class AttendanceJobsService {
  private readonly logger = new Logger(AttendanceJobsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: AttendanceEngineService,
    private readonly configService: ConfigService,
  ) {}

  private jobsEnabled(): boolean {
    const flag =
      this.configService.get<string>('ATTENDANCE_JOBS_ENABLED') ?? 'true';
    return flag !== 'false';
  }

  /**
   * Cada 15 min: cierra jornadas APP_MOVIL/IVR cuya salida teórica ya venció.
   * Idempotente: solo toca estatus ABIERTA.
   */
  @Cron('*/15 * * * *')
  async cerrarJornadasAbiertas(): Promise<void> {
    if (!this.jobsEnabled()) {
      return;
    }

    this.logger.log('cerrarJornadasAbiertas: inicio');
    let afectadas = 0;

    try {
      const ahora = new Date();
      let lastId = 0;

      for (;;) {
        const lote = await this.prisma.jornadasEmpleado.findMany({
          where: {
            estatusJornada: 'ABIERTA',
            horaSalidaTeorica: { not: null },
            idJornada: { gt: lastId },
          },
          include: {
            Empleados: { select: { idEmpleado: true, idSite: true } },
            RegistrosAsistencia: {
              where: { estatusProcesamiento: 'PROCESADO' },
              orderBy: { fechaHoraRegistro: 'desc' },
              take: 1,
              select: { canal: true },
            },
          },
          orderBy: { idJornada: 'asc' },
          take: LOTE_EMPLEADOS,
        });

        if (!lote.length) {
          break;
        }
        lastId = lote[lote.length - 1].idJornada;

        const idsEmpleado = [...new Set(lote.map((j) => j.idEmpleado))];
        const zonaPorEmpleado = await this.resolverZonasEmpleados(idsEmpleado, lote.map((j) => j.Empleados));

        for (const jornada of lote) {
          // D8: sin teórica no se cierra (ya filtrado, defensa en profundidad).
          if (!jornada.horaSalidaTeorica) {
            continue;
          }

          const ultimo = jornada.RegistrosAsistencia[0];
          if (!ultimo || !CANALES_CIERRE_AUTOMATICO.has(ultimo.canal)) {
            continue;
          }

          const zona =
            zonaPorEmpleado.get(jornada.idEmpleado) ?? ZONA_HORARIA_DEFAULT;
          const fechaLocal = jornada.fecha.toISOString().slice(0, 10);
          const salidaTeorica = localTimeToInstant(
            fechaLocal,
            jornada.horaSalidaTeorica,
            zona,
          );
          const umbralMs =
            salidaTeorica.getTime() + CIERRE_AUTOMATICO_MINUTOS * 60_000;
          if (ahora.getTime() < umbralMs) {
            continue;
          }

          try {
            // horaSalidaReal = instante de la teórica (NO la hora del job).
            await this.prisma.jornadasEmpleado.update({
              where: { idJornada: jornada.idJornada },
              data: {
                horaSalidaReal: salidaTeorica,
                estatusJornada: 'CIERRE_AUTOMATICO',
                revisada: false,
              },
            });
            await this.engine.recalcJornada(jornada.idJornada, undefined, {
              requiereRevision: true,
            });
            afectadas += 1;
          } catch (err: unknown) {
            this.logger.warn(
              `cerrarJornadasAbiertas: fallo en jornada ${jornada.idJornada}: ${
                err instanceof Error ? err.message : String(err)
              }`,
            );
          }
        }
      }

      this.logger.log(
        `cerrarJornadasAbiertas: fin — ${afectadas} jornadas cerradas`,
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `cerrarJornadasAbiertas: error — ${message}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  /**
   * 03:00 diario: marca FALTA el día local anterior si había horario y no hay jornada.
   * Idempotente vía UK (idEmpleado, fecha) + createMany skipDuplicates.
   */
  @Cron('0 3 * * *')
  async detectarFaltas(): Promise<void> {
    if (!this.jobsEnabled()) {
      return;
    }

    this.logger.log('detectarFaltas: inicio');
    let creadas = 0;

    try {
      const ahora = new Date();

      const empresas = await this.prisma.empleados.groupBy({
        by: ['idEmpresa', 'idTenant'],
        where: {
          activo: true,
          idEmpresa: { not: null },
          idTenant: { not: null },
        },
      });

      for (const grupoEmpresa of empresas) {
        const idEmpresa = grupoEmpresa.idEmpresa!;
        const idTenant = grupoEmpresa.idTenant!;
        let lastId = 0;

        for (;;) {
          const lote = await this.prisma.empleados.findMany({
            where: {
              activo: true,
              idEmpresa,
              idTenant,
              idEmpleado: { gt: lastId },
            },
            select: {
              idEmpleado: true,
              idEmpresa: true,
              idTenant: true,
              idSite: true,
            },
            orderBy: { idEmpleado: 'asc' },
            take: LOTE_EMPLEADOS,
          });

          if (!lote.length) {
            break;
          }
          lastId = lote[lote.length - 1].idEmpleado;

          const zonaPorEmpleado = await this.resolverZonasEmpleados(
            lote.map((e) => e.idEmpleado),
            lote,
          );

          // Agrupa por sitio/zona para calcular "ayer" una sola vez por zona.
          type GrupoZona = {
            zona: string;
            fechaAnterior: string;
            fechaPrisma: Date;
            diaSemana: string;
            empleados: typeof lote;
          };
          const porZona = new Map<string, GrupoZona>();

          for (const emp of lote) {
            const zona =
              zonaPorEmpleado.get(emp.idEmpleado) ?? ZONA_HORARIA_DEFAULT;
            const hoyLocal = localDateString(ahora, zona);
            const fechaAnterior = addLocalDays(hoyLocal, -1);
            const key = `${zona}|${fechaAnterior}`;

            let grupo = porZona.get(key);
            if (!grupo) {
              const ref = localDateToPrismaDate(fechaAnterior);
              ref.setUTCHours(12, 0, 0, 0);
              grupo = {
                zona,
                fechaAnterior,
                fechaPrisma: localDateToPrismaDate(fechaAnterior),
                diaSemana: localWeekdayName(ref, zona),
                empleados: [],
              };
              porZona.set(key, grupo);
            }
            grupo.empleados.push(emp);
          }

          for (const grupo of porZona.values()) {
            const ids = grupo.empleados.map((e) => e.idEmpleado);

            const [horarios, jornadasExistentes] = await Promise.all([
              this.prisma.horariosEmpleado.findMany({
                where: {
                  idEmpleado: { in: ids },
                  DiaSemana: grupo.diaSemana,
                  HoraEntrada: { not: null },
                },
                select: {
                  idEmpleado: true,
                  HoraEntrada: true,
                  HoraSalida: true,
                },
              }),
              this.prisma.jornadasEmpleado.findMany({
                where: {
                  idEmpleado: { in: ids },
                  fecha: grupo.fechaPrisma,
                },
                select: { idEmpleado: true },
              }),
            ]);

            const conJornada = new Set(
              jornadasExistentes.map((j) => j.idEmpleado),
            );
            const horarioPorEmpleado = new Map(
              horarios.map((h) => [h.idEmpleado, h]),
            );

            const faltas = grupo.empleados
              .filter(
                (e) =>
                  horarioPorEmpleado.has(e.idEmpleado) &&
                  !conJornada.has(e.idEmpleado),
              )
              .map((e) => {
                const horario = horarioPorEmpleado.get(e.idEmpleado)!;
                return {
                  idTenant,
                  idEmpresa,
                  idEmpleado: e.idEmpleado,
                  fecha: grupo.fechaPrisma,
                  horaEntradaTeorica: horario.HoraEntrada,
                  horaSalidaTeorica: horario.HoraSalida,
                  minutosTrabajados: 0,
                  minutosRetardo: 0,
                  minutosExtraDobles: 0,
                  minutosExtraTriples: 0,
                  minutosComida: 0,
                  minutosComidaExcedidos: 0,
                  estatusJornada: 'FALTA' as const,
                  revisada: false,
                };
              });

            if (!faltas.length) {
              continue;
            }

            const result = await this.prisma.jornadasEmpleado.createMany({
              data: faltas,
              skipDuplicates: true,
            });
            creadas += result.count;
          }
        }
      }

      this.logger.log(`detectarFaltas: fin — ${creadas} faltas creadas`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `detectarFaltas: error — ${message}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  /**
   * Domingo 02:00: borra del disco evidencias con fechaPurga vencida.
   * Conserva el renglón con rutaArchivo = null (idempotente).
   */
  @Cron('0 2 * * 0')
  async purgarEvidencias(): Promise<void> {
    if (!this.jobsEnabled()) {
      return;
    }

    this.logger.log('purgarEvidencias: inicio');
    let archivos = 0;
    let bytes = 0;

    try {
      const hoy = localDateToPrismaDate(
        localDateString(new Date(), ZONA_HORARIA_DEFAULT),
      );

      let lastId = 0;
      for (;;) {
        const lote = await this.prisma.asistenciaEvidencias.findMany({
          where: {
            fechaPurga: { lte: hoy },
            rutaArchivo: { not: null },
            idEvidencia: { gt: lastId },
          },
          select: {
            idEvidencia: true,
            rutaArchivo: true,
            tamanioBytes: true,
          },
          orderBy: { idEvidencia: 'asc' },
          take: LOTE_EMPLEADOS,
        });

        if (!lote.length) {
          break;
        }
        lastId = lote[lote.length - 1].idEvidencia;

        for (const evidencia of lote) {
          const ruta = evidencia.rutaArchivo;
          if (!ruta) {
            continue;
          }

          const absoluta = this.resolverRutaEvidencia(ruta);
          try {
            await unlink(absoluta);
            archivos += 1;
            bytes += evidencia.tamanioBytes ?? 0;
          } catch (err: unknown) {
            const code =
              err && typeof err === 'object' && 'code' in err
                ? (err as NodeJS.ErrnoException).code
                : undefined;
            if (code !== 'ENOENT') {
              this.logger.warn(
                `purgarEvidencias: no se pudo borrar ${ruta}: ${
                  err instanceof Error ? err.message : String(err)
                }`,
              );
            }
          }

          await this.prisma.asistenciaEvidencias.update({
            where: { idEvidencia: evidencia.idEvidencia },
            data: { rutaArchivo: null },
          });
        }
      }

      this.logger.log(
        `purgarEvidencias: fin — ${archivos} archivos, ${bytes} bytes liberados`,
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `purgarEvidencias: error — ${message}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  /**
   * Lunes 04:00: alerta por exceso de horas legales en la semana ISO anterior.
   * Solo log warn por ahora; el canal de notificación queda pendiente.
   */
  @Cron('0 4 * * 1')
  async alertarLimiteLegal(): Promise<void> {
    if (!this.jobsEnabled()) {
      return;
    }

    this.logger.log('alertarLimiteLegal: inicio');
    let excedidos = 0;

    try {
      const hoyLocal = localDateString(new Date(), ZONA_HORARIA_DEFAULT);
      const { inicio: lunesActual } = isoWeekBounds(hoyLocal);
      const inicioSemanaAnterior = new Date(lunesActual);
      inicioSemanaAnterior.setUTCDate(lunesActual.getUTCDate() - 7);
      const finSemanaAnterior = new Date(lunesActual);
      finSemanaAnterior.setUTCDate(lunesActual.getUTCDate() - 1);

      const anio = inicioSemanaAnterior.getUTCFullYear();
      const configs = await this.prisma.configuracionJornadaLegal.findMany({
        where: { anio, activo: true },
        select: { idEmpresa: true, horasSemana: true },
      });
      const limitePorEmpresa = new Map(
        configs.map((c) => [c.idEmpresa, Number(c.horasSemana)]),
      );

      const sumas = await this.prisma.jornadasEmpleado.groupBy({
        by: ['idEmpleado', 'idEmpresa'],
        where: {
          fecha: {
            gte: inicioSemanaAnterior,
            lte: finSemanaAnterior,
          },
        },
        _sum: { minutosTrabajados: true },
      });

      for (const fila of sumas) {
        const horasLimite = limitePorEmpresa.get(fila.idEmpresa);
        if (horasLimite == null || Number.isNaN(horasLimite)) {
          continue;
        }
        const minutos = fila._sum.minutosTrabajados ?? 0;
        const limiteMinutos = horasLimite * 60;
        if (minutos > limiteMinutos) {
          excedidos += 1;
          this.logger.warn(
            `alertarLimiteLegal: empleado ${fila.idEmpleado} (empresa ${fila.idEmpresa}) ` +
              `trabajó ${minutos} min en la semana ISO anterior; límite ${horasLimite} h (${limiteMinutos} min)`,
          );
          // TODO: notificar a RH / supervisor cuando exista el canal de alertas legales.
        }
      }

      this.logger.log(
        `alertarLimiteLegal: fin — ${excedidos} empleados sobre el límite`,
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `alertarLimiteLegal: error — ${message}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  private resolverRutaEvidencia(rutaArchivo: string): string {
    if (rutaArchivo.startsWith('media/') || rutaArchivo.startsWith('media\\')) {
      return join(process.cwd(), rutaArchivo);
    }
    const mediaRoot =
      this.configService.get<string>('MEDIA_ROOT_PATH') ||
      join(process.cwd(), 'media');
    return join(mediaRoot, rutaArchivo);
  }

  private async resolverZonasEmpleados(
    idsEmpleado: number[],
    empleados: Array<{ idEmpleado: number; idSite: number | null }>,
  ): Promise<Map<number, string>> {
    const resultado = new Map<number, string>();
    if (!idsEmpleado.length) {
      return resultado;
    }

    const principales = await this.prisma.relEmpleadosSites.findMany({
      where: {
        idEmpleado: { in: idsEmpleado },
        Activo: true,
        EsPrincipal: true,
      },
      include: { CatSites: { select: { zonaHoraria: true } } },
    });
    const principalPorEmp = new Map(
      principales.map((p) => [p.idEmpleado, p.CatSites?.zonaHoraria?.trim()]),
    );

    const siteIds = [
      ...new Set(
        empleados
          .map((e) => e.idSite)
          .filter((id): id is number => id != null),
      ),
    ];
    const sites = siteIds.length
      ? await this.prisma.catSites.findMany({
          where: { idSite: { in: siteIds } },
          select: { idSite: true, zonaHoraria: true },
        })
      : [];
    const zonaPorSite = new Map(
      sites.map((s) => [s.idSite, s.zonaHoraria?.trim()]),
    );

    for (const emp of empleados) {
      const zona =
        principalPorEmp.get(emp.idEmpleado) ||
        (emp.idSite != null ? zonaPorSite.get(emp.idSite) : '') ||
        ZONA_HORARIA_DEFAULT;
      resultado.set(emp.idEmpleado, zona || ZONA_HORARIA_DEFAULT);
    }

    return resultado;
  }
}
