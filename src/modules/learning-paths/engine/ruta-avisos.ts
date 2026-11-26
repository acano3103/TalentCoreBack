import { diasHasta } from '../paths/mi-ruta';

export { diasHasta };

export interface FilaAviso {
  idEmpleado: number;
  idTenant: number | null;
  idCurso: number;
  estado: string;
}

export type AvisoMotor =
  | {
      tipo: 'cursos_nuevos';
      idEmpresa: number;
      idTenant: number | null;
      idEmpleado: number;
      disparador: string;
      cursos: number;
    }
  | { tipo: 'por_aprobar'; idEmpresa: number; idTenant: number | null }
  | { tipo: 'por_programar'; idEmpresa: number; idTenant: number | null };

/**
 * Un aviso por persona y disparador. Con aprobación no se avisa al empleado:
 * el lote queda para RH. Los presenciales suman el aviso de por programar.
 */
export function avisosDeAsignacion(entrada: {
  idEmpresa: number;
  idTenant: number | null;
  disparador: string;
  modo: 'automatica' | 'con_aprobacion';
  filas: FilaAviso[];
}): AvisoMotor[] {
  if (entrada.filas.length === 0) return [];
  if (entrada.modo === 'con_aprobacion') {
    return [
      {
        tipo: 'por_aprobar',
        idEmpresa: entrada.idEmpresa,
        idTenant: entrada.idTenant,
      },
    ];
  }
  const porPersona = new Map<
    number,
    { cursos: Set<number>; porProgramar: boolean; idTenant: number | null }
  >();
  for (const fila of entrada.filas) {
    if (fila.estado !== 'inscrito' && fila.estado !== 'por_programar') continue;
    const actual = porPersona.get(fila.idEmpleado) ?? {
      cursos: new Set<number>(),
      porProgramar: false,
      idTenant: fila.idTenant,
    };
    actual.cursos.add(fila.idCurso);
    if (fila.estado === 'por_programar') actual.porProgramar = true;
    porPersona.set(fila.idEmpleado, actual);
  }
  const avisos: AvisoMotor[] = [];
  for (const [idEmpleado, info] of porPersona) {
    if (info.cursos.size === 0) continue;
    avisos.push({
      tipo: 'cursos_nuevos',
      idEmpresa: entrada.idEmpresa,
      idTenant: info.idTenant ?? entrada.idTenant,
      idEmpleado,
      disparador: entrada.disparador,
      cursos: info.cursos.size,
    });
  }
  if ([...porPersona.values()].some((info) => info.porProgramar)) {
    avisos.push({
      tipo: 'por_programar',
      idEmpresa: entrada.idEmpresa,
      idTenant: entrada.idTenant,
    });
  }
  return avisos;
}

/**
 * El umbral que cubre los días que faltan. [30, 7] avisa una vez en 8–30
 * y otra en 1–7. Cero o negativo ya no entra.
 */
export function umbralAviso(dias: number, umbrales: number[]): number | null {
  const orden = [
    ...new Set(
      umbrales.filter((umbral) => Number.isInteger(umbral) && umbral > 0),
    ),
  ].sort((a, b) => b - a);
  for (let indice = 0; indice < orden.length; indice += 1) {
    const techo = orden[indice];
    const piso = orden[indice + 1] ?? 0;
    if (dias <= techo && dias > piso) return techo;
  }
  return null;
}

export function textoVence(dias: number): string {
  return `Tu curso vence en ${dias} ${dias === 1 ? 'día' : 'días'}`;
}
