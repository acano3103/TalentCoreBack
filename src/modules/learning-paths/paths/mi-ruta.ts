import {
  EmpleadoAlcance,
  ReglaVisible,
  reglaCoincide,
} from '../scope/resolver.service';

export type ModalidadRuta =
  'online_asincrono' | 'presencial' | 'online_sincrono';

export type EstadoEtapaRuta = 'completada' | 'en_curso' | 'bloqueada';

export type EstadoCursoRuta =
  | 'reconocido'
  | 'completado'
  | 'en_curso'
  | 'pendiente'
  | 'agendado'
  | 'por_programar'
  | 'vencido';

export interface CursoFuente {
  idRuta: number;
  nombreRuta: string;
  origen: string;
  etapa: string;
  ordenEtapa: number;
  ordenCurso: number;
  requiereEtapaAnterior: boolean;
  idCurso: number;
  nombre: string;
  modalidad: ModalidadRuta;
  obligatorio: boolean;
  estado:
    | 'reconocido'
    | 'inscrito'
    | 'por_programar'
    | 'completado'
    | 'vencido'
    | 'cancelado';
  progreso: number;
  fechaLimite: string | null;
  idSesion: number | null;
  sesionProgramada: { fecha: string; lugar: string | null } | null;
  venceEn: string | null;
  vigenciaMeses: number | null;
}

export interface CursoRuta {
  idCurso: number;
  idSesion: number | null;
  nombre: string;
  modalidad: ModalidadRuta;
  obligatorio: boolean;
  estado: EstadoCursoRuta;
  progreso: number;
  fechaLimite: string | null;
  sesionProgramada: { fecha: string; lugar: string | null } | null;
}

export interface EtapaRuta {
  nombre: string;
  orden: number;
  estado: EstadoEtapaRuta;
  fechaLimite: string | null;
  cursos: CursoRuta[];
}

export interface PorRenovar {
  idCurso: number;
  idSesion: number | null;
  nombre: string;
  venceEn: string;
  dias: number;
  vigenciaMeses: number;
}

export interface MiRuta {
  rutas: { idRutaAprendizaje: number; nombre: string; origen: string }[];
  avance: { completados: number; total: number };
  etapas: EtapaRuta[];
  porRenovar: PorRenovar[];
}

export interface ResumenMiRuta {
  etapaActual: number;
  totalEtapas: number;
  nombreEtapa: string;
  completados: number;
  total: number;
  porProgramar: number;
  fechaLimite: string | null;
  porRenovar: { curso: string; dias: number } | null;
}

const HECHO = new Set(['reconocido', 'completado']);

/** Días de calendario de `desde` a `hasta`. Negativo si `hasta` ya pasó. */
export function diasHasta(desde: string, hasta: string): number {
  const [anioA, mesA, diaA] = desde.split('-').map(Number);
  const [anioB, mesB, diaB] = hasta.split('-').map(Number);
  const a = Date.UTC(anioA, mesA - 1, diaA);
  const b = Date.UTC(anioB, mesB - 1, diaB);
  return Math.round((b - a) / 86_400_000);
}

/**
 * La etiqueta más específica de la regla de inclusión que alcanza al empleado.
 * Sin regla concreta, queda el nombre de la empresa.
 */
export function origenDe(
  empleado: EmpleadoAlcance,
  reglas: ReglaVisible[],
  empresa: string,
): string {
  const inclusiones = reglas.filter(
    (regla) => regla.modo === 'incluir' && reglaCoincide(empleado, regla),
  );
  const peso = (regla: ReglaVisible): number => {
    if (regla.idPuesto != null) return 5;
    if (regla.idArea != null) return 4;
    if (regla.idSite != null) return 3;
    if (regla.estado?.trim()) return 2;
    if (regla.idUnidadOperativa != null) return 1;
    return 0;
  };
  const mejor = [...inclusiones].sort((a, b) => peso(b) - peso(a))[0];
  if (!mejor || peso(mejor) === 0) return empresa;
  if (mejor.idPuesto != null) return texto(mejor.nombrePuesto) || empresa;
  if (mejor.idArea != null) return texto(mejor.nombreArea) || empresa;
  if (mejor.idSite != null) return texto(mejor.nombreSite) || empresa;
  if (mejor.estado?.trim()) return mejor.estado.trim();
  return texto(mejor.nombreUnidad) || empresa;
}

