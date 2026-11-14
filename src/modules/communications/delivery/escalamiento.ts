export type CanalEscalado = 'WHATSAPP' | 'CORREO';

export interface RelojEscalamiento {
    importante: number;
    critica: number;
    correo: number;
}

/** El siguiente canal que todavía no se usó. WhatsApp va antes que el correo. */
export function siguienteCanal(usados: readonly string[], disponibles: readonly CanalEscalado[]): CanalEscalado | null {
    const ya = new Set(usados);
    if (!ya.has('WHATSAPP') && disponibles.includes('WHATSAPP')) return 'WHATSAPP';
    if (!ya.has('CORREO') && !ya.has('EMAIL') && disponibles.includes('CORREO')) return 'CORREO';
    return null;
}

export function minutosDeEscalamiento(
    prioridad: string,
    canal: CanalEscalado,
    escalamiento: unknown,
    reloj: RelojEscalamiento,
): number | null {
    if (prioridad !== 'IMPORTANTE' && prioridad !== 'CRITICA') return null;
    const propio = leerMinutos(escalamiento, canal, prioridad);
    if (propio != null) return propio;
    if (canal === 'CORREO') return reloj.correo;
    return prioridad === 'CRITICA' ? reloj.critica : reloj.importante;
}

export function canalesEscalados(valor: unknown): string[] {
    if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return [];
    const canales = (valor as { canales?: unknown }).canales;
    if (!Array.isArray(canales)) return [];
    return canales.filter((canal): canal is string => typeof canal === 'string');
}

function leerMinutos(valor: unknown, canal: CanalEscalado, prioridad: string): number | null {
    if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return null;
    const obj = valor as Record<string, unknown>;
    const claves =
        canal === 'CORREO'
            ? ['correoMin', 'correoMinutos']
            : prioridad === 'CRITICA'
              ? ['criticaMin', 'minutos']
              : ['importanteMin', 'minutos'];
    for (const clave of claves) {
        const numero = obj[clave];
        if (typeof numero === 'number' && Number.isFinite(numero) && numero >= 0) return numero;
    }
    return null;
}
