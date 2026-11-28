import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { hoy as hoyEnZona } from 'src/common/utils/dias-habiles';
import { zonaValida } from 'src/modules/communications/reminders/zona-reloj';
import { ConfigurationService } from 'src/modules/configuration/configuration.service';
import { DestinoNotificacion } from 'src/modules/communications/notification-center/destino';
import { NotificationDispatcher } from 'src/modules/notifications/notification.dispatcher';
import { PrismaService } from 'src/prisma/prisma.service';
import { diaAlmacenado } from './impacto';
import { AvisoMotor, diasHasta, textoVence, umbralAviso } from './ruta-avisos';

const ZONA = 'America/Mexico_City';
const MODULO_RH = 'training-pending';
const CANAL_EMPLEADO = [
  { codigo: 'PUSH' as const, enviarAhora: true },
  { codigo: 'SOCKETS' as const, enviarAhora: true },
];
const CANAL_RH = [{ codigo: 'SOCKETS' as const, enviarAhora: true }];

@Injectable()
export class RutaAvisosService {
  private readonly logger = new Logger(RutaAvisosService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configuracion: ConfigurationService,
    private readonly avisos: NotificationDispatcher,
  ) {}

  async despachar(lista: AvisoMotor[]): Promise<void> {
    try {
      const aprobar = new Set<number>();
      const programar = new Set<number>();
      for (const aviso of lista) {
        if (aviso.tipo === 'cursos_nuevos') await this.cursosNuevos(aviso);
        else if (aviso.tipo === 'por_aprobar') aprobar.add(aviso.idEmpresa);
        else programar.add(aviso.idEmpresa);
      }
      for (const idEmpresa of aprobar) await this.porAprobar(idEmpresa);
      for (const idEmpresa of programar) await this.porProgramar(idEmpresa);
    } catch (error) {
      this.logger.error(`Avisos de rutas: ${textoError(error)}`);
    }
  }

  async enRiesgo(entrada: {
    idEmpresa: number;
    idEmpleado: number;
    puesto: string;
  }): Promise<void> {
    await this.alEmpleado(entrada.idEmpresa, entrada.idEmpleado, {
      titulo: 'Tu plan de carrera está en riesgo',
      mensaje: `Venció un curso obligatorio de ${entrada.puesto}. Renuévalo para no regresar a preparación.`,
      destino: { tipo: 'MI_PLAN_CARRERA' },
      origenTipo: 'PLAN_CARRERA',
      origenId: `riesgo:${entrada.idEmpleado}`.slice(0, 40),
      clave: `plan-riesgo:${entrada.idEmpleado}`,
    });
  }

  async nominado(entrada: {
    idEmpresa: number;
    idEmpleado: number;
    puesto: string;
  }): Promise<void> {
    await this.alEmpleado(entrada.idEmpresa, entrada.idEmpleado, {
      titulo: `Te nominaron a ${entrada.puesto}`,
      mensaje: `Te nominaron a ${entrada.puesto}. RH está revisando tu movimiento.`,
      destino: { tipo: 'MI_PLAN_CARRERA' },
      origenTipo: 'PLAN_CARRERA',
      origenId: `nominado:${entrada.idEmpleado}`.slice(0, 40),
      clave: `plan-nominado:${entrada.idEmpleado}`,
    });
  }

  async promovido(entrada: {
    idEmpresa: number;
    idEmpleado: number;
    puesto: string;
  }): Promise<void> {
    await this.alEmpleado(entrada.idEmpresa, entrada.idEmpleado, {
      titulo: `¡Felicidades! Ahora eres ${entrada.puesto}`,
      mensaje: `¡Felicidades! Ahora eres ${entrada.puesto}.`,
      destino: { tipo: 'MI_PLAN_CARRERA' },
      origenTipo: 'PLAN_CARRERA',
      origenId: `promovido:${entrada.idEmpleado}`.slice(0, 40),
      clave: `plan-promovido:${entrada.idEmpleado}`,
    });
  }

  @Cron('20 8 * * *', {
    name: 'rutas-avisos-diarios',
    timeZone: ZONA,
  })
  async avisosDiarios(): Promise<void> {
    try {
      const empresas = await this.prisma.rutaAsignacion.findMany({
        where: {
          OR: [
            { estatus: 'por_aprobar' },
            {
              estatus: 'activa',
              Cursos: { some: { estado: 'por_programar' } },
            },
          ],
        },
        select: { idEmpresa: true },
        distinct: ['idEmpresa'],
      });
      for (const empresa of empresas) {
        await this.porAprobar(empresa.idEmpresa);
        await this.porProgramar(empresa.idEmpresa);
      }
    } catch (error) {
      this.logger.error(`Avisos diarios de rutas: ${textoError(error)}`);
    }
  }