/**
 * Unión de las rutas del empleado. Un curso repetido se queda una vez:
 * gana el plazo más corto y, si empatan, la vigencia más corta.
 * La etapa siguiente queda bloqueada si pide la anterior y esa no está completa.
 */
export function armarMiRuta(
  cursos: CursoFuente[],
  hoy: string,
  ventanaDias: number,
): MiRuta {
  const vivos = cursos.filter((curso) => curso.estado !== 'cancelado');
  const rutas: MiRuta['rutas'] = [];
  const vistas = new Set<number>();
  for (const curso of vivos) {
    if (vistas.has(curso.idRuta)) continue;
    vistas.add(curso.idRuta);
    rutas.push({
      idRutaAprendizaje: curso.idRuta,
      nombre: curso.nombreRuta,
      origen: curso.origen,
    });
  }

  const elegidos = new Map<number, CursoFuente>();
  for (const curso of vivos) {
    const actual = elegidos.get(curso.idCurso);
    if (!actual || conviene(curso, actual)) elegidos.set(curso.idCurso, curso);
  }

  const grupos = new Map<
    string,
    { nombre: string; orden: number; requiere: boolean; cursos: CursoFuente[] }
  >();
  for (const curso of elegidos.values()) {
    const clave = `${curso.ordenEtapa}:${curso.etapa}`;
    const grupo = grupos.get(clave) ?? {
      nombre: curso.etapa,
      orden: curso.ordenEtapa,
      requiere: false,
      cursos: [],
    };
    grupo.requiere = grupo.requiere || curso.requiereEtapaAnterior;
    grupo.cursos.push(curso);
    grupos.set(clave, grupo);
  }

  const ordenados = [...grupos.values()].sort(
    (a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, 'es'),
  );
  let anteriorCompleta = true;
  const etapas: EtapaRuta[] = ordenados.map((grupo) => {
    const presentados = grupo.cursos
      .sort((a, b) => a.ordenCurso - b.ordenCurso || a.idCurso - b.idCurso)
      .map(presentar);
    const obligatorios = presentados.filter((curso) => curso.obligatorio);
    const base = obligatorios.length > 0 ? obligatorios : presentados;
    const completa =
      base.length === 0 || base.every((curso) => HECHO.has(curso.estado));
    let estado: EstadoEtapaRuta;
    if (grupo.requiere && !anteriorCompleta) estado = 'bloqueada';
    else if (completa) estado = 'completada';
    else estado = 'en_curso';
    anteriorCompleta = completa;
    return {
      nombre: grupo.nombre,
      orden: grupo.orden,
      estado,
      fechaLimite: limiteDe(presentados),
      cursos: presentados,
    };
  });

  const obligatorios = [...elegidos.values()].filter(
    (curso) => curso.obligatorio,
  );
  const avance = {
    completados: obligatorios.filter((curso) => HECHO.has(curso.estado)).length,
    total: obligatorios.length,
  };

  return {
    rutas,
    avance,
    etapas,
    porRenovar: porRenovarDe(vivos, hoy, ventanaDias),
  };
}

export function resumenMovil(ruta: MiRuta | null): ResumenMiRuta | null {
  if (!ruta || ruta.rutas.length === 0) return null;
  const indice = ruta.etapas.findIndex((etapa) => etapa.estado === 'en_curso');
  const actual =
    indice >= 0
      ? ruta.etapas[indice]
      : (ruta.etapas.find((etapa) => etapa.estado !== 'completada') ??
        ruta.etapas[ruta.etapas.length - 1]);
  const porRenovar = [...ruta.porRenovar].sort((a, b) => a.dias - b.dias)[0];
  return {
    etapaActual: actual ? ruta.etapas.indexOf(actual) + 1 : 0,
    totalEtapas: ruta.etapas.length,
    nombreEtapa: actual?.nombre ?? '',
    completados: ruta.avance.completados,
    total: ruta.avance.total,
    porProgramar: ruta.etapas.reduce(
      (suma, etapa) =>
        suma +
        etapa.cursos.filter((curso) => curso.estado === 'por_programar').length,
      0,
    ),
    fechaLimite: actual?.fechaLimite ?? null,
    porRenovar: porRenovar
      ? { curso: porRenovar.nombre, dias: porRenovar.dias }
      : null,
  };
}

