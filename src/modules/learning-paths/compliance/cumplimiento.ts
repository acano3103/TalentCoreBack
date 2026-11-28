import { contar, sumar } from 'src/common/utils/dias-habiles';
import { diasEntreFechas } from 'src/modules/communications/reminders/zona-reloj';
import { sumarDias } from '../engine/impacto';
import { alcanceToca, ReglaAlcance } from '../scope/resolver.service';

export const DIAS_DC3 = 20;
export const DIAS_DC4 = 60;
export const AVISO_DC4 = 15;
export const MAX_RUTAS_PUESTO = 6;
export const MAX_VENCIMIENTOS = 10;

const ABIERTOS = new Set(['inscrito', 'por_programar']);
const CERRADOS = new Set(['completado', 'reconocido', 'vencido']);

export function limiteDc3(termino: string): string {
  return sumar(termino, DIAS_DC3);
}

export function limiteDc4(cierre: string): string {
  return sumar(cierre, DIAS_DC4);
}

export function cierreEtapa(anio: number): string {
  return `${anio}-12-31`;
}

export function semanaDe(dia: string): { inicio: string; fin: string } {
  const [anio, mes, numero] = dia.split('-').map(Number);
  const dow = new Date(Date.UTC(anio, mes - 1, numero)).getUTCDay();
  const hastaLunes = dow === 0 ? 6 : dow - 1;
  const inicio = sumarDias(dia, -hastaLunes);
  return { inicio, fin: sumarDias(inicio, 6) };
}

export function dentroDeSemana(dia: string, hoy: string): boolean {
  const semana = semanaDe(hoy);
  return dia >= semana.inicio && dia <= semana.fin;
}

/** Aviso una sola vez al entrar en la ventana, o si el cron no corrió el día exacto. */
export function entraEnAviso(
  hoy: string,
  limite: string,
  umbral: number,
): boolean {
  if (umbral <= 0) return false;
  const restantes = contar(hoy, limite);
  return restantes > 0 && restantes <= umbral;
}

export interface DatosDc3 {
  nombre: string | null;
  curp: string | null;
  puesto: string | null;
  rfc: string | null;
  registroPatronal: string | null;
  curso: string | null;
  duracionHoras: number | null;
  periodoInicio: string | null;
  periodoFin: string | null;
  areaTematica: string | null;
  agenteCapacitador: string | null;
}

const CAMPOS_DC3: { clave: keyof DatosDc3; etiqueta: string }[] = [
  { clave: 'curp', etiqueta: 'CURP' },
  { clave: 'puesto', etiqueta: 'Puesto' },
  { clave: 'rfc', etiqueta: 'RFC' },
  { clave: 'registroPatronal', etiqueta: 'Registro patronal' },
  { clave: 'curso', etiqueta: 'Nombre del curso' },
  { clave: 'duracionHoras', etiqueta: 'Duración en horas' },
  { clave: 'periodoInicio', etiqueta: 'Periodo del curso' },
  { clave: 'periodoFin', etiqueta: 'Periodo del curso' },
  { clave: 'areaTematica', etiqueta: 'Área temática' },
  { clave: 'agenteCapacitador', etiqueta: 'Agente capacitador' },
];

export function camposFaltantes(datos: DatosDc3): string[] {
  const faltan = new Set<string>();
  for (const campo of CAMPOS_DC3) {
    const valor = datos[campo.clave];
    const vacio =
      valor == null || (typeof valor === 'string' && valor.trim() === '');
    if (vacio) faltan.add(campo.etiqueta);
  }
  return [...faltan];
}

export interface FilaCumplimiento {
  idEmpleado: number;
  idRuta: number;
  idCurso: number;
  idSite: number | null;
  obligatorio: boolean;
  estado: string;
  fechaLimite: string;
  vence: string | null;
}

