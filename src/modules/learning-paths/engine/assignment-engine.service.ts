import {
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { Cron } from '@nestjs/schedule';
import { Prisma } from 'generated/prisma/client';
import {
  COMMS_EVENTO_CURSO,
  COMMS_EVENTO_EMPLEADO,
  HechoCurso,
  HechoEmpleado,
  emitirHecho,
} from 'src/common/events/comms-hechos';
import { hoy as hoyEnZona } from 'src/common/utils/dias-habiles';
import { zonaValida } from 'src/modules/communications/reminders/zona-reloj';
import { localDateString } from 'src/modules/attendance/utils/timezone.util';
import { ConfigurationService } from 'src/modules/configuration/configuration.service';
import { RutasModoAsignacion } from 'src/modules/configuration/training-config';
import { PrismaService } from 'src/prisma/prisma.service';
import { errorRuta } from '../learning-paths.errores';
import { AvisoMotor, avisosDeAsignacion } from './ruta-avisos';
import { RutaAvisosService } from './ruta-avisos.service';
import {
  EmpleadoAlcance,
  ReglaAlcance,
  coincide,
} from '../scope/resolver.service';
import {
  Acreditacion,
  DecisionVersion,
  ModalidadCurso,
  PreviaVersion,
  decidirVersion,
  estadoDeElemento,
  previaDe,
  tieneAvance,
} from './decision-version';
import {
  CursoVersion,
  DiffVersion,
  diaAlmacenado,
  diaPrisma,
  diffCursos,
  sumarDias,
  sumarMeses,
} from './impacto';

const ZONA = 'America/Mexico_City';
const LOTE = 400;
const TERMINALES = new Set(['completado', 'reconocido', 'cancelado']);

type Db = Prisma.TransactionClient;
type Disparador =
  'alta' | 'movimiento' | 'publicacion' | 'recertificacion' | 'manual';

export interface EntradaAsignar {
  idEmpresa: number;
  idTenant?: number | null;
  idEmpleados?: number[];
  idVersion?: number;
  disparador: Disparador;
  fechaBase?: string;
  simular?: boolean;
  creadoPor?: string | null;
}

export interface ResumenAsignacion {
  alcanzados: number;
  yaTienenVigentes: number;
  recibiranSoloNuevos: number;
  recibiranCompleta: number;
  presencialesAProgramar: number;
  diff: DiffVersion;
  grupos: {
    vanALaMitad: number;
    yaCompletaron: number;
    aunNoInician: number;
  };
  modo: RutasModoAsignacion;
  idLote: number | null;
}

interface TrabajoAsignacion {
  resumen: ResumenAsignacion;
  hechos: HechoCurso[];
  avisos: AvisoMotor[];
}

interface ElementoCargado {
  idElemento: number;
  idEtapa: number;
  idCurso: number;
  diaInicio: number;
  diaFin: number;
  obligatorio: boolean;
  vigenciaMeses: number | null;
}

interface VersionCargada {
  idVersion: number;
  idRuta: number;
  numero: number;
  estado: string;
  nombreRuta: string;
  proposito: string;
  idTenant: number | null;
  alcance: ReglaAlcance[];
  elementos: ElementoCargado[];
}

interface EmpleadoCargado {
  idEmpleado: number;
  idTenant: number | null;
  alcance: EmpleadoAlcance;
}

interface FilaPlan {
  idElemento: number;
  idCurso: number;
  fechaLimite: string;
  estado: 'reconocido' | 'inscrito' | 'por_programar';
  motivo: 'SIN_CONTENIDO' | null;
  reconocidoDe: number | null;
  idParticipante: number | null;
}

interface PlanPersona {
  idEmpleado: number;
  idTenant: number | null;
  version: VersionCargada;
  decision: DecisionVersion;
  sustituirId: number | null;
  idAsignacion: number | null;
  filas: FilaPlan[];
}

interface PedidoInscripcion {
  idEmpleado: number;
  idCurso: number;
  fechaLimite: string;
  idTenant: number | null;
  curso: string;
}

const DIFF_VACIO: DiffVersion = {
  agregados: [],
  quitados: [],
  cambiados: [],
  sinCambio: [],
};

@Injectable()
export class AssignmentEngineService {
  private readonly logger = new Logger(AssignmentEngineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configuracion: ConfigurationService,
    @Optional() @Inject(EventEmitter2) private readonly eventos?: EventEmitter2,
    @Optional()
    @Inject(RutaAvisosService)
    private readonly avisos?: RutaAvisosService,
  ) {}

  async asignar(entrada: EntradaAsignar): Promise<ResumenAsignacion> {
    if (entrada.simular) {
      return (await this.correr(this.cliente(), entrada)).resumen;
    }
    const trabajo = await this.prisma.$transaction((tx) =>
      this.correr(tx, entrada),
    );
    this.avisar(trabajo.hechos);
    await this.enviarAvisos(trabajo.avisos);
    return trabajo.resumen;
  }

  /** Misma corrida, sobre la transacción de quien publica. No emite avisos. */
  asignarEn(db: Db, entrada: EntradaAsignar): Promise<TrabajoAsignacion> {
    return this.correr(db, entrada);
  }

  @OnEvent(COMMS_EVENTO_EMPLEADO)
  async onEmpleado(hecho: HechoEmpleado): Promise<void> {
    try {
      if (!hecho?.idEmpresa || !hecho?.idEmpleado || !hecho.tipo) return;
      if (hecho.tipo === 'BAJA') {
        await this.cancelarPorBaja(hecho.idEmpresa, hecho.idEmpleado);
        return;
      }
      if (hecho.tipo !== 'ALTA' && hecho.tipo !== 'MOVIMIENTO') return;
      // Alta y movimiento evalúan el alcance de todas las rutas publicadas,
      // sin filtrar por el propósito de la ruta.
      await this.asignar({
        idEmpresa: hecho.idEmpresa,
        idTenant: hecho.idTenant,
        idEmpleados: [hecho.idEmpleado],
        disparador: hecho.tipo === 'ALTA' ? 'alta' : 'movimiento',
      });
    } catch (error) {
      const texto =
        error instanceof Error ? error.message : 'Error desconocido';
      this.logger.error(
        `Motor de rutas (${hecho?.tipo ?? 'sin tipo'} ${hecho?.idEmpleado ?? ''}): ${texto}`,
      );
    }
  }

  @OnEvent(COMMS_EVENTO_CURSO)
  async onCurso(hecho: HechoCurso): Promise<void> {
    try {
      if (hecho?.tipo !== 'APROBADO') return;
      await this.sincronizarAprobado(hecho);
    } catch (error) {
      const texto =
        error instanceof Error ? error.message : 'Error desconocido';
      this.logger.error(
        `Motor de rutas (aprobado ${hecho?.idEmpleado ?? ''}): ${texto}`,
      );
    }
  }

  @Cron('30 2 * * *', { name: 'rutas-recertificacion', timeZone: ZONA })
  async recertificar(): Promise<void> {
    try {
      await this.renovarVigencias();
    } catch (error) {
      const texto =
        error instanceof Error ? error.message : 'Error desconocido';
      this.logger.error(`Motor de rutas (recertificación): ${texto}`);
    }
  }

  async aplicarLote(entrada: {
    idEmpresa: number;
    idLote: number;
    resueltoPor: string;
  }): Promise<{ idLote: number; inscritos: number }> {
    const hechos: HechoCurso[] = [];
    const resultado = await this.prisma.$transaction((tx) =>
      this.aplicarEn(tx, entrada, hechos),
    );
    this.avisar(hechos);
    await this.enviarAvisos(resultado.avisos);
    return { idLote: resultado.idLote, inscritos: resultado.inscritos };
  }

  async rechazarLote(entrada: {
    idEmpresa: number;
    idLote: number;
    motivo: string;
    resueltoPor: string;
  }): Promise<{ idLote: number }> {
    const lote = await this.prisma.rutaLote.findFirst({
      where: { idLote: entrada.idLote, idEmpresa: entrada.idEmpresa },
    });
    if (!lote)
      throw new NotFoundException('El lote no existe en esta empresa.');
    if (lote.estatus !== 'por_aprobar') {
      throw errorRuta(
        HttpStatus.CONFLICT,
        'LOTE_NO_PENDIENTE',
        'El lote ya no está pendiente de aprobación.',
      );
    }
    await this.prisma.$transaction(async (tx) => {
      const asignaciones = await tx.rutaAsignacion.findMany({
        where: { idLote: lote.idLote, estatus: 'por_aprobar' },
        select: { idAsignacion: true },
      });
      const ids = asignaciones.map((fila) => fila.idAsignacion);
      if (ids.length > 0) {
        await tx.rutaAsignacionCurso.updateMany({
          where: {
            idAsignacion: { in: ids },
            estado: { notIn: ['completado', 'reconocido', 'cancelado'] },
          },
          data: { estado: 'cancelado' },
        });
        await tx.rutaAsignacion.updateMany({
          where: { idAsignacion: { in: ids } },
          data: { estatus: 'cancelada' },
        });
      }
      await tx.rutaLote.update({
        where: { idLote: lote.idLote },
        data: {
          estatus: 'rechazado',
          motivoRechazo: entrada.motivo.trim(),
          resueltoEn: new Date(),
          resueltoPor: entrada.resueltoPor,
        },
      });
    });
    return { idLote: lote.idLote };
  }

  async cancelarPorBaja(idEmpresa: number, idEmpleado: number): Promise<void> {
    const abiertas = await this.prisma.rutaAsignacion.findMany({
      where: {
        idEmpresa,
        idEmpleado,
        estatus: { in: ['activa', 'por_aprobar'] },
      },
      select: { idAsignacion: true },
    });
    const ids = abiertas.map((fila) => fila.idAsignacion);
    if (ids.length === 0) return;
    await this.prisma.rutaAsignacionCurso.updateMany({
      where: {
        idAsignacion: { in: ids },
        estado: { notIn: ['completado', 'reconocido', 'cancelado'] },
      },
      data: { estado: 'cancelado' },
    });
    await this.prisma.rutaAsignacion.updateMany({
      where: { idAsignacion: { in: ids } },
      data: { estatus: 'cancelada' },
    });
  }

  private async correr(
    db: Db,
    entrada: EntradaAsignar,
  ): Promise<TrabajoAsignacion> {
    const config = await this.configuracion.getTrainingConfig(
      entrada.idEmpresa,
    );
    const zona = await this.zonaDe(db, entrada.idEmpresa);
    const hoy = entrada.fechaBase ?? hoyEnZona(zona);
    const modo = config.rutasModoAsignacion;
    const catalogo = await this.catalogo(db, entrada);
    const empleados = await this.empleados(db, entrada);
    const idsEmpleado = empleados.map((empleado) => empleado.idEmpleado);
    const idsCurso = [
      ...new Set(
        catalogo.flatMap((version) =>
          version.elementos.map((el) => el.idCurso),
        ),
      ),
    ];
    const [previas, acreditaciones, modalidades, nombres] = await Promise.all([
      this.previas(db, entrada.idEmpresa, idsEmpleado),
      this.acreditaciones(
        db,
        entrada.idEmpresa,
        idsEmpleado,
        idsCurso,
        catalogo,
        hoy,
      ),
      this.modalidades(db, entrada.idEmpresa, idsCurso),
      this.nombres(db, idsCurso),
    ]);

    const resumen = resumenVacio(modo);
    const alcanzados = new Set<number>();
    const planes: PlanPersona[] = [];
    const objetivo =
      entrada.idVersion != null
        ? catalogo.filter((version) => version.idVersion === entrada.idVersion)
        : catalogo;

    for (const empleado of empleados) {
      const suyas = previas.get(empleado.idEmpleado) ?? [];
      const versiones = this.versionesDe(empleado, objetivo, entrada, suyas);
      if (versiones.length === 0) continue;
      alcanzados.add(empleado.idEmpleado);
      for (const version of versiones) {
        const anteriores = suyas.filter(
          (previa) => previa.idRuta === version.idRuta,
        );
        const previa = previaDe(anteriores, version.idVersion, version.numero);
        const decision = decidirVersion(previa, version.idVersion);
        if (decision === 'omitir') {
          if (previa && previa.idVersion !== version.idVersion) {
            resumen.grupos.vanALaMitad += 1;
          }
          continue;
        }
        const elementos = this.elementosDe(decision, version, catalogo, previa);
        if (decision === 'solo_agregados') {
          resumen.grupos.yaCompletaron += 1;
          resumen.recibiranSoloNuevos += 1;
        } else {
          resumen.grupos.aunNoInician += 1;
        }
        if (elementos.length === 0) continue;
        const filas = elementos.map((elemento) => {
          const decidido = estadoDeElemento({
            acreditacion:
              acreditaciones.get(
                `${empleado.idEmpleado}:${elemento.idCurso}`,
              ) ?? null,
            hoy,
            umbral: config.calificacionAprobatoria,
            modalidad: modalidades.get(elemento.idCurso)?.modalidad ?? null,
            tieneContenido:
              modalidades.get(elemento.idCurso)?.tieneContenido ?? false,
          });
          if (decidido.estado === 'por_programar')
            resumen.presencialesAProgramar += 1;
          const fechaLimite =
            entrada.disparador === 'recertificacion'
              ? hoy
              : sumarDias(hoy, elemento.diaFin);
          return {
            idElemento: elemento.idElemento,
            idCurso: elemento.idCurso,
            fechaLimite,
            estado: decidido.estado,
            motivo: decidido.motivo,
            reconocidoDe: decidido.reconocidoDe,
            idParticipante: null,
          };
        });
        if (filas.every((fila) => fila.estado === 'reconocido')) {
          resumen.yaTienenVigentes += 1;
        } else if (decision !== 'solo_agregados') {
          resumen.recibiranCompleta += 1;
        }
        planes.push({
          idEmpleado: empleado.idEmpleado,
          idTenant:
            version.idTenant ?? empleado.idTenant ?? entrada.idTenant ?? null,
          version,
          decision,
          sustituirId:
            decision === 'sustituir' && previa ? previa.idAsignacion : null,
          idAsignacion: null,
          filas,
        });
      }
    }

    resumen.alcanzados = alcanzados.size;
    resumen.diff =
      entrada.idVersion != null
        ? this.diffDe(catalogo, entrada.idVersion, nombres)
        : DIFF_VACIO;
    if (entrada.simular || planes.length === 0) {
      return { resumen, hechos: [], avisos: [] };
    }

    const hechos: HechoCurso[] = [];
    const lotes = new Map<number, number>();
    if (modo === 'con_aprobacion') {
      const porVersion = new Map<number, PlanPersona[]>();
      for (const plan of planes) {
        const lista = porVersion.get(plan.version.idVersion) ?? [];
        lista.push(plan);
        porVersion.set(plan.version.idVersion, lista);
      }
      for (const [idVersion, lista] of porVersion) {
        const version = lista[0].version;
        const lote = await db.rutaLote.create({
          data: {
            idTenant: version.idTenant,
            idEmpresa: entrada.idEmpresa,
            idRutaAprendizaje: version.idRuta,
            idVersion,
            disparador: entrada.disparador,
            descripcion: describir(entrada.disparador, version.nombreRuta),
            estatus: 'por_aprobar',
            personas: new Set(lista.map((plan) => plan.idEmpleado)).size,
            cursos: new Set(
              lista.flatMap((plan) => plan.filas.map((fila) => fila.idCurso)),
            ).size,
            creadoPor: entrada.creadoPor ?? null,
          },
        });
        lotes.set(idVersion, lote.idLote);
      }
    }

    for (const plan of planes) {
      if (plan.sustituirId != null) {
        await db.rutaAsignacion.update({
          where: { idAsignacion: plan.sustituirId },
          data: { estatus: 'sustituida' },
        });
      }
      const creada = await db.rutaAsignacion.create({
        data: {
          idTenant: plan.idTenant,
          idEmpresa: entrada.idEmpresa,
          idEmpleado: plan.idEmpleado,
          idRutaAprendizaje: plan.version.idRuta,
          idVersion: plan.version.idVersion,
          idLote: lotes.get(plan.version.idVersion) ?? null,
          disparador: entrada.disparador,
          estatus: modo === 'con_aprobacion' ? 'por_aprobar' : 'activa',
          fechaBase: diaPrisma(hoy),
        },
      });
      plan.idAsignacion = creada.idAsignacion;
    }

    if (modo === 'automatica') {
      const pedidos = pedidosDe(planes, nombres);
      const inscritos = await this.inscribir(
        db,
        entrada.idEmpresa,
        pedidos,
        hechos,
      );
      for (const plan of planes) {
        for (const fila of plan.filas) {
          if (fila.estado !== 'inscrito') continue;
          const idParticipante = inscritos.get(
            `${plan.idEmpleado}:${fila.idCurso}`,
          );
          if (idParticipante == null) {
            fila.estado = 'por_programar';
            fila.motivo = 'SIN_CONTENIDO';
            resumen.presencialesAProgramar += 1;
          } else {
            fila.idParticipante = idParticipante;
          }
        }
      }
    }

    await this.guardarFilas(db, planes);
    const idsLote = [...lotes.values()];
    resumen.idLote = idsLote.length === 1 ? idsLote[0] : null;
    resumen.modo = modo;
    return {
      resumen,
      hechos,
      avisos: avisosDeAsignacion({
        idEmpresa: entrada.idEmpresa,
        idTenant: entrada.idTenant ?? null,
        disparador: entrada.disparador,
        modo,
        filas: planes.flatMap((plan) =>
          plan.filas.map((fila) => ({
            idEmpleado: plan.idEmpleado,
            idTenant: plan.idTenant,
            idCurso: fila.idCurso,
            estado: fila.estado,
          })),
        ),
      }),
    };
  }

  private versionesDe(
    empleado: EmpleadoCargado,
    catalogo: VersionCargada[],
    entrada: EntradaAsignar,
    previas: PreviaRuta[],
  ): VersionCargada[] {
    const publicadas = catalogo.filter(
      (version) => version.estado === 'publicada',
    );
    if (
      entrada.disparador === 'publicacion' ||
      entrada.disparador === 'manual'
    ) {
      const version = publicadas.find(
        (fila) => fila.idVersion === entrada.idVersion,
      );
      if (!version) return [];
      if (entrada.disparador === 'manual') return [version];
      return coincide(empleado.alcance, version.alcance) ? [version] : [];
    }
    return publicadas.filter((version) => {
      if (!coincide(empleado.alcance, version.alcance)) return false;
      // En movimiento se omite la ruta que la persona ya tiene. No depende del propósito.
      if (entrada.disparador !== 'movimiento') return true;
      return !previas.some(
        (previa) =>
          previa.idRuta === version.idRuta && previa.estatus !== 'cancelada',
      );
    });
  }

  private elementosDe(
    decision: DecisionVersion,
    version: VersionCargada,
    catalogo: VersionCargada[],
    previa: PreviaVersion | null,
  ): ElementoCargado[] {
    if (decision !== 'solo_agregados' || !previa) return version.elementos;
    const anterior = catalogo.find(
      (fila) => fila.idVersion === previa.idVersion,
    );
    const conocidos = new Set(
      (anterior?.elementos ?? []).map((elemento) => elemento.idCurso),
    );
    return version.elementos.filter(
      (elemento) => !conocidos.has(elemento.idCurso),
    );
  }

  private async aplicarEn(
    db: Db,
    entrada: { idEmpresa: number; idLote: number; resueltoPor: string },
    hechos: HechoCurso[],
  ): Promise<{ idLote: number; inscritos: number; avisos: AvisoMotor[] }> {
    const lote = await db.rutaLote.findFirst({
      where: { idLote: entrada.idLote, idEmpresa: entrada.idEmpresa },
    });
    if (!lote)
      throw new NotFoundException('El lote no existe en esta empresa.');
    if (lote.estatus !== 'por_aprobar') {
      throw errorRuta(
        HttpStatus.CONFLICT,
        'LOTE_NO_PENDIENTE',
        'El lote ya no está pendiente de aprobación.',
      );
    }
    const asignaciones = await db.rutaAsignacion.findMany({
      where: { idLote: lote.idLote, estatus: 'por_aprobar' },
    });
    const ids = asignaciones.map((fila) => fila.idAsignacion);
    const cursos = ids.length
      ? await db.rutaAsignacionCurso.findMany({
          where: { idAsignacion: { in: ids } },
        })
      : [];
    const nombres = await this.nombres(
      db,
      cursos.map((fila) => fila.idCurso),
    );
    const porAsignacion = new Map(
      asignaciones.map((fila) => [fila.idAsignacion, fila]),
    );
    const pedidos: PedidoInscripcion[] = [];
    for (const curso of cursos) {
      if (curso.estado !== 'inscrito') continue;
      const asignacion = porAsignacion.get(curso.idAsignacion);
      if (!asignacion) continue;
      pedidos.push({
        idEmpleado: asignacion.idEmpleado,
        idCurso: curso.idCurso,
        fechaLimite: diaAlmacenado(curso.fechaLimite),
        idTenant: asignacion.idTenant,
        curso: nombres.get(curso.idCurso) ?? `Curso ${curso.idCurso}`,
      });
    }
    const inscritos = await this.inscribir(
      db,
      entrada.idEmpresa,
      pedidos,
      hechos,
    );
    let total = 0;
    const filasAviso: {
      idEmpleado: number;
      idTenant: number | null;
      idCurso: number;
      estado: string;
    }[] = [];
    for (const curso of cursos) {
      const asignacion = porAsignacion.get(curso.idAsignacion);
      if (!asignacion) continue;
      if (
        curso.estado === 'reconocido' ||
        curso.estado === 'completado' ||
        curso.estado === 'cancelado' ||
        curso.estado === 'vencido'
      ) {
        continue;
      }
      let estado = curso.estado;
      if (curso.estado === 'inscrito') {
        const idParticipante = inscritos.get(
          `${asignacion.idEmpleado}:${curso.idCurso}`,
        );
        if (idParticipante == null) {
          await db.rutaAsignacionCurso.update({
            where: { idAsignacionCurso: curso.idAsignacionCurso },
            data: { estado: 'por_programar', idParticipante: null },
          });
          estado = 'por_programar';
        } else {
          await db.rutaAsignacionCurso.update({
            where: { idAsignacionCurso: curso.idAsignacionCurso },
            data: { idParticipante },
          });
          total += 1;
        }
      }
      filasAviso.push({
        idEmpleado: asignacion.idEmpleado,
        idTenant: asignacion.idTenant,
        idCurso: curso.idCurso,
        estado,
      });
    }
    if (ids.length > 0) {
      await db.rutaAsignacion.updateMany({
        where: { idAsignacion: { in: ids } },
        data: { estatus: 'activa' },
      });
    }
    await db.rutaLote.update({
      where: { idLote: lote.idLote },
      data: {
        estatus: 'aplicado',
        resueltoEn: new Date(),
        resueltoPor: entrada.resueltoPor,
      },
    });
    return {
      idLote: lote.idLote,
      inscritos: total,
      avisos: avisosDeAsignacion({
        idEmpresa: entrada.idEmpresa,
        idTenant: lote.idTenant,
        disparador: lote.disparador,
        modo: 'automatica',
        filas: filasAviso,
      }),
    };
  }

  private async inscribir(
    db: Db,
    idEmpresa: number,
    pedidos: PedidoInscripcion[],
    hechos: HechoCurso[],
  ): Promise<Map<string, number>> {
    const resultado = new Map<string, number>();
    const porCurso = new Map<number, PedidoInscripcion[]>();
    for (const pedido of pedidos) {
      const lista = porCurso.get(pedido.idCurso) ?? [];
      const previo = lista.find(
        (fila) => fila.idEmpleado === pedido.idEmpleado,
      );
      if (!previo) lista.push({ ...pedido });
      else if (pedido.fechaLimite < previo.fechaLimite)
        previo.fechaLimite = pedido.fechaLimite;
      porCurso.set(pedido.idCurso, lista);
    }

    for (const [idCurso, lista] of porCurso) {
      const idSesion = await this.sesionPermanente(db, idEmpresa, idCurso);
      if (idSesion == null) continue;
      const ids = lista.map((pedido) => pedido.idEmpleado);
      const existentes = await db.cursoParticipantes.findMany({
        where: { idSesion, idEmpleado: { in: ids } },
      });
      const porEmpleado = new Map(
        existentes.map((fila) => [fila.idEmpleado, fila]),
      );
      const reabiertos = new Set<number>();
      const nuevos: Prisma.CursoParticipantesCreateManyInput[] = [];
      for (const pedido of lista) {
        const ya = porEmpleado.get(pedido.idEmpleado);
        if (!ya) {
          nuevos.push({
            idSesion,
            idEmpleado: pedido.idEmpleado,
            estatusAsignacion: 'inscrito',
            fechaLimite: diaPrisma(pedido.fechaLimite),
          });
          continue;
        }
        const actual = ya.fechaLimite ? diaAlmacenado(ya.fechaLimite) : null;
        const reabrir =
          ya.estatusAsignacion === 'completado' ||
          ya.estatusAsignacion === 'reprobado' ||
          ya.estatusAsignacion === 'no_asistio';
        const limite =
          !actual || pedido.fechaLimite < actual ? pedido.fechaLimite : actual;
        if (reabrir || limite !== actual) {
          await db.cursoParticipantes.update({
            where: { idParticipante: ya.idParticipante },
            data: {
              ...(reabrir ? { estatusAsignacion: 'inscrito' as const } : {}),
              fechaLimite: diaPrisma(limite),
            },
          });
        }
        if (reabrir) reabiertos.add(pedido.idEmpleado);
        resultado.set(`${pedido.idEmpleado}:${idCurso}`, ya.idParticipante);
      }
      if (nuevos.length > 0) {
        await db.cursoParticipantes.createMany({
          data: nuevos,
          skipDuplicates: true,
        });
      }
      const finales = await db.cursoParticipantes.findMany({
        where: { idSesion, idEmpleado: { in: ids } },
      });
      for (const fila of finales) {
        resultado.set(`${fila.idEmpleado}:${idCurso}`, fila.idParticipante);
        const pedido = lista.find(
          (item) => item.idEmpleado === fila.idEmpleado,
        );
        const eraNuevo =
          !porEmpleado.has(fila.idEmpleado) || reabiertos.has(fila.idEmpleado);
        if (!eraNuevo || !pedido) continue;
        hechos.push({
          tipo: 'ASIGNADO',
          idTenant: pedido.idTenant ?? 0,
          idEmpresa,
          idEmpleado: fila.idEmpleado,
          idSesion,
          curso: pedido.curso,
          fechaLimite: diaPrisma(pedido.fechaLimite).toISOString(),
        });
      }
    }
    return resultado;
  }

  private async sesionPermanente(
    db: Db,
    idEmpresa: number,
    idCurso: number,
  ): Promise<number | null> {
    const sesiones = await db.cursoSesiones.findMany({
      where: { idEmpresa, idCurso, estatus: { not: 'cancelado' } },
    });
    const ids = sesiones.map((sesion) => sesion.idSesion);
    const contenidos = ids.length
      ? await db.cursoContenidos.findMany({
          where: { idSesion: { in: ids } },
          select: { idSesion: true },
        })
      : [];
    const conContenido = new Set(contenidos.map((fila) => fila.idSesion));
    if (conContenido.size === 0) return null;
    const permanente = sesiones.find(
      (sesion) =>
        sesion.esPermanente &&
        sesion.modalidad === 'online_asincrono' &&
        conContenido.has(sesion.idSesion),
    );
    if (permanente) return permanente.idSesion;
    const candidata = sesiones.find(
      (sesion) =>
        sesion.modalidad === 'online_asincrono' &&
        conContenido.has(sesion.idSesion),
    );
    if (candidata) {
      await db.cursoSesiones.update({
        where: { idSesion: candidata.idSesion },
        data: {
          esPermanente: true,
          estatus: 'en_curso',
          fechaFinPeriodo: null,
        },
      });
      return candidata.idSesion;
    }
    const hoy = hoyEnZona(await this.zonaDe(db, idEmpresa));
    const creada = await db.cursoSesiones.create({
      data: {
        idCurso,
        idEmpresa,
        modalidad: 'online_asincrono',
        tipoInstructor: 'interno',
        fechaInicioPeriodo: diaPrisma(hoy),
        fechaFinPeriodo: null,
        estatus: 'en_curso',
        esPermanente: true,
      },
    });
    return creada.idSesion;
  }

  private async guardarFilas(db: Db, planes: PlanPersona[]): Promise<void> {
    const data: Prisma.RutaAsignacionCursoCreateManyInput[] = [];
    for (const plan of planes) {
      if (plan.idAsignacion == null) continue;
      for (const fila of plan.filas) {
        data.push({
          idAsignacion: plan.idAsignacion,
          idElemento: fila.idElemento,
          idCurso: fila.idCurso,
          estado: fila.estado,
          idParticipante: fila.idParticipante,
          fechaLimite: diaPrisma(fila.fechaLimite),
          reconocidoDeParticipante: fila.reconocidoDe,
        });
      }
    }
    for (let i = 0; i < data.length; i += LOTE) {
      await db.rutaAsignacionCurso.createMany({
        data: data.slice(i, i + LOTE),
      });
    }
  }

  private async sincronizarAprobado(hecho: HechoCurso): Promise<void> {
    const db = this.cliente();
    const participante = await db.cursoParticipantes.findFirst({
      where: { idSesion: hecho.idSesion, idEmpleado: hecho.idEmpleado },
    });
    if (!participante) return;
    let filas = await db.rutaAsignacionCurso.findMany({
      where: {
        idParticipante: participante.idParticipante,
        estado: { in: ['inscrito', 'por_programar'] },
      },
    });
    if (filas.length === 0) {
      const sesion = await db.cursoSesiones.findFirst({
        where: { idSesion: hecho.idSesion, idEmpresa: hecho.idEmpresa },
      });
      if (!sesion) return;
      const asignaciones = await db.rutaAsignacion.findMany({
        where: {
          idEmpresa: hecho.idEmpresa,
          idEmpleado: hecho.idEmpleado,
          estatus: 'activa',
        },
        select: { idAsignacion: true },
      });
      const ids = asignaciones.map((fila) => fila.idAsignacion);
      filas = ids.length
        ? await db.rutaAsignacionCurso.findMany({
            where: {
              idAsignacion: { in: ids },
              idCurso: sesion.idCurso,
              estado: { in: ['inscrito', 'por_programar'] },
            },
          })
        : [];
    }
    if (filas.length === 0) return;
    const elementos = await db.rutaElemento.findMany({
      where: { idElemento: { in: filas.map((fila) => fila.idElemento) } },
    });
    const porElemento = new Map(
      elementos.map((fila) => [fila.idElemento, fila]),
    );
    const zona = await this.zonaDe(db, hecho.idEmpresa);
    const fechaCompletado = new Date();
    const dia = localDateString(fechaCompletado, zona);
    for (const fila of filas) {
      const meses = porElemento.get(fila.idElemento)?.vigenciaMeses ?? null;
      await db.rutaAsignacionCurso.update({
        where: { idAsignacionCurso: fila.idAsignacionCurso },
        data: {
          estado: 'completado',
          idParticipante: participante.idParticipante,
          fechaCompletado,
          venceVigencia:
            meses == null ? null : diaPrisma(sumarMeses(dia, meses)),
        },
      });
      await this.cerrarSiCompleta(db, fila.idAsignacion);
    }
  }

  private async cerrarSiCompleta(db: Db, idAsignacion: number): Promise<void> {
    const asignacion = await db.rutaAsignacion.findFirst({
      where: { idAsignacion },
    });
    if (!asignacion || asignacion.estatus !== 'activa') return;
    const cursos = await db.rutaAsignacionCurso.findMany({
      where: { idAsignacion },
    });
    const elementos = await db.rutaElemento.findMany({
      where: { idElemento: { in: cursos.map((fila) => fila.idElemento) } },
    });
    const obligatorio = new Map(
      elementos.map((fila) => [fila.idElemento, fila.obligatorio]),
    );
    const pendientes = cursos.filter(
      (curso) =>
        obligatorio.get(curso.idElemento) === true &&
        !TERMINALES.has(curso.estado),
    );
    if (pendientes.length > 0) return;
    await db.rutaAsignacion.update({
      where: { idAsignacion },
      data: { estatus: 'completada', fechaCompletada: new Date() },
    });
  }

  private async renovarVigencias(ahora = new Date()): Promise<void> {
    const empresas = await this.prisma.rutaAsignacion.findMany({
      where: { estatus: { in: ['activa', 'completada'] } },
      select: { idEmpresa: true },
      distinct: ['idEmpresa'],
    });
    const vistas = new Set<number>();
    for (const empresa of empresas) {
      if (vistas.has(empresa.idEmpresa)) continue;
      vistas.add(empresa.idEmpresa);
      try {
        await this.renovarEmpresa(empresa.idEmpresa, ahora);
      } catch (error) {
        const texto =
          error instanceof Error ? error.message : 'Error desconocido';
        this.logger.error(
          `Motor de rutas (vigencia ${empresa.idEmpresa}): ${texto}`,
        );
      }
    }
  }

  private async renovarEmpresa(idEmpresa: number, ahora: Date): Promise<void> {
    const config = await this.configuracion.getTrainingConfig(idEmpresa);
    const zona = await this.zonaDe(this.cliente(), idEmpresa);
    const hoy = localDateString(ahora, zona);
    const limite = sumarDias(hoy, config.vigenciaVentanaDias);
    const hechos: HechoCurso[] = [];
    let avisosRenovacion: AvisoMotor[] = [];
    await this.prisma.$transaction(async (tx) => {
      const asignaciones = await tx.rutaAsignacion.findMany({
        where: { idEmpresa, estatus: { in: ['activa', 'completada'] } },
      });
      const ids = asignaciones.map((fila) => fila.idAsignacion);
      if (ids.length === 0) return;
      const cursos = await tx.rutaAsignacionCurso.findMany({
        where: {
          idAsignacion: { in: ids },
          estado: { in: ['completado', 'reconocido', 'vencido'] },
        },
      });
      const abiertos = await tx.rutaAsignacionCurso.findMany({
        where: {
          idAsignacion: { in: ids },
          estado: { in: ['inscrito', 'por_programar'] },
        },
        select: { idAsignacion: true, idCurso: true },
      });
      const ya = new Set(
        abiertos.map((fila) => `${fila.idAsignacion}:${fila.idCurso}`),
      );
      const porAsignacion = new Map(
        asignaciones.map((fila) => [fila.idAsignacion, fila]),
      );
      const nombres = await this.nombres(
        tx,
        cursos.map((fila) => fila.idCurso),
      );
      const porRenovar = cursos.filter((fila) => {
        if (!fila.venceVigencia) return false;
        if (diaAlmacenado(fila.venceVigencia) > limite) return false;
        return !ya.has(`${fila.idAsignacion}:${fila.idCurso}`);
      });
      const pedidos: PedidoInscripcion[] = [];
      const planes: {
        idAsignacion: number;
        idElemento: number;
        idCurso: number;
        fechaLimite: string;
      }[] = [];
      for (const fila of porRenovar) {
        const asignacion = porAsignacion.get(fila.idAsignacion);
        if (!asignacion || !fila.venceVigencia) continue;
        const fechaLimite = diaAlmacenado(fila.venceVigencia);
        if (asignacion.estatus === 'completada') {
          await tx.rutaAsignacion.update({
            where: { idAsignacion: asignacion.idAsignacion },
            data: { estatus: 'activa', fechaCompletada: null },
          });
          asignacion.estatus = 'activa';
        }
        planes.push({
          idAsignacion: fila.idAsignacion,
          idElemento: fila.idElemento,
          idCurso: fila.idCurso,
          fechaLimite,
        });
        pedidos.push({
          idEmpleado: asignacion.idEmpleado,
          idCurso: fila.idCurso,
          fechaLimite,
          idTenant: asignacion.idTenant,
          curso: nombres.get(fila.idCurso) ?? `Curso ${fila.idCurso}`,
        });
        ya.add(`${fila.idAsignacion}:${fila.idCurso}`);
      }
      const inscritos = await this.inscribir(tx, idEmpresa, pedidos, hechos);
      const data: Prisma.RutaAsignacionCursoCreateManyInput[] = planes.map(
        (plan) => {
          const asignacion = porAsignacion.get(plan.idAsignacion);
          const idParticipante = asignacion
            ? inscritos.get(`${asignacion.idEmpleado}:${plan.idCurso}`)
            : undefined;
          return {
            idAsignacion: plan.idAsignacion,
            idElemento: plan.idElemento,
            idCurso: plan.idCurso,
            estado: idParticipante == null ? 'por_programar' : 'inscrito',
            idParticipante: idParticipante ?? null,
            fechaLimite: diaPrisma(plan.fechaLimite),
          };
        },
      );
      if (data.length > 0) await tx.rutaAsignacionCurso.createMany({ data });
      avisosRenovacion = avisosDeAsignacion({
        idEmpresa,
        idTenant: null,
        disparador: 'recertificacion',
        modo: 'automatica',
        filas: planes.flatMap((plan) => {
          const asignacion = porAsignacion.get(plan.idAsignacion);
          if (!asignacion) return [];
          const idParticipante = inscritos.get(
            `${asignacion.idEmpleado}:${plan.idCurso}`,
          );
          return [
            {
              idEmpleado: asignacion.idEmpleado,
              idTenant: asignacion.idTenant,
              idCurso: plan.idCurso,
              estado: idParticipante == null ? 'por_programar' : 'inscrito',
            },
          ];
        }),
      });
      const vencidos = cursos
        .filter(
          (fila) =>
            fila.venceVigencia &&
            diaAlmacenado(fila.venceVigencia) < hoy &&
            (fila.estado === 'completado' || fila.estado === 'reconocido'),
        )
        .map((fila) => fila.idAsignacionCurso);
      if (vencidos.length > 0) {
        await tx.rutaAsignacionCurso.updateMany({
          where: { idAsignacionCurso: { in: vencidos } },
          data: { estado: 'vencido' },
        });
      }
    });
    this.avisar(hechos);
    await this.enviarAvisos(avisosRenovacion);
  }

  private async catalogo(
    db: Db,
    entrada: EntradaAsignar,
  ): Promise<VersionCargada[]> {
    const rutas = await db.rutaAprendizaje.findMany({
      where: { idEmpresa: entrada.idEmpresa, activo: true },
    });
    const idsRuta = rutas.map((ruta) => ruta.idRutaAprendizaje);
    if (idsRuta.length === 0) return [];
    const versiones = await db.rutaVersion.findMany({
      where: { idRutaAprendizaje: { in: idsRuta } },
    });
    const idsVersion = versiones.map((version) => version.idVersion);
    if (idsVersion.length === 0) return [];
    const [alcances, etapas, elementos] = await Promise.all([
      db.rutaAlcance.findMany({ where: { idVersion: { in: idsVersion } } }),
      db.rutaEtapa.findMany({ where: { idVersion: { in: idsVersion } } }),
      db.rutaElemento.findMany({ where: { idVersion: { in: idsVersion } } }),
    ]);
    const porRuta = new Map(
      rutas.map((ruta) => [ruta.idRutaAprendizaje, ruta]),
    );
    const etapasPorVersion = new Map<number, typeof etapas>();
    for (const etapa of etapas) {
      const lista = etapasPorVersion.get(etapa.idVersion) ?? [];
      lista.push(etapa);
      etapasPorVersion.set(etapa.idVersion, lista);
    }
    return versiones.flatMap((version) => {
      const ruta = porRuta.get(version.idRutaAprendizaje);
      if (!ruta) return [];
      const dias = new Map(
        (etapasPorVersion.get(version.idVersion) ?? []).map((etapa) => [
          etapa.idEtapa,
          etapa,
        ]),
      );
      return [
        {
          idVersion: version.idVersion,
          idRuta: ruta.idRutaAprendizaje,
          numero: version.numero,
          estado: version.estado,
          nombreRuta: ruta.nombre,
          proposito: ruta.proposito,
          idTenant: ruta.idTenant,
          alcance: alcances
            .filter((regla) => regla.idVersion === version.idVersion)
            .map((regla) => ({
              modo: regla.modo,
              idUnidadOperativa: regla.idUnidadOperativa,
              estado: regla.estado,
              idSite: regla.idSite,
              idPuesto: regla.idPuesto,
              idArea: regla.idArea,
            })),
          elementos: elementos
            .filter((elemento) => elemento.idVersion === version.idVersion)
            .flatMap((elemento) => {
              const etapa = dias.get(elemento.idEtapa);
              if (!etapa) return [];
              return [
                {
                  idElemento: elemento.idElemento,
                  idEtapa: elemento.idEtapa,
                  idCurso: elemento.idCurso,
                  diaInicio: etapa.diaInicio,
                  diaFin: etapa.diaFin,
                  obligatorio: elemento.obligatorio,
                  vigenciaMeses: elemento.vigenciaMeses,
                },
              ];
            }),
        },
      ];
    });
  }

  private async empleados(
    db: Db,
    entrada: EntradaAsignar,
  ): Promise<EmpleadoCargado[]> {
    const filas = await db.empleados.findMany({
      where: {
        idEmpresa: entrada.idEmpresa,
        activo: true,
        ...(entrada.idEmpleados
          ? { idEmpleado: { in: entrada.idEmpleados } }
          : {}),
      },
    });
    if (filas.length === 0) return [];
    const ids = filas.map((fila) => fila.idEmpleado);
    const puestos = [
      ...new Set(
        filas
          .map((fila) => fila.idPuesto)
          .filter((id): id is number => id != null),
      ),
    ];
    const principales = await db.relEmpleadosSites.findMany({
      where: {
        idEmpresa: entrada.idEmpresa,
        EsPrincipal: true,
        Activo: true,
        idEmpleado: { in: ids },
      },
      orderBy: { FechaAsignacion: 'desc' },
    });
    const areas = puestos.length
      ? await db.catPuestos.findMany({
          where: { idPuesto: { in: puestos } },
          select: { idPuesto: true, idArea: true },
        })
      : [];
    const sitePrincipal = new Map<number, number>();
    for (const fila of principales) {
      if (!sitePrincipal.has(fila.idEmpleado))
        sitePrincipal.set(fila.idEmpleado, fila.idSite);
    }
    const idsSite = [
      ...new Set(
        filas
          .map((fila) => sitePrincipal.get(fila.idEmpleado) ?? fila.idSite)
          .filter((id): id is number => id != null),
      ),
    ];
    const sites = idsSite.length
      ? await db.catSites.findMany({ where: { idSite: { in: idsSite } } })
      : [];
    const porSite = new Map(sites.map((site) => [site.idSite, site]));
    const areaDe = new Map(
      areas.map((puesto) => [puesto.idPuesto, puesto.idArea]),
    );
    return filas.map((fila) => {
      const idSite = sitePrincipal.get(fila.idEmpleado) ?? fila.idSite ?? null;
      const site = idSite == null ? null : porSite.get(idSite);
      return {
        idEmpleado: fila.idEmpleado,
        idTenant: fila.idTenant,
        alcance: {
          idEmpresa: entrada.idEmpresa,
          idPuesto: fila.idPuesto,
          idArea:
            fila.idPuesto != null ? (areaDe.get(fila.idPuesto) ?? null) : null,
          idSite,
          idUnidadOperativa: site?.idUnidadOperativa ?? null,
          estado: site?.Estado ?? null,
        },
      };
    });
  }

  private async previas(
    db: Db,
    idEmpresa: number,
    idsEmpleado: number[],
  ): Promise<Map<number, PreviaRuta[]>> {
    const mapa = new Map<number, PreviaRuta[]>();
    if (idsEmpleado.length === 0) return mapa;
    const asignaciones = await db.rutaAsignacion.findMany({
      where: { idEmpresa, idEmpleado: { in: idsEmpleado } },
    });
    const ids = asignaciones.map((fila) => fila.idAsignacion);
    const [cursos, versiones] = await Promise.all([
      ids.length
        ? db.rutaAsignacionCurso.findMany({
            where: { idAsignacion: { in: ids } },
          })
        : Promise.resolve([]),
      db.rutaVersion.findMany({
        where: {
          idVersion: {
            in: [...new Set(asignaciones.map((fila) => fila.idVersion))],
          },
        },
      }),
    ]);
    const numero = new Map(
      versiones.map((version) => [version.idVersion, version.numero]),
    );
    const estados = new Map<number, string[]>();
    for (const curso of cursos) {
      const lista = estados.get(curso.idAsignacion) ?? [];
      lista.push(curso.estado);
      estados.set(curso.idAsignacion, lista);
    }
    for (const fila of asignaciones) {
      const lista = mapa.get(fila.idEmpleado) ?? [];
      lista.push({
        idAsignacion: fila.idAsignacion,
        idVersion: fila.idVersion,
        idRuta: fila.idRutaAprendizaje,
        numero: numero.get(fila.idVersion) ?? 0,
        estatus: fila.estatus,
        conAvance: tieneAvance(estados.get(fila.idAsignacion) ?? []),
      });
      mapa.set(fila.idEmpleado, lista);
    }
    return mapa;
  }

  private async acreditaciones(
    db: Db,
    idEmpresa: number,
    idsEmpleado: number[],
    idsCurso: number[],
    catalogo: VersionCargada[],
    hoy: string,
  ): Promise<Map<string, Acreditacion>> {
    const mapa = new Map<string, Acreditacion>();
    if (idsEmpleado.length === 0 || idsCurso.length === 0) return mapa;
    const sesiones = await db.cursoSesiones.findMany({
      where: { idEmpresa, idCurso: { in: idsCurso } },
    });
    const idsSesion = sesiones.map((sesion) => sesion.idSesion);
    if (idsSesion.length === 0) return mapa;
    const cursoDe = new Map(
      sesiones.map((sesion) => [sesion.idSesion, sesion.idCurso]),
    );
    const participantes = await db.cursoParticipantes.findMany({
      where: {
        idEmpleado: { in: idsEmpleado },
        idSesion: { in: idsSesion },
        estatusAsignacion: 'completado',
      },
    });
    const ids = participantes.map((fila) => fila.idParticipante);
    const seguimientos = ids.length
      ? await db.cursoSeguimientoParticipante.findMany({
          where: { idParticipante: { in: ids } },
        })
      : [];
    const conclusion = new Map(
      seguimientos.map((fila) => [fila.idParticipante, fila.fechaConclusion]),
    );
    const vigencia = new Map<number, number | null>();
    for (const version of catalogo) {
      for (const elemento of version.elementos) {
        const previa = vigencia.get(elemento.idCurso);
        if (previa === undefined)
          vigencia.set(elemento.idCurso, elemento.vigenciaMeses);
        else if (
          elemento.vigenciaMeses != null &&
          (previa == null || elemento.vigenciaMeses < previa)
        ) {
          vigencia.set(elemento.idCurso, elemento.vigenciaMeses);
        }
      }
    }
    const zona = await this.zonaDe(db, idEmpresa);
    for (const fila of participantes) {
      const idCurso = cursoDe.get(fila.idSesion);
      if (idCurso == null) continue;
      const meses = vigencia.get(idCurso);
      const cierre =
        conclusion.get(fila.idParticipante) ?? fila.creadoEn ?? new Date();
      const vence =
        meses == null ? null : sumarMeses(localDateString(cierre, zona), meses);
      const calificacion =
        fila.calificacionFinal == null ? null : Number(fila.calificacionFinal);
      const clave = `${fila.idEmpleado}:${idCurso}`;
      const actual = mapa.get(clave);
      const candidata = {
        idParticipante: fila.idParticipante,
        calificacion: Number.isFinite(calificacion) ? calificacion : null,
        vence,
      };
      if (!actual || mejorAcreditacion(candidata, actual, hoy))
        mapa.set(clave, candidata);
    }
    return mapa;
  }

  private async modalidades(
    db: Db,
    idEmpresa: number,
    idsCurso: number[],
  ): Promise<
    Map<number, { modalidad: ModalidadCurso | null; tieneContenido: boolean }>
  > {
    const mapa = new Map<
      number,
      { modalidad: ModalidadCurso | null; tieneContenido: boolean }
    >();
    if (idsCurso.length === 0) return mapa;
    const sesiones = await db.cursoSesiones.findMany({
      where: {
        idEmpresa,
        idCurso: { in: idsCurso },
        estatus: { not: 'cancelado' },
      },
    });
    const ids = sesiones.map((sesion) => sesion.idSesion);
    const contenidos = ids.length
      ? await db.cursoContenidos.findMany({
          where: { idSesion: { in: ids } },
          select: { idSesion: true },
        })
      : [];
    const conContenido = new Set(contenidos.map((fila) => fila.idSesion));
    const ordenadas = [...sesiones].sort(
      (a, b) => tiempo(b.creadoEn) - tiempo(a.creadoEn),
    );
    for (const idCurso of idsCurso) {
      const delCurso = ordenadas.filter((sesion) => sesion.idCurso === idCurso);
      const ultima = delCurso[0];
      mapa.set(idCurso, {
        modalidad: ultima?.modalidad ?? null,
        tieneContenido: delCurso.some((sesion) =>
          conContenido.has(sesion.idSesion),
        ),
      });
    }
    return mapa;
  }

  private async nombres(
    db: Db,
    idsCurso: number[],
  ): Promise<Map<number, string>> {
    const unicos = [...new Set(idsCurso)];
    if (unicos.length === 0) return new Map();
    const cursos = await db.catCursos.findMany({
      where: { idCursos: { in: unicos } },
    });
    return new Map(
      cursos.map((curso) => [
        curso.idCursos,
        curso.Descripcion?.trim() || `Curso ${curso.idCursos}`,
      ]),
    );
  }

  private diffDe(
    catalogo: VersionCargada[],
    idVersion: number,
    nombres: Map<number, string>,
  ): DiffVersion {
    const actual = catalogo.find((version) => version.idVersion === idVersion);
    if (!actual) return DIFF_VACIO;
    const anterior = catalogo
      .filter(
        (version) =>
          version.idRuta === actual.idRuta && version.numero < actual.numero,
      )
      .sort((a, b) => b.numero - a.numero)[0];
    return diffCursos(
      (anterior?.elementos ?? []).map((elemento) => ficha(elemento, nombres)),
      actual.elementos.map((elemento) => ficha(elemento, nombres)),
    );
  }

  private async zonaDe(db: Db, idEmpresa: number): Promise<string> {
    const principal = await db.catSites.findFirst({
      where: { idEmpresa, EsPrincipal: true },
    });
    if (principal?.zonaHoraria) return zonaValida(principal.zonaHoraria);
    const sitio = await db.catSites.findFirst({ where: { idEmpresa } });
    return zonaValida(sitio?.zonaHoraria || ZONA);
  }

  private async enviarAvisos(avisos: AvisoMotor[]): Promise<void> {
    if (!this.avisos || avisos.length === 0) return;
    try {
      await this.avisos.despachar(avisos);
    } catch (error) {
      const texto =
        error instanceof Error ? error.message : 'Error desconocido';
      this.logger.error(`Avisos de rutas: ${texto}`);
    }
  }

  private avisar(hechos: HechoCurso[]): void {
    for (const hecho of hechos) {
      emitirHecho(this.eventos, COMMS_EVENTO_CURSO, hecho);
    }
  }

  private cliente(): Db {
    return this.prisma;
  }
}

interface PreviaRuta extends PreviaVersion {
  idRuta: number;
}

function resumenVacio(modo: RutasModoAsignacion): ResumenAsignacion {
  return {
    alcanzados: 0,
    yaTienenVigentes: 0,
    recibiranSoloNuevos: 0,
    recibiranCompleta: 0,
    presencialesAProgramar: 0,
    diff: DIFF_VACIO,
    grupos: { vanALaMitad: 0, yaCompletaron: 0, aunNoInician: 0 },
    modo,
    idLote: null,
  };
}

function describir(disparador: Disparador, nombre: string): string {
  const texto =
    disparador === 'publicacion'
      ? `Publicación de ${nombre}`
      : disparador === 'alta'
        ? 'Alta de empleado'
        : disparador === 'movimiento'
          ? 'Movimiento de empleado'
          : disparador === 'recertificacion'
            ? 'Recertificación'
            : 'Asignación manual';
  return texto.slice(0, 255);
}

function pedidosDe(
  planes: PlanPersona[],
  nombres: Map<number, string>,
): PedidoInscripcion[] {
  const pedidos: PedidoInscripcion[] = [];
  for (const plan of planes) {
    for (const fila of plan.filas) {
      if (fila.estado !== 'inscrito') continue;
      pedidos.push({
        idEmpleado: plan.idEmpleado,
        idCurso: fila.idCurso,
        fechaLimite: fila.fechaLimite,
        idTenant: plan.idTenant,
        curso: nombres.get(fila.idCurso) ?? `Curso ${fila.idCurso}`,
      });
    }
  }
  return pedidos;
}

function ficha(
  elemento: ElementoCargado,
  nombres: Map<number, string>,
): CursoVersion {
  return {
    idCurso: elemento.idCurso,
    nombre: nombres.get(elemento.idCurso) ?? `Curso ${elemento.idCurso}`,
    diaInicio: elemento.diaInicio,
    diaFin: elemento.diaFin,
    obligatorio: elemento.obligatorio,
    vigenciaMeses: elemento.vigenciaMeses,
  };
}

function mejorAcreditacion(
  nueva: Acreditacion,
  actual: Acreditacion,
  hoy: string,
): boolean {
  const nuevaVigente = nueva.vence == null || nueva.vence >= hoy;
  const actualVigente = actual.vence == null || actual.vence >= hoy;
  if (nuevaVigente !== actualVigente) return nuevaVigente;
  if (nueva.vence == null) return actual.vence != null;
  if (actual.vence == null) return false;
  return nueva.vence > actual.vence;
}

function tiempo(valor: Date | null | undefined): number {
  return valor instanceof Date ? valor.getTime() : 0;
}
