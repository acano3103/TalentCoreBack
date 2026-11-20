/**
 * Plantilla sugerida para un tenant que todavía no asignó capacidades.
 * Sigue el menú que ya siembra tenant-blueprints:
 * Admin configura permisos; RH publica, audiencias, recordatorios y canales.
 * Manager, Finanzas, Reclutador y Empleado no reciben fila: el aviso al equipo
 * directo lo agrega ComConfigEmpresa.JefesAvisoEquipo, sin un rol de comunicación.
 * El alcance es TENANT porque la plantilla no conoce las empresas del tenant.
 */
export const ROLES_PLANTILLA = ['Admin', 'RH'] as const;

export const CAPACIDADES_ADMIN = [
    'COM_CREAR',
    'COM_AVISO_OPERATIVO',
    'COM_CRITICO',
    'COM_VER_ANALITICA',
    'AUD_GESTIONAR',
    'CFG_RECORDATORIOS',
    'CFG_CANALES',
    'CFG_PERMISOS',
] as const;

export const CAPACIDADES_RH = [
    'COM_CREAR',
    'COM_AVISO_OPERATIVO',
    'COM_CRITICO',
    'COM_VER_ANALITICA',
    'AUD_GESTIONAR',
    'CFG_RECORDATORIOS',
    'CFG_CANALES',
] as const;

export interface AsignacionPlantilla {
    rol: (typeof ROLES_PLANTILLA)[number];
    codigo: string;
}

export function asignacionesPlantilla(): AsignacionPlantilla[] {
    return [
        ...CAPACIDADES_ADMIN.map((codigo) => ({ rol: 'Admin' as const, codigo })),
        ...CAPACIDADES_RH.map((codigo) => ({ rol: 'RH' as const, codigo })),
    ];
}