export interface CursoResuelto {
  idEmpleado: number;
  idRuta: number;
  idCurso: number;
  idSite: number | null;
  obligatorio: boolean;
  cumplido: boolean;
  vencido: boolean;
  porVencer: boolean;
}

/** Una fila abierta sustituye a la acreditación anterior del mismo curso. */
export function resolverCursos(
  filas: FilaCumplimiento[],
  hoy: string,
  ventanaDias: number,
): CursoResuelto[] {
  const grupos = new Map<string, FilaCumplimiento[]>();
  for (const fila of filas) {
    if (fila.estado === 'cancelado') continue;
    const clave = `${fila.idEmpleado}:${fila.idRuta}:${fila.idCurso}`;
    const lista = grupos.get(clave) ?? [];
    lista.push(fila);
    grupos.set(clave, lista);
  }
  const hasta = sumarDias(hoy, Math.max(ventanaDias, 0));
  const salida: CursoResuelto[] = [];
  for (const lista of grupos.values()) {
    const abierto = lista.find((fila) => ABIERTOS.has(fila.estado));
    const muestra = abierto ?? lista[0];
    const obligatorio = lista.some((fila) => fila.obligatorio);
    if (abierto) {
      salida.push({
        idEmpleado: muestra.idEmpleado,
        idRuta: muestra.idRuta,
        idCurso: muestra.idCurso,
        idSite: muestra.idSite,
        obligatorio,
        cumplido: false,
        vencido: abierto.fechaLimite < hoy,
        porVencer: abierto.fechaLimite >= hoy && abierto.fechaLimite <= hasta,
      });
      continue;
    }
    const cerrado = lista.find((fila) => CERRADOS.has(fila.estado));
    if (!cerrado) continue;
    const acreditado =
      cerrado.estado === 'completado' || cerrado.estado === 'reconocido';
    const vigente =
      acreditado && (cerrado.vence == null || cerrado.vence >= hoy);
    const vencePronto =
      vigente &&
      cerrado.vence != null &&
      cerrado.vence >= hoy &&
      cerrado.vence <= hasta;
    salida.push({
      idEmpleado: cerrado.idEmpleado,
      idRuta: cerrado.idRuta,
      idCurso: cerrado.idCurso,
      idSite: cerrado.idSite,
      obligatorio,
      cumplido: vigente,
      vencido: !vigente,
      porVencer: vencePronto,
    });
  }
  return salida;
}

export function porcentaje(completados: number, asignados: number): number {
  if (asignados <= 0) return 0;
  return Math.round((completados / asignados) * 100);
}

export function celda(
  aplica: boolean,
  completados: number,
  asignados: number,
): number | null {
  if (!aplica) return null;
  return porcentaje(completados, asignados);
}

export function rutaAplicaAlSite(
  reglas: ReglaAlcance[],
  idSite: number,
): boolean {
  return alcanceToca(reglas, { idSite });
}

export interface RutaColumna {
  idRuta: number;
  nombre: string;
  proposito: string;
  asignados: number;
}

const ORDEN_PROPOSITO: Record<string, number> = {
  ingreso: 0,
  cumplimiento: 1,
  puesto: 2,
};

/** Cumplimiento e ingreso van siempre. De puesto, las de más asignados, hasta 6. */
export function elegirColumnas(rutas: RutaColumna[]): RutaColumna[] {
  const base = rutas.filter(
    (ruta) => ruta.proposito === 'ingreso' || ruta.proposito === 'cumplimiento',
  );
  const puesto = rutas
    .filter((ruta) => ruta.proposito === 'puesto')
    .sort(
      (a, b) =>
        b.asignados - a.asignados || a.nombre.localeCompare(b.nombre, 'es'),
    )
    .slice(0, MAX_RUTAS_PUESTO);
  return [...base, ...puesto].sort(
    (a, b) =>
      (ORDEN_PROPOSITO[a.proposito] ?? 9) -
        (ORDEN_PROPOSITO[b.proposito] ?? 9) ||
      b.asignados - a.asignados ||
      a.nombre.localeCompare(b.nombre, 'es'),
  );
}

