import { AsyncLocalStorage } from 'node:async_hooks';
import { resolverUmbralAprobatorio } from '../career-plan/career-plan.avance';

export const RUTAS_MODO_ASIGNACION = ['automatica', 'con_aprobacion'] as const;
export const RUTAS_APROBADOR = ['rh', 'jefe', 'ambos'] as const;
export const RUTAS_PLAZO_PRIMERA_PUBLICACION = [
  'publicacion',
  'ingreso',
] as const;
export const CARRERA_NOMINAN = ['rh', 'jefe'] as const;

export const ENTERO_CAPACITACION_MAX = 3650;

export const CLAVE_CALIFICACION_APROBATORIA = 'calificacion_aprobatoria';
export const CLAVE_RUTAS_MODO_ASIGNACION = 'rutas_modo_asignacion';
export const CLAVE_RUTAS_APROBADOR = 'rutas_aprobador';
export const CLAVE_VIGENCIA_VENTANA_DIAS = 'vigencia_ventana_dias';
export const CLAVE_VIGENCIA_AVISOS_DIAS = 'vigencia_avisos_dias';
export const CLAVE_RUTAS_PLAZO_PRIMERA_PUBLICACION =
  'rutas_plazo_primera_publicacion';
export const CLAVE_DC3_AUTO_GENERAR = 'dc3_auto_generar';
export const CLAVE_DC3_AVISO_DIAS_HABILES = 'dc3_aviso_dias_habiles';
export const CLAVE_DC3_AGENTE_CAPACITADOR = 'dc3_agente_capacitador';
export const CLAVE_CARRERA_ANTIGUEDAD_DEFAULT_MESES =
  'carrera_antiguedad_default_meses';
export const CLAVE_CARRERA_DIAS_RENOVACION = 'carrera_dias_renovacion';
export const CLAVE_CARRERA_REQUIERE_PLAZA = 'carrera_requiere_plaza';
export const CLAVE_CARRERA_AUTOPOSTULACION = 'carrera_autopostulacion';
export const CLAVE_CARRERA_NOMINAN = 'carrera_nominan';

export const CLAVES_CAPACITACION = [
  CLAVE_CALIFICACION_APROBATORIA,
  CLAVE_RUTAS_MODO_ASIGNACION,
  CLAVE_RUTAS_APROBADOR,
  CLAVE_VIGENCIA_VENTANA_DIAS,
  CLAVE_VIGENCIA_AVISOS_DIAS,
  CLAVE_RUTAS_PLAZO_PRIMERA_PUBLICACION,
  CLAVE_DC3_AUTO_GENERAR,
  CLAVE_DC3_AVISO_DIAS_HABILES,
  CLAVE_DC3_AGENTE_CAPACITADOR,
  CLAVE_CARRERA_ANTIGUEDAD_DEFAULT_MESES,
  CLAVE_CARRERA_DIAS_RENOVACION,
  CLAVE_CARRERA_REQUIERE_PLAZA,
  CLAVE_CARRERA_AUTOPOSTULACION,
  CLAVE_CARRERA_NOMINAN,
] as const;

export type RutasModoAsignacion = (typeof RUTAS_MODO_ASIGNACION)[number];
export type RutasAprobador = (typeof RUTAS_APROBADOR)[number];
export type RutasPlazoPrimeraPublicacion =
  (typeof RUTAS_PLAZO_PRIMERA_PUBLICACION)[number];
export type CarreraNominador = (typeof CARRERA_NOMINAN)[number];

export interface TrainingConfig {
  calificacionAprobatoria: number;
  rutasModoAsignacion: RutasModoAsignacion;
  rutasAprobador: RutasAprobador;
  vigenciaVentanaDias: number;
  vigenciaAvisosDias: number[];
  rutasPlazoPrimeraPublicacion: RutasPlazoPrimeraPublicacion;
  dc3AutoGenerar: boolean;
  dc3AvisoDiasHabiles: number;
  dc3AgenteCapacitador: string;
  carreraAntiguedadDefaultMeses: number;
  carreraDiasRenovacion: number;
  carreraRequierePlaza: boolean;
  carreraAutopostulacion: boolean;
  carreraNominan: CarreraNominador[];
}

export interface TrainingConfigPatch {
  calificacionAprobatoria?: number | null;
  rutasModoAsignacion?: RutasModoAsignacion | null;
  rutasAprobador?: RutasAprobador | null;
  vigenciaVentanaDias?: number | null;
  vigenciaAvisosDias?: number[] | null;
  rutasPlazoPrimeraPublicacion?: RutasPlazoPrimeraPublicacion | null;
  dc3AutoGenerar?: boolean | null;
  dc3AvisoDiasHabiles?: number | null;
  dc3AgenteCapacitador?: string | null;
  carreraAntiguedadDefaultMeses?: number | null;
  carreraDiasRenovacion?: number | null;
  carreraRequierePlaza?: boolean | null;
  carreraAutopostulacion?: boolean | null;
  carreraNominan?: CarreraNominador[] | null;
}

