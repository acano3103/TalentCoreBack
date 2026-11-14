/** Orden estable. WEB llega al empleado; el resumen del preview no la cuenta aparte. */
export const CANALES = ['APP', 'WEB', 'WHATSAPP', 'CORREO', 'KIOSCO'] as const;

export type Canal = (typeof CANALES)[number];

export const CANALES_DEFAULT: Canal[] = ['APP', 'WEB'];

/** Lo escribe el login móvil cuando la app no manda un navegador. */
export const MARCA_LOGIN_MOVIL = 'Mobile Device';

export const POLITICA_WHATSAPP_DEFAULT = 'IMPORTANTE_CRITICA';

const SIN_WHATSAPP = new Set(['NUNCA', 'DESACTIVADO', 'OFF', 'NINGUNO']);

export interface PerfilCanal {
    idEmpresa: number;
    nivel: 'EMPLEADO' | 'UBICACION' | 'TIPO_PERSONAL';
    idReferencia: number;
    canales: Canal[];
}

export interface EmpleadoCanal {
    idEmpleado: number;
    idEmpresa: number | null;
    idSite: number | null;
    idTipoPersonal: number | null;
    telefonoMovil: string | null;
    correo: string | null;
    usuarioWebActivo: boolean;
    pushActivo: boolean;
    loginMovil: boolean;
    kioscoActivo: boolean;
}

export interface CanalDeEmpleado {
    idEmpleado: number;
    canales: Canal[];
    sinCanal: boolean;
    nivelPerfil: 'EMPLEADO' | 'UBICACION' | 'TIPO_PERSONAL' | 'DEFAULT';
}

export interface ResumenCanales {
    APP: number;
    WHATSAPP: number;
    CORREO: number;
    KIOSCO: number;
    SIN_CANAL: number;
}

export function esCanal(valor: string): valor is Canal {
    return (CANALES as readonly string[]).includes(valor);
}

export function normalizarCanales(valor: unknown): Canal[] {
    const lista = Array.isArray(valor) ? valor : [];
    const canales = lista.filter((item): item is Canal => typeof item === 'string' && esCanal(item));
    return CANALES.filter((canal) => canales.includes(canal));
}

/**
 * EMPLEADO gana a UBICACION, y UBICACION a TIPO_PERSONAL.
 * Sin perfil se usan APP y WEB. Después se quita lo que la persona no puede recibir.
 * IMPORTANTE_CRITICA deja WhatsApp disponible: el envío decide según la prioridad.
 * NUNCA, DESACTIVADO, OFF y NINGUNO lo quitan aquí.
 */
export function canalEfectivo(
    empleado: EmpleadoCanal,
    perfiles: readonly PerfilCanal[],
    politicaWhatsApp: string,
    companyId: number,
): CanalDeEmpleado {
    const perfil = perfilAplicable(empleado, perfiles, companyId);
    const canales = perfil.canales.filter((canal) => disponible(canal, empleado, politicaWhatsApp));
    return {
        idEmpleado: empleado.idEmpleado,
        canales,
        sinCanal: canales.length === 0,
        nivelPerfil: perfil.nivel,
    };
}

export function resumirCanales(filas: readonly CanalDeEmpleado[]): ResumenCanales {
    const resumen: ResumenCanales = { APP: 0, WHATSAPP: 0, CORREO: 0, KIOSCO: 0, SIN_CANAL: 0 };
    for (const fila of filas) {
        if (fila.sinCanal) resumen.SIN_CANAL += 1;
        if (fila.canales.includes('APP')) resumen.APP += 1;
        if (fila.canales.includes('WHATSAPP')) resumen.WHATSAPP += 1;
        if (fila.canales.includes('CORREO')) resumen.CORREO += 1;
        if (fila.canales.includes('KIOSCO')) resumen.KIOSCO += 1;
    }
    return resumen;
}

export function politicaPermiteWhatsapp(politica: string | null | undefined): boolean {
    const valor = (politica ?? POLITICA_WHATSAPP_DEFAULT).trim().toUpperCase();
    return !SIN_WHATSAPP.has(valor);
}

function perfilAplicable(
    empleado: EmpleadoCanal,
    perfiles: readonly PerfilCanal[],
    companyId: number,
): { nivel: CanalDeEmpleado['nivelPerfil']; canales: Canal[] } {
    const empresa = empleado.idEmpresa ?? companyId;
    const deEmpresa = perfiles.filter((perfil) => perfil.idEmpresa === empresa);
    const empleadoPerfil = deEmpresa.find((perfil) => perfil.nivel === 'EMPLEADO' && perfil.idReferencia === empleado.idEmpleado);
    if (empleadoPerfil) return { nivel: 'EMPLEADO', canales: empleadoPerfil.canales };
    const ubicacion = deEmpresa.find(
        (perfil) => perfil.nivel === 'UBICACION' && empleado.idSite != null && perfil.idReferencia === empleado.idSite,
    );
    if (ubicacion) return { nivel: 'UBICACION', canales: ubicacion.canales };
    const tipo = deEmpresa.find(
        (perfil) =>
            perfil.nivel === 'TIPO_PERSONAL' &&
            empleado.idTipoPersonal != null &&
            perfil.idReferencia === empleado.idTipoPersonal,
    );
    if (tipo) return { nivel: 'TIPO_PERSONAL', canales: tipo.canales };
    return { nivel: 'DEFAULT', canales: CANALES_DEFAULT };
}

function disponible(canal: Canal, empleado: EmpleadoCanal, politica: string): boolean {
    switch (canal) {
        case 'APP':
            return empleado.pushActivo || empleado.loginMovil;
        case 'WEB':
            return empleado.usuarioWebActivo;
        case 'WHATSAPP':
            return politicaPermiteWhatsapp(politica) && texto(empleado.telefonoMovil);
        case 'CORREO':
            return texto(empleado.correo);
        case 'KIOSCO':
            return empleado.kioscoActivo;
        default:
            return false;
    }
}

function texto(valor: string | null): boolean {
    return typeof valor === 'string' && valor.trim().length > 0;
}