export type EstadoVencimiento = 'vencido_reasignado' | 'vence' | 'por_aprobar';

export function clasificarVencimiento(entrada: {
  vence: string;
  hoy: string;
  hayReasignacion: boolean;
  hayPorAprobar: boolean;
}): { estado: EstadoVencimiento; dias: number } {
  const dias = diasEntreFechas(entrada.hoy, entrada.vence);
  if (entrada.hayPorAprobar) return { estado: 'por_aprobar', dias };
  if (dias < 0 && entrada.hayReasignacion) {
    return { estado: 'vencido_reasignado', dias };
  }
  return { estado: 'vence', dias };
}

export function etiquetaVencimiento(
  estado: EstadoVencimiento,
  dias: number,
): string {
  if (estado === 'por_aprobar') return 'En Por aprobar';
  if (estado === 'vencido_reasignado') return 'Vencido, ya reasignado';
  if (dias < 0) return `Venció hace ${-dias} días`;
  if (dias === 0) return 'Vence hoy';
  return `Vence en ${dias} días`;
}

export interface VencimientoPersona {
  idCurso: number;
  curso: string;
  idSite: number | null;
  site: string;
  idEmpleado: number;
  vence: string;
  estado: EstadoVencimiento;
  dias: number;
}

export interface VencimientoGrupo {
  idCurso: number;
  curso: string;
  idSite: number | null;
  site: string;
  personas: number;
  vence: string;
  estado: EstadoVencimiento;
  dias: number;
  etiqueta: string;
}

const PRIORIDAD: Record<EstadoVencimiento, number> = {
  por_aprobar: 0,
  vencido_reasignado: 1,
  vence: 2,
};

export function agruparVencimientos(
  personas: VencimientoPersona[],
  hoy: string,
): VencimientoGrupo[] {
  const desde = sumarDias(hoy, -30);
  const grupos = new Map<string, VencimientoPersona[]>();
  for (const persona of personas) {
    if (persona.vence < desde) continue;
    const clave = `${persona.idCurso}:${persona.idSite ?? 0}`;
    const lista = grupos.get(clave) ?? [];
    lista.push(persona);
    grupos.set(clave, lista);
  }
  const salida: VencimientoGrupo[] = [];
  for (const lista of grupos.values()) {
    const primero = [...lista].sort((a, b) =>
      a.vence.localeCompare(b.vence),
    )[0];
    const estado = [...lista].sort(
      (a, b) => PRIORIDAD[a.estado] - PRIORIDAD[b.estado],
    )[0].estado;
    const empleados = new Set(lista.map((fila) => fila.idEmpleado));
    salida.push({
      idCurso: primero.idCurso,
      curso: primero.curso,
      idSite: primero.idSite,
      site: primero.site,
      personas: empleados.size,
      vence: primero.vence,
      estado,
      dias: primero.dias,
      etiqueta: etiquetaVencimiento(estado, primero.dias),
    });
  }
  salida.sort(
    (a, b) =>
      a.vence.localeCompare(b.vence) || a.curso.localeCompare(b.curso, 'es'),
  );
  return salida.slice(0, MAX_VENCIMIENTOS);
}

export function horasDe(valor: unknown): number | null {
  if (valor == null) return null;
  const numero =
    typeof valor === 'object' &&
    valor !== null &&
    'toNumber' in valor &&
    typeof (valor as { toNumber: () => number }).toNumber === 'function'
      ? (valor as { toNumber: () => number }).toNumber()
      : Number(valor);
  if (!Number.isFinite(numero) || numero <= 0) return null;
  return numero;
}

export function textoDc3(valor: string | null | undefined): string | null {
  if (typeof valor !== 'string') return null;
  const limpio = valor.trim();
  return limpio === '' ? null : limpio;
}