export interface CambioConfiguracion {
  clave: string;
  valor: string;
}

type Avisador = { warn(message: string): void };

const cachePorRequest = new AsyncLocalStorage<
  Map<number, Promise<TrainingConfig>>
>();

export function trainingConfigPorDefecto(
  agenteCapacitador = '',
): TrainingConfig {
  return {
    calificacionAprobatoria: 70,
    rutasModoAsignacion: 'automatica',
    rutasAprobador: 'rh',
    vigenciaVentanaDias: 30,
    vigenciaAvisosDias: [30, 7],
    rutasPlazoPrimeraPublicacion: 'publicacion',
    dc3AutoGenerar: true,
    dc3AvisoDiasHabiles: 5,
    dc3AgenteCapacitador: agenteCapacitador,
    carreraAntiguedadDefaultMeses: 12,
    carreraDiasRenovacion: 30,
    carreraRequierePlaza: true,
    carreraAutopostulacion: false,
    carreraNominan: ['rh', 'jefe'],
  };
}

export function runTrainingConfigCache<T>(trabajo: () => T): T {
  if (cachePorRequest.getStore()) return trabajo();
  return cachePorRequest.run(new Map(), trabajo);
}

export function leerCacheTrainingConfig(
  idEmpresa: number,
): Promise<TrainingConfig> | undefined {
  return cachePorRequest.getStore()?.get(idEmpresa);
}

export function guardarCacheTrainingConfig(
  idEmpresa: number,
  carga: Promise<TrainingConfig>,
): void {
  cachePorRequest.getStore()?.set(idEmpresa, carga);
}

export function olvidarCacheTrainingConfig(idEmpresa: number): void {
  cachePorRequest.getStore()?.delete(idEmpresa);
}

function texto(valor: string | null | undefined): string | undefined {
  if (valor == null) return undefined;
  const limpio = valor.trim();
  return limpio === '' ? undefined : limpio;
}

function enumDe<T extends string>(
  valor: string | null | undefined,
  permitidos: readonly T[],
): T | undefined {
  const limpio = texto(valor);
  if (limpio == null) return undefined;
  return permitidos.find((item) => item === limpio);
}

function enteroDe(valor: string | null | undefined): number | undefined {
  const limpio = texto(valor);
  if (limpio == null) return undefined;
  const numero = Number(limpio);
  if (
    !Number.isInteger(numero) ||
    numero < 0 ||
    numero > ENTERO_CAPACITACION_MAX
  )
    return undefined;
  return numero;
}

function boolDe(valor: string | null | undefined): boolean | undefined {
  const limpio = texto(valor);
  if (limpio === 'true') return true;
  if (limpio === 'false') return false;
  return undefined;
}

