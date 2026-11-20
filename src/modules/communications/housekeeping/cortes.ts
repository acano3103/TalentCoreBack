import { HechoEmpleado, TipoHechoEmpleado } from 'src/common/events/comms-hechos';
import { ContextoAlcance } from '../capabilities/alcance';
import { CriteriosAudiencia } from '../audiences/criterios';

export const DIAS_NOTIFICACIONES = 90;
export const DIAS_ENTREGAS = 365;
export const LOTE_PURGA = 500;
export const MOTIVO_BAJA_PUSH = 'BAJA_EMPLEADO';

/** Quien no confirmó. CONFIRMADO se conserva como evidencia. */
export const ESTADOS_ABIERTOS = ['PENDIENTE', 'ENTREGADO', 'LEIDO', 'FALLIDO', 'SIN_CANAL'] as const;

const TIPOS: readonly TipoHechoEmpleado[] = ['ALTA', 'MOVIMIENTO', 'BAJA'];

export function restarDias(desde: Date, dias: number): Date {
    return new Date(desde.getTime() - dias * 86_400_000);
}

export function hechoEmpleadoValido(hecho: Partial<HechoEmpleado> | null | undefined): hecho is HechoEmpleado {
    if (!hecho || !TIPOS.includes(hecho.tipo as TipoHechoEmpleado)) return false;
    return entero(hecho.idTenant) && entero(hecho.idEmpresa) && entero(hecho.idEmpleado);
}

/**
 * Los criterios guardados mandan. Si no nombran empresas, el comunicado
 * sigue acotado a la empresa que lo envió.
 */
export function alcanceParaIncluirNuevos(
    idTenant: number,
    idEmpresa: number,
    criterios: CriteriosAudiencia,
): ContextoAlcance {
    const empresas = criterios.empresas?.length ? [...criterios.empresas] : [idEmpresa];
    return {
        idTenant,
        companyId: idEmpresa,
        idEmpleado: null,
        alcance: 'EMPRESAS',
        referencias: empresas,
        sitesUsuario: [],
        unidadPorSite: new Map(),
    };
}

function entero(valor: unknown): valor is number {
    return typeof valor === 'number' && Number.isInteger(valor) && valor > 0;
}
