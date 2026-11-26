import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import {
  diasEntreFechas,
  zonaValida,
} from 'src/modules/communications/reminders/zona-reloj';
import { hoy } from 'src/common/utils/dias-habiles';
import { ActiveUserDto } from 'src/modules/auth/dto/active-user.dto';
import { CoursesService } from 'src/modules/courses/courses.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { diaAlmacenado, diaPrisma } from '../engine/impacto';
import { errorRuta } from '../learning-paths.errores';
import { exigirModulo } from '../permiso-modulo';
import { AssignmentEngineService } from '../engine/assignment-engine.service';
import { ProgramacionQuery, ProgramarPendientesDto } from './dto/pending.dto';

const ZONA = 'America/Mexico_City';

@Injectable()
export class PendingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cursos: CoursesService,
    private readonly motor: AssignmentEngineService,
  ) {}

  async programacion(
    user: ActiveUserDto,
    companyId: number,
    query: ProgramacionQuery,
  ) {
    await exigirModulo(this.prisma, user, 'training-pending', 'ver');
    const filas = await this.prisma.rutaAsignacionCurso.findMany({
      where: {
        estado: 'por_programar',
        RutaAsignacion: { idEmpresa: companyId, estatus: 'activa' },
      },
      include: {
        CatCursos: {
          select: {
            idCursos: true,
            Descripcion: true,
            duracionHoras: true,
            esNormativoStps: true,
          },
        },
        RutaElemento: { select: { idEtapa: true } },
        RutaAsignacion: {
          select: {
            idEmpleado: true,
            idVersion: true,
            idRutaAprendizaje: true,
            RutaAprendizaje: { select: { nombre: true } },
            RutaVersion: { select: { numero: true } },
          },
        },
      },
    });
    const idsEmpleado = [
      ...new Set(filas.map((fila) => fila.RutaAsignacion.idEmpleado)),
    ];
    const idsEtapa = [
      ...new Set(filas.map((fila) => fila.RutaElemento.idEtapa)),
    ];
    const idsCurso = [...new Set(filas.map((fila) => fila.idCurso))];
    const [sites, etapas, sesiones, zona] = await Promise.all([
      this.sitesDe(companyId, idsEmpleado),
      idsEtapa.length
        ? this.prisma.rutaEtapa.findMany({
            where: { idEtapa: { in: idsEtapa } },
            select: { idEtapa: true, nombre: true },
          })
        : Promise.resolve([] as { idEtapa: number; nombre: string }[]),
      idsCurso.length
        ? this.prisma.cursoSesiones.findMany({
            where: {
              idEmpresa: companyId,
              idCurso: { in: idsCurso },
              estatus: { not: 'cancelado' },
            },
            orderBy: { creadoEn: 'desc' },
            select: { idCurso: true, modalidad: true },
          })
        : Promise.resolve([] as { idCurso: number; modalidad: string }[]),
      this.zonaDe(companyId),
    ]);
    const nombresSite = await this.nombresSite(
      [...sites.values()].filter((id): id is number => id != null),
    );
    const etapaDe = new Map(
      etapas.map((etapa) => [etapa.idEtapa, etapa.nombre]),
    );
    const modalidad = new Map<number, string>();
    for (const sesion of sesiones) {
      if (!modalidad.has(sesion.idCurso))
        modalidad.set(sesion.idCurso, sesion.modalidad);
    }
    const dia = hoy(zona);
    const grupos = new Map<string, GrupoArmado>();
    for (const fila of filas) {
      const idSite = sites.get(fila.RutaAsignacion.idEmpleado) ?? null;
      if (query.idSite != null && idSite !== query.idSite) continue;
      const clave = `${fila.idCurso}:${idSite ?? 0}`;
      const limite = diaAlmacenado(fila.fechaLimite);
      const actual = grupos.get(clave);
      if (!actual || limite < actual.fechaLimiteMasCercana) {
        grupos.set(clave, {
          curso: {
            idCurso: fila.idCurso,
            nombre:
              fila.CatCursos.Descripcion?.trim() || `Curso ${fila.idCurso}`,
          },
          modalidad: modalidad.get(fila.idCurso) ?? null,
          duracionHoras: numero(fila.CatCursos.duracionHoras),
          esNormativoStps: fila.CatCursos.esNormativoStps,
          ruta: {
            idRutaAprendizaje: fila.RutaAsignacion.idRutaAprendizaje,
            nombre: fila.RutaAsignacion.RutaAprendizaje.nombre,
          },
          version: {
            idVersion: fila.RutaAsignacion.idVersion,
            numero: fila.RutaAsignacion.RutaVersion.numero,
          },
          etapa: {
            idEtapa: fila.RutaElemento.idEtapa,
            nombre: etapaDe.get(fila.RutaElemento.idEtapa) ?? '',
          },
          site: {
            idSite,
            nombre:
              idSite == null
                ? 'Sin site'
                : (nombresSite.get(idSite) ?? `Site ${idSite}`),
          },
          pendientes: (actual?.pendientes ?? 0) + 1,
          fechaLimiteMasCercana: limite,
          diasRestantes: diasEntreFechas(dia, limite),
        });
      } else {
        actual.pendientes += 1;
      }
    }
    let lista = [...grupos.values()];
    const busqueda = query.search?.trim().toLocaleLowerCase('es');
    if (busqueda) {
      lista = lista.filter((grupo) =>
        [grupo.curso.nombre, grupo.site.nombre, grupo.ruta.nombre]
          .join(' ')
          .toLocaleLowerCase('es')
          .includes(busqueda),
      );
    }
    lista.sort((a, b) =>
      query.orden === 'desc'
        ? b.fechaLimiteMasCercana.localeCompare(a.fechaLimiteMasCercana)
        : a.fechaLimiteMasCercana.localeCompare(b.fechaLimiteMasCercana),
    );
    return { grupos: lista };
  }

  async programar(
    user: ActiveUserDto,
    companyId: number,
    dto: ProgramarPendientesDto,
  ) {
    await exigirModulo(this.prisma, user, 'training-pending', 'editar');
    const idCurso = dto.sesion.idCurso;
    if (dto.grupos.some((grupo) => grupo.idCurso !== idCurso)) {
      throw errorRuta(
        HttpStatus.BAD_REQUEST,
        'CURSO_DISTINTO',
        'La sesión y los grupos deben ser del mismo curso.',
      );
    }
    const sesion = await this.cursos.createSession(companyId, dto.sesion, user);
    const pendientes = await this.prisma.rutaAsignacionCurso.findMany({
      where: {
        estado: 'por_programar',
        idCurso,
        RutaAsignacion: { idEmpresa: companyId, estatus: 'activa' },
      },
    });
    const idsAsignacion = [
      ...new Set(pendientes.map((fila) => fila.idAsignacion)),
    ];
    const asignaciones = idsAsignacion.length
      ? await this.prisma.rutaAsignacion.findMany({
          where: { idAsignacion: { in: idsAsignacion } },
          select: { idAsignacion: true, idEmpleado: true },
        })
      : [];
    const porAsignacion = new Map(
      asignaciones.map((fila) => [fila.idAsignacion, fila]),
    );
    const sites = await this.sitesDe(
      companyId,
      asignaciones.map((fila) => fila.idEmpleado),
    );
    const claves = new Set(
      dto.grupos.map((grupo) => `${grupo.idCurso}:${grupo.idSite}`),
    );
    const elegidos = pendientes.filter((fila) => {
      const asignacion = porAsignacion.get(fila.idAsignacion);
      if (!asignacion) return false;
      const idSite = sites.get(asignacion.idEmpleado);
      return idSite != null && claves.has(`${fila.idCurso}:${idSite}`);
    });
    const limiteDe = new Map<number, string>();
    const empleadoDe = new Map<number, number>();
    for (const fila of elegidos) {
      const asignacion = porAsignacion.get(fila.idAsignacion);
      if (!asignacion) continue;
      empleadoDe.set(fila.idAsignacionCurso, asignacion.idEmpleado);
      const limite = diaAlmacenado(fila.fechaLimite);
      const previo = limiteDe.get(asignacion.idEmpleado);
      if (!previo || limite < previo)
        limiteDe.set(asignacion.idEmpleado, limite);
    }
    const idsEmpleado = [...limiteDe.keys()];
    const existentes = await this.prisma.cursoParticipantes.findMany({
      where: { idSesion: sesion.idSesion },
      select: { idParticipante: true, idEmpleado: true, fechaLimite: true },
    });
    const ya = new Map(existentes.map((fila) => [fila.idEmpleado, fila]));
    const nuevos = idsEmpleado.filter((id) => !ya.has(id));
    if (nuevos.length > 0) {
      await this.prisma.cursoParticipantes.createMany({
        data: nuevos.map((idEmpleado) => ({
          idSesion: sesion.idSesion,
          idEmpleado,
          estatusAsignacion: 'inscrito' as const,
          fechaLimite: diaPrisma(limiteDe.get(idEmpleado) ?? hoy(ZONA)),
        })),
        skipDuplicates: true,
      });
    }
    for (const [idEmpleado, fila] of ya) {
      const limite = limiteDe.get(idEmpleado);
      if (!limite) continue;
      const actual = fila.fechaLimite ? diaAlmacenado(fila.fechaLimite) : null;
      if (actual && limite >= actual) continue;
      await this.prisma.cursoParticipantes.update({
        where: { idParticipante: fila.idParticipante },
        data: { fechaLimite: diaPrisma(limite) },
      });
    }
    const finales = idsEmpleado.length
      ? await this.prisma.cursoParticipantes.findMany({
          where: { idSesion: sesion.idSesion, idEmpleado: { in: idsEmpleado } },
          select: { idParticipante: true, idEmpleado: true },
        })
      : [];
    const participanteDe = new Map(
      finales.map((fila) => [fila.idEmpleado, fila.idParticipante]),
    );
    for (const fila of elegidos) {
      const idEmpleado = empleadoDe.get(fila.idAsignacionCurso);
      const idParticipante =
        idEmpleado == null ? null : participanteDe.get(idEmpleado);
      if (idParticipante == null) continue;
      await this.prisma.rutaAsignacionCurso.update({
        where: { idAsignacionCurso: fila.idAsignacionCurso },
        data: { estado: 'inscrito', idParticipante },
      });
    }
    await this.prisma.historicoMovimientos.create({
      data: bitacora(
        user,
        companyId,
        'PROGRAMAR',
        sesion.idSesion,
        `programó la sesión ${sesion.idSesion} para ${finales.length} pendientes.`,
      ),
    });
    return { idSesion: sesion.idSesion, inscritos: finales.length };
  }

  async lotes(user: ActiveUserDto, companyId: number) {
    await exigirModulo(this.prisma, user, 'training-pending', 'ver');
    const lotes = await this.cargarLotes(companyId);
    const autores = await this.autores(lotes.map((lote) => lote.creadoPor));
    return {
      lotes: lotes.map((lote) => ({
        idLote: lote.idLote,
        ruta: lote.RutaAprendizaje.nombre,
        version: lote.RutaVersion.numero,
        proposito: lote.RutaAprendizaje.proposito,
        descripcion: lote.descripcion,
        creadoEn: lote.creadoEn,
        creadoPor: lote.creadoPor
          ? (autores.get(lote.creadoPor) ?? 'automático')
          : 'automático',
        personas: lote.personas,
        cursosResumen: resumenCursos(
          lote.RutaAsignaciones.flatMap((fila) => fila.Cursos),
        ),
      })),
    };
  }

  async detalle(user: ActiveUserDto, companyId: number, idLote: number) {
    await exigirModulo(this.prisma, user, 'training-pending', 'ver');
    const lote = await this.prisma.rutaLote.findFirst({
      where: { idLote, idEmpresa: companyId },
      include: {
        RutaAprendizaje: { select: { nombre: true, proposito: true } },
        RutaVersion: { select: { numero: true } },
        RutaAsignaciones: {
          include: {
            Empleados: {
              select: {
                idEmpleado: true,
                nombre: true,
                primerApellido: true,
                segundoApellido: true,
              },
            },
            Cursos: {
              include: {
                CatCursos: { select: { idCursos: true, Descripcion: true } },
              },
            },
          },
        },
      },
    });
    if (!lote)
      throw new NotFoundException('El lote no existe en esta empresa.');
    const idsCurso = [
      ...new Set(
        lote.RutaAsignaciones.flatMap((fila) =>
          fila.Cursos.map((curso) => curso.idCurso),
        ),
      ),
    ];
    const motivos = await this.motivos(companyId, idsCurso);
    return {
      idLote: lote.idLote,
      ruta: lote.RutaAprendizaje.nombre,
      version: lote.RutaVersion.numero,
      proposito: lote.RutaAprendizaje.proposito,
      descripcion: lote.descripcion,
      personas: lote.RutaAsignaciones.map((fila) => ({
        idEmpleado: fila.idEmpleado,
        nombre: nombreEmpleado(fila.Empleados),
        cursos: fila.Cursos.map((curso) => ({
          idCurso: curso.idCurso,
          nombre:
            curso.CatCursos.Descripcion?.trim() || `Curso ${curso.idCurso}`,
          estado: curso.estado,
          etiqueta: etiqueta(curso.estado),
          motivo:
            curso.estado === 'por_programar'
              ? (motivos.get(curso.idCurso) ?? null)
              : null,
        })),
      })),
    };
  }

  async aprobar(user: ActiveUserDto, companyId: number, idLote: number) {
    await exigirModulo(this.prisma, user, 'training-pending', 'editar');
    const resultado = await this.motor.aplicarLote({
      idEmpresa: companyId,
      idLote,
      resueltoPor: user.uuid,
    });
    await this.prisma.historicoMovimientos.create({
      data: bitacora(
        user,
        companyId,
        'APROBAR',
        idLote,
        `aprobó el lote ${idLote} de rutas de aprendizaje.`,
      ),
    });
    return resultado;
  }

  async rechazar(
    user: ActiveUserDto,
    companyId: number,
    idLote: number,
    motivo: string,
  ) {
    await exigirModulo(this.prisma, user, 'training-pending', 'editar');
    const limpio = motivo?.trim();
    if (!limpio) {
      throw errorRuta(
        HttpStatus.BAD_REQUEST,
        'MOTIVO_REQUERIDO',
        'Indica el motivo del rechazo.',
      );
    }
    const resultado = await this.motor.rechazarLote({
      idEmpresa: companyId,
      idLote,
      motivo: limpio,
      resueltoPor: user.uuid,
    });
    await this.prisma.historicoMovimientos.create({
      data: bitacora(
        user,
        companyId,
        'RECHAZAR',
        idLote,
        `rechazó el lote ${idLote}: ${limpio}`,
      ),
    });
    return resultado;
  }

  async vencidos(user: ActiveUserDto, companyId: number, ahora = new Date()) {
    await exigirModulo(this.prisma, user, 'training-pending', 'ver');
    const zona = await this.zonaDe(companyId);
    const dia = hoy(zona, ahora);
    const filas = await this.prisma.rutaAsignacionCurso.findMany({
      where: {
        RutaAsignacion: {
          idEmpresa: companyId,
          estatus: { in: ['activa', 'completada'] },
        },
        OR: [
          {
            fechaLimite: { lt: diaPrisma(dia) },
            estado: { in: ['inscrito', 'por_programar'] },
          },
          {
            OR: [
              { estado: 'vencido' },
              {
                venceVigencia: { lt: diaPrisma(dia) },
                estado: { in: ['completado', 'reconocido', 'vencido'] },
              },
            ],
          },
        ],
      },
      include: {
        CatCursos: { select: { Descripcion: true } },
        RutaAsignacion: {
          select: {
            idEmpleado: true,
            RutaAprendizaje: { select: { nombre: true } },
            Empleados: {
              select: {
                nombre: true,
                primerApellido: true,
                segundoApellido: true,
              },
            },
          },
        },
      },
    });
    const porFecha: {
      idAsignacionCurso: number;
      idEmpleado: number;
      nombre: string;
      idCurso: number;
      curso: string;
      ruta: string;
      estado: string;
      fechaLimite: string;
      venceVigencia: string | null;
      diasRestantes: number;
    }[] = [];
    const porVigencia: {
      idAsignacionCurso: number;
      idEmpleado: number;
      nombre: string;
      idCurso: number;
      curso: string;
      ruta: string;
      estado: string;
      fechaLimite: string;
      venceVigencia: string | null;
      diasRestantes: number | null;
    }[] = [];
    for (const fila of filas) {
      const base = {
        idAsignacionCurso: fila.idAsignacionCurso,
        idEmpleado: fila.RutaAsignacion.idEmpleado,
        nombre: nombreEmpleado(fila.RutaAsignacion.Empleados),
        idCurso: fila.idCurso,
        curso: fila.CatCursos.Descripcion?.trim() || `Curso ${fila.idCurso}`,
        ruta: fila.RutaAsignacion.RutaAprendizaje.nombre,
        estado: fila.estado,
        fechaLimite: diaAlmacenado(fila.fechaLimite),
        venceVigencia: fila.venceVigencia
          ? diaAlmacenado(fila.venceVigencia)
          : null,
      };
      const limiteVencido =
        (fila.estado === 'inscrito' || fila.estado === 'por_programar') &&
        base.fechaLimite < dia;
      const vigenciaVencida =
        fila.estado === 'vencido' ||
        (base.venceVigencia != null && base.venceVigencia < dia);
      if (limiteVencido) {
        porFecha.push({
          ...base,
          diasRestantes: diasEntreFechas(dia, base.fechaLimite),
        });
      }
      if (vigenciaVencida) {
        porVigencia.push({
          ...base,
          diasRestantes: base.venceVigencia
            ? diasEntreFechas(dia, base.venceVigencia)
            : null,
        });
      }
    }
    return { porFecha, porVigencia };
  }

  private async cargarLotes(companyId: number) {
    return this.prisma.rutaLote.findMany({
      where: { idEmpresa: companyId, estatus: 'por_aprobar' },
      orderBy: { creadoEn: 'asc' },
      include: {
        RutaAprendizaje: { select: { nombre: true, proposito: true } },
        RutaVersion: { select: { numero: true } },
        RutaAsignaciones: { include: { Cursos: true } },
      },
    });
  }

  private async autores(
    uuids: (string | null)[],
  ): Promise<Map<string, string>> {
    const ids = [...new Set(uuids.filter((uuid): uuid is string => !!uuid))];
    if (ids.length === 0) return new Map();
    const usuarios = await this.prisma.auth_user.findMany({
      where: { uuid: { in: ids } },
      select: { uuid: true, first_name: true, last_name: true },
    });
    return new Map(
      usuarios.map((usuario) => [
        usuario.uuid,
        `${usuario.first_name} ${usuario.last_name}`.trim() || 'automático',
      ]),
    );
  }

  private async motivos(
    companyId: number,
    idsCurso: number[],
  ): Promise<Map<number, string | null>> {
    const mapa = new Map<number, string | null>();
    if (idsCurso.length === 0) return mapa;
    const sesiones = await this.prisma.cursoSesiones.findMany({
      where: {
        idEmpresa: companyId,
        idCurso: { in: idsCurso },
        estatus: { not: 'cancelado' },
      },
      orderBy: { creadoEn: 'desc' },
      select: { idSesion: true, idCurso: true, modalidad: true },
    });
    const contenidos = sesiones.length
      ? await this.prisma.cursoContenidos.findMany({
          where: {
            idSesion: { in: sesiones.map((sesion) => sesion.idSesion) },
          },
          select: { idSesion: true },
        })
      : [];
    const conContenido = new Set(contenidos.map((fila) => fila.idSesion));
    for (const idCurso of idsCurso) {
      const delCurso = sesiones.filter((sesion) => sesion.idCurso === idCurso);
      const ultima = delCurso[0];
      const asyncSinContenido =
        !ultima ||
        (ultima.modalidad === 'online_asincrono' &&
          !delCurso.some((sesion) => conContenido.has(sesion.idSesion)));
      mapa.set(idCurso, asyncSinContenido ? 'SIN_CONTENIDO' : null);
    }
    return mapa;
  }

  private async sitesDe(
    idEmpresa: number,
    idsEmpleado: number[],
  ): Promise<Map<number, number | null>> {
    const mapa = new Map<number, number | null>();
    if (idsEmpleado.length === 0) return mapa;
    const [empleados, principales] = await Promise.all([
      this.prisma.empleados.findMany({
        where: { idEmpleado: { in: idsEmpleado } },
        select: { idEmpleado: true, idSite: true },
      }),
      this.prisma.relEmpleadosSites.findMany({
        where: {
          idEmpresa,
          EsPrincipal: true,
          Activo: true,
          idEmpleado: { in: idsEmpleado },
        },
        orderBy: { FechaAsignacion: 'desc' },
        select: { idEmpleado: true, idSite: true },
      }),
    ]);
    for (const empleado of empleados)
      mapa.set(empleado.idEmpleado, empleado.idSite);
    const vistos = new Set<number>();
    for (const fila of principales) {
      if (vistos.has(fila.idEmpleado)) continue;
      vistos.add(fila.idEmpleado);
      mapa.set(fila.idEmpleado, fila.idSite);
    }
    return mapa;
  }

  private async nombresSite(ids: number[]): Promise<Map<number, string>> {
    if (ids.length === 0) return new Map();
    const sites = await this.prisma.catSites.findMany({
      where: { idSite: { in: ids } },
      select: { idSite: true, Descripcion: true },
    });
    return new Map(
      sites.map((site) => [
        site.idSite,
        site.Descripcion?.trim() || `Site ${site.idSite}`,
      ]),
    );
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
}

