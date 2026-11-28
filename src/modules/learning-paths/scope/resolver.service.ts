import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

export type ModoAlcance = 'incluir' | 'excluir';

/** Datos del colaborador que usa el resolvedor. El site es el principal. */
export interface EmpleadoAlcance {
  idEmpresa: number;
  idPuesto: number | null;
  idArea: number | null;
  idSite: number | null;
  idUnidadOperativa: number | null;
  estado: string | null;
}

/** Una regla con todos los campos nulos significa «toda la empresa». */
export interface ReglaAlcance {
  modo: ModoAlcance;
  idUnidadOperativa?: number | null;
  estado?: string | null;
  idSite?: number | null;
  idPuesto?: number | null;
  idArea?: number | null;
}

export interface ReglaVisible extends ReglaAlcance {
  nombreUnidad?: string | null;
  nombreSite?: string | null;
  nombrePuesto?: string | null;
  nombreArea?: string | null;
}

export interface CursoDeVersion {
  idCurso: number;
  diaInicio: number;
  diaFin: number;
  obligatorio: boolean;
  vigenciaMeses: number | null;
  idRutaAprendizaje: number;
  idVersion: number;
}

export interface VersionAlcanzada {
  idEmpresa: number;
  idRutaAprendizaje: number;
  idVersion: number;
  numero: number;
  alcance: ReglaAlcance[];
  cursos: CursoDeVersion[];
}

const CAMPOS = [
  'idUnidadOperativa',
  'estado',
  'idSite',
  'idPuesto',
  'idArea',
] as const;

type CampoAlcance = (typeof CAMPOS)[number];

function texto(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpio = valor.trim();
  return limpio === '' ? null : limpio;
}

function valorRegla(
  regla: ReglaAlcance,
  campo: CampoAlcance,
): number | string | null {
  if (campo === 'estado') return texto(regla.estado);
  const valor = regla[campo];
  return typeof valor === 'number' ? valor : null;
}

/** Una regla coincide si todos sus campos no nulos coinciden con el empleado. */
export function reglaCoincide(
  empleado: EmpleadoAlcance,
  regla: ReglaAlcance,
): boolean {
  for (const campo of CAMPOS) {
    const esperado = valorRegla(regla, campo);
    if (esperado == null) continue;
    if (campo === 'estado') {
      const actual = texto(empleado.estado);
      if (
        actual?.toLocaleLowerCase('es') !==
        String(esperado).toLocaleLowerCase('es')
      )
        return false;
      continue;
    }
    if (empleado[campo] !== esperado) return false;
  }
  return true;
}

/**
 * El empleado entra si al menos una regla `incluir` coincide
 * y ninguna regla `excluir` coincide.
 */
export function coincide(
  empleado: EmpleadoAlcance,
  alcance: ReglaAlcance[],
): boolean {
  const incluir = alcance.filter((regla) => regla.modo === 'incluir');
  if (!incluir.some((regla) => reglaCoincide(empleado, regla))) return false;
  return !alcance.some(
    (regla) => regla.modo === 'excluir' && reglaCoincide(empleado, regla),
  );
}

export function rutasDeEmpleado(
  empleado: EmpleadoAlcance,
  versiones: VersionAlcanzada[],
): VersionAlcanzada[] {
  return versiones.filter(
    (version) =>
      version.idEmpresa === empleado.idEmpresa &&
      coincide(empleado, version.alcance),
  );
}

function vigenciaMasCorta(
  actual: number | null,
  candidata: number | null,
): number | null {
  if (actual == null) return candidata;
  if (candidata == null) return actual;
  return Math.min(actual, candidata);
}

/** Unión de las versiones, sin cursos repetidos. Gana el plazo más corto y la vigencia más corta. */
export function rutaEfectivaDe(
  versiones: VersionAlcanzada[],
): CursoDeVersion[] {
  const porCurso = new Map<number, CursoDeVersion>();
  for (const version of versiones) {
    for (const curso of version.cursos) {
      const previo = porCurso.get(curso.idCurso);
      if (!previo) {
        porCurso.set(curso.idCurso, { ...curso });
        continue;
      }
      const ganaPlazo = curso.diaFin < previo.diaFin ? curso : previo;
      porCurso.set(curso.idCurso, {
        ...ganaPlazo,
        diaInicio: Math.min(previo.diaInicio, curso.diaInicio),
        diaFin: Math.min(previo.diaFin, curso.diaFin),
        vigenciaMeses: vigenciaMasCorta(
          previo.vigenciaMeses,
          curso.vigenciaMeses,
        ),
        obligatorio: previo.obligatorio || curso.obligatorio,
      });
    }
  }
  return [...porCurso.values()];
}

function esVacia(regla: ReglaAlcance): boolean {
  return CAMPOS.every((campo) => valorRegla(regla, campo) == null);
}

function etiqueta(regla: ReglaVisible): string {
  if (esVacia(regla)) return 'Toda la empresa';
  const partes: string[] = [];
  if (regla.idUnidadOperativa != null)
    partes.push(`Unidad: ${regla.nombreUnidad || regla.idUnidadOperativa}`);
  if (texto(regla.estado)) partes.push(`Estado: ${texto(regla.estado)}`);
  if (regla.idSite != null)
    partes.push(`Site: ${regla.nombreSite || regla.idSite}`);
  if (regla.idPuesto != null)
    partes.push(`Puesto: ${regla.nombrePuesto || regla.idPuesto}`);
  else if (regla.idSite != null) partes.push('Todos los puestos');
  if (regla.idArea != null)
    partes.push(`Área: ${regla.nombreArea || regla.idArea}`);
  return partes.join(' · ');
}