export function miRutaVacia(): MiRuta {
  return {
    rutas: [],
    avance: { completados: 0, total: 0 },
    etapas: [],
    porRenovar: [],
  };
}

function conviene(candidata: CursoFuente, actual: CursoFuente): boolean {
  const rango = rank(candidata.estado) - rank(actual.estado);
  if (rango !== 0) return rango < 0;
  const limiteA = candidata.fechaLimite ?? '9999-12-31';
  const limiteB = actual.fechaLimite ?? '9999-12-31';
  if (limiteA !== limiteB) return limiteA < limiteB;
  const vigenciaA = candidata.vigenciaMeses ?? Number.POSITIVE_INFINITY;
  const vigenciaB = actual.vigenciaMeses ?? Number.POSITIVE_INFINITY;
  return vigenciaA < vigenciaB;
}

function rank(estado: CursoFuente['estado']): number {
  if (estado === 'inscrito' || estado === 'por_programar') return 0;
  if (estado === 'vencido') return 1;
  if (estado === 'completado' || estado === 'reconocido') return 2;
  return 3;
}

function presentar(fila: CursoFuente): CursoRuta {
  const estado = estadoVisible(fila);
  const progreso =
    estado === 'reconocido' || estado === 'completado'
      ? 100
      : Math.max(0, Math.min(100, Math.round(fila.progreso)));
  return {
    idCurso: fila.idCurso,
    idSesion: fila.idSesion,
    nombre: fila.nombre,
    modalidad: fila.modalidad,
    obligatorio: fila.obligatorio,
    estado,
    progreso,
    fechaLimite: fila.fechaLimite,
    sesionProgramada: estado === 'agendado' ? fila.sesionProgramada : null,
  };
}

function estadoVisible(fila: CursoFuente): EstadoCursoRuta {
  if (fila.estado === 'reconocido') return 'reconocido';
  if (fila.estado === 'completado') return 'completado';
  if (fila.estado === 'vencido') return 'vencido';
  const enVivo =
    fila.modalidad === 'presencial' || fila.modalidad === 'online_sincrono';
  if (enVivo) {
    return fila.sesionProgramada ? 'agendado' : 'por_programar';
  }
  if (fila.progreso > 0) return 'en_curso';
  return 'pendiente';
}

function limiteDe(cursos: CursoRuta[]): string | null {
  const abiertos = cursos.filter(
    (curso) =>
      curso.obligatorio && !HECHO.has(curso.estado) && curso.fechaLimite,
  );
  const fuente = abiertos.length > 0 ? abiertos : cursos;
  const fechas = fuente
    .map((curso) => curso.fechaLimite)
    .filter((fecha): fecha is string => !!fecha)
    .sort();
  if (fechas.length === 0) return null;
  return abiertos.length > 0 ? fechas[0] : fechas[fechas.length - 1];
}

function porRenovarDe(
  cursos: CursoFuente[],
  hoy: string,
  ventanaDias: number,
): PorRenovar[] {
  const porCurso = new Map<number, PorRenovar>();
  for (const curso of cursos) {
    if (curso.estado !== 'completado' && curso.estado !== 'reconocido')
      continue;
    if (!curso.venceEn || curso.vigenciaMeses == null) continue;
    const dias = diasHasta(hoy, curso.venceEn);
    if (dias < 0 || dias > ventanaDias) continue;
    const actual = porCurso.get(curso.idCurso);
    if (actual && actual.dias <= dias) continue;
    porCurso.set(curso.idCurso, {
      idCurso: curso.idCurso,
      idSesion: curso.idSesion,
      nombre: curso.nombre,
      venceEn: curso.venceEn,
      dias,
      vigenciaMeses: curso.vigenciaMeses,
    });
  }
  return [...porCurso.values()].sort(
    (a, b) => a.dias - b.dias || a.idCurso - b.idCurso,
  );
}

function texto(valor: string | null | undefined): string {
  return valor?.trim() ?? '';
}