  @Cron('0 9 * * *', {
    name: 'rutas-avisos-vigencia',
    timeZone: ZONA,
  })
  async avisarVigencias(): Promise<void> {
    try {
      const empresas = await this.prisma.rutaAsignacion.findMany({
        where: { estatus: { in: ['activa', 'completada'] } },
        select: { idEmpresa: true },
        distinct: ['idEmpresa'],
      });
      const vistas = new Set<number>();
      for (const empresa of empresas) {
        if (vistas.has(empresa.idEmpresa)) continue;
        vistas.add(empresa.idEmpresa);
        await this.vigenciasDe(empresa.idEmpresa);
      }
    } catch (error) {
      this.logger.error(`Avisos de vigencia: ${textoError(error)}`);
    }
  }

  private async cursosNuevos(
    aviso: Extract<AvisoMotor, { tipo: 'cursos_nuevos' }>,
  ): Promise<void> {
    const cursos = aviso.cursos;
    const mensaje =
      cursos === 1
        ? 'Se agregó 1 curso a tu ruta de aprendizaje.'
        : `Se agregaron ${cursos} cursos a tu ruta de aprendizaje.`;
    await this.alEmpleado(aviso.idEmpresa, aviso.idEmpleado, {
      titulo: 'Tienes cursos nuevos en tu ruta',
      mensaje,
      destino: { tipo: 'MI_RUTA' },
      origenTipo: 'RUTA',
      origenId:
        `nuevos:${aviso.idEmpleado}:${aviso.disparador}:${Date.now()}`.slice(
          0,
          40,
        ),
      clave: `ruta-nueva:${aviso.idEmpleado}:${aviso.disparador}`,
      idTenant: aviso.idTenant,
    });
  }

  private async porAprobar(idEmpresa: number): Promise<void> {
    try {
      const cantidad = await this.prisma.rutaAsignacion.count({
        where: { idEmpresa, estatus: 'por_aprobar' },
      });
      if (cantidad === 0) return;
      const mensaje = `Hay ${cantidad} ${cantidad === 1 ? 'asignación' : 'asignaciones'} por aprobar.`;
      await this.aRh(idEmpresa, 'RAPR', 'Asignaciones por aprobar', mensaje);
    } catch (error) {
      this.logger.error(
        `Aviso de asignaciones por aprobar (${idEmpresa}): ${textoError(error)}`,
      );
    }
  }

  private async porProgramar(idEmpresa: number): Promise<void> {
    try {
      const cantidad = await this.prisma.rutaAsignacionCurso.count({
        where: {
          estado: 'por_programar',
          RutaAsignacion: { idEmpresa, estatus: 'activa' },
        },
      });
      if (cantidad === 0) return;
      const mensaje = `Hay ${cantidad} ${cantidad === 1 ? 'curso' : 'cursos'} por programar.`;
      await this.aRh(idEmpresa, 'RPRG', 'Cursos por programar', mensaje);
    } catch (error) {
      this.logger.error(
        `Aviso de cursos por programar (${idEmpresa}): ${textoError(error)}`,
      );
    }
  }

  private async vigenciasDe(idEmpresa: number): Promise<void> {
    try {
      const config = await this.configuracion.getTrainingConfig(idEmpresa);
      const zona = await this.zonaDe(idEmpresa);
      const dia = hoyEnZona(zona);
      const cursos = await this.prisma.rutaAsignacionCurso.findMany({
        where: {
          estado: { in: ['completado', 'reconocido'] },
          venceVigencia: { not: null },
          RutaAsignacion: {
            idEmpresa,
            estatus: { in: ['activa', 'completada'] },
          },
        },
        include: {
          CatCursos: { select: { Descripcion: true } },
          RutaAsignacion: {
            select: { idEmpleado: true, idTenant: true },
          },
        },
      });
      for (const curso of cursos) {
        if (!curso.venceVigencia) continue;
        const dias = diasHasta(dia, diaAlmacenado(curso.venceVigencia));
        const umbral = umbralAviso(dias, config.vigenciaAvisosDias);
        if (umbral == null) continue;
        const referencia = `c${curso.idAsignacionCurso}:u${umbral}`;
        const idEmpleado = curso.RutaAsignacion.idEmpleado;
        const ya = await this.prisma.comRecordatoriosEnviados.findFirst({
          where: {
            idEmpresa,
            Codigo: 'RVIG',
            idEmpleado,
            Referencia: referencia,
          },
          select: { id: true },
        });
        if (ya) continue;
        const nombre =
          curso.CatCursos.Descripcion?.trim() || `Curso ${curso.idCurso}`;
        const titulo = textoVence(dias);
        await this.alEmpleado(idEmpresa, idEmpleado, {
          titulo,
          mensaje: `${nombre}. ${titulo}.`,
          destino: { tipo: 'MI_RUTA' },
          origenTipo: 'RUTA',
          origenId: `vig:${curso.idAsignacionCurso}:${umbral}`.slice(0, 40),
          clave: `ruta-vence:${curso.idCurso}:${umbral}`,
          idTenant: curso.RutaAsignacion.idTenant,
        });
        await this.prisma.comRecordatoriosEnviados.create({
          data: {
            idEmpresa,
            Codigo: 'RVIG',
            idEmpleado,
            Referencia: referencia,
            Intento: 1,
          },
        });
      }
    } catch (error) {
      this.logger.error(
        `Avisos de vigencia de la empresa ${idEmpresa}: ${textoError(error)}`,
      );
    }
  }

