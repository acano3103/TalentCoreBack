import { localDateString } from 'src/modules/attendance/utils/timezone.util';

const ZONA = 'America/Mexico_City';

export interface CursoVersion {
  idCurso: number;
  nombre: string;
  diaInicio: number;
  diaFin: number;
  obligatorio: boolean;
  vigenciaMeses: number | null;
}

export interface FichaCurso {
  idCurso: number;
  nombre: string;
  plazo: number;
  obligatorio: boolean;
  vigenciaMeses: number | null;
}

export interface CambioCurso {
  idCurso: number;
  nombre: string;
  plazo?: { antes: number; despues: number };
  obligatorio?: { antes: boolean; despues: boolean };
  vigencia?: { antes: number | null; despues: number | null };
}

export interface DiffVersion {
  agregados: FichaCurso[];
  quitados: FichaCurso[];
  cambiados: CambioCurso[];
  sinCambio: { idCurso: number; nombre: string }[];
}

export type MarcaCurso = 'vigente' | 'iniciado';

export interface PersonaImpacto {
  cursos: Map<number, MarcaCurso>;
}

export interface Clasificacion {
  alcanzados: number;
  yaTienenVigentes: number;
  recibiranSoloNuevos: number;
  recibiranCompleta: number;
  presencialesAProgramar: number;
  grupos: {
    vanALaMitad: number;
    yaCompletaron: number;
    aunNoInician: number;
  };
}

export function hoyNegocio(ahora = new Date()): string {
  return localDateString(ahora, ZONA);
}

/** Fecha de una columna DATE. El driver la entrega a medianoche UTC. */
export function diaAlmacenado(fecha: Date): string {
  const mes = String(fecha.getUTCMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getUTCDate()).padStart(2, '0');
  return `${fecha.getUTCFullYear()}-${mes}-${dia}`;
}

export function sumarMeses(dia: string, meses: number): string {
  const [anio, mes, numero] = dia.split('-').map(Number);
  const fecha = new Date(Date.UTC(anio, mes - 1 + meses, numero));
  return diaAlmacenado(fecha);
}

export function sumarDias(dia: string, dias: number): string {
  const [anio, mes, numero] = dia.split('-').map(Number);
  const fecha = new Date(Date.UTC(anio, mes - 1, numero + dias));
  return diaAlmacenado(fecha);
}

/** Medianoche UTC del día, para columnas @db.Date. */
export function diaPrisma(dia: string): Date {
  const [anio, mes, numero] = dia.split('-').map(Number);
  return new Date(Date.UTC(anio, mes - 1, numero));
}

export function sigueVigente(vence: Date | null, hoy: string): boolean {
  if (!vence) return true;
  return diaAlmacenado(vence) >= hoy;
}

function ficha(curso: CursoVersion): FichaCurso {
  return {
    idCurso: curso.idCurso,
    nombre: curso.nombre,
    plazo: curso.diaFin,
    obligatorio: curso.obligatorio,
    vigenciaMeses: curso.vigenciaMeses,
  };
}

export function diffCursos(
  publicado: CursoVersion[],
  propuesto: CursoVersion[],
): DiffVersion {
  const anteriores = new Map(publicado.map((curso) => [curso.idCurso, curso]));
  const siguientes = new Map(propuesto.map((curso) => [curso.idCurso, curso]));
  const agregados: FichaCurso[] = [];
  const cambiados: CambioCurso[] = [];
  const sinCambio: { idCurso: number; nombre: string }[] = [];

  for (const curso of propuesto) {
    const antes = anteriores.get(curso.idCurso);
    if (!antes) {
      agregados.push(ficha(curso));
      continue;
    }
    const cambio: CambioCurso = {
      idCurso: curso.idCurso,
      nombre: curso.nombre,
    };
    if (antes.diaFin !== curso.diaFin)
      cambio.plazo = { antes: antes.diaFin, despues: curso.diaFin };
    if (antes.obligatorio !== curso.obligatorio) {
      cambio.obligatorio = {
        antes: antes.obligatorio,
        despues: curso.obligatorio,
      };
    }
    if (antes.vigenciaMeses !== curso.vigenciaMeses) {
      cambio.vigencia = {
        antes: antes.vigenciaMeses,
        despues: curso.vigenciaMeses,
      };
    }
    if (cambio.plazo || cambio.obligatorio || cambio.vigencia)
      cambiados.push(cambio);
    else sinCambio.push({ idCurso: curso.idCurso, nombre: curso.nombre });
  }

  const quitados = publicado
    .filter((curso) => !siguientes.has(curso.idCurso))
    .map(ficha);
  return { agregados, quitados, cambiados, sinCambio };
}

export function clasificarPersonas(
  cursos: CursoVersion[],
  personas: PersonaImpacto[],
  presencialesSinSesion: Set<number>,
): Clasificacion {
  const resultado: Clasificacion = {
    alcanzados: personas.length,
    yaTienenVigentes: 0,
    recibiranSoloNuevos: 0,
    recibiranCompleta: 0,
    presencialesAProgramar: 0,
    grupos: { vanALaMitad: 0, yaCompletaron: 0, aunNoInician: 0 },
  };

  for (const persona of personas) {
    let vigentes = 0;
    let conAvance = 0;
    let obligatorios = 0;
    let obligatoriosVigentes = 0;
    for (const curso of cursos) {
      const marca = persona.cursos.get(curso.idCurso);
      if (marca) conAvance += 1;
      if (marca === 'vigente') vigentes += 1;
      if (curso.obligatorio) {
        obligatorios += 1;
        if (marca === 'vigente') obligatoriosVigentes += 1;
      }
      if (marca !== 'vigente' && presencialesSinSesion.has(curso.idCurso)) {
        resultado.presencialesAProgramar += 1;
      }
    }

    if (cursos.length === 0 || vigentes === 0) resultado.recibiranCompleta += 1;
    else if (vigentes === cursos.length) resultado.yaTienenVigentes += 1;
    else resultado.recibiranSoloNuevos += 1;

    const meta = obligatorios > 0 ? obligatorios : cursos.length;
    const hechos = obligatorios > 0 ? obligatoriosVigentes : vigentes;
    if (cursos.length > 0 && hechos === meta)
      resultado.grupos.yaCompletaron += 1;
    else if (conAvance === 0) resultado.grupos.aunNoInician += 1;
    else resultado.grupos.vanALaMitad += 1;
  }

  return resultado;
}