/** Texto corto para la fila del listado. */
export function resumenAlcance(reglas: ReglaVisible[]): string {
  const incluir = reglas.filter((regla) => regla.modo === 'incluir');
  if (incluir.length === 0) return 'Sin alcance';
  const visibles = incluir.slice(0, 2).map(etiqueta);
  let texto = visibles.join(' · ');
  if (incluir.length > 2) texto += ` · +${incluir.length - 2}`;
  const exclusiones = reglas
    .filter((regla) => regla.modo === 'excluir')
    .map(etiqueta);
  if (exclusiones.length > 0) texto += ` · excluye ${exclusiones.join(', ')}`;
  return texto;
}

/** La ruta aplica al filtro del listado si alguna inclusión lo toca y ninguna exclusión lo cubre entero. */
export function alcanceToca(
  reglas: ReglaAlcance[],
  filtro: { idSite?: number | null; idPuesto?: number | null },
): boolean {
  if (filtro.idSite == null && filtro.idPuesto == null) return true;
  const hayInclusion = reglas.some(
    (regla) => regla.modo === 'incluir' && compatibleConFiltro(regla, filtro),
  );
  if (!hayInclusion) return false;
  return !reglas.some(
    (regla) => regla.modo === 'excluir' && excluyeElFiltro(regla, filtro),
  );
}

function compatibleConFiltro(
  regla: ReglaAlcance,
  filtro: { idSite?: number | null; idPuesto?: number | null },
): boolean {
  if (
    filtro.idSite != null &&
    regla.idSite != null &&
    regla.idSite !== filtro.idSite
  )
    return false;
  if (
    filtro.idPuesto != null &&
    regla.idPuesto != null &&
    regla.idPuesto !== filtro.idPuesto
  )
    return false;
  return true;
}

function excluyeElFiltro(
  regla: ReglaAlcance,
  filtro: { idSite?: number | null; idPuesto?: number | null },
): boolean {
  for (const campo of CAMPOS) {
    const valor = valorRegla(regla, campo);
    if (valor == null) continue;
    const pedido = filtro[campo as 'idSite' | 'idPuesto'];
    if (pedido == null || pedido !== valor) return false;
  }
  return true;
}

@Injectable()
export class ScopeResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async rutasDe(idEmpleado: number): Promise<VersionAlcanzada[]> {
    const empleado = await this.empleado(idEmpleado);
    const versiones = await this.versionesPublicadas(empleado.idEmpresa);
    return rutasDeEmpleado(empleado, versiones);
  }

  async rutaEfectiva(idEmpleado: number): Promise<CursoDeVersion[]> {
    return rutaEfectivaDe(await this.rutasDe(idEmpleado));
  }

  private async empleado(idEmpleado: number): Promise<EmpleadoAlcance> {
    const fila = await this.prisma.empleados.findUnique({
      where: { idEmpleado },
      select: {
        idEmpresa: true,
        idPuesto: true,
        idSite: true,
        CatPuestos: { select: { idArea: true } },
      },
    });
    if (!fila?.idEmpresa) throw new NotFoundException('El empleado no existe.');

    const principal = await this.prisma.relEmpleadosSites.findFirst({
      where: { idEmpleado, EsPrincipal: true, Activo: true },
      orderBy: { FechaAsignacion: 'desc' },
      select: { idSite: true },
    });
    const idSite = principal?.idSite ?? fila.idSite ?? null;
    const site = idSite
      ? await this.prisma.catSites.findUnique({
          where: { idSite },
          select: { idUnidadOperativa: true, Estado: true },
        })
      : null;

    return {
      idEmpresa: fila.idEmpresa,
      idPuesto: fila.idPuesto,
      idArea: fila.CatPuestos?.idArea ?? null,
      idSite,
      idUnidadOperativa: site?.idUnidadOperativa ?? null,
      estado: site?.Estado ?? null,
    };
  }

  private async versionesPublicadas(
    idEmpresa: number,
  ): Promise<VersionAlcanzada[]> {
    const versiones = await this.prisma.rutaVersion.findMany({
      where: {
        estado: 'publicada',
        RutaAprendizaje: { idEmpresa, activo: true },
      },
      include: {
        RutaAlcances: true,
        RutaEtapas: { include: { RutaElementos: true } },
      },
    });

    return versiones.map((version) => ({
      idEmpresa,
      idRutaAprendizaje: version.idRutaAprendizaje,
      idVersion: version.idVersion,
      numero: version.numero,
      alcance: version.RutaAlcances.map((regla) => ({
        modo: regla.modo,
        idUnidadOperativa: regla.idUnidadOperativa,
        estado: regla.estado,
        idSite: regla.idSite,
        idPuesto: regla.idPuesto,
        idArea: regla.idArea,
      })),
      cursos: version.RutaEtapas.flatMap((etapa) =>
        etapa.RutaElementos.map((elemento) => ({
          idCurso: elemento.idCurso,
          diaInicio: etapa.diaInicio,
          diaFin: etapa.diaFin,
          obligatorio: elemento.obligatorio,
          vigenciaMeses: elemento.vigenciaMeses,
          idRutaAprendizaje: version.idRutaAprendizaje,
          idVersion: version.idVersion,
        })),
      ),
    }));
  }
}