  private async aRh(
    idEmpresa: number,
    codigo: string,
    titulo: string,
    mensaje: string,
  ): Promise<void> {
    const empresa = await this.prisma.catEmpresas.findUnique({
      where: { idEmpresa },
      select: { idTenant: true },
    });
    const idTenant = empresa?.idTenant ?? null;
    if (idTenant == null) return;
    const personal = await this.personalRh(idEmpresa, idTenant);
    if (personal.length === 0) {
      this.logger.warn(
        `Sin personal de RH para el aviso ${codigo} de la empresa ${idEmpresa}.`,
      );
      return;
    }
    const dia = hoyEnZona(await this.zonaDe(idEmpresa));
    const ya = new Set(
      (
        await this.prisma.comRecordatoriosEnviados.findMany({
          where: {
            idEmpresa,
            Codigo: codigo,
            Referencia: dia,
            idEmpleado: { in: personal.map((persona) => persona.idEmpleado) },
          },
          select: { idEmpleado: true },
        })
      ).map((fila) => fila.idEmpleado),
    );
    const pendientes = personal.filter(
      (persona) => !ya.has(persona.idEmpleado),
    );
    if (pendientes.length === 0) return;
    for (const persona of pendientes) {
      await this.avisos.dispatchComms(
        { userUuid: persona.uuid },
        {
          userUuid: persona.uuid,
          titulo,
          mensaje,
          categoria: 'AVISO',
          prioridad: 'NORMAL',
          deepLink: `/companies/${idEmpresa}/training/pending`,
          origenTipo: 'RUTA',
          origenId: `${codigo}:${dia}`.slice(0, 40),
          idTenant,
          idEmpresa,
          notificationTypeCode: 'RECORDATORIO',
          claveAgrupacion: `ruta-rh:${codigo}:${dia}`,
        },
        CANAL_RH,
      );
    }
    await this.prisma.comRecordatoriosEnviados.createMany({
      data: pendientes.map((persona) => ({
        idEmpresa,
        Codigo: codigo,
        idEmpleado: persona.idEmpleado,
        Referencia: dia,
        Intento: 1,
      })),
    });
  }

  private async alEmpleado(
    idEmpresa: number,
    idEmpleado: number,
    aviso: {
      titulo: string;
      mensaje: string;
      destino: DestinoNotificacion;
      origenTipo: string;
      origenId: string;
      clave: string;
      idTenant?: number | null;
    },
  ): Promise<void> {
    try {
      const persona = await this.prisma.empleados.findFirst({
        where: { idEmpleado, idEmpresa, activo: true },
        select: { idUsuario: true, idTenant: true },
      });
      if (!persona?.idUsuario) return;
      await this.avisos.dispatchComms(
        { userUuid: persona.idUsuario },
        {
          userUuid: persona.idUsuario,
          titulo: aviso.titulo,
          mensaje: aviso.mensaje,
          categoria: 'AVISO',
          prioridad: 'NORMAL',
          destino: aviso.destino,
          origenTipo: aviso.origenTipo,
          origenId: aviso.origenId,
          idTenant: aviso.idTenant ?? persona.idTenant,
          idEmpresa,
          notificationTypeCode: 'RECORDATORIO',
          claveAgrupacion: aviso.clave,
          push: {
            title: aviso.titulo,
            body: aviso.mensaje,
          },
        },
        CANAL_EMPLEADO,
      );
    } catch (error) {
      this.logger.error(
        `Aviso de ruta al empleado ${idEmpleado}: ${textoError(error)}`,
      );
    }
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
        CatModulos: { Codigo: MODULO_RH },
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

  private async zonaDe(idEmpresa: number): Promise<string> {
    const principal = await this.prisma.catSites.findFirst({
      where: { idEmpresa, EsPrincipal: true },
      select: { zonaHoraria: true },
    });
    if (principal?.zonaHoraria) return zonaValida(principal.zonaHoraria);
    const sitio = await this.prisma.catSites.findFirst({
      where: { idEmpresa },
      select: { zonaHoraria: true },
    });
    return zonaValida(sitio?.zonaHoraria || ZONA);
  }
}

function textoError(error: unknown): string {
  return error instanceof Error ? error.message : 'Error desconocido';
}
