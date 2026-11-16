import { Canal } from '../channels/canales';
import { DestinoNotificacion } from '../notification-center/destino';

export interface CandidatoEnvio {
    idEmpleado: number;
    idEmpresa: number;
    idTenant: number;
    userUuid: string | null;
    codigo: string;
    referencia: string;
    intento: number;
    titulo: string;
    mensaje: string;
    deepLink: string;
    deepLinkApp: string;
    destino: DestinoNotificacion;
    canales: Canal[];
    telefono: string | null;
    correo: string | null;
    zona: string;
    fechaLocal: string;
    idDestinatario?: number;
    inmediato: boolean;
}

export interface GrupoTope {
    idEmpleado: number;
    clave: string;
    mensaje: string;
    total: number;
    items: CandidatoEnvio[];
}

export interface PlanTope {
    individuales: CandidatoEnvio[];
    grupos: GrupoTope[];
}

export function aplicarPlantilla(plantilla: string, variables: Record<string, string>): string {
    return plantilla.replace(/\{([a-zA-Z0-9_]+)\}/g, (token, clave: string) => variables[clave.toLowerCase()] ?? token);
}

/**
 * Los primeros N del día salen uno por uno. El resto se junta en «Tienes N pendientes».
 * N cuenta también los que ya se habían agrupado hoy.
 */
export function planificarTope(candidatos: readonly CandidatoEnvio[], enviadosHoy: ReadonlyMap<number, number>, limite: number): PlanTope {
    const tope = Math.max(0, limite);
    const porPersona = new Map<number, CandidatoEnvio[]>();
    for (const candidato of candidatos) {
        const lista = porPersona.get(candidato.idEmpleado) ?? [];
        lista.push(candidato);
        porPersona.set(candidato.idEmpleado, lista);
    }
    const individuales: CandidatoEnvio[] = [];
    const grupos: GrupoTope[] = [];
    for (const [idEmpleado, items] of porPersona) {
        const usados = enviadosHoy.get(idEmpleado) ?? 0;
        const cupo = Math.max(0, tope - usados);
        individuales.push(...items.slice(0, cupo));
        const resto = items.slice(cupo);
        if (!resto.length) continue;
        const total = usados + items.length - tope;
        grupos.push({
            idEmpleado,
            clave: `recordatorios:${idEmpleado}:${resto[0].fechaLocal}`,
            mensaje: `Tienes ${total} pendientes`,
            total,
            items: resto,
        });
    }
    return { individuales, grupos };
}

/** R1 (falta la entrada) y R12 (antes de entrar) avisan por WhatsApp a quien checa en kiosco y no tiene la app. */
export function canalesDeRecordatorio(entrada: {
    codigo: string;
    canalesRegla: readonly Canal[];
    canalesEfectivos: readonly Canal[];
    tieneApp: boolean;
    kioscoActivo: boolean;
}): Canal[] {
    const efectivos = new Set(entrada.canalesEfectivos);
    const canales = entrada.canalesRegla.filter((canal) => efectivos.has(canal));
    const respaldo = (entrada.codigo === 'R1' || entrada.codigo === 'R12')
        && !entrada.tieneApp
        && entrada.kioscoActivo
        && efectivos.has('WHATSAPP')
        && !canales.includes('WHATSAPP');
    if (respaldo) canales.push('WHATSAPP');
    return canales;
}
