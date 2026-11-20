import { Canal } from '../channels/canales';
import { decisionSilencio, SilencioEmpresa, Turno } from './silencio';

export type CodigoProveedor = 'PUSH' | 'EMAIL' | 'WHATSAPP' | 'SOCKETS' | 'KIOSCO';

export interface CanalPlaneado {
    codigo: CodigoProveedor;
    enviarAhora: boolean;
    en: Date;
}

const INMEDIATOS = new Set<Canal>(['WEB', 'KIOSCO']);

/**
 * APP empuja al teléfono y también deja el aviso en la app al momento.
 * WEB sale por socket al momento. El kiosco no se envía: queda pendiente para que lo consulte.
 */
export function planearCanales(entrada: {
    canales: readonly Canal[];
    prioridad: string;
    ahora: Date;
    zonaHoraria: string;
    turnos: readonly Turno[];
    silencio: SilencioEmpresa | null;
}): CanalPlaneado[] {
    const planes: CanalPlaneado[] = [];
    for (const canal of entrada.canales) {
        const codigo = aProveedor(canal);
        if (!codigo) continue;
        if (canal === 'KIOSCO') {
            planes.push({ codigo, enviarAhora: false, en: entrada.ahora });
            continue;
        }
        const decision = decisionSilencio({
            ahora: entrada.ahora,
            zonaHoraria: entrada.zonaHoraria,
            turnos: entrada.turnos,
            prioridad: entrada.prioridad,
            canalInmediato: INMEDIATOS.has(canal),
            silencio: entrada.silencio,
        });
        planes.push({ codigo, enviarAhora: decision.inmediato, en: decision.en });
    }
    if (entrada.canales.includes('APP')) {
        planes.unshift({ codigo: 'SOCKETS', enviarAhora: true, en: entrada.ahora });
    }
    return dedupe(planes);
}

function aProveedor(canal: Canal): CodigoProveedor | null {
    switch (canal) {
        case 'APP':
            return 'PUSH';
        case 'WEB':
            return 'SOCKETS';
        case 'WHATSAPP':
            return 'WHATSAPP';
        case 'CORREO':
            return 'EMAIL';
        case 'KIOSCO':
            return 'KIOSCO';
        default:
            return null;
    }
}

function dedupe(planes: CanalPlaneado[]): CanalPlaneado[] {
    const vistos = new Set<string>();
    const unicos: CanalPlaneado[] = [];
    for (const plan of planes) {
        if (vistos.has(plan.codigo)) continue;
        vistos.add(plan.codigo);
        unicos.push(plan);
    }
    return unicos;
}
