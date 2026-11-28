import { Injectable } from '@nestjs/common';
import { hoy as hoyEnZona } from 'src/common/utils/dias-habiles';
import { localDateString } from 'src/modules/attendance/utils/timezone.util';
import { zonaValida } from 'src/modules/communications/reminders/zona-reloj';
import { ConfigurationService } from 'src/modules/configuration/configuration.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { diaAlmacenado } from '../engine/impacto';
import { EmpleadoAlcance, ReglaVisible } from '../scope/resolver.service';
import {
  CursoFuente,
  MiRuta,
  ModalidadRuta,
  armarMiRuta,
  origenDe,
} from './mi-ruta';

const ZONA = 'America/Mexico_City';

@Injectable()
export class MiRutaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configuracion: ConfigurationService,
  ) {}

  async deEmpleado(idEmpresa: number, idEmpleado: number): Promise<MiRuta> {
    const [asignaciones, empleado, empresa, config, zona] = await Promise.all([
      this.prisma.rutaAsignacion.findMany({
        where: {
          idEmpresa,
          idEmpleado,
          estatus: { in: ['activa', 'completada'] },
        },
        include: {
          RutaAprendizaje: { select: { nombre: true } },
          RutaVersion: { include: { RutaAlcances: true } },
          Cursos: {
            where: { estado: { not: 'cancelado' } },
            include: {
              RutaElemento: { include: { RutaEtapa: true } },
              CatCursos: { select: { Descripcion: true } },
              CursoParticipantes: {
                include: {
                  CursoSesiones: {
                    include: {
                      CursoFechasClase: {
                        orderBy: { fechaHoraInicio: 'asc' },
                      },
                      CursoContenidos: {
                        include: {
                          CursoModulos: {
                            include: {
                              CursoLecciones: { select: { idLeccion: true } },
                            },
                          },
                        },
                      },
                    },
                  },
                  CursoLeccionProgresos: {
                    select: { idLeccion: true, fechaCompletado: true },
                  },
                  CursoScormProgresos: {
                    select: {
                      estatusLeccion: true,
                      estatusExito: true,
                      fechaUltimoGuardado: true,
                    },
                  },
                  CursoSeguimientoParticipante: {
                    select: { fechaConclusion: true },
                  },
                },
              },
              ReconocidoDe: {
                select: {
                  idSesion: true,
                  calificacionFinal: true,
                  CursoSeguimientoParticipante: {
                    select: { fechaConclusion: true },
                  },
                },
              },
            },
          },
        },
      }),
      this.empleado(idEmpresa, idEmpleado),
      this.prisma.catEmpresas.findUnique({
        where: { idEmpresa },
        select: { nombre_comercial: true, razon_social: true },
      }),
      this.configuracion.getTrainingConfig(idEmpresa),
      this.zonaDe(idEmpresa),
    ]);
    const nombreEmpresa =
      empresa?.nombre_comercial?.trim() ||
      empresa?.razon_social?.trim() ||
      'Empresa';
    const alcance = empleado?.alcance ?? alcanceVacio(idEmpresa);
    const nombres = await this.nombresDe(asignaciones);
    const sinSesion = asignaciones.flatMap((fila) =>
      fila.Cursos.filter((curso) => curso.CursoParticipantes == null).map(
        (curso) => curso.idCurso,
      ),
    );
    const modalidades = await this.modalidadesDe(idEmpresa, sinSesion);
    const fuentes: CursoFuente[] = [];
    for (const asignacion of asignaciones) {
      const origen = origenDe(
        alcance,
        (asignacion.RutaVersion?.RutaAlcances ?? []).map((regla) =>
          reglaVisible(regla, nombres),
        ),
        nombreEmpresa,
      );
      for (const curso of asignacion.Cursos) {
        const elemento = curso.RutaElemento;
        const etapa = elemento?.RutaEtapa;
        if (!elemento || !etapa) continue;
        const participante = curso.CursoParticipantes;
        const reconocido = curso.ReconocidoDe;
        const sesion = participante?.CursoSesiones ?? null;
        const modalidad = modalidadDe(
          sesion?.modalidad ?? modalidades.get(curso.idCurso) ?? null,
          curso.estado,
        );
        const idSesion =
          participante?.idSesion ?? curso.ReconocidoDe?.idSesion ?? null;
        fuentes.push({
          idRuta: asignacion.idRutaAprendizaje,
          nombreRuta: asignacion.RutaAprendizaje.nombre,
          origen,
          etapa: etapa.nombre,
          ordenEtapa: etapa.orden,
          ordenCurso: elemento.orden,
          requiereEtapaAnterior: etapa.requiereEtapaAnterior,
          idCurso: curso.idCurso,
          nombre:
            curso.CatCursos.Descripcion?.trim() || `Curso ${curso.idCurso}`,
          modalidad,
          obligatorio: elemento.obligatorio,
          estado: curso.estado,
          progreso: progresoDe(participante),
          fechaLimite: curso.fechaLimite
            ? diaAlmacenado(curso.fechaLimite)
            : null,
          idSesion,
          sesionProgramada: sesionProgramada(modalidad, sesion),
          venceEn: curso.venceVigencia
            ? diaAlmacenado(curso.venceVigencia)
            : null,
          vigenciaMeses: elemento.vigenciaMeses,
          calificacion: notaDe(
            participante?.calificacionFinal,
            reconocido?.calificacionFinal,
          ),
          fechaCompletado: diaCompletado(
            [
              curso.fechaCompletado,
              participante?.CursoSeguimientoParticipante?.fechaConclusion,
              reconocido?.CursoSeguimientoParticipante?.fechaConclusion,
            ],
            zona,
          ),
        });
      }
    }
    return armarMiRuta(
      fuentes,
      hoyEnZona(zona),
      config.vigenciaVentanaDias,
      config.calificacionAprobatoria,
    );
  }

  private async empleado(
    idEmpresa: number,
    idEmpleado: number,
  ): Promise<{ alcance: EmpleadoAlcance } | null> {
    const fila = await this.prisma.empleados.findFirst({
      where: { idEmpleado, idEmpresa },
      select: { idPuesto: true, idSite: true },
    });
    if (!fila) return null;
    const [principal, puesto] = await Promise.all([
      this.prisma.relEmpleadosSites.findFirst({
        where: {
          idEmpresa,
          idEmpleado,
          EsPrincipal: true,
          Activo: true,
        },
        orderBy: { FechaAsignacion: 'desc' },
        select: { idSite: true },
      }),
      fila.idPuesto == null
        ? Promise.resolve(null)
        : this.prisma.catPuestos.findUnique({
            where: { idPuesto: fila.idPuesto },
            select: { idArea: true },
          }),
    ]);
    const idSite = principal?.idSite ?? fila.idSite ?? null;
    const site =
      idSite == null
        ? null
        : await this.prisma.catSites.findUnique({
            where: { idSite },
            select: { idUnidadOperativa: true, Estado: true },
          });
    return {
      alcance: {
        idEmpresa,
        idPuesto: fila.idPuesto,
        idArea: puesto?.idArea ?? null,
        idSite,
        idUnidadOperativa: site?.idUnidadOperativa ?? null,
        estado: site?.Estado ?? null,
      },
    };
  }

  private async nombresDe(
    asignaciones: {
      RutaVersion: {
        RutaAlcances: {
          idUnidadOperativa: number | null;
          idSite: number | null;
          idPuesto: number | null;
          idArea: number | null;
        }[];
      } | null;
    }[],
  ): Promise<{
    unidades: Map<number, string>;
    sites: Map<number, string>;
    puestos: Map<number, string>;
    areas: Map<number, string>;
  }> {
    const reglas = asignaciones.flatMap(
      (fila) => fila.RutaVersion?.RutaAlcances ?? [],
    );
    const ids = (
      campo: 'idUnidadOperativa' | 'idSite' | 'idPuesto' | 'idArea',
    ) => [
      ...new Set(
        reglas
          .map((regla) => regla[campo])
          .filter((id): id is number => id != null),
      ),
    ];
    const [unidades, sites, puestos, areas] = await Promise.all([
      this.filasDe(ids('idUnidadOperativa'), (lista) =>
        this.prisma.catUnidadesOperativas.findMany({
          where: { idUnidadOperativa: { in: lista } },
          select: { idUnidadOperativa: true, Nombre: true },
        }),
      ),
      this.filasDe(ids('idSite'), (lista) =>
        this.prisma.catSites.findMany({
          where: { idSite: { in: lista } },
          select: { idSite: true, Descripcion: true },
        }),
      ),
      this.filasDe(ids('idPuesto'), (lista) =>
        this.prisma.catPuestos.findMany({
          where: { idPuesto: { in: lista } },
          select: { idPuesto: true, NombrePuesto: true },
        }),
      ),
      this.filasDe(ids('idArea'), (lista) =>
        this.prisma.catAreas.findMany({
          where: { idArea: { in: lista } },
          select: { idArea: true, Descripcion: true },
        }),
      ),
    ]);
    return {
      unidades: new Map(
        unidades.map((fila) => [fila.idUnidadOperativa, fila.Nombre]),
      ),
      sites: new Map(
        sites.map(
          (fila) =>
            [fila.idSite, fila.Descripcion?.trim() || ''] as [number, string],
        ),
      ),
      puestos: new Map(
        puestos.map((fila) => [fila.idPuesto, fila.NombrePuesto]),
      ),
      areas: new Map(
        areas.map(
          (fila) => [fila.idArea, fila.Descripcion ?? ''] as [number, string],
        ),
      ),
    };
  }

  private filasDe<T>(
    lista: number[],
    consultar: (lista: number[]) => Promise<T[]>,
  ): Promise<T[]> {
    return lista.length === 0 ? Promise.resolve([]) : consultar(lista);
  }

  private async modalidadesDe(
    idEmpresa: number,
    idsCurso: number[],
  ): Promise<Map<number, string>> {
    const unicos = [...new Set(idsCurso)];
    const mapa = new Map<number, string>();
    if (unicos.length === 0) return mapa;
    const sesiones = await this.prisma.cursoSesiones.findMany({
      where: { idEmpresa, idCurso: { in: unicos } },
      orderBy: { idSesion: 'desc' },
      select: { idCurso: true, modalidad: true },
    });
    for (const sesion of sesiones) {
      if (!mapa.has(sesion.idCurso)) mapa.set(sesion.idCurso, sesion.modalidad);
    }
    return mapa;
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

function notaDe(
  propia: { toString(): string } | number | null | undefined,
  reconocida: { toString(): string } | number | null | undefined,
): number | null {
  const cruda = propia ?? reconocida;
  if (cruda == null) return null;
  const numero = Number(cruda);
  return Number.isFinite(numero) ? numero : null;
}

function diaCompletado(
  marcas: Array<Date | null | undefined>,
  zona: string,
): string | null {
  const marca = marcas.find((fecha) => fecha != null);
  return marca ? localDateString(marca, zona) : null;
}

function alcanceVacio(idEmpresa: number): EmpleadoAlcance {
  return {
    idEmpresa,
    idPuesto: null,
    idArea: null,
    idSite: null,
    idUnidadOperativa: null,
    estado: null,
  };
}

function reglaVisible(
  regla: {
    modo: string;
    idUnidadOperativa: number | null;
    estado: string | null;
    idSite: number | null;
    idPuesto: number | null;
    idArea: number | null;
  },
  nombres: {
    unidades: Map<number, string>;
    sites: Map<number, string>;
    puestos: Map<number, string>;
    areas: Map<number, string>;
  },
): ReglaVisible {
  return {
    modo: regla.modo === 'excluir' ? 'excluir' : 'incluir',
    idUnidadOperativa: regla.idUnidadOperativa,
    estado: regla.estado,
    idSite: regla.idSite,
    idPuesto: regla.idPuesto,
    idArea: regla.idArea,
    nombreUnidad:
      regla.idUnidadOperativa == null
        ? null
        : (nombres.unidades.get(regla.idUnidadOperativa) ?? null),
    nombreSite:
      regla.idSite == null ? null : (nombres.sites.get(regla.idSite) ?? null),
    nombrePuesto:
      regla.idPuesto == null
        ? null
        : (nombres.puestos.get(regla.idPuesto) ?? null),
    nombreArea:
      regla.idArea == null ? null : (nombres.areas.get(regla.idArea) ?? null),
  };
}

function modalidadDe(modalidad: string | null, estado: string): ModalidadRuta {
  if (
    modalidad === 'presencial' ||
    modalidad === 'online_sincrono' ||
    modalidad === 'online_asincrono'
  ) {
    return modalidad;
  }
  return estado === 'por_programar' ? 'presencial' : 'online_asincrono';
}

function progresoDe(
  participante: {
    CursoLeccionProgresos: {
      idLeccion: number;
      fechaCompletado: Date | null;
    }[];
    CursoScormProgresos: {
      estatusLeccion: string | null;
      estatusExito: string | null;
      fechaUltimoGuardado: Date | null;
    } | null;
    CursoSesiones: {
      CursoContenidos: {
        activo: boolean;
        CursoModulos: { CursoLecciones: { idLeccion: number }[] }[];
      } | null;
    } | null;
  } | null,
): number {
  if (!participante) return 0;
  const contenido = participante.CursoSesiones?.CursoContenidos;
  const lecciones = contenido?.activo
    ? contenido.CursoModulos.flatMap((modulo) =>
        modulo.CursoLecciones.map((leccion) => leccion.idLeccion),
      )
    : [];
  if (lecciones.length > 0) {
    const hechas = new Set(
      participante.CursoLeccionProgresos.filter(
        (progreso) => progreso.fechaCompletado,
      ).map((progreso) => progreso.idLeccion),
    );
    const completadas = lecciones.filter((id) => hechas.has(id)).length;
    return Math.round((completadas / lecciones.length) * 100);
  }
  const scorm = participante.CursoScormProgresos;
  if (!scorm) return 0;
  if (scorm.estatusExito === 'passed' || scorm.estatusLeccion === 'completed')
    return 100;
  if (scorm.estatusLeccion || scorm.fechaUltimoGuardado) return 50;
  return 0;
}

function sesionProgramada(
  modalidad: ModalidadRuta,
  sesion: {
    fechaInicioPeriodo: Date;
    ubicacionFisica: string | null;
    CursoFechasClase: {
      fechaHoraInicio: Date;
      estatus: string | null;
    }[];
  } | null,
): { fecha: string; lugar: string | null } | null {
  if (!sesion) return null;
  if (modalidad !== 'presencial' && modalidad !== 'online_sincrono')
    return null;
  const vivas = sesion.CursoFechasClase.filter(
    (clase) => clase.estatus !== 'cancelada',
  );
  const clase = vivas[0];
  const fecha = clase?.fechaHoraInicio ?? sesion.fechaInicioPeriodo;
  return {
    fecha: fecha.toISOString(),
    lugar: sesion.ubicacionFisica?.trim() || null,
  };
}