export interface GrupoArmado {
  curso: { idCurso: number; nombre: string };
  modalidad: string | null;
  duracionHoras: number | null;
  esNormativoStps: boolean;
  ruta: { idRutaAprendizaje: number; nombre: string };
  version: { idVersion: number; numero: number };
  etapa: { idEtapa: number; nombre: string };
  site: { idSite: number | null; nombre: string };
  pendientes: number;
  fechaLimiteMasCercana: string;
  diasRestantes: number;
}

function resumenCursos(cursos: { estado: string }[]) {
  return {
    total: cursos.length,
    reconocidos: cursos.filter((curso) => curso.estado === 'reconocido').length,
    seInscriben: cursos.filter((curso) => curso.estado === 'inscrito').length,
    porProgramar: cursos.filter((curso) => curso.estado === 'por_programar')
      .length,
  };
}

function etiqueta(estado: string): string {
  if (estado === 'reconocido') return 'reconocido';
  if (estado === 'inscrito') return 'se inscribe';
  if (estado === 'por_programar') return 'irá a Por programar';
  return estado;
}

function nombreEmpleado(empleado: {
  nombre: string | null;
  primerApellido: string | null;
  segundoApellido: string | null;
}): string {
  return [empleado.nombre, empleado.primerApellido, empleado.segundoApellido]
    .filter((parte) => !!parte?.trim())
    .join(' ');
}

function numero(valor: unknown): number | null {
  if (valor == null) return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

function bitacora(
  user: ActiveUserDto,
  companyId: number,
  accion: string,
  id: number,
  verbo: string,
) {
  return {
    idUsuario: user.id,
    idEmpresa: companyId,
    accion,
    tablaOrigen: 'RutaLote',
    idRegistro: String(id),
    descripcion: `${user.first_name} ${user.last_name} ${verbo}`,
    fechaCreacion: new Date(),
  };
}