function listaJson(valor: string | null | undefined): unknown[] | undefined {
  const limpio = texto(valor);
  if (limpio == null) return undefined;
  try {
    const parsed: unknown = JSON.parse(limpio);
    return Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function avisosDe(valor: string | null | undefined): number[] | undefined {
  const lista = listaJson(valor);
  if (!lista) return undefined;
  const avisos: number[] = [];
  for (const item of lista) {
    if (
      typeof item !== 'number' ||
      !Number.isInteger(item) ||
      item < 0 ||
      item > ENTERO_CAPACITACION_MAX
    ) {
      return undefined;
    }
    if (!avisos.includes(item)) avisos.push(item);
  }
  return avisos;
}

function nominanDe(
  valor: string | null | undefined,
): CarreraNominador[] | undefined {
  const lista = listaJson(valor);
  if (!lista) return undefined;
  const nominan: CarreraNominador[] = [];
  for (const item of lista) {
    if (
      typeof item !== 'string' ||
      !CARRERA_NOMINAN.includes(item as CarreraNominador)
    )
      return undefined;
    const nominador = item as CarreraNominador;
    if (!nominan.includes(nominador)) nominan.push(nominador);
  }
  return nominan;
}

export function interpretarTrainingConfig(
  valores: ReadonlyMap<string, string | null>,
  razonSocial: string,
  idEmpresa: number,
  logger: Avisador,
): TrainingConfig {
  const config = trainingConfigPorDefecto(razonSocial.trim());
  const agente = texto(valores.get(CLAVE_DC3_AGENTE_CAPACITADOR));
  if (agente != null) config.dc3AgenteCapacitador = agente;

  const modo = enumDe(
    valores.get(CLAVE_RUTAS_MODO_ASIGNACION),
    RUTAS_MODO_ASIGNACION,
  );
  if (modo) config.rutasModoAsignacion = modo;
  const aprobador = enumDe(valores.get(CLAVE_RUTAS_APROBADOR), RUTAS_APROBADOR);
  if (aprobador) config.rutasAprobador = aprobador;
  const plazo = enumDe(
    valores.get(CLAVE_RUTAS_PLAZO_PRIMERA_PUBLICACION),
    RUTAS_PLAZO_PRIMERA_PUBLICACION,
  );
  if (plazo) config.rutasPlazoPrimeraPublicacion = plazo;

  const ventana = enteroDe(valores.get(CLAVE_VIGENCIA_VENTANA_DIAS));
  if (ventana != null) config.vigenciaVentanaDias = ventana;
  const avisoDc3 = enteroDe(valores.get(CLAVE_DC3_AVISO_DIAS_HABILES));
  if (avisoDc3 != null) config.dc3AvisoDiasHabiles = avisoDc3;
  const antiguedad = enteroDe(
    valores.get(CLAVE_CARRERA_ANTIGUEDAD_DEFAULT_MESES),
  );
  if (antiguedad != null) config.carreraAntiguedadDefaultMeses = antiguedad;
  const renovacion = enteroDe(valores.get(CLAVE_CARRERA_DIAS_RENOVACION));
  if (renovacion != null) config.carreraDiasRenovacion = renovacion;

  const auto = boolDe(valores.get(CLAVE_DC3_AUTO_GENERAR));
  if (auto != null) config.dc3AutoGenerar = auto;
  const plaza = boolDe(valores.get(CLAVE_CARRERA_REQUIERE_PLAZA));
  if (plaza != null) config.carreraRequierePlaza = plaza;
  const autopostulacion = boolDe(valores.get(CLAVE_CARRERA_AUTOPOSTULACION));
  if (autopostulacion != null) config.carreraAutopostulacion = autopostulacion;

  const avisos = avisosDe(valores.get(CLAVE_VIGENCIA_AVISOS_DIAS));
  if (avisos != null) config.vigenciaAvisosDias = avisos;
  const nominan = nominanDe(valores.get(CLAVE_CARRERA_NOMINAN));
  if (nominan != null) config.carreraNominan = nominan;

  if (valores.has(CLAVE_CALIFICACION_APROBATORIA)) {
    config.calificacionAprobatoria = resolverUmbralAprobatorio(
      valores.get(CLAVE_CALIFICACION_APROBATORIA),
      idEmpresa,
      logger,
    );
  }
  return config;
}

function definido<T>(valor: T | null | undefined): valor is T {
  return valor !== undefined && valor !== null;
}

export function cambiosTrainingConfig(
  patch: TrainingConfigPatch,
): CambioConfiguracion[] {
  const cambios: CambioConfiguracion[] = [];
  const agregar = (clave: string, valor: string) =>
    cambios.push({ clave, valor });

  if (definido(patch.calificacionAprobatoria)) {
    agregar(
      CLAVE_CALIFICACION_APROBATORIA,
      String(patch.calificacionAprobatoria),
    );
  }
  if (definido(patch.rutasModoAsignacion))
    agregar(CLAVE_RUTAS_MODO_ASIGNACION, patch.rutasModoAsignacion);
  if (definido(patch.rutasAprobador))
    agregar(CLAVE_RUTAS_APROBADOR, patch.rutasAprobador);
  if (definido(patch.vigenciaVentanaDias))
    agregar(CLAVE_VIGENCIA_VENTANA_DIAS, String(patch.vigenciaVentanaDias));
  if (definido(patch.vigenciaAvisosDias)) {
    agregar(
      CLAVE_VIGENCIA_AVISOS_DIAS,
      JSON.stringify(patch.vigenciaAvisosDias),
    );
  }
  if (definido(patch.rutasPlazoPrimeraPublicacion)) {
    agregar(
      CLAVE_RUTAS_PLAZO_PRIMERA_PUBLICACION,
      patch.rutasPlazoPrimeraPublicacion,
    );
  }
  if (definido(patch.dc3AutoGenerar))
    agregar(CLAVE_DC3_AUTO_GENERAR, patch.dc3AutoGenerar ? 'true' : 'false');
  if (definido(patch.dc3AvisoDiasHabiles))
    agregar(CLAVE_DC3_AVISO_DIAS_HABILES, String(patch.dc3AvisoDiasHabiles));
  if (definido(patch.dc3AgenteCapacitador))
    agregar(CLAVE_DC3_AGENTE_CAPACITADOR, patch.dc3AgenteCapacitador);
  if (definido(patch.carreraAntiguedadDefaultMeses)) {
    agregar(
      CLAVE_CARRERA_ANTIGUEDAD_DEFAULT_MESES,
      String(patch.carreraAntiguedadDefaultMeses),
    );
  }
  if (definido(patch.carreraDiasRenovacion))
    agregar(CLAVE_CARRERA_DIAS_RENOVACION, String(patch.carreraDiasRenovacion));
  if (definido(patch.carreraRequierePlaza)) {
    agregar(
      CLAVE_CARRERA_REQUIERE_PLAZA,
      patch.carreraRequierePlaza ? 'true' : 'false',
    );
  }
  if (definido(patch.carreraAutopostulacion)) {
    agregar(
      CLAVE_CARRERA_AUTOPOSTULACION,
      patch.carreraAutopostulacion ? 'true' : 'false',
    );
  }
  if (definido(patch.carreraNominan))
    agregar(CLAVE_CARRERA_NOMINAN, JSON.stringify(patch.carreraNominan));
  return cambios;
}
